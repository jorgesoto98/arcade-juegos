/* ============================================================
   Starword — Wordle cósmico (HTML/CSS/JS puro)
   ------------------------------------------------------------
   Adivina una palabra de 5 letras en 6 intentos.
   - Modo Daily: palabra DETERMINISTA por fecha (seed YYYYMMDD),
     igual para todos ese día; el progreso persiste en localStorage.
   - Modo Practice: palabra aleatoria, infinita.
   Feedback por casilla: correcta (morado/acento), presente (ámbar),
   ausente (gris), con volteo al evaluar. Teclado físico y en pantalla.
   Estadísticas, compartir como rejilla de emojis y accesibilidad.
   ============================================================ */

/* ---------- Constantes ---------- */
const WORD_LEN = 5;
const MAX_ROWS = 6;
const KB_LAYOUT = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["enter", "z", "x", "c", "v", "b", "n", "m", "back"],
];

/* Datos de palabras (words.js). answers = soluciones; el set de
   validación = answers ∪ allowed. */
const ANSWERS = (window.STARWORD && window.STARWORD.answers) || [];
const VALID = new Set([
  ...ANSWERS,
  ...((window.STARWORD && window.STARWORD.allowed) || []),
]);

/* ---------- Referencias al DOM ---------- */
const boardEl = document.getElementById("board");
const keyboardEl = document.getElementById("keyboard");
const toastEl = document.getElementById("toast");
const modeDailyBtn = document.getElementById("modeDaily");
const modePracticeBtn = document.getElementById("modePractice");
const helpBtn = document.getElementById("helpBtn");
const statsBtn = document.getElementById("statsBtn");

const statsModal = document.getElementById("statsModal");
const statsClose = document.getElementById("statsClose");
const resultBanner = document.getElementById("resultBanner");
const resultEmoji = document.getElementById("resultEmoji");
const resultText = document.getElementById("resultText");
const resultAnswer = document.getElementById("resultAnswer");
const stPlayed = document.getElementById("stPlayed");
const stWin = document.getElementById("stWin");
const stStreak = document.getElementById("stStreak");
const stMax = document.getElementById("stMax");
const distEl = document.getElementById("dist");
const shareBtn = document.getElementById("shareBtn");
const newWordBtn = document.getElementById("newWordBtn");
const nextNote = document.getElementById("nextNote");

const helpModal = document.getElementById("helpModal");
const helpClose = document.getElementById("helpClose");

/* ---------- Estado del juego ---------- */
const state = {
  mode: "daily",       // "daily" | "practice"
  answer: "",          // palabra solución
  guesses: [],         // intentos enviados (strings)
  current: "",         // texto en la fila activa
  row: 0,              // índice de la fila activa
  over: false,         // partida terminada
  won: false,
  animating: false,    // bloquea input durante el volteo
  keyState: {},        // letra -> "correct" | "present" | "absent"
};

/* ---------- Claves de localStorage ---------- */
const LS_STATS = "starword.stats";
const LS_DAILY = "starword.daily";

/* ============================================================
   Utilidades de fecha / semilla determinista
   ============================================================ */
function todayKey(d = new Date()) {
  // Fecha local en formato YYYYMMDD (string) — estable por día.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function dailyIndex(key) {
  // Hash determinista del string YYYYMMDD para indexar ANSWERS.
  // (mezcla simple para repartir mejor que el módulo directo)
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % ANSWERS.length;
}

function dailyAnswer() {
  return ANSWERS[dailyIndex(todayKey())];
}

function randomAnswer() {
  return ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
}

/* ============================================================
   Estadísticas
   ============================================================ */
function defaultStats() {
  return {
    played: 0,
    wins: 0,
    streak: 0,
    maxStreak: 0,
    dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(LS_STATS);
    if (!raw) return defaultStats();
    const s = JSON.parse(raw);
    return { ...defaultStats(), ...s, dist: { ...defaultStats().dist, ...(s.dist || {}) } };
  } catch {
    return defaultStats();
  }
}

function saveStats(s) {
  try { localStorage.setItem(LS_STATS, JSON.stringify(s)); } catch {}
}

/* Registra el resultado de una partida terminada en las estadísticas.
   La racha sube con cada victoria y se reinicia al perder. */
function recordResult(won, rowsUsed) {
  const s = loadStats();
  s.played += 1;
  if (won) {
    s.wins += 1;
    s.streak += 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    s.dist[rowsUsed] = (s.dist[rowsUsed] || 0) + 1;
  } else {
    s.streak = 0;
  }
  saveStats(s);
}

/* ============================================================
   Persistencia del modo diario (para no repetir y poder restaurar)
   ============================================================ */
function loadDaily() {
  try {
    const raw = localStorage.getItem(LS_DAILY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDaily() {
  if (state.mode !== "daily") return;
  const data = {
    date: todayKey(),
    guesses: state.guesses,
    over: state.over,
    won: state.won,
  };
  try { localStorage.setItem(LS_DAILY, JSON.stringify(data)); } catch {}
}

/* ============================================================
   Construcción del tablero y el teclado
   ============================================================ */
function buildBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < MAX_ROWS; r++) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.row = r;
    for (let c = 0; c < WORD_LEN; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = r;
      tile.dataset.col = c;
      row.appendChild(tile);
    }
    boardEl.appendChild(row);
  }
}

function buildKeyboard() {
  keyboardEl.innerHTML = "";
  for (const rowKeys of KB_LAYOUT) {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row";
    for (const k of rowKeys) {
      const btn = document.createElement("button");
      btn.className = "key";
      btn.dataset.key = k;
      if (k === "enter") { btn.textContent = "Enter"; btn.classList.add("key-wide"); }
      else if (k === "back") { btn.textContent = "⌫"; btn.classList.add("key-wide"); btn.setAttribute("aria-label", "Backspace"); }
      else btn.textContent = k;
      btn.addEventListener("click", () => handleKey(k));
      rowEl.appendChild(btn);
    }
    keyboardEl.appendChild(rowEl);
  }
}

function tileAt(r, c) {
  return boardEl.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`);
}

function rowAt(r) {
  return boardEl.querySelector(`.row[data-row="${r}"]`);
}

/* ============================================================
   Evaluación de un intento (con manejo de letras repetidas)
   Devuelve un array de WORD_LEN con "correct" | "present" | "absent".
   ============================================================ */
function evaluate(guess, answer) {
  const res = new Array(WORD_LEN).fill("absent");
  const counts = {};
  for (const ch of answer) counts[ch] = (counts[ch] || 0) + 1;

  // 1ª pasada: correctas (verde) consumen una ocurrencia.
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === answer[i]) {
      res[i] = "correct";
      counts[guess[i]] -= 1;
    }
  }
  // 2ª pasada: presentes (ámbar) si queda ocurrencia disponible.
  for (let i = 0; i < WORD_LEN; i++) {
    if (res[i] === "correct") continue;
    const ch = guess[i];
    if (counts[ch] > 0) {
      res[i] = "present";
      counts[ch] -= 1;
    }
  }
  return res;
}

/* Prioridad para no degradar el color de una tecla ya marcada. */
const RANK = { correct: 3, present: 2, absent: 1 };
function updateKeyState(guess, result) {
  for (let i = 0; i < WORD_LEN; i++) {
    const ch = guess[i];
    const next = result[i];
    if (!state.keyState[ch] || RANK[next] > RANK[state.keyState[ch]]) {
      state.keyState[ch] = next;
    }
  }
}

function paintKeyboard() {
  keyboardEl.querySelectorAll(".key").forEach((btn) => {
    const k = btn.dataset.key;
    btn.classList.remove("correct", "present", "absent");
    if (state.keyState[k]) btn.classList.add(state.keyState[k]);
  });
}

/* ============================================================
   Render de la fila activa y de filas ya enviadas
   ============================================================ */
function renderCurrent() {
  for (let c = 0; c < WORD_LEN; c++) {
    const tile = tileAt(state.row, c);
    const ch = state.current[c] || "";
    tile.textContent = ch;
    tile.classList.toggle("filled", !!ch);
  }
}

/* Pinta una fila ya jugada sin animación (para restaurar partidas). */
function paintRowInstant(r, guess) {
  const result = evaluate(guess, state.answer);
  for (let c = 0; c < WORD_LEN; c++) {
    const tile = tileAt(r, c);
    tile.textContent = guess[c];
    tile.classList.remove("filled");
    tile.classList.add(result[c]);
  }
  updateKeyState(guess, result);
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const reduceMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Volteo escalonado de las casillas al evaluar un intento. */
async function revealRow(r, guess, result) {
  state.animating = true;
  const step = reduceMotion ? 0 : 220;
  for (let c = 0; c < WORD_LEN; c++) {
    const tile = tileAt(r, c);
    if (reduceMotion) {
      tile.classList.add(result[c]);
    } else {
      tile.classList.add("flip");
      // Aplica el color a mitad del volteo (cuando la casilla está "de canto").
      await sleep(step / 2);
      tile.classList.add(result[c]);
      await sleep(step / 2);
    }
  }
  state.animating = false;
}

/* ============================================================
   Mensajes / anuncios (aria-live)
   ============================================================ */
let toastTimer = null;
function announce(msg, sticky = false) {
  toastEl.innerHTML = msg ? `<span class="pill">${msg}</span>` : "";
  clearTimeout(toastTimer);
  if (msg && !sticky) {
    toastTimer = setTimeout(() => { toastEl.innerHTML = ""; }, 1600);
  }
}

/* ============================================================
   Entrada de letras / borrado / envío
   ============================================================ */
function handleKey(key) {
  if (state.over || state.animating) return;
  if (key === "enter") return submitGuess();
  if (key === "back") return deleteLetter();
  if (/^[a-z]$/.test(key)) return addLetter(key);
}

function addLetter(ch) {
  if (state.current.length >= WORD_LEN) return;
  state.current += ch;
  renderCurrent();
}

function deleteLetter() {
  if (!state.current.length) return;
  state.current = state.current.slice(0, -1);
  renderCurrent();
}

async function submitGuess() {
  if (state.current.length < WORD_LEN) {
    shakeRow();
    announce("Not enough letters");
    return;
  }
  const guess = state.current;
  if (!VALID.has(guess)) {
    shakeRow();
    announce("Not in word list");
    return;
  }

  const result = evaluate(guess, state.answer);
  await revealRow(state.row, guess, result);

  state.guesses.push(guess);
  updateKeyState(guess, result);
  paintKeyboard();

  const won = guess === state.answer;
  state.current = "";
  state.row += 1;

  if (won) {
    finishGame(true);
  } else if (state.row >= MAX_ROWS) {
    finishGame(false);
  } else {
    saveDaily();
  }
}

function shakeRow() {
  const row = rowAt(state.row);
  if (!row) return;
  row.classList.remove("shake");
  void row.offsetWidth; // reinicia la animación
  row.classList.add("shake");
}

/* ============================================================
   Fin de partida
   ============================================================ */
let statsTimer = null; // timeout pendiente para abrir las estadísticas al terminar

async function finishGame(won) {
  state.over = true;
  state.won = won;
  recordResult(won, state.guesses.length);
  saveDaily();

  if (won) {
    announce(["Stellar!", "Cosmic!", "Brilliant!", "Nova!", "Stargazer!"][Math.min(state.guesses.length - 1, 4)]);
    if (!reduceMotion) {
      const r = state.row - 1;
      for (let c = 0; c < WORD_LEN; c++) {
        const tile = tileAt(r, c);
        tile.style.animationDelay = `${c * 90}ms`;
        tile.classList.add("bounce");
      }
    }
    if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
  } else {
    announce(state.answer.toUpperCase(), true);
  }

  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => openStats(true), won ? 1400 : 900);
}

/* ============================================================
   Compartir (rejilla de emojis)
   🟪 correcta · 🟦 presente · ⬛ ausente
   ============================================================ */
function buildShareText() {
  const head =
    state.mode === "daily"
      ? `Starword ${todayKey()}`
      : "Starword (Practice)";
  const score = state.won ? `${state.guesses.length}/${MAX_ROWS}` : `X/${MAX_ROWS}`;
  const lines = state.guesses.map((g) => {
    const res = evaluate(g, state.answer);
    return res
      .map((s) => (s === "correct" ? "🟪" : s === "present" ? "🟦" : "⬛"))
      .join("");
  });
  return `${head} ${score}\n\n${lines.join("\n")}`;
}

async function shareResult() {
  const text = buildShareText();
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      announce("Copied to clipboard");
    } else {
      throw new Error("no clipboard");
    }
  } catch {
    // Respaldo: selección manual mediante textarea temporal.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); announce("Copied to clipboard"); }
    catch { announce("Copy not supported"); }
    document.body.removeChild(ta);
  }
}

/* ============================================================
   Modal de estadísticas / resultado
   ============================================================ */
function renderStats() {
  const s = loadStats();
  stPlayed.textContent = s.played;
  stWin.textContent = s.played ? Math.round((s.wins / s.played) * 100) : 0;
  stStreak.textContent = s.streak;
  stMax.textContent = s.maxStreak;

  const max = Math.max(1, ...Object.values(s.dist));
  const currentRow = state.won ? state.guesses.length : -1;
  let html = "";
  for (let i = 1; i <= MAX_ROWS; i++) {
    const count = s.dist[i] || 0;
    const pct = Math.max(8, Math.round((count / max) * 100));
    const isCur = i === currentRow ? " is-current" : "";
    html += `
      <div class="dist-row">
        <span class="dist-label">${i}</span>
        <div class="dist-bar-wrap">
          <div class="dist-bar${isCur}" style="width:${count ? pct : 8}%">${count}</div>
        </div>
      </div>`;
  }
  distEl.innerHTML = html;
}

function openStats(showResult) {
  renderStats();

  if (showResult && state.over) {
    resultBanner.hidden = false;
    if (state.won) {
      resultEmoji.textContent = "🌟";
      resultText.textContent = `Solved in ${state.guesses.length}/${MAX_ROWS}`;
      resultAnswer.innerHTML = `The star was <strong>${state.answer}</strong>`;
    } else {
      resultEmoji.textContent = "💫";
      resultText.textContent = "Out of tries";
      resultAnswer.innerHTML = `The star was <strong>${state.answer}</strong>`;
    }
    shareBtn.hidden = false;
    // En Practice ofrecemos jugar otra palabra al instante.
    newWordBtn.hidden = state.mode !== "practice";
    if (state.mode === "daily") {
      nextNote.hidden = false;
      nextNote.textContent = "Next star at midnight · switch to Practice for more";
    } else {
      nextNote.hidden = true;
    }
  } else {
    resultBanner.hidden = true;
    shareBtn.hidden = !state.over;
    newWordBtn.hidden = !(state.over && state.mode === "practice");
    nextNote.hidden = true;
  }

  statsModal.hidden = false;
}

function closeModal(modal) { modal.hidden = true; }

/* ============================================================
   Inicio / cambio de partida
   ============================================================ */
function resetState() {
  clearTimeout(statsTimer);
  state.guesses = [];
  state.current = "";
  state.row = 0;
  state.over = false;
  state.won = false;
  state.animating = false;
  state.keyState = {};
}

function startGame() {
  resetState();
  buildBoard();
  paintKeyboard();
  announce("");

  if (state.mode === "daily") {
    state.answer = dailyAnswer();
    const saved = loadDaily();
    if (saved && saved.date === todayKey()) {
      restoreGame(saved);
      return;
    }
  } else {
    state.answer = randomAnswer();
  }
}

/* Restaura una partida diaria guardada (rellena el tablero sin animar). */
function restoreGame(saved) {
  saved.guesses.forEach((g, r) => {
    paintRowInstant(r, g);
    state.guesses.push(g);
  });
  state.row = saved.guesses.length;
  paintKeyboard();

  if (saved.over) {
    state.over = true;
    state.won = saved.won;
    if (!state.won) announce(state.answer.toUpperCase(), true);
  }
}

function setMode(mode) {
  if (mode === state.mode && mode === "daily") {
    // Re-entrar a Daily no reinicia (es la misma palabra del día).
  }
  state.mode = mode;
  modeDailyBtn.classList.toggle("is-active", mode === "daily");
  modeDailyBtn.setAttribute("aria-pressed", String(mode === "daily"));
  modePracticeBtn.classList.toggle("is-active", mode === "practice");
  modePracticeBtn.setAttribute("aria-pressed", String(mode === "practice"));
  startGame();
}

/* ============================================================
   Eventos
   ============================================================ */
document.addEventListener("keydown", (e) => {
  if (!statsModal.hidden || !helpModal.hidden) {
    if (e.key === "Escape") { closeModal(statsModal); closeModal(helpModal); }
    return;
  }
  if (e.key === "Enter") { e.preventDefault(); handleKey("enter"); }
  else if (e.key === "Backspace") { e.preventDefault(); handleKey("back"); }
  else {
    const k = e.key.toLowerCase();
    if (/^[a-z]$/.test(k) && !e.metaKey && !e.ctrlKey && !e.altKey) handleKey(k);
  }
});

modeDailyBtn.addEventListener("click", () => setMode("daily"));
modePracticeBtn.addEventListener("click", () => setMode("practice"));

helpBtn.addEventListener("click", () => { helpModal.hidden = false; });
helpClose.addEventListener("click", () => closeModal(helpModal));
statsBtn.addEventListener("click", () => openStats(false));
statsClose.addEventListener("click", () => closeModal(statsModal));

shareBtn.addEventListener("click", shareResult);
newWordBtn.addEventListener("click", () => {
  closeModal(statsModal);
  state.mode = "practice";
  setMode("practice");
});

// Cerrar modales al tocar el fondo.
[statsModal, helpModal].forEach((m) => {
  m.addEventListener("click", (e) => { if (e.target === m) closeModal(m); });
});

/* ============================================================
   Arranque
   ============================================================ */
function init() {
  buildBoard();
  buildKeyboard();
  setMode("daily");
  // Si no se ha jugado nunca, muestra cómo jugar la primera vez.
  if (!localStorage.getItem(LS_STATS) && !loadDaily()) {
    helpModal.hidden = false;
  }
}
init();
