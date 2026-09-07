# Play Store Checklist

## App Readiness

- Confirm the final app name and package id: `com.tcaccia.workouttimer`.
- Test the APK on at least one real Android phone.
- Confirm timer audio is audible with media volume enabled.
- Confirm saved workouts persist after closing and reopening the app.
- Confirm old APK updates keep the same signing key.

## Store Listing

- Prepare a short description.
- Prepare a full description.
- Prepare phone screenshots.
- Prepare a 512 x 512 app icon.
- Prepare a feature graphic if Google Play Console requests one.

## Privacy And Policy

- Publish the privacy policy from `PRIVACY.md` at a public URL.
- Complete the Data safety form as an offline app with no data collection.
- Complete the content rating questionnaire.
- Declare that the app does not include ads while no advertising SDK is present.

## Release

- Use the `.aab` file from the GitHub Release for Play Store upload.
- Use the `.apk` file only for direct install and Obtainium.
- Increment the release tag for every production upload.
