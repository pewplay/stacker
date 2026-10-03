# Stacker for PewPlay

This directory contains the original static game adapted for the PewPlay game template. Open `index.html` to play.

`game.json` holds the game page text. `preview.png` and `cover.png` provide the page images. The PewPlay workflow checks pushes to `preview` and `main`. The game remains a draft until you remove `"draft": true` after reviewing it.

Game controls: Stop the moving stack at the right moment and line it up with the layer below. Keep stacking until you win or miss.

## Update (October 2026)
- The 600 KB pure-CSS version (thousands of radio-button selectors, Google Fonts and prize images hot-linked from an external site) was rewritten as a small canvas game with the same rules: 7×10 board, rows capped at 3/2/1 blocks (rows 1-2, 3-5, 6-10), same sweep speeds per row, minor prize on row 7, major prize at the top.
- Fills the screen in portrait and landscape, crisp on high-DPI screens, tap anywhere / click / Space to drop (instant `pointerdown`), start, game-over and win screens in page, pause when the page is hidden (P/Esc), optional sound with mute button.
- Best row and wins saved in `stacker:best` / `stacker:wins` (`stacker:muted` for the sound setting).
- New cover and screenshots.
