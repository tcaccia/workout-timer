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

Recommended path:

1. Wrap the web app with Capacitor.
2. Build and sign the Android APK.
3. Upload the APK to a GitHub Release.
4. Add the GitHub repository URL in Obtainium.

Keep the same Android package ID and signing key for every release so Android can install updates over the previous version.
