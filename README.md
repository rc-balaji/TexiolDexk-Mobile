# TexiolDexk-Mobile v2.1.4

Android controller-only application for Texiol's Dexk Windows.

## Included

- Android 9+ (`minSdk 28`).
- Permanent `DEXK-` Internet Device ID connection.
- Explicit `LAN-` local ID and direct IPv4 connection.
- QR scanning for Windows pairing links.
- Automatic same-LAN native probe and direct receiver fallback after Internet-ID signalling.
- Direct WebRTC over the Texiol signalling service when a candidate pair is reachable.
- Free **Showcase Relay** fallback over authenticated WSS when LAN and WebRTC both fail.
- Chunked DXF2 screen-frame reassembly, early-frame buffering and first-frame diagnostics.
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

## Showcase Relay limitation

The fallback is designed for a private free demo: reduced visual quality and approximately 2 FPS. The approved session's screen/control messages transit the Cloudflare Worker over TLS/WSS and are not stored in monitor history. Do not use this prototype relay for confidential production work. A public product should use TURN or dedicated relay infrastructure plus application-level end-to-end encryption and abuse controls.

## v2.1.4 connection behavior

The controller tries same-LAN first, then direct WebRTC. If ICE remains checking, the data channel times out, or the candidate pair fails, it automatically requests Showcase Relay instead of closing the session. The UI reports `Connected · Showcase Relay` so the demo transport is visible.
