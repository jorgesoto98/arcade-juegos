/* ============================================================
   Sliding Puzzle — con deslizamiento inteligente de fila/columna
   ------------------------------------------------------------
   Mecánica: hay un hueco (valor 0). Al tocar una ficha que está
   alineada con el hueco (misma fila O misma columna), TODAS las
   fichas entre la ficha tocada y el hueco se deslizan a la vez.
   ============================================================ */

const boardEl   = document.getElementById("board");
const movesEl   = document.getElementById("moves");
const timeEl    = document.getElementById("time");
const bestEl    = document.getElementById("best");
const shuffleBtn= document.getElementById("shuffle");
const solveBtn  = document.getElementById("solve");
const winOverlay= document.getElementById("winOverlay");
const winStats  = document.getElementById("winStats");
const winStars  = document.getElementById("winStars");
const winTitle  = document.getElementById("winTitle");
const winEmoji  = document.getElementById("winEmoji");
const winAgain  = document.getElementById("winPlayAgain");
const winMenu   = document.getElementById("winMenu");
const soundToggle = document.getElementById("soundToggle");
const confettiCanvas = document.getElementById("confetti");
const menuEl    = document.getElementById("menu");
const gameEl    = document.getElementById("game");
const startBtn  = document.getElementById("startBtn");
const sizeCards = document.querySelectorAll(".size-card");

const state = {
  n: 4,            // dimensión del tablero (n x n)
  chosenSize: 4,   // tamaño seleccionado en el menú
  tiles: [],       // array de longitud n*n; valor 0 = hueco
  tileEls: new Map(), // valor -> elemento DOM
  moves: 0,
  startTime: null,
  timerId: null,
  playing: false,
  solvedFlag: false,
  solving: false,     // true mientras el auto-solver anima la solución
  autoSolved: false,  // la última victoria fue por el botón Solve
  maxCombo: 1,        // mayor cantidad de fichas movidas de un solo toque
  soundOn: true,
};

/* ---------- Utilidades de coordenadas ---------- */
const idx  = (r, c) => r * state.n + c;
const rowOf = (i) => Math.floor(i / state.n);
const colOf = (i) => i % state.n;
const blankIndex = () => state.tiles.indexOf(0);

/* ---------- Estado resuelto ---------- */
function solvedTiles(n) {
  const arr = [];
  for (let i = 1; i < n * n; i++) arr.push(i);
  arr.push(0); // el hueco va al final
  return arr;
}

function isSolved() {
  const goal = solvedTiles(state.n);
  return state.tiles.every((v, i) => v === goal[i]);
}

/* ---------- Movimiento de fila / columna ----------
   Devuelve el NÚMERO de fichas desplazadas (0 si el movimiento no es
   válido porque la ficha no está alineada con el hueco). Reordena
   state.tiles en el sitio. */
function slide(clickIndex) {
  const bi = blankIndex();
  const br = rowOf(bi), bc = colOf(bi);
  const cr = rowOf(clickIndex), cc = colOf(clickIndex);

  if (cr === br && cc === bc) return 0; // tocó el propio hueco

  if (cr === br) {
    // Misma fila: desplazamiento horizontal
    if (cc < bc) {
      // huecos hacia la izquierda: empujar fichas [cc..bc-1] a la derecha
      for (let c = bc; c > cc; c--) {
        state.tiles[idx(br, c)] = state.tiles[idx(br, c - 1)];
      }
    } else {
      for (let c = bc; c < cc; c++) {
        state.tiles[idx(br, c)] = state.tiles[idx(br, c + 1)];
      }
    }
    state.tiles[clickIndex] = 0;
    return Math.abs(cc - bc);
  }

  if (cc === bc) {
    // Misma columna: desplazamiento vertical
    if (cr < br) {
      for (let r = br; r > cr; r--) {
        state.tiles[idx(r, bc)] = state.tiles[idx(r - 1, bc)];
      }
    } else {
      for (let r = br; r < cr; r++) {
        state.tiles[idx(r, bc)] = state.tiles[idx(r + 1, bc)];
      }
    }
    state.tiles[clickIndex] = 0;
    return Math.abs(cr - br);
  }

  return 0; // no alineada con el hueco
}

/* Lista de índices de fichas que se deslizarían al tocar clickIndex
   (la cadena entre la ficha tocada y el hueco). Vacío si no es válido. */
function chainFor(clickIndex) {
  const bi = blankIndex();
  const br = rowOf(bi), bc = colOf(bi);
  const cr = rowOf(clickIndex), cc = colOf(clickIndex);
  const out = [];
  if (cr === br && cc === bc) return out;
  if (cr === br) {
    const lo = Math.min(cc, bc), hi = Math.max(cc, bc);
    for (let c = lo; c <= hi; c++) if (c !== bc) out.push(idx(br, c));
  } else if (cc === bc) {
    const lo = Math.min(cr, br), hi = Math.max(cr, br);
    for (let r = lo; r <= hi; r++) if (r !== br) out.push(idx(r, bc));
  }
  return out;
}

/* ---------- Render ---------- */
function tileMetrics() {
  // Cada paso = ancho de ficha + gap, expresado en CSS calc para ser responsive
  const n = state.n;
  const size = `calc((100% - ${(n - 1)} * var(--gap)) / ${n})`;
  const step = `((100% - ${(n - 1)} * var(--gap)) / ${n} + var(--gap))`;
  return { size, step };
}

function buildBoard() {
  boardEl.innerHTML = "";
  state.tileEls.clear();
  const { size } = tileMetrics();
  const fontSize = `clamp(1.1rem, ${Math.round(40 / state.n)}vw, 2.6rem)`;

  for (let v = 1; v < state.n * state.n; v++) {
    const el = document.createElement("button");
    el.className = "tile";
    el.textContent = v;
    el.style.width = size;
    el.style.height = size;
    el.style.fontSize = fontSize;
    el.dataset.value = v;
    el.addEventListener("click", () => onTileClick(v));
    el.addEventListener("mouseenter", () => showPreview(v));
    el.addEventListener("mouseleave", clearPreview);
    el.addEventListener("focus", () => showPreview(v));
    el.addEventListener("blur", clearPreview);
    boardEl.appendChild(el);
    state.tileEls.set(v, el);
  }
  positionTiles();
}

function positionTiles() {
  const { step } = tileMetrics();
  const goal = solvedTiles(state.n);
  let movableNow = movableValues();

  state.tiles.forEach((v, i) => {
    if (v === 0) return;
    const el = state.tileEls.get(v);
    const r = rowOf(i), c = colOf(i);
    el.style.left = `calc(${step} * ${c})`;
    el.style.top  = `calc(${step} * ${r})`;
    el.classList.toggle("correct", goal[i] === v);
    el.classList.toggle("movable", movableNow.has(v) && !state.solvedFlag);
  });
}

/* Conjunto de valores de fichas que ahora mismo se pueden mover */
function movableValues() {
  const set = new Set();
  const bi = blankIndex();
  const br = rowOf(bi), bc = colOf(bi);
  state.tiles.forEach((v, i) => {
    if (v === 0) return;
    if (rowOf(i) === br || colOf(i) === bc) set.add(v);
  });
  return set;
}

/* ---------- Preview de la cadena que se deslizará ---------- */
function showPreview(value) {
  if (state.solvedFlag || state.solving) return;
  clearPreview();
  const i = state.tiles.indexOf(value);
  for (const ti of chainFor(i)) {
    const el = state.tileEls.get(state.tiles[ti]);
    if (el) el.classList.add("preview");
  }
}
function clearPreview() {
  state.tileEls.forEach((el) => el.classList.remove("preview"));
}

/* ---------- Interacción ---------- */
function onTileClick(value) {
  if (state.solvedFlag || state.solving) return;
  const i = state.tiles.indexOf(value);
  const count = slide(i);
  if (!count) return;

  if (!state.playing) startTimer();
  state.moves++;
  movesEl.textContent = state.moves;

  if (count > 1) state.maxCombo = Math.max(state.maxCombo, count);
  playSlide(count);
  if (navigator.vibrate) navigator.vibrate(count > 1 ? 14 : 7);

  clearPreview();
  positionTiles();
  checkWin();
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
function tone(freq, dur = 0.09, type = "sine", gain = 0.06) {
  if (!state.soundOn) return;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}
function playSlide(count) {
  // pitch sube con el tamaño del combo → recompensa auditiva por mover más
  const base = 330 + Math.min(count, 4) * 70;
  tone(base, 0.08, "triangle", 0.05);
}
function playWin() {
  if (!state.soundOn) return;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // Do-Mi-Sol-Do arpegio
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.22, "sine", 0.07), i * 110));
}
function loadSoundPref() {
  state.soundOn = localStorage.getItem("slidingpuzzle.sound") !== "off";
  reflectSoundUI();
}
function reflectSoundUI() {
  soundToggle.textContent = state.soundOn ? "🔊" : "🔇";
  soundToggle.classList.toggle("is-muted", !state.soundOn);
  soundToggle.setAttribute("aria-pressed", String(state.soundOn));
}
function toggleSound() {
  state.soundOn = !state.soundOn;
  localStorage.setItem("slidingpuzzle.sound", state.soundOn ? "on" : "off");
  reflectSoundUI();
  if (state.soundOn) tone(660, 0.1, "sine", 0.06); // pequeño feedback al activar
}

/* ---------- Mezcla solucionable ----------
   Hacemos movimientos aleatorios válidos desde el estado resuelto:
   así el puzzle SIEMPRE tiene solución (sin problemas de paridad). */
function shuffle() {
  state.tiles = solvedTiles(state.n);
  const n = state.n;
  const reps = n * n * 18;
  let lastBlank = -1;

  for (let k = 0; k < reps; k++) {
    const bi = blankIndex();
    const br = rowOf(bi), bc = colOf(bi);
    const candidates = [];

    // todas las fichas alineadas con el hueco son destinos válidos del hueco
    for (let r = 0; r < n; r++) {
      if (r !== br) candidates.push(idx(r, bc));
    }
    for (let c = 0; c < n; c++) {
      if (c !== bc) candidates.push(idx(br, c));
    }
    // evita deshacer el movimiento anterior inmediatamente
    const filtered = candidates.filter((x) => x !== lastBlank);
    const pick = (filtered.length ? filtered : candidates)[
      Math.floor(Math.random() * (filtered.length ? filtered.length : candidates.length))
    ];
    lastBlank = bi;
    slide(pick);
  }

  // garantiza que no quede ya resuelto
  if (isSolved()) return shuffle();

  resetProgress();
  state.solvedFlag = false;
  state.solving = false;
  state.autoSolved = false;
  boardEl.classList.remove("solved");
  winOverlay.hidden = true;
  positionTiles();
}

/* ---------- Timer ---------- */
function startTimer() {
  state.playing = true;
  state.startTime = Date.now();
  state.timerId = setInterval(updateTime, 250);
}
function stopTimer() {
  clearInterval(state.timerId);
  state.playing = false;
}
function elapsedSeconds() {
  return state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
}
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}
function updateTime() {
  timeEl.textContent = fmtTime(elapsedSeconds());
}

function resetProgress() {
  stopTimer();
  state.moves = 0;
  state.maxCombo = 1;
  state.startTime = null;
  movesEl.textContent = "0";
  timeEl.textContent = "0:00";
}

/* ---------- Estrellas por eficiencia ---------- */
// Umbrales de movimientos para 3/2 estrellas por tamaño (ajustables).
const STAR_THRESHOLDS = {
  3: { three: 25, two: 45 },
  4: { three: 70, two: 120 },
  5: { three: 150, two: 240 },
};
function starsFor(n, moves) {
  const t = STAR_THRESHOLDS[n] || STAR_THRESHOLDS[4];
  if (moves <= t.three) return 3;
  if (moves <= t.two) return 2;
  return 1;
}
function renderStars(stars) {
  let html = "";
  for (let i = 1; i <= 3; i++) {
    html += `<span class="${i <= stars ? "star-on" : "star-off"}">★</span>`;
  }
  winStars.innerHTML = html;
}

/* ---------- Victoria + récords ---------- */
function bestKey() { return `slidingpuzzle.best.${state.n}`; }

function loadBest() {
  const raw = localStorage.getItem(bestKey());
  if (!raw) { bestEl.textContent = "—"; return null; }
  const b = JSON.parse(raw);
  bestEl.textContent = `${b.moves} moves · ${fmtTime(b.seconds || 0)}`;
  return b;
}

function saveBestIfBetter(moves, seconds) {
  const prev = JSON.parse(localStorage.getItem(bestKey()) || "null");
  // mejor = menos movimientos; a igualdad de movimientos, menor tiempo
  const better = !prev || moves < prev.moves || (moves === prev.moves && seconds < prev.seconds);
  if (better) {
    localStorage.setItem(bestKey(), JSON.stringify({ moves, seconds }));
    loadBest();
    return true;
  }
  return false;
}

function checkWin() {
  if (!isSolved()) return;
  state.solvedFlag = true;
  stopTimer();
  clearPreview();
  boardEl.classList.add("solved");
  positionTiles();
  updateControlsEnabled();

  const secs = elapsedSeconds();

  if (state.autoSolved) {
    // Resuelto por el botón Solve: sin récord ni estrellas.
    winEmoji.textContent = "🤖";
    winTitle.textContent = "Auto-solved";
    winStars.innerHTML = "";
    winStats.textContent = "Solved by the computer";
    setTimeout(() => { winOverlay.hidden = false; winAgain.focus(); }, 280);
    return;
  }

  const stars = starsFor(state.n, state.moves);
  const record = saveBestIfBetter(state.moves, secs);

  winEmoji.textContent = "🎉";
  winTitle.textContent = "Solved!";
  renderStars(stars);
  const comboTxt = state.maxCombo > 1 ? ` · max combo ×${state.maxCombo}` : "";
  winStats.textContent =
    `${state.moves} moves · ${fmtTime(secs)}${comboTxt}` +
    (record ? " · New record!" : "");

  playWin();
  setTimeout(() => {
    winOverlay.hidden = false;
    winAgain.focus();
    launchConfetti();
  }, 280);
}

function updateControlsEnabled() {
  solveBtn.disabled = state.solving || state.solvedFlag;
  shuffleBtn.disabled = state.solving;
}

/* ---------- Confeti de victoria (canvas, sin librerías) ---------- */
function launchConfetti() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = confettiCanvas.getContext("2d");
  const rect = confettiCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  confettiCanvas.width = rect.width * dpr;
  confettiCanvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  const colors = ["#7c5cff", "#22d3ee", "#f472b6", "#34d399", "#fbbf24"];
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
      p.vy += 0.32;            // gravedad
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

/* ============================================================
   Auto-solver: IDA* ponderado (f = g + W·h) con heurística
   Manhattan + conflicto lineal. Memoria O(profundidad) — sin
   tabla de estados, así que no agota memoria ni en 5x5. Con W>1
   las soluciones no son óptimas pero se encuentran rápido; si un
   peso topa el límite de nodos, se reintenta con un W mayor, lo
   que garantiza hallar solución para cualquier puzzle resoluble.
   Devuelve la lista de celdas a las que se mueve el hueco (cada
   una adyacente a la anterior). Opera sobre una copia.
   ============================================================ */
function solveWeighted(tilesInput, N, W) {
  const SIZE = N * N;
  const tr = new Int8Array(SIZE), tc = new Int8Array(SIZE); // fila/col objetivo por valor
  for (let v = 1; v < SIZE; v++) { tr[v] = Math.floor((v - 1) / N); tc[v] = (v - 1) % N; }
  tr[0] = N - 1; tc[0] = N - 1;

  const a = Int8Array.from(tilesInput);
  function heur() {
    let s = 0;
    for (let i = 0; i < SIZE; i++) {
      const v = a[i]; if (!v) continue;
      s += Math.abs(((i / N) | 0) - tr[v]) + Math.abs((i % N) - tc[v]);
    }
    // conflicto lineal en filas y columnas
    for (let r = 0; r < N; r++) for (let c1 = 0; c1 < N; c1++) {
      const v1 = a[r * N + c1]; if (!v1 || tr[v1] !== r) continue;
      for (let c2 = c1 + 1; c2 < N; c2++) { const v2 = a[r * N + c2]; if (v2 && tr[v2] === r && tc[v1] > tc[v2]) s += 2; }
    }
    for (let c = 0; c < N; c++) for (let r1 = 0; r1 < N; r1++) {
      const v1 = a[r1 * N + c]; if (!v1 || tc[v1] !== c) continue;
      for (let r2 = r1 + 1; r2 < N; r2++) { const v2 = a[r2 * N + c]; if (v2 && tc[v2] === c && tr[v1] > tr[v2]) s += 2; }
    }
    return s;
  }
  const isGoal = () => { for (let i = 0; i < SIZE - 1; i++) if (a[i] !== i + 1) return false; return true; };
  if (isGoal()) return [];

  let blank = tilesInput.indexOf(0);
  const path = [];
  let bound = heur();
  let nodes = 0;
  const NODE_CAP = 4_000_000;

  function search(g, lastBlank) {
    nodes++;
    if (g + W * heur() > bound) return g + W * heur();
    if (isGoal()) return -1;
    if (nodes > NODE_CAP) return -2;
    let min = Infinity;
    const r = (blank / N) | 0, c = blank % N;
    const nbs = [];
    if (r > 0) nbs.push(blank - N);
    if (r < N - 1) nbs.push(blank + N);
    if (c > 0) nbs.push(blank - 1);
    if (c < N - 1) nbs.push(blank + 1);
    for (const nb of nbs) {
      if (nb === lastBlank) continue;          // no deshacer el último movimiento
      const moved = a[nb];
      a[blank] = moved; a[nb] = 0;
      const prev = blank; blank = nb; path.push(nb);
      const t = search(g + 1, prev);
      if (t === -1) return -1;
      if (t === -2) return -2;
      if (t < min) min = t;
      path.pop(); blank = prev; a[nb] = moved; a[blank] = 0; // deshacer
    }
    return min;
  }

  while (true) {
    nodes = 0;
    const t = search(0, -1);
    if (t === -1) return path.slice();
    if (t === -2 || t === Infinity) return null; // límite o sin solución con este W
    bound = t;
  }
}

function computeSolution(tilesInput, N) {
  // Pesos crecientes: más peso = más rápido pero soluciones más largas.
  const weights = N >= 5 ? [4, 7, 12, 20] : N === 4 ? [2, 4, 8] : [1, 2];
  for (const W of weights) {
    const sol = solveWeighted(tilesInput, N, W);
    if (sol) return sol;
  }
  return null;
}

/* ---------- Botón Solve: anima la solución ---------- */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function solvePuzzle() {
  if (state.solvedFlag || state.solving) return;

  // Bloquea controles y muestra "Solving…" antes del cálculo (que en 5x5
  // puede tardar ~1-2s y congela el hilo); el sleep deja repintar la UI.
  state.solving = true;
  state.autoSolved = true;
  clearPreview();
  stopTimer();
  updateControlsEnabled();
  const solveLabel = solveBtn.textContent;
  solveBtn.textContent = "Solving…";
  await sleep(30);

  const solution = computeSolution(state.tiles, state.n);
  solveBtn.textContent = solveLabel;

  if (!solution) {           // no debería ocurrir; restaura por seguridad
    state.solving = false;
    state.autoSolved = false;
    updateControlsEnabled();
    return;
  }

  const delay = solution.length > 160 ? 35 : solution.length > 80 ? 55 : solution.length > 40 ? 90 : 140;
  for (const cell of solution) {
    slide(cell);          // 'cell' es siempre adyacente al hueco → mueve 1 ficha
    positionTiles();
    await sleep(delay);
  }

  state.solving = false;
  checkWin();             // marca victoria (autoSolved) y muestra overlay
}

/* ---------- Flujo de menú ---------- */
function selectSize(n) {
  state.chosenSize = n;
  sizeCards.forEach((c) => c.classList.toggle("is-active", Number(c.dataset.size) === n));
}

function startGame() {
  state.n = state.chosenSize;
  state.tiles = solvedTiles(state.n);
  state.autoSolved = false;
  buildBoard();
  loadBest();
  shuffle();
  updateControlsEnabled();
  menuEl.hidden = true;
  gameEl.hidden = false;
}

function showMenu() {
  stopTimer();
  winOverlay.hidden = true;
  gameEl.hidden = true;
  menuEl.hidden = false;
  selectSize(state.chosenSize);
}

/* ---------- Eventos ---------- */
sizeCards.forEach((card) => {
  card.addEventListener("click", () => selectSize(Number(card.dataset.size)));
});
startBtn.addEventListener("click", startGame);
shuffleBtn.addEventListener("click", () => { if (!state.solving) shuffle(); });
solveBtn.addEventListener("click", solvePuzzle);
winAgain.addEventListener("click", () => shuffle());
winMenu.addEventListener("click", showMenu);
soundToggle.addEventListener("click", toggleSound);

// Reposiciona al cambiar el tamaño de la ventana (los porcentajes ya son
// responsive; forzamos repintado por si el navegador lo necesita).
window.addEventListener("resize", () => positionTiles());

/* ---------- Arranque ---------- */
function init() {
  loadSoundPref();
  selectSize(4); // 4×4 preseleccionado en el menú; el tablero se crea al pulsar Start
}
init();
