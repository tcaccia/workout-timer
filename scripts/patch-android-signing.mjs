import { readFile, writeFile } from "node:fs/promises";

const buildFile = "android/app/build.gradle";
let source = await readFile(buildFile, "utf8");

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

await writeFile(buildFile, source);
