/* ============================================================
   Tiny Comet — idle / progresión cósmica
   ------------------------------------------------------------
   Loop: lanzar la sonda al vacío → dirigirla mientras desciende
   → recoger fragmentos estelares con el imán → recogerla (reel)
   → vender el botín por polvo estelar → mejorar el equipo →
   volver a lanzar más hondo. Cuanto más profundo, fragmentos más
   raros y valiosos. Todo el render se hace en un Canvas y el
   progreso persiste en localStorage.
   ============================================================ */

/* ---------- Referencias del DOM ---------- */
const canvas      = document.getElementById("stage");
const ctx         = canvas.getContext("2d");

/* Polyfill mínimo de roundRect: algunos Safari antiguos no lo tienen y
   un throw dentro del bucle de render rompería el juego entero. */
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rad = Math.min(typeof r === "number" ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2);
    this.beginPath();
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
    return this;
  };
}
const dustEl      = document.getElementById("dust");
const depthEl     = document.getElementById("depth");
const haulEl      = document.getElementById("haul");
const actionBtn   = document.getElementById("actionBtn");
const soundToggle = document.getElementById("soundToggle");
const hintEl      = document.getElementById("hint");
const bestDepthEl = document.getElementById("bestDepth");
const upgradesEl  = document.getElementById("upgrades");

/* ---------- Sistema de coordenadas lógico ----------
   Dibujamos siempre en un espacio fijo de 300×400 unidades; un
   transform en el contexto lo escala al tamaño real del lienzo
   (responsive + nitidez en pantallas retina). La cámara se
   desplaza en Y para seguir a la sonda mientras se sumerge. */
const LW = 300;          // ancho lógico
const LH = 400;          // alto lógico visible
const SURFACE_Y = 36;    // posición de reposo de la sonda (bajo la superficie)
const WINCH = { x: 150, y: 4 }; // anclaje del cable en la superficie
const PROBE_MINX = 24, PROBE_MAXX = 276;
const DESCEND = 128;     // unidades/seg al bajar (sin mejoras)
const ASCEND  = 122;     // unidades/seg al subir (sin mejoras)

/* ---------- Definición de mejoras ----------
   Cada nivel encarece según base · growth^nivel. Las funciones
   derivadas traducen el nivel a un efecto concreto del juego. */
const UPGRADES = {
  cable:  { icon: "🛰️", name: "Cable",  desc: "Dive deeper into the void",       base: 22, growth: 1.55, max: 12 },
  magnet: { icon: "🧲", name: "Magnet", desc: "Wider fragment pickup radius",    base: 16, growth: 1.5,  max: 10 },
  line:   { icon: "🪢", name: "Line",   desc: "Carry more fragments per dive",   base: 30, growth: 1.6,  max: 10 },
  reel:   { icon: "⚙️", name: "Reel",   desc: "Reel in and out faster",          base: 26, growth: 1.5,  max: 10 },
};
const UPG_ORDER = ["cable", "magnet", "line", "reel"];

const maxDepth     = () => 360 + state.up.cable * 200;             // profundidad alcanzable
const magnetRadius = () => 15 + state.up.magnet * 6;              // radio de recogida
const capacity     = () => 4 + state.up.line * 2;                // fragmentos por inmersión
const speedMult    = () => 1 + state.up.reel * 0.22;             // factor de velocidad de carrete
const upgradeCost   = (key) => {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.growth, state.up[key]));
};

/* ---------- Tiers de fragmentos por profundidad ----------
   Más hondo ⇒ tier mayor ⇒ más raro y valioso. */
const TIER_COLOR = ["#9aa6cc", "#22d3ee", "#7c5cff", "#f472b6", "#fbbf24", "#ff5d5d"];
const TIER_VALUE = [3, 8, 20, 55, 150, 400];
const TIER_NAME  = ["Dust", "Ice", "Amethyst", "Rose", "Solar", "Crimson"];
function tierForDepth(y) {
  if (y < 160)  return 0;
  if (y < 360)  return 1;
  if (y < 680)  return 2;
  if (y < 1080) return 3;
  if (y < 1640) return 4;
  return 5;
}
/* Inicio (en unidades de profundidad) de cada banda — para dibujar etiquetas. */
const BAND_START = [0, 160, 360, 680, 1080, 1640];

/* ---------- Estado del juego ---------- */
const state = {
  dust: 0,
  bestDepth: 0,
  soundOn: true,
  up: { cable: 0, magnet: 0, line: 0, reel: 0 },

  phase: "idle",        // idle | down | up
  probe: { x: 150, y: SURFACE_Y, tx: 150 }, // tx = objetivo horizontal (dirección)
  field: [],            // fragmentos de la inmersión actual
  haul: [],             // valores recogidos esta inmersión
  deepest: 0,           // profundidad máxima alcanzada esta inmersión
  cameraY: 0,
  particles: [],        // partículas de recogida
  floats: [],           // textos flotantes ("+N")
};

const SAVE_KEY = "tinycomet.save";

/* ---------- Persistencia ---------- */
function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (raw && typeof raw === "object") {
      state.dust = Number(raw.dust) || 0;
      state.bestDepth = Number(raw.bestDepth) || 0;
      state.soundOn = raw.soundOn !== false;
      if (raw.up) for (const k of UPG_ORDER) {
        state.up[k] = Math.min(UPGRADES[k].max, Math.max(0, Number(raw.up[k]) || 0));
      }
    }
  } catch (_) { /* arranque limpio si el guardado está corrupto */ }
}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      dust: state.dust,
      bestDepth: state.bestDepth,
      soundOn: state.soundOn,
      up: state.up,
    }));
  } catch (_) { /* p. ej. modo privado: el juego sigue sin persistir */ }
}

/* ---------- Sonido (WebAudio, sin archivos) ---------- */
let audioCtx = null;
function audio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function tone(freq, dur = 0.09, type = "sine", gain = 0.05) {
  if (!state.soundOn) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}
function playLaunch()  { tone(180, 0.18, "sawtooth", 0.04); }
function playCollect(tier) { tone(440 + tier * 90, 0.08, "triangle", 0.05); }
function playSell(n) {
  if (!state.soundOn) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.18, "sine", 0.06), i * 90));
}
function reflectSoundUI() {
  soundToggle.textContent = state.soundOn ? "🔊" : "🔇";
  soundToggle.classList.toggle("is-muted", !state.soundOn);
  soundToggle.setAttribute("aria-pressed", String(state.soundOn));
}
function toggleSound() {
  state.soundOn = !state.soundOn;
  reflectSoundUI();
  persist();
  if (state.soundOn) tone(660, 0.1, "sine", 0.06);
}

/* ---------- Sprites: probe.svg / fragment.svg con fallback ----------
   Los crea el diseñador; aquí solo se cargan. Si no cargan, se
   dibujan formas equivalentes a mano. El fragmento se tinta por
   tier usando lienzos cacheados (composite 'source-in'). */
const probeImg = new Image();
let probeReady = false;
probeImg.onload = () => { probeReady = true; };
probeImg.onerror = () => { probeReady = false; };
probeImg.src = "assets/probe.svg";

const fragImg = new Image();
let fragReady = false;
const fragTint = [];   // un lienzo tintado por tier
fragImg.onload = () => {
  fragReady = true;
  buildFragTints();
};
fragImg.onerror = () => { fragReady = false; };
fragImg.src = "assets/fragment.svg";

function buildFragTints() {
  const S = 48; // tamaño del sprite cacheado
  for (let t = 0; t < TIER_COLOR.length; t++) {
    const off = document.createElement("canvas");
    off.width = off.height = S;
    const o = off.getContext("2d");
    o.drawImage(fragImg, 0, 0, S, S);
    o.globalCompositeOperation = "source-in";
    o.fillStyle = TIER_COLOR[t];
    o.fillRect(0, 0, S, S);
    fragTint[t] = off;
  }
}

/* ---------- Utilidades ---------- */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/* Color del fondo según la profundidad (degradado entre paradas). */
const DEPTH_STOPS = [
  [0,    "#0b1020"],
  [220,  "#0d1430"],
  [520,  "#141a3c"],
  [900,  "#1a1336"],
  [1400, "#251030"],
  [2000, "#2a0a1f"],
  [2700, "#050309"],
];
function colorForDepth(y) {
  let a = DEPTH_STOPS[0], b = DEPTH_STOPS[DEPTH_STOPS.length - 1];
  for (let i = 0; i < DEPTH_STOPS.length - 1; i++) {
    if (y >= DEPTH_STOPS[i][0] && y <= DEPTH_STOPS[i + 1][0]) {
      a = DEPTH_STOPS[i]; b = DEPTH_STOPS[i + 1]; break;
    }
    if (y > DEPTH_STOPS[DEPTH_STOPS.length - 1][0]) { a = b; break; }
  }
  const span = b[0] - a[0] || 1;
  const t = clamp((y - a[0]) / span, 0, 1);
  const ca = hexToRgb(a[1]), cb = hexToRgb(b[1]);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}

/* ---------- Campo de estrellas (parallax) ----------
   Generadas una vez en un rango amplio; se dibujan con desplazamiento
   parallax y envoltura (wrap) para cubrir cualquier profundidad. */
const STARS = Array.from({ length: 90 }, () => ({
  x: Math.random() * LW,
  y: Math.random() * 1400,
  r: Math.random() * 1.4 + 0.4,
  par: 0.25 + Math.random() * 0.55,      // factor parallax
  tw: Math.random() * Math.PI * 2,        // fase de parpadeo
}));

/* ---------- Generación del campo de fragmentos ----------
   Se reparte por profundidad hasta maxDepth(); el tier (y por tanto
   el valor) depende de la banda de profundidad. */
function generateField() {
  const depth = maxDepth();
  const field = [];
  let y = 90;
  while (y < depth - 8) {
    // separación variable; algo más espaciado en la profundidad
    const gap = 26 + Math.random() * 30 + (y / depth) * 22;
    const tier = tierForDepth(y);
    const val = Math.max(1, Math.round(TIER_VALUE[tier] * (0.85 + Math.random() * 0.45)));
    field.push({
      x: PROBE_MINX + 8 + Math.random() * (PROBE_MAXX - PROBE_MINX - 16),
      y,
      r: 7 + tier * 0.8,
      tier,
      val,
      got: false,
      seed: Math.random() * Math.PI * 2,
    });
    y += gap;
  }
  state.field = field;
}

/* ---------- Flujo de la inmersión ---------- */
function launch() {
  if (state.phase !== "idle") return;
  generateField();
  state.haul = [];
  state.deepest = 0;
  state.probe.y = SURFACE_Y;
  state.probe.tx = state.probe.x;
  state.phase = "down";
  playLaunch();
  if (navigator.vibrate) navigator.vibrate(10);
  syncControls();
}
function reelIn() {
  if (state.phase !== "down") return;
  state.phase = "up";
  syncControls();
}
function sell() {
  const gained = state.haul.reduce((s, v) => s + v, 0);
  state.dust += gained;
  if (state.deepest > state.bestDepth) state.bestDepth = Math.round(state.deepest);
  state.phase = "idle";
  state.probe.y = SURFACE_Y;
  if (gained > 0) {
    addFloat(`+${gained} ✦`, "#22d3ee");
    playSell(state.haul.length);
    if (navigator.vibrate) navigator.vibrate(18);
  } else {
    addFloat("Empty haul", "#9aa6cc");
  }
  persist();
  syncControls();
  refreshHUD();
  renderUpgrades();
}

/* ---------- Partículas y textos flotantes ---------- */
function burst(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = Math.random() * 60 + 20;
    state.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5, max: 0.5, color, r: Math.random() * 2 + 1,
    });
  }
}
function addFloat(text, color) {
  state.floats.push({ text, color, t: 0, life: 1.4 });
}

/* ---------- Bucle principal ---------- */
let lastT = 0;
function frame(now) {
  const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0.016);
  lastT = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  const p = state.probe;
  const t = lastT / 1000;

  if (state.phase === "idle") {
    // ligero balanceo en reposo
    p.y = SURFACE_Y + Math.sin(t * 1.8) * 2.2;
  } else {
    // dirección horizontal suave hacia el objetivo
    p.x += (p.tx - p.x) * Math.min(1, dt * 7);
    p.x = clamp(p.x, PROBE_MINX, PROBE_MAXX);

    const sp = speedMult();
    if (state.phase === "down") {
      p.y += DESCEND * sp * dt;
      if (p.y >= maxDepth()) { p.y = maxDepth(); reelIn(); }
    } else if (state.phase === "up") {
      p.y -= ASCEND * sp * dt;
      if (p.y <= SURFACE_Y) { p.y = SURFACE_Y; sell(); }
    }
    if (p.y > state.deepest) state.deepest = p.y;

    collectFragments(dt);
  }

  // cámara: encuadra la sonda dejando ver bajo ella
  const target = clamp(p.y - LH * 0.42, 0, Math.max(0, maxDepth() - LH + 80));
  state.cameraY += (target - state.cameraY) * Math.min(1, dt * 5);

  // partículas
  for (const q of state.particles) {
    q.life -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vy += 40 * dt;
  }
  state.particles = state.particles.filter((q) => q.life > 0);

  // textos flotantes
  for (const f of state.floats) f.t += dt;
  state.floats = state.floats.filter((f) => f.t < f.life);

  refreshDepthHUD();
}

function collectFragments(dt) {
  const p = state.probe;
  const mr = magnetRadius();
  const cap = capacity();
  for (const f of state.field) {
    if (f.got) continue;
    const dx = f.x - p.x, dy = f.y - p.y;
    const d = Math.hypot(dx, dy);
    // atracción magnética suave dentro de un radio ampliado
    if (d < mr * 2.2 && d > 0.001) {
      const pull = (1 - d / (mr * 2.2)) * 120 * dt;
      f.x -= (dx / d) * pull;
      f.y -= (dy / d) * pull;
    }
    if (state.haul.length < cap && d < mr + f.r) {
      f.got = true;
      state.haul.push(f.val);
      burst(f.x, f.y, TIER_COLOR[f.tier]);
      playCollect(f.tier);
      refreshHUD();
      if (state.haul.length >= cap && state.phase === "down") reelIn();
    }
  }
}

/* ---------- Render ---------- */
let view = { w: 300, h: 400, scale: 1, dpr: 1 };
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  view.scale = rect.width / LW;     // unidades lógicas → px CSS
  view.dpr = dpr;
  view.w = rect.width; view.h = rect.height;
}

function render() {
  const cam = state.cameraY;
  ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);

  // fondo degradado según profundidad
  const grad = ctx.createLinearGradient(0, 0, 0, LH);
  grad.addColorStop(0, colorForDepth(cam));
  grad.addColorStop(1, colorForDepth(cam + LH));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LW, LH);

  drawStars(cam);
  drawBands(cam);
  drawSurface(cam);
  drawCable(cam);
  drawFragments(cam);
  drawParticles(cam);
  drawProbe(cam);
  drawFloats();
}

function drawStars(cam) {
  const t = lastT / 1000;
  const wrap = LH + 200;
  for (const s of STARS) {
    let sy = (s.y - cam * s.par) % wrap;
    if (sy < 0) sy += wrap;
    sy -= 100;
    if (sy < -10 || sy > LH + 10) continue;
    const tw = 0.55 + Math.sin(t * 2 + s.tw) * 0.35;
    ctx.globalAlpha = tw * (0.4 + s.par * 0.6);
    ctx.fillStyle = "#dfe6ff";
    ctx.beginPath();
    ctx.arc(s.x, sy, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* Etiquetas tenues al inicio de cada banda de profundidad alcanzable. */
function drawBands(cam) {
  ctx.save();
  ctx.font = "600 9px 'Space Grotesk', monospace";
  ctx.textAlign = "left";
  for (let t = 1; t < BAND_START.length; t++) {
    const wy = BAND_START[t];
    if (wy > maxDepth() + 40) break;
    const sy = wy - cam;
    if (sy < -20 || sy > LH + 20) continue;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(8, sy); ctx.lineTo(LW - 8, sy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = TIER_COLOR[t];
    ctx.globalAlpha = 0.8;
    ctx.fillText(`${TIER_NAME[t]} zone`, 10, sy - 4);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* Estación/cabrestante en la superficie. */
function drawSurface(cam) {
  const sy = WINCH.y - cam;
  if (sy > LH + 30) return;
  // resplandor de horizonte
  ctx.fillStyle = "rgba(124,92,255,0.12)";
  ctx.fillRect(0, -cam, LW, Math.max(0, 30 - cam));
  // cuerpo del cabrestante
  ctx.save();
  ctx.translate(WINCH.x, sy);
  ctx.fillStyle = "#2a3358";
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-18, -6, 36, 16, 5);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.arc(0, 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCable(cam) {
  const p = state.probe;
  ctx.strokeStyle = "rgba(180,200,255,0.45)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(WINCH.x, WINCH.y - cam + 4);
  ctx.lineTo(p.x, p.y - cam);
  ctx.stroke();
}

function drawFragments(cam) {
  const t = lastT / 1000;
  for (const f of state.field) {
    if (f.got) continue;
    const sy = f.y - cam;
    if (sy < -20 || sy > LH + 20) continue;
    const pulse = 1 + Math.sin(t * 3 + f.seed) * 0.08;
    const r = f.r * pulse;
    // halo del color del tier
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = TIER_COLOR[f.tier];
    ctx.beginPath();
    ctx.arc(f.x, sy, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (fragReady && fragTint[f.tier]) {
      const s = r * 2.6;
      ctx.drawImage(fragTint[f.tier], f.x - s / 2, sy - s / 2, s, s);
    } else {
      drawCrystal(f.x, sy, r, TIER_COLOR[f.tier]);
    }
  }
}
/* Fallback: cristal facetado dibujado a mano. */
function drawCrystal(x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.7, -r * 0.2);
  ctx.lineTo(r * 0.45, r);
  ctx.lineTo(-r * 0.45, r);
  ctx.lineTo(-r * 0.7, -r * 0.2);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.7, -r * 0.2);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawParticles(cam) {
  for (const q of state.particles) {
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y - cam, q.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawProbe(cam) {
  const p = state.probe;
  const sy = p.y - cam;
  // resplandor del imán cuando está activo
  if (state.phase !== "idle") {
    const mr = magnetRadius();
    const g = ctx.createRadialGradient(p.x, sy, 2, p.x, sy, mr);
    g.addColorStop(0, "rgba(34,211,238,0.22)");
    g.addColorStop(1, "rgba(34,211,238,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, sy, mr, 0, Math.PI * 2);
    ctx.fill();
  }

  const size = 26;
  if (probeReady) {
    ctx.drawImage(probeImg, p.x - size / 2, sy - size / 2, size, size);
  } else {
    drawProbeFallback(p.x, sy);
  }
}
/* Fallback: sonda con cápsula y núcleo brillante. */
function drawProbeFallback(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#cdd6f4";
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-8, -11, 16, 22, 8);
  ctx.fill(); ctx.stroke();
  // núcleo
  ctx.fillStyle = "#7c5cff";
  ctx.beginPath();
  ctx.arc(0, -2, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.arc(0, -2, 2, 0, Math.PI * 2);
  ctx.fill();
  // pinzas inferiores
  ctx.strokeStyle = "#9aa6cc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-5, 9); ctx.lineTo(-8, 14);
  ctx.moveTo(5, 9);  ctx.lineTo(8, 14);
  ctx.stroke();
  ctx.restore();
}

function drawFloats() {
  ctx.save();
  ctx.textAlign = "center";
  for (const f of state.floats) {
    const k = f.t / f.life;
    ctx.globalAlpha = clamp(1 - k, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = "700 22px 'Space Grotesk', monospace";
    ctx.fillText(f.text, LW / 2, LH * 0.4 - k * 40);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ---------- HUD ---------- */
function refreshHUD() {
  dustEl.textContent = Math.round(state.dust).toLocaleString("en-US");
  haulEl.textContent = `${state.haul.length} / ${capacity()}`;
  bestDepthEl.textContent = `Best depth · ${state.bestDepth}`;
}
function refreshDepthHUD() {
  const d = state.phase === "idle" ? 0 : Math.round(state.probe.y);
  depthEl.textContent = d;
}

/* ---------- Controles ---------- */
function syncControls() {
  if (state.phase === "idle") {
    actionBtn.textContent = "Launch probe ▾";
    actionBtn.classList.remove("is-reel");
    actionBtn.disabled = false;
    hintEl.textContent = "Drag left/right to steer · the magnet grabs fragments it passes";
  } else if (state.phase === "down") {
    actionBtn.textContent = "Reel in ▴";
    actionBtn.classList.add("is-reel");
    actionBtn.disabled = false;
    hintEl.textContent = "Steer toward fragments — reel in before the line is full";
  } else {
    actionBtn.textContent = "Reeling…";
    actionBtn.classList.remove("is-reel");
    actionBtn.disabled = true;
    hintEl.textContent = "Hauling your fragments back up";
  }
}
function onAction() {
  if (state.phase === "idle") launch();
  else if (state.phase === "down") reelIn();
}

/* Dirección por puntero: la X del puntero marca el objetivo horizontal. */
function pointerToTarget(clientX) {
  const rect = canvas.getBoundingClientRect();
  const lx = ((clientX - rect.left) / rect.width) * LW;
  state.probe.tx = clamp(lx, PROBE_MINX, PROBE_MAXX);
}
let steering = false;
canvas.addEventListener("pointerdown", (e) => {
  if (state.phase === "idle") { launch(); return; }
  steering = true;
  canvas.setPointerCapture(e.pointerId);
  pointerToTarget(e.clientX);
});
canvas.addEventListener("pointermove", (e) => {
  if (steering && state.phase !== "idle") pointerToTarget(e.clientX);
});
canvas.addEventListener("pointerup", () => { steering = false; });
canvas.addEventListener("pointercancel", () => { steering = false; });

// teclado: flechas para dirigir, espacio/enter para lanzar o recoger
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft")  { state.probe.tx = clamp(state.probe.tx - 26, PROBE_MINX, PROBE_MAXX); }
  if (e.key === "ArrowRight") { state.probe.tx = clamp(state.probe.tx + 26, PROBE_MINX, PROBE_MAXX); }
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); onAction(); }
});

actionBtn.addEventListener("click", onAction);
soundToggle.addEventListener("click", toggleSound);
window.addEventListener("resize", resize);

/* ---------- Tienda de mejoras ---------- */
function renderUpgrades() {
  upgradesEl.innerHTML = "";
  for (const key of UPG_ORDER) {
    const u = UPGRADES[key];
    const lvl = state.up[key];
    const isMax = lvl >= u.max;
    const cost = upgradeCost(key);
    const canBuy = !isMax && state.dust >= cost;

    const card = document.createElement("div");
    card.className = "up-card";

    let pips = "";
    for (let i = 0; i < u.max; i++) pips += `<span class="pip ${i < lvl ? "on" : ""}"></span>`;

    card.innerHTML = `
      <div class="up-top">
        <span class="up-icon">${u.icon}</span>
        <span class="up-name">${u.name}</span>
      </div>
      <div class="up-desc">${u.desc}</div>
      <div class="up-level" aria-label="Level ${lvl} of ${u.max}">${pips}</div>
      <button class="up-buy ${isMax ? "is-max" : ""}" ${(!canBuy || isMax) ? "disabled" : ""} data-key="${key}">
        ${isMax ? "MAX" : `${cost} ✦`}
      </button>
    `;
    upgradesEl.appendChild(card);
  }
  upgradesEl.querySelectorAll(".up-buy").forEach((btn) => {
    btn.addEventListener("click", () => buyUpgrade(btn.dataset.key));
  });
}
function buyUpgrade(key) {
  const lvl = state.up[key];
  if (lvl >= UPGRADES[key].max) return;
  const cost = upgradeCost(key);
  if (state.dust < cost) return;
  state.dust -= cost;
  state.up[key] += 1;
  tone(720, 0.12, "sine", 0.06);
  if (navigator.vibrate) navigator.vibrate(12);
  persist();
  refreshHUD();
  renderUpgrades();
}

/* ---------- Arranque ---------- */
function init() {
  loadSave();
  reflectSoundUI();
  resize();
  refreshHUD();
  refreshDepthHUD();
  renderUpgrades();
  syncControls();
  requestAnimationFrame(frame);
}
init();
