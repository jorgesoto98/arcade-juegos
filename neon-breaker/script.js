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
const ovEmoji    = document.getElementById("ovEmoji");
const ovTitle    = document.getElementById("ovTitle");
const ovText     = document.getElementById("ovText");
const ovPrimary  = document.getElementById("ovPrimary");
const ovSecondary= document.getElementById("ovSecondary");
const soundToggle= document.getElementById("soundToggle");
const pauseBtn   = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");

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
const SPEED_PER_LEVEL = 26;       // incremento por nivel
const SPEED_RAMP = 7;             // incremento gradual por ladrillo roto
const MAX_BALLS = 6;
const SLOW_FACTOR = 0.62;

/* Power-ups */
const POWER_FALL = 165;           // px/s de caída
const POWER_SIZE = 26;
const WIDE_TIME = 12;             // s de pala ancha
const SLOW_TIME = 9;              // s de bola lenta
const POWER_TYPES = ["MULTI", "WIDE", "SLOW", "LIFE"];
const POWER_STYLE = {
  MULTI: { color: "#22d3ee", glyph: "✦" },
  WIDE:  { color: "#7c5cff", glyph: "↔" },
  SLOW:  { color: "#34d399", glyph: "≈" },
  LIFE:  { color: "#f472b6", glyph: "♥" },
};

/* ---------- Diseño de niveles ----------
   '.' vacío · '#' 1 golpe · '=' 2 golpes · '@' 3 golpes.
   El color del ladrillo lo da su fila (paleta neón). */
const LEVELS = [
  [ // 1 · muro
    "#########",
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
  [ // 4 · núcleo resistente
    "....@....",
    "...@@@...",
    "..@===@..",
    "...@@@...",
    "....@....",
  ],
  [ // 5 · fortaleza
    "@@@@@@@@@",
    "@#######@",
    "@#=====#@",
    "@#######@",
    "@@@@@@@@@",
  ],
];

const ROW_COLORS = ["#22d3ee", "#7c5cff", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#f59e0b"];
const HITS_FOR = { "#": 1, "=": 2, "@": 3 };

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
  wideUntil: 0,
  slowUntil: 0,
  slowActive: false,
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
   Canvas: escalado responsive + HiDPI
   ============================================================ */
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
function buildLevel(levelIdx) {
  const layout = LEVELS[levelIdx];
  state.bricks = [];

  layout.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      const hits = HITS_FOR[ch];
      if (!hits) continue;
      state.bricks.push({
        x: GRID_PAD + c * (BRICK_W + GRID_GAP),
        y: GRID_TOP + r * (BRICK_H + GRID_GAP),
        w: BRICK_W,
        h: BRICK_H,
        hits,
        maxHits: hits,
        color: ROW_COLORS[r % ROW_COLORS.length],
        phase: Math.random() * Math.PI * 2,  // desfase del "latido"
        alive: true,
        power: null,
      });
    }
  });

  // Reparte power-ups entre algunos ladrillos al azar
  const alive = state.bricks.filter((b) => b.alive);
  const count = Math.min(6, Math.max(3, Math.floor(alive.length * 0.16)));
  const pool = [...alive];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const brick = pool.splice(idx, 1)[0];
    // MULTI aparece más; LIFE es raro
    const roll = Math.random();
    brick.power = roll < 0.42 ? "MULTI" : roll < 0.68 ? "WIDE" : roll < 0.9 ? "SLOW" : "LIFE";
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
  return state.ballSpeed * (state.slowActive ? SLOW_FACTOR : 1);
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
  for (const b of state.balls) {
    if (b.stuck) {
      const angle = rand(-0.35, 0.35);
      const sp = currentSpeed();
      b.vx = Math.sin(angle) * sp;
      b.vy = -Math.cos(angle) * sp;
      b.stuck = false;
      launched = true;
    }
  }
  if (launched) { state.mode = "play"; beep(560, 0.07, "triangle", 0.05); }
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
  }
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

  // Bolas pegadas siguen la pala
  for (const b of state.balls) {
    if (b.stuck) { b.x = state.paddle.x; b.y = PADDLE_Y - PADDLE_H / 2 - b.r - 1; }
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
      const rel = clamp((b.x - p.x) / (half + b.r), -1, 1);
      const angle = rel * MAX_BOUNCE;
      const sp = currentSpeed();
      b.vx = Math.sin(angle) * sp;
      b.vy = -Math.cos(angle) * sp;
      b.y = pTop - b.r - 0.1;
      paddleBeep();
      if (navigator.vibrate) navigator.vibrate(6);
    }

    // Ladrillos (un impacto por subpaso)
    hitBricks(b);
  }
}

/* Colisión bola-ladrillo por mínima penetración (rebote correcto por lado) */
function hitBricks(b) {
  for (const br of state.bricks) {
    if (!br.alive) continue;
    if (b.x + b.r < br.x || b.x - b.r > br.x + br.w ||
        b.y + b.r < br.y || b.y - b.r > br.y + br.h) continue;

    // Punto más cercano del ladrillo a la bola
    const cx = clamp(b.x, br.x, br.x + br.w);
    const cy = clamp(b.y, br.y, br.y + br.h);
    const dx = b.x - cx, dy = b.y - cy;
    if (dx * dx + dy * dy > b.r * b.r) continue;

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
  state.score += 5;
  if (br.hits <= 0) {
    br.alive = false;
    state.score += 25;
    state.ballSpeed += SPEED_RAMP;          // la bola acelera al destruir
    if (br.power) dropPower(br.power, br.x + br.w / 2, br.y + br.h / 2);
    burst(br.x + br.w / 2, br.y + br.h / 2, br.color);
    breakBeep();
    if (navigator.vibrate) navigator.vibrate(10);
  } else {
    crackBeep();
  }
  updateHud();
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
    emoji: "✨",
    title: `Level ${state.level + 1} cleared`,
    text: `Score ${state.score}. Get ready for the next wave.`,
    primary: { label: "Next level", onClick: () => startLevel(state.level + 1) },
  });
}

function onGameOver() {
  state.mode = "gameover";
  saveBest();
  showOverlay({
    emoji: "💥",
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
    emoji: "🏆",
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
  state.slowUntil = 0;
  state.slowActive = false;
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
      emoji: "⏸️",
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
  livesEl.textContent = state.lives > 0 ? "♥".repeat(Math.min(state.lives, 6)) : "—";
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
function showOverlay({ emoji, title, text, primary, secondary }) {
  ovEmoji.textContent = emoji;
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
  drawPaddle();
  drawBalls();

  if (state.mode === "serve") drawServeHint();
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
  ctx.restore();
}

function drawBalls() {
  for (const b of state.balls) {
    // Estela neón
    if (!reduceMotion()) {
      for (let i = 0; i < b.trail.length; i++) {
        const tp = b.trail[i];
        const k = (i + 1) / b.trail.length;
        ctx.save();
        ctx.globalAlpha = 0.05 + k * 0.28;
        ctx.fillStyle = "#22d3ee";
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, b.r * (0.35 + k * 0.65), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#eef2ff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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
    ctx.fillStyle = st.color;
    ctx.font = "700 16px 'Space Grotesk', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(st.glyph, 0, 1);
    ctx.restore();
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
  soundToggle.textContent = state.soundOn ? "🔊" : "🔇";
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

/* Acción principal: lanzar bola (tap/clic en el campo) */
function onPrimaryAction() {
  if (state.mode === "serve") launchBall();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { state.keyLeft = true; }
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { state.keyRight = true; }
  else if (e.key === " " || e.key === "Spacebar") {
    e.preventDefault();
    resumeAudio();
    if (state.mode === "serve") launchBall();
    else if (state.mode === "start") startGame();
    else if (state.mode === "play" || state.mode === "paused") togglePause();
  } else if (e.key === "p" || e.key === "P") {
    togglePause();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") state.keyLeft = false;
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") state.keyRight = false;
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

window.addEventListener("resize", resizeCanvas);
if (window.ResizeObserver) {
  new ResizeObserver(resizeCanvas).observe(stage);
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
  resizeCanvas();
  showOverlay({
    emoji: "🧱",
    title: "Neon Breaker",
    text: "Bounce the ball, smash every brick and catch power-ups. Move with mouse, touch or ← →.",
    primary: { label: "Play", onClick: () => { resumeAudio(); startGame(); } },
  });
  requestAnimationFrame((ts) => { lastTs = ts; loop(ts); });
}
init();
