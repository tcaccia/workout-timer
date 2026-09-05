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

source = source.replace(
  /release\s*\{([\s\S]*?)\n\s*\}/,
  (match) => {
    if (match.includes("signingConfig signingConfigs.release")) return match;
    return match.replace(
      /release\s*\{/,
      `release {
            signingConfig signingConfigs.release`,
    );
  },
);

await writeFile(buildFile, source);
