#!/usr/bin/env node
/**
 * Mostek kamery: UDP JPEG z Pi → WebSocket.
 * Tylko najnowsza klatka + limit FPS — bez kolejki (opóźnienie) i bez zalewania klienta.
 */
const dgram = require('dgram');
const { WebSocketServer } = require('ws');

const UDP_PORT = Number(process.env.VIDEO_UDP_PORT || 9000);
const WS_PORT = Number(process.env.VIDEO_WS_PORT || 8766);
const MAX_FPS = Number(process.env.VIDEO_MAX_FPS || 24);
const MAX_JPEG = 700000;
const HEADER = 4 + 2 + 2 + 8;
const GAP = 1000 / Math.max(1, MAX_FPS);
const MAX_BUFFER = 2 * 1024 * 1024;

const pending = new Map();
const clients = new Set();
let latestFrame = null;
let lastSend = 0;
let sendTimer = null;

function copy(buf) {
  return Buffer.from(buf);
}

function assemble(msg) {
  if (msg.length < 2) return null;
  if (msg.length >= HEADER) {
    const frameId = msg.readUInt32BE(0);
    const chunkIndex = msg.readUInt16BE(4);
    const total = msg.readUInt16BE(6);
    const payload = msg.subarray(HEADER);
    if (!total || total > 64 || chunkIndex >= total) return jpegOrNull(msg);
    if (total <= 1) return payload.length ? jpegOrNull(payload) : jpegOrNull(msg);
    let entry = pending.get(frameId);
    if (!entry || entry.total !== total) {
      entry = { chunks: new Array(total), total, received: 0 };
      pending.set(frameId, entry);
    }
    if (!entry.chunks[chunkIndex]) {
      entry.chunks[chunkIndex] = copy(payload);
      entry.received += 1;
    }
    if (entry.received === entry.total) {
      pending.delete(frameId);
      const frame = Buffer.concat(entry.chunks);
      return isJpeg(frame) && frame.length <= MAX_JPEG ? frame : null;
    }
    while (pending.size > 2) pending.delete(pending.keys().next().value);
    return null;
  }
  return jpegOrNull(msg);
}

function isJpeg(buf) {
  if (!buf || buf.length < 4 || buf.length > MAX_JPEG || buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  const from = Math.max(2, buf.length - 32);
  for (let i = buf.length - 2; i >= from; i--) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd9) return true;
  }
  return false;
}

function jpegOrNull(msg) {
  return isJpeg(msg) ? copy(msg) : null;
}

function scheduleSend() {
  if (sendTimer) return;
  const wait = Math.max(0, GAP - (Date.now() - lastSend));
  sendTimer = setTimeout(() => {
    sendTimer = null;
    trySend();
  }, wait);
}

function trySend() {
  const frame = latestFrame;
  if (!frame || !clients.size) return;
  const now = Date.now();
  if (now - lastSend < GAP) {
    scheduleSend();
    return;
  }
  let sent = false;
  for (const ws of clients) {
    if (ws.readyState !== ws.OPEN) continue;
    if (ws.bufferedAmount > MAX_BUFFER) continue;
    try {
      ws.send(frame, { binary: true });
      sent = true;
    } catch {
      clients.delete(ws);
    }
  }
  if (sent) lastSend = now;
  else scheduleSend();
}

const udp = dgram.createSocket({ type: 'udp4', recvBufferSize: 2 * 1024 * 1024 });
udp.on('message', (msg) => {
  const frame = assemble(msg);
  if (!frame) return;
  latestFrame = frame;
  trySend();
});
udp.on('error', (err) => {
  console.error('UDP', err.message);
});
udp.bind(UDP_PORT, '0.0.0.0');

const wss = new WebSocketServer({ host: '0.0.0.0', port: WS_PORT, perMessageDeflate: false });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
  trySend();
});

console.log(`Video bridge UDP :${UDP_PORT} → ws://0.0.0.0:${WS_PORT} (latest-frame, max ${MAX_FPS} fps)`);
