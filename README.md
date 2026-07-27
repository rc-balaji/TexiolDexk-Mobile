# TexiolDexk-Mobile v2.0.2

Android controller-only application for Texiol's Dexk Windows.

## Included

- Android 9+ (`minSdk 28`).
- Permanent `DEXK-` Internet Device ID connection.
- Explicit `LAN-` local ID and direct IPv4 connection.
- QR scanning for Windows pairing links.
- WebRTC direct P2P over the deployed Texiol signalling server.
- Touchpad, direct touch, Guide Pointer, exclusive Control, keyboard, clipboard, zoom, and saved devices.
- Android Keystore-wrapped Ed25519 device identity.
- No Android hosting, phone screen sharing, Accessibility Service, unattended access, or QR generator.

Server:

```text
https://texiol-dexk-server.rcbalaji2003.workers.dev
```

## GitHub build

Push the repository and run **Build TexiolDexk Mobile** under Actions.

Outputs:

- debug APK for testing
- signed release APK/AAB when Android signing secrets are configured

Required release secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Internet mode is P2P-only in v2.0.2. Networks that block direct ICE connectivity require a future TURN fallback.
