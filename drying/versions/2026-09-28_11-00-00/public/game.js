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
// Attached up inside the roof bar itself (not at the wall/ceiling seam) -
// reads as "hanging from the ceiling" rather than "hanging off the top
// of the wall". Cord length is increased by the same amount the attach
// point moved up, so the lamp still rests at roughly the same height on
// the wall as before.
const LIGHT_ATTACH_Y = CEILING_H * 0.35;
const LIGHT_CORD_LEN = 92 + (CEILING_H - LIGHT_ATTACH_Y);
const LIGHT_HIT_RADIUS = 42; // how close the brush has to get to knock it
const LIGHT_GRAVITY = 900;
const LIGHT_DAMPING = 1.1;
const LIGHT_IMPULSE = 1.0;
const LIGHT_KNOCK_COOLDOWN_MS = 150;

const splashScreen = document.getElementById('splash-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const statsBar = document.getElementById('stats-bar');
const calmHeading = document.getElementById('calm-heading');
const roundHeading = document.getElementById('round-heading');
const roundDetails = document.getElementById('round-details');
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
const roundHud = document.getElementById('round-hud');
const roundTitle = document.getElementById('round-title');
const roundReward = document.getElementById('round-reward');
const roundCurrency = document.getElementById('round-currency');
const upgradeList = document.getElementById('upgrade-list');
const nextRoundBtn = document.getElementById('next-round-btn');
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

const ROOM_SCENES = [
  { kind: 'arctic', sky: ['#a9d9ef', '#e8f7fa'], sun: '#fff8dc', land: ['#8db9c8', '#f2fbff'], floor: ['#b9d3d4', '#6e9097', '#e0eeee'], shade: ['#d8eef0', '#8ba6aa'] },
  { kind: 'beach', sky: ['#49b9d4', '#d5f3ed'], sun: '#fff3b1', land: ['#41a9b5', '#23758a'], floor: ['#d4b375', '#967044', '#f0d9a2'], shade: ['#e7dbb7', '#8d7751'] },
  { kind: 'city', sky: ['#54779e', '#e0a184'], sun: '#ffe5bb', land: ['#525d70', '#303c52'], floor: ['#787878', '#464646', '#b1a89d'], shade: ['#e6a46e', '#875637'] },
  { kind: 'desert', sky: ['#e99b5c', '#ffe0a0'], sun: '#fff0b6', land: ['#d99a50', '#a96242'], floor: ['#b76643', '#703e34', '#df9e6e'], shade: ['#efb45e', '#94623b'] },
  { kind: 'earthy', sky: ['#b7a28b', '#e4d3b7'], sun: '#fff0c0', land: ['#a98260', '#73533f'], floor: ['#927452', '#594432', '#c1a57c'], shade: ['#d2b982', '#86704c'] },
  { kind: 'forest', sky: ['#83bba8', '#e0edc6'], sun: '#fff1bd', land: ['#67956b', '#345d49'], floor: ['#71563e', '#493927', '#a48a5e'], shade: ['#bdd69a', '#68754b'] },
  { kind: 'garden', sky: ['#91cce8', '#e4f3d3'], sun: '#fff3af', land: ['#8ac16d', '#4c874e'], floor: ['#ab8056', '#674832', '#d3ac75'], shade: ['#f0b7c1', '#93616d'] },
  { kind: 'hills', sky: ['#82bbdf', '#eff0cf'], sun: '#fff3b2', land: ['#8cb36c', '#53774f'], floor: ['#92704c', '#59412e', '#c1a071'], shade: ['#e4d3a7', '#96865e'] },
  { kind: 'icy', sky: ['#829dbb', '#dcecf2'], sun: '#f5fbff', land: ['#607d9c', '#d8e8f0'], floor: ['#7e98a8', '#455e70', '#b4c9d1'], shade: ['#e1eced', '#899a9b'] },
  { kind: 'jaggedPeaks', sky: ['#4c79a0', '#d0e2e7'], sun: '#fff1c7', land: ['#637f91', '#354d61'], floor: ['#64727b', '#38434c', '#a0a7a2'], shade: ['#d0d7d5', '#7f8a87'] },
];

function roomScene() {
  return ROOM_SCENES[(state.round - 1) % ROOM_SCENES.length];
}

function roomSceneName() {
  return roomScene().kind
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (letter) => letter.toUpperCase());
}

const DRY_DURATION_MS = 90 * 1000; // 90s of real time to fully dry, watched or not
const SAMPLE_W = 60;
const SAMPLE_H = 40;

const PAINT_TIME_LIMIT_MS = 30 * 1000; // round timer for the painting phase
const PAINT_TIME_BONUS = 10; // Moments of calm awarded for finishing the paint job in time
const MAX_ROUNDS = 10;
const UPGRADES = [
  { id: 'brush', name: 'Bigger brush', max: 5, costForLevel: (level) => 100 * Math.pow(2, level - 1), description: 'A bigger brush makes painting the wall quicker.' },
  { id: 'eyes', name: 'More Eyes', max: 5, costForLevel: (level) => 100 * Math.pow(2, level - 1), description: 'Adds one eye pair. Up to six pairs can earn calm.' },
  { id: 'specs', name: 'Specs', max: 6, costForLevel: () => 200, description: 'Put glasses on an eye pair for x2 return, or x20 with Golden Eyes.' },
  { id: 'goldEyes', name: 'Golden Eyes', max: 6, costForLevel: (level) => 500 * Math.pow(2, level - 1), description: 'Make an eye pair golden for x10 return, or x20 with Specs.' },
  { id: 'goldSpecs', name: 'Magpeye · Golden Specs', max: 6, costForLevel: () => 200, description: 'Upgrade one pair of Specs for x5 return, or x50 with Golden Eyes.' },
];

function upgradeMaxLevel(def) {
  return typeof def.max === 'function' ? def.max() : def.max;
}

function eyePairCount() {
  return state.eyeSetUpgrades.length;
}

function eyePairMultiplier(index) {
  const set = state.eyeSetUpgrades[index];
  const golden = set.goldenEyes;
  const hasSpecs = set.specs;
  const goldenSpecs = set.goldSpecs;
  if (golden) return goldenSpecs ? 50 : (hasSpecs ? 20 : 10);
  if (goldenSpecs) return 5;
  return hasSpecs ? 2 : 1;
}

function totalEyeMultiplier() {
  let total = 0;
  for (let i = 0; i < eyePairCount(); i++) total += eyePairMultiplier(i);
  return total;
}

// Clockwise regular hexagon around the pointer. At the full six-pair
// upgrade, each pair is centered on one of these six vertices.
const SIX_EYE_HEXAGON = [
  { x: 0, y: -58 },
  { x: 50.23, y: -29 },
  { x: 50.23, y: 29 },
  { x: 0, y: 58 },
  { x: -50.23, y: 29 },
  { x: -50.23, y: -29 },
];

function eyePairOffset(index, count) {
  if (count === SIX_EYE_HEXAGON.length) return SIX_EYE_HEXAGON[index];
  return { x: (index - (count - 1) / 2) * 52, y: 0 };
}

function eyePairOnScreen(index, x, y) {
  const offset = eyePairOffset(index, eyePairCount());
  const set = state.eyeSetUpgrades[index];
  const halfWidth = set.specs ? 21 : 16;
  const halfHeight = set.specs ? 14 : 11;
  const px = x + offset.x;
  const py = y + offset.y;
  return px - halfWidth >= 0 && px + halfWidth <= CANVAS_W && py - halfHeight >= 0 && py + halfHeight <= CANVAS_H;
}

function countingEyePairsAt(x, y) {
  if (document.visibilityState !== 'visible' || !state.pointerOverCanvas || !state.lastMouse) return [];
  const eligible = [];
  for (let index = 0; index < eyePairCount(); index++) {
    if (!eyePairOnScreen(index, x, y)) continue;
    const offset = eyePairOffset(index, eyePairCount());
    const px = x + offset.x;
    const py = y + offset.y;
    if (isPaintable(px - 8.5, py) && isPaintable(px + 8.5, py)) eligible.push(index);
  }
  return eligible;
}

function upgradeRequirement(def, level) {
  const trackIndex = UPGRADES.indexOf(def);
  if (level > 1 && state.upgrades[def.id] < level - 1) return false;
  if (level === 1 && trackIndex > 0 && state.upgrades[UPGRADES[trackIndex - 1].id] < 1) return false;
  if ((def.id === 'specs' || def.id === 'goldEyes' || def.id === 'goldSpecs') && upgradeTargets(def).length === 0) return false;
  if ((def.id === 'specs' || def.id === 'goldEyes' || def.id === 'goldSpecs') && level > upgradeTargets(def).length + state.upgrades[def.id]) return false;
  if ((def.id === 'specs' || def.id === 'goldEyes') && level > eyePairCount()) return false;
  if (def.id === 'goldSpecs' && level > state.upgrades.specs) return false;
  return true;
}

function upgradeTargets(def) {
  const targets = [];
  for (let i = 0; i < state.eyeSetUpgrades.length; i++) {
    const set = state.eyeSetUpgrades[i];
    if (def.id === 'specs' && !set.specs) targets.push(i);
    if (def.id === 'goldEyes' && !set.goldenEyes) targets.push(i);
    if (def.id === 'goldSpecs' && set.specs && !set.goldSpecs) targets.push(i);
  }
  return targets;
}

function paintTimeLimitForRound(round) {
  return Math.max(8000, PAINT_TIME_LIMIT_MS - (round - 1) * 2500);
}

const CAPTIONS = [
  'A second has passed. The wall remains unconcerned.', 'Time flies; this paint prefers to stroll.', 'Your minute of observation has no known historical significance.',
  'Somewhere, a clock is doing all the work.', 'This wall has achieved the same amount as you have by watching it.', 'The paint is drying at a rate best described as “eventually”.',
  'An entire moment has gone by, with no witnesses of consequence.', 'If time is money, this wall is an unlicensed accountant.', 'The universe has not paused for this drying process.',
  'You have watched a surface become slightly less wet. History will cope.', 'A minute here is still a minute somewhere else.', 'This paint has no plans for its afternoon.',
  'The wall is winning the staring contest by not having eyes.', 'Every second matters. This one has been allocated to paint.', 'Your attention is valued by precisely nobody in the room.',
  'The paint is drying. The cosmos is expanding. Priorities vary.', 'This is a very quiet use of a perfectly ordinary minute.', 'You could describe this as watching time pass with extra steps.',
  'A moment of calm: mostly a moment with nothing happening.', 'The wall has declined to comment on your investment of time.', 'Somewhere, a more exciting wall is also drying.',
  'The clock has moved. The paint has made a modest effort.', 'This may be the least consequential audience a wall has had.', 'Your patience is real; its impact on paint is not.',
  'Time keeps going, even when the wall has no updates.', 'The paint has not noticed you. It is very focused.', 'A minute spent here cannot be exchanged for a better minute.',
  'The wall’s progress report reads: still wall-shaped.', 'This is what happens when a surface gets a captive audience.', 'Nothing dramatic has happened since the last update.',
  'You are now an expert witness to a drying wall.', 'The seconds are leaving. The paint is staying.', 'The wall is drying with no regard for your schedule.',
  'A small amount of time has been donated to beige nothingness.', 'The paint might finish before anyone asks what you are doing.', 'This is not a shortcut to enlightenment.',
  'One more tick of the clock; zero plot twists.', 'The wall’s ambition is to become dry and remain a wall.', 'The universe contains billions of stars and this particular patch.',
  'Watching paint dry: proof that time can be both real and uneventful.', 'The minute hand has somewhere to be. The wall does not.', 'Your presence has not accelerated the paint by even a little.',
  'The paint has no sense of urgency or audience etiquette.', 'A quiet moment passes, unnoticed by the wider universe.', 'This wall has been drying longer than this joke has been funny.',
  'A second is a long time if you insist on counting it here.', 'The room has witnessed many things. This is one of them.', 'The paint is drying on its own schedule, as usual.',
  'This moment will not appear in anyone’s memoirs.', 'Time passes. Paint dries. Nobody gets a medal.', 'You are giving this wall the attention it never requested.',
  'The wall has no notifications, and still has nothing to report.', 'A minute ago, this was also happening.', 'Even the paint considers this a low-stakes situation.',
  'The clock is productive by comparison.', 'This observation will not alter the course of events.', 'There is no hidden finale in the drying process.',
  'The paint has moved from wet to less wet. A landmark of sorts.', 'All this time, the wall has remained impressively rectangular.', 'Your focus is admirable and entirely unnecessary.',
  'Another second joins the vast archive of seconds nobody remembers.', 'A wall dries in the forest; does anyone update the score?', 'The paint is not reading the comments, either.',
  'This is technically progress, if you are very generous.', 'Somewhere, dust is also settling without an audience.', 'The universe will not ask for your review of this wall.',
  'An uneventful moment is still a moment, apparently.', 'This wall has never once checked the time.', 'The paint is making no promises about when it will be interesting.',
  'You can tell the seconds apart only because the clock insists.', 'One day, this will be dry and completely unremarkable.', 'This is a fine place to practise doing absolutely nothing.',
  'The wall has no need to impress you.', 'Time has passed, leaving no forwarding address.', 'The paint’s entire character arc is becoming dry.',
  'No one will ask how closely you monitored this.', 'This minute has been spent on an activity with no sequel.', 'Even the room’s silence has more variety than the paint.',
  'A little more dry; not a little more meaningful.', 'The clock advances without consulting the wall.', 'Somewhere, a calendar has just lost another square.',
  'This is the slowest premiere with no cast or plot.', 'You have seen the wall do the same thing again.', 'The paint declines to make eye contact.',
  'The seconds are numbered. The wall is not counting.', 'Your dedication will be forgotten at a perfectly normal rate.', 'There is no prize for noticing that it is still drying.',
  'Another moment has found a place to disappear.', 'This wall’s legacy will be a new coat of paint.', 'The paint is almost as interested in this as you are.',
  'The final seconds are still just seconds.', 'Soon it will be dry, and this will have happened.', 'Thank you for attending this deeply forgettable event.',
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
function roundWatchingScore() {
  return state.eyeSetWatchedMs.reduce((score, watched, index) => score + Math.floor(watched / 1000) * eyePairMultiplier(index), 0);
}

function computeMomentsOfCalm() {
  const activeRoundScore = state.phase === 'drying'
    ? roundWatchingScore() + (state.paintBonusAwarded ? PAINT_TIME_BONUS : 0) - state.lookAwayCount * 5
    : 0;
  return Math.max(0,
    state.totalMomentsOfCalmEarned + activeRoundScore - state.calmSpent
  );
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
    totalElapsedMs: state.totalElapsedMs,
    watchedMs: state.totalWatchedMs,
    awayMs: state.totalAwayMs,
    lookAwayCount: state.totalLookAwayCount,
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
  phase: 'splash', // 'splash' | 'painting' | 'drying' | 'intermission' | 'done'
  selectedColor: null,
  playerId: getOrCreatePlayerId(),

  isStroking: false,
  lastPoint: null,
  coveragePercent: 0,

  pointerOverCanvas: false,
  lastMouse: null,

  paintStartedAt: null, // Date.now() when the current round began
  dryStartedAt: null, // Date.now() when "Start Watching" was clicked

  dryProgress: 0, // 0..1, only advances while watching
  wasWatching: null, // null until drying starts, then tracks "watching" (see isCurrentlyWatching())
  watchedMs: 0,
  awayMs: 0,
  lookAwayCount: 0,
  round: 1,
  calmBank: 0,
  calmSpent: 0,
  totalMomentsOfCalmEarned: 0,
  upgrades: { brush: 0, eyes: 0, specs: 0, goldEyes: 0, goldSpecs: 0 },
  eyeSetUpgrades: [{ specs: false, goldenEyes: false, goldSpecs: false }],
  totalWatchedMs: 0,
  totalAwayMs: 0,
  totalLookAwayCount: 0,
  totalPaintBonus: 0,
  totalElapsedMs: 0,

  lightAngle: 0,
  lightAngularVelocity: 0,
  lastLightKnockAt: 0,

  paintBonusAwarded: false,
  wallFilledAt100: false,

  eyeBlinks: Array.from({ length: 6 }, () => ({ nextAt: null, until: 0 })), // each eye set has an independent blink schedule
  eyeSetWatchedMs: [0],
};

// Roughly every 5 seconds, plus or minus up to 2 seconds - see
// isCurrentlyWatching()'s caller in tick(), which only advances this
// clock while actually watching (so looking away doesn't sneak in a
// "free" blink the moment you look back).
function randomBlinkDelayMs() {
  return 5000 + (Math.random() * 4000 - 2000);
}

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

// The window's own sample cells always count as "covered" (see
// computeCoverage() below) - great for not penalizing the player for
// not painting the glass, but it also means a completely blank wall
// still reads as this many % covered just from the window's footprint,
// and rounding at the window's edges can leave 100% just out of reach
// even once every paintable pixel is solid. Precomputed once here (by
// running the exact same cell-counting condition computeCoverage() uses)
// so that function can normalize it out below - 0% actual paint always
// displays as 0%, full paint always displays as 100%, regardless of how
// big a bite the window takes out of the sample grid.
const WINDOW_SAMPLE_CELL_COUNT = (function countWindowCells() {
  let count = 0;
  for (let py = 0; py < SAMPLE_H; py++) {
    for (let px = 0; px < SAMPLE_W; px++) {
      if (px >= WINDOW_SAMPLE.x0 && px < WINDOW_SAMPLE.x1 && py >= WINDOW_SAMPLE.y0 && py < WINDOW_SAMPLE.y1) count++;
    }
  }
  return count;
})();

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

// Blends a hex colour toward a target RGB by t (0..1) - used to derive
// the same "wet" (brighter/glossier) and "dry" (duller/matte) tones the
// wall's own finish effect uses (see renderPaintFinish()), but as solid
// colours for the progress bars rather than alpha overlays.
function mixRgb(hex, target, t) {
  const { r, g, b } = hexToRgb(hex);
  return { r: r + (target.r - r) * t, g: g + (target.g - g) * t, b: b + (target.b - b) * t };
}

function rgbString({ r, g, b }) {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function wetColorRgb(hex) {
  return mixRgb(hex, { r: 255, g: 255, b: 255 }, 0.18); // lightened/glossier - "just applied"
}

function dryColorRgb(hex) {
  return mixRgb(hex, { r: 110, g: 104, b: 92 }, 0.4); // duller/matte - the same tint the wall dries toward
}

// The drying bar's fill colour at a given point in the dry - a straight
// lerp between the wet and dry tones above, driven by dryProgress.
function dryingBarColor(hex, dryProgress) {
  const wet = wetColorRgb(hex);
  const dry = dryColorRgb(hex);
  return rgbString({
    r: wet.r + (dry.r - wet.r) * dryProgress,
    g: wet.g + (dry.g - wet.g) * dryProgress,
    b: wet.b + (dry.b - wet.b) * dryProgress,
  });
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
  const brushSize = BRUSH_RADIUS * 0.8 * Math.pow(1.2, state.upgrades.brush);
  const g = paintCtx.createRadialGradient(x, y, 0, x, y, brushSize);
  g.addColorStop(0, rgbaString(state.selectedColor.hex, 0.95));
  g.addColorStop(0.75, rgbaString(state.selectedColor.hex, 0.85));
  g.addColorStop(1, rgbaString(state.selectedColor.hex, 0));
  paintCtx.fillStyle = g;
  paintCtx.beginPath();
  paintCtx.arc(x, y, brushSize, 0, Math.PI * 2);
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
  // Normalize out the window's fixed contribution (see
  // WINDOW_SAMPLE_CELL_COUNT above) - without this, an entirely blank
  // wall reads as ~12% just from the window, and the actual paintable
  // pixels being 100% covered doesn't necessarily land on an exact 100%
  // reading either. This rescales the real 0-100% paintable range back
  // onto a clean 0-100% display, regardless of the window's footprint.
  const windowFloorPercent = (WINDOW_SAMPLE_CELL_COUNT / total) * 100;
  const rawPercent = (covered / total) * 100;
  const normalized = ((rawPercent - windowFloorPercent) / (100 - windowFloorPercent)) * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
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
  coverageLabel.textContent = `Round ${state.round} / ${MAX_ROUNDS} · Painted: ${state.coveragePercent}%`;
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
  const room = roomScene();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(EDGE_W, WALL_H);
  ctx.lineTo(CANVAS_W - EDGE_W, WALL_H);
  ctx.lineTo(CANVAS_W, CANVAS_H);
  ctx.lineTo(0, CANVAS_H);
  ctx.closePath();
  ctx.fillStyle = room.floor[0];
  ctx.fill();

  // Floorboard seams - clipped to the floor's own trapezoid, then drawn
  // as lines from the (narrower) top edge to the (wider) bottom edge, so
  // they converge toward the wall exactly like the trapezoid's own sides -
  // simple perspective floorboards receding away from the viewer.
  ctx.save();
  ctx.clip();
  const PLANK_COUNT = 5 + (state.round % 7);
  ctx.strokeStyle = room.floor[1];
  ctx.globalAlpha = 0.65;
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
  const crossSeamY = WALL_H + (CANVAS_H - WALL_H) * (0.35 + (state.round % 5) * 0.1);
  ctx.moveTo(EDGE_W * 0.5, crossSeamY);
  ctx.lineTo(CANVAS_W - EDGE_W * 0.5, crossSeamY);
  ctx.stroke();
  ctx.strokeStyle = room.floor[2];
  ctx.globalAlpha = 0.28;
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

function drawWindowScenery(room, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const sky = ctx.createLinearGradient(x, y, x, y + h);
  sky.addColorStop(0, room.sky[0]);
  sky.addColorStop(1, room.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = room.sun;
  ctx.beginPath();
  ctx.arc(x + w * 0.76, y + h * 0.22, 16, 0, Math.PI * 2);
  ctx.fill();
  if (['arctic', 'beach', 'city', 'desert', 'earthy', 'forest', 'garden', 'hills'].includes(room.kind)) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    [0, 1].forEach((i) => {
      const cx = x + 35 + i * 95;
      const cy = y + 58 + (i % 2) * 18;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 20, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 12, cy + 2, 10, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 12, cy + 2, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (room.kind === 'arctic') {
    ctx.fillStyle = room.land[0];
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.78); ctx.lineTo(x + w * 0.23, y + h * 0.54); ctx.lineTo(x + w * 0.4, y + h * 0.78); ctx.lineTo(x + w * 0.7, y + h * 0.48); ctx.lineTo(x + w, y + h * 0.78); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = room.land[1]; ctx.fillRect(x, y + h * 0.78, w, h * 0.22);
  } else if (room.kind === 'icy' || room.kind === 'jaggedPeaks') {
    ctx.fillStyle = room.land[0];
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.83);
    if (room.kind === 'jaggedPeaks') {
      ctx.lineTo(x + w * 0.17, y + h * 0.42); ctx.lineTo(x + w * 0.29, y + h * 0.62);
      ctx.lineTo(x + w * 0.52, y + h * 0.2); ctx.lineTo(x + w * 0.7, y + h * 0.65);
      ctx.lineTo(x + w * 0.84, y + h * 0.4); ctx.lineTo(x + w, y + h * 0.75);
    } else {
      ctx.lineTo(x + w * 0.28, y + h * 0.38); ctx.lineTo(x + w * 0.49, y + h * 0.78);
      ctx.lineTo(x + w * 0.72, y + h * 0.3); ctx.lineTo(x + w, y + h * 0.8);
    }
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = room.land[1];
    ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h * 0.47); ctx.lineTo(x + w * 0.28, y + h * 0.38); ctx.lineTo(x + w * 0.37, y + h * 0.55); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w * 0.63, y + h * 0.48); ctx.lineTo(x + w * 0.72, y + h * 0.3); ctx.lineTo(x + w * 0.82, y + h * 0.52); ctx.closePath(); ctx.fill();
    ctx.fillRect(x, y + h * 0.83, w, h * 0.17);
  } else if (room.kind === 'beach') {
    ctx.fillStyle = room.land[0]; ctx.fillRect(x, y + h * 0.59, w, h * 0.41);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const wy = y + h * (0.66 + i * 0.065);
      ctx.beginPath(); ctx.moveTo(x + 8, wy); ctx.quadraticCurveTo(x + w * 0.4, wy - 5, x + w - 8, wy); ctx.stroke();
    }
    ctx.fillStyle = '#f7f0d9'; ctx.beginPath(); ctx.moveTo(x + 54, y + h * 0.58); ctx.lineTo(x + 54, y + h * 0.4); ctx.lineTo(x + 74, y + h * 0.58); ctx.fill();
    ctx.fillStyle = '#704d44'; ctx.fillRect(x + 52, y + h * 0.58, 27, 3);
    ctx.fillStyle = '#e6cf99'; ctx.beginPath(); ctx.moveTo(x, y + h * 0.83); ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.68, x + w, y + h * 0.84); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
  } else if (room.kind === 'city') {
    ctx.fillStyle = room.land[1];
    const heights = [0.36, 0.5, 0.29, 0.44, 0.34, 0.55, 0.38];
    for (let i = 0; i < heights.length; i++) {
      const bw = w / heights.length;
      const bx = x + i * bw;
      const bh = h * heights[i];
      ctx.fillRect(bx, y + h - bh, bw - 2, bh);
      ctx.fillStyle = '#ffe0a3';
      for (let wy = y + h - bh + 9; wy < y + h - 6; wy += 13) {
        if ((i + wy) % 3 !== 0) ctx.fillRect(bx + 5, wy, 3, 4);
        if ((i + wy) % 2 === 0) ctx.fillRect(bx + 13, wy, 3, 4);
      }
      ctx.fillStyle = room.land[1];
    }
  } else if (room.kind === 'desert') {
    ctx.fillStyle = room.land[0];
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.68); ctx.quadraticCurveTo(x + w * 0.28, y + h * 0.47, x + w * 0.55, y + h * 0.68); ctx.quadraticCurveTo(x + w * 0.78, y + h * 0.8, x + w, y + h * 0.55); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
    ctx.fillStyle = room.land[1]; ctx.fillRect(x + w * 0.25, y + h * 0.62, 5, h * 0.18); ctx.fillRect(x + w * 0.21, y + h * 0.68, 13, 4); ctx.fillRect(x + w * 0.28, y + h * 0.73, 11, 4);
  } else if (room.kind === 'earthy') {
    ctx.fillStyle = room.land[0];
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.63); ctx.quadraticCurveTo(x + w * 0.45, y + h * 0.42, x + w, y + h * 0.7); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
    ctx.fillStyle = room.land[1]; ctx.fillRect(x, y + h * 0.78, w, h * 0.22);
    ctx.fillStyle = '#b9956c'; ctx.fillRect(x + w * 0.15, y + h * 0.72, w * 0.32, 4);
  } else {
    ctx.fillStyle = room.land[0];
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.68); ctx.quadraticCurveTo(x + w * 0.25, y + h * 0.44, x + w * 0.5, y + h * 0.67); ctx.quadraticCurveTo(x + w * 0.75, y + h * 0.85, x + w, y + h * 0.57); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
    ctx.fillStyle = room.land[1];
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.82); ctx.quadraticCurveTo(x + w * 0.45, y + h * 0.58, x + w, y + h * 0.84); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
    if (room.kind === 'forest') {
      for (let i = 0; i < 7; i++) {
        const tx = x + 12 + i * 42;
        const ty = y + h * (0.63 + (i % 2) * 0.06);
        ctx.fillStyle = room.land[1];
        ctx.beginPath(); ctx.moveTo(tx, ty - 27); ctx.lineTo(tx - 12, ty + 3); ctx.lineTo(tx + 12, ty + 3); ctx.closePath(); ctx.fill();
        ctx.fillRect(tx - 2, ty, 4, 10);
      }
    }
    if (room.kind === 'garden') {
      for (let i = 0; i < 6; i++) {
        const fx = x + 15 + i * 31;
        const fy = y + h * (0.78 + (i % 2) * 0.05);
        ctx.fillStyle = '#f4d36f'; ctx.beginPath(); ctx.arc(fx, fy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d97f9a'; ctx.beginPath(); ctx.arc(fx + 4, fy + 3, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawWindow() {
  const room = roomScene();
  const { x, y, w, h } = WINDOW_RECT;
  ctx.save();
  ctx.fillStyle = '#5c4632';
  ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
  drawWindowScenery(room, x, y, w, h);

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
  const room = roomScene();
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
  // The bulb sits behind the shade so its glow peeks out beneath the rim.
  ctx.beginPath();
  ctx.ellipse(0, 30, 10, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,244,200,0.75)';
  ctx.fill();

  ctx.beginPath();
  const shadeVariant = (state.round - 1) % 10;
  if (shadeVariant === 0) {
    ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(24, 26); ctx.lineTo(-24, 26);
  } else if (shadeVariant === 1) {
    ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.quadraticCurveTo(16, 17, 27, 25); ctx.lineTo(-27, 25); ctx.quadraticCurveTo(-16, 17, -15, 0);
  } else if (shadeVariant === 2) {
    ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.lineTo(22, 18); ctx.quadraticCurveTo(0, 34, -22, 18);
  } else if (shadeVariant === 3) {
    ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.lineTo(24, 11); ctx.lineTo(19, 27); ctx.lineTo(-19, 27); ctx.lineTo(-24, 11);
  } else if (shadeVariant === 4) {
    ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.quadraticCurveTo(14, 17, 26, 22); ctx.lineTo(22, 29); ctx.lineTo(-22, 29); ctx.lineTo(-26, 22); ctx.quadraticCurveTo(-14, 17, -16, 0);
  } else if (shadeVariant === 5) {
    ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.lineTo(30, 25); ctx.lineTo(-30, 25);
  } else if (shadeVariant === 6) {
    ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.quadraticCurveTo(22, 12, 19, 27); ctx.lineTo(-19, 27); ctx.quadraticCurveTo(-22, 12, -16, 0);
  } else if (shadeVariant === 7) {
    ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(25, 22); ctx.lineTo(18, 30); ctx.lineTo(-18, 30); ctx.lineTo(-25, 22);
  } else if (shadeVariant === 8) {
    ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.lineTo(24, 15); ctx.lineTo(24, 26); ctx.lineTo(-24, 26); ctx.lineTo(-24, 15);
  } else {
    ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.quadraticCurveTo(12, 14, 30, 25); ctx.lineTo(-30, 25); ctx.quadraticCurveTo(-12, 14, -18, 0);
  }
  ctx.closePath();
  ctx.fillStyle = room.shade[0];
  ctx.fill();
  ctx.strokeStyle = room.shade[1];
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

// Round timer for the painting phase, top-left of the canvas - green
// while there's still time, red once the limit has passed. Purely a
// countdown display; running out of time doesn't end the round, it just
// costs the completion bonus (see PAINT_TIME_BONUS / beginDrying()).
function drawPaintTimer() {
  if (state.phase !== 'painting' || !state.paintStartedAt) return;
  // Clamped at zero rather than counting into negative time - once the
  // limit is up the whole box just turns red and sits at 0:00 as a flat
  // "time's up" signal, instead of ticking away how far over you've gone.
  const remainingMs = Math.max(0, paintTimeLimitForRound(state.round) - (Date.now() - state.paintStartedAt));
  const over = remainingMs <= 0;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const label = mins + ':' + (secs < 10 ? '0' : '') + secs;

  ctx.save();
  ctx.fillStyle = over ? 'rgba(224,90,78,0.9)' : 'rgba(20,30,35,0.78)';
  ctx.fillRect(14, 14, 92, 34);
  ctx.fillStyle = over ? '#ffffff' : '#4caf7d';
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
  const brushScale = 0.8 * Math.pow(1.2, state.upgrades.brush);
  ctx.scale(brushScale, brushScale);
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

// Each pair earns independently while its eye shapes are over the painted
// wall and fully inside the canvas. Ineligible or blinking pairs close;
// every pair has its own blink timer in randomBlinkDelayMs()/tick().
function drawEyesCursor(x, y, now) {
  ctx.save();
  const pairCount = eyePairCount();
  const eligiblePairs = countingEyePairsAt(x, y);
  for (let set = 0; set < pairCount; set++) {
    const offset = eyePairOffset(set, pairCount);
    const centerX = x + offset.x;
    const centerY = y + offset.y;
    const eyeSet = state.eyeSetUpgrades[set];
    const golden = eyeSet.goldenEyes;
    const hasSpecs = eyeSet.specs;
    const goldenSpecs = eyeSet.goldSpecs;
    const frameColor = goldenSpecs ? '#e7b93f' : '#252525';
    const eyeOffsets = [-8.5, 8.5];
    const blink = !eligiblePairs.includes(set) || now < state.eyeBlinks[set].until;
    eyeOffsets.forEach((offset) => {
      const dx = centerX + offset;
      ctx.beginPath();
      if (blink) {
        ctx.strokeStyle = goldenSpecs ? frameColor : '#252525';
        ctx.lineWidth = 2.5;
        ctx.moveTo(dx - 6, centerY);
        ctx.quadraticCurveTo(dx, centerY + 3, dx + 6, centerY);
        ctx.stroke();
      } else {
        ctx.ellipse(dx, centerY, 6, 9, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#252525';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(dx, centerY, 3, 0, Math.PI * 2);
        ctx.fillStyle = golden ? '#d5a51e' : '#2a2a2a';
        ctx.fill();
      }
    });
    if (hasSpecs) {
      [-10, 10].forEach((lensOffset) => {
        const lensX = centerX + lensOffset;
        ctx.strokeStyle = frameColor;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lensX - 6, centerY - 11); ctx.lineTo(lensX + 6, centerY - 11);
        ctx.quadraticCurveTo(lensX + 9, centerY - 11, lensX + 9, centerY - 8);
        ctx.lineTo(lensX + 9, centerY + 8); ctx.quadraticCurveTo(lensX + 9, centerY + 11, lensX + 6, centerY + 11);
        ctx.lineTo(lensX - 6, centerY + 11); ctx.quadraticCurveTo(lensX - 9, centerY + 11, lensX - 9, centerY + 8);
        ctx.lineTo(lensX - 9, centerY - 8); ctx.quadraticCurveTo(lensX - 9, centerY - 11, lensX - 6, centerY - 11);
        ctx.closePath(); ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(centerX - 2, centerY - 3);
      ctx.quadraticCurveTo(centerX, centerY - 5, centerX + 2, centerY - 3);
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
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
  // still painting to do, switching to the purchased sets of eyes once the
  // wall is fully covered or once we're in the drying phase proper.
  if ((state.phase === 'painting' || state.phase === 'drying') && state.pointerOverCanvas && state.lastMouse) {
    if (state.phase === 'drying' || state.coveragePercent >= 100) {
      drawEyesCursor(state.lastMouse.x, state.lastMouse.y, performance.now());
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
  if (captionIndex >= CAPTIONS.length - 1) return;
  captionBox.classList.add('fading');
  setTimeout(() => {
    captionIndex++;
    captionBox.textContent = CAPTIONS[captionIndex];
    captionBox.classList.remove('fading');
  }, 400);
}

function startCaptionRotation() {
  if (captionIndex >= CAPTIONS.length) captionIndex = CAPTIONS.length - 1;
  captionBox.textContent = CAPTIONS[captionIndex];
  captionBox.classList.remove('fading');
  if (captionInterval) clearInterval(captionInterval);
  captionInterval = setInterval(showNextCaption, 10000);
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
  return countingEyePairsAt(state.lastMouse.x, state.lastMouse.y).length > 0;
}

function updateWatchStats() {
  calmHeading.textContent = computeMomentsOfCalm();
  awayStat.textContent = `${formatMinSec(state.totalAwayMs + state.awayMs)} (${state.totalLookAwayCount + state.lookAwayCount}x)`;
  roundHeading.textContent = roomSceneName();
  const paintMs = state.phase === 'painting'
    ? Math.max(0, paintTimeLimitForRound(state.round) - (Date.now() - state.paintStartedAt))
    : paintTimeLimitForRound(state.round);
  roundDetails.textContent = `${state.round} / ${MAX_ROUNDS} · Paint ${formatMinSec(paintMs)} · Dry ${formatMinSec(DRY_DURATION_MS)}`;
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
    const eligiblePairs = state.pointerOverCanvas && state.lastMouse
      ? countingEyePairsAt(state.lastMouse.x, state.lastMouse.y)
      : [];
    const watching = eligiblePairs.length > 0;
    if (state.wasWatching === null) {
      state.wasWatching = watching;
    } else if (watching !== state.wasWatching) {
      if (!watching) {
        state.lookAwayCount++;
        // Look-aways cost a flat 5 calm, independent of the More Eyes
        // multiplier applied to each watched second.
        awayBanner.classList.remove('hidden');
      } else {
        awayBanner.classList.add('hidden');
        captionBox.textContent = "Oh, you're back. The wall dried on without you, but your calm streak missed you.";
      }
      state.wasWatching = watching;
    }

    if (watching) {
      state.watchedMs += dt;
      eligiblePairs.forEach((i) => { state.eyeSetWatchedMs[i] += dt; });

      // BLINKING - only while actually watching, so looking away can't
      // "bank" a blink for the moment you look back. First watched frame
      // schedules the first blink; after that, each blink's own end time
      // schedules the next one, 5s +/- 2s later.
      for (let i = 0; i < eyePairCount(); i++) {
        if (!eligiblePairs.includes(i)) {
          state.eyeBlinks[i].nextAt = null;
          state.eyeBlinks[i].until = 0;
          continue;
        }
        const blink = state.eyeBlinks[i];
        if (blink.nextAt === null) {
          blink.nextAt = now + randomBlinkDelayMs();
        } else if (now >= blink.until && now >= blink.nextAt) {
          blink.until = now + 150;
          blink.nextAt = blink.until + randomBlinkDelayMs();
        }
      }
      for (let i = eyePairCount(); i < state.eyeBlinks.length; i++) {
        state.eyeBlinks[i].nextAt = null;
        state.eyeBlinks[i].until = 0;
      }
    } else {
      state.awayMs += dt;
      state.eyeBlinks.forEach((blink) => {
        blink.nextAt = null;
        blink.until = 0;
      });
    }

    dryingLabel.textContent = `Drying: ${Math.round(state.dryProgress * 100)}%`;
    dryingBar.style.width = `${state.dryProgress * 100}%`;
    if (state.selectedColor) {
      dryingBar.style.background = dryingBarColor(state.selectedColor.hex, state.dryProgress);
    }
    updateWatchStats();

    if (state.dryProgress >= 1) {
      finishDrying();
    }
  }
  if (state.phase === 'painting') updateWatchStats();

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
  stopCaptionRotation();
  state.phase = 'intermission';
  state.totalElapsedMs += state.paintStartedAt ? Date.now() - state.paintStartedAt : 0;
  state.totalWatchedMs += state.watchedMs;
  state.totalAwayMs += state.awayMs;
  state.totalLookAwayCount += state.lookAwayCount;
  const roundCalm = roundWatchingScore() +
    (state.paintBonusAwarded ? PAINT_TIME_BONUS : 0) - state.lookAwayCount * 5;
  state.totalMomentsOfCalmEarned += roundCalm;
  state.totalPaintBonus += state.paintBonusAwarded ? PAINT_TIME_BONUS : 0;
  state.calmBank = computeMomentsOfCalm();
  if (state.round >= MAX_ROUNDS) {
    state.phase = 'done';
    showGameOverScreen();
    return;
  }
  if (captionIndex < CAPTIONS.length - 1) captionIndex++;
  state.phase = 'intermission';
  roundTitle.textContent = `Round ${state.round} complete`;
  roundReward.textContent = state.paintBonusAwarded
    ? 'Fast finish! Your time bonus is included in your Moments of calm.'
    : `The next wall gives you less time to paint. Drying still takes ${formatMinSec(DRY_DURATION_MS)}.`;
  renderUpgradeList();
  roundHud.style.minHeight = `${Math.round(dryingHud.getBoundingClientRect().height)}px`;
  roundHud.style.height = 'auto';
  roundHud.scrollTop = 0;
  dryingHud.classList.add('hidden');
  roundHud.classList.remove('hidden');
}

function renderUpgradeList() {
  roundCurrency.textContent = `Available Moments of calm: ${state.calmBank}`;
  const rows = [];
  UPGRADES.forEach((u) => {
    const ownedLevel = state.upgrades[u.id];
    const maxLevel = upgradeMaxLevel(u);
    const level = ownedLevel + 1;
    if (level > maxLevel) {
      rows.push(`<div class="upgrade-item upgrade-complete"><div><strong>${u.name} · Level ${maxLevel}/${maxLevel}</strong><span>Complete</span></div></div>`);
      return;
    }
    const cost = u.costForLevel(level);
    const trackIndex = UPGRADES.indexOf(u);
    const previous = trackIndex > 0 ? UPGRADES[trackIndex - 1] : null;
    const previousLocked = previous && state.upgrades[previous.id] < 1;
    const requirementMet = !previousLocked && upgradeRequirement(u, level);
    const canBuy = requirementMet && state.calmBank >= cost;
    let details = u.description;
    if (u.id === 'brush') details = `Next: 20% bigger brush · ${cost} Moments of calm`;
    if (u.id === 'eyes') details = `Next: add an eye pair · ${cost} Moments of calm`;
    if (u.id === 'specs') details = `Next: add Specs to an eye pair · double return · ${cost} Moments of calm`;
    if (u.id === 'goldEyes') details = `Next: Golden Eyes · 10× return (20× with Specs) · ${cost} Moments of calm`;
    if (u.id === 'goldSpecs') details = `Next: Golden Specs · 5× return (50× with Golden Eyes) · ${cost} Moments of calm`;
    const targets = upgradeTargets(u);
    const targetPicker = canBuy && targets.length
      ? `<label class="upgrade-target-label">Eye pair <select class="upgrade-target" data-target-for="${u.id}" data-level="${level}">${targets.map((target) => `<option value="${target}">#${target + 1}</option>`).join('')}</select></label>`
      : '';
    const lockedReason = previousLocked
      ? `Buy level 1 of ${previous.name} before this upgrade.`
      : 'You need an eligible eye pair before buying this upgrade.';
    const status = previousLocked || !requirementMet
      ? `<a class="upgrade-state upgrade-state-locked" tabindex="0" title="${lockedReason}" aria-label="Locked. ${lockedReason}">Locked</a>`
      : (!canBuy
        ? `<a class="upgrade-state upgrade-state-unaffordable" tabindex="0" title="You need ${cost - state.calmBank} more Moments of calm to buy this level." aria-label="Unaffordable. You need ${cost - state.calmBank} more Moments of calm.">Unaffordable</a>`
        : '<span class="upgrade-state upgrade-state-ready">Ready</span>');
    const lockClass = previousLocked || !requirementMet ? 'upgrade-prerequisite-locked' : (!canBuy ? 'upgrade-unaffordable' : '');
    rows.push(`<div class="upgrade-item ${canBuy ? 'upgrade-ready' : 'upgrade-locked'} ${lockClass}"><div class="upgrade-copy"><div class="upgrade-title-line"><strong>${u.name} · Level ${ownedLevel}/${maxLevel}</strong>${status}</div><small>${details}</small>${targetPicker}</div>${canBuy ? `<button type="button" data-upgrade="${u.id}" data-level="${level}">Buy</button>` : ''}</div>`);
  });
  upgradeList.innerHTML = rows.join('');
  Array.from(upgradeList.querySelectorAll('[data-upgrade]')).forEach((button) => {
    button.addEventListener('click', () => {
      const def = UPGRADES.find((item) => item.id === button.getAttribute('data-upgrade'));
      if (!def) return;
      const level = parseInt(button.getAttribute('data-level'), 10);
      const cost = def.costForLevel(level);
      if (state.upgrades[def.id] + 1 !== level || !upgradeRequirement(def, level) || state.calmBank < cost) return;
      let target = -1;
      if (def.id === 'specs' || def.id === 'goldEyes' || def.id === 'goldSpecs') {
        const select = upgradeList.querySelector(`[data-target-for="${def.id}"][data-level="${level}"]`);
        target = select ? parseInt(select.value, 10) : -1;
        if (target < 0 || upgradeTargets(def).indexOf(target) === -1) return;
      }
      state.calmBank -= cost;
      state.calmSpent += cost;
      state.upgrades[def.id]++;
      if (def.id === 'eyes') {
        state.eyeSetUpgrades.push({ specs: false, goldenEyes: false, goldSpecs: false });
      } else if (def.id === 'specs' || def.id === 'goldEyes' || def.id === 'goldSpecs') {
        if (def.id === 'specs') state.eyeSetUpgrades[target].specs = true;
        if (def.id === 'goldEyes') state.eyeSetUpgrades[target].goldenEyes = true;
        if (def.id === 'goldSpecs') state.eyeSetUpgrades[target].goldSpecs = true;
      }
      updateWatchStats();
      renderUpgradeList();
    });
  });
}

function startRound(round) {
  state.round = round;
  state.phase = 'painting';
  state.paintStartedAt = Date.now();
  state.dryStartedAt = null;
  state.dryProgress = 0;
  state.watchedMs = 0;
  state.awayMs = 0;
  state.lookAwayCount = 0;
  state.wasWatching = null;
  state.paintBonusAwarded = false;
  state.pointerOverCanvas = false;
  state.lastMouse = null;
  resetWall();
  roundHud.classList.add('hidden');
  paintHud.classList.remove('hidden');
  dryingHud.classList.add('hidden');
  coverageLabel.textContent = `Round ${round} / ${MAX_ROUNDS} · Painted: 0%`;
  statsBar.classList.remove('hidden');
  updateWatchStats();
  startRenderLoop();
  startCoverageSampling();
}

nextRoundBtn.addEventListener('click', () => startRound(state.round + 1));

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
      // The coverage bar is always showing "just applied" paint, so it's
      // tinted the wet version of whatever colour is picked - matches the
      // wet sheen the wall itself shows while painting.
      coverageBar.style.background = rgbString(wetColorRgb(color.hex));
    });
    colorSwatchesEl.appendChild(btn);
  });
}

startPaintingBtn.addEventListener('click', () => {
  if (!state.selectedColor) return;
  splashScreen.classList.add('fading-out');
  setTimeout(() => splashScreen.classList.add('hidden'), 350);
  sidePanel.classList.remove('hidden');
  paintHud.classList.remove('hidden');
  dryingHud.classList.add('hidden');
  startRound(1);
});

// Automatic - no button to click. Once the wall reads 100% painted (see
// updateCoverageUI(), which calls this), the game moves straight into the
// drying phase itself.
function beginDrying() {
  stopCoverageSampling();
  state.paintBonusAwarded = state.paintStartedAt
    ? (Date.now() - state.paintStartedAt) <= paintTimeLimitForRound(state.round)
    : false;
  state.phase = 'drying';
  state.dryStartedAt = Date.now();
  state.dryProgress = 0;
  state.watchedMs = 0;
  state.awayMs = 0;
  state.lookAwayCount = 0;
  state.wasWatching = null;
  state.eyeSetWatchedMs = Array.from({ length: eyePairCount() }, () => 0);
  state.eyeBlinks = Array.from({ length: 6 }, () => ({ nextAt: null, until: 0 }));
  paintHud.classList.add('hidden');
  dryingHud.classList.remove('hidden');
  awayBanner.classList.add('hidden');
  startCaptionRotation();
}

function showGameOverScreen() {
  const purchasedUpgrades = UPGRADES
    .filter((upgrade) => state.upgrades[upgrade.id] > 0)
    .map((upgrade) => `<li>${escapeHtml(upgrade.name)}: Level ${state.upgrades[upgrade.id]}/${upgradeMaxLevel(upgrade)}</li>`)
    .join('');
  gameOverStats.innerHTML = `
    <p class="score-line">Rounds completed: <strong>${state.round} / ${MAX_ROUNDS}</strong></p>
    <p class="score-line">Moments of calm: <strong>${computeMomentsOfCalm()}</strong></p>
    <p>Moments of calm spent: <strong>${state.calmSpent}</strong></p>
    <p>Unspent Moments of calm: <strong>${state.calmBank}</strong></p>
    <p>Purchased upgrades:</p>
    ${purchasedUpgrades ? `<ul class="score-upgrades">${purchasedUpgrades}</ul>` : '<p>None</p>'}
    <p>Colour: <strong>${escapeHtml(state.selectedColor ? state.selectedColor.name : 'Unknown')}</strong></p>
    <p>Total time (paint + dry): <strong>${formatMinSec(state.totalElapsedMs)}</strong></p>
    <p>Time actually watching: <strong>${formatMinSec(state.totalWatchedMs)}</strong></p>
    <p>Time spent looking away: <strong>${formatMinSec(state.totalAwayMs)}</strong> (${state.totalLookAwayCount}x)</p>
  `;
  dryingHud.classList.add('hidden');
  gameOverScreen.classList.remove('hidden');
  requestAnimationFrame(() => gameOverScreen.classList.remove('fading-out'));
  submitScore();
  fetchHighscores();
}

function resetToSplash() {
  state.phase = 'splash';
  state.round = 1;
  state.calmBank = 0;
  state.calmSpent = 0;
  state.totalMomentsOfCalmEarned = 0;
  state.upgrades = { brush: 0, eyes: 0, specs: 0, goldEyes: 0, goldSpecs: 0 };
  state.eyeSetUpgrades = [{ specs: false, goldenEyes: false, goldSpecs: false }];
  state.totalWatchedMs = 0;
  state.totalAwayMs = 0;
  state.totalLookAwayCount = 0;
  state.totalPaintBonus = 0;
  state.totalElapsedMs = 0;
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
  state.eyeBlinks = Array.from({ length: 6 }, () => ({ nextAt: null, until: 0 }));
  state.eyeSetWatchedMs = [0];
  captionIndex = 0;
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
  roundHud.classList.add('hidden');
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
