(function () {
  'use strict';

  // ---------- rules (same as the original pure-CSS Stacker) ----------
  var COLS = 7, ROWS = 10;
  var MINOR_ROW = 7;                                   // highlighted row: minor prize
  var CAP = [3, 3, 2, 2, 2, 1, 1, 1, 1, 1];            // widest row allowed on each level
  var CYCLE = [2.5, 2.5, 2.5, 2, 2, 1.5, 1.5, 1.25, 1.25, 0.85]; // seconds for a full back-and-forth sweep

  var C = {
    bg: '#172031', frame: '#2f5d83', cell: '#233f5a', cellMinor: '#2e5477', cellMajor: '#386691',
    lit: '#fabc7f', btn: '#fa7f7f', btnDark: '#b45252', text: '#ffffff', dim: '#8aa3bf'
  };

  // ---------- storage (prefixed keys; the original game had no saves) ----------
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* ignore */ } }
  var best = parseInt(load('stacker:best'), 10) || 0;   // highest row reached
  var wins = parseInt(load('stacker:wins'), 10) || 0;
  var muted = load('stacker:muted') === '1';

  // ---------- elements ----------
  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var startEl = $('start'), resultEl = $('result'), pausedEl = $('paused'), muteBtn = $('mute');

  // ---------- state ----------
  var grid, row, width, rowStart, clock, mode, explode, flashT, pressT, lastFrame, placedAt;
  // mode: 'menu' | 'play' | 'wait' | 'over' | 'win' | 'paused'
  function reset() {
    grid = [];
    for (var r = 0; r < ROWS; r++) { grid.push(new Array(COLS).fill(false)); }
    row = 0;
    width = CAP[0];
    clock = 0;
    rowStart = 0;
    explode = [];
    flashT = -1;
    pressT = -1;
    placedAt = -1;
  }
  reset();
  mode = 'menu';

  // position of the moving row: discrete steps, left -> right -> left
  function movingPos(t) {
    var span = COLS - width;
    var steps = span * 2;
    var stepDur = CYCLE[row] / steps;
    var k = Math.floor((t - rowStart) / stepDur) % steps;
    return k <= span ? k : steps - k;
  }

  // ---------- audio (starts after the first gesture) ----------
  var actx = null;
  function beep(freq, dur, type, vol) {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.06, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur + 0.02);
    } catch (e) { /* audio not available */ }
  }
  function tune(notes) {
    notes.forEach(function (n, i) { setTimeout(function () { beep(n, 0.16, 'square', 0.05); }, i * 110); });
  }
  function setMuted(m) {
    muted = m;
    muteBtn.classList.toggle('muted', m);
    muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
    save('stacker:muted', m ? '1' : '0');
  }
  setMuted(muted);

  // ---------- game actions ----------
  function startGame() {
    reset();
    mode = 'play';
    startEl.hidden = true;
    resultEl.hidden = true;
    pausedEl.hidden = true;
  }

  function drop() {
    if (mode !== 'play') return;
    pressT = clock;
    var pos = movingPos(clock);
    var below = row > 0 ? grid[row - 1] : null;
    var kept = 0;
    for (var c = pos; c < pos + width; c++) {
      if (!below || below[c]) { grid[row][c] = true; kept++; }
      else explode.push({ r: row, c: c, t: clock });
    }
    placedAt = clock;
    if (kept === 0) { beep(110, 0.5, 'sawtooth', 0.07); finish(false); return; }
    beep(kept < width ? 260 : 440 + row * 40, 0.09, 'square', 0.06);
    if (row + 1 >= ROWS) { finish(true); return; }
    row++;
    width = Math.min(kept, CAP[row]);
    // short beat before the next row starts sliding (from the left, like the original)
    mode = 'wait';
    setTimeout(function () { if (mode === 'wait') { rowStart = clock; mode = 'play'; } }, 160);
  }

  var PRIZE_MINOR = '<svg viewBox="0 0 64 64"><circle cx="32" cy="24" r="18" fill="#c9d6e3"/><circle cx="32" cy="24" r="12" fill="#9fb4cc"/><path d="M22 38l-6 20 10-5 6 9 4-20zM42 38l6 20-10-5-6 9-4-20z" fill="#fa7f7f"/><path d="M32 15l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L23 22l6-1z" fill="#fff"/></svg>';
  var PRIZE_MAJOR = '<svg viewBox="0 0 64 64"><path d="M18 8h28v14a14 14 0 0 1-28 0z" fill="#fabc7f"/><path d="M18 12H9a9 9 0 0 0 11 12M46 12h9a9 9 0 0 1-11 12" fill="none" stroke="#fabc7f" stroke-width="4"/><rect x="28" y="34" width="8" height="10" fill="#e09a55"/><rect x="18" y="44" width="28" height="8" rx="2" fill="#fabc7f"/><rect x="14" y="52" width="36" height="6" rx="2" fill="#e09a55"/><path d="M32 13l2.4 4.8 5.3.8-3.9 3.7.9 5.2-4.7-2.5-4.7 2.5.9-5.2-3.9-3.7 5.3-.8z" fill="#fff"/></svg>';

  function finish(won) {
    var reached = won ? ROWS : row;      // rows completed
    if (won) { wins++; save('stacker:wins', wins); }
    var newBest = reached > best;
    if (newBest) { best = reached; save('stacker:best', best); }
    mode = won ? 'win' : 'over';
    flashT = clock;
    if (won) tune([523, 659, 784, 1046]);
    setTimeout(function () {
      $('result-title').innerHTML = won ? 'You Win!' : 'Game Over';
      var prize = $('prize');
      if (won) { prize.innerHTML = PRIZE_MAJOR; prize.hidden = false; }
      else if (reached >= MINOR_ROW) { prize.innerHTML = PRIZE_MINOR; prize.hidden = false; }
      else prize.hidden = true;
      var txt;
      if (won) txt = 'You stacked all ' + ROWS + ' rows and won the <strong>major prize</strong>!';
      else if (reached >= MINOR_ROW) txt = 'You reached row ' + reached + ' and won the <strong>minor prize</strong>. Go for the top!';
      else txt = 'You stacked ' + reached + (reached === 1 ? ' row' : ' rows') + '. Row ' + MINOR_ROW + ' wins the minor prize.';
      if (newBest && !won && reached > 0) txt += '<br><strong>New best!</strong>';
      $('result-text').innerHTML = txt;
      updateBest();
      resultEl.hidden = false;
      $('again').focus({ preventScroll: true });
    }, won ? 1100 : 900);
  }

  function updateBest() {
    var s = best > 0 ? 'Best: row ' + best + ' of ' + ROWS + (wins > 0 ? ' · Wins: ' + wins : '') : '';
    $('best-start').textContent = s;
    $('best-result').textContent = s;
  }
  updateBest();

  function pause() {
    if (mode !== 'play' && mode !== 'wait') return;
    mode = 'paused';
    pausedEl.hidden = false;
  }
  function resume() {
    if (mode !== 'paused') return;
    pausedEl.hidden = true;
    rowStart = clock;          // restart the sweep from the left
    mode = 'play';
  }

  // ---------- input ----------
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (mode === 'play') drop();
  });
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === ' ' || k === 'Enter' || k === 'ArrowDown' || k === 'ArrowUp') {
      if (e.target && e.target.tagName === 'BUTTON' && mode !== 'play') return; // let buttons activate
      e.preventDefault();
      if (e.repeat) return;
      if (mode === 'play') drop();
      else if (mode === 'menu') startGame();
      else if (mode === 'paused') resume();
      else if ((mode === 'over' || mode === 'win') && !resultEl.hidden) startGame();
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (mode === 'paused') resume(); else pause();
    } else if (k === 'm' || k === 'M') setMuted(!muted);
  });
  $('play').addEventListener('click', startGame);
  $('again').addEventListener('click', startGame);
  $('resume').addEventListener('click', resume);
  muteBtn.addEventListener('click', function () { setMuted(!muted); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  window.addEventListener('blur', pause);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- layout ----------
  var L = {};
  var dpr = 1, W = 0, H = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var wide = W / H >= 1.05;
    var u;
    if (wide) {
      // side panels: title/stats on the left, button on the right
      u = Math.min(H * 0.92 / 11.6, W * 0.96 / 19);
      L.frameW = 8.5 * u; L.frameH = 11.5 * u;
      L.fx = (W - L.frameW) / 2; L.fy = (H - L.frameH) / 2;
      L.btnS = Math.min(2.4 * u, 120);
      L.btnX = L.fx + L.frameW + (W - L.fx - L.frameW) / 2 - L.btnS / 2;
      L.btnY = L.fy + L.frameH - 0.75 * u - L.btnS - u * 0.2;
      L.titleX = L.fx / 2; L.titleY = L.fy + u * 1.4;
      L.statsY = L.fy + u * 3.6;
    } else {
      u = Math.min(W * 0.94 / 8.5, H * 0.9 / 16);
      L.frameW = 8.5 * u; L.frameH = 13.9 * u;
      var total = L.frameH + 2.1 * u;
      L.fx = (W - L.frameW) / 2; L.fy = (H - total) / 2 + 2.1 * u;
      L.btnS = 1.6 * u;
      L.btnX = W / 2 - L.btnS / 2;
      L.btnY = L.fy + 0.75 * u + 10 * u + 0.6 * u;
      L.titleX = W / 2; L.titleY = L.fy - 1.05 * u;
    }
    L.wide = wide; L.u = u;
    L.gx = L.fx + 0.75 * u + 0.12 * u;
    L.gy = L.fy + 0.75 * u;           // top of the grid
    L.cell = 0.76 * u;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  resize();

  // ---------- drawing ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function cellXY(r, c) {
    return [L.gx + c * L.u, L.gy + (ROWS - 1 - r) * L.u];
  }
  function drawCell(r, c, color, glow) {
    var p = cellXY(r, c);
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = L.u * 0.6; }
    ctx.fillStyle = color;
    ctx.fillRect(p[0], p[1], L.cell, L.cell);
    ctx.shadowBlur = 0;
  }
  function mix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    var g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    var bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function draw() {
    var u = L.u;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // frame
    ctx.strokeStyle = C.frame;
    ctx.lineWidth = Math.max(3, u * 0.2);
    ctx.strokeRect(L.fx, L.fy, L.frameW, L.frameH);

    // grid
    for (var r = 0; r < ROWS; r++) {
      var base = r === ROWS - 1 ? C.cellMajor : r === MINOR_ROW - 1 ? C.cellMinor : C.cell;
      for (var c = 0; c < COLS; c++) {
        drawCell(r, c, grid[r][c] ? C.lit : base);
      }
    }

    // missed blocks: flash white, then fade out (like the original "blockExplode")
    explode = explode.filter(function (e) { return clock - e.t < 0.75; });
    explode.forEach(function (e) {
      var t = (clock - e.t) / 0.75;
      var base = e.r === ROWS - 1 ? C.cellMajor : e.r === MINOR_ROW - 1 ? C.cellMinor : C.cell;
      var col = t < 0.5 ? mix(C.lit, '#ffffff', t * 2) : mix('#ffffff', base, Math.min(1, (t - 0.5) * 5));
      drawCell(e.r, e.c, col, t < 0.6 ? 'rgba(254,239,225,0.9)' : null);
    });

    // moving row
    if (mode === 'play' || mode === 'paused') {
      var pos = movingPos(clock);
      for (var i = 0; i < width; i++) drawCell(row, pos + i, C.lit, 'rgba(250,188,127,0.45)');
    }

    // win flash
    if (mode === 'win' && flashT >= 0) {
      var ft = clock - flashT;
      var on = Math.floor(ft * 6) % 2 === 0 && ft < 1.2;
      if (on) {
        for (var rr2 = 0; rr2 < ROWS; rr2++) for (var c2 = 0; c2 < COLS; c2++) if (grid[rr2][c2]) drawCell(rr2, c2, '#ffffff', 'rgba(255,255,255,0.8)');
      }
    }

    // big red button
    var pressed = pressT >= 0 && clock - pressT < 0.12;
    var bx = L.btnX, by = L.btnY + (pressed ? L.btnS * 0.06 : 0), bs = L.btnS;
    ctx.fillStyle = C.btnDark;
    rr(bx, L.btnY + bs * 0.08, bs, bs, bs * 0.16); ctx.fill();
    ctx.fillStyle = pressed ? '#ff9a9a' : C.btn;
    rr(bx, by, bs, bs, bs * 0.16); ctx.fill();

    // texts
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var fs;
    if (L.wide) {
      var panelW = L.fx * 0.9;
      fs = Math.min(u * 1.05, panelW / 5.2);
      ctx.fillStyle = C.text;
      ctx.font = '800 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText('STACKER', L.titleX, L.titleY);
      var sfs = Math.max(13, Math.min(u * 0.48, panelW / 7));
      ctx.font = '700 ' + sfs + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = C.dim;
      ctx.fillText('ROW', L.titleX, L.statsY);
      ctx.fillText('BEST', L.titleX, L.statsY + sfs * 4.2);
      ctx.fillStyle = C.lit;
      ctx.font = '800 ' + sfs * 1.9 + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(Math.min(row + (mode === 'win' ? 1 : 0), ROWS) + '/' + ROWS, L.titleX, L.statsY + sfs * 1.8);
      ctx.fillText(best + '/' + ROWS, L.titleX, L.statsY + sfs * 6);
      if (mode === 'play' || mode === 'wait') {
        ctx.fillStyle = C.dim;
        ctx.font = '600 ' + Math.max(12, sfs * 0.8) + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.fillText('TAP / SPACE', L.btnX + bs / 2, L.btnY - sfs * 1.1);
      }
    } else {
      fs = u * 0.9;
      ctx.fillStyle = C.text;
      ctx.font = '800 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText('STACKER', W / 2, L.titleY);
      var small = Math.max(13, u * 0.4);
      ctx.font = '700 ' + small + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = C.dim;
      var sy = L.btnY + bs / 2;
      ctx.fillText('ROW', L.gx, sy - small * 0.7);
      ctx.fillStyle = C.lit;
      ctx.fillText(Math.min(row + (mode === 'win' ? 1 : 0), ROWS) + '/' + ROWS, L.gx, sy + small * 0.7);
      ctx.textAlign = 'right';
      ctx.fillStyle = C.dim;
      var rx = L.gx + 6 * u + L.cell;
      ctx.fillText('BEST', rx, sy - small * 0.7);
      ctx.fillStyle = C.lit;
      ctx.fillText(best + '/' + ROWS, rx, sy + small * 0.7);
    }
  }

  function frame(now) {
    if (lastFrame === undefined) lastFrame = now;
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (mode !== 'paused') clock += dt;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // expose a tiny hook for automated tests / screenshots
  window.__stacker = {
    state: function () { return { mode: mode, row: row, width: width, pos: (mode === 'play' ? movingPos(clock) : -1), best: best }; },
    below: function () { return row > 0 ? grid[row - 1].slice() : null; }
  };
})();
