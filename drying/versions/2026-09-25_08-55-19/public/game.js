// ============================================================================
// WATCH THE DRYING
//
// Two phases:
//   1. PAINTING - drag the brush over the wall to build up coverage. Once
//      the wall is thoroughly covered, "Start Watching It Dry" unlocks.
//   2. DRYING - the whole point of the game. A progress bar climbs from 0
//      to 100% over DRY_DURATION_MS of *watched* time - see the WATCHING
//      mechanic below: the clock only runs while the mouse is actually
//      hovering over the painted wall. Move it off the canvas (or switch
//      tabs), and the paint just... waits for you. Forever, if need be.
//
// No frameworks, no build step - a single canvas, a splash screen and a
// game-over screen, same shape as the site's other games (see dullas's
// game.js for the fullest example of the shared conventions this borrows:
// STORAGE_KEYS/getOrCreatePlayerId, initPlayerNameUI, submitScore/
// fetchHighscores hitting server.js's /api routes).
// ============================================================================

const canvas = document.getElementById('wall-canvas');
const ctx = canvas.getContext('2d');
const CANVAS_W = canvas.width;
const CANVAS_H = canvas.height;
const SKIRTING_H = 70; // bottom strip of the canvas - never paintable
const WALL_H = CANVAS_H - SKIRTING_H;
const BRUSH_RADIUS = 30;

// ----------------------------------------------------------------------------
// Room geometry - the wall isn't just a flat rectangle: a roof bar along
// the top, straight vertical side returns (the adjoining walls, in
// shadow), and a window that simply doesn't accept paint. The roof and
// floor are both trapezoids that taper in to meet the vertical walls -
// the floor is just the roof's shape mirrored vertically, meeting the
// wall line and then fanning back out diagonally to the bottom corners
// of the canvas.
// ----------------------------------------------------------------------------
const CEILING_H = 44; // roof bar height
const EDGE_W = 46; // width of the (vertical, non-paintable) side returns - also the paintable x-boundary used for coverage sampling
// SKIRTING_H (defined above, 70) doubles as the floor strip's height -
// the floor trapezoid tapers from EDGE_W-inset at y=WALL_H (meeting the
// walls) down to full width at y=CANVAS_H (the bottom corners).

const WINDOW_RECT = { x: 96, y: CEILING_H + 90, w: 190, h: 250 }; // middle-left, doesn't accept paint

const LIGHT_ATTACH_X = CANVAS_W * 0.62;
const LIGHT_ATTACH_Y = CEILING_H;
const LIGHT_CORD_LEN = 92;
const LIGHT_HIT_RADIUS = 42; // how close the brush has to get to knock it
const LIGHT_GRAVITY = 900;
const LIGHT_DAMPING = 1.1;
const LIGHT_IMPULSE = 1.0;
const LIGHT_KNOCK_COOLDOWN_MS = 150;

const splashScreen = document.getElementById('splash-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const statsBar = document.getElementById('stats-bar');
const calmHeading = document.getElementById('calm-heading');
const awayStat = document.getElementById('away-stat');
const sidePanel = document.getElementById('side-panel');
const paintHud = document.getElementById('paint-hud');
const dryingHud = document.getElementById('drying-hud');
const coverageLabel = document.getElementById('coverage-label');
const coverageBar = document.getElementById('coverage-bar');
const resetWallBtn = document.getElementById('reset-wall-btn');
const dryingLabel = document.getElementById('drying-label');
const dryingBar = document.getElementById('drying-bar');
const captionBox = document.getElementById('caption-box');
const awayBanner = document.getElementById('away-banner');
const colorSwatchesEl = document.getElementById('color-swatches');
const startPaintingBtn = document.getElementById('start-painting-btn');
const paintAgainBtn = document.getElementById('paint-again-btn');
const gameOverStats = document.getElementById('game-over-stats');
const highscoreSection = document.getElementById('highscore-section');
const highscoreList = document.getElementById('highscore-list');
const playerNameEntry = document.getElementById('player-name-entry');
const playerNameDisplay = document.getElementById('player-name-display');
const playerNameInput = document.getElementById('player-name-input');
const playerNameCurrentEl = document.getElementById('player-name-current');
const playerNameSaveBtn = document.getElementById('player-name-save-btn');
const playerNameChangeBtn = document.getElementById('player-name-change-btn');

const COLORS = [
  { name: 'Cloud White', hex: '#f2efe4' },
  { name: 'Sage', hex: '#8ea482' },
  { name: 'Duck Egg', hex: '#a9cdd0' },
  { name: 'Blush', hex: '#dba99c' },
  { name: 'Slate', hex: '#5c6b73' },
  { name: 'Butter', hex: '#eccf7a' },
];

const DRY_DURATION_MS = 90 * 1000; // 90s of real time to fully dry, watched or not
const SAMPLE_W = 60;
const SAMPLE_H = 40;

const PAINT_TIME_LIMIT_MS = 30 * 1000; // round timer for the painting phase
const PAINT_TIME_BONUS = 10; // Moments of calm awarded for finishing the paint job in time

const CAPTIONS = [
  'Still wet.',
  'This is riveting.',
  "Rome wasn't built in a day. This wall might take longer.",
  'Scientific consensus: still drying.',
  'You could be doing literally anything else right now.',
  'A fly briefly considers landing. Decides against it.',
  'Somewhere, a kettle finishes boiling. This wall does not care.',
  'Studies show 9 out of 10 walls dry eventually.',
  'The paint appreciates your undivided attention.',
  'Your dedication has been noted by absolutely no one.',
  'This is the content you signed up for.',
  'Patience is a virtue. So, apparently, is this.',
  'Nothing is happening. Everything is happening, very slowly.',
];

// ----------------------------------------------------------------------------
// PERSISTENCE - just enough to remember who's playing, same pattern as
// dullas's game.js (STORAGE_KEYS + getOrCreatePlayerId). No save/resume
// here - a run only takes a couple of minutes, so there's nothing worth
// resuming.
// ----------------------------------------------------------------------------
const STORAGE_KEYS = {
  playerId: 'watchTheDrying.playerId',
  playerName: 'watchTheDrying.playerName',
};

function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getOrCreatePlayerId() {
  let id = null;
  try { id = localStorage.getItem(STORAGE_KEYS.playerId); } catch (e) { /* storage unavailable */ }
  if (!id) {
    id = createId();
    try { localStorage.setItem(STORAGE_KEYS.playerId, id); } catch (e) { /* best effort only */ }
  }
  return id;
}

function getPlayerName() {
  try { return localStorage.getItem(STORAGE_KEYS.playerName); } catch (e) { return null; }
}
function setPlayerName(name) {
  try { localStorage.setItem(STORAGE_KEYS.playerName, name); } catch (e) { /* best effort only */ }
}

function refreshPlayerNameUI() {
  const name = getPlayerName();
  if (name) {
    playerNameCurrentEl.textContent = name;
    playerNameDisplay.classList.remove('hidden');
    playerNameEntry.classList.add('hidden');
  } else {
    playerNameDisplay.classList.add('hidden');
    playerNameEntry.classList.remove('hidden');
  }
}

function initPlayerNameUI() {
  refreshPlayerNameUI();

  playerNameSaveBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) return;
    setPlayerName(name);
    refreshPlayerNameUI();
  });
  playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') playerNameSaveBtn.click();
  });
  playerNameChangeBtn.addEventListener('click', () => {
    playerNameInput.value = getPlayerName() || '';
    playerNameDisplay.classList.add('hidden');
    playerNameEntry.classList.remove('hidden');
    playerNameInput.focus();
  });
}

// ----------------------------------------------------------------------------
// BACKEND SYNC - the lightweight Pi server (see server.js). Best-effort,
// same as every other game on this site: a missing/unreachable server
// never breaks play, it just means no highscore gets recorded.
// ----------------------------------------------------------------------------
function postJson(url, data) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => null);
}

// The player's score - "Moments of calm" - is whole seconds spent
// actually watching the wall dry, plus a flat bonus for finishing the
// paint job within the round timer. See tick()'s watchedMs accumulation
// and beginDrying()'s paintBonusAwarded check.
function computeMomentsOfCalm() {
  return Math.floor(state.watchedMs / 1000) + (state.paintBonusAwarded ? PAINT_TIME_BONUS : 0);
}

function submitScore() {
  // Relative, not absolute - so this resolves to /drying/api/score when
  // mounted under /drying, or plain /api/score when this file is served
  // standalone (see server.js's two run modes). Same trick standup's
  // app.js uses.
  postJson('api/score', {
    playerId: state.playerId,
    name: getPlayerName() || 'Anonymous',
    colorName: state.selectedColor ? state.selectedColor.name : 'Unknown',
    coveragePercent: state.coveragePercent,
    momentsOfCalm: computeMomentsOfCalm(),
    paintBonusAwarded: state.paintBonusAwarded,
    totalElapsedMs: state.paintStartedAt ? (Date.now() - state.paintStartedAt) : 0,
    watchedMs: state.watchedMs,
    awayMs: state.awayMs,
    lookAwayCount: state.lookAwayCount,
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function fetchHighscores() {
  try {
    const res = await fetch('api/highscores?limit=10');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.entries || !data.entries.length) return;

    highscoreList.innerHTML = data.entries
      .map((e) => `<li><strong>${escapeHtml(e.name)}</strong> - ${escapeHtml(e.momentsOfCalm)} moments of calm, ${escapeHtml(e.colorName)}${e.lookAwayCount ? ` (looked away ${e.lookAwayCount}x)` : ' (never looked away)'}</li>`)
      .join('');
    highscoreSection.classList.remove('hidden');
  } catch (e) {
    // Server unreachable - leave the section hidden.
  }
}

// ----------------------------------------------------------------------------
// Game state
// ----------------------------------------------------------------------------
const state = {
  phase: 'splash', // 'splash' | 'painting' | 'drying' | 'done'
  selectedColor: null,
  playerId: getOrCreatePlayerId(),

  isStroking: false,
  lastPoint: null,
  coveragePercent: 0,

  pointerOverCanvas: false,
  lastMouse: null,

  paintStartedAt: null, // Date.now() when "Start Painting" was clicked
  dryStartedAt: null, // Date.now() when "Start Watching" was clicked

  dryProgress: 0, // 0..1, only advances while watching
  wasWatching: null, // null until drying starts, then tracks "watching" (see isCurrentlyWatching())
  watchedMs: 0,
  awayMs: 0,
  lookAwayCount: 0,

  lightAngle: 0,
  lightAngularVelocity: 0,
  lastLightKnockAt: 0,

  paintBonusAwarded: false,
  wallFilledAt100: false,
};

let lastTickTime = null;
let captionInterval = null;
let coverageInterval = null;
let rafHandle = null;

// ----------------------------------------------------------------------------
// Offscreen paint layer + a small canvas the coverage % is sampled from.
// Sampling a downscaled copy is much cheaper than scanning every pixel of
// the full-size layer every time, and coverage only needs to be
// approximate.
// ----------------------------------------------------------------------------
const paintCanvas = document.createElement('canvas');
paintCanvas.width = CANVAS_W;
paintCanvas.height = WALL_H;
const paintCtx = paintCanvas.getContext('2d');

// A second offscreen canvas the wet/dry "finish" is composited into each
// frame - see renderCanvas(). Kept separate from paintCanvas (the source
// of truth for coverage sampling) so the finish effects never alter the
// underlying paint data.
const finishCanvas = document.createElement('canvas');
finishCanvas.width = CANVAS_W;
finishCanvas.height = WALL_H;
const finishCtx = finishCanvas.getContext('2d');

const sampleCanvas = document.createElement('canvas');
sampleCanvas.width = SAMPLE_W;
sampleCanvas.height = SAMPLE_H;
const sampleCtx = sampleCanvas.getContext('2d');

// Coverage is sampled from the INNER rectangle - exactly the paintable
// area now that the side returns are straight verticals (see
// isPaintable() above). The window is carved out of that rectangle too,
// so a player is never required to paint the glass to reach 100%.
const INNER = { left: EDGE_W, top: CEILING_H, right: CANVAS_W - EDGE_W, bottom: WALL_H };
INNER.width = INNER.right - INNER.left;
INNER.height = INNER.bottom - INNER.top;

const WINDOW_SAMPLE = {
  x0: ((WINDOW_RECT.x - INNER.left) / INNER.width) * SAMPLE_W,
  y0: ((WINDOW_RECT.y - INNER.top) / INNER.height) * SAMPLE_H,
  x1: ((WINDOW_RECT.x + WINDOW_RECT.w - INNER.left) / INNER.width) * SAMPLE_W,
  y1: ((WINDOW_RECT.y + WINDOW_RECT.h - INNER.top) / INNER.height) * SAMPLE_H,
};

// A static plaster-ish speckle texture, rendered once and reused every
// frame rather than regenerating random noise per-frame (which would just
// look like static).
const textureCanvas = document.createElement('canvas');
textureCanvas.width = CANVAS_W;
textureCanvas.height = WALL_H;
// Deliberately ugly starting wall - a botched, patchy primer job in dull
// grey and off-white, the kind of wall that's exactly why this room needs
// painting. Big irregular blotches first (the "patches"), then the usual
// fine speckle grain on top.
(function buildTexture() {
  const tctx = textureCanvas.getContext('2d');
  tctx.fillStyle = '#cec9ba';
  tctx.fillRect(0, 0, CANVAS_W, WALL_H);

  const PATCH_COLORS = ['rgba(140,138,130,0.55)', 'rgba(235,231,218,0.55)', 'rgba(160,158,150,0.4)', 'rgba(220,216,203,0.45)'];
  for (let i = 0; i < 55; i++) {
    const x = Math.random() * CANVAS_W;
    const y = Math.random() * WALL_H;
    const w = 40 + Math.random() * 110;
    const h = 30 + Math.random() * 90;
    tctx.save();
    tctx.translate(x, y);
    tctx.rotate(Math.random() * Math.PI);
    tctx.fillStyle = PATCH_COLORS[Math.floor(Math.random() * PATCH_COLORS.length)];
    tctx.beginPath();
    tctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    tctx.fill();
    tctx.restore();
  }

  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * CANVAS_W;
    const y = Math.random() * WALL_H;
    const shade = Math.random() < 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
    tctx.fillStyle = shade;
    tctx.fillRect(x, y, 1.5, 1.5);
  }
})();

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
}

function rgbaString(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ----------------------------------------------------------------------------
// Room geometry helpers
// ----------------------------------------------------------------------------
function isInsideWindow(x, y) {
  return x >= WINDOW_RECT.x && x <= WINDOW_RECT.x + WINDOW_RECT.w
    && y >= WINDOW_RECT.y && y <= WINDOW_RECT.y + WINDOW_RECT.h;
}

function isPaintable(x, y) {
  if (y < CEILING_H || y > WALL_H) return false;
  if (x < EDGE_W || x > CANVAS_W - EDGE_W) return false;
  if (isInsideWindow(x, y)) return false;
  return true;
}

function getLampPosition() {
  return {
    x: LIGHT_ATTACH_X + Math.sin(state.lightAngle) * LIGHT_CORD_LEN,
    y: LIGHT_ATTACH_Y + Math.cos(state.lightAngle) * LIGHT_CORD_LEN,
  };
}

function maybeKnockLight(x, y) {
  const lamp = getLampPosition();
  const dist = Math.hypot(lamp.x - x, lamp.y - y);
  if (dist > LIGHT_HIT_RADIUS) return;
  const now = performance.now();
  if (now - state.lastLightKnockAt < LIGHT_KNOCK_COOLDOWN_MS) return;
  state.lastLightKnockAt = now;
  const dir = x < lamp.x ? 1 : -1; // knock it further away from the side it was hit
  state.lightAngularVelocity = Math.max(-4, Math.min(4, state.lightAngularVelocity + dir * LIGHT_IMPULSE));
}

function updateLightPhysics(dtMs) {
  const dt = dtMs / 1000;
  if (dt <= 0) return;
  const angularAccel = -(LIGHT_GRAVITY / LIGHT_CORD_LEN) * Math.sin(state.lightAngle) - LIGHT_DAMPING * state.lightAngularVelocity;
  state.lightAngularVelocity += angularAccel * dt;
  state.lightAngle += state.lightAngularVelocity * dt;
}

// ----------------------------------------------------------------------------
// Painting
// ----------------------------------------------------------------------------
function getCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

// A single dab reaches near-full opacity in one pass - the paint colour
// should read as bold and true the instant it touches the wall (a "just
// applied, still wet" look), never as a gradual blend up from the primer
// underneath. The soft-edged falloff is still there (so brush strokes
// blend into each other rather than showing hard circles), it's just
// steep rather than gradual.
function paintDab(x, y) {
  if (!state.selectedColor) return;
  maybeKnockLight(x, y);
  if (!isPaintable(x, y)) return;
  const g = paintCtx.createRadialGradient(x, y, 0, x, y, BRUSH_RADIUS);
  g.addColorStop(0, rgbaString(state.selectedColor.hex, 0.95));
  g.addColorStop(0.75, rgbaString(state.selectedColor.hex, 0.85));
  g.addColorStop(1, rgbaString(state.selectedColor.hex, 0));
  paintCtx.fillStyle = g;
  paintCtx.beginPath();
  paintCtx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
  paintCtx.fill();
}

function strokeTo(x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.floor(dist / 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintDab(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
}

function clampToWall(pt) {
  return {
    x: Math.max(EDGE_W, Math.min(CANVAS_W - EDGE_W, pt.x)),
    y: Math.max(CEILING_H, Math.min(WALL_H, pt.y)),
  };
}

function computeCoverage() {
  sampleCtx.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
  sampleCtx.drawImage(paintCanvas, INNER.left, INNER.top, INNER.width, INNER.height, 0, 0, SAMPLE_W, SAMPLE_H);
  const data = sampleCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  let covered = 0;
  const total = SAMPLE_W * SAMPLE_H;
  for (let py = 0; py < SAMPLE_H; py++) {
    for (let px = 0; px < SAMPLE_W; px++) {
      if (px >= WINDOW_SAMPLE.x0 && px < WINDOW_SAMPLE.x1 && py >= WINDOW_SAMPLE.y0 && py < WINDOW_SAMPLE.y1) {
        covered++; // the window doesn't accept paint - don't hold that against the player
        continue;
      }
      const idx = (py * SAMPLE_W + px) * 4;
      if (data[idx + 3] > 130) covered++;
    }
  }
  return Math.min(100, Math.round((covered / total) * 100));
}

// The alpha-threshold sampling in computeCoverage() can read as "100%"
// while a handful of individual pixels are still faintly under-painted
// (soft brush edges overlapping just short of full opacity). Once the
// slider first reaches 100%, do one flood-fill pass over the whole
// paintable rect at full opacity so there are never any visible pinholes
// left in the finished wall. The window doesn't need carving back out -
// drawWindow() is always drawn on top of it anyway.
function fillRemainingGaps() {
  paintCtx.save();
  paintCtx.fillStyle = state.selectedColor.hex;
  paintCtx.fillRect(EDGE_W, CEILING_H, CANVAS_W - EDGE_W * 2, WALL_H - CEILING_H);
  paintCtx.restore();
}

function updateCoverageUI() {
  state.coveragePercent = computeCoverage();
  coverageLabel.textContent = `Painted: ${state.coveragePercent}%`;
  coverageBar.style.width = `${state.coveragePercent}%`;

  if (state.coveragePercent >= 100 && !state.wallFilledAt100) {
    state.wallFilledAt100 = true;
    fillRemainingGaps();
    coverageLabel.textContent = 'Painted: 100% - starting to watch it dry…';
    // A short beat so the player actually sees "100%" land before the
    // view switches - no button to click, painting just flows straight
    // into watching.
    setTimeout(beginDrying, 500);
  }
}

function resetWall() {
  paintCtx.clearRect(0, 0, CANVAS_W, WALL_H);
  state.coveragePercent = 0;
  state.wallFilledAt100 = false;
  updateCoverageUI();
}

// Coverage sampling runs on its own timer (started in the "Start Painting"
// handler, stopped once painting ends) rather than only after each stroke,
// so the % readout keeps climbing even if the player holds the brush
// still for a moment mid-drag.
function startCoverageSampling() {
  if (coverageInterval) clearInterval(coverageInterval);
  coverageInterval = setInterval(updateCoverageUI, 150);
}
function stopCoverageSampling() {
  if (coverageInterval) clearInterval(coverageInterval);
  coverageInterval = null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'painting') return;
  state.isStroking = true;
  const pt = clampToWall(getCanvasPoint(e.clientX, e.clientY));
  state.lastPoint = pt;
  paintDab(pt.x, pt.y);
});

canvas.addEventListener('pointermove', (e) => {
  state.pointerOverCanvas = true;
  state.lastMouse = getCanvasPoint(e.clientX, e.clientY);
  if (state.phase !== 'painting' || !state.isStroking) return;
  const pt = clampToWall(state.lastMouse);
  if (state.lastPoint) strokeTo(state.lastPoint.x, state.lastPoint.y, pt.x, pt.y);
  state.lastPoint = pt;
});

canvas.addEventListener('pointerenter', (e) => {
  state.pointerOverCanvas = true;
  state.lastMouse = getCanvasPoint(e.clientX, e.clientY);
});

canvas.addEventListener('pointerleave', () => {
  // This is the heart of the WATCHING mechanic - the "eyes" cursor and the
  // drying clock (see isCurrentlyWatching()) both key off pointerOverCanvas,
  // not tab visibility/focus. Move the mouse off the wall and the game
  // considers you to have looked away, full stop.
  state.pointerOverCanvas = false;
  state.lastMouse = null;
  endStroke();
});

function endStroke() {
  if (state.isStroking) updateCoverageUI(); // immediate feedback the moment a stroke ends
  state.isStroking = false;
  state.lastPoint = null;
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

resetWallBtn.addEventListener('click', resetWall);

// ----------------------------------------------------------------------------
// Rendering - wall texture, the player's paint (with a wet/dry finish
// masked to exactly the painted pixels), the room details on top
// (window, roof, side returns, hanging light), then the skirting board
// and cursor.
// ----------------------------------------------------------------------------
function renderPaintFinish() {
  finishCtx.clearRect(0, 0, CANVAS_W, WALL_H);
  finishCtx.drawImage(paintCanvas, 0, 0);

  // Everything from here on is masked to the paint's own alpha via
  // 'source-atop', so gloss/dulling only ever appears ON TOP OF painted
  // pixels - it can never bleed onto the surrounding primer/texture, which
  // is what made the old effect look like the colour itself was morphing.
  finishCtx.save();
  finishCtx.globalCompositeOperation = 'source-atop';

  const wetness = state.phase === 'drying' ? (1 - state.dryProgress) : (state.phase === 'painting' ? 1 : 0);

  if (wetness > 0) {
    // A fixed (non-animated) diagonal specular highlight - "just applied,
    // still glossy" - fading out smoothly as wetness drops rather than
    // sweeping/moving, which is what read as a colour morph before.
    const grad = finishCtx.createLinearGradient(0, 0, CANVAS_W * 0.55, WALL_H * 0.55);
    grad.addColorStop(0, `rgba(255,255,255,${0.32 * wetness})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${0.06 * wetness})`);
    grad.addColorStop(1, `rgba(0,0,0,${0.05 * wetness})`);
    finishCtx.fillStyle = grad;
    finishCtx.fillRect(0, 0, CANVAS_W, WALL_H);
  }

  if (state.phase === 'drying' && state.dryProgress > 0) {
    // Dries duller/matte: a soft, slightly warm grey tint that strengthens
    // as dryProgress climbs.
    finishCtx.fillStyle = `rgba(110,104,92,${0.16 * state.dryProgress})`;
    finishCtx.fillRect(0, 0, CANVAS_W, WALL_H);
  }

  finishCtx.restore();
}

function drawCeiling() {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(CANVAS_W, 0);
  ctx.lineTo(CANVAS_W - EDGE_W, CEILING_H);
  ctx.lineTo(EDGE_W, CEILING_H);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// Straight vertical side returns - the adjoining walls, shown in shadow.
// Width is constant (EDGE_W) top to bottom. Drawn full-canvas-height (not
// just between the ceiling and floor lines) and BEFORE drawCeiling() /
// drawFloor() in renderCanvas() - the roof and floor trapezoids taper in
// diagonally at these corners, so without this, the corner triangles
// between the wall's straight edge and the roof/floor's diagonal edge
// would show bare background. Drawing the wall the full height first and
// letting the roof/floor paint over the middle of it means those corner
// triangles end up filled with wall colour instead.
function drawEdges() {
  ctx.save();
  let g = ctx.createLinearGradient(0, 0, EDGE_W, 0);
  g.addColorStop(0, '#8f8879');
  g.addColorStop(1, '#c7bfae');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, EDGE_W, CANVAS_H);

  g = ctx.createLinearGradient(CANVAS_W - EDGE_W, 0, CANVAS_W, 0);
  g.addColorStop(0, '#c7bfae');
  g.addColorStop(1, '#8f8879');
  ctx.fillStyle = g;
  ctx.fillRect(CANVAS_W - EDGE_W, 0, EDGE_W, CANVAS_H);
  ctx.restore();
}

// The floor - the ceiling's shape mirrored vertically: it meets the
// vertical wall lines at y=WALL_H (inset by EDGE_W on each side), then
// fans back out diagonally to the full-width bottom corners of the
// canvas at y=CANVAS_H.
function drawFloor() {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(EDGE_W, WALL_H);
  ctx.lineTo(CANVAS_W - EDGE_W, WALL_H);
  ctx.lineTo(CANVAS_W, CANVAS_H);
  ctx.lineTo(0, CANVAS_H);
  ctx.closePath();
  ctx.fillStyle = '#8a6a45';
  ctx.fill();

  // Floorboard seams - clipped to the floor's own trapezoid, then drawn
  // as lines from the (narrower) top edge to the (wider) bottom edge, so
  // they converge toward the wall exactly like the trapezoid's own sides -
  // simple perspective floorboards receding away from the viewer.
  ctx.save();
  ctx.clip();
  const PLANK_COUNT = 9;
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let i = 1; i < PLANK_COUNT; i++) {
    const t = i / PLANK_COUNT;
    const topX = EDGE_W + (CANVAS_W - EDGE_W * 2) * t;
    const bottomX = CANVAS_W * t;
    ctx.beginPath();
    ctx.moveTo(topX, WALL_H);
    ctx.lineTo(bottomX, CANVAS_H);
    ctx.stroke();
  }
  // One cross-seam partway down, for a plank end-joint.
  ctx.beginPath();
  ctx.moveTo(EDGE_W * 0.5, WALL_H + (CANVAS_H - WALL_H) * 0.55);
  ctx.lineTo(CANVAS_W - EDGE_W * 0.5, WALL_H + (CANVAS_H - WALL_H) * 0.55);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 1; i < PLANK_COUNT; i++) {
    const t = i / PLANK_COUNT;
    const topX = EDGE_W + (CANVAS_W - EDGE_W * 2) * t + 2;
    const bottomX = CANVAS_W * t + 2;
    ctx.beginPath();
    ctx.moveTo(topX, WALL_H);
    ctx.lineTo(bottomX, CANVAS_H);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(EDGE_W, WALL_H);
  ctx.lineTo(CANVAS_W - EDGE_W, WALL_H);
  ctx.lineTo(CANVAS_W, CANVAS_H);
  ctx.lineTo(0, CANVAS_H);
  ctx.closePath();
  ctx.stroke();

  // Skirting board highlight line where the floor meets the wall.
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(EDGE_W, WALL_H + 2);
  ctx.lineTo(CANVAS_W - EDGE_W, WALL_H + 2);
  ctx.stroke();
  ctx.restore();
}

function drawWindow() {
  const { x, y, w, h } = WINDOW_RECT;
  ctx.save();
  ctx.fillStyle = '#5c4632';
  ctx.fillRect(x - 8, y - 8, w + 16, h + 16);

  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#8fc7e8');
  g.addColorStop(1, '#cfe9f5');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.12, y);
  ctx.lineTo(x + w * 0.32, y);
  ctx.lineTo(x + w * 0.14, y + h);
  ctx.lineTo(x + w * -0.02, y + h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#5c4632';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawLight() {
  const attach = { x: LIGHT_ATTACH_X, y: LIGHT_ATTACH_Y };
  const lamp = getLampPosition();

  ctx.save();
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(attach.x, attach.y);
  ctx.lineTo(lamp.x, lamp.y);
  ctx.stroke();

  ctx.translate(lamp.x, lamp.y);
  ctx.rotate(state.lightAngle);
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(14, 0);
  ctx.lineTo(24, 26);
  ctx.lineTo(-24, 26);
  ctx.closePath();
  ctx.fillStyle = '#e8dcc0';
  ctx.fill();
  ctx.strokeStyle = '#8a6b4f';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, 30, 10, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,244,200,0.75)';
  ctx.fill();
  ctx.restore();
}

// Round timer for the painting phase, top-left of the canvas - green
// while there's still time, red once the limit has passed. Purely a
// countdown display; running out of time doesn't end the round, it just
// costs the completion bonus (see PAINT_TIME_BONUS / beginDrying()).
function drawPaintTimer() {
  if (state.phase !== 'painting' || !state.paintStartedAt) return;
  const remainingMs = PAINT_TIME_LIMIT_MS - (Date.now() - state.paintStartedAt);
  const over = remainingMs <= 0;
  const totalSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const label = (over ? '-' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;

  ctx.save();
  ctx.fillStyle = 'rgba(20,30,35,0.78)';
  ctx.fillRect(14, 14, 92, 34);
  ctx.fillStyle = over ? '#e05a4e' : '#4caf7d';
  ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 14 + 46, 14 + 18);
  ctx.restore();
}

function drawBrushCursor(x, y, colorHex) {
  // Anchored so the bristle TIP sits exactly at (x, y) - i.e. where paint
  // is actually being deposited - with the handle trailing off to the
  // upper-right.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = colorHex;
  ctx.fillRect(-7, -16, 14, 16);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-7, -16, 14, 16);
  ctx.fillStyle = '#c9c9c9';
  ctx.fillRect(-7, -23, 14, 8);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(-5.5, -50, 11, 28);
  ctx.restore();
}

// "counting" is false when the eyes are over the window/roof/floor/edges
// during drying - a visual echo of isCurrentlyWatching()'s gating, so
// it's obvious on screen that hovering off the wall doesn't earn Moments
// of calm: the eyes go half-lidded and grey instead of open and white.
function drawEyesCursor(x, y, counting) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = counting ? 1 : 0.5;
  [-13, 13].forEach((dx) => {
    ctx.beginPath();
    if (counting) {
      ctx.ellipse(dx, 0, 9, 12, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(dx, 0, 9, 5, 0, 0, Math.PI * 2); // half-lidded when not counting
    }
    ctx.fillStyle = counting ? '#ffffff' : '#c7c7c7';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.stroke();
    if (counting) {
      ctx.beginPath();
      ctx.arc(dx, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2a2a';
      ctx.fill();
    }
  });
  ctx.restore();
}

function renderCanvas() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.drawImage(textureCanvas, 0, 0);
  renderPaintFinish();
  ctx.drawImage(finishCanvas, 0, 0);

  drawEdges();
  drawCeiling();
  drawFloor();
  drawWindow();
  drawLight();
  drawPaintTimer();

  // Custom cursor - only drawn while the pointer is actually over the
  // canvas (see the pointerenter/pointerleave handlers above). A
  // paintbrush (bristles tinted with the chosen colour) while there's
  // still painting to do, switching to a pair of watching eyes once the
  // wall is fully covered or once we're in the drying phase proper.
  if ((state.phase === 'painting' || state.phase === 'drying') && state.pointerOverCanvas && state.lastMouse) {
    if (state.phase === 'drying' || state.coveragePercent >= 100) {
      const counting = isPaintable(state.lastMouse.x, state.lastMouse.y);
      drawEyesCursor(state.lastMouse.x, state.lastMouse.y, counting);
    } else if (state.selectedColor) {
      drawBrushCursor(state.lastMouse.x, state.lastMouse.y, state.selectedColor.hex);
    }
  }
}

// ----------------------------------------------------------------------------
// Captions - purely for comic effect, rotate every 7s while drying.
// ----------------------------------------------------------------------------
let captionIndex = 0;
function showNextCaption() {
  captionBox.classList.add('fading');
  setTimeout(() => {
    captionIndex = (captionIndex + 1) % CAPTIONS.length;
    captionBox.textContent = CAPTIONS[captionIndex];
    captionBox.classList.remove('fading');
  }, 400);
}

function startCaptionRotation() {
  captionIndex = 0;
  captionBox.textContent = CAPTIONS[0];
  captionBox.classList.remove('fading');
  if (captionInterval) clearInterval(captionInterval);
  captionInterval = setInterval(showNextCaption, 7000);
}

function stopCaptionRotation() {
  if (captionInterval) clearInterval(captionInterval);
  captionInterval = null;
}

// ----------------------------------------------------------------------------
// Drying / watching mechanic
// ----------------------------------------------------------------------------
function formatMinSec(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// "Watching" means the mouse is literally hovering over the painted wall
// (and the tab is visible) - see pointerenter/pointerleave above. It no
// longer pauses the drying itself (real paint dries whether you're
// watching it or not); it only gates the score - see MOMENTS OF CALM
// below.
function isCurrentlyWatching() {
  if (document.visibilityState !== 'visible' || !state.pointerOverCanvas || !state.lastMouse) return false;
  // Has to be over the actual painted wall - hovering the window, the
  // roof, the floor, or the side returns doesn't count. isPaintable()
  // already describes exactly that rectangle (minus the window cutout).
  return isPaintable(state.lastMouse.x, state.lastMouse.y);
}

function updateWatchStats() {
  calmHeading.textContent = `Moments of calm: ${Math.floor(state.watchedMs / 1000)}`;
  awayStat.textContent = `Looked away: ${formatMinSec(state.awayMs)} (${state.lookAwayCount}x)`;
}

function tick(now) {
  const dt = lastTickTime ? now - lastTickTime : 0;
  lastTickTime = now;

  updateLightPhysics(dt);

  if (state.phase === 'drying') {
    // The drying clock itself runs unconditionally - real paint doesn't
    // care whether anyone's looking at it.
    state.dryProgress = Math.min(1, state.dryProgress + dt / DRY_DURATION_MS);

    // MOMENTS OF CALM - the player's score. One point per second of
    // wall-clock time spent actually watching the wall dry (mouse over
    // the canvas, tab visible). This is what pauses when you look away,
    // not the drying itself.
    const watching = isCurrentlyWatching();
    if (state.wasWatching === null) {
      state.wasWatching = watching;
    } else if (watching !== state.wasWatching) {
      if (!watching) {
        state.lookAwayCount++;
        awayBanner.classList.remove('hidden');
      } else {
        awayBanner.classList.add('hidden');
        captionBox.textContent = "Oh, you're back. The wall dried on without you, but your calm streak missed you.";
      }
      state.wasWatching = watching;
    }

    if (watching) {
      state.watchedMs += dt;
    } else {
      state.awayMs += dt;
    }

    dryingLabel.textContent = `Drying: ${Math.round(state.dryProgress * 100)}%`;
    dryingBar.style.width = `${state.dryProgress * 100}%`;
    updateWatchStats();

    if (state.dryProgress >= 1) {
      finishDrying();
    }
  }

  renderCanvas();
  rafHandle = requestAnimationFrame(tick);
}

function startRenderLoop() {
  if (rafHandle) return;
  lastTickTime = null;
  rafHandle = requestAnimationFrame(tick);
}

function stopRenderLoop() {
  if (rafHandle) cancelAnimationFrame(rafHandle);
  rafHandle = null;
}

function finishDrying() {
  state.phase = 'done';
  stopCaptionRotation();
  showGameOverScreen();
}

// ----------------------------------------------------------------------------
// Screen transitions
// ----------------------------------------------------------------------------
function initColorSwatches() {
  colorSwatchesEl.innerHTML = '';
  COLORS.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch-btn';
    btn.style.background = color.hex;
    btn.title = color.name;
    btn.addEventListener('click', () => {
      state.selectedColor = color;
      Array.from(colorSwatchesEl.children).forEach((c) => c.classList.remove('selected'));
      btn.classList.add('selected');
      startPaintingBtn.disabled = false;
      startPaintingBtn.textContent = `Start Painting (${color.name})`;
    });
    colorSwatchesEl.appendChild(btn);
  });
}

startPaintingBtn.addEventListener('click', () => {
  if (!state.selectedColor) return;
  state.phase = 'painting';
  state.paintStartedAt = Date.now();
  resetWall();
  splashScreen.classList.add('fading-out');
  setTimeout(() => splashScreen.classList.add('hidden'), 350);
  statsBar.classList.remove('hidden');
  updateWatchStats();
  sidePanel.classList.remove('hidden');
  paintHud.classList.remove('hidden');
  dryingHud.classList.add('hidden');
  startRenderLoop();
  startCoverageSampling();
});

// Automatic - no button to click. Once the wall reads 100% painted (see
// updateCoverageUI(), which calls this), the game moves straight into the
// drying phase itself.
function beginDrying() {
  stopCoverageSampling();
  state.paintBonusAwarded = state.paintStartedAt
    ? (Date.now() - state.paintStartedAt) <= PAINT_TIME_LIMIT_MS
    : false;
  state.phase = 'drying';
  state.dryStartedAt = Date.now();
  state.dryProgress = 0;
  state.watchedMs = 0;
  state.awayMs = 0;
  state.lookAwayCount = 0;
  state.wasWatching = null;
  paintHud.classList.add('hidden');
  dryingHud.classList.remove('hidden');
  awayBanner.classList.add('hidden');
  startCaptionRotation();
}

function showGameOverScreen() {
  const totalElapsedMs = state.paintStartedAt ? (Date.now() - state.paintStartedAt) : 0;
  const momentsOfCalm = computeMomentsOfCalm();
  gameOverStats.innerHTML = `
    <p class="score-line">Moments of calm: <strong>${momentsOfCalm}</strong>${state.paintBonusAwarded ? ` <span class="bonus-tag">(+${PAINT_TIME_BONUS} in-time bonus)</span>` : ''}</p>
    <p>Colour: <strong>${escapeHtml(state.selectedColor ? state.selectedColor.name : 'Unknown')}</strong></p>
    <p>Coverage: <strong>${state.coveragePercent}%</strong></p>
    <p>Total time (paint + dry): <strong>${formatMinSec(totalElapsedMs)}</strong></p>
    <p>Time actually watching: <strong>${Math.floor(state.watchedMs / 1000)}s</strong></p>
    <p>Time spent looking away: <strong>${formatMinSec(state.awayMs)}</strong> (${state.lookAwayCount}x)</p>
  `;
  dryingHud.classList.add('hidden');
  gameOverScreen.classList.remove('hidden');
  requestAnimationFrame(() => gameOverScreen.classList.remove('fading-out'));
  submitScore();
  fetchHighscores();
}

function resetToSplash() {
  state.phase = 'splash';
  state.selectedColor = null;
  state.paintStartedAt = null;
  state.dryStartedAt = null;
  state.dryProgress = 0;
  state.watchedMs = 0;
  state.awayMs = 0;
  state.lookAwayCount = 0;
  state.wasWatching = null;
  state.pointerOverCanvas = false;
  state.lastMouse = null;
  state.paintBonusAwarded = false;
  resetWall();
  stopCaptionRotation();
  stopCoverageSampling();
  stopRenderLoop();

  Array.from(colorSwatchesEl.children).forEach((c) => c.classList.remove('selected'));
  startPaintingBtn.disabled = true;
  startPaintingBtn.textContent = 'Pick a colour first';

  gameOverScreen.classList.add('hidden');
  statsBar.classList.add('hidden');
  sidePanel.classList.add('hidden');
  paintHud.classList.remove('hidden');
  dryingHud.classList.add('hidden');
  splashScreen.classList.remove('hidden');
  splashScreen.classList.remove('fading-out');

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  renderCanvas();
}

paintAgainBtn.addEventListener('click', resetToSplash);

// ----------------------------------------------------------------------------
// Init
// ----------------------------------------------------------------------------
initColorSwatches();
initPlayerNameUI();
renderCanvas();
