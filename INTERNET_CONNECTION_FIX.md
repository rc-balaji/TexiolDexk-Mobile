# Internet connection fix — v2.1.4

The Android controller now follows LAN → direct WebRTC → Showcase Relay. A direct P2P timeout no longer ends the approved request immediately. The fallback reuses authenticated signalling, sends control RPC as JSON and reassembles capped DXF2 frame chunks. The session bar clearly identifies Showcase Relay.

The original Android resource fix, native LAN probe, visible host approval and one-time PIN requirements remain included.
