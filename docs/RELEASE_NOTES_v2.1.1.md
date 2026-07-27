# TexiolDexk Mobile v2.1.1

This release fixes the Internet-ID WebRTC signalling failure visible as `Control channel timeout` with `remote` ICE candidate counts remaining at zero.

## Fixes

- Optional correlation IDs are omitted from signalling messages instead of being inherited by every offer, answer, ICE and diagnostic message.
- Server-side validation errors are shown immediately to the controller instead of being hidden until a control-channel timeout.
- The initial `session.request` still includes a bounded UUID request ID for deterministic offline/delivery correlation.
- Protocol capability version 4 is advertised while the API remains v2.
- Same-LAN native probing and direct-LAN fallback remain enabled.

## Validation

- Controller JavaScript syntax passed.
- Signalling wire regression validation passed.
- Same-LAN fallback simulation passed.
- All Android XML resources parsed successfully.
- GitHub Actions builds the debug APK and optional signed release APK/AAB using Android SDK 36.
