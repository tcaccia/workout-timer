import { readFile, writeFile } from "node:fs/promises";

const buildFile = "android/app/build.gradle";
let source = await readFile(buildFile, "utf8");
const versionCode = process.env.APP_VERSION_CODE;
const versionName = process.env.APP_VERSION_NAME;

if (!source.includes("signingConfigs {")) {
  source = source.replace(
    /android\s*\{/,
    `android {
    signingConfigs {
        release {
            storeFile file("release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }`,
  );
}

const buildTypesRelease = /(buildTypes\s*\{[\s\S]*?release\s*\{)([\s\S]*?)(\n\s*\})/;
const match = source.match(buildTypesRelease);

if (!match) {
  throw new Error("Could not find the Android release build type.");
}

if (!match[2].includes("signingConfig signingConfigs.release")) {
  source = source.replace(
    buildTypesRelease,
    `$1
            signingConfig signingConfigs.release$2$3`,
  );
}

if (versionCode && !/^\d+$/.test(versionCode)) {
  throw new Error("APP_VERSION_CODE must be a positive integer.");
}

if (versionCode) {
  if (source.includes("versionCode ")) {
    source = source.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  } else {
    source = source.replace(
      /(defaultConfig\s*\{)/,
      `$1
        versionCode ${versionCode}`,
    );
  }
}

if (versionName) {
  const escapedVersionName = versionName.replace(/^v/, "");
  if (source.includes("versionName ")) {
    source = source.replace(/versionName\s+["'][^"']+["']/, `versionName "${escapedVersionName}"`);
  } else {
    source = source.replace(
      /(defaultConfig\s*\{)/,
      `$1
        versionName "${escapedVersionName}"`,
    );
  }
}

await writeFile(buildFile, source);
