# Changelog

## 2.1.3

- Starts signalling event delivery only after the controller handler is installed.
- Adds explicit response-received, offer-delivery and offer-to-answer diagnostics.
- Handles duplicate accepted responses safely using a single-flight peer start.
- Retains v2.1.2 chunked frame transport and automatic ICE restart.

## 2.1.2

- Added chunked DXF2 JPEG frame reassembly for Android WebView instead of requiring one oversized RTCDataChannel message.
- Buffers an early first frame until the remote viewer installs its render callback, removing the authentication/frame race.
- Reports first-frame receive, render, assembly-drop and decode diagnostics to the protected monitor.
- Keeps received FPS separate from host capture FPS and displays a useful first-frame timeout message.
- Added automatic ICE restart after a connected P2P path drops and frame-transport regression tests.

## 2.1.1

- Fixed WebRTC signalling correlation so optional `requestId` values are omitted instead of serialized as `null`.
- Added immediate controller handling for signalling validation errors instead of waiting for a control-channel timeout.
- Added protocol version 4 capability signalling while retaining v2.1.0 wire compatibility.
- Retained automatic same-LAN probing, direct-LAN fallback and one ICE restart.

## 2.1.0

- Automatic native same-LAN probe and direct-LAN fallback for Internet Device IDs.
- Full ICE server configuration and one ICE restart before failure.
- Immediate target-offline, cancellation and cleanup handling.
- Privacy-safe diagnostics for the protected Server monitor.
- Android resource and artifact naming fixes retained.

## 2.0.2

- Split into an independent controller-only mobile repository.
- Added permanent Internet Device IDs and Ed25519 device enrollment.
- Added Cloudflare WebSocket signalling and WebRTC P2P control.
- Retained LAN IDs, direct addresses, QR pairing, saved devices, Guide Pointer, touchpad, touchscreen, keyboard, and clipboard.
- Removed all Android-host and phone-screen-sharing scope.
- TURN relay remains out of scope for this release.
