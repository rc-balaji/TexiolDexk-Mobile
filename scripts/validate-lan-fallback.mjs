import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const target = '784793497347';
let replaced = '';
class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 2);
  }
  send(raw) {
    const message = JSON.parse(raw);
    if (message.type !== 'session.request') return;
    setTimeout(() => this.onmessage?.({ data: JSON.stringify({
      type: 'session.response',
      sessionId: message.sessionId,
      requestId: message.requestId,
      payload: {
        allowed: true,
        lanCandidates: [{ url: 'http://192.168.1.17:45911/remote' }],
        iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
        protocolVersion: 4
      }
    }) }), 3);
  }
  close() { this.readyState = 3; this.onclose?.(); }
}

const context = {
  console, setTimeout, clearTimeout, URL, URLSearchParams, Response, TextEncoder, TextDecoder,
  DataView, Uint8Array, ArrayBuffer, crypto, WebSocket: FakeWebSocket,
  RTCPeerConnection: class { constructor() { throw new Error('WebRTC must not start when LAN is reachable'); } },
  navigator: {},
  location: { search: `?internetTarget=${target}`, replace(value) { replaced = value; } },
  addEventListener() {},
  DexkNative: {
    cloudInitialize(id) {
      setTimeout(() => context.DexkCloudNative.complete(id, JSON.stringify({
        serverUrl: 'https://example.invalid', deviceId: '111222333444', accessToken: 'test-token',
        deviceName: 'Android controller', stunUrls: ['stun:test'], iceServers: [{ urls: ['stun:test'] }]
      }), null), 1);
    },
    probeLanCandidates(id, json) {
      const candidates = JSON.parse(json);
      setTimeout(() => context.DexkCloudNative.probeComplete(id, JSON.stringify({
        url: candidates[0].url, reachable: true
      }), null), 1);
    }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../app/src/main/assets/cloud-common.js', import.meta.url), 'utf8'), context);
vm.runInContext(fs.readFileSync(new URL('../app/src/main/assets/cloud-controller.js', import.meta.url), 'utf8'), context);
context.DexkInternetTransport.connect({ pin: '33291781', name: 'Android controller', quality: 'balanced', clientType: 'mobile' }).catch(() => {});
await new Promise(resolve => setTimeout(resolve, 100));
if (!replaced) throw new Error('LAN fallback did not navigate');
const url = new URL(replaced);
if (url.hostname !== '192.168.1.17' || url.port !== '45911' || url.pathname !== '/remote') throw new Error(`Unexpected fallback URL: ${replaced}`);
if (url.searchParams.get('pairPin') !== '33291781' || url.searchParams.get('autoPair') !== '1') throw new Error('Pairing parameters were not preserved');
console.log('Same-LAN fallback simulation passed');
process.exit(0);
