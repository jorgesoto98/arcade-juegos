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
const ghostToggle = document.getElementById("ghostToggle");
const confettiCanvas = document.getElementById("confetti");
const menuEl    = document.getElementById("menu");
const gameEl    = document.getElementById("game");
const startBtn  = document.getElementById("startBtn");
const dailyBtn  = document.getElementById("dailyBtn");
const modeBadge = document.getElementById("modeBadge");
const sizeCards = document.querySelectorAll(".size-card");

const state = {
  n: 4,            // dimensión del tablero (n x n)
  chosenSize: 4,   // tamaño seleccionado en el menú
  mode: "free",    // "free" (mezcla aleatoria) | "daily" (reto diario determinista)
  tiles: [],       // array de longitud n*n; valor 0 = hueco
  tileEls: new Map(), // valor -> elemento DOM
  moves: 0,
  moveSeq: [],     // secuencia de índices tocados (para el fantasma del récord)
  scramble: [],    // arreglo inicial tras mezclar (punto de partida del fantasma)
  startTime: null,
  timerId: null,
  playing: false,
  solvedFlag: false,
  solving: false,     // true mientras el auto-solver anima la solución
  autoSolved: false,  // la última victoria fue por el botón Solve
  maxCombo: 1,        // mayor cantidad de fichas movidas de un solo toque
  soundOn: true,
};

/* Estado del fantasma del récord (replay semitransparente de tu mejor solución) */
const ghost = {
  on: true,          // preferencia del usuario
  els: new Map(),    // valor -> elemento DOM de la capa fantasma
  layer: null,       // contenedor de la capa fantasma
  tiles: [],         // arreglo actual del replay
  scramble: [],      // punto de partida del replay
  sequence: [],      // movimientos a reproducir
  step: 0,           // índice del movimiento actual
  timer: null,       // setTimeout en curso
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
/* Aplica el deslizamiento sobre un arreglo cualquiera (puro, sin tocar el
   estado global). Lo usan tanto el juego real como el replay del fantasma. */
function slideOnArray(arr, n, clickIndex) {
  const bi = arr.indexOf(0);
  const br = Math.floor(bi / n), bc = bi % n;
  const cr = Math.floor(clickIndex / n), cc = clickIndex % n;
  const at = (r, c) => r * n + c;

  if (cr === br && cc === bc) return 0; // tocó el propio hueco

  if (cr === br) {
    // Misma fila: desplazamiento horizontal
    if (cc < bc) {
      // hueco a la derecha: empujar fichas [cc..bc-1] a la derecha
      for (let c = bc; c > cc; c--) arr[at(br, c)] = arr[at(br, c - 1)];
    } else {
      for (let c = bc; c < cc; c++) arr[at(br, c)] = arr[at(br, c + 1)];
    }
    arr[clickIndex] = 0;
    return Math.abs(cc - bc);
  }

  if (cc === bc) {
    // Misma columna: desplazamiento vertical
    if (cr < br) {
      for (let r = br; r > cr; r--) arr[at(r, bc)] = arr[at(r - 1, bc)];
    } else {
      for (let r = br; r < cr; r++) arr[at(r, bc)] = arr[at(r + 1, bc)];
    }
    arr[clickIndex] = 0;
    return Math.abs(cr - br);
  }

  return 0; // no alineada con el hueco
}

function slide(clickIndex) {
  return slideOnArray(state.tiles, state.n, clickIndex);
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
  buildGhostLayer(); // capa fantasma detrás de las fichas reales
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

/* ---------- Fantasma del récord ----------
   Reproduce en bucle, en una capa semitransparente detrás de las fichas,
   la secuencia de movimientos de tu mejor partida. En modo diario el
   fantasma corre sobre el MISMO puzzle, así que compites contra tu récord;
   en modo libre es un replay ambiental de tu mejor solución por tamaño.
   Se omite si no hay récord guardado o con prefers-reduced-motion. */
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Construye los elementos DOM de la capa fantasma (uno por ficha). */
function buildGhostLayer() {
  const layer = document.createElement("div");
  layer.className = "ghost-layer";
  layer.setAttribute("aria-hidden", "true");
  ghost.els.clear();
  const { size } = tileMetrics();
  const fontSize = `clamp(1.1rem, ${Math.round(40 / state.n)}vw, 2.6rem)`;
  for (let v = 1; v < state.n * state.n; v++) {
    const el = document.createElement("div");
    el.className = "ghost-tile";
    el.textContent = v;
    el.style.width = size;
    el.style.height = size;
    el.style.fontSize = fontSize;
    layer.appendChild(el);
    ghost.els.set(v, el);
  }
  ghost.layer = layer;
  boardEl.appendChild(layer);
}

/* Lee del récord actual (según modo) el scramble + la secuencia del fantasma.
   Devuelve true si hay un replay válido para el tamaño actual. */
function refreshGhostRecord() {
  const rec = readRecord(currentKey());
  if (rec && Array.isArray(rec.scramble) && Array.isArray(rec.sequence) &&
      rec.scramble.length === state.n * state.n && rec.sequence.length) {
    ghost.scramble = rec.scramble;
    ghost.sequence = rec.sequence;
    return true;
  }
  ghost.scramble = [];
  ghost.sequence = [];
  return false;
}

function showGhostLayer() { if (ghost.layer) ghost.layer.style.display = ""; }
function hideGhostLayer() { if (ghost.layer) ghost.layer.style.display = "none"; }

function stopGhost() {
  if (ghost.timer) { clearTimeout(ghost.timer); ghost.timer = null; }
}

/* Coloca las fichas fantasma según ghost.tiles (mismas métricas que el tablero). */
function positionGhost() {
  const { step } = tileMetrics();
  ghost.tiles.forEach((v, i) => {
    if (v === 0) return;
    const el = ghost.els.get(v);
    if (!el) return;
    el.style.left = `calc(${step} * ${i % state.n})`;
    el.style.top  = `calc(${step} * ${Math.floor(i / state.n)})`;
  });
}

/* Inicia (o reinicia) el replay del fantasma si procede. */
function startGhost() {
  stopGhost();
  const has = refreshGhostRecord();
  if (!has || !ghost.on || prefersReducedMotion() || state.solvedFlag) {
    hideGhostLayer();
    return;
  }
  showGhostLayer();
  ghost.tiles = ghost.scramble.slice();
  ghost.step = 0;
  positionGhost();
  ghost.timer = setTimeout(ghostTick, 900); // pausa breve antes de arrancar
}

/* Un paso del replay: avanza un movimiento o reinicia el bucle al terminar. */
function ghostTick() {
  if (!ghost.on || prefersReducedMotion() || state.solvedFlag || !ghost.sequence.length) {
    stopGhost();
    return;
  }
  if (ghost.step >= ghost.sequence.length) {
    // fin del replay → pausa y vuelve a empezar
    ghost.tiles = ghost.scramble.slice();
    ghost.step = 0;
    positionGhost();
    ghost.timer = setTimeout(ghostTick, 1600);
    return;
  }
  slideOnArray(ghost.tiles, state.n, ghost.sequence[ghost.step]);
  ghost.step++;
  positionGhost();
  ghost.timer = setTimeout(ghostTick, 420);
}

function loadGhostPref() {
  ghost.on = localStorage.getItem("slidingpuzzle.ghost") !== "off";
  reflectGhostUI();
}
function reflectGhostUI() {
  ghostToggle.classList.toggle("is-muted", !ghost.on);
  ghostToggle.setAttribute("aria-pressed", String(ghost.on));
}
function toggleGhost() {
  ghost.on = !ghost.on;
  localStorage.setItem("slidingpuzzle.ghost", ghost.on ? "on" : "off");
  reflectGhostUI();
  if (ghost.on) startGhost();
  else { stopGhost(); hideGhostLayer(); }
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
  state.moveSeq.push(i); // registra el índice tocado para el fantasma del récord

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

/* ---------- PRNG seedeable (para el reto diario) ----------
   mulberry32: PRNG rápido y determinista a partir de una semilla de 32 bits.
   La misma semilla produce SIEMPRE la misma secuencia → mismo puzzle. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* Hash de cadena a entero de 32 bits (FNV-1a) para sembrar el PRNG. */
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/* Fecha de hoy como número YYYYMMDD (semilla base del reto diario). */
function todayYMD() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
/* Semilla del reto diario: depende de la fecha y del tamaño elegido, así cada
   tamaño tiene su propio puzzle fijo del día (igual para todos). */
function dailySeed() {
  return hashSeed(`${todayYMD()}-${state.n}`);
}

/* ---------- Mezcla solucionable ----------
   Hacemos movimientos aleatorios válidos desde el estado resuelto usando el
   rng dado: así el puzzle SIEMPRE tiene solución (sin problemas de paridad).
   Con Math.random la mezcla es aleatoria; con un PRNG seedeado es determinista. */
function scrambleTiles(rng) {
  state.tiles = solvedTiles(state.n);
  const n = state.n;
  const reps = n * n * 18;
  let lastBlank = -1;
  let k = 0;

  // Hace 'reps' movimientos; si por casualidad termina resuelto, sigue moviendo
  // con el MISMO rng (preserva el determinismo) hasta quedar desordenado.
  while (k < reps || isSolved()) {
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
    const pool = filtered.length ? filtered : candidates;
    const pick = pool[Math.floor(rng() * pool.length)];
    lastBlank = bi;
    slide(pick);
    k++;
    if (k > reps + 500) break; // salvaguarda contra bucle infinito
  }
}

/* Aplica una mezcla con el rng dado y reinicia el estado para empezar a jugar. */
function applyScramble(rng) {
  scrambleTiles(rng);
  resetProgress();
  state.moveSeq = [];
  state.scramble = state.tiles.slice();
  state.solvedFlag = false;
  state.solving = false;
  state.autoSolved = false;
  boardEl.classList.remove("solved");
  winOverlay.hidden = true;
  positionTiles();
  startGhost();
}

/* Re-mezcla según el modo actual: libre = nueva aleatoria; diario = mismo
   puzzle del día (determinista, sirve de "reiniciar"). */
function reshuffle() {
  applyScramble(state.mode === "daily" ? mulberry32(dailySeed()) : Math.random);
  loadBest();
  updateModeUI();
  updateControlsEnabled();
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

/* ---------- Victoria + récords ----------
   El récord libre es por tamaño; el del reto diario es por fecha+tamaño. Cada
   récord guarda también el scramble y la secuencia de jugadas para el fantasma. */
function bestKey()    { return `slidingpuzzle.best.${state.n}`; }
function dailyKey()   { return `slidingpuzzle.daily.${todayYMD()}.${state.n}`; }
function currentKey() { return state.mode === "daily" ? dailyKey() : bestKey(); }

/* Lee y parsea un registro de localStorage de forma segura (null si falta o está corrupto). */
function readRecord(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); }
  catch (_) { return null; }
}

function loadBest() {
  const b = readRecord(currentKey());
  if (!b) { bestEl.textContent = "—"; return null; }
  bestEl.textContent = `${b.moves} moves · ${fmtTime(b.seconds || 0)}`;
  return b;
}

function saveBestIfBetter(moves, seconds) {
  const key = currentKey();
  const prev = readRecord(key);
  // mejor = menos movimientos; a igualdad de movimientos, menor tiempo
  const better = !prev || moves < prev.moves ||
    (moves === prev.moves && (prev.seconds == null || seconds < prev.seconds));
  if (better) {
    localStorage.setItem(key, JSON.stringify({
      moves, seconds,
      scramble: state.scramble,
      sequence: state.moveSeq.slice(),
    }));
    loadBest();
    return true;
  }
  return false;
}

function checkWin() {
  if (!isSolved()) return;
  state.solvedFlag = true;
  stopTimer();
  stopGhost();
  hideGhostLayer();
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
  stopGhost();
  hideGhostLayer();
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

/* Arranca una partida en el modo indicado: "free" (aleatorio) o "daily". */
function beginGame(mode) {
  state.mode = mode;
  state.n = state.chosenSize;
  state.tiles = solvedTiles(state.n);
  buildBoard();
  menuEl.hidden = true;
  gameEl.hidden = false;
  applyScramble(mode === "daily" ? mulberry32(dailySeed()) : Math.random);
  loadBest();
  updateModeUI();
  updateControlsEnabled();
}

/* Refleja el modo en la UI: distintivo del reto diario y etiqueta del botón. */
function updateModeUI() {
  const daily = state.mode === "daily";
  modeBadge.hidden = !daily;
  if (daily) {
    const label = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    modeBadge.textContent = `🗓️ Daily · ${label}`;
  }
  // En diario, "Shuffle" reinicia el MISMO puzzle → se etiqueta "Restart".
  shuffleBtn.textContent = daily ? "Restart" : "Shuffle";
}

function showMenu() {
  stopTimer();
  stopGhost();
  hideGhostLayer();
  winOverlay.hidden = true;
  gameEl.hidden = true;
  menuEl.hidden = false;
  selectSize(state.chosenSize);
}

/* ---------- Eventos ---------- */
sizeCards.forEach((card) => {
  card.addEventListener("click", () => selectSize(Number(card.dataset.size)));
});
startBtn.addEventListener("click", () => beginGame("free"));
dailyBtn.addEventListener("click", () => beginGame("daily"));
shuffleBtn.addEventListener("click", () => { if (!state.solving) reshuffle(); });
solveBtn.addEventListener("click", solvePuzzle);
winAgain.addEventListener("click", () => reshuffle());
winMenu.addEventListener("click", showMenu);
soundToggle.addEventListener("click", toggleSound);
ghostToggle.addEventListener("click", toggleGhost);

// Reposiciona al cambiar el tamaño de la ventana (los porcentajes ya son
// responsive; forzamos repintado por si el navegador lo necesita).
window.addEventListener("resize", () => { positionTiles(); positionGhost(); });

/* ---------- Arranque ---------- */
function init() {
  loadSoundPref();
  loadGhostPref();
  selectSize(4); // 4×4 preseleccionado en el menú; el tablero se crea al pulsar Start
}
init();
