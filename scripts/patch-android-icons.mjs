import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const resDir = join("android", "app", "src", "main", "res");
const manifestFile = join("android", "app", "src", "main", "AndroidManifest.xml");

const launcherVector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp"
    android:height="48dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
    <path
        android:fillColor="#141414"
        android:pathData="M0,0h512v512h-512z" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#33322F"
        android:strokeWidth="42"
        android:pathData="M256,124 C171,124 102,193 102,278 C102,363 171,432 256,432 C341,432 410,363 410,278 C410,193 341,124 256,124" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#48D597"
        android:strokeLineCap="round"
        android:strokeWidth="42"
        android:pathData="M256,124 C315,124 367,158 391,352" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#F5F2EA"
        android:strokeLineCap="round"
        android:strokeWidth="38"
        android:pathData="M186,76h140" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#F5F2EA"
        android:strokeLineCap="round"
        android:strokeWidth="32"
        android:pathData="M256,278V174" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#55A7FF"
        android:strokeLineCap="round"
        android:strokeWidth="32"
        android:pathData="M256,278h84" />
</vector>
`;

const foregroundVector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#33322F"
        android:strokeWidth="42"
        android:pathData="M256,124 C171,124 102,193 102,278 C102,363 171,432 256,432 C341,432 410,363 410,278 C410,193 341,124 256,124" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#48D597"
        android:strokeLineCap="round"
        android:strokeWidth="42"
        android:pathData="M256,124 C315,124 367,158 391,352" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#F5F2EA"
        android:strokeLineCap="round"
        android:strokeWidth="38"
        android:pathData="M186,76h140" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#F5F2EA"
        android:strokeLineCap="round"
        android:strokeWidth="32"
        android:pathData="M256,278V174" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#55A7FF"
        android:strokeLineCap="round"
        android:strokeWidth="32"
        android:pathData="M256,278h84" />
</vector>
`;

const adaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;

const colors = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#141414</color>
</resources>
`;

async function writeResource(relativePath, content) {
  const filePath = join(resDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

let manifest = await readFile(manifestFile, "utf8");
if (!manifest.includes("android.permission.VIBRATE")) {
  manifest = manifest.replace(
    /<manifest([^>]*)>/,
    `<manifest$1>
    <uses-permission android:name="android.permission.VIBRATE" />`,
  );
  await writeFile(manifestFile, manifest);
}

await writeResource(join("values", "colors.xml"), colors);
await writeResource(join("drawable", "ic_launcher_foreground.xml"), foregroundVector);
await writeResource(join("mipmap-anydpi-v26", "ic_launcher.xml"), adaptiveIcon);
await writeResource(join("mipmap-anydpi-v26", "ic_launcher_round.xml"), adaptiveIcon);

for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
  await writeResource(join(`mipmap-${density}`, "ic_launcher.xml"), launcherVector);
  await writeResource(join(`mipmap-${density}`, "ic_launcher_round.xml"), launcherVector);
}
