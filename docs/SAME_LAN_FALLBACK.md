# Same-LAN fallback

The Mobile controller first uses the Server only to locate the Windows host. The host includes a short candidate list of private receiver URLs. Android probes those URLs natively because browser/WebView WebRTC host candidates can be hidden or unusable even on the same Wi-Fi.

A reachable candidate causes a transparent navigation to the existing direct receiver page. The original one-time PIN is passed to the page and Windows still shows the attended Allow/Decline prompt.

No arbitrary URLs are accepted: only `http://<private IPv4>:45911/remote` is allowed.
