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
let board, tray, score, best, combo, misses = 0, startBest = 0;
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

    // Guardamos el color de cada celda que se borra para poder animarla luego
    const cleared = new Map();
    rows.forEach(y => { for (let x = 0; x < N; x++) cleared.set(y * N + x, board[y][x]); });
    cols.forEach(x => { for (let y = 0; y < N; y++) cleared.set(y * N + x, board[y][x]); });
    cleared.forEach((_, i) => { board[Math.floor(i / N)][i % N] = null; });

    const lines = rows.length + cols.length;
    const allClear = lines > 0 && board.every(row => row.every(cell => !cell));

    return {
        blocks: p.cells.length,
        cleared,
        lines,
        allClear
    };
}

/* ============ HÁPTICA ============
   Android (Chrome/Firefox): navigator.vibrate() con duraciones y patrones.
   iOS (Safari 17.4+): no existe vibrate(); el único truco conocido es alternar un
   <input type="checkbox" switch>, que dispara el "tic" nativo del sistema. Es de intensidad
   fija y solo suena dentro de un gesto del usuario, así que allí se simula la vibración larga
   encadenando varios tics. Es un extra "si se puede": si no funciona, el juego sigue igual. */
const hap = (() => {
  const native = typeof navigator.vibrate === "function";
  // Diagnóstico: abre la página con ?haptics al final de la URL para ver un panel con el estado
  const debug = /[?&]haptics/.test(location.search);
  let panel = null, calls = 0, last = "-";
  function report() {
    if (!debug) return;
    if (!panel) {
      panel = document.createElement("pre");
      panel.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99;margin:0;padding:6px 8px;font:11px/1.35 monospace;background:#000c;color:#0f0;border-radius:6px;pointer-events:none;white-space:pre-wrap;max-width:92vw";
      document.body.append(panel);
    }
    panel.textContent =
      "vibrate existe: " + native +
      "\nen iframe: " + (self !== top) +
      "\nactivacion usuario: " + (navigator.userActivation ? navigator.userActivation.hasBeenActive : "n/d") +
      "\nllamadas: " + calls + "  ultimo resultado: " + last;
  }
  function vib(p) {
    calls++;
    try { last = String(navigator.vibrate(p)); } catch (err) { last = "error: " + err.message; }
    report();
  }
  report();
  let label = null;
  function iosTick() {
    if (!label) {
      label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.append(input);
      document.body.append(label);
    }
    label.click();
  }
  function iosTicks(n, gap) { // n tics seguidos, uno cada `gap` ms
    for (let k = 0; k < n; k++) k ? setTimeout(iosTick, k * gap) : iosTick();
  }
  let lastMove = 0;
  return {
    // Toquecito al arrastrar la pieza por una posición donde encaja
    snap() {
      const now = performance.now();
      if (now - lastMove < 35) return;           // evita ametrallar si el dedo va muy rápido
      lastMove = now;
      native ? vib(8) : iosTicks(1);
    },
    // Al soltar la pieza: toquecito; si además limpia líneas, toque largo a continuación
    drop(lines, allClear) {
      if (!lines) { native ? vib(14) : iosTicks(1); return; }
      const long = Math.min(60 + 30 * lines, 150);   // 1 línea 90 ms ... máx. 150 ms
      if (native) {
        vib(allClear
          ? [14, 45, 140, 70, 140]                    // tablero limpio: doble toque largo (~300 ms)
          : [14, 45, long]);
      } else {
        iosTicks(allClear ? 10 : 2 + lines, 40);
      }
    }
  };
})();

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
function pieceEl(p, size, gap) { // crea el HTML de una pieza con celdas de `size` px y hueco `gap` px
  const el = document.createElement("div");
  el.className = "p";
  el.style.gap = gap + "px";
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
let shownTray; // para saber si la bandeja es nueva (otro array) o la misma
function drawTray() {
  const animate = tray !== shownTray; shownTray = tray;
  const size = Math.floor(boardEl.clientWidth / N * 0.4);
  const gap = geom().gap * 0.4;   // misma proporción que el tablero
  trayEl.innerHTML = "";
  tray.forEach((p, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    if (p) {
      const el = pieceEl(p, size, gap);
      el.addEventListener("pointerdown", e => startDrag(e, p, i, el)); // evento = "cuando pase X, ejecuta esto"
      if (animate) { el.classList.add("enter"); el.style.setProperty("--i", i); }
      slot.append(el);
    }
    trayEl.append(slot);
  });
}
// Contador que sube número a número (sensación de avance real). Sirve para cualquier elemento.
const counters = new Map(); // elemento -> { shown: número mostrado, raf: id de animación }
const fmt = n => Math.round(n).toLocaleString("es-ES");
function rollTo(el, target) {
  let st = counters.get(el);
  if (!st) { counters.set(el, { shown: target, raf: 0 }); el.textContent = fmt(target); return; }
  cancelAnimationFrame(st.raf);
  const from = st.shown, diff = target - from;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (diff <= 0 || calm) { st.shown = target; el.textContent = fmt(target); el.classList.remove("rolling"); return; }
  const ms = Math.min(1300, Math.max(220, diff * 40)); // más puntos = cuenta más larga (máx. 1,3 s)
  const t0 = performance.now();
  el.classList.add("rolling");
  const step = now => {
    const k = Math.min(1, (now - t0) / ms);
    st.shown = from + diff * (1 - Math.pow(1 - k, 3));    // empieza rápido y frena al llegar
    el.textContent = fmt(st.shown);
    if (k < 1) { st.raf = requestAnimationFrame(step); return; }
    st.shown = target; el.classList.remove("rolling"); play(el, "land");
  };
  st.raf = requestAnimationFrame(step);
}

let prevLife = 0;
function updateScore() {
  if (score > best) {
    best = score;
    try { localStorage.setItem("best", best); } catch {}
  }
  rollTo($("score"), score);
  rollTo($("best"), best);

  // Ficha de combo: quedan 3 jugadas = tamaño completo, 2 = mediana, 1 = pequeña, sin combo = oculta
  const left = combo > 0 ? 3 - misses : 0;
  const life = [0, .4, .68, 1][left];
  const gem = $("gem");
  gem.style.setProperty("--life", life);
  if (life > prevLife) play(gem, "pop");   // al conseguir/renovar el combo, la ficha "salta"
  prevLife = life;
}

/* ============ 5. ARRASTRAR (pointer events: ratón y táctil a la vez) ============ */
let drag = null;
function geom() { // posición real de las celdas en pantalla
  const a = cellEls[0].getBoundingClientRect(), b = cellEls[1].getBoundingClientRect();
  return { x0: a.left, y0: a.top, size: a.width, pitch: b.left - a.left, gap: b.left - a.left - a.width };
}
let orientationTried = false;
function startDrag(e, p, i, srcEl) {
  e.preventDefault();
  if (!orientationTried) { orientationTried = true; try { screen.orientation?.lock?.("portrait")?.catch(() => {}); } catch {} }
  const g = geom();
  const el = pieceEl(p, g.size, g.gap);
  el.classList.add("float");
  document.body.append(el);
  srcEl.style.opacity = .25;
  srcEl.setPointerCapture(e.pointerId); // seguimos recibiendo eventos aunque el dedo salga de la pieza
  drag = { p, i, el, g, lift: e.pointerType === "touch" ? 120 : 0, target: null };
  srcEl.onpointermove = onMove;
  srcEl.onpointerup = srcEl.onpointercancel = onUp;
  onMove(e);
}
function onMove(e) {
  const { p, el, g, lift } = drag;
  const w = p.w * g.pitch - g.gap, h = p.h * g.pitch - g.gap;
  const left = e.clientX - w / 2, top = e.clientY - h / 2 - lift;
  el.style.left = left + "px"; el.style.top = top + "px";
  const c = Math.round((left - g.x0) / g.pitch), r = Math.round((top - g.y0) / g.pitch);
  const prev = drag.target;
  drag.target = fits(p, r, c) ? { r, c } : null;
  if (drag.target && (!prev || prev.r !== r || prev.c !== c)) hap.snap();
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
        combo += result.lines;
        misses = 0;

        gained += 10 * result.lines ** 2 * combo;

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
    celebrate(d.p, d.target, result, gained);
    hap.drop(result.lines, result.allClear);

    if (!tray.some(p => p && canPlaceAnywhere(p))) showGameOver();
  }
  drawBoard(); drawTray();
}

function showGameOver() {
  const isRecord = score > startBest;
  $("newbest").hidden = !isRecord;
  $("oldbest").hidden = isRecord;
  $("finalbest").textContent = fmt(best || 0);
  const fin = $("final");
  counters.delete(fin);
  rollTo(fin, 0);                                   // arranca en 0...
  $("over").hidden = false;
  setTimeout(() => rollTo(fin, score), 1100);       // ...y sube cuando aparece la tarjeta
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
  startBest = best || 0;
  $("seed").textContent = "Seed: " + seed;
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


/* ============ 7. EFECTOS DE CELEBRACIÓN ============ */
function rand(a, b) { return a + Math.random() * (b - a); }
function cellCenter(i) {
  const b = cellEls[i].getBoundingClientRect();
  return [b.left + b.width / 2, b.top + b.height / 2];
}
// Reinicia una animación CSS: quita la clase, fuerza el recálculo y la vuelve a poner.
function play(el, cls) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  el.addEventListener("animationend", function h(e) {
    if (e.target !== el) return;   // animationend "sube" desde los hijos: ignoramos los ajenos
    el.classList.remove(cls); el.removeEventListener("animationend", h);
  });
}
// Texto que salta, crece y se desvanece. element.animate() = animaciones desde JS (Web Animations API)
function popText(text, x, y, { size = 28, color = "#fff", glow = "#000", rise = 40, ms = 900 } = {}) {
  const el = document.createElement("div");
  el.className = "fx-text";
  el.textContent = text;
  el.style.cssText = `left:${x}px;top:${y}px;font-size:${size}px;color:${color};--c:${glow}`;
  document.body.append(el);
  const at = (dy, s) => `translate(-50%,-50%) translateY(${-dy}px) scale(${s})`;
  el.animate([
    { transform: at(0, .3), opacity: 0 },
    { transform: at(rise * .3, 1.3), opacity: 1, offset: .2 },
    { transform: at(rise * .6, 1), opacity: 1, offset: .65 },
    { transform: at(rise, .9), opacity: 0 }
  ], { duration: ms, easing: "ease-out" }).onfinish = () => el.remove();
}
// Chispas que salen disparadas en todas direcciones
function burst(x, y, color, n, spread) {
  for (let k = 0; k < n; k++) {
    const p = document.createElement("div"), s = rand(5, 11);
    p.className = "fx-dot";
    p.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${color}`;
    document.body.append(p);
    const a = rand(0, Math.PI * 2), r = rand(.4, 1) * spread;
    p.animate([
      { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r + 30}px)) scale(0)`, opacity: 0 }
    ], { duration: rand(500, 950), easing: "cubic-bezier(.1,.7,.3,1)" }).onfinish = () => p.remove();
  }
}
// Onda expansiva
function ring(x, y, color, size) {
  const r = document.createElement("div");
  r.className = "fx-ring";
  r.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
  document.body.append(r);
  r.animate([
    { transform: "translate(-50%,-50%) scale(.1)", opacity: 1 },
    { transform: `translate(-50%,-50%) scale(${size})`, opacity: 0 }
  ], { duration: 650, easing: "ease-out" }).onfinish = () => r.remove();
}

// Todo lo que pasa al colocar una pieza. Cuanto más "hype", más intenso.
function celebrate(p, t, res, gained) {
  const g = geom();
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const px = g.x0 + t.c * g.pitch + (p.w * g.pitch - g.gap) / 2;   // centro de la pieza colocada
  const py = g.y0 + t.r * g.pitch + (p.h * g.pitch - g.gap) / 2;
  const hype = Math.min(res.lines + Math.floor(combo / 2), 8); // 0 = colocar sin más ... 8 = locura

  // 1. Rebote en las celdas colocadas que no se borran
  p.cells.forEach(([dr, dc]) => {
    const i = (t.r + dr) * N + t.c + dc;
    if (!res.cleared.has(i)) play(cellEls[i], "drop");
  });

  // 2. Número de puntos en CADA colocación; más grande cuanto más ganas
  popText("+" + gained.toLocaleString("es-ES"), px, py,
    { size: Math.min(22 + gained / 8, 76), glow: p.color, rise: 50 + hype * 10 });
  if (res.lines === 0) return;

  // 3. Ola de borrado: las celdas cercanas a la pieza estallan primero
  const cleared = [...res.cleared];
  const n = cleared.length > 24 ? 2 : Math.min(3 + hype, 7); // chispas por celda
  cleared.forEach(([i, color]) => {
    const el = cellEls[i], [cx, cy] = cellCenter(i);
    const delay = Math.round(Math.hypot(cx - px, cy - py) / g.pitch * 40);
    el.style.setProperty("--k", color);
    el.style.setProperty("--d", delay + "ms");
    play(el, "clear");
    if (!calm) setTimeout(() => burst(cx, cy, color, n, 60 + hype * 14), delay + 120);
  });

  // 4. Onda, destello y temblor del tablero (más fuerte con más hype)
  if (!calm) {
    ring(px, py, p.color, 5 + hype * 1.5);
    boardEl.style.setProperty("--s", (2 + hype * 1.5) + "px");
    boardEl.style.setProperty("--fc", p.color);
    play(boardEl, "boom");
  }

  // 5. Carteles
  const bb = boardEl.getBoundingClientRect(), bx = bb.left + bb.width / 2, by = bb.top + bb.height / 2;
  const names = ["", "", "DOUBLE!", "TRIPLE!", "QUADRUPLE!"];
  if (res.lines >= 2)
    popText(names[res.lines] || "AMAZING!", bx, by - 30, { size: 34 + res.lines * 3, color: "#fff", glow: p.color, ms: 1100, rise: 30 });
  if (combo >= 2)
    popText("COMBO x" + combo, bx, by + 35, { size: 26 + Math.min(combo, 10) * 3, color: "#ffd166", glow: "#ef476f", ms: 1200, rise: 25 });
  if (res.allClear) {
    popText("CLEAR!", bx, by - 95, { size: 42, color: "#ffd166", glow: "#ff9f1c", ms: 1600, rise: 20 });
    if (!calm) for (let k = 0; k < 6; k++)
      setTimeout(() => burst(bx + rand(-130, 130), by + rand(-130, 130), COLORS[k % COLORS.length], 14, 220), k * 90);
  }
}
