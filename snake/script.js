/* ============================================================
   Snake — arcade clásico en canvas, sin librerías
   ------------------------------------------------------------
   Rejilla lógica 20×20. El canvas es responsive y nítido en
   pantallas HiDPI (se escala por devicePixelRatio). La serpiente
   crece al comer, la velocidad sube con el score y choca contra
   las paredes o su propio cuerpo. El render interpola entre
   celdas para un movimiento fluido.

   Mejoras sobre el clásico (todo dibujado en canvas):
   · Portales: dos anillos emparejados; al entrar por uno la
     cabeza emerge por el otro. Se reposicionan cada cierto
     número de pasos y tras cada uso.
   · Tipos de comida (spawn ponderado hacia la normal):
       - normal   → estrella; crece y suma puntos.
       - wormhole → vórtice; teletransporta la cabeza a una
                    celda libre aleatoria.
       - pulsar   → estrella pulsante; activa x2 velocidad y
                    x2 puntos durante unos segundos.
   ============================================================ */

/* ---------- Referencias al DOM ---------- */
const canvas      = document.getElementById("board");
const ctx         = canvas.getContext("2d");
const scoreEl     = document.getElementById("score");
const lengthEl    = document.getElementById("length");
const bestEl      = document.getElementById("best");
const startOverlay= document.getElementById("startOverlay");
const pauseOverlay= document.getElementById("pauseOverlay");
const overOverlay = document.getElementById("overOverlay");
const overStats   = document.getElementById("overStats");
const startBtn    = document.getElementById("startBtn");
const resumeBtn   = document.getElementById("resumeBtn");
const restartBtn  = document.getElementById("restartBtn");
const pauseBtn    = document.getElementById("pauseBtn");
const newGameBtn  = document.getElementById("newGameBtn");
const soundToggle = document.getElementById("soundToggle");

/* ---------- Constantes ---------- */
const GRID = 20;                 // celdas por lado (rejilla lógica)
const BEST_KEY = "arcade-snake-best";
const SOUND_KEY = "arcade-snake.sound";
const TICK_BASE = 145;           // ms por paso al empezar (lento)
const TICK_MIN  = 70;            // tope de velocidad (ms mínimos por paso)
const TICK_STEP = 4;             // cuánto se acelera por cada punto
const PULSAR_MS = 6000;          // duración del modo pulsar (x2)
const PULSAR_TICK_MIN = 42;      // tope de velocidad durante el pulsar
const PORTAL_MOVE_EVERY = 26;    // pasos entre reposiciones de portales

/* Pesos de aparición de comida (sesgados hacia la normal) */
const FOOD_WEIGHTS = { normal: 0.70, wormhole: 0.15, pulsar: 0.15 };

/* ---------- Estado central ---------- */
const state = {
  snake: [],          // array de celdas {x,y}; índice 0 = cabeza
  prevSnake: [],      // posiciones previas por índice → render interpolado fluido
  dir: { x: 1, y: 0 },// dirección actual de avance
  queue: [],          // cola de giros pendientes (evita invertir 180°)
  food: null,         // {x, y, type}
  portals: [],        // par de celdas {x,y}; vacío si no caben
  particles: [],      // destello sutil al comer
  pulsarUntil: 0,     // timestamp (performance.now) hasta el que dura el pulsar
  stepCount: 0,       // pasos desde el último reset (controla reposición de portales)
  portalUsed: false,  // bandera: reposicionar portales en el próximo paso
  score: 0,
  best: 0,
  status: "idle",     // idle | running | paused | over
  cell: 0,            // tamaño de celda en px CSS (se recalcula al render)
  soundOn: true,
};

/* ---------- Canvas responsive + nítido en HiDPI ---------- */
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const cssSize = Math.max(1, rect.width); // el CSS lo mantiene cuadrado (aspect-ratio 1/1)
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // dibujamos en px CSS
  state.cell = cssSize / GRID;
  draw();
}

/* ---------- Utilidades de rejilla ---------- */
const sameCell = (a, b) => a.x === b.x && a.y === b.y;

/* Conjunto de índices ocupados; permite excluir comida o portales */
function occupiedSet({ food = true, portals = true } = {}) {
  const set = new Set(state.snake.map((s) => s.y * GRID + s.x));
  if (food && state.food) set.add(state.food.y * GRID + state.food.x);
  if (portals) for (const p of state.portals) if (p) set.add(p.y * GRID + p.x);
  return set;
}

/* Elige una celda libre al azar dado un conjunto de índices ocupados */
function pickFreeCell(occupied) {
  const free = [];
  for (let i = 0; i < GRID * GRID; i++) {
    if (!occupied.has(i)) free.push(i);
  }
  if (!free.length) return null; // tablero lleno
  const pick = free[(Math.random() * free.length) | 0];
  return { x: pick % GRID, y: Math.floor(pick / GRID) };
}

/* ---------- Comida: tipo ponderado + creación ---------- */
function weightedFoodType() {
  const r = Math.random();
  if (r < FOOD_WEIGHTS.normal) return "normal";
  if (r < FOOD_WEIGHTS.normal + FOOD_WEIGHTS.wormhole) return "wormhole";
  return "pulsar";
}

function makeFood() {
  // La comida no debe caer sobre la serpiente ni sobre un portal
  const cell = pickFreeCell(occupiedSet({ food: false, portals: true }));
  if (!cell) return null;
  cell.type = weightedFoodType();
  return cell;
}

/* ---------- Portales ---------- */
function repositionPortals() {
  // Excluye serpiente y comida; ambos portales en celdas distintas
  const set = occupiedSet({ food: true, portals: false });
  const a = pickFreeCell(set);
  if (a) set.add(a.y * GRID + a.x);
  const b = pickFreeCell(set);
  state.portals = a && b ? [a, b] : [];
}

/* ---------- Pulsar ---------- */
function pulsarActive() {
  return performance.now() < state.pulsarUntil;
}

/* ---------- Velocidad según score (y pulsar) ---------- */
function tickInterval() {
  let i = Math.max(TICK_MIN, TICK_BASE - state.score * TICK_STEP);
  if (pulsarActive()) i = Math.max(PULSAR_TICK_MIN, i * 0.5); // x2 velocidad
  return i;
}

/* ---------- Inicio / reinicio de partida ---------- */
function resetGame() {
  const mid = Math.floor(GRID / 2);
  // Serpiente inicial de 3 celdas mirando a la derecha
  state.snake = [
    { x: mid,     y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
  state.prevSnake = state.snake.map((s) => ({ x: s.x, y: s.y }));
  state.dir = { x: 1, y: 0 };
  state.queue = [];
  state.particles = [];
  state.pulsarUntil = 0;
  state.stepCount = 0;
  state.portalUsed = false;
  state.score = 0;
  state.portals = [];
  state.food = makeFood();   // comida primero (aún sin portales)
  repositionPortals();       // portales después, evitando la comida
  updateHud();
}

function startGame() {
  resetGame();
  state.status = "running";
  startOverlay.hidden = true;
  pauseOverlay.hidden = true;
  overOverlay.hidden = true;
  lastTick = performance.now();
  acc = 0;
  draw(); // pinta el tablero recién reiniciado sin esperar al primer tick
  beep(523.25, 0.08, "triangle", 0.05);
}

/* ---------- HUD ---------- */
function updateHud() {
  scoreEl.textContent = state.score;
  lengthEl.textContent = state.snake.length;
  bestEl.textContent = state.best > 0 ? state.best : "—";
}

function loadBest() {
  const raw = localStorage.getItem(BEST_KEY);
  state.best = raw ? parseInt(raw, 10) || 0 : 0;
}

function saveBestIfBetter() {
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem(BEST_KEY, String(state.best));
    return true;
  }
  return false;
}

/* ---------- Control de dirección (sin invertir 180°) ---------- */
function setDirection(nx, ny) {
  if (state.status === "idle") { startGame(); }
  if (state.status !== "running") return;

  // Referencia para evitar 180°: el último giro encolado, o la dirección actual
  const ref = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  if (nx === -ref.x && ny === -ref.y) return; // invertir está prohibido
  if (nx === ref.x && ny === ref.y) return;   // misma dirección, no encolar
  if (state.queue.length < 2) state.queue.push({ x: nx, y: ny });
}

/* ---------- Un paso de simulación ---------- */
function step() {
  // Aplica el siguiente giro encolado
  if (state.queue.length) state.dir = state.queue.shift();

  const head = state.snake[0];
  let next = { x: head.x + state.dir.x, y: head.y + state.dir.y };

  // Colisión con la pared (los portales son la única forma de cruzar)
  if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID) {
    return gameOver();
  }

  // Portal: si la próxima celda es un portal, la cabeza emerge por el otro
  let teleported = false;
  const pIdx = state.portals.findIndex((p) => p && sameCell(p, next));
  if (pIdx !== -1) {
    const other = state.portals[1 - pIdx];
    if (other) {
      next = { x: other.x, y: other.y };
      teleported = true;
      state.portalUsed = true; // se reposicionan tras usarse
      beep(540, 0.06, "triangle", 0.045);
      if (navigator.vibrate) navigator.vibrate(8);
    }
  }

  const food = state.food;
  const willEat = food && sameCell(next, food);
  // Si no come, la cola se libera este paso, así que no cuenta para la colisión
  const body = willEat ? state.snake : state.snake.slice(0, -1);
  if (body.some((s) => sameCell(s, next))) {
    return gameOver();
  }

  // Guarda las posiciones previas (por índice) para interpolar el render.
  // El render "salta" (sin deslizar) los segmentos que cambian más de una
  // celda, así que el cruce por portal/wormhole se ve limpio.
  state.prevSnake = state.snake.map((s) => ({ x: s.x, y: s.y }));
  state.snake.unshift(next);

  if (willEat) {
    if (handleEat(food, next)) return gameOver(); // tablero lleno → victoria implícita
  } else {
    state.snake.pop();
  }

  // Reposiciona portales periódicamente o tras usarse
  state.stepCount++;
  if (state.portalUsed || state.stepCount % PORTAL_MOVE_EVERY === 0) {
    repositionPortals();
    state.portalUsed = false;
  }

  updateHud();
}

/* Procesa el efecto de la comida. Devuelve true si el tablero quedó lleno. */
function handleEat(food, headCell) {
  const mult = pulsarActive() ? 2 : 1;       // x2 puntos durante el pulsar
  state.score += 1 * mult;

  if (food.type === "pulsar") {
    state.pulsarUntil = performance.now() + PULSAR_MS;
    beep(880, 0.07, "square", 0.05);
    setTimeout(() => beep(1320, 0.09, "square", 0.045), 70);
    if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
  } else if (food.type === "wormhole") {
    // Teletransporta la cabeza a una celda libre (fuera de serpiente y portales)
    const tp = pickFreeCell(occupiedSet({ food: false, portals: true }));
    if (tp) state.snake[0] = { x: tp.x, y: tp.y };
    beep(300, 0.06, "sine", 0.05);
    setTimeout(() => beep(150, 0.13, "sawtooth", 0.05), 60);
    if (navigator.vibrate) navigator.vibrate([8, 24, 8]);
  } else {
    beep(660 + Math.min(state.score, 12) * 18, 0.07, "square", 0.04);
    if (navigator.vibrate) navigator.vibrate(12);
  }

  spawnEatBurst(headCell, food.type);
  state.food = makeFood();
  return !state.food; // sin hueco libre → tablero completo
}

function gameOver() {
  state.status = "over";
  const record = saveBestIfBetter();
  updateHud();
  overStats.textContent =
    `Score ${state.score} · Length ${state.snake.length}` +
    (record ? " · New best!" : ` · Best ${state.best}`);
  beep(196, 0.18, "sawtooth", 0.06);
  setTimeout(() => beep(146.83, 0.26, "sawtooth", 0.06), 120);
  if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  draw();
  setTimeout(() => { overOverlay.hidden = false; restartBtn.focus(); }, 220);
}

/* ---------- Pausa ---------- */
function pauseGame() {
  if (state.status !== "running") return;
  state.status = "paused";
  pauseOverlay.hidden = false;
}
function resumeGame() {
  if (state.status !== "paused") return;
  state.status = "running";
  pauseOverlay.hidden = true;
  lastTick = performance.now();
  acc = 0;
}
function togglePause() {
  if (state.status === "running") pauseGame();
  else if (state.status === "paused") resumeGame();
}

/* ---------- Bucle de juego (rAF con acumulador) ---------- */
let lastTick = 0;
let acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (state.status !== "running") { lastTick = now; return; }
  const frameDt = now - lastTick;
  acc += frameDt;
  lastTick = now;
  const interval = tickInterval();
  // Procesa pasos pendientes; tope para no "espiralar" tras un lag grande
  let safety = 0;
  while (acc >= interval && state.status === "running" && safety < 5) {
    acc -= interval;
    step();
    safety++;
  }
  // Repinta cada frame: interpola entre celdas (acc/interval) → movimiento fluido
  updateParticles(frameDt);
  draw();
}

/* ---------- Render ---------- */
function draw() {
  const cell = state.cell;
  const size = cell * GRID;
  // Progreso hacia el siguiente paso: 0 = celda previa, 1 = celda actual
  const t = state.status === "running" ? Math.min(acc / tickInterval(), 1) : 1;
  ctx.clearRect(0, 0, size, size);

  // Fondo
  ctx.fillStyle = "#0a0e1d";
  ctx.fillRect(0, 0, size, size);
  drawGrid(cell, size);

  // Portales (bajo la comida y la serpiente)
  drawPortals(cell);

  // Comida
  if (state.food) drawFood(state.food, cell);

  // Serpiente (posiciones interpoladas) y destellos
  drawSnake(cell, t);
  drawParticles(cell);

  // Indicador del modo pulsar (borde + etiqueta)
  drawPulsarOverlay(size);
}

function drawGrid(cell, size) {
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < GRID; i++) {
    const p = Math.round(i * cell) + 0.5;
    ctx.moveTo(p, 0); ctx.lineTo(p, size);
    ctx.moveTo(0, p); ctx.lineTo(size, p);
  }
  ctx.stroke();
}

/* Rectángulo redondeado dentro de una celda, con padding */
function roundedCell(cx, cy, cell, pad, color) {
  const x = cx * cell + pad;
  const y = cy * cell + pad;
  const s = cell - pad * 2;
  const r = Math.min(7, s * 0.32);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + s, y, x + s, y + s, r);
  ctx.arcTo(x + s, y + s, x, y + s, r);
  ctx.arcTo(x, y + s, x, y, r);
  ctx.arcTo(x, y, x + s, y, r);
  ctx.closePath();
  ctx.fill();
}

/* Trazo de rectángulo redondeado genérico (para el borde del pulsar) */
function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Interpolación lineal entre dos colores hex (#rrggbb) */
function lerpColor(a, b, t) {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ar = ah >> 16, ag = (ah >> 8) & 255, ab = ah & 255;
  const br = bh >> 16, bg = (bh >> 8) & 255, bb = bh & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

/* Color hex → rgba con alfa */
function hexA(hex, a) {
  const h = parseInt(hex.slice(1), 16);
  return `rgba(${h >> 16},${(h >> 8) & 255},${h & 255},${a})`;
}

function drawSnake(cell, t) {
  const snake = state.snake, prev = state.prevSnake, len = snake.length;
  for (let i = len - 1; i >= 0; i--) {
    const dst = snake[i];
    const src = prev[i] || dst;            // índice nuevo (cola al crecer) = estático
    // Saltos no adyacentes (portal/wormhole): aparece directo, sin deslizar
    const far = Math.abs(dst.x - src.x) > 1 || Math.abs(dst.y - src.y) > 1;
    const tt = far ? 1 : t;
    const x = src.x + (dst.x - src.x) * tt; // posición interpolada (celdas)
    const y = src.y + (dst.y - src.y) * tt;
    if (i === 0) {
      // Cabeza: color de acento sólido + ojos
      roundedCell(x, y, cell, cell * 0.06, "#7c5cff");
      drawEyes(x, y, cell);
    } else {
      // Cuerpo: degradado de morado (acento) hacia cyan (acento-2)
      const g = len > 1 ? i / (len - 1) : 0;
      roundedCell(x, y, cell, cell * 0.1, lerpColor("#7c5cff", "#22d3ee", g));
    }
  }
}

/* Ojos simples en la cabeza, orientados según la dirección */
function drawEyes(hx, hy, cell) {
  const cx = hx * cell, cy = hy * cell;
  const eye = Math.max(2, cell * 0.13);
  const pupil = eye * 0.55;
  const dx = state.dir.x, dy = state.dir.y;
  // Posiciones base (perpendicular a la marcha), desplazadas hacia el frente
  let eyes;
  if (dx !== 0) {
    const ex = dx > 0 ? cell * 0.66 : cell * 0.34;
    eyes = [{ x: cx + ex, y: cy + cell * 0.34 }, { x: cx + ex, y: cy + cell * 0.66 }];
  } else {
    const ey = dy > 0 ? cell * 0.66 : cell * 0.34;
    eyes = [{ x: cx + cell * 0.34, y: cy + ey }, { x: cx + cell * 0.66, y: cy + ey }];
  }
  for (const e of eyes) {
    ctx.fillStyle = "#0b1020";
    ctx.beginPath(); ctx.arc(e.x, e.y, eye, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#eef2ff";
    ctx.beginPath();
    ctx.arc(e.x + dx * pupil * 0.5, e.y + dy * pupil * 0.5, pupil, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------- Comida: un dibujo distinto por tipo ---------- */
function drawFood(food, cell) {
  const now = performance.now();
  const cx = (food.x + 0.5) * cell;
  const cy = (food.y + 0.5) * cell;
  const R = cell * 0.36;
  if (food.type === "wormhole") drawWormholeFood(cx, cy, R, now);
  else if (food.type === "pulsar") drawPulsarFood(cx, cy, R, now);
  else drawStarFood(cx, cy, R, now);
}

/* Trazo de estrella centrada en el origen (requiere translate previo) */
function starPath(outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/* Comida normal: estrella dorada que gira y titila suavemente */
function drawStarFood(cx, cy, R, now) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(now * 0.0006);
  const tw = 0.92 + Math.sin(now * 0.005) * 0.08;
  ctx.scale(tw, tw);
  ctx.shadowColor = "#fbbf24";
  ctx.shadowBlur = R * 0.9;
  const grad = ctx.createLinearGradient(0, -R, 0, R);
  grad.addColorStop(0, "#fde68a");
  grad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = grad;
  starPath(R, R * 0.46, 5);
  ctx.fill();
  ctx.restore();
}

/* Comida pulsar: estrella pulsante con halo y púas (señala el x2) */
function drawPulsarFood(cx, cy, R, now) {
  const pulse = 0.72 + Math.sin(now * 0.013) * 0.28;
  ctx.save();
  ctx.translate(cx, cy);
  // Halo radial
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.7 * pulse);
  halo.addColorStop(0, "rgba(251,191,36,0.55)");
  halo.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, R * 1.7 * pulse, 0, Math.PI * 2); ctx.fill();
  // Púas radiantes
  ctx.shadowColor = "#f59e0b";
  ctx.shadowBlur = R * 0.8;
  ctx.strokeStyle = "#fde68a";
  ctx.lineWidth = Math.max(1.5, R * 0.12);
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * i) / 4 + now * 0.002;
    const r1 = R * 0.5, r2 = R * (1.0 + 0.28 * pulse);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }
  // Núcleo brillante
  ctx.shadowBlur = R;
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.36 + R * 0.18 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* Comida wormhole: vórtice con centro oscuro y anillos espirales */
function drawWormholeFood(cx, cy, R, now) {
  ctx.save();
  ctx.translate(cx, cy);
  const rot = now * 0.004;
  // Halo
  const halo = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.3);
  halo.addColorStop(0, "rgba(34,211,238,0)");
  halo.addColorStop(0.6, "rgba(34,211,238,0.35)");
  halo.addColorStop(1, "rgba(124,92,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2); ctx.fill();
  // Anillos espirales que giran
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = R * 0.7;
  for (let k = 0; k < 3; k++) {
    const rr = R * (1 - k * 0.26);
    ctx.strokeStyle = k % 2 ? "#7c5cff" : "#22d3ee";
    ctx.lineWidth = Math.max(1.2, R * 0.13);
    ctx.beginPath();
    ctx.arc(0, 0, rr, rot + k * 1.6, rot + k * 1.6 + Math.PI * 1.3);
    ctx.stroke();
  }
  // Centro oscuro (el "agujero")
  ctx.shadowBlur = 0;
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.5);
  core.addColorStop(0, "#05070f");
  core.addColorStop(1, "#0a0e1d");
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ---------- Portales: anillos brillantes emparejados ---------- */
function drawPortals(cell) {
  const now = performance.now();
  for (let i = 0; i < state.portals.length; i++) {
    const p = state.portals[i];
    if (!p) continue;
    const cx = (p.x + 0.5) * cell;
    const cy = (p.y + 0.5) * cell;
    const R = cell * 0.42;
    // Color por extremo del par: cyan / morado (deja ver el emparejamiento)
    drawPortalRing(cx, cy, R, i === 0 ? "#22d3ee" : "#7c5cff", now, i);
  }
}

function drawPortalRing(cx, cy, R, color, now, i) {
  ctx.save();
  ctx.translate(cx, cy);
  const pulse = 0.85 + Math.sin(now * 0.006 + i * 1.5) * 0.15;
  // Halo
  const halo = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.4 * pulse);
  halo.addColorStop(0, "rgba(255,255,255,0)");
  halo.addColorStop(0.7, hexA(color, 0.30));
  halo.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, R * 1.4 * pulse, 0, Math.PI * 2); ctx.fill();
  // Anillo principal (gira en sentidos opuestos por extremo)
  ctx.rotate(now * 0.0015 * (i ? -1 : 1));
  ctx.shadowColor = color;
  ctx.shadowBlur = R * 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, R * 0.16);
  ctx.beginPath(); ctx.arc(0, 0, R * pulse, 0, Math.PI * 2); ctx.stroke();
  // Arcos internos (energía giratoria)
  ctx.lineWidth = Math.max(1, R * 0.1);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  for (let s = 0; s < 3; s++) {
    const a = (Math.PI * 2 * s) / 3;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.72 * pulse, a, a + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- Indicador del modo pulsar ---------- */
function drawPulsarOverlay(size) {
  if (!pulsarActive()) return;
  const now = performance.now();
  const pulse = 0.5 + Math.sin(now * 0.012) * 0.5;
  ctx.save();
  // Borde brillante
  ctx.strokeStyle = hexA("#fbbf24", 0.35 + 0.35 * pulse);
  ctx.lineWidth = Math.max(3, size * 0.018);
  ctx.shadowColor = "#fbbf24";
  ctx.shadowBlur = size * 0.04;
  const o = ctx.lineWidth / 2 + 1;
  roundRectPath(o, o, size - 2 * o, size - 2 * o, Math.min(14, size * 0.04));
  ctx.stroke();
  // Etiqueta "⚡ x2"
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fde68a";
  ctx.font = `700 ${Math.max(11, size * 0.05)}px "Space Grotesk", monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("⚡ x2", size - size * 0.045, size * 0.04);
  ctx.restore();
}

/* ---------- Destello sutil al comer (color por tipo) ---------- */
function spawnEatBurst(cellPos, type) {
  const cell = state.cell;
  const cx = (cellPos.x + 0.5) * cell;
  const cy = (cellPos.y + 0.5) * cell;
  const color = type === "pulsar" ? "#fbbf24"
              : type === "wormhole" ? "#22d3ee"
              : "#fde68a";
  for (let i = 0; i < 9; i++) {
    const ang = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
    const sp = 0.05 + Math.random() * 0.06; // px por ms
    state.particles.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, color });
  }
}
function updateParticles(dt) {
  const p = state.particles;
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= 0.9; q.vy *= 0.9;   // fricción
    q.life -= dt / 380;          // ~0.38 s de vida
    if (q.life <= 0) p.splice(i, 1);
  }
}
function drawParticles(cell) {
  for (const q of state.particles) {
    ctx.globalAlpha = Math.max(0, q.life);
    ctx.fillStyle = q.color || "#f472b6";
    ctx.beginPath();
    ctx.arc(q.x, q.y, cell * 0.07 * q.life + cell * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}
function loadSoundPref() {
  state.soundOn = localStorage.getItem(SOUND_KEY) !== "off";
  reflectSoundUI();
}
function reflectSoundUI() {
  soundToggle.textContent = state.soundOn ? "🔊" : "🔇";
  soundToggle.classList.toggle("is-muted", !state.soundOn);
  soundToggle.setAttribute("aria-pressed", String(state.soundOn));
}
function toggleSound() {
  state.soundOn = !state.soundOn;
  localStorage.setItem(SOUND_KEY, state.soundOn ? "on" : "off");
  reflectSoundUI();
  if (state.soundOn) beep(660, 0.1, "sine", 0.06);
}

/* ---------- Entrada de teclado ---------- */
const KEY_DIRS = {
  arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
};

window.addEventListener("keydown", (e) => {
  // Espacio: pausa/inicio
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    if (state.status === "idle") startGame();
    else togglePause();
    return;
  }
  const d = KEY_DIRS[e.key.toLowerCase()];
  if (d) {
    e.preventDefault();
    setDirection(d[0], d[1]);
    return;
  }
  // Cualquier otra tecla arranca desde la pantalla de inicio
  if (state.status === "idle") startGame();
});

/* ---------- Entrada táctil (swipe corto y encadenable) ---------- */
const SWIPE_TH = 20; // px: umbral bajo → swipes cortos y fiables
let touchStart = null;
canvas.addEventListener("touchstart", (e) => {
  if (state.status === "idle") startGame();
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault(); // evita el scroll/zoom de la página sobre el tablero
  if (!touchStart) return;
  const t = e.touches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (Math.max(adx, ady) < SWIPE_TH) return;
  if (adx > ady) setDirection(dx > 0 ? 1 : -1, 0);
  else           setDirection(0, dy > 0 ? 1 : -1);
  // Reinicia el origen → permite encadenar giros con un solo dedo
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: false });

canvas.addEventListener("touchend", () => { touchStart = null; }, { passive: true });

/* ---------- Eventos de UI ---------- */
startBtn.addEventListener("click", startGame);
resumeBtn.addEventListener("click", resumeGame);
restartBtn.addEventListener("click", startGame);
newGameBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", togglePause);
soundToggle.addEventListener("click", toggleSound);
window.addEventListener("resize", resizeCanvas);

// Pausa automática al ocultar la pestaña: rAF se congela y, al volver, el
// acumulador haría avanzar varias celdas de golpe (muerte casi segura).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

/* ---------- Arranque ---------- */
function init() {
  loadSoundPref();
  loadBest();
  resetGame();      // posiciona la serpiente inicial y refresca el HUD
  resizeCanvas();   // ajusta el canvas a la pantalla y pinta el primer frame
  requestAnimationFrame(loop);
}
init();
