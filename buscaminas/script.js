/* ============================================================
   Minesweeper (Buscaminas) — HTML/CSS/JS puro
   ------------------------------------------------------------
   - Primer clic SIEMPRE seguro: las minas se colocan después
     del primer revelado, excluyendo la celda tocada y sus
     vecinas, para que el primer toque abra un área.
   - Revelado en cascada (flood-fill) en celdas con 0 adyacentes.
   - Banderas: clic derecho, long-press o el botón "Flag mode".
   ============================================================ */

/* ---------- Referencias al DOM ---------- */
const menuEl     = document.getElementById("menu");
const gameEl     = document.getElementById("game");
const startBtn   = document.getElementById("startBtn");
const sizeCards  = document.querySelectorAll(".size-card");

const boardEl    = document.getElementById("board");
const boardScroll= document.getElementById("boardScroll");
const minesLeftEl= document.getElementById("minesLeft");
const timeEl     = document.getElementById("time");
const bestEl     = document.getElementById("best");

const flagToggle = document.getElementById("flagToggle");
const newGameBtn = document.getElementById("newGame");
const soundToggle= document.getElementById("soundToggle");
const scanBtn    = document.getElementById("scanBtn");
const scanToast  = document.getElementById("scanToast");

const confettiCanvas = document.getElementById("confetti");
const endOverlay = document.getElementById("endOverlay");
const endEmoji   = document.getElementById("endEmoji");
const endTitle   = document.getElementById("endTitle");
const endStats   = document.getElementById("endStats");
const endAgain   = document.getElementById("endAgain");
const endMenu    = document.getElementById("endMenu");

/* ---------- Configuración de dificultades ---------- */
const DIFFS = {
  beginner:     { rows: 9,  cols: 9,  mines: 10, label: "Beginner" },
  intermediate: { rows: 16, cols: 16, mines: 40, label: "Intermediate" },
  expert:       { rows: 16, cols: 30, mines: 99, label: "Expert" },
};

/* Límites de tamaño de celda (px) por dificultad: máximo cómodo y mínimo.
   El mínimo es bajo para que Beginner/Intermediate quepan en pantalla sin
   scroll; si aun así no cabe (Expert), el contenedor hace scroll INTERNO. */
const CELL_RANGE = {
  beginner:     { min: 24, max: 46 },
  intermediate: { min: 15, max: 38 },
  expert:       { min: 14, max: 34 },
};

/* ---------- Sprites (los entrega el agente "designer") ---------- */
const MINE_IMG = '<img src="assets/mine.svg" alt="" aria-hidden="true">';
const FLAG_IMG = '<img src="assets/flag.svg" alt="" aria-hidden="true">';
// Cruz para banderas incorrectas (se muestra al perder). SVG, sin emojis.
const CROSS_IMG = '<svg class="cross" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>';

/* ---------- Iconos SVG inline (sin emojis) ---------- */
// Altavoz con/sin sonido para el botón de audio.
const ICON_SOUND_ON  = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 9.5v5a1 1 0 0 0 1 1h2.6l4 3.3a1 1 0 0 0 1.6-.8V6a1 1 0 0 0-1.6-.8l-4 3.3H4a1 1 0 0 0-1 1z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M16 9.2a4 4 0 0 1 0 5.6M18.6 6.6a7.5 7.5 0 0 1 0 10.8"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 9.5v5a1 1 0 0 0 1 1h2.6l4 3.3a1 1 0 0 0 1.6-.8V6a1 1 0 0 0-1.6-.8l-4 3.3H4a1 1 0 0 0-1 1z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M16.5 10l4 4M20.5 10l-4 4"/></svg>';
// Estrella (victoria) y mina reutilizada (derrota) para el overlay final.
const ICON_WIN  = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.5l2.85 5.8 6.4.93-4.63 4.5 1.1 6.37L12 17.8l-5.72 3.0 1.1-6.37L2.75 9.23l6.4-.93z"/></svg>';
const ICON_LOSE = '<img src="assets/mine.svg" alt="" aria-hidden="true">';

/* ---------- Estado del juego ---------- */
const state = {
  dif: "beginner",
  chosenDif: "beginner",
  rows: 9,
  cols: 9,
  mines: 10,
  grid: [],          // celdas: {mine, adj, revealed, flagged, exploded, wrong}
  cellEls: [],       // elementos DOM por índice
  flags: 0,
  revealedCount: 0,
  minesPlaced: false,
  gameOver: false,
  won: false,
  flagMode: false,
  playing: false,
  startTime: null,
  timerId: null,
  soundOn: true,
  // Onda expansiva radial del primer clic
  animating: false,  // bloquea interacción mientras corre la animación
  animToken: 0,      // invalida animaciones pendientes al reiniciar
  // Power-up Escáner
  scanUses: 1,       // usos restantes por partida
  scanArmed: false,  // a la espera de tocar una bandera
};

/* ---------- Utilidades de coordenadas ---------- */
const idx  = (r, c) => r * state.cols + c;
const rowOf = (i) => Math.floor(i / state.cols);
const colOf = (i) => i % state.cols;
const total = () => state.rows * state.cols;

/* Índices vecinos (hasta 8) dentro de los límites del tablero */
function neighbors(i) {
  const r = rowOf(i), c = colOf(i);
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        out.push(idx(nr, nc));
      }
    }
  }
  return out;
}

/* ---------- Construcción del tablero ---------- */
function buildGrid() {
  state.grid = [];
  for (let i = 0; i < total(); i++) {
    state.grid.push({
      mine: false, adj: 0,
      revealed: false, flagged: false,
      exploded: false, wrong: false,
    });
  }
}

function buildBoardDOM() {
  boardEl.innerHTML = "";
  state.cellEls = [];
  boardEl.style.setProperty("--cols", state.cols);
  const frag = document.createDocumentFragment();

  for (let i = 0; i < total(); i++) {
    const el = document.createElement("button");
    el.className = "cell";
    el.type = "button";
    el.dataset.i = i;
    setCellAria(el, i);
    frag.appendChild(el);
    state.cellEls.push(el);
  }
  boardEl.appendChild(frag);
  layout();
}

/* Calcula el tamaño de celda para que el tablero quepa en el espacio
   disponible: se ajusta al lado más restrictivo (ancho o alto) para no
   forzar scroll de página. Si ni con el mínimo cabe (Expert), el propio
   contenedor .board-scroll hace scroll interno. */
function layout() {
  const range = CELL_RANGE[state.dif] || CELL_RANGE.beginner;
  const gap = 4;
  const availW = boardScroll.clientWidth  || 320;
  const availH = boardScroll.clientHeight || 320;
  const cellByW = Math.floor((availW - (state.cols - 1) * gap) / state.cols);
  const cellByH = Math.floor((availH - (state.rows - 1) * gap) / state.rows);
  let cell = Math.min(cellByW, cellByH);
  cell = Math.max(range.min, Math.min(range.max, cell));
  boardEl.style.setProperty("--cell", cell + "px");
}

/* ---------- Etiqueta accesible de cada celda ---------- */
function setCellAria(el, i) {
  const c = state.grid[i];
  const r = rowOf(i) + 1, col = colOf(i) + 1;
  const pos = `row ${r} column ${col}`;
  let label;
  if (!c.revealed) {
    label = c.flagged ? `Flagged cell, ${pos}` : `Hidden cell, ${pos}`;
  } else if (c.mine) {
    label = `Mine, ${pos}`;
  } else if (c.adj > 0) {
    label = `${c.adj} adjacent ${c.adj === 1 ? "mine" : "mines"}, ${pos}`;
  } else {
    label = `Empty cell, ${pos}`;
  }
  el.setAttribute("aria-label", label);
}

/* ---------- Colocación de minas (tras el primer clic) ---------- */
function placeMines(safeIdx) {
  // Zona segura: la celda tocada y sus vecinas no pueden tener mina, así el
  // primer revelado siempre abre un área. El pool tiene espacio de sobra en
  // todas las dificultades (celdas - 9 ≥ minas).
  const forbidden = new Set([safeIdx, ...neighbors(safeIdx)]);
  const pool = [];
  for (let k = 0; k < total(); k++) {
    if (!forbidden.has(k)) pool.push(k);
  }

  // Selección sin repetición sacando índices al azar del pool.
  for (let m = 0; m < state.mines && pool.length; m++) {
    const j = Math.floor(Math.random() * pool.length);
    const pick = pool.splice(j, 1)[0];
    state.grid[pick].mine = true;
  }

  // Calcula los números de adyacencia.
  for (let i = 0; i < total(); i++) {
    if (state.grid[i].mine) continue;
    let n = 0;
    for (const nb of neighbors(i)) if (state.grid[nb].mine) n++;
    state.grid[i].adj = n;
  }
  state.minesPlaced = true;
}

/* ---------- Render de una celda ---------- */
function renderCell(i) {
  const c = state.grid[i];
  const el = state.cellEls[i];
  el.className = "cell";
  el.innerHTML = "";

  if (c.revealed) {
    el.classList.add("revealed");
    if (c.mine) {
      el.classList.add("mine");
      if (c.exploded) el.classList.add("exploded");
      el.innerHTML = MINE_IMG;
    } else if (c.adj > 0) {
      el.classList.add("n" + c.adj);
      el.textContent = c.adj;
    }
  } else if (c.wrong) {
    // Bandera incorrecta (se marca solo al perder): cruz SVG roja.
    el.classList.add("wrong");
    el.innerHTML = CROSS_IMG;
  } else if (c.flagged) {
    el.classList.add("flagged");
    el.innerHTML = FLAG_IMG;
  }
  setCellAria(el, i);
}

/* ---------- Flood-fill: recolecta los índices a revelar ---------- */
// Devuelve la lista de celdas que abriría el flood-fill desde `start`,
// sin modificar el estado (para poder animarlas o revelarlas de golpe).
function collectFlood(start) {
  const out = [];
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (seen.has(i)) continue;
    const c = state.grid[i];
    if (c.revealed || c.flagged) continue;
    seen.add(i);
    out.push(i);
    // Solo expandimos en celdas vacías (sin minas alrededor).
    if (c.adj === 0 && !c.mine) {
      for (const nb of neighbors(i)) {
        const nc = state.grid[nb];
        if (!nc.revealed && !nc.flagged && !seen.has(nb)) stack.push(nb);
      }
    }
  }
  return out;
}

/* ---------- Revelado en cascada inmediato ---------- */
function floodReveal(start) {
  for (const i of collectFlood(start)) {
    state.grid[i].revealed = true;
    state.revealedCount++;
    renderCell(i);
  }
}

/* ---------- Revelado radial (onda expansiva desde el clic) ---------- */
// Revela la misma área que el flood-fill, pero anillo a anillo según la
// distancia al punto del clic, para crear el efecto de onda expansiva.
function floodRevealRadial(start) {
  const cells = collectFlood(start);
  // Marcamos el estado de inmediato para mantener la lógica consistente
  // (conteo de revelados, detección de victoria) aunque el dibujo se difiera.
  for (const i of cells) {
    state.grid[i].revealed = true;
    state.revealedCount++;
  }

  const reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || cells.length <= 1) {
    for (const i of cells) renderCell(i);
    checkWin();
    return;
  }

  // Agrupa las celdas por su distancia (redondeada) al clic → anillos.
  const sr = rowOf(start), sc = colOf(start);
  const rings = new Map();
  for (const i of cells) {
    const d = Math.round(Math.hypot(rowOf(i) - sr, colOf(i) - sc));
    if (!rings.has(d)) rings.set(d, []);
    rings.get(d).push(i);
  }
  const dists = [...rings.keys()].sort((a, b) => a - b);

  // Cadencia entre anillos: acotada para que floods grandes no se eternicen.
  const step = Math.max(16, Math.min(40, Math.round(620 / dists.length)));
  const token = state.animToken;
  state.animating = true;

  dists.forEach((d, k) => {
    setTimeout(() => {
      // Si se reinició la partida, descartamos la animación pendiente.
      if (token !== state.animToken) return;
      for (const i of rings.get(d)) {
        renderCell(i);
        state.cellEls[i].classList.add("reveal-pop");
      }
      if (k === dists.length - 1) {
        state.animating = false;
        checkWin();
      }
    }, k * step);
  });
}

/* ---------- Acción: revelar / acorde ---------- */
function onReveal(i) {
  if (state.gameOver || state.won || state.animating) return;
  const c = state.grid[i];
  if (c.flagged) return;

  const firstClick = !state.minesPlaced;
  if (firstClick) {
    placeMines(i);
    startTimer();
  }

  // Clic sobre una celda numérica ya revelada → "acorde": si las
  // banderas vecinas coinciden con el número, revela el resto.
  if (c.revealed) {
    chord(i);
    return;
  }

  if (c.mine) {
    boom(i);
    return;
  }

  playClick();
  if (navigator.vibrate) navigator.vibrate(6);

  if (firstClick) {
    // Primer clic: la apertura se anima como onda expansiva radial.
    floodRevealRadial(i);
  } else {
    floodReveal(i);
    checkWin();
  }
}

function chord(i) {
  const c = state.grid[i];
  if (!c.revealed || c.adj === 0) return;
  const nbs = neighbors(i);
  let flagged = 0;
  for (const nb of nbs) if (state.grid[nb].flagged) flagged++;
  if (flagged !== c.adj) return;

  // Si alguna celda no marcada esconde mina, pierdes.
  for (const nb of nbs) {
    const nc = state.grid[nb];
    if (nc.flagged || nc.revealed) continue;
    if (nc.mine) { boom(nb); return; }
  }
  for (const nb of nbs) {
    const nc = state.grid[nb];
    if (!nc.flagged && !nc.revealed) floodReveal(nb);
  }
  playClick();
  checkWin();
}

/* ---------- Acción: bandera ---------- */
function onFlagToggle(i) {
  if (state.gameOver || state.won || state.animating) return;
  const c = state.grid[i];
  if (c.revealed) return;
  c.flagged = !c.flagged;
  state.flags += c.flagged ? 1 : -1;
  renderCell(i);
  updateMinesLeft();
  playFlag();
  if (navigator.vibrate) navigator.vibrate(c.flagged ? 12 : 6);
}

/* ---------- Derrota ---------- */
function boom(i) {
  state.gameOver = true;
  state.grid[i].exploded = true;
  setScannerArmed(false);
  stopTimer();

  // Revela todas las minas y marca banderas incorrectas.
  for (let k = 0; k < total(); k++) {
    const c = state.grid[k];
    if (c.mine) c.revealed = true;
    else if (c.flagged) { c.wrong = true; c.flagged = false; }
    renderCell(k);
  }
  playBoom();
  if (navigator.vibrate) navigator.vibrate([40, 30, 80]);
  showEnd(false);
}

/* ---------- Victoria ---------- */
function checkWin() {
  if (state.revealedCount !== total() - state.mines) return;
  state.won = true;
  setScannerArmed(false);
  stopTimer();

  // Marca todas las minas con bandera (deja el contador en 0).
  for (let k = 0; k < total(); k++) {
    const c = state.grid[k];
    if (c.mine) c.flagged = true;          // marca todas las minas
    else if (c.flagged) c.flagged = false; // limpia banderas erróneas en celdas seguras
    renderCell(k);
  }
  state.flags = state.mines;
  updateMinesLeft();

  const secs = elapsedSeconds();
  const record = saveBestIfBetter(secs);
  playWin();
  if (navigator.vibrate) navigator.vibrate([10, 40, 10, 40, 10]);
  showEnd(true, secs, record);
}

/* ---------- Overlay de fin ---------- */
function showEnd(win, secs, record) {
  const card = endOverlay.querySelector(".end-card");
  if (win) {
    card.classList.remove("lose");
    endEmoji.innerHTML = ICON_WIN;
    endTitle.textContent = "You win!";
    endStats.textContent = `${DIFFS[state.dif].label} · ${fmtTime(secs)}` +
      (record ? " · New best!" : "");
  } else {
    card.classList.add("lose");
    endEmoji.innerHTML = ICON_LOSE;
    endTitle.textContent = "Game over";
    endStats.textContent = "You hit a mine. Try again!";
  }
  setTimeout(() => {
    endOverlay.hidden = false;
    endAgain.focus();
    if (win) launchConfetti();
  }, 260);
}

/* ---------- HUD: minas restantes y temporizador ---------- */
function updateMinesLeft() {
  minesLeftEl.textContent = state.mines - state.flags;
}

function startTimer() {
  if (state.playing) return;
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

/* ---------- Mejor tiempo por dificultad (localStorage) ---------- */
function bestKey() { return `arcade-buscaminas-best-${state.dif}`; }

function loadBest() {
  const raw = localStorage.getItem(bestKey());
  if (!raw) { bestEl.textContent = "—"; return null; }
  const secs = parseInt(raw, 10);
  if (Number.isNaN(secs)) { bestEl.textContent = "—"; return null; }
  bestEl.textContent = fmtTime(secs);
  return secs;
}
function saveBestIfBetter(secs) {
  const prev = parseInt(localStorage.getItem(bestKey()) || "", 10);
  if (Number.isNaN(prev) || secs < prev) {
    localStorage.setItem(bestKey(), String(secs));
    loadBest();
    return true;
  }
  return false;
}

/* ---------- Modo bandera (toggle para móvil) ---------- */
function setFlagMode(on) {
  // Bandera y escáner son excluyentes: activar uno desarma el otro.
  if (on && state.scanArmed) setScannerArmed(false);
  state.flagMode = on;
  flagToggle.classList.toggle("is-active", on);
  flagToggle.setAttribute("aria-pressed", String(on));
  // Pista visual en el propio tablero: deja claro que tocar pondrá bandera.
  boardEl.classList.toggle("flag-mode", on);
}

/* ---------- Power-up Escáner ---------- */
// Refleja el estado del escáner en su botón (usos, armado, consumido).
function reflectScannerUI() {
  if (!scanBtn) return;
  const used = state.scanUses <= 0;
  scanBtn.disabled = used;
  scanBtn.classList.toggle("is-armed", state.scanArmed);
  scanBtn.classList.toggle("is-used", used);
  scanBtn.setAttribute("aria-pressed", String(state.scanArmed));
  const label = scanBtn.querySelector(".scan-label");
  if (label) label.textContent = used ? "Used" : (state.scanArmed ? "Aim…" : "Scanner");
  const badge = scanBtn.querySelector(".scan-badge");
  if (badge) {
    badge.textContent = String(Math.max(0, state.scanUses));
    badge.hidden = used;
  }
}

// Arma/desarma el escáner y actualiza la pista del tablero.
function setScannerArmed(on) {
  state.scanArmed = on;
  if (boardEl) boardEl.classList.toggle("scan-mode", on);
  reflectScannerUI();
}

// Botón del escáner: lo arma si hay usos y la partida ya empezó.
function toggleScanner() {
  if (state.gameOver || state.won) return;
  if (state.scanUses <= 0) return;
  if (state.scanArmed) { setScannerArmed(false); return; }
  if (!state.minesPlaced) {
    showScanToast("Make your first move first", "hint");
    return;
  }
  setFlagMode(false);   // excluyente con el modo bandera
  setScannerArmed(true);
  showScanToast("Tap a flagged cell to scan it", "hint");
}

// Escanea una bandera: revela si esconde mina o es segura, y se consume.
function doScan(i) {
  if (state.gameOver || state.won) return;
  if (!state.scanArmed || state.scanUses <= 0) return;
  const c = state.grid[i];
  if (!state.minesPlaced) { showScanToast("Reveal a cell first", "hint"); return; }
  if (!c.flagged) { showScanToast("Scan a flagged cell", "hint"); return; }

  // Consume el power-up y muestra el resultado en la celda.
  state.scanUses--;
  setScannerArmed(false);
  const el = state.cellEls[i];
  const isMine = c.mine;
  el.classList.remove("scan-safe", "scan-mine");
  void el.offsetWidth;  // reinicia la animación si se reescanea otra celda
  el.classList.add(isMine ? "scan-mine" : "scan-safe");
  setTimeout(() => el.classList.remove("scan-safe", "scan-mine"), 2600);

  showScanToast(
    isMine ? "Mine confirmed — good flag" : "No mine here — it's safe",
    isMine ? "mine" : "safe",
  );
  if (state.soundOn) tone(isMine ? 300 : 720, 0.14, isMine ? "sawtooth" : "sine", 0.05);
  if (navigator.vibrate) navigator.vibrate(isMine ? [18, 30, 18] : 14);
  reflectScannerUI();
}

// Aviso flotante con el resultado o las pistas del escáner.
let scanToastTimer = null;
function showScanToast(text, kind) {
  if (!scanToast) return;
  scanToast.hidden = false;
  scanToast.textContent = text;
  scanToast.className = "scan-toast" + (kind ? " " + kind : "");
  requestAnimationFrame(() => scanToast.classList.add("show"));
  clearTimeout(scanToastTimer);
  scanToastTimer = setTimeout(() => {
    scanToast.classList.remove("show");
    setTimeout(() => { scanToast.hidden = true; }, 220);
  }, 2200);
}

/* ---------- Interacción del tablero (delegación de eventos) ---------- */
let pressTimer = null;
let longFired = false;
let lastPointerType = "mouse";
let startX = 0, startY = 0;

function cancelPress() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
}

boardEl.addEventListener("pointerdown", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  longFired = false;
  lastPointerType = e.pointerType || "mouse";
  // Sin long-press mientras corre la animación o el escáner está armado.
  if (state.animating || state.scanArmed) return;
  // Con ratón, la bandera se pone con clic derecho (contextmenu).
  if (lastPointerType === "mouse") return;
  const i = Number(cell.dataset.i);
  startX = e.clientX; startY = e.clientY;
  cancelPress();
  pressTimer = setTimeout(() => {
    longFired = true;
    onFlagToggle(i);
  }, 450);
});
boardEl.addEventListener("pointerup", cancelPress);
boardEl.addEventListener("pointercancel", cancelPress);
boardEl.addEventListener("pointerleave", cancelPress);
boardEl.addEventListener("pointermove", (e) => {
  if (pressTimer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
    cancelPress(); // un desplazamiento (scroll) cancela el long-press
  }
});

boardEl.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  if (longFired) { longFired = false; return; } // ya actuó el long-press
  if (state.animating) return;
  const i = Number(cell.dataset.i);
  if (state.scanArmed) doScan(i);
  else if (state.flagMode) onFlagToggle(i);
  else onReveal(i);
});

// Clic derecho: escanea si está armado; si no, pone/quita bandera.
boardEl.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const cell = e.target.closest(".cell");
  if (!cell) return;
  if (state.animating) return;
  const i = Number(cell.dataset.i);
  if (state.scanArmed) doScan(i);
  else if (lastPointerType === "mouse") onFlagToggle(i);
});

/* ---------- Sonido (WebAudio, sin archivos) ---------- */
let audioCtx = null;
function audio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function tone(freq, dur = 0.08, type = "sine", gain = 0.05) {
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
function playClick() { tone(420, 0.05, "triangle", 0.04); }
function playFlag()  { tone(560, 0.06, "square", 0.035); }
function playWin() {
  if (!state.soundOn) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.22, "sine", 0.06), i * 110));
}
function playBoom() {
  if (!state.soundOn) return;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);
  g.gain.setValueAtTime(0.08, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
  osc.connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.45);
}
function loadSoundPref() {
  state.soundOn = localStorage.getItem("arcade-buscaminas-sound") !== "off";
  reflectSoundUI();
}
function reflectSoundUI() {
  soundToggle.innerHTML = state.soundOn ? ICON_SOUND_ON : ICON_SOUND_OFF;
  soundToggle.classList.toggle("is-muted", !state.soundOn);
  soundToggle.setAttribute("aria-pressed", String(state.soundOn));
}
function toggleSound() {
  state.soundOn = !state.soundOn;
  localStorage.setItem("arcade-buscaminas-sound", state.soundOn ? "on" : "off");
  reflectSoundUI();
  if (state.soundOn) tone(660, 0.1, "sine", 0.05);
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
      p.vy += 0.32;
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

/* ---------- Flujo de menú / nueva partida ---------- */
function selectDif(dif) {
  state.chosenDif = dif;
  sizeCards.forEach((c) => c.classList.toggle("is-active", c.dataset.dif === dif));
}

function resetState() {
  state.flags = 0;
  state.revealedCount = 0;
  state.minesPlaced = false;
  state.gameOver = false;
  state.won = false;
  state.startTime = null;
  // Cancela cualquier onda expansiva pendiente del primer clic.
  state.animating = false;
  state.animToken++;
  stopTimer();
  setFlagMode(false);
  // Reinicia el power-up Escáner.
  state.scanUses = 1;
  state.scanArmed = false;
  if (boardEl) boardEl.classList.remove("scan-mode");
  if (scanToast) {
    scanToast.hidden = true;
    scanToast.className = "scan-toast";
  }
  reflectScannerUI();
  endOverlay.hidden = true;
  timeEl.textContent = "0:00";
}

// Prepara una partida nueva con la dificultad actual (state.dif).
function setupBoard() {
  resetState();
  buildGrid();
  buildBoardDOM();
  updateMinesLeft();
  loadBest();
}

function startGame() {
  const cfg = DIFFS[state.chosenDif] || DIFFS.beginner;
  state.dif = state.chosenDif;
  state.rows = cfg.rows;
  state.cols = cfg.cols;
  state.mines = cfg.mines;

  // Mostramos la vista ANTES de construir el tablero para que layout()
  // mida el ancho real del contenedor (oculto mediría 0).
  menuEl.hidden = true;
  gameEl.hidden = false;
  setupBoard();
}

// Reinicia con la misma dificultad.
function newGame() { setupBoard(); }

function showMenu() {
  stopTimer();
  endOverlay.hidden = true;
  gameEl.hidden = true;
  menuEl.hidden = false;
  selectDif(state.chosenDif);
}

/* ---------- Eventos ---------- */
sizeCards.forEach((card) => {
  card.addEventListener("click", () => selectDif(card.dataset.dif));
});
startBtn.addEventListener("click", startGame);
newGameBtn.addEventListener("click", newGame);
flagToggle.addEventListener("click", () => setFlagMode(!state.flagMode));
scanBtn.addEventListener("click", toggleScanner);
soundToggle.addEventListener("click", toggleSound);
endAgain.addEventListener("click", newGame);
endMenu.addEventListener("click", showMenu);

window.addEventListener("resize", () => {
  if (!gameEl.hidden) layout();
});

/* ---------- Arranque ---------- */
function init() {
  loadSoundPref();
  selectDif("beginner");
}
init();
