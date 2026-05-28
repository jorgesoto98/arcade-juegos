/* ============================================================
   Memorama (Memory) — emparejar cartas iguales
   ------------------------------------------------------------
   Mecánica: el tablero reparte parejas de cartas boca abajo.
   Al tocar una carta se voltea; con dos volteadas, si los
   símbolos coinciden quedan reveladas y deshabilitadas, y si no
   se vuelven a ocultar tras una breve pausa (la entrada queda
   bloqueada durante esa espera). Se gana al emparejar todas.

   Dificultades:
     - Easy    → 4 pares  (8 cartas, rejilla 2×4) con sym-1..4
     - Classic → 8 pares  (16 cartas, rejilla 4×4) con sym-1..8
   ============================================================ */

/* ---------- Referencias al DOM ---------- */
const boardEl     = document.getElementById("board");
const triesEl      = document.getElementById("tries");
const timeEl       = document.getElementById("time");
const bestEl       = document.getElementById("best");
const winOverlay   = document.getElementById("winOverlay");
const winStats     = document.getElementById("winStats");
const winStars     = document.getElementById("winStars");
const winTitle     = document.getElementById("winTitle");
const winEmoji     = document.getElementById("winEmoji");
const winAgain     = document.getElementById("winPlayAgain");
const winMenu      = document.getElementById("winMenu");
const soundToggle  = document.getElementById("soundToggle");
const confettiCanvas = document.getElementById("confetti");
const boardWrap    = document.querySelector(".board-wrap");
const menuEl       = document.getElementById("menu");
const gameEl       = document.getElementById("game");
const startBtn     = document.getElementById("startBtn");
const restartBtn   = document.getElementById("restart");
const menuBtn      = document.getElementById("menuBtn");
const pulseToggle  = document.getElementById("pulseToggle");
const sizeCards    = document.querySelectorAll(".size-card");

/* Duración del vistazo del Modo Pulso (ms): revela todas las cartas para memorizar */
const PULSE_PREVIEW_MS = 2000;

/* ---------- Configuración por dificultad ----------
   Parejas por dificultad. Ambas usan 4 columnas (Easy 2×4, Classic 4×4),
   por eso la rejilla fija 4 columnas directamente en el CSS. */
const PAIRS = { easy: 4, classic: 8 };

const state = {
  difficulty: "classic", // dificultad elegida en el menú
  pairs: 8,
  deck: [],          // array de símbolos barajados (1..pairs duplicados)
  cardEls: [],       // elementos DOM por índice de carta
  matched: 0,        // parejas ya emparejadas
  flipped: [],       // índices de las cartas actualmente volteadas (máx 2)
  tries: 0,          // parejas intentadas (cada segunda carta = 1 intento)
  lock: false,       // bloquea la entrada durante la pausa de no-coincidencia
  startTime: null,
  timerId: null,
  playing: false,
  won: false,
  soundOn: true,
  pulseMode: false,  // Modo Pulso: vistazo inicial a todas las cartas
  pulseTimer: null,  // id del setTimeout del vistazo (para poder cancelarlo)
};

/* ---------- Fisher-Yates: baraja in-place ---------- */
function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* Construye una baraja de `pairs` parejas (símbolos 1..pairs duplicados) y la baraja */
function buildDeck(pairs) {
  const deck = [];
  for (let s = 1; s <= pairs; s++) { deck.push(s, s); }
  return fisherYates(deck);
}

/* ---------- Render del tablero ---------- */
function buildBoard() {
  boardEl.innerHTML = "";
  state.cardEls = [];

  state.deck.forEach((symbol, i) => {
    const card = document.createElement("button");
    card.className = "card";
    card.type = "button";
    card.dataset.symbol = symbol;
    card.dataset.index = i;
    card.setAttribute("aria-label", "Card, face down");

    // Reverso (visible al inicio) + cara con el símbolo (oculta hasta voltear).
    // Las imágenes son decorativas: alt="" y aria-hidden.
    card.innerHTML =
      '<span class="card-inner">' +
        '<span class="card-back"><img src="assets/back.svg" alt="" aria-hidden="true" /></span>' +
        `<span class="card-face"><img src="assets/sym-${symbol}.svg" alt="" aria-hidden="true" /></span>` +
      '</span>';

    card.addEventListener("click", () => onCardClick(i));
    boardEl.appendChild(card);
    state.cardEls.push(card);
  });
}

/* ---------- Interacción ---------- */
function onCardClick(i) {
  if (state.won || state.lock) return;
  const card = state.cardEls[i];
  // Ignora cartas ya volteadas o ya emparejadas
  if (card.classList.contains("is-flipped") || card.classList.contains("is-matched")) return;
  // No permitir más de dos cartas volteadas a la vez
  if (state.flipped.length >= 2) return;

  if (!state.playing) startTimer();

  flipUp(i);
  playFlip();
  if (navigator.vibrate) navigator.vibrate(6);

  state.flipped.push(i);
  if (state.flipped.length === 2) {
    state.tries++;
    triesEl.textContent = state.tries;
    evaluatePair();
  }
}

function flipUp(i) {
  const card = state.cardEls[i];
  card.classList.add("is-flipped");
  card.setAttribute("aria-label", `Card showing symbol ${card.dataset.symbol}`);
}

function flipDown(i) {
  const card = state.cardEls[i];
  card.classList.remove("is-flipped");
  card.setAttribute("aria-label", "Card, face down");
}

/* Compara las dos cartas volteadas */
function evaluatePair() {
  const [a, b] = state.flipped;
  const cardA = state.cardEls[a];
  const cardB = state.cardEls[b];

  if (cardA.dataset.symbol === cardB.dataset.symbol) {
    // Coinciden → quedan reveladas y deshabilitadas
    state.lock = true; // breve bloqueo para que se aprecie el match
    setTimeout(() => {
      [cardA, cardB].forEach((c) => {
        c.classList.remove("is-flipped");
        c.classList.add("is-matched");
        c.disabled = true;
        c.setAttribute("aria-label", `Matched pair, symbol ${c.dataset.symbol}`);
      });
      state.matched++;
      state.flipped = [];
      state.lock = false;
      playMatch();
      playPing();            // "ping" agudo del sonar
      sonarPing(cardA);      // anillo concéntrico que emana de cada carta del par
      sonarPing(cardB);
      if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
      checkWin();
    }, 360);
  } else {
    // No coinciden → feedback claro (anillo + sacudida, tono grave y vibración)
    // y se vuelven a ocultar tras ~800ms con la entrada bloqueada.
    state.lock = true;
    cardA.classList.add("is-wrong");
    cardB.classList.add("is-wrong");
    playNoMatch();
    if (navigator.vibrate) navigator.vibrate(40);
    setTimeout(() => {
      cardA.classList.remove("is-wrong");
      cardB.classList.remove("is-wrong");
      flipDown(a);
      flipDown(b);
      state.flipped = [];
      state.lock = false;
    }, 800);
  }
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

/* ---------- Estrellas por eficiencia ----------
   El mínimo teórico de intentos = nº de parejas (memoria perfecta).
   3★: pocos intentos · 2★: intermedio · 1★: el resto. */
const STAR_THRESHOLDS = {
  easy:    { three: 6,  two: 9 },
  classic: { three: 12, two: 18 },
};
function starsFor(diff, tries) {
  const t = STAR_THRESHOLDS[diff] || STAR_THRESHOLDS.classic;
  if (tries <= t.three) return 3;
  if (tries <= t.two) return 2;
  return 1;
}
function renderStars(stars) {
  let html = "";
  for (let i = 1; i <= 3; i++) {
    html += `<span class="${i <= stars ? "star-on" : "star-off"}">★</span>`;
  }
  winStars.innerHTML = html;
}

/* ---------- Mejor marca por dificultad ----------
   Claves: "arcade-memorama-best-easy" / "arcade-memorama-best-classic".
   Criterio de "mejor": MENOS intentos; a igualdad de intentos, menor tiempo. */
function bestKey() { return `arcade-memorama-best-${state.difficulty}`; }

/* Lee la mejor marca guardada (o null si no hay / está corrupta) */
function readBest() {
  try { return JSON.parse(localStorage.getItem(bestKey()) || "null"); }
  catch (e) { return null; }
}

function loadBest() {
  const b = readBest();
  bestEl.textContent = b ? `${b.tries} tries · ${fmtTime(b.seconds || 0)}` : "—";
  return b;
}

function saveBestIfBetter(tries, seconds) {
  const prev = readBest();
  const better = !prev || tries < prev.tries || (tries === prev.tries && seconds < prev.seconds);
  if (better) {
    localStorage.setItem(bestKey(), JSON.stringify({ tries, seconds }));
    loadBest();
  }
  return better;
}

/* ---------- Victoria ---------- */
function checkWin() {
  if (state.matched < state.pairs) return;
  state.won = true;
  stopTimer();

  const secs = elapsedSeconds();
  const stars = starsFor(state.difficulty, state.tries);
  const record = saveBestIfBetter(state.tries, secs);

  winEmoji.textContent = "🎉";
  winTitle.textContent = "You win!";
  renderStars(stars);
  winStats.textContent =
    `${state.tries} tries · ${fmtTime(secs)}` + (record ? " · New record!" : "");

  playWin();
  setTimeout(() => {
    winOverlay.hidden = false;
    winAgain.focus();
    launchConfetti();
  }, 320);
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
function playFlip() { tone(420, 0.07, "triangle", 0.045); }
function playMatch() {
  // pequeño arpegio ascendente como recompensa
  tone(523.25, 0.12, "sine", 0.06);
  setTimeout(() => tone(659.25, 0.14, "sine", 0.06), 90);
}
function playNoMatch() {
  // tono grave y breve = "no coincide"
  tone(196, 0.18, "sine", 0.05);
}
function playPing() {
  // "ping" tipo sonar: barrido descendente breve y brillante al acertar un par.
  // Respeta el toggle de sonido existente igual que el resto de efectos.
  if (!state.soundOn) return;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1200, t);
  osc.frequency.exponentialRampToValueAtTime(720, t + 0.26);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.3);
}
function playWin() {
  if (!state.soundOn) return;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // Do-Mi-Sol-Do arpegio
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.22, "sine", 0.07), i * 110));
}
function loadSoundPref() {
  state.soundOn = localStorage.getItem("memorama.sound") !== "off";
  reflectSoundUI();
}
function reflectSoundUI() {
  soundToggle.textContent = state.soundOn ? "🔊" : "🔇";
  soundToggle.classList.toggle("is-muted", !state.soundOn);
  soundToggle.setAttribute("aria-pressed", String(state.soundOn));
}
function toggleSound() {
  state.soundOn = !state.soundOn;
  localStorage.setItem("memorama.sound", state.soundOn ? "on" : "off");
  reflectSoundUI();
  if (state.soundOn) tone(660, 0.1, "sine", 0.06); // feedback al activar
}

/* ---------- Preferencia del Modo Pulso (persistida en localStorage) ---------- */
function loadPulsePref() {
  state.pulseMode = localStorage.getItem("memorama.pulse") === "on";
  reflectPulseUI();
}
function reflectPulseUI() {
  pulseToggle.classList.toggle("is-on", state.pulseMode);
  pulseToggle.setAttribute("aria-checked", String(state.pulseMode));
}
function togglePulse() {
  state.pulseMode = !state.pulseMode;
  localStorage.setItem("memorama.pulse", state.pulseMode ? "on" : "off");
  reflectPulseUI();
}

/* ---------- Anillo sonar (efecto al acertar un par) ----------
   Crea un <span> circular centrado sobre la carta, dentro de .board-wrap,
   y lo deja animarse con CSS (escala + desvanecido). Se autodestruye al
   terminar la animación. Respeta la preferencia de movimiento reducido. */
function sonarPing(cardEl) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!boardWrap || !cardEl) return;
  const wrapRect = boardWrap.getBoundingClientRect();
  const cardRect = cardEl.getBoundingClientRect();
  if (!cardRect.width) return;
  // Centro de la carta relativo a .board-wrap (que es position: relative)
  const cx = cardRect.left - wrapRect.left + cardRect.width / 2;
  const cy = cardRect.top - wrapRect.top + cardRect.height / 2;

  const ring = document.createElement("span");
  ring.className = "sonar";
  ring.setAttribute("aria-hidden", "true");
  ring.style.left = `${cx}px`;
  ring.style.top = `${cy}px`;
  ring.style.width = `${cardRect.width}px`;
  ring.style.height = `${cardRect.height}px`;
  ring.addEventListener("animationend", () => ring.remove());
  boardWrap.appendChild(ring);
}

/* ---------- Confeti de victoria (canvas, sin librerías) ---------- */
function launchConfetti() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = confettiCanvas.getContext("2d");
  const rect = confettiCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
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

/* ---------- Reinicio de progreso ---------- */
function resetProgress() {
  stopTimer();
  // Cancela un vistazo de Modo Pulso en curso (p. ej. si se reinicia a mitad)
  if (state.pulseTimer) { clearTimeout(state.pulseTimer); state.pulseTimer = null; }
  state.matched = 0;
  state.flipped = [];
  state.tries = 0;
  state.lock = false;
  state.won = false;
  state.startTime = null;
  triesEl.textContent = "0";
  timeEl.textContent = "0:00";
  winOverlay.hidden = true;
}

/* Reparte una nueva partida con la dificultad actual */
function deal() {
  state.pairs = PAIRS[state.difficulty] || PAIRS.classic;
  state.deck = buildDeck(state.pairs);
  resetProgress();
  buildBoard();
  loadBest();
}

/* ---------- Modo Pulso: vistazo inicial ----------
   Revela TODAS las cartas durante PULSE_PREVIEW_MS para memorizarlas, con la
   entrada bloqueada, y luego las oculta para que empiece el juego. El timer de
   la partida no arranca hasta el primer click, así que el vistazo no penaliza. */
function runPulsePreview() {
  state.lock = true; // bloquea clicks mientras se memoriza
  state.cardEls.forEach((card) => {
    card.classList.add("is-flipped");
    card.setAttribute("aria-label", `Preview, symbol ${card.dataset.symbol}`);
  });
  playFlip(); // pequeño sonido al revelar (respeta el toggle de sonido)
  state.pulseTimer = setTimeout(() => {
    state.cardEls.forEach((card) => {
      card.classList.remove("is-flipped");
      card.setAttribute("aria-label", "Card, face down");
    });
    state.lock = false;
    state.pulseTimer = null;
  }, PULSE_PREVIEW_MS);
}

/* Reparte una partida y, si el Modo Pulso está activo, lanza el vistazo inicial */
function dealAndMaybePeek() {
  deal();
  if (state.pulseMode) runPulsePreview();
}

/* ---------- Flujo de menú ---------- */
function selectDifficulty(diff) {
  state.difficulty = diff;
  sizeCards.forEach((c) => c.classList.toggle("is-active", c.dataset.diff === diff));
}

function startGame() {
  menuEl.hidden = true;
  gameEl.hidden = false;
  dealAndMaybePeek();
}

function showMenu() {
  stopTimer();
  if (state.pulseTimer) { clearTimeout(state.pulseTimer); state.pulseTimer = null; }
  state.lock = false;
  winOverlay.hidden = true;
  gameEl.hidden = true;
  menuEl.hidden = false;
  selectDifficulty(state.difficulty);
}

/* ---------- Eventos ---------- */
sizeCards.forEach((card) => {
  card.addEventListener("click", () => selectDifficulty(card.dataset.diff));
});
startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", dealAndMaybePeek);
menuBtn.addEventListener("click", showMenu);
winAgain.addEventListener("click", dealAndMaybePeek);
winMenu.addEventListener("click", showMenu);
soundToggle.addEventListener("click", toggleSound);
pulseToggle.addEventListener("click", togglePulse);

/* ---------- Arranque ---------- */
function init() {
  loadSoundPref();
  loadPulsePref();
  selectDifficulty("classic"); // preselección; el tablero se crea al pulsar Start
}
init();
