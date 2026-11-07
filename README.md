<div>

#BLOCKWISE
                                                                      

**A neon-glow block puzzle for your browser. Drag, fit, clear, combo.**

### [Play now → sirnick270.github.io/Blockwise](https://sirnick270.github.io/Blockwise)

*Pure HTML, CSS and JavaScript. No libraries, no build step. Made for phones, works everywhere.*

</div>

---

## How to play

1. Drag one of the 3 pieces from the tray onto the 8×8 board.
2. A preview shows where it will land. If it will complete a row or column, that line glows before you let go.
3. Complete a full row or column and it disappears, giving you points.
4. When you place all 3 pieces, the tray refills with 3 new ones.
5. The game ends when none of the pieces left in the tray fits anywhere on the board.

> Pieces can't be rotated. Every rotation exists as its own piece in the draw.

## Scoring and combo

| Event | Points |
|---|---|
| Placing a piece | 1 point per block |
| Clearing lines | `10 × lines² × combo` |
| Clearing the entire board | +300 |

- `lines` is how many rows and columns you clear with a single piece.
- The **combo** grows with every line you clear. Place 3 pieces in a row without clearing anything and it resets.
- The yellow gem next to your score shows how many moves you have left before the combo breaks: big = 3, medium = 2, small = 1.
- Your best score is saved in your browser (`localStorage`).

## Buttons

| Button | What it does |
|---|---|
| **New** | Starts a new game with a random seed |
| **Daily game** | Starts today's game. The seed comes from the date, so everyone gets the same pieces that day |
| **Play again** | Shown on the Game Over screen, starts a new game |

## Fair, verifiable randomness

Blockwise doesn't use `Math.random()` to deal pieces. It uses a seeded generator ([mulberry32](https://github.com/bryc/code/blob/master/jshash/PRNGs.md)) and a **bag system**: the whole catalog of pieces is shuffled and dealt one by one, so no piece repeats too often.

The piece dealer never sees your board or your score, so it can't adapt to how you play. The seed of the current game is shown under the tray (`Seed: ...`), and the same seed always produces the same sequence of pieces.

## Haptics

| Platform | How it works |
|---|---|
| **Android** | Uses `navigator.vibrate()`: a tiny tap when the piece snaps over a valid spot, another when you drop it, and a longer buzz when you clear lines (90 to 150 ms depending on how many). Clearing the whole board gives a double buzz. |
| **iPhone** | Safari has no `vibrate()`. As a best-effort extra, a hidden `<input type="checkbox" switch>` is toggled to trigger the system haptic tick (Safari 17.4+). It has a fixed intensity and only fires inside a user gesture, so it may not work on every device, and the taps while dragging probably won't. |

**Debugging:** add `?haptics` to the URL to show a small panel with the vibration status (support, iframe, user activation and the result of each call).

## Mobile

- Designed for portrait. If you turn your phone sideways, you'll see a "Gira el móvil para jugar" screen instead of a broken layout.
- A web page can't lock the screen orientation on its own. Blockwise tries `screen.orientation.lock("portrait")`, which only works on Android in fullscreen or as an installed app.
- On touch screens the piece you drag floats above your finger so you can always see it.
- The board, the gaps between squares and the pieces all scale with the screen size.
- Light and dark themes follow your system setting.

## Run it locally

No build needed, but `script.js` is loaded as an ES module, so some browsers won't run it when you open `index.html` straight from disk. Serve it with any static server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Project structure

```
index.html   Page structure: score bar, board, tray, Game Over, rotate notice
style.css    Styles, light/dark theme, animations and effects
script.js    All the game logic
```

`script.js` is organized in sections:

1. **Data:** the piece catalog and generation of rotations.
2. **Randomness:** seeded generator and bag dealer.
3. **Rules:** placing pieces and detecting complete lines (no UI code).
4. **Screen:** drawing the board and tray, score counter, combo gem.
5. **Dragging:** pointer events, so mouse and touch work the same way.
6. **Startup:** new game and buttons.
7. **Celebration effects:** pop-up texts, sparks, shockwaves and board shake.

Haptics (`hap`) and the Game Over screen (`showGameOver`) live in the same file.

## Make it yours

- **Pieces:** edit `BASE` in `script.js`. Each piece is a list of rows, with `#` for a block and `.` for an empty cell. Rotations are generated automatically and duplicates are dropped.
- **Colors:** edit the `COLORS` array. Each piece takes one according to its position in `BASE`.
- **Scoring:** see `onUp()` in section 5 of `script.js`.
- **Board size:** `N` sets the size in code, but the grid in `style.css` is fixed to 8 columns (`repeat(8, 1fr)`). If you change `N`, change that value too.
- **Interface colors:** CSS variables at the top of `style.css`, with a light and a dark theme.

## Accessibility

- Respects `prefers-reduced-motion`: animations and celebration effects are turned off.
- The Game Over screen and the rotate notice use ARIA roles (`dialog` and `alert`).

---

<div align="center">

**[Play Blockwise](https://sirnick270.github.io/Blockwise)**

</div>
