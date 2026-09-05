# Workout Timer

A simple workout interval timer for mobile use.

The app lets you configure:

- number of rounds
- work duration
- rest duration between rounds
- sound cues for start, stop/rest, and workout completion

The first default sequence is 10 rounds, 40 seconds of work, and 20 seconds of rest.

## Run Locally

Start a local static server from this folder:

```powershell
python -m http.server 5173
```

Then open:

```text
http://localhost:5173/index.html?v=3
```

## Android Distribution

This project is currently a Progressive Web App. To distribute it through Obtainium, package it as an Android APK and publish the APK in a GitHub Release.

This repository includes a GitHub Actions workflow that builds a signed Android APK whenever a tag such as `v1.0.0` is pushed.

### 1. Create an Android Signing Key

Create a private Android signing key on your computer:

```bash
keytool -genkeypair \
  -v \
  -keystore workout-timer-release.keystore \
  -alias workout-timer \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Keep this file private. Android updates require every APK to be signed with the same key.

### 2. Add GitHub Secrets

Convert the keystore to Base64:

```bash
base64 -w 0 workout-timer-release.keystore
```

In GitHub, open:

```text
Settings > Secrets and variables > Actions > New repository secret
```

Create these secrets:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Use `workout-timer` as `ANDROID_KEY_ALIAS` if you used the command above.

### 3. Publish a Release

Commit and push the workflow files:

```bash
git add .
git commit -m "Add Android release workflow"
git push
```

Create and push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions will build the APK and publish a GitHub Release with a file named:

```text
workout-timer-v1.0.0.apk
```

### 4. Install with Obtainium

On your Android phone:

1. Open Obtainium.
2. Tap `Add App`.
3. Enter the repository URL:

```text
https://github.com/tcaccia/workout-timer
```

4. Select `GitHub` as the source.
5. If an APK filter is needed, use:

```text
.*\.apk
```

6. Save the app and install it.

For future updates, change the app, commit, push, then create a new tag such as `v1.0.1`. Obtainium will detect the new GitHub Release.
