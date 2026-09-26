// ============================================================================
// WATCH THE DRYING
//
// Two phases:
//   1. PAINTING - drag the brush over the wall to build up coverage. Once
//      the wall is thoroughly covered, "Start Watching It Dry" unlocks.
//   2. DRYING - the whole point of the game. A progress bar climbs from 0
//      to 100% over DRY_DURATION_MS of *watched* time - see the WATCHING
//      mechanic below, which is the one bit of actual game design here:
//      the clock only runs while this tab is visible AND focused. Alt-tab
//      away, and the paint just... waits for you. Forever, if need be.
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

const splashScreen = document.getElementById('splash-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const paintHud = document.getElementById('paint-hud');
const dryingHud = document.getElementById('drying-hud');
const coverageLabel = document.getElementById('coverage-label');
const coverageBar = document.getElementById('coverage-bar');
const startWatchingBtn = document.getElementById('start-watching-btn');
const resetWallBtn = document.getElementById('reset-wall-btn');
const dryingLabel = document.getElementById('drying-label');
const dryingBar = document.getElementById('drying-bar');
const captionBox = document.getElementById('caption-box');
const awayBanner = document.getElementById('away-banner');
const watchStats = document.getElementById('watch-stats');
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

const DRY_DURATION_MS = 90 * 1000; // 90s of actually-watched time to fully dry
const COVERAGE_THRESHOLD = 95; // % coverage required to unlock "Start Watching"
const SAMPLE_W = 60;
const SAMPLE_H = 40;

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
      .map((e) => `<li><strong>${escapeHtml(e.name)}</strong> - ${escapeHtml(e.formattedTime)}, ${escapeHtml(e.colorName)}${e.lookAwayCount ? ` (looked away ${e.lookAwayCount}x)` : ' (never looked away)'}</li>`)
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

  paintStartedAt: null, // Date.now() when "Start Painting" was clicked
  dryStartedAt: null, // Date.now() when "Start Watching" was clicked

  dryProgress: 0, // 0..1, only advances while wasWatching is true
  wasWatching: null, // null until drying starts, then tracks visible+focused
  watchedMs: 0,
  awayMs: 0,
  lookAwayCount: 0,
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

const sampleCanvas = document.createElement('canvas');
sampleCanvas.width = SAMPLE_W;
sampleCanvas.height = SAMPLE_H;
const sampleCtx = sampleCanvas.getContext('2d');

// A static plaster-ish speckle texture, rendered once and reused every
// frame rather than regenerating random noise per-frame (which would just
// look like static).
const textureCanvas = document.createElement('canvas');
textureCanvas.width = CANVAS_W;
textureCanvas.height = WALL_H;
(function buildTexture() {
  const tctx = textureCanvas.getContext('2d');
  tctx.fillStyle = '#d9d2c2';
  tctx.fillRect(0, 0, CANVAS_W, WALL_H);
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * CANVAS_W;
    const y = Math.random() * WALL_H;
    const shade = Math.random() < 0.5 ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)';
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
// Painting
// ----------------------------------------------------------------------------
function getCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function paintDab(x, y) {
  if (!state.selectedColor) return;
  const g = paintCtx.createRadialGradient(x, y, 0, x, y, BRUSH_RADIUS);
  g.addColorStop(0, rgbaString(state.selectedColor.hex, 0.55));
  g.addColorStop(0.7, rgbaString(state.selectedColor.hex, 0.4));
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
    x: Math.max(0, Math.min(CANVAS_W, pt.x)),
    y: Math.max(0, Math.min(WALL_H, pt.y)),
  };
}

function computeCoverage() {
  sampleCtx.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
  sampleCtx.drawImage(paintCanvas, 0, 0, CANVAS_W, WALL_H, 0, 0, SAMPLE_W, SAMPLE_H);
  const data = sampleCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  let covered = 0;
  const total = SAMPLE_W * SAMPLE_H;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 130) covered++;
  }
  return Math.min(100, Math.round((covered / total) * 100));
}

function updateCoverageUI() {
  state.coveragePercent = computeCoverage();
  coverageLabel.textContent = `Painted: ${state.coveragePercent}%`;
  coverageBar.style.width = `${state.coveragePercent}%`;
  startWatchingBtn.disabled = state.coveragePercent < COVERAGE_THRESHOLD;
}

function resetWall() {
  paintCtx.clearRect(0, 0, CANVAS_W, WALL_H);
  state.coveragePercent = 0;
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
  if (state.phase !== 'painting' || !state.isStroking) return;
  const pt = clampToWall(getCanvasPoint(e.clientX, e.clientY));
  if (state.lastPoint) strokeTo(state.lastPoint.x, state.lastPoint.y, pt.x, pt.y);
  state.lastPoint = pt;
});

function endStroke() {
  if (state.isStroking) updateCoverageUI(); // immediate feedback the moment a stroke ends
  state.isStroking = false;
  state.lastPoint = null;
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointerleave', endStroke);
canvas.addEventListener('pointercancel', endStroke);

resetWallBtn.addEventListener('click', resetWall);

// ----------------------------------------------------------------------------
// Rendering - wall texture + skirting board + the player's paint layer,
// with a fading "wet sheen" overlay once drying starts.
// ----------------------------------------------------------------------------
function renderCanvas() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Wall texture
  ctx.drawImage(textureCanvas, 0, 0);

  // The player's paint
  ctx.drawImage(paintCanvas, 0, 0);

  // Wet sheen: a dark overlay that fades out as the paint dries, plus a
  // soft diagonal highlight sweep that fades out even faster (glossy wet
  // paint catches the light; matte dry paint doesn't).
  if (state.phase === 'drying' || (state.phase === 'painting' && state.coveragePercent > 0)) {
    const wetness = state.phase === 'drying' ? (1 - state.dryProgress) : 1;
    ctx.save();
    ctx.globalAlpha = 0.22 * wetness;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_W, WALL_H);
    ctx.restore();

    if (wetness > 0.4) {
      const sheenAlpha = 0.12 * ((wetness - 0.4) / 0.6);
      const sweep = (performance.now() / 4000) % 1;
      const gradX = sweep * (CANVAS_W + 300) - 150;
      const grad = ctx.createLinearGradient(gradX - 120, 0, gradX + 120, WALL_H);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(255,255,255,${sheenAlpha})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, WALL_H);
      ctx.restore();
    }
  }

  // Skirting board
  ctx.fillStyle = '#7c5a3a';
  ctx.fillRect(0, WALL_H, CANVAS_W, SKIRTING_H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, WALL_H, CANVAS_W, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, CANVAS_H - 4, CANVAS_W, 4);

  // Custom cursor - a paintbrush (bristles tinted with the chosen colour)
  // while there's still painting to do, switching to a pair of watching
  // eyes once the wall is fully covered or once we're in the drying
  // phase proper. The canvas has its native cursor hidden (see
  // style.css) so this is the only pointer shown over it.
  if ((state.phase === 'painting' || state.phase === 'drying') && state.lastMouse) {
    if (state.phase === 'drying' || state.coveragePercent >= 100) {
      drawEyesCursor(state.lastMouse.x, state.lastMouse.y);
    } else if (state.selectedColor) {
      drawBrushCursor(state.lastMouse.x, state.lastMouse.y, state.selectedColor.hex);
    }
  }
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

function drawEyesCursor(x, y) {
  ctx.save();
  ctx.translate(x, y);
  [-13, 13].forEach((dx) => {
    ctx.beginPath();
    ctx.ellipse(dx, 0, 9, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(dx, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2a2a';
    ctx.fill();
  });
  ctx.restore();
}

canvas.addEventListener('pointermove', (e) => {
  state.lastMouse = getCanvasPoint(e.clientX, e.clientY);
});

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

function isCurrentlyWatching() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function updateWatchStats() {
  watchStats.textContent = `Watched ${formatMinSec(state.watchedMs)} · Looked away ${formatMinSec(state.awayMs)} (${state.lookAwayCount}x)`;
}

function tick(now) {
  const dt = lastTickTime ? now - lastTickTime : 0;
  lastTickTime = now;

  if (state.phase === 'drying') {
    const watching = isCurrentlyWatching();
    if (state.wasWatching === null) {
      state.wasWatching = watching;
    } else if (watching !== state.wasWatching) {
      if (!watching) {
        state.lookAwayCount++;
        awayBanner.classList.remove('hidden');
      } else {
        awayBanner.classList.add('hidden');
        captionBox.textContent = "Oh, you're back. The wall did not miss you (it also did not dry without you).";
      }
      state.wasWatching = watching;
    }

    if (watching) {
      state.watchedMs += dt;
      state.dryProgress = Math.min(1, state.dryProgress + dt / DRY_DURATION_MS);
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
  paintHud.classList.remove('hidden');
  startRenderLoop();
  startCoverageSampling();
});

startWatchingBtn.addEventListener('click', () => {
  if (state.coveragePercent < COVERAGE_THRESHOLD) return;
  stopCoverageSampling();
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
});

function showGameOverScreen() {
  const totalElapsedMs = state.paintStartedAt ? (Date.now() - state.paintStartedAt) : 0;
  gameOverStats.innerHTML = `
    <p>Colour: <strong>${escapeHtml(state.selectedColor ? state.selectedColor.name : 'Unknown')}</strong></p>
    <p>Coverage: <strong>${state.coveragePercent}%</strong></p>
    <p>Total time (paint + dry): <strong>${formatMinSec(totalElapsedMs)}</strong></p>
    <p>Time actually watching: <strong>${formatMinSec(state.watchedMs)}</strong></p>
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
  resetWall();
  stopCaptionRotation();
  stopCoverageSampling();
  stopRenderLoop();

  Array.from(colorSwatchesEl.children).forEach((c) => c.classList.remove('selected'));
  startPaintingBtn.disabled = true;
  startPaintingBtn.textContent = 'Pick a colour first';

  gameOverScreen.classList.add('hidden');
  paintHud.classList.add('hidden');
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
