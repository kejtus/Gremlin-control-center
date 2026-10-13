#!/usr/bin/env node
/**
 * Proxy sterowania dla telefonu (Expo Go).
 * App ↔ proxy :8768 ↔ Pi :8765 (WebSocket). Bez strony Gremlina :3000.
 *
 *   GREMLIN_HOST=192.168.1.215 node rpi/control_proxy.js
 */
const { WebSocket, WebSocketServer } = require('ws');

const PI_HOST = process.env.GREMLIN_HOST || '192.168.1.215';
const PI_PORT = Number(process.env.GREMLIN_WS_PORT || 8765);
const LISTEN = Number(process.env.CONTROL_PROXY_PORT || 8768);
const PI_URL = `ws://${PI_HOST}:${PI_PORT}`;

let pi = null;
let activePhone = null;
const queue = [];
const MAX_QUEUE = 120;
let reconnectTimer = null;
let releaseTimer = null;
let wantPi = false;

function payloadText(data, binary) {
  if (binary) return null;
  try {
    return typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
  } catch {
    return null;
  }
}

function isMotorPayload(data, binary) {
  const s = payloadText(data, binary);
  if (!s) return false;
  return s.includes('"type":"motor"') || s.includes('"type": "motor"');
}

function flushQueue() {
  if (!pi || pi.readyState !== WebSocket.OPEN) return;
  while (queue.length) {
    const { data, binary } = queue.shift();
    try {
      pi.send(data, { binary });
    } catch {
      queue.unshift({ data, binary, motor: isMotorPayload(data, binary) });
      break;
    }
  }
}

function enqueue(data, binary) {
  const item = { data, binary, motor: isMotorPayload(data, binary) };
  if (item.motor) queue.push(item);
  else {
    const firstMotor = queue.findIndex((q) => q.motor);
    if (firstMotor === -1) queue.push(item);
    else queue.splice(firstMotor, 0, item);
  }
  while (queue.length > MAX_QUEUE) {
    const idx = queue.findIndex((q) => q.motor);
    if (idx >= 0) queue.splice(idx, 1);
    else queue.shift();
  }
}

function sendToPi(data, binary) {
  if (pi && pi.readyState === WebSocket.OPEN) {
    try {
      pi.send(data, { binary });
      return;
    } catch {
      /* queue */
    }
  } else if (wantPi) {
    clearReconnect();
    reconnectTimer = setTimeout(connectPi, 400);
  }
  enqueue(data, binary);
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearRelease() {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

function dropPi() {
  clearReconnect();
  const sock = pi;
  pi = null;
  if (!sock) return;
  try {
    sock.removeAllListeners();
    // close() na CONNECTING emituje error — bez listenera Node pada
    sock.on('error', () => {});
    if (sock.readyState === WebSocket.CONNECTING) {
      sock.terminate();
    } else if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CLOSING) {
      sock.close();
    }
  } catch {
    /* ignore */
  }
}

function connectPi() {
  clearReconnect();
  if (!wantPi) return;
  if (pi && (pi.readyState === WebSocket.OPEN || pi.readyState === WebSocket.CONNECTING)) {
    flushQueue();
    return;
  }

  dropPi();
  const sock = new WebSocket(PI_URL);
  pi = sock;
  sock.on('open', () => {
    if (!wantPi) {
      dropPi();
      return;
    }
    flushQueue();
  });
  sock.on('message', (data, isBinary) => {
    const phone = activePhone;
    if (!phone || phone.readyState !== WebSocket.OPEN) return;
    try {
      phone.send(data, { binary: !!isBinary });
    } catch {
      /* ignore */
    }
  });
  sock.on('close', () => {
    if (pi === sock) pi = null;
    if (wantPi) {
      reconnectTimer = setTimeout(connectPi, 500);
    }
  });
  sock.on('error', () => {
    /* reconnect on close */
  });
}

function onPhoneGone(phone) {
  if (activePhone !== phone) return;
  activePhone = null;
  wantPi = true;
  clearRelease();
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    if (!activePhone) {
      wantPi = false;
      queue.length = 0;
      dropPi();
    }
  }, 2500);
}

const wss = new WebSocketServer({ host: '0.0.0.0', port: LISTEN });
wss.on('connection', (phone) => {
  if (activePhone && activePhone !== phone) {
    try {
      activePhone.close();
    } catch {
      /* ignore */
    }
  }
  activePhone = phone;
  wantPi = true;
  clearRelease();
  connectPi();
  flushQueue();

  phone.on('message', (data, isBinary) => {
    sendToPi(data, !!isBinary);
  });
  phone.on('close', () => onPhoneGone(phone));
  phone.on('error', () => onPhoneGone(phone));
});

console.log(`Control proxy :${LISTEN} → ${PI_URL}`);
