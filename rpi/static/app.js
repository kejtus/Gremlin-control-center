const LAST_KEY = "rpilot.host";

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
let seq = 1;
let drive = { x: 0, y: 0, moving: false };
let driveTimer = null;
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

function renderStatus(s) {
  status = s;
  ui.name.textContent = s.name;
  ui.battery.textContent = `${Math.round(s.batteryPct)}%`;
  ui.left.textContent = `${Math.round(s.motors.left * 100)}%`;
  ui.right.textContent = `${Math.round(s.motors.right * 100)}%`;
  ui.x.textContent = s.pose.x.toFixed(2);
  ui.y.textContent = s.pose.y.toFixed(2);
  ui.mode.textContent = `${s.mode === "gpio" ? "Napęd GPIO" : "Symulacja fizyki"}${s.estop ? " · E-STOP" : ""}${s.lights ? " · światła" : ""}`;
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

function send(packet) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(packet));
    return true;
  }
  return false;
}

function startDriveLoop() {
  if (driveTimer) return;
  driveTimer = setInterval(() => {
    if (!drive.moving) return;
    const packet = { t: "drive", x: drive.x, y: drive.y, seq: seq++ };
    if (!send(packet)) {
      void getJson("/api/drive", { method: "POST", body: JSON.stringify({ x: drive.x, y: drive.y }) }).catch(() => {});
    }
  }, 50);
}

function stopDrive() {
  drive = { x: 0, y: 0, moving: false };
  if (!send({ t: "stop", seq: seq++ })) {
    void getJson("/api/stop", { method: "POST", body: "{}" }).catch(() => {});
  }
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
    drive = { x: x / max, y: -y / max, moving: Math.hypot(x, y) > 4 };
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
    if (!ev.buttons && ev.pointerType !== "touch") return;
    if (!ui.stick.hasPointerCapture(ev.pointerId) && ev.pointerType !== "touch") return;
    apply(ev.clientX, ev.clientY);
  });
  ui.stick.addEventListener("pointerup", end);
  ui.stick.addEventListener("pointercancel", end);
}

function wsUrl() {
  const root = base || window.location.origin;
  const url = new URL(root);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/control";
  url.search = "";
  return url.toString();
}

function connectWs() {
  try {
    ws = new WebSocket(wsUrl());
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.status) renderStatus(msg.status);
      } catch {
        /* ignore */
      }
    };
    ws.onopen = () => setLink(true, `${new URL(base || window.location.origin).host} · WS`);
    ws.onclose = () => {
      if (status) setLink(false, "utracono WebSocket — HTTP nadal działa");
    };
  } catch {
    ws = null;
  }
}

async function connect(host) {
  if (host) {
    base = host.startsWith("http") ? host.replace(/\/$/, "") : `http://${host.replace(/\/$/, "")}`;
  } else {
    base = "";
  }
  const info = await getJson("/api/info");
  ui.name.textContent = info.name;
  localStorage.setItem(LAST_KEY, base || window.location.origin);
  const [st, eps] = await Promise.all([getJson("/api/status"), getJson("/api/endpoints")]);
  renderStatus(st);
  renderEndpoints(eps.endpoints || []);
  setLink(true, `${info.ip || "lokalnie"} · HTTP`);
  connectWs();
}

async function autoConnect() {
  setLink(false, "automatyczne łączenie…");
  const last = localStorage.getItem(LAST_KEY);
  const tries = ["", last, window.location.origin].filter((v, i, a) => v !== undefined && a.indexOf(v) === i);
  for (const host of tries) {
    try {
      await connect(host);
      return;
    } catch {
      /* next candidate */
    }
  }
  setLink(false, "brak agenta — podaj adres ręcznie");
  ui.name.textContent = "Brak połączenia";
}

document.getElementById("estop").addEventListener("click", () => {
  stopDrive();
});
document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.getAttribute("data-cmd");
    if (!send({ t: "cmd", name, seq: seq++ })) {
      void getJson(`/api/command/${name}`, { method: "POST", body: "{}" }).catch(() => {});
    }
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
