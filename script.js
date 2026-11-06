"use strict";

/* ============ 1. DATOS: las piezas ============ */
const N = 8; // tamaño del tablero
const COLORS = ["#ef476f", "#ffb703", "#06d6a0", "#118ab2", "#8338ec", "#fb8500"];
const BASE = [
  ["#"], ["##"], ["###"], ["####"], ["#####"],
  ["##", "##"], ["###", "###", "###"], ["###", "###"],
  ["#.", "##"], ["#..", "#..", "###"],
  ["#.", "#.", "##"], [".#", ".#", "##"],
  ["###", ".#."], [".##", "##."], ["##", ".##"]
];

// Desplaza la pieza para que empiece en (0,0) y la ordena (así podemos comparar piezas).
function normalize(cells) {
  const r0 = Math.min(...cells.map(p => p[0]));   // "..." esparce un array como argumentos
  const c0 = Math.min(...cells.map(p => p[1]));
  return cells.map(([r, c]) => [r - r0, c - c0])  // [r, c] = desestructurar un par
              .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const rotate = cells => normalize(cells.map(([r, c]) => [c, -r])); // función flecha

// SHAPES = todas las piezas con sus rotaciones, sin repetidas. {cells, color, w, h}
const SHAPES = [];
{
  const seen = new Set(); // conjunto: guarda cada forma ya vista como texto (JSON)
  BASE.forEach((rows, i) => {
    let cells = [];
    rows.forEach((line, r) => [...line].forEach((ch, c) => { if (ch === "#") cells.push([r, c]); }));
    cells = normalize(cells);
    for (let k = 0; k < 4; k++) {
      const key = JSON.stringify(cells);
      if (!seen.has(key)) {
        seen.add(key);
        SHAPES.push({
          cells, color: COLORS[i % COLORS.length],
          h: Math.max(...cells.map(p => p[0])) + 1,
          w: Math.max(...cells.map(p => p[1])) + 1
        });
      }
      cells = rotate(cells);
    }
  });
}

/* ============ 2. AZAR JUSTO Y VERIFICABLE ============
   Math.random() no se puede fijar; este generador (mulberry32) sí: misma semilla,
   misma partida. Cualquiera puede comprobar que no hace trampas. */
function hashSeed(str) { // texto -> número (FNV-1a)
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () { // devuelve una función que da un número en [0,1) cada vez
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let rng, bag;
// IMPORTANTE: esta función NO recibe el tablero, ni la puntuación, ni nada del jugador.
// Reparte con "bolsa": se baraja todo el catálogo y se saca de uno en uno, así
// ninguna pieza se repite en exceso. No puede adaptarse a cómo juegas.
function nextPiece() {
  if (bag.length === 0) {
    bag = SHAPES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) { // barajar (Fisher-Yates)
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return SHAPES[bag.pop()];
}

/* ============ 3. REGLAS (sin nada de pantalla) ============ */
let board, tray, score, best, combo, misses = 0;
try { best = +localStorage.getItem("best") || 0; } catch { /* localStorage puede fallar */ }

function fits(p, r, c) { // ¿cabe la pieza con su esquina en (r,c)?
  return p.cells.every(([dr, dc]) => {
    const y = r + dr, x = c + dc;
    return y >= 0 && y < N && x >= 0 && x < N && !board[y][x];
  });
}
function canPlaceAnywhere(p) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(p, r, c)) return true;
  return false;
}
function place(p, r, c) {
    p.cells.forEach(([dr, dc]) => {
        board[r + dr][c + dc] = p.color;
    });

    const rows = [], cols = [];

    for (let i = 0; i < N; i++) {
        if (board[i].every(Boolean)) rows.push(i);
        if (board.every(row => row[i])) cols.push(i);
    }

    rows.forEach(r => {
        for (let c = 0; c < N; c++) board[r][c] = null;
    });

    cols.forEach(c => {
        for (let r = 0; r < N; r++) board[r][c] = null;
    });

    const lines = rows.length + cols.length;
    const allClear = lines > 0 && board.every(row => row.every(cell => !cell));

    return {
        blocks: p.cells.length,
        lines,
        allClear
    };
}

/* ============ 4. PANTALLA ============ */
const $ = id => document.getElementById(id);
const boardEl = $("board"), trayEl = $("tray");
let cellEls = [];

function buildBoard() {
  boardEl.innerHTML = ""; cellEls = [];
  for (let i = 0; i < N * N; i++) {
    const d = document.createElement("div");
    d.className = "c";
    boardEl.append(d); cellEls.push(d);
  }
}
/*function drawBoard(ghost) { // ghost = {p, r, c}: vista previa mientras arrastras
  cellEls.forEach((d, i) => {
    const col = board[Math.floor(i / N)][i % N];
    d.className = "c" + (col ? " on" : "");
    d.style.setProperty("--col", col || "");
  });
  if (ghost) ghost.p.cells.forEach(([dr, dc]) => {
    const d = cellEls[(ghost.r + dr) * N + ghost.c + dc];
    d.classList.add("pre"); d.style.setProperty("--col", ghost.p.color);
  });
}*/
function drawBoard(ghost) {
    const placed = new Set();
    const rows = new Set();
    const cols = new Set();

    // Casillas que ocuparía la pieza.
    if (ghost) {
        ghost.p.cells.forEach(([dr, dc]) => {
            placed.add((ghost.r + dr) * N + ghost.c + dc);
        });

        // Detectar filas que quedarían completas.
        for (let r = 0; r < N; r++) {
            let full = true;

            for (let c = 0; c < N; c++) {
                if (!board[r][c] && !placed.has(r * N + c)) {
                    full = false;
                    break;
                }
            }

            if (full) rows.add(r);
        }

        // Detectar columnas que quedarían completas.
        for (let c = 0; c < N; c++) {
            let full = true;

            for (let r = 0; r < N; r++) {
                if (!board[r][c] && !placed.has(r * N + c)) {
                    full = false;
                    break;
                }
            }

            if (full) cols.add(c);
        }
    }

    // Actualizar apariencia de todas las casillas.
    cellEls.forEach((d, i) => {
        const r = Math.floor(i / N);
        const c = i % N;
        const color = board[r][c];
        const isPiece = placed.has(i);
        const complete = ghost && (rows.has(r) || cols.has(c));

        d.classList.toggle("on", !!color);
        d.classList.toggle("pre", isPiece && !complete);
        d.classList.toggle("complete", !!complete);

        d.style.setProperty(
            "--col",
            complete ? ghost.p.color : (color || (isPiece ? ghost.p.color : ""))
        );
    });
}
function pieceEl(p, size) { // crea el HTML de una pieza con celdas de `size` px
  const el = document.createElement("div");
  el.className = "p";
  el.style.gridTemplateColumns = `repeat(${p.w}, ${size}px)`; // `...${x}` = plantilla de texto
  el.style.setProperty("--col", p.color);
  for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) {
    const i = document.createElement("i");
    i.style.width = i.style.height = size + "px";
    if (p.cells.some(([y, x]) => y === r && x === c)) i.className = "f";
    el.append(i);
  }
  return el;
}
function drawTray() {
  const size = Math.floor(boardEl.clientWidth / N * 0.4);
  trayEl.innerHTML = "";
  tray.forEach((p, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    if (p) {
      const el = pieceEl(p, size);
      el.addEventListener("pointerdown", e => startDrag(e, p, i, el)); // evento = "cuando pase X, ejecuta esto"
      slot.append(el);
    }
    trayEl.append(slot);
  });
}
function updateScore(gained = 0) {
    if (score > best) {
        best = score;
        try {
            localStorage.setItem("best", best);
        } catch {}
    }

    const scoreEl = $("score");
    const gainEl = $("gain");
    const comboEl = $("combo");

    scoreEl.textContent = score.toLocaleString("es-ES");
    $("best").textContent = best.toLocaleString("es-ES");

    comboEl.textContent = combo >= 2 ? `x${combo}` : "—";

    scoreEl.classList.remove("score-pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("score-pop");

    if (gained > 0) {
        gainEl.textContent = `+${gained.toLocaleString("es-ES")}`;
        gainEl.classList.remove("show");
        void gainEl.offsetWidth;
        gainEl.classList.add("show");
    }

    comboEl.classList.remove("combo-pop");

    if (combo >= 2 && gained > 0) {
        void comboEl.offsetWidth;
        comboEl.classList.add("combo-pop");
    }
}

/* ============ 5. ARRASTRAR (pointer events: ratón y táctil a la vez) ============ */
let drag = null;
function geom() { // posición real de las celdas en pantalla
  const a = cellEls[0].getBoundingClientRect(), b = cellEls[1].getBoundingClientRect();
  return { x0: a.left, y0: a.top, size: a.width, pitch: b.left - a.left };
}
function startDrag(e, p, i, srcEl) {
  e.preventDefault();
  const g = geom();
  const el = pieceEl(p, g.size);
  el.classList.add("float");
  document.body.append(el);
  srcEl.style.opacity = .25;
  srcEl.setPointerCapture(e.pointerId); // seguimos recibiendo eventos aunque el dedo salga de la pieza
  drag = { p, i, el, g, lift: e.pointerType === "touch" ? 70 : 0, target: null };
  srcEl.onpointermove = onMove;
  srcEl.onpointerup = srcEl.onpointercancel = onUp;
  onMove(e);
}
function onMove(e) {
  const { p, el, g, lift } = drag;
  const w = p.w * g.pitch - 3, h = p.h * g.pitch - 3;
  const left = e.clientX - w / 2, top = e.clientY - h / 2 - lift;
  el.style.left = left + "px"; el.style.top = top + "px";
  const c = Math.round((left - g.x0) / g.pitch), r = Math.round((top - g.y0) / g.pitch);
  drag.target = fits(p, r, c) ? { r, c } : null;
  drawBoard(drag.target && { p, r, c });
}
function onUp(e) {
  const d = drag; drag = null;
  d.el.remove();
  if (e.type === "pointercancel") d.target = null;
  if (d.target) {
    const result = place(d.p, d.target.r, d.target.c);

    let gained = result.blocks;

    if (result.lines > 0) {
        combo++;
        misses = 0;

        gained += 10 * result.lines ** 2 * Math.min(combo, 8);

        if (result.allClear) gained += 300;
    } else if (combo > 0) {
        misses++;

        if (misses >= 3) {
            combo = 0;
            misses = 0;
        }
    }

    score += gained;
    tray[d.i] = null;

    if (tray.every(x => !x)) {
        tray = [nextPiece(), nextPiece(), nextPiece()];
    }

    updateScore(gained);

    if (!tray.some(p => p && canPlaceAnywhere(p))) {
        $("final").textContent = "Puntos: " + score;
        $("over").hidden = false;
    }
  }
  drawBoard(); drawTray();
}

/* ============ 6. ARRANQUE ============ */
function newGame(seed) {
  seed = seed || String(Math.floor(Math.random() * 1e9));
  rng = mulberry32(hashSeed(seed)); bag = [];
  board = Array.from({ length: N }, () => Array(N).fill(null));
  tray = [nextPiece(), nextPiece(), nextPiece()];
  score = 0;
  combo = 0;
  misses = 0;
  $("seed").textContent = "Semilla: " + seed;
  $("over").hidden = true;
  updateScore(); drawBoard(); drawTray();
}
$("new").onclick = $("again").onclick = () => newGame();
$("daily").onclick = () => newGame("diaria-" + new Date().toISOString().slice(0, 10));
window.addEventListener("resize", () => tray && drawTray());
buildBoard();
newGame();

document.addEventListener("touchmove", e => {
    e.preventDefault();
}, { passive: false });
