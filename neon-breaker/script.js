/* ============================================================
   Neon Breaker — Breakout/Arkanoid con estética neón
   ------------------------------------------------------------
   Render en Canvas (sin sprites: rectángulos y círculos con
   glow). Pala con ratón / táctil / teclado, bola con estela,
   ladrillos que laten, power-ups que caen, varios niveles,
   vidas, score y best en localStorage.

   Todo el juego trabaja en un lienzo VIRTUAL fijo (VW × VH) y se
   escala al tamaño mostrado (responsive + nítido en HiDPI).
   ============================================================ */

/* ---------- Referencias DOM ---------- */
const stage      = document.getElementById("stage");
const fxCanvas   = document.getElementById("fx");
const ctx        = stage.getContext("2d");
const scoreEl    = document.getElementById("score");
const livesEl    = document.getElementById("lives");
const levelEl    = document.getElementById("level");
const bestEl     = document.getElementById("best");
const overlay    = document.getElementById("overlay");
const ovIcon     = document.getElementById("ovIcon");
const ovTitle    = document.getElementById("ovTitle");
const ovText     = document.getElementById("ovText");
const ovPrimary  = document.getElementById("ovPrimary");
const ovSecondary= document.getElementById("ovSecondary");
const soundToggle= document.getElementById("soundToggle");
const pauseBtn   = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const stageRegion= document.getElementById("stageRegion");
const stageWrap  = document.getElementById("stageWrap");

/* ---------- Constantes del mundo virtual ---------- */
const VW = 480;          // ancho virtual
const VH = 640;          // alto virtual
const WALL = 0;          // bordes del campo

const PADDLE_W = 92;
const PADDLE_WIDE = 150;
const PADDLE_H = 15;
const PADDLE_Y = VH - 46;
const PADDLE_KEY_SPEED = 620;     // px/s con teclado
const MAX_BOUNCE = (60 * Math.PI) / 180; // ángulo máx. de rebote en la pala

const BALL_R = 8;
const BASE_SPEED = 300;           // velocidad base de la bola (nivel 1)
const SPEED_PER_LEVEL = 22;       // incremento por nivel
const SPEED_RAMP = 6;             // incremento gradual por ladrillo roto
const MAX_BALLS = 8;
const SLOW_FACTOR = 0.62;
const TURBO_FACTOR = 1.6;       // Shift = turbo: multiplica la velocidad de la bola
const TURBO_SCORE_MULT = 2;     // y los puntos valen x2 mientras el turbo está activo

/* Power-ups */
const POWER_FALL = 165;           // px/s de caída
const POWER_SIZE = 26;
const WIDE_TIME = 12;             // s de pala ancha
const SLOW_TIME = 9;              // s de bola lenta
const LASER_TIME = 8;             // s de cañón láser
const CATCH_TIME = 11;            // s de pala pegajosa
const PIERCE_TIME = 7;            // s de bola perforante
const SHIELD_TIME = 10;           // s de escudo inferior
const LASER_INTERVAL = 0.42;      // s entre disparos automáticos
const LASER_SPEED = 540;          // px/s de los disparos
// Sin emojis: cada power-up se dibuja como icono vectorial (ver drawPowerIcon)
const POWER_STYLE = {
  MULTI:  { color: "#22d3ee" },
  WIDE:   { color: "#7c5cff" },
  SLOW:   { color: "#34d399" },
  LIFE:   { color: "#f472b6" },
  LASER:  { color: "#fb7185" },
  CATCH:  { color: "#38bdf8" },
  PIERCE: { color: "#fb923c" },
  SHIELD: { color: "#facc15" },
};
// Pesos para el sorteo de power-ups (los útiles/espectaculares más frecuentes,
// LIFE el más raro).
const POWER_WEIGHTS = [
  ["MULTI", 17], ["WIDE", 13], ["CATCH", 12], ["LASER", 12],
  ["SHIELD", 11], ["SLOW", 10], ["PIERCE", 9], ["LIFE", 6],
];
const POWER_TYPES = POWER_WEIGHTS.map((w) => w[0]);

/* ---------- Iconos SVG (sin emojis) ----------
   Marcas vectoriales para los overlays y el botón de sonido. */
const OV_ICONS = {
  start: `<svg width="54" height="54" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="9" width="16" height="9" rx="2" fill="#22d3ee"/>
      <rect x="26" y="9" width="16" height="9" rx="2" fill="#7c5cff"/>
      <rect x="6" y="22" width="16" height="9" rx="2" fill="#f472b6"/>
      <rect x="26" y="22" width="16" height="9" rx="2" fill="#34d399"/>
      <circle cx="24" cy="40" r="3.4" fill="#eef2ff"/></svg>`,
  sparkle: `<svg width="54" height="54" viewBox="0 0 48 48" fill="#22d3ee" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 5 L27.5 20.5 L43 24 L27.5 27.5 L24 43 L20.5 27.5 L5 24 L20.5 20.5 Z"/></svg>`,
  burst: `<svg width="54" height="54" viewBox="0 0 48 48" fill="none" stroke="#f472b6" stroke-width="3" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">
      <line x1="24" y1="7" x2="24" y2="17"/><line x1="24" y1="31" x2="24" y2="41"/>
      <line x1="7" y1="24" x2="17" y2="24"/><line x1="31" y1="24" x2="41" y2="24"/>
      <line x1="13" y1="13" x2="20" y2="20"/><line x1="28" y1="28" x2="35" y2="35"/>
      <line x1="35" y1="13" x2="28" y2="20"/><line x1="20" y1="28" x2="13" y2="35"/></svg>`,
  trophy: `<svg width="54" height="54" viewBox="0 0 48 48" fill="none" stroke="#fbbf24" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 9 H32 V19 a8 8 0 0 1 -16 0 Z"/>
      <path d="M16 12 H10 a4 4 0 0 0 7 7"/><path d="M32 12 H38 a4 4 0 0 1 -7 7"/>
      <line x1="24" y1="27" x2="24" y2="33"/><path d="M17 39 H31 L29 33 H19 Z"/></svg>`,
  pause: `<svg width="54" height="54" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="16" y="12" width="6" height="24" rx="2" fill="#9aa6cc"/>
      <rect x="26" y="12" width="6" height="24" rx="2" fill="#9aa6cc"/></svg>`,
};
const SOUND_ON_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 5 L6 9 H3 V15 H6 L11 19 Z" fill="currentColor" stroke="none"/>
    <path d="M16 9 a4 4 0 0 1 0 6"/><path d="M18.5 6.5 a8 8 0 0 1 0 11"/></svg>`;
const SOUND_OFF_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 5 L6 9 H3 V15 H6 L11 19 Z" fill="currentColor" stroke="none"/>
    <line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/></svg>`;

/* ---------- Diseño de niveles ----------
   '.' vacío · '#' 1 golpe · '=' 2 golpes · '@' 3 golpes ·
   'o' ladrillo "spawner" (1 golpe): al destruirlo suelta pelotas extra.
   El color del ladrillo lo da su fila (paleta neón); 'o' tiene color propio.
   12 niveles de dificultad creciente. */
const LEVELS = [
  [ // 1 · muro
    "#########",
    "#########",
    "#########",
  ],
  [ // 2 · pirámide
    "....#....",
    "...###...",
    "..#####..",
    ".#######.",
    "#########",
  ],
  [ // 3 · damero
    "#.#.#.#.#",
    ".#.#.#.#.",
    "#.#.#.#.#",
    ".#.#.#.#.",
    "#.#.#.#.#",
  ],
  [ // 4 · columnas con spawner
    "#.#.#.#.#",
    "#.#.#.#.#",
    "#.o.#.o.#",
    "#.#.#.#.#",
    "#.#.#.#.#",
  ],
  [ // 5 · franjas resistentes
    "=========",
    "#########",
    "=========",
    "#########",
    "=========",
  ],
  [ // 6 · núcleo de diamante
    "....@....",
    "...===...",
    "..=#o#=..",
    "...===...",
    "....@....",
  ],
  [ // 7 · zigzag
    "##.....##",
    ".##...##.",
    "..##.##..",
    "...###...",
    "..##o##..",
    ".##...##.",
    "##.....##",
  ],
  [ // 8 · fortaleza
    "@@@@@@@@@",
    "@#######@",
    "@#=====#@",
    "@#=o#o=#@",
    "@#=====#@",
    "@#######@",
    "@@@@@@@@@",
  ],
  [ // 9 · rejilla pesada con spawners
    "=========",
    "=o=o=o=o=",
    "=========",
    "=o=o=o=o=",
    "=========",
  ],
  [ // 10 · torres gemelas
    "@@@...@@@",
    "@#@...@#@",
    "@#@.o.@#@",
    "@#@...@#@",
    "@@@...@@@",
    "#########",
  ],
  [ // 11 · laberinto
    "@#=#@#=#@",
    "#.=.o.=.#",
    "=#@#=#@#=",
    "#.=.o.=.#",
    "@#=#@#=#@",
  ],
  [ // 12 · desafío final
    "@@@@@@@@@",
    "@=======@",
    "@=#o#o#=@",
    "@=#@@@#=@",
    "@=#o#o#=@",
    "@=======@",
    "@@@@@@@@@",
  ],
];

const ROW_COLORS = ["#22d3ee", "#7c5cff", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#f59e0b"];
const HITS_FOR = { "#": 1, "=": 2, "@": 3, "o": 1 };
const SPAWNER_COLOR = "#dbeafe";    // color propio del ladrillo spawner

/* Geometría de la rejilla de ladrillos */
const GRID_COLS = 9;
const GRID_TOP = 78;
const GRID_PAD = 22;
const GRID_GAP = 7;
const BRICK_W = (VW - 2 * GRID_PAD - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS;
const BRICK_H = 24;

/* ---------- Estado global ---------- */
const state = {
  mode: "start",        // start | serve | play | paused | levelclear | gameover | win
  level: 0,
  score: 0,
  lives: 3,
  best: 0,
  t: 0,                 // reloj de juego (s) — para temporizadores de power-ups
  ballSpeed: BASE_SPEED,
  paddle: { x: VW / 2, w: PADDLE_W, targetW: PADDLE_W },
  balls: [],
  bricks: [],
  powers: [],           // power-ups cayendo
  lasers: [],           // disparos del cañón láser
  wideUntil: 0,
  slowUntil: 0,
  slowActive: false,
  turbo: false,         // turbo con Shift: bola más rápida y x2 puntos
  laserUntil: 0,        // cañón láser activo hasta este tiempo
  lastLaserFire: 0,
  catchUntil: 0,        // pala pegajosa
  pierceUntil: 0,       // bola perforante (fireball)
  shieldUntil: 0,       // escudo inferior
  keyLeft: false,
  keyRight: false,
  pointerActive: false,
  soundOn: true,
  prevPause: null,      // modo previo al pausar
};

/* ---------- Utilidades ---------- */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const reduceMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* ============================================================
   Canvas: ajuste al viewport + HiDPI
   ============================================================ */
/* Dimensiona .stage-wrap para que el lienzo (proporción VW:VH = 3:4)
   quepa en el espacio disponible de .stage-region sin provocar scroll. */
function fitStage() {
  const availW = stageRegion.clientWidth;
  const availH = stageRegion.clientHeight;
  if (!availW || !availH) return;
  const ratio = VW / VH;               // 0.75 (más alto que ancho)
  let w = availH * ratio;
  let h = availH;
  if (w > availW) { w = availW; h = availW / ratio; }
  stageWrap.style.width = Math.round(w) + "px";
  stageWrap.style.height = Math.round(h) + "px";
  resizeCanvas();
}

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;

  for (const cv of [stage, fxCanvas]) {
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
  }
  // Transforma el contexto para dibujar en coordenadas virtuales (0..VW, 0..VH)
  const sx = (rect.width * dpr) / VW;
  const sy = (rect.height * dpr) / VH;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  render();
}

/* Convierte una coordenada X de pantalla a coordenada virtual */
function clientToWorldX(clientX) {
  const rect = stage.getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * VW;
}

/* ============================================================
   Construcción de nivel
   ============================================================ */
/* Sorteo ponderado del tipo de power-up */
function pickPowerType() {
  const total = POWER_WEIGHTS.reduce((s, w) => s + w[1], 0);
  let r = Math.random() * total;
  for (const [type, weight] of POWER_WEIGHTS) {
    r -= weight;
    if (r <= 0) return type;
  }
  return POWER_WEIGHTS[0][0];
}

function buildLevel(levelIdx) {
  const layout = LEVELS[levelIdx];
  state.bricks = [];

  layout.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      const hits = HITS_FOR[ch];
      if (!hits) continue;
      const spawner = ch === "o";
      state.bricks.push({
        x: GRID_PAD + c * (BRICK_W + GRID_GAP),
        y: GRID_TOP + r * (BRICK_H + GRID_GAP),
        w: BRICK_W,
        h: BRICK_H,
        hits,
        maxHits: hits,
        color: spawner ? SPAWNER_COLOR : ROW_COLORS[r % ROW_COLORS.length],
        phase: Math.random() * Math.PI * 2,  // desfase del "latido"
        alive: true,
        spawner,                              // suelta pelotas extra al destruirse
        power: null,
      });
    }
  });

  // Reparte power-ups entre ladrillos normales (los spawner ya tienen su rol)
  const pool = state.bricks.filter((b) => b.alive && !b.spawner);
  const count = Math.min(8, Math.max(4, Math.floor(pool.length * 0.18)));
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    pool.splice(idx, 1)[0].power = pickPowerType();
  }

  state.ballSpeed = BASE_SPEED + levelIdx * SPEED_PER_LEVEL;
}

/* ============================================================
   Pala y bolas
   ============================================================ */
function resetPaddle() {
  state.paddle.w = PADDLE_W;
  state.paddle.targetW = PADDLE_W;
  state.wideUntil = 0;
}

function newBall(stuck) {
  return {
    x: state.paddle.x,
    y: PADDLE_Y - PADDLE_H / 2 - BALL_R - 1,
    vx: 0,
    vy: 0,
    r: BALL_R,
    stuck: !!stuck,
    trail: [],
  };
}

function currentSpeed() {
  return state.ballSpeed * (state.slowActive ? SLOW_FACTOR : 1) * (state.turbo ? TURBO_FACTOR : 1);
}

/* Renormaliza la velocidad de todas las bolas a la velocidad actual */
function rescaleBalls() {
  const target = currentSpeed();
  for (const b of state.balls) {
    if (b.stuck) continue;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    b.vx = (b.vx / sp) * target;
    b.vy = (b.vy / sp) * target;
  }
}

function launchBall() {
  let launched = false;
  const half = state.paddle.w / 2;
  for (const b of state.balls) {
    if (b.stuck) {
      // Si la bola venía pegada por CATCH, se lanza según su posición en la
      // pala (control de ángulo); si no, con un ángulo aleatorio suave.
      const angle = typeof b.catchOffset === "number"
        ? clamp(b.catchOffset / half, -1, 1) * MAX_BOUNCE
        : rand(-0.35, 0.35);
      const sp = currentSpeed();
      b.vx = Math.sin(angle) * sp;
      b.vy = -Math.cos(angle) * sp;
      b.stuck = false;
      b.catchOffset = undefined;
      launched = true;
    }
  }
  if (launched) { state.mode = "play"; beep(560, 0.07, "triangle", 0.05); }
}

/* SPAWNER: el ladrillo 'o' suelta pelotas extra hacia abajo al destruirse */
function spawnBonusBalls(x, y, n) {
  for (let i = 0; i < n; i++) {
    if (state.balls.length >= MAX_BALLS) break;
    const ang = rand(Math.PI * 0.25, Math.PI * 0.75); // cono hacia abajo
    const sp = currentSpeed();
    state.balls.push({
      x, y, r: BALL_R, stuck: false, trail: [],
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
    });
  }
}

/* MULTIBOLA: duplica las bolas activas con ángulos divergentes */
function spawnMultiball() {
  const active = state.balls.filter((b) => !b.stuck);
  const seed = active.length ? active : state.balls;
  if (!seed.length) return;
  const extra = [];
  for (const b of seed) {
    for (const spread of [-0.45, 0.45]) {
      if (state.balls.length + extra.length >= MAX_BALLS) break;
      const sp = Math.hypot(b.vx, b.vy) || currentSpeed();
      const ang = Math.atan2(b.vy, b.vx) + spread;
      extra.push({
        x: b.x, y: b.y, r: BALL_R, stuck: false, trail: [],
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      });
    }
  }
  state.balls.push(...extra);
}

/* ============================================================
   Power-ups
   ============================================================ */
function dropPower(type, x, y) {
  state.powers.push({ type, x, y, w: POWER_SIZE, h: POWER_SIZE, vy: POWER_FALL });
}

function applyPower(type) {
  switch (type) {
    case "MULTI":
      spawnMultiball();
      beep(720, 0.1, "square", 0.04);
      break;
    case "WIDE":
      state.paddle.targetW = PADDLE_WIDE;
      state.wideUntil = state.t + WIDE_TIME;
      beep(480, 0.12, "sawtooth", 0.04);
      break;
    case "SLOW":
      state.slowUntil = state.t + SLOW_TIME;
      beep(360, 0.14, "sine", 0.05);
      break;
    case "LIFE":
      state.lives++;
      updateHud();
      beep(880, 0.16, "sine", 0.06);
      break;
    case "LASER":
      state.laserUntil = state.t + LASER_TIME;
      state.lastLaserFire = state.t - LASER_INTERVAL; // dispara enseguida
      beep(620, 0.1, "square", 0.04);
      break;
    case "CATCH":
      state.catchUntil = state.t + CATCH_TIME;
      beep(420, 0.12, "triangle", 0.05);
      break;
    case "PIERCE":
      state.pierceUntil = state.t + PIERCE_TIME;
      beep(540, 0.12, "sawtooth", 0.05);
      break;
    case "SHIELD":
      state.shieldUntil = state.t + SHIELD_TIME;
      beep(300, 0.16, "sine", 0.05);
      break;
  }
}

/* Limpia todos los efectos temporales (al perder vida o cambiar de nivel) */
function clearTimedPowers() {
  state.wideUntil = 0;
  state.slowUntil = 0;
  state.slowActive = false;
  state.laserUntil = 0;
  state.catchUntil = 0;
  state.pierceUntil = 0;
  state.shieldUntil = 0;
  state.lasers = [];
}

/* ============================================================
   Bucle principal
   ============================================================ */
let lastTs = 0;
function loop(ts) {
  const dt = Math.min(0.034, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (state.mode === "play" || state.mode === "serve") update(dt);
  stepParticles(dt);     // las partículas de impacto siguen su curso siempre
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  state.t += dt;

  // Temporizadores de power-ups
  if (state.wideUntil && state.t > state.wideUntil) {
    state.paddle.targetW = PADDLE_W;
    state.wideUntil = 0;
  }
  const slow = state.t < state.slowUntil;
  if (slow !== state.slowActive) { state.slowActive = slow; rescaleBalls(); }

  // Ancho de pala con interpolación suave
  state.paddle.w += (state.paddle.targetW - state.paddle.w) * Math.min(1, dt * 12);

  // Movimiento de pala con teclado
  let dir = 0;
  if (state.keyLeft) dir -= 1;
  if (state.keyRight) dir += 1;
  if (dir) state.paddle.x += dir * PADDLE_KEY_SPEED * dt;
  const half = state.paddle.w / 2;
  state.paddle.x = clamp(state.paddle.x, half, VW - half);

  // Bolas pegadas siguen la pala (con offset si fueron atrapadas por CATCH)
  for (const b of state.balls) {
    if (!b.stuck) continue;
    const off = typeof b.catchOffset === "number" ? b.catchOffset : 0;
    b.x = clamp(state.paddle.x + off, half, VW - half);
    b.y = PADDLE_Y - PADDLE_H / 2 - b.r - 1;
  }

  if (state.mode === "play") {
    // Subpasos para evitar atravesar ladrillos a alta velocidad
    const sp = currentSpeed();
    const steps = clamp(Math.ceil((sp * dt) / (BRICK_H / 2)), 1, 8);
    const sub = dt / steps;
    for (let s = 0; s < steps; s++) moveBalls(sub);

    // Estela
    for (const b of state.balls) {
      if (b.stuck) continue;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 10) b.trail.shift();
    }

    // Cañón láser: dispara solo mientras está activo
    if (state.t < state.laserUntil && state.t - state.lastLaserFire >= LASER_INTERVAL) {
      fireLaser();
      state.lastLaserFire = state.t;
    }
    moveLasers(dt);
    movePowers(dt);

    if (!state.bricks.some((b) => b.alive)) { onLevelClear(); return; }
    if (!state.balls.length) onBallLost();
  }
}

function moveBalls(dt) {
  const half = state.paddle.w / 2;
  for (let i = state.balls.length - 1; i >= 0; i--) {
    const b = state.balls[i];
    if (b.stuck) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Paredes laterales y techo
    if (b.x - b.r < WALL) { b.x = WALL + b.r; b.vx = Math.abs(b.vx); wallBeep(); }
    else if (b.x + b.r > VW) { b.x = VW - b.r; b.vx = -Math.abs(b.vx); wallBeep(); }
    if (b.y - b.r < WALL) { b.y = WALL + b.r; b.vy = Math.abs(b.vy); wallBeep(); }

    // Escudo inferior: rebota en el fondo en vez de perder la bola
    if (state.t < state.shieldUntil && b.vy > 0 && b.y + b.r >= VH - 4) {
      b.y = VH - 4 - b.r;
      b.vy = -Math.abs(b.vy);
      shieldBeep();
    }

    // Suelo → bola perdida
    if (b.y - b.r > VH) { state.balls.splice(i, 1); continue; }

    // Pala (solo si baja)
    const p = state.paddle;
    const pTop = PADDLE_Y - PADDLE_H / 2;
    const prevBottom = (b.y - b.vy * dt) + b.r; // borde inferior en el frame previo
    // Solo cuenta como golpe a la pala si la bola venía desde ARRIBA (cruzó pTop este frame),
    // así una bola que entra por el costado no se "pega" rebotando hacia arriba.
    if (b.vy > 0 && prevBottom <= pTop && b.y + b.r >= pTop &&
        b.x >= p.x - half - b.r && b.x <= p.x + half + b.r) {
      if (state.t < state.catchUntil) {
        // CATCH: la bola se queda pegada hasta que el jugador la relanza
        b.stuck = true;
        b.vx = 0; b.vy = 0;
        b.catchOffset = clamp(b.x - p.x, -half + 8, half - 8);
        b.y = pTop - b.r - 0.1;
        catchBeep();
      } else {
        const rel = clamp((b.x - p.x) / (half + b.r), -1, 1);
        const angle = rel * MAX_BOUNCE;
        const sp = currentSpeed();
        b.vx = Math.sin(angle) * sp;
        b.vy = -Math.cos(angle) * sp;
        b.y = pTop - b.r - 0.1;
        paddleBeep();
      }
      if (navigator.vibrate) navigator.vibrate(6);
    }

    // Ladrillos (un impacto por subpaso)
    hitBricks(b);
  }
}

/* Colisión bola-ladrillo por mínima penetración (rebote correcto por lado).
   Con PIERCE activo la bola atraviesa los ladrillos sin rebotar. */
function hitBricks(b) {
  const pierce = state.t < state.pierceUntil;
  for (const br of state.bricks) {
    if (!br.alive) continue;
    if (b.x + b.r < br.x || b.x - b.r > br.x + br.w ||
        b.y + b.r < br.y || b.y - b.r > br.y + br.h) continue;

    // Punto más cercano del ladrillo a la bola
    const cx = clamp(b.x, br.x, br.x + br.w);
    const cy = clamp(b.y, br.y, br.y + br.h);
    const dx = b.x - cx, dy = b.y - cy;
    if (dx * dx + dy * dy > b.r * b.r) continue;

    if (pierce) {
      // Atraviesa: daña y sigue (puede destruir varios en una pasada)
      damageBrick(br);
      continue;
    }

    // Penetraciones por cada lado → resolver por el eje de menor solape
    const overL = b.x + b.r - br.x;
    const overR = br.x + br.w - (b.x - b.r);
    const overT = b.y + b.r - br.y;
    const overB = br.y + br.h - (b.y - b.r);
    const minX = Math.min(overL, overR);
    const minY = Math.min(overT, overB);

    if (minX < minY) {
      b.vx = -b.vx;
      b.x += overL < overR ? -minX : minX;
    } else {
      b.vy = -b.vy;
      b.y += overT < overB ? -minY : minY;
    }

    damageBrick(br);
    return; // un solo ladrillo por subpaso
  }
}

function damageBrick(br) {
  br.hits--;
  const mult = state.turbo ? TURBO_SCORE_MULT : 1;
  state.score += 5 * mult;
  if (br.hits <= 0) {
    br.alive = false;
    state.score += 25 * mult;
    state.ballSpeed += SPEED_RAMP;          // la bola acelera al destruir
    if (br.power) dropPower(br.power, br.x + br.w / 2, br.y + br.h / 2);
    if (br.spawner) spawnBonusBalls(br.x + br.w / 2, br.y + br.h / 2, 2);
    burst(br.x + br.w / 2, br.y + br.h / 2, br.color);
    breakBeep();
    if (navigator.vibrate) navigator.vibrate(10);
  } else {
    crackBeep();
  }
  updateHud();
}

/* ---------- Cañón láser ---------- */
function fireLaser() {
  const p = state.paddle;
  const half = p.w / 2;
  const y = PADDLE_Y - PADDLE_H / 2;
  state.lasers.push({ x: p.x - half + 7, y }, { x: p.x + half - 7, y });
  laserBeep();
}
function moveLasers(dt) {
  for (let i = state.lasers.length - 1; i >= 0; i--) {
    const L = state.lasers[i];
    L.y -= LASER_SPEED * dt;
    if (L.y < 0) { state.lasers.splice(i, 1); continue; }
    // Impacto con el primer ladrillo que toca
    for (const br of state.bricks) {
      if (!br.alive) continue;
      if (L.x >= br.x && L.x <= br.x + br.w && L.y <= br.y + br.h && L.y >= br.y) {
        damageBrick(br);
        state.lasers.splice(i, 1);
        break;
      }
    }
  }
}

function movePowers(dt) {
  const p = state.paddle;
  const half = p.w / 2;
  const pTop = PADDLE_Y - PADDLE_H / 2;
  for (let i = state.powers.length - 1; i >= 0; i--) {
    const pw = state.powers[i];
    pw.y += pw.vy * dt;
    // ¿Atrapado por la pala?
    if (pw.y + pw.h / 2 >= pTop && pw.y - pw.h / 2 <= PADDLE_Y + PADDLE_H / 2 &&
        pw.x >= p.x - half && pw.x <= p.x + half) {
      applyPower(pw.type);
      burst(pw.x, pw.y, POWER_STYLE[pw.type].color);
      state.powers.splice(i, 1);
      continue;
    }
    if (pw.y - pw.h / 2 > VH) state.powers.splice(i, 1);
  }
}

/* ============================================================
   Eventos del juego: bola perdida / nivel / fin
   ============================================================ */
function onBallLost() {
  state.lives--;
  updateHud();
  state.powers = [];
  clearTimedPowers();
  resetPaddle();
  if (state.lives <= 0) { onGameOver(); return; }
  // Sirve una nueva bola
  state.balls = [newBall(true)];
  state.mode = "serve";
  loseBeep();
}

function onLevelClear() {
  state.powers = [];
  if (state.level >= LEVELS.length - 1) { onWin(); return; }
  state.mode = "levelclear";
  celebrate();
  winBeep();
  showOverlay({
    icon: "sparkle",
    title: `Level ${state.level + 1} cleared`,
    text: `Score ${state.score}. Get ready for the next wave.`,
    primary: { label: "Next level", onClick: () => startLevel(state.level + 1) },
  });
}

function onGameOver() {
  state.mode = "gameover";
  saveBest();
  showOverlay({
    icon: "burst",
    title: "Game over",
    text: `You scored ${state.score}. Best ${state.best}.`,
    primary: { label: "Play again", onClick: () => startGame() },
  });
}

function onWin() {
  state.mode = "win";
  saveBest();
  celebrate();
  winBeep();
  showOverlay({
    icon: "trophy",
    title: "You broke them all!",
    text: `Final score ${state.score}. Best ${state.best}.`,
    primary: { label: "Play again", onClick: () => startGame() },
  });
}

/* ============================================================
   Flujo de partida
   ============================================================ */
function startLevel(levelIdx) {
  state.level = levelIdx;
  buildLevel(levelIdx);
  resetPaddle();
  state.powers = [];
  clearTimedPowers();
  state.balls = [newBall(true)];
  state.mode = "serve";
  hideOverlay();
  updateHud();
}

function startGame() {
  state.score = 0;
  state.lives = 3;
  startLevel(0);
}

function restart() {
  if (state.mode === "start") return;
  startGame();
}

/* ============================================================
   Pausa
   ============================================================ */
function togglePause() {
  if (state.mode === "play" || state.mode === "serve") {
    state.prevPause = state.mode;
    state.mode = "paused";
    pauseBtn.textContent = "Resume";
    showOverlay({
      icon: "pause",
      title: "Paused",
      text: "Take a breath. The bricks aren't going anywhere.",
      primary: { label: "Resume", onClick: resumeFromPause },
    });
  } else if (state.mode === "paused") {
    resumeFromPause();
  }
}
function resumeFromPause() {
  if (state.mode !== "paused") return;
  state.mode = state.prevPause || "serve";
  pauseBtn.textContent = "Pause";
  hideOverlay();
}

/* ============================================================
   HUD / best (localStorage)
   ============================================================ */
function updateHud() {
  scoreEl.textContent = state.score;
  // Vidas como número (sin corazones / emojis)
  livesEl.textContent = Math.max(state.lives, 0);
  levelEl.textContent = state.level + 1;
  bestEl.textContent = Math.max(state.best, state.score);
}

function loadBest() {
  state.best = Number(localStorage.getItem("neonbreaker.best") || 0);
  bestEl.textContent = state.best;
}
function saveBest() {
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem("neonbreaker.best", String(state.best));
  }
  bestEl.textContent = state.best;
}

/* ============================================================
   Overlays
   ============================================================ */
function showOverlay({ icon, title, text, primary, secondary }) {
  ovIcon.innerHTML = OV_ICONS[icon] || "";
  ovTitle.textContent = title;
  ovText.textContent = text;
  ovPrimary.textContent = primary.label;
  ovPrimary.onclick = primary.onClick;
  if (secondary) {
    ovSecondary.hidden = false;
    ovSecondary.textContent = secondary.label;
    ovSecondary.onclick = secondary.onClick;
  } else {
    ovSecondary.hidden = true;
    ovSecondary.onclick = null;
  }
  overlay.hidden = false;
}
function hideOverlay() { overlay.hidden = true; }

/* ============================================================
   Render (todo en coordenadas virtuales)
   ============================================================ */
function render() {
  ctx.clearRect(0, 0, VW, VH);

  drawBricks();
  drawPowers();
  drawParticles();
  drawLasers();
  drawShield();
  drawPaddle();
  drawBalls();

  if (state.turbo && (state.mode === "play" || state.mode === "serve")) drawTurboBadge();
  if (state.mode === "serve") drawServeHint();
}

/* Indicador en pantalla del turbo (Shift): bola más rápida y x2 puntos */
function drawTurboBadge() {
  ctx.save();
  ctx.font = "700 15px 'Space Grotesk', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#22d3ee";
  ctx.fillText("TURBO  x2", VW / 2, 8);
  ctx.restore();
}

function drawBricks() {
  const pulse = Math.sin(state.t * 2.2);
  for (const br of state.bricks) {
    if (!br.alive) continue;
    const glow = 8 + (Math.sin(state.t * 2.4 + br.phase) * 0.5 + 0.5) * 10;
    const strength = br.hits / br.maxHits;        // ladrillo más "vivo" = más brillante
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * strength;
    ctx.shadowColor = br.color;
    ctx.shadowBlur = glow;
    ctx.fillStyle = br.color;
    roundRect(ctx, br.x, br.y, br.w, br.h, 6);
    ctx.fill();
    // brillo superior
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.18 + 0.12 * (pulse * 0.5 + 0.5);
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, br.x + 3, br.y + 3, br.w - 6, br.h * 0.32, 4);
    ctx.fill();
    // marcas de daño (ladrillos resistentes)
    if (br.maxHits > 1) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(11,16,32,0.85)";
      ctx.font = "700 11px 'Space Grotesk', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(br.hits), br.x + br.w / 2, br.y + br.h / 2 + 1);
    }
    // indicador del ladrillo spawner: anillo + punto (suelta pelotas)
    if (br.spawner) {
      const cxp = br.x + br.w / 2, cyp = br.y + br.h / 2;
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "#0b1020";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cxp, cyp, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#0b1020";
      ctx.beginPath();
      ctx.arc(cxp, cyp, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawPaddle() {
  const p = state.paddle;
  const half = p.w / 2;
  const x = p.x - half, y = PADDLE_Y - PADDLE_H / 2;
  ctx.save();
  ctx.shadowColor = state.wideUntil ? "#7c5cff" : "#22d3ee";
  ctx.shadowBlur = 18;
  const grad = ctx.createLinearGradient(x, 0, x + p.w, 0);
  grad.addColorStop(0, "#22d3ee");
  grad.addColorStop(1, "#7c5cff");
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, p.w, PADDLE_H, PADDLE_H / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x + 4, y + 2, p.w - 8, PADDLE_H * 0.4, 4);
  ctx.fill();
  // cañones cuando el láser está activo
  if (state.t < state.laserUntil) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fb7185";
    ctx.shadowColor = "#fb7185";
    ctx.shadowBlur = 10;
    roundRect(ctx, x + 4, y - 5, 5, 6, 1.5);
    ctx.fill();
    roundRect(ctx, x + p.w - 9, y - 5, 5, 6, 1.5);
    ctx.fill();
  }
  ctx.restore();
}

function drawBalls() {
  // Con PIERCE activo la bola es un "fireball" naranja
  const pierce = state.t < state.pierceUntil;
  const trailColor = pierce ? "#fb923c" : "#22d3ee";
  const coreColor = pierce ? "#fff7ed" : "#eef2ff";
  for (const b of state.balls) {
    // Estela neón
    if (!reduceMotion()) {
      for (let i = 0; i < b.trail.length; i++) {
        const tp = b.trail[i];
        const k = (i + 1) / b.trail.length;
        ctx.save();
        ctx.globalAlpha = 0.05 + k * 0.28;
        ctx.fillStyle = trailColor;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, b.r * (0.35 + k * 0.65), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.shadowColor = trailColor;
    ctx.shadowBlur = pierce ? 24 : 18;
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* Disparos del cañón láser */
function drawLasers() {
  if (!state.lasers.length) return;
  ctx.save();
  ctx.shadowColor = "#fb7185";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#fb7185";
  for (const L of state.lasers) {
    roundRect(ctx, L.x - 1.6, L.y - 14, 3.2, 14, 1.6);
    ctx.fill();
  }
  ctx.restore();
}

/* Escudo inferior: barra neón que rebota la bola */
function drawShield() {
  if (state.t >= state.shieldUntil) return;
  // parpadea en los últimos 2 s para avisar de su fin
  const remain = state.shieldUntil - state.t;
  if (remain < 2 && Math.sin(state.t * 18) < 0) return;
  ctx.save();
  ctx.shadowColor = "#facc15";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "rgba(250, 204, 21, 0.85)";
  roundRect(ctx, 4, VH - 6, VW - 8, 4, 2);
  ctx.fill();
  ctx.restore();
}

function drawPowers() {
  for (const pw of state.powers) {
    const st = POWER_STYLE[pw.type];
    const wob = Math.sin(state.t * 6 + pw.x) * 2;
    ctx.save();
    ctx.translate(pw.x, pw.y + wob);
    ctx.shadowColor = st.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(11,16,32,0.85)";
    roundRect(ctx, -pw.w / 2, -pw.h / 2, pw.w, pw.h, 8);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = st.color;
    roundRect(ctx, -pw.w / 2, -pw.h / 2, pw.w, pw.h, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;
    drawPowerIcon(ctx, pw.type, st.color);
    ctx.restore();
  }
}

/* Icono vectorial del power-up (sin emojis), centrado en (0,0) */
function drawPowerIcon(c, type, color) {
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 2.2;
  c.lineCap = "round";
  c.lineJoin = "round";
  if (type === "MULTI") {
    // tres bolas
    for (const [dx, dy] of [[0, -4], [-4, 3], [4, 3]]) {
      c.beginPath();
      c.arc(dx, dy, 2.6, 0, Math.PI * 2);
      c.fill();
    }
  } else if (type === "WIDE") {
    // flecha doble horizontal
    c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.stroke();
    c.beginPath();
    c.moveTo(-7, 0); c.lineTo(-3.5, -3.2); c.moveTo(-7, 0); c.lineTo(-3.5, 3.2);
    c.moveTo(7, 0); c.lineTo(3.5, -3.2); c.moveTo(7, 0); c.lineTo(3.5, 3.2);
    c.stroke();
  } else if (type === "SLOW") {
    // onda
    c.beginPath();
    c.moveTo(-7, 0);
    c.quadraticCurveTo(-3.5, -6, 0, 0);
    c.quadraticCurveTo(3.5, 6, 7, 0);
    c.stroke();
  } else if (type === "LIFE") {
    // cruz (salud / vida extra)
    c.beginPath();
    c.moveTo(0, -6); c.lineTo(0, 6);
    c.moveTo(-6, 0); c.lineTo(6, 0);
    c.stroke();
  } else if (type === "LASER") {
    // flecha hacia arriba (disparo)
    c.beginPath();
    c.moveTo(0, 6); c.lineTo(0, -6);
    c.moveTo(0, -6); c.lineTo(-3.5, -2.5); c.moveTo(0, -6); c.lineTo(3.5, -2.5);
    c.stroke();
  } else if (type === "CATCH") {
    // cuenco (atrapa la bola)
    c.beginPath();
    c.arc(0, 0, 6, 0, Math.PI, false);   // semicírculo abierto hacia arriba
    c.stroke();
    c.beginPath();
    c.arc(0, -4, 2, 0, Math.PI * 2);      // la bola
    c.fill();
  } else if (type === "PIERCE") {
    // llama (fireball)
    c.beginPath();
    c.moveTo(0, -7);
    c.quadraticCurveTo(5, -1, 2, 4);
    c.quadraticCurveTo(0, 7, -2, 4);
    c.quadraticCurveTo(-5, -1, 0, -7);
    c.fill();
  } else if (type === "SHIELD") {
    // escudo
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(6, -4);
    c.lineTo(6, 2);
    c.quadraticCurveTo(6, 6, 0, 8);
    c.quadraticCurveTo(-6, 6, -6, 2);
    c.lineTo(-6, -4);
    c.closePath();
    c.stroke();
  }
}

function drawServeHint() {
  ctx.save();
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(state.t * 4);
  ctx.fillStyle = "#9aa6cc";
  ctx.font = "600 16px 'Sora', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Tap or press Space to launch", VW / 2, VH * 0.62);
  ctx.restore();
}

/* ============================================================
   Partículas de impacto (en el lienzo principal)
   ============================================================ */
const particles = [];
function burst(x, y, color) {
  if (reduceMotion()) return;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + rand(-0.3, 0.3);
    const sp = rand(60, 180);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, size: rand(2, 4) });
  }
}
function stepParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * 2.2;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += 240 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ============================================================
   Confeti de celebración (canvas fx, encima del overlay)
   ============================================================ */
function celebrate() {
  if (reduceMotion()) return;
  const fctx = fxCanvas.getContext("2d");
  const rect = fxCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  fxCanvas.width = rect.width * dpr;
  fxCanvas.height = rect.height * dpr;
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  const colors = ["#7c5cff", "#22d3ee", "#f472b6", "#34d399", "#fbbf24"];
  const parts = Array.from({ length: 110 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 120,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -9 - 3,
    size: Math.random() * 6 + 4,
    color: colors[(Math.random() * colors.length) | 0],
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
  }));
  let frames = 0;
  (function tick() {
    fctx.clearRect(0, 0, W, H);
    frames++;
    let alive = false;
    for (const p of parts) {
      p.vy += 0.32;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y < H + 20) alive = true;
      fctx.save();
      fctx.translate(p.x, p.y);
      fctx.rotate(p.rot);
      fctx.fillStyle = p.color;
      fctx.globalAlpha = Math.max(0, 1 - frames / 140);
      fctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      fctx.restore();
    }
    if (alive && frames < 150) requestAnimationFrame(tick);
    else fctx.clearRect(0, 0, W, H);
  })();
}

/* ============================================================
   Audio (WebAudio, sin archivos)
   ============================================================ */
let audioCtx = null;
function audio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function beep(freq, dur = 0.08, type = "sine", gain = 0.05) {
  if (!state.soundOn) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}
const paddleBeep = () => beep(440, 0.06, "triangle", 0.05);
const breakBeep  = () => beep(660, 0.06, "square", 0.035);
const crackBeep  = () => beep(300, 0.05, "sawtooth", 0.03);
const wallBeep   = () => beep(240, 0.04, "sine", 0.025);
const loseBeep   = () => beep(160, 0.25, "sine", 0.06);
const catchBeep  = () => beep(520, 0.05, "sine", 0.04);
const shieldBeep = () => beep(360, 0.06, "triangle", 0.04);
const laserBeep  = () => beep(880, 0.03, "square", 0.02);
function winBeep() {
  if (!state.soundOn) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    setTimeout(() => beep(f, 0.2, "sine", 0.06), i * 110));
}

function loadSoundPref() {
  state.soundOn = localStorage.getItem("neonbreaker.sound") !== "off";
  reflectSoundUI();
}
function reflectSoundUI() {
  soundToggle.innerHTML = state.soundOn ? SOUND_ON_SVG : SOUND_OFF_SVG;
  soundToggle.classList.toggle("is-muted", !state.soundOn);
  soundToggle.setAttribute("aria-pressed", String(state.soundOn));
}
function toggleSound() {
  state.soundOn = !state.soundOn;
  localStorage.setItem("neonbreaker.sound", state.soundOn ? "on" : "off");
  reflectSoundUI();
  if (state.soundOn) beep(660, 0.1, "sine", 0.05);
}

/* ============================================================
   Entrada: ratón, táctil, teclado
   ============================================================ */
function pointerMove(clientX) {
  if (state.mode === "paused" || state.mode === "start") return;
  const x = clientToWorldX(clientX);
  const half = state.paddle.w / 2;
  state.paddle.x = clamp(x, half, VW - half);
}

stage.addEventListener("mousemove", (e) => { state.pointerActive = true; pointerMove(e.clientX); });
stage.addEventListener("mousedown", (e) => { e.preventDefault(); resumeAudio(); onPrimaryAction(); });

stage.addEventListener("touchstart", (e) => {
  e.preventDefault();
  resumeAudio();
  if (e.touches[0]) pointerMove(e.touches[0].clientX);
  onPrimaryAction();
}, { passive: false });
stage.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (e.touches[0]) pointerMove(e.touches[0].clientX);
}, { passive: false });

/* Acción principal: lanzar bola al servir o soltar la bola atrapada por CATCH */
function onPrimaryAction() {
  if (state.mode === "serve") launchBall();
  else if (state.mode === "play" && state.balls.some((b) => b.stuck)) launchBall();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { state.keyLeft = true; }
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { state.keyRight = true; }
  else if (e.key === " " || e.key === "Spacebar") {
    e.preventDefault();
    resumeAudio();
    if (state.mode === "serve") launchBall();
    else if (state.mode === "start") startGame();
    else if (state.mode === "play") {
      // Si hay una bola pegada (CATCH) se lanza; si no, pausa
      if (state.balls.some((b) => b.stuck)) launchBall();
      else togglePause();
    } else if (state.mode === "paused") togglePause();
  } else if (e.key === "p" || e.key === "P") {
    togglePause();
  } else if (e.key === "Shift") {
    // Turbo: mantén Shift para que la bola vaya más rápida (y dé x2 puntos).
    if (!state.turbo) { state.turbo = true; rescaleBalls(); }
  }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") state.keyLeft = false;
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") state.keyRight = false;
  else if (e.key === "Shift") { state.turbo = false; rescaleBalls(); }
});
// Al perder el foco, suelta teclas y turbo para que no queden "pegados".
window.addEventListener("blur", () => {
  state.keyLeft = false;
  state.keyRight = false;
  if (state.turbo) { state.turbo = false; rescaleBalls(); }
});

function resumeAudio() {
  const c = audio();
  if (c && c.state === "suspended") c.resume();
}

/* ---------- Botones ---------- */
ovPrimary.addEventListener("click", resumeAudio);
soundToggle.addEventListener("click", toggleSound);
pauseBtn.addEventListener("click", togglePause);
restartBtn.addEventListener("click", restart);

/* Auto-pausa al ocultar la pestaña */
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.mode === "play") togglePause();
});

window.addEventListener("resize", fitStage);
window.addEventListener("orientationchange", fitStage);
if (window.ResizeObserver) {
  // Observa la región (no el lienzo) para evitar bucles de medición
  new ResizeObserver(fitStage).observe(stageRegion);
}

/* ============================================================
   Arranque
   ============================================================ */
function init() {
  loadSoundPref();
  loadBest();
  buildLevel(0);            // muestra un tablero de fondo bajo el overlay inicial
  state.balls = [newBall(true)];
  updateHud();
  fitStage();
  showOverlay({
    icon: "start",
    title: "Neon Breaker",
    text: "Bounce the ball, smash every brick and catch power-ups. Move with mouse, touch or ← →.",
    primary: { label: "Play", onClick: () => { resumeAudio(); startGame(); } },
  });
  requestAnimationFrame((ts) => { lastTs = ts; loop(ts); });
}
init();
