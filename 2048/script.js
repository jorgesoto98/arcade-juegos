/* ============================================================
   2048 — fusiona fichas iguales hasta alcanzar 2048
   ------------------------------------------------------------
   Modelo: rejilla 4×4 de objetos "tile" (o null). Cada ficha
   tiene un id estable para animar su deslizamiento entre celdas.
   Al mover, las fichas se deslizan en la dirección elegida y los
   pares iguales adyacentes se fusionan (máx. una fusión por ficha
   y por movimiento). Solo si el tablero cambió: suma al score y
   aparece una ficha nueva (90% → 2, 10% → 4).
   ============================================================ */

const SIZE = 4;
const WIN_VALUE = 2048;
const BEST_KEY = "arcade-2048-best";
const MODE_KEY = "arcade-2048-mode";

const UNDO_MAX = 3;            // máximo de deshaceres por partida
const BLACKHOLE_INTERVAL = 5;  // cada N movimientos colapsa una celda (modo Agujero Negro)

/* ---------- Referencias al DOM ---------- */
const gridBg    = document.getElementById("gridBg");
const tileLayer = document.getElementById("tileLayer");
const scoreEl   = document.getElementById("score");
const scoreStat = scoreEl.closest(".stat"); // contenedor para el "+N" flotante
const bestEl    = document.getElementById("best");
const newGameBtn= document.getElementById("newGame");
const boardWrap = document.querySelector(".board-wrap");
const confettiCanvas = document.getElementById("confetti");
const fxCanvas  = document.getElementById("fx");

const undoBtn   = document.getElementById("undo");
const modeClassicBtn   = document.getElementById("modeClassic");
const modeBlackholeBtn = document.getElementById("modeBlackhole");

const overlay   = document.getElementById("overlay");
const ovEmoji   = document.getElementById("ovEmoji");
const ovTitle   = document.getElementById("ovTitle");
const ovMsg     = document.getElementById("ovMsg");
const keepGoingBtn = document.getElementById("keepGoing");
const restartBtn   = document.getElementById("restart");

/* ---------- Estado del juego ---------- */
const state = {
  grid: [],        // matriz SIZE×SIZE: tile | null
  removing: [],    // fichas que se fusionaron este turno (se animan y se eliminan)
  score: 0,
  best: 0,
  won: false,      // ya se mostró el overlay de victoria
  keepGoing: false,// el jugador eligió seguir tras ganar
  over: false,     // partida terminada (sin movimientos)
  tileEls: new Map(), // id -> elemento DOM

  mode: "classic",       // "classic" | "blackhole"
  moves: 0,              // movimientos válidos de la partida (cuenta para colapsos)
  blocked: new Set(),    // celdas bloqueadas: claves "r,c" (modo Agujero Negro)
  blockedEls: new Map(), // "r,c" -> elemento vórtice
  undoStack: [],         // instantáneas previas para deshacer
  undosLeft: UNDO_MAX,   // deshaceres restantes en la partida
};

let idCounter = 0;

/* ---------- Vectores y recorrido por dirección ---------- */
const VECTORS = {
  up:    { dr: -1, dc: 0 },
  down:  { dr: 1,  dc: 0 },
  left:  { dr: 0,  dc: -1 },
  right: { dr: 0,  dc: 1 },
};

// Orden de recorrido: empezamos por el lado hacia el que se mueven las fichas.
function buildTraversals(vector) {
  const rows = [0, 1, 2, 3];
  const cols = [0, 1, 2, 3];
  if (vector.dr === 1) rows.reverse();
  if (vector.dc === 1) cols.reverse();
  return { rows, cols };
}

/* ---------- Utilidades de rejilla ---------- */
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

// ¿La celda está colapsada (bloqueada)? Las fichas no pueden entrar ni cruzarla.
const isBlocked = (r, c) => state.blocked.has(r + "," + c);

function newTile(r, c, value) {
  return { id: ++idCounter, r, c, value, isNew: true, merged: false };
}

function forEachTile(fn) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state.grid[r][c]) fn(state.grid[r][c]);
    }
  }
}

function emptyCells() {
  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      // Una celda colapsada no cuenta como vacía
      if (!state.grid[r][c] && !isBlocked(r, c)) cells.push({ r, c });
    }
  }
  return cells;
}

/* Añade una ficha nueva en una celda vacía aleatoria (90% → 2, 10% → 4) */
function addRandomTile() {
  const cells = emptyCells();
  if (!cells.length) return;
  const { r, c } = cells[Math.floor(Math.random() * cells.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  state.grid[r][c] = newTile(r, c, value);
}

/* Busca la celda más lejana en la dirección dada y la siguiente celda ocupada */
function findFarthest(r, c, vector) {
  let prevR = r, prevC = c;
  let curR = r + vector.dr, curC = c + vector.dc;
  // Las celdas bloqueadas detienen el deslizamiento (no se puede pasar a través)
  while (inBounds(curR, curC) && !state.grid[curR][curC] && !isBlocked(curR, curC)) {
    prevR = curR; prevC = curC;
    curR += vector.dr; curC += vector.dc;
  }
  return {
    farthest: { r: prevR, c: prevC },
    next: inBounds(curR, curC) ? { r: curR, c: curC } : null,
  };
}

/* ---------- Movimiento ---------- */
function move(dir) {
  if (state.over) return;
  if (state.won && !state.keepGoing) return; // overlay de victoria visible

  const vector = VECTORS[dir];
  const { rows, cols } = buildTraversals(vector);
  let moved = false;
  let gained = 0;
  state.removing = [];

  // Instantánea del estado previo (por si la jugada es válida y se quiere deshacer)
  const before = snapshot();

  // Reinicia banderas de animación de la jugada anterior
  forEachTile((t) => { t.isNew = false; t.merged = false; });

  for (const r of rows) {
    for (const c of cols) {
      const tile = state.grid[r][c];
      if (!tile) continue;

      const { farthest, next } = findFarthest(r, c, vector);
      const nextTile = next ? state.grid[next.r][next.c] : null;

      if (nextTile && nextTile.value === tile.value && !nextTile.merged) {
        // Fusión: 'tile' entra en 'nextTile' y este duplica su valor
        nextTile.value *= 2;
        nextTile.merged = true;
        gained += nextTile.value;
        state.grid[r][c] = null;
        // La ficha que se fusiona se desliza hasta la celda destino y luego se elimina
        tile.r = next.r; tile.c = next.c;
        state.removing.push(tile);
        moved = true;
      } else if (farthest.r !== r || farthest.c !== c) {
        // Deslizamiento simple a la celda más lejana
        state.grid[r][c] = null;
        state.grid[farthest.r][farthest.c] = tile;
        tile.r = farthest.r; tile.c = farthest.c;
        moved = true;
      }
    }
  }

  if (!moved) return;

  // La jugada fue válida: guarda la instantánea para deshacer
  pushUndoSnapshot(before);

  state.score += gained;
  if (gained > 0) {
    if (navigator.vibrate) navigator.vibrate(12);
    retriggerAnim(scoreEl, "bump"); // pulso del número
    showScoreAdd(gained);           // "+N" flotante
  }
  addRandomTile();
  updateScore();
  render();

  // Modo Agujero Negro: cada N movimientos colapsa una celda vacía aleatoria
  state.moves++;
  if (state.mode === "blackhole" && state.moves % BLACKHOLE_INTERVAL === 0) {
    collapseCell();
  }

  // ¿Victoria? (solo la primera vez que se alcanza 2048)
  if (!state.won && reachedWin()) {
    state.won = true;
    showWin();
    return;
  }

  // ¿Derrota? (sin celdas vacías y sin fusiones posibles; cuenta las bloqueadas)
  if (!movesAvailable()) {
    state.over = true;
    showGameOver();
  }
}

function reachedWin() {
  let hit = false;
  forEachTile((t) => { if (t.value >= WIN_VALUE) hit = true; });
  return hit;
}

/* ¿Queda algún movimiento posible? (las celdas bloqueadas rompen adyacencias) */
function movesAvailable() {
  if (emptyCells().length) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = state.grid[r][c];
      if (!cell) continue; // celda bloqueada (sin ficha): no permite fusión
      const v = cell.value;
      const right = c + 1 < SIZE ? state.grid[r][c + 1] : null;
      const down  = r + 1 < SIZE ? state.grid[r + 1][c] : null;
      if (right && right.value === v) return true;
      if (down && down.value === v) return true;
    }
  }
  return false;
}

/* ---------- Render ---------- */
// Geometría en porcentajes calc: una celda mide (ancho - huecos) / SIZE y cada
// paso entre celdas añade un --gap. Constantes porque SIZE es fijo.
const CELL_SIZE = `calc((100% - ${SIZE - 1} * var(--gap)) / ${SIZE})`;
const CELL_STEP = `((100% - ${SIZE - 1} * var(--gap)) / ${SIZE} + var(--gap))`;

// Posiciona una ficha; el ancho/alto se fija una sola vez por elemento.
function placeTile(el, r, c) {
  if (!el.style.width) {
    el.style.width = CELL_SIZE;
    el.style.height = CELL_SIZE;
  }
  el.style.left = `calc(${CELL_STEP} * ${c})`;
  el.style.top  = `calc(${CELL_STEP} * ${r})`;
}

function applyValueClasses(el, value) {
  el.dataset.value = value;
  const len = String(value).length;
  el.classList.toggle("len3", len === 3);
  el.classList.toggle("len4", len >= 4);
  el.classList.toggle("super", value > WIN_VALUE);
}

function render() {
  // Fichas vivas en la rejilla
  forEachTile((tile) => {
    let el = state.tileEls.get(tile.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "tile";
      el.setAttribute("role", "gridcell");
      placeTile(el, tile.r, tile.c);
      el.textContent = tile.value;
      applyValueClasses(el, tile.value);
      if (tile.isNew) el.classList.add("pop-in");
      tileLayer.appendChild(el);
      state.tileEls.set(tile.id, el);
    } else {
      placeTile(el, tile.r, tile.c);
      if (el.textContent !== String(tile.value)) {
        el.textContent = tile.value;
        applyValueClasses(el, tile.value);
      }
      if (tile.merged) {
        retriggerAnim(el, "merged");
        // Supernova: onda de choque + ráfaga de partículas en la ficha resultante
        const { cx, cy, cell } = tileCenter(tile.r, tile.c);
        spawnMerge(cx, cy, tile.value, cell);
      }
    }
  });

  // Fichas que se fusionaron: se deslizan al destino y se eliminan al terminar
  for (const tile of state.removing) {
    const el = state.tileEls.get(tile.id);
    if (!el) continue;
    el.classList.add("vanish");
    placeTile(el, tile.r, tile.c);
    const id = tile.id;
    setTimeout(() => {
      const node = state.tileEls.get(id);
      if (node) { node.remove(); state.tileEls.delete(id); }
    }, 140);
  }
  state.removing = [];
}

// Reinicia una animación CSS forzando reflow para que vuelva a dispararse.
function retriggerAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ¿El usuario prefiere movimiento reducido?
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---------- Geometría: centro de una celda en píxeles del canvas FX ---------- */
// Calcula el centro (cx, cy) y el tamaño de celda a partir de fila/columna,
// medidos respecto a la esquina del canvas de efectos.
function tileCenter(r, c) {
  const canvasRect = fxCanvas.getBoundingClientRect();
  const layerRect = tileLayer.getBoundingClientRect();
  const gap = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--gap")
  ) || 12;
  const cell = (layerRect.width - (SIZE - 1) * gap) / SIZE;
  const step = cell + gap;
  const baseX = layerRect.left - canvasRect.left;
  const baseY = layerRect.top - canvasRect.top;
  return { cx: baseX + c * step + cell / 2, cy: baseY + r * step + cell / 2, cell };
}

/* ============================================================
   Supernovas: ondas de choque + partículas al fusionar
   Un único canvas y un bucle rAF compartido para todos los efectos.
   El color escala con el valor: cian (bajo) → morado (medio) →
   blanco caliente (cerca de 2048).
   ============================================================ */
let fxCtx = null, fxW = 0, fxH = 0, fxDpr = 1;
const shockwaves = []; // { x, y, r, maxR, color:[r,g,b], life, dur, thickness }
const particles  = []; // { x, y, vx, vy, size, color:[r,g,b], life, maxLife }
let fxRunning = false;

// Ajusta el tamaño del canvas FX a la resolución del dispositivo
function resizeFx() {
  if (!fxCanvas) return;
  const rect = fxCanvas.getBoundingClientRect();
  if (!rect.width) return;
  fxDpr = window.devicePixelRatio || 1;
  fxW = rect.width;
  fxH = rect.height;
  fxCanvas.width = fxW * fxDpr;
  fxCanvas.height = fxH * fxDpr;
  fxCtx = fxCanvas.getContext("2d");
  fxCtx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
}

// Interpola dos colores RGB ([r,g,b])
function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Color de la supernova según el valor de la ficha (2 → 2048)
function mergeColor(value) {
  const CYAN   = [34, 211, 238];
  const PURPLE = [124, 92, 255];
  const WHITE  = [255, 246, 224]; // blanco caliente
  const t = Math.min(1, Math.max(0, (Math.log2(value) - 1) / 10)); // 2→0, 2048→1
  return t < 0.5
    ? lerpColor(CYAN, PURPLE, t / 0.5)
    : lerpColor(PURPLE, WHITE, (t - 0.5) / 0.5);
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function startFx() {
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxTick); }
}

function fxTick() {
  if (!fxCtx) { fxRunning = false; return; }
  fxCtx.clearRect(0, 0, fxW, fxH);

  // Ondas de choque (anillos que se expanden y desvanecen)
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.life++;
    const p = s.life / s.dur;
    if (p >= 1) { shockwaves.splice(i, 1); continue; }
    const rad = s.r + (s.maxR - s.r) * easeOut(p);
    fxCtx.beginPath();
    fxCtx.arc(s.x, s.y, rad, 0, Math.PI * 2);
    fxCtx.lineWidth = Math.max(1.5, s.thickness * (1 - p));
    fxCtx.strokeStyle = `rgba(${s.color[0]},${s.color[1]},${s.color[2]},${(1 - p) * 0.85})`;
    fxCtx.stroke();
  }

  // Partículas (chispas que salen disparadas con rozamiento)
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life++;
    if (pt.life >= pt.maxLife) { particles.splice(i, 1); continue; }
    pt.vx *= 0.92; pt.vy *= 0.92;
    pt.x += pt.vx; pt.y += pt.vy;
    const a = 1 - pt.life / pt.maxLife;
    fxCtx.beginPath();
    fxCtx.arc(pt.x, pt.y, pt.size * a + 0.5, 0, Math.PI * 2);
    fxCtx.fillStyle = `rgba(${pt.color[0]},${pt.color[1]},${pt.color[2]},${a})`;
    fxCtx.fill();
  }

  if (shockwaves.length || particles.length) requestAnimationFrame(fxTick);
  else { fxCtx.clearRect(0, 0, fxW, fxH); fxRunning = false; }
}

// Emite la supernova de una fusión en (cx, cy)
function spawnMerge(cx, cy, value, cell) {
  if (prefersReducedMotion()) return;
  if (!fxCtx) resizeFx();
  if (!fxCtx) return;
  const color = mergeColor(value);
  const tier = Math.min(11, Math.log2(value));

  shockwaves.push({ x: cx, y: cy, r: cell * 0.28, maxR: cell * 0.95, color, life: 0, dur: 26, thickness: 4 });

  const count = Math.round(10 + tier * 1.4);
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const sp = cell * (0.035 + Math.random() * 0.05);
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      size: 1.6 + Math.random() * 2.6, color, life: 0, maxLife: 24 + Math.random() * 16,
    });
  }
  // Núcleo blanco caliente extra para valores altos
  if (tier >= 8) {
    shockwaves.push({ x: cx, y: cy, r: cell * 0.1, maxR: cell * 0.6, color: [255, 250, 235], life: 0, dur: 20, thickness: 6 });
  }
  startFx();
}

// Implosión al colapsar una celda (partículas absorbidas hacia el centro)
function spawnImplosion(cx, cy, cell) {
  if (prefersReducedMotion()) return;
  if (!fxCtx) resizeFx();
  if (!fxCtx) return;
  const color = [124, 92, 255];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count;
    const dist = cell * 0.75;
    const sp = cell * 0.06;
    particles.push({
      x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist,
      vx: -Math.cos(ang) * sp, vy: -Math.sin(ang) * sp,
      size: 1.6 + Math.random() * 2, color, life: 0, maxLife: 18 + Math.random() * 10,
    });
  }
  startFx();
}

/* ---------- Celdas colapsadas (modo Agujero Negro) ---------- */
// Crea los elementos vórtice para las celdas bloqueadas que aún no se dibujaron.
function renderBlocked(newKey) {
  state.blocked.forEach((key) => {
    if (state.blockedEls.has(key)) return;
    const [r, c] = key.split(",").map(Number);
    const el = document.createElement("div");
    el.className = "vortex";
    el.setAttribute("aria-hidden", "true");
    placeTile(el, r, c);
    if (key === newKey && !prefersReducedMotion()) el.classList.add("collapse");
    tileLayer.appendChild(el);
    state.blockedEls.set(key, el);
  });
}

function clearBlockedEls() {
  state.blockedEls.forEach((el) => el.remove());
  state.blockedEls.clear();
}

// Colapsa una celda vacía aleatoria: queda bloqueada y aparece un vórtice.
function collapseCell() {
  const cells = emptyCells();
  if (!cells.length) return;
  const { r, c } = cells[(Math.random() * cells.length) | 0];
  state.blocked.add(r + "," + c);
  renderBlocked(r + "," + c);
  if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
  const { cx, cy, cell } = tileCenter(r, c);
  spawnImplosion(cx, cy, cell);
}

/* ---------- Deshacer (undo) ---------- */
// Instantánea serializable del estado de juego previo a una jugada.
function snapshot() {
  return {
    grid: state.grid.map((row) => row.map((t) => (t ? { value: t.value } : null))),
    blocked: [...state.blocked],
    score: state.score,
    moves: state.moves,
    won: state.won,
    keepGoing: state.keepGoing,
    over: state.over,
  };
}

// Guarda una instantánea en la pila (acotada) y refresca el botón.
function pushUndoSnapshot(snap) {
  state.undoStack.push(snap);
  if (state.undoStack.length > UNDO_MAX) state.undoStack.shift();
  updateUndoBtn();
}

// Reconstruye el tablero y el DOM a partir de una instantánea.
function restore(snap) {
  state.grid = snap.grid.map((row, r) =>
    row.map((cell, c) => {
      if (!cell) return null;
      const t = newTile(r, c, cell.value);
      t.isNew = false; // sin animación de aparición al deshacer
      return t;
    })
  );
  state.blocked = new Set(snap.blocked);
  state.score = snap.score;
  state.moves = snap.moves;
  state.won = snap.won;
  state.keepGoing = snap.keepGoing;
  state.over = snap.over;
  state.removing = [];

  // Reconstruye la capa de fichas y los vórtices desde cero
  tileLayer.innerHTML = "";
  state.tileEls.clear();
  state.blockedEls.clear();

  hideOverlay();
  scoreEl.textContent = state.score; // el récord no baja al deshacer
  render();
  renderBlocked();
}

// Activa/desactiva el botón Undo y muestra los usos restantes.
function updateUndoBtn() {
  const can = state.undoStack.length > 0 && state.undosLeft > 0;
  undoBtn.disabled = !can;
  undoBtn.textContent = `↶ Undo (${state.undosLeft})`;
}

function undo() {
  if (!state.undoStack.length || state.undosLeft <= 0) return;
  const snap = state.undoStack.pop();
  state.undosLeft--;
  restore(snap);
  updateUndoBtn();
}

/* ---------- Selector de modo ---------- */
function setMode(mode) {
  state.mode = mode === "blackhole" ? "blackhole" : "classic";
  const isBlack = state.mode === "blackhole";
  modeClassicBtn.classList.toggle("is-active", !isBlack);
  modeBlackholeBtn.classList.toggle("is-active", isBlack);
  modeClassicBtn.setAttribute("aria-pressed", String(!isBlack));
  modeBlackholeBtn.setAttribute("aria-pressed", String(isBlack));
  localStorage.setItem(MODE_KEY, state.mode);
}

function loadMode() {
  setMode(localStorage.getItem(MODE_KEY) === "blackhole" ? "blackhole" : "classic");
}

/* ---------- Marcador y récord ---------- */
function updateScore() {
  scoreEl.textContent = state.score;
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem(BEST_KEY, String(state.best));
    bestEl.textContent = state.best;
  }
}

function loadBest() {
  const raw = parseInt(localStorage.getItem(BEST_KEY) || "0", 10);
  state.best = Number.isFinite(raw) ? raw : 0;
  bestEl.textContent = state.best;
}

// Indicador flotante "+N" que sube y se desvanece sobre el marcador.
function showScoreAdd(amount) {
  if (prefersReducedMotion()) return; // sin animación no hay nada que mostrar
  const add = document.createElement("span");
  add.className = "score-add";
  add.textContent = `+${amount}`;
  scoreStat.appendChild(add);
  add.addEventListener("animationend", () => add.remove());
}

/* ---------- Overlays ---------- */
function showWin() {
  ovEmoji.textContent = "🎉";
  ovTitle.textContent = "You win!";
  ovMsg.textContent = `You reached 2048 with ${state.score} points`;
  keepGoingBtn.hidden = false;
  overlay.hidden = false;
  keepGoingBtn.focus();
  launchConfetti();
}

function showGameOver() {
  ovEmoji.textContent = "💀";
  ovTitle.textContent = "Game over";
  ovMsg.textContent = `No more moves · Score ${state.score}`;
  keepGoingBtn.hidden = true;
  overlay.hidden = false;
  restartBtn.focus();
}

function hideOverlay() {
  overlay.hidden = true;
}

/* ---------- Nueva partida ---------- */
function setup() {
  state.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  state.removing = [];
  state.score = 0;
  state.won = false;
  state.keepGoing = false;
  state.over = false;

  // Reinicia modo Agujero Negro y deshaceres
  state.moves = 0;
  state.blocked = new Set();
  state.undoStack = [];
  state.undosLeft = UNDO_MAX;

  // Vacía la capa de fichas, vórtices y el registro de elementos
  tileLayer.innerHTML = "";
  state.tileEls.clear();
  state.blockedEls.clear();

  hideOverlay();
  updateUndoBtn();
  addRandomTile();
  addRandomTile();
  updateScore();
  render();
}

/* ---------- Confeti de victoria (canvas, sin librerías) ---------- */
function launchConfetti() {
  if (prefersReducedMotion()) return;
  const ctx = confettiCanvas.getContext("2d");
  const rect = confettiCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  confettiCanvas.width = rect.width * dpr;
  confettiCanvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  const colors = ["#7c5cff", "#22d3ee", "#f472b6", "#34d399", "#ffb703"];
  const parts = Array.from({ length: 90 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 80,
    y: H / 2,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -9 - 3,
    size: Math.random() * 6 + 4,
    color: colors[(Math.random() * colors.length) | 0],
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
  }));
  let frames = 0;
  (function tick() {
    ctx.clearRect(0, 0, W, H);
    frames++;
    let alive = false;
    for (const p of parts) {
      p.vy += 0.32; // gravedad
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y < H + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frames / 120);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (alive && frames < 130) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, W, H);
  })();
}

/* ---------- Controles de teclado ---------- */
const KEY_DIR = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right",
};
window.addEventListener("keydown", (e) => {
  // Atajo de deshacer: U o Z (sin modificadores, para no chocar con Ctrl+Z)
  if ((e.key === "u" || e.key === "U" || e.key === "z" || e.key === "Z") &&
      !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    undo();
    return;
  }
  const dir = KEY_DIR[e.key];
  if (!dir) return;
  e.preventDefault(); // evita el scroll de la página con las flechas
  move(dir);
});

/* ---------- Controles táctiles (swipe) ---------- */
const SWIPE_MIN = 24; // umbral mínimo en px para detectar dirección
let touchStartX = 0, touchStartY = 0, touching = false;

boardWrap.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  touching = true;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

// preventDefault para que el swipe dentro del tablero no haga scroll de página
boardWrap.addEventListener("touchmove", (e) => {
  if (touching) e.preventDefault();
}, { passive: false });

boardWrap.addEventListener("touchend", (e) => {
  if (!touching) return;
  touching = false;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  if (Math.max(absX, absY) < SWIPE_MIN) return;
  if (absX > absY) move(dx > 0 ? "right" : "left");
  else move(dy > 0 ? "down" : "up");
});

/* ---------- Eventos de botones ---------- */
newGameBtn.addEventListener("click", setup);
restartBtn.addEventListener("click", setup);
undoBtn.addEventListener("click", undo);

// Cambiar de modo reinicia la partida
modeClassicBtn.addEventListener("click", () => {
  if (state.mode === "classic") return;
  setMode("classic");
  setup();
});
modeBlackholeBtn.addEventListener("click", () => {
  if (state.mode === "blackhole") return;
  setMode("blackhole");
  setup();
});
keepGoingBtn.addEventListener("click", () => {
  state.keepGoing = true;
  hideOverlay();
  // Caso límite: si se ganó justo al llenar el tablero sin más jugadas,
  // tras "Keep going" la partida ya está terminada.
  if (!movesAvailable()) {
    state.over = true;
    showGameOver();
  }
});

// Reposiciona las fichas si cambia el tamaño de la ventana (los porcentajes
// ya son responsive; forzamos repintado por si el navegador lo necesita).
window.addEventListener("resize", () => {
  forEachTile((tile) => {
    const el = state.tileEls.get(tile.id);
    if (el) placeTile(el, tile.r, tile.c);
  });
  // Reposiciona los vórtices y reajusta el canvas de efectos
  state.blockedEls.forEach((el, key) => {
    const [r, c] = key.split(",").map(Number);
    placeTile(el, r, c);
  });
  resizeFx();
});

/* ---------- Arranque ---------- */
function init() {
  // Construye la rejilla de fondo (16 celdas vacías)
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    gridBg.appendChild(cell);
  }
  loadBest();
  loadMode();
  resizeFx();
  setup();
}
init();
