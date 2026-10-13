const LAST_KEY = "gremlin.host";
const MAX_PWM = 4095;
const MOTOR_PAIRS = { FL: [0, 1], FR: [3, 2], RL: [4, 5], RR: [7, 6] };
const DIR = {
  Przód: { FL: -1, FR: -1, RL: -1, RR: -1 },
  "Full prawo": { FL: -1, FR: 1, RL: 1, RR: -1 },
  Prawo: { FL: 1, FR: -1, RL: 1, RR: -1 },
};

const ui = {
  name: document.getElementById("robot-name"),
  dot: document.getElementById("link-dot"),
  label: document.getElementById("link-label"),
  battery: document.getElementById("battery"),
  left: document.getElementById("m-left"),
  right: document.getElementById("m-right"),
  x: document.getElementById("m-x"),
  y: document.getElementById("m-y"),
  mode: document.getElementById("mode"),
  endpoints: document.getElementById("endpoints"),
  bot: document.getElementById("bot"),
  arena: document.getElementById("arena"),
  stick: document.getElementById("stick"),
  knob: document.getElementById("knob"),
  host: document.getElementById("host"),
};

let base = "";
let ws = null;
let pairs = MOTOR_PAIRS;
let power = 0.45;
let drive = { vx: 0, vy: 0, omega: 0, moving: false };
let driveTimer = null;
let lastSent = "";
let status = null;

function apiUrl(path) {
  return `${base}${path}`;
}

async function getJson(path, options) {
  const res = await fetch(apiUrl(path), {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function setLink(ok, text) {
  ui.dot.className = `dot ${ok ? "ok" : "warn"}`;
  ui.label.textContent = text;
}

function channelsFromVector(vy, vx, omega, maxPwm) {
  const out = {};
  for (let i = 0; i < 8; i++) out[i] = 0;
  for (const role of Object.keys(pairs)) {
    const pair = pairs[role];
    if (!pair) continue;
    const [fCh, bCh] = pair;
    const net =
      (vy * (DIR.Przód[role] || 0) + vx * (DIR["Full prawo"][role] || 0) + omega * (DIR.Prawo[role] || 0)) * maxPwm;
    if (net > 0) {
      out[fCh] = Math.round(Math.min(net, maxPwm));
      out[bCh] = 0;
    } else if (net < 0) {
      out[fCh] = 0;
      out[bCh] = Math.round(Math.min(-net, maxPwm));
    }
  }
  return out;
}

function send(packet) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(packet));
    return true;
  }
  return false;
}

function sendMotors(vy, vx, omega) {
  const values = channelsFromVector(vy, vx, omega, Math.round(power * MAX_PWM));
  const serialized = JSON.stringify(values);
  if (serialized === lastSent) return;
  lastSent = serialized;
  for (let ch = 0; ch < 8; ch++) send({ type: "motor", channel: ch, pwm: values[ch] });
}

function renderStatus(s) {
  status = s;
  ui.name.textContent = s.name || "Gremlin";
  ui.battery.textContent = `${Math.round(s.batteryPct)}%`;
  const wheels = s.wheels || {};
  const ch = s.channels || {};
  const peak = (role, a, b) => {
    if (wheels[role] != null) return wheels[role];
    return Math.max(ch[a] || 0, ch[b] || 0);
  };
  ui.left.textContent = `${Math.round((peak("FL", 0, 1) / MAX_PWM) * 100)}%`;
  ui.right.textContent = `${Math.round((peak("FR", 3, 2) / MAX_PWM) * 100)}%`;
  ui.x.textContent = `${Math.round((peak("RL", 4, 5) / MAX_PWM) * 100)}%`;
  ui.y.textContent = `${Math.round((peak("RR", 7, 6) / MAX_PWM) * 100)}%`;
  ui.mode.textContent = `Gremlin · WS motor${s.followBand ? " · taśma" : ""}${s.programOn === false ? " · OFF" : ""}`;
  const w = ui.arena.clientWidth;
  const h = ui.arena.clientHeight;
  const px = (s.pose.x / s.arena.width) * w;
  const py = (1 - s.pose.y / s.arena.height) * h;
  ui.bot.style.left = `${px}px`;
  ui.bot.style.top = `${py}px`;
  ui.bot.style.transform = `rotate(${(-s.pose.heading * 180) / Math.PI}deg)`;
}

function renderEndpoints(list) {
  ui.endpoints.innerHTML = list
    .map(
      (e) => `<div class="ep"><div class="m">${e.method}</div><div><code>${e.path}</code><p>${e.summary}</p></div></div>`,
    )
    .join("");
}

function startDriveLoop() {
  if (driveTimer) return;
  driveTimer = setInterval(() => {
    if (!drive.moving) return;
    sendMotors(drive.vy, drive.vx, drive.omega);
  }, 50);
}

function stopDrive() {
  drive = { vx: 0, vy: 0, omega: 0, moving: false };
  sendMotors(0, 0, 0);
}

function attachJoystick() {
  const max = 70;
  const setKnob = (x, y) => {
    ui.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  };
  const apply = (clientX, clientY) => {
    const rect = ui.stick.getBoundingClientRect();
    let x = clientX - (rect.left + rect.width / 2);
    let y = clientY - (rect.top + rect.height / 2);
    x = Math.max(-max, Math.min(max, x));
    y = Math.max(-max, Math.min(max, y));
    setKnob(x, y);
    drive = { vx: x / max, vy: -y / max, omega: 0, moving: Math.hypot(x, y) > 4 };
    if (drive.moving) startDriveLoop();
  };
  const end = () => {
    setKnob(0, 0);
    stopDrive();
  };
  ui.stick.addEventListener("pointerdown", (ev) => {
    ui.stick.setPointerCapture(ev.pointerId);
    apply(ev.clientX, ev.clientY);
  });
  ui.stick.addEventListener("pointermove", (ev) => {
    if (!ui.stick.hasPointerCapture(ev.pointerId)) return;
    apply(ev.clientX, ev.clientY);
  });
  ui.stick.addEventListener("pointerup", end);
  ui.stick.addEventListener("pointercancel", end);
}

function parseHost(raw) {
  const t = (raw || "").trim().replace(/\/$/, "");
  if (!t) {
    return { host: window.location.hostname, port: window.location.port || "3000" };
  }
  try {
    if (t.startsWith("http://") || t.startsWith("https://")) {
      const u = new URL(t);
      return { host: u.hostname, port: u.port || "3000" };
    }
  } catch {
    /* fall through */
  }
  const i = t.lastIndexOf(":");
  if (i > 0 && /^\d+$/.test(t.slice(i + 1))) {
    return { host: t.slice(0, i), port: t.slice(i + 1) };
  }
  return { host: t, port: "3000" };
}

function httpBases(raw) {
  if (!raw) return [window.location.origin];
  const { host, port } = parseHost(raw);
  const ports = [port, "3000", "8742"].filter((p, idx, arr) => p && arr.indexOf(p) === idx);
  return ports.map((p) => `http://${host}:${p}`);
}

function wsCandidates() {
  const host = base ? new URL(base.startsWith("http") ? base : `http://${base}`).hostname : window.location.hostname;
  const httpPort = base ? new URL(base.startsWith("http") ? base : `http://${base}`).port : window.location.port;
  const urls = [`ws://${host}:8765`];
  if (httpPort && httpPort !== "3000" && httpPort !== "8765") {
    urls.push(`ws://${host}:${httpPort}/ws`);
  }
  if (base && new URL(base).host === window.location.host) {
    urls.unshift(`ws://${window.location.host}/ws`);
  }
  return [...new Set(urls)];
}

function connectWs(index = 0) {
  const list = wsCandidates();
  if (index >= list.length) return;
  try {
    ws = new WebSocket(list[index]);
  } catch {
    connectWs(index + 1);
    return;
  }
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.status) renderStatus(msg.status);
      if (msg.type === "ads1115_values" && msg.values && msg.values.a0 != null) {
        const pct = Math.max(0, Math.min(100, ((msg.values.a0 - 10) / 6) * 100));
        ui.battery.textContent = `${Math.round(pct)}%`;
      }
    } catch {
      /* ignore */
    }
  };
  ws.onopen = () => {
    setLink(true, `${list[index].replace("ws://", "")}`);
    send({ type: "get_program_status" });
    send({ type: "get_ads1115_values" });
  };
  ws.onerror = () => {
    if (ws && ws.readyState !== WebSocket.OPEN) connectWs(index + 1);
  };
  ws.onclose = () => {
    if (status) setLink(false, "utracono WS — HTTP nadal działa");
  };
}

async function connect(host) {
  const tries = httpBases(host);
  let lastErr = null;
  for (const candidate of tries) {
    try {
      base = candidate;
      let info = null;
      try {
        info = await getJson("/api/info");
      } catch {
        info = null;
      }
      try {
        const cfg = await getJson("/api/robot-config");
        if (cfg.motors) pairs = cfg.motors;
      } catch (err) {
        if (!info) throw err;
      }
      localStorage.setItem(LAST_KEY, base || window.location.origin);
      if (info) ui.name.textContent = info.name || "Gremlin";
      else ui.name.textContent = "Gremlin";
      try {
        const [st, eps] = await Promise.all([getJson("/api/status"), getJson("/api/endpoints")]);
        renderStatus(st);
        renderEndpoints(eps.endpoints || []);
      } catch {
        renderEndpoints([
          { method: "WS", path: `ws://${new URL(base).hostname}:8765`, summary: "Sterowanie Gremlin" },
          { method: "HTTP", path: base, summary: "Panel HTTP" },
        ]);
      }
      setLink(true, `${new URL(base).hostname} · Gremlin`);
      connectWs();
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("connect failed");
}

async function autoConnect() {
  setLink(false, "łączenie z Pi 192.168.1.215…");
  const last = localStorage.getItem(LAST_KEY);
  const tries = ["192.168.1.215:3000", last].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const host of tries) {
    if (host && /localhost|127\.0\.0\.1|:8742/i.test(host)) continue;
    try {
      await connect(host);
      return;
    } catch {
      /* next */
    }
  }
  setLink(false, "brak Gremlina — podaj adres panelu");
  ui.name.textContent = "Brak połączenia";
}

document.getElementById("estop").addEventListener("click", () => stopDrive());
document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.getAttribute("data-cmd");
    if (name === "beep") send({ type: "play_sound", file: "beep.wav", volume: 1 });
    else if (name === "follow") send({ type: "set_follow_band_mode", enabled: true });
    else if (name === "manual") send({ type: "set_follow_band_mode", enabled: false });
    else if (name === "center") stopDrive();
  });
});
document.getElementById("manual").addEventListener("submit", (ev) => {
  ev.preventDefault();
  void connect(ui.host.value.trim()).catch(() => setLink(false, "nie udało się połączyć"));
});

attachJoystick();
void autoConnect();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
