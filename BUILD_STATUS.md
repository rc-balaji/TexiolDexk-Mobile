# Build status — TexiolDexk-Mobile v2.1.0

Preparation checks:

- Java source parser reached Android/dependency resolution without syntax errors.
- EdDSA 0.3.0 key generator class usage corrected.
- Android XML resources parsed successfully.
- JavaScript controller/WebRTC syntax checks passed.
- GitHub workflow YAML parsed successfully.
- Package name: `com.texiol.dexk`.
- Minimum Android version: Android 9 / API 28.

A full Android SDK build is configured in GitHub Actions and must be run after upload. Physical testing is still required for QR scanning, WebView WebRTC, gestures, keyboard, clipboard, and background/network transitions.
