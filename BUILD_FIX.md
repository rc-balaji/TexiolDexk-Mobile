# Android build notes

- Controller-only application; no Android host components.
- Google Code Scanner provides QR scanning without a custom camera activity.
- Ed25519 identity uses `net.i2p.crypto:eddsa:0.3.0` and the private seed is wrapped by an Android Keystore AES-GCM key.
- GitHub Actions builds a debug APK by default and release APK/AAB only when signing secrets exist.
- WebRTC runs inside the Android WebView; use an updated Android System WebView/Chrome package during testing.
