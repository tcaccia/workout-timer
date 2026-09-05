import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const resDir = join("android", "app", "src", "main", "res");
const manifestFile = join("android", "app", "src", "main", "AndroidManifest.xml");
const colorsFile = join(resDir, "values", "colors.xml");

const adaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_workout_launcher_foreground" />
</adaptive-icon>
`;

async function readTextIfExists(filePath, fallback) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeResource(relativePath, content) {
  const filePath = join(resDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

async function resourceExists(resourceName) {
  const valuesDir = join(resDir, "values");
  try {
    const files = await readdir(valuesDir);
    const xmlFiles = files.filter((file) => file.endsWith(".xml"));
    const contents = await Promise.all(
      xmlFiles.map((file) => readFile(join(valuesDir, file), "utf8")),
    );
    return contents.some((content) => content.includes(`name="${resourceName}"`));
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    rgba.copy(rows, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function color(hex, alpha = 255) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    alpha,
  ];
}

function blendPixel(buffer, width, x, y, rgba, coverage = 1) {
  if (x < 0 || y < 0 || x >= width || y >= width || coverage <= 0) return;
  const i = (y * width + x) * 4;
  const alpha = (rgba[3] / 255) * coverage;
  const inverse = 1 - alpha;
  buffer[i] = Math.round(rgba[0] * alpha + buffer[i] * inverse);
  buffer[i + 1] = Math.round(rgba[1] * alpha + buffer[i + 1] * inverse);
  buffer[i + 2] = Math.round(rgba[2] * alpha + buffer[i + 2] * inverse);
  buffer[i + 3] = Math.round(255 * alpha + buffer[i + 3] * inverse);
}

function drawCircleStroke(buffer, width, cx, cy, radius, strokeWidth, rgba, start = 0, end = Math.PI * 2) {
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distance = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      const inArc = start <= end ? angle >= start && angle <= end : angle >= start || angle <= end;
      const coverage = Math.max(0, 1 - Math.abs(distance - radius) / (strokeWidth / 2));
      if (inArc && coverage > 0) blendPixel(buffer, width, x, y, rgba, Math.min(1, coverage));
    }
  }
}

function drawLine(buffer, width, x1, y1, x2, y2, strokeWidth, rgba) {
  const minX = Math.floor(Math.min(x1, x2) - strokeWidth);
  const maxX = Math.ceil(Math.max(x1, x2) + strokeWidth);
  const minY = Math.floor(Math.min(y1, y2) - strokeWidth);
  const maxY = Math.ceil(Math.max(y1, y2) + strokeWidth);
  const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x1) * (x2 - x1) + (y + 0.5 - y1) * (y2 - y1)) / lengthSquared));
      const px = x1 + t * (x2 - x1);
      const py = y1 + t * (y2 - y1);
      const coverage = Math.max(0, 1 - Math.hypot(x + 0.5 - px, y + 0.5 - py) / (strokeWidth / 2));
      blendPixel(buffer, width, x, y, rgba, Math.min(1, coverage));
    }
  }
}

function renderIcon(size, transparentBackground = false) {
  const scale = size / 512;
  const buffer = Buffer.alloc(size * size * 4);

  if (!transparentBackground) {
    const bg = color("#141414");
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = bg[0];
      buffer[i + 1] = bg[1];
      buffer[i + 2] = bg[2];
      buffer[i + 3] = 255;
    }
  }

  drawCircleStroke(buffer, size, 256 * scale, 278 * scale, 154 * scale, 42 * scale, color("#33322F"));
  drawCircleStroke(buffer, size, 256 * scale, 278 * scale, 154 * scale, 42 * scale, color("#48D597"), 4.7, 0.5);
  drawLine(buffer, size, 186 * scale, 76 * scale, 326 * scale, 76 * scale, 38 * scale, color("#F5F2EA"));
  drawLine(buffer, size, 256 * scale, 278 * scale, 256 * scale, 174 * scale, 32 * scale, color("#F5F2EA"));
  drawLine(buffer, size, 256 * scale, 278 * scale, 340 * scale, 278 * scale, 32 * scale, color("#55A7FF"));

  return encodePng(size, size, buffer);
}

if (!(await resourceExists("ic_launcher_background"))) {
  let colors = await readTextIfExists(
    colorsFile,
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
</resources>
`,
  );
  colors = colors.replace(
    /<\/resources>/,
    `    <color name="ic_launcher_background">#141414</color>
</resources>`,
  );
  await writeResource(join("values", "colors.xml"), colors);
}

let manifest = await readTextIfExists(manifestFile, "");
if (!manifest.includes("android.permission.VIBRATE")) {
  manifest = manifest.replace(
    /<manifest([^>]*)>/,
    `<manifest$1>
    <uses-permission android:name="android.permission.VIBRATE" />`,
  );
  await writeFile(manifestFile, manifest);
}

await writeResource(join("drawable", "ic_workout_launcher_foreground.png"), renderIcon(432, true));
await writeResource(join("mipmap-anydpi-v26", "ic_launcher.xml"), adaptiveIcon);
await writeResource(join("mipmap-anydpi-v26", "ic_launcher_round.xml"), adaptiveIcon);

for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const png = renderIcon(size);
  await writeResource(join(`mipmap-${density}`, "ic_launcher.png"), png);
  await writeResource(join(`mipmap-${density}`, "ic_launcher_round.png"), png);
}
