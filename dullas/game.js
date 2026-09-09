// ============================================================================
// DULLAS DISHWATER - core game loop
//
// Round 1 starts with 5 dirty plates. Just pass the mouse (sponge) over a
// plate to scrub it - no need to click and hold. Clean plates -> earn
// plates (currency) -> spend them on upgrades in the always-open side
// panel, or clean every plate in a round to advance.
//
// Plates are the same fixed size every round. Each round is a pile of dirty
// plates rendered all at once behind the active one; only the top one is
// scrubbable, the rest peek out underneath at random offsets bounded so
// they always stay within the active plate's own circle. A plate only
// counts as clean once every part of it has been directly touched by the
// sponge AND the grime average is low enough - so a quick swipe that only
// grazes the middle won't cut it. The on-screen cleanliness bar is
// cosmetically remapped to always run a clean 0% -> 100%, no matter what
// the real grime math underneath says.
//
// Once clean, the plate animates over to whichever drying stack is
// currently being filled. Stacks hold up to 40 plates each and live inside
// one shared container in the bottom-right, showing up to 4 stacks side by
// side; they're cleared out at the start of every round. If a round needs
// a 5th stack, the whole view slides down: the oldest stack scrolls off
// and everything shifts one slot over. Filling a stack completely pays out
// a bonus. See the stack section below.
//
// About 5% of plates roll as golden: a different colour scheme, an extra
// sparkle flourish, worth far more currency, and shown gold-coloured once
// they land in a stack too.
//
// The file is split into clearly separated sections so future rounds and
// upgrades (new plate types, sponge upgrades, multipliers, timers, etc.) can
// be dropped in without rewriting the core loop. Look for the "UPGRADE HOOKS"
// section near the bottom.
// ============================================================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const roundCompletePanel = document.getElementById('round-complete-panel');
const roundCompleteTitle = document.getElementById('round-complete-title');
const roundCompleteCleaned = document.getElementById('round-complete-cleaned');
const roundCompleteEarned = document.getElementById('round-complete-earned');
const roundCompleteBonus = document.getElementById('round-complete-bonus');
const nextRoundBtn = document.getElementById('next-round-btn');

const splashScreen = document.getElementById('splash-screen');
const startWashingBtn = document.getElementById('start-washing-btn');
const continueBtn = document.getElementById('continue-btn');
const gameOverScreen = document.getElementById('game-over-screen');
const gameOverReasonEl = document.getElementById('game-over-reason');
const gameOverStatsEl = document.getElementById('game-over-stats');

const CANVAS_W = canvas.width;
const CANVAS_H = canvas.height;
// Kept short enough to clear the Stacks container's top edge (see
// STACK_CONTAINER.y below, computed at CANVAS_H - 20 - STACK_CONTAINER.h)
// so the two never overlap.
const HUD_HEIGHT = 88;

const MAX_ROUNDS = 35; // the game ends after this round, or sooner if every upgrade maxes out first

// Fixed plate size and position for every round - plates never shrink as
// rounds add more of them. Horizontally centred in the canvas now that the
// upgrades sidebar lives outside the play area rather than inside it.
const PLATE_RADIUS = 211;
const ACTIVE_X = CANVAS_W / 2;
const ACTIVE_Y = 350;

// The dirty-plate pile behind the active plate: every waiting plate is
// drawn, but its peek-out distance is capped well under PLATE_RADIUS so
// even the very last (farthest) plate's centre stays inside the active
// plate's own circle, and comfortably on-screen (and clear of the drying
// stacks' container over on the right - see the STACK_CONTAINER block
// below; with the plate now centred, that container is the tighter of the
// two constraints, so this is capped to fit it exactly).
const STACK_MAX_OFFSET = 60;

// ----------------------------------------------------------------------------
// Drying stacks (formerly "racks"): one shared container in the bottom-right
// holds up to 4 stacks side by side, each capped at 40 plates. Stacks keep
// filling up across rounds (they are NOT reset when a round ends). Once a
// 5th stack is needed, the lowest (oldest) stack is cleared outright - its
// data is dropped, not just hidden - and every other stack shifts down one
// slot, so the array never holds more than STACK_SLOT_COUNT stacks and a
// stack index always equals its visible slot directly.
// ----------------------------------------------------------------------------
const STACK_CAPACITY = 40;
const STACK_SLOT_COUNT = 4;
const STACK_PLATE_SPACING = 12;
const STACK_COLUMN_WIDTH = 45; // 50% narrower than the original 90px columns
const STACK_FILL_BONUS_PLATES = 4; // paid out (at the current plates-per-plate rate) when a stack fills up

const STACK_CONTAINER = { w: STACK_SLOT_COUNT * STACK_COLUMN_WIDTH };
STACK_CONTAINER.h = STACK_CAPACITY * STACK_PLATE_SPACING + 40; // fits the window height exactly, with room for the heading
STACK_CONTAINER.x = CANVAS_W - 20 - STACK_CONTAINER.w;
STACK_CONTAINER.y = CANVAS_H - 20 - STACK_CONTAINER.h;
const STACK_BASE_Y = STACK_CONTAINER.y + STACK_CONTAINER.h - 20;

// Flipped horizontally so slot 0 (the first/oldest visible stack) sits at
// the RIGHT edge of the container and later slots run leftward - stacks
// fill up from the right first.
function stackColumnX(slot) {
  return STACK_CONTAINER.x + STACK_CONTAINER.w - STACK_COLUMN_WIDTH * (slot + 1);
}
function stackPlatePosition(stackIndex, plateIndexInStack) {
  return {
    x: stackColumnX(stackIndex) + STACK_COLUMN_WIDTH / 2,
    y: STACK_BASE_Y - plateIndexInStack * STACK_PLATE_SPACING,
  };
}
function currentStackIndex() {
  return state.stacks.length - 1;
}
// Makes sure the currently-filling stack has room; if it's already full,
// starts a new one (clearing out the lowest stack first if we're already
// showing the max number of slots) and pays out the fill bonus.
function ensureStackSpace() {
  if (state.stacks[currentStackIndex()].length >= STACK_CAPACITY) {
    if (state.stacks.length >= STACK_SLOT_COUNT) {
      state.stacks.shift(); // clear the lowest (oldest) stack - it's gone, not just hidden
    }
    state.stacks.push([]);
    const bonus = STACK_FILL_BONUS_PLATES * NORMAL_REWARD * state.rewardMultiplier;
    state.platesCleaned += bonus;
    state.roundCurrencyEarned += bonus;
    state.stackBonusPopup = {
      text: `+${bonus} plates`,
      startTime: performance.now(),
      duration: 2500,
    };
  }
}

// ----------------------------------------------------------------------------
// Upgrades panel: drawn directly on the canvas as a box on the LEFT of the
// play area, mirroring the Stacks container's position/size on the right
// (same width/height/y, reflected across the canvas). No DOM buttons - each
// upgrade has a "buy button" hit-region that responds to a normal click,
// exactly like the old DOM buttons did. See the canvas 'click' listener
// further down and drawUpgradesPanel().
// ----------------------------------------------------------------------------
const UPGRADE_CONTAINER = { w: STACK_CONTAINER.w, h: STACK_CONTAINER.h, y: STACK_CONTAINER.y };
UPGRADE_CONTAINER.x = CANVAS_W - (STACK_CONTAINER.x + STACK_CONTAINER.w); // mirror of STACK_CONTAINER.x

const UPGRADE_HEADING_H = 30;
const UPGRADE_ITEM_PAD = 8;
const UPGRADE_ITEM_GAP = 6;

function upgradeItemHeight() {
  const count = UPGRADE_DEFS.length;
  const available = UPGRADE_CONTAINER.h - UPGRADE_HEADING_H - UPGRADE_ITEM_PAD * 2 - UPGRADE_ITEM_GAP * (count - 1);
  return available / count;
}
function upgradeItemRect(index) {
  const itemH = upgradeItemHeight();
  return {
    x: UPGRADE_CONTAINER.x + UPGRADE_ITEM_PAD,
    y: UPGRADE_CONTAINER.y + UPGRADE_HEADING_H + UPGRADE_ITEM_PAD + index * (itemH + UPGRADE_ITEM_GAP),
    w: UPGRADE_CONTAINER.w - UPGRADE_ITEM_PAD * 2,
    h: itemH,
  };
}
// The clickable "Buy" region within an upgrade card - the bottom third of
// the card.
function upgradeButtonRect(index) {
  const item = upgradeItemRect(index);
  const btnH = 22;
  return { x: item.x + 3, y: item.y + item.h - btnH - 4, w: item.w - 6, h: btnH };
}

// Picks the largest font size (down to minSize) that still fits `text`
// within maxWidth, so upgrade item/button text renders as large as
// possible without overflowing its box regardless of how long a
// particular upgrade's label happens to be. Leaves ctx.font set to the
// chosen size (bold if requested) as a side effect, ready to draw with.
function fittedFontSize(text, maxWidth, maxSize, minSize, bold = false) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px Segoe UI, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

const CLEAN_THRESHOLD = 0.95; // average grime remaining must drop below this
const COVERAGE_THRESHOLD = 0.95; // fraction of the plate that must have been directly touched

// Golden plates: rare, worth far more currency, and dressed up visually.
const GOLD_FILL_DIRTY = '#f2dfa0';
const GOLD_FILL_CLEAN = '#fff3c4';
const GOLD_STROKE_DIRTY = '#c9a227';
const GOLD_STROKE_CLEAN = '#ffd700';
const GOLD_REWARD = 10;
const NORMAL_REWARD = 1;

// Lucky Sponge: starts at 1% and adds a flat +10% per purchase, capped at 99%.
const BASE_GOLDEN_CHANCE = 0.01;
const GOLDEN_CHANCE_PER_LEVEL = 0.10;
const GOLDEN_CHANCE_CAP = 0.99;

function currentGoldenChance() {
  const level = state.upgrades.goldenBoost || 0;
  return Math.min(GOLDEN_CHANCE_CAP, BASE_GOLDEN_CHANCE + level * GOLDEN_CHANCE_PER_LEVEL);
}

// Speed bonus: round 1's 5 plates need to be finished in under a minute,
// which works out to a 12-second-per-plate budget. Bigger rounds (from the
// "extra dishes" upgrade, or just later rounds) get proportionally more
// time. Both this and the stack-fill bonus are expressed as a number of
// plates, then converted to currency at the CURRENT plates-per-plate rate.
const TIME_BONUS_SECONDS_PER_PLATE = 12;
const TIME_BONUS_PAYOUT_FRACTION = 0.5; // 50% of the round's plate count, as a plate bonus

// Actual elapsed time can run into hours over a long session; the target
// only ever needs minutes and seconds since it scales off a per-plate budget.
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${mins}m ${secs}s`
    : `${mins}m ${secs}s`;
}
function formatMinSec(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${secs}s`;
}

// Plates cleaned in the last real-time (game-clock) minute: trims
// state.washTimestamps to the trailing 60s window every time it's read, so
// it stays accurate no matter how long the session has been running.
function getPlatesPerMinute() {
  const now = performance.now();
  const cutoff = now - 60000;
  while (state.washTimestamps.length && state.washTimestamps[0] < cutoff) {
    state.washTimestamps.shift();
  }
  return state.washTimestamps.length;
}

// ----------------------------------------------------------------------------
// Plate: owns two offscreen layers -
//   dirtCanvas  - the grime, erased with destination-out as you scrub
//   touchCanvas - a binary "has the sponge been here" mask, used to enforce
//                 that the whole plate gets scrubbed rather than just the
//                 statistically-easiest patch
// ----------------------------------------------------------------------------
class Plate {
  constructor(cx, cy, radius, isGolden = false) {
    this.cx = cx;
    this.cy = cy;
    this.radius = radius;
    this.size = radius * 2;
    this.clean = false;
    this.isGolden = isGolden;

    this.dirtCanvas = document.createElement('canvas');
    this.dirtCanvas.width = this.size;
    this.dirtCanvas.height = this.size;
    this.dirtCtx = this.dirtCanvas.getContext('2d');

    this.touchCanvas = document.createElement('canvas');
    this.touchCanvas.width = this.size;
    this.touchCanvas.height = this.size;
    this.touchCtx = this.touchCanvas.getContext('2d');

    this._dirtSampleCanvas = document.createElement('canvas');
    this._dirtSampleCanvas.width = 32;
    this._dirtSampleCanvas.height = 32;
    this._dirtSampleCtx = this._dirtSampleCanvas.getContext('2d');
    this._cleanPercentCache = 0;
    this._dirtCacheStale = true;

    this._touchSampleCanvas = document.createElement('canvas');
    this._touchSampleCanvas.width = 32;
    this._touchSampleCanvas.height = 32;
    this._touchSampleCtx = this._touchSampleCanvas.getContext('2d');
    this._coveragePercentCache = 0;
    this._touchCacheStale = true;

    this.generateDirt();
    this.initTouchMask();

    // Captured once, right after the dirt is generated, so the on-screen
    // cleanliness bar can be "faked" to always run from a clean 0% to a
    // clean 100% regardless of what the real underlying grime math says.
    this.startCleanPercent = this.getCleanPercent();
  }

  generateDirt() {
    const dctx = this.dirtCtx;
    dctx.clearRect(0, 0, this.size, this.size);
    dctx.save();
    dctx.beginPath();
    dctx.arc(this.radius, this.radius, this.radius, 0, Math.PI * 2);
    dctx.clip();

    // base grime wash
    dctx.fillStyle = 'rgba(110, 85, 45, 0.5)';
    dctx.fillRect(0, 0, this.size, this.size);

    // irregular food-stain blotches
    const blotchColors = [
      'rgba(95, 60, 25, 0.55)',
      'rgba(70, 100, 40, 0.45)',
      'rgba(140, 45, 35, 0.4)',
      'rgba(60, 45, 30, 0.5)',
    ];
    const blotchCount = 12 + Math.floor(Math.random() * 6);
    for (let i = 0; i < blotchCount; i++) {
      const bx = Math.random() * this.size;
      const by = Math.random() * this.size;
      const br = this.radius * (0.15 + Math.random() * 0.28);
      dctx.fillStyle = blotchColors[i % blotchColors.length];
      dctx.beginPath();
      dctx.ellipse(
        bx, by, br, br * (0.55 + Math.random() * 0.6),
        Math.random() * Math.PI, 0, Math.PI * 2
      );
      dctx.fill();
    }
    dctx.restore();
  }

  // The touch mask starts fully "touched" outside the plate's circle (that
  // area is irrelevant filler in the square canvas) and fully "untouched"
  // inside the circle, so coverage sampling only ever reflects the real
  // plate surface.
  initTouchMask() {
    const tctx = this.touchCtx;
    tctx.clearRect(0, 0, this.size, this.size);
    tctx.fillStyle = 'rgba(255,255,255,1)';
    tctx.fillRect(0, 0, this.size, this.size);
    tctx.save();
    tctx.globalCompositeOperation = 'destination-out';
    tctx.beginPath();
    tctx.arc(this.radius, this.radius, this.radius, 0, Math.PI * 2);
    tctx.fill();
    tctx.restore();
  }

  // worldX/worldY are canvas-space coordinates. `efficiency` scales how much
  // grime a single stroke removes - see the "efficient sponge" upgrade.
  scrubAt(worldX, worldY, brushRadius, efficiency = 1) {
    const lx = worldX - (this.cx - this.radius);
    const ly = worldY - (this.cy - this.radius);
    if (
      lx < -brushRadius || lx > this.size + brushRadius ||
      ly < -brushRadius || ly > this.size + brushRadius
    ) {
      return false;
    }

    // Base strength is intentionally weak: at efficiency 1 a single stroke
    // only removes about half the grime in a spot, so the player has to go
    // back over the same area roughly twice to fully clean it. Each level of
    // the efficient-sponge upgrade adds +20% strength.
    const alpha = Math.min(1, 0.5 * efficiency);

    const dctx = this.dirtCtx;
    dctx.save();
    dctx.globalCompositeOperation = 'destination-out';
    const grad = dctx.createRadialGradient(lx, ly, 0, lx, ly, brushRadius);
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
    grad.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.6})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = grad;
    dctx.beginPath();
    dctx.arc(lx, ly, brushRadius, 0, Math.PI * 2);
    dctx.fill();
    dctx.restore();

    // Mark this area as touched (hard-edged - a single graze counts).
    const tctx = this.touchCtx;
    tctx.save();
    tctx.globalCompositeOperation = 'source-over';
    tctx.fillStyle = 'rgba(255,255,255,1)';
    tctx.beginPath();
    tctx.arc(lx, ly, brushRadius, 0, Math.PI * 2);
    tctx.fill();
    tctx.restore();

    this._dirtCacheStale = true;
    this._touchCacheStale = true;
    return true;
  }

  getCleanPercent() {
    if (!this._dirtCacheStale) return this._cleanPercentCache;
    this._dirtCacheStale = false;
    this._cleanPercentCache = samplePercentClear(this.dirtCanvas, this._dirtSampleCtx);
    return this._cleanPercentCache;
  }

  getCoveragePercent() {
    if (!this._touchCacheStale) return this._coveragePercentCache;
    this._touchCacheStale = false;
    this._coveragePercentCache = samplePercentClear(this.touchCanvas, this._touchSampleCtx, true);
    return this._coveragePercentCache;
  }

  // Remaps the real clean percentage onto a clean 0-100% range: 0% at the
  // plate's actual starting griminess, 100% right when it crosses
  // CLEAN_THRESHOLD. Display-only - the real thresholds still drive whether
  // the plate is actually done.
  getDisplayCleanPercent() {
    const real = this.getCleanPercent();
    const span = CLEAN_THRESHOLD - this.startCleanPercent;
    if (span <= 0) return real >= CLEAN_THRESHOLD ? 1 : 0;
    return Math.max(0, Math.min(1, (real - this.startCleanPercent) / span));
  }

  // Fully wipes the grime layer - used once a plate is confirmed clean so
  // there's no trace of dirt left, even if the completion thresholds
  // allowed a sliver of residue through.
  clearAllDirt() {
    this.dirtCtx.clearRect(0, 0, this.size, this.size);
    this._dirtCacheStale = true;
  }

  draw(ctx) {
    const golden = this.isGolden;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    if (this.clean) {
      ctx.fillStyle = golden ? GOLD_FILL_CLEAN : '#ffffff';
      ctx.strokeStyle = golden ? GOLD_STROKE_CLEAN : '#cfe8ff';
    } else {
      ctx.fillStyle = golden ? GOLD_FILL_DIRTY : '#f3eee3';
      ctx.strokeStyle = golden ? GOLD_STROKE_DIRTY : '#d6cdb9';
    }
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius * 0.72, 0, Math.PI * 2);
    ctx.strokeStyle = golden ? 'rgba(212, 175, 55, 0.6)' : 'rgba(190, 180, 160, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    if (!this.clean) {
      ctx.drawImage(this.dirtCanvas, this.cx - this.radius, this.cy - this.radius);
    } else {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = golden ? '#fff2b0' : '#ffffff';
      ctx.lineWidth = golden ? 2.5 : 2;
      const sparkleCount = golden ? 5 : 3;
      for (let i = 0; i < sparkleCount; i++) {
        const a = -0.9 + i * (1.8 / (sparkleCount - 1));
        ctx.beginPath();
        ctx.moveTo(this.cx + Math.cos(a) * this.radius * 0.3, this.cy + Math.sin(a) * this.radius * 0.3);
        ctx.lineTo(this.cx + Math.cos(a) * this.radius * 0.9, this.cy + Math.sin(a) * this.radius * 0.9);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Golden badge label, shown while the plate is at (roughly) full size -
    // hidden once it starts shrinking away to the stack.
    if (golden && this.radius > PLATE_RADIUS * 0.8) {
      ctx.save();
      ctx.fillStyle = '#fff8dc';
      ctx.font = 'bold 16px Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ Golden Plate ★', this.cx, this.cy - this.radius - 14);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }
}

// Shared helper: downsamples a mask canvas to a small grid and returns the
// fraction of pixels that are effectively "clear" (dirt canvas: no grime
// left; touch canvas, when inverted: has been touched).
function samplePercentClear(sourceCanvas, sampleCtx, invert = false) {
  const s = sampleCtx.canvas.width;
  sampleCtx.clearRect(0, 0, s, s);
  sampleCtx.drawImage(sourceCanvas, 0, 0, s, s);
  const data = sampleCtx.getImageData(0, 0, s, s).data;

  let total = 0;
  let markedCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    total++;
    if (data[i] > 15) markedCount++;
  }
  if (total === 0) return 1;
  const markedFraction = markedCount / total;
  // Dirt canvas: "marked" (alpha present) means dirty, so clear% = 1 - marked.
  // Touch canvas: "marked" means touched, so clear% (coverage) = marked directly.
  return invert ? markedFraction : 1 - markedFraction;
}

// How many total plates a given round has (base curve, before the
// "extra dishes" upgrade doubles it - see platesForRound()).
function baselinePlatesForRound(round) {
  return round + 4; // round 1 = 5 plates, +1 plate per round after that
}

function platesForRound(round) {
  const doubleLevel = state.upgrades.doublePlates || 0;
  return baselinePlatesForRound(round) * Math.pow(2, doubleLevel);
}

// ============================================================================
// PERSISTENCE: local save/resume + tuning telemetry
//
// Everything here is device-local (localStorage) - there's no backend yet.
// A stable anonymous playerId is generated once and reused across sessions.
// Every completed round and upgrade purchase is appended to a capped event
// log for later analysis of how the game is actually played (are people
// buying upgrades the moment they can afford them? where does the speed
// bonus stop landing?). A lightweight snapshot of currency/upgrades/stacks/
// round is saved at the same checkpoints so a player can resume a
// part-completed game later - but only at the START of the round they were
// on, since the actively-scrubbing plate's dirt/touch canvases can't be
// cheaply serialized; see applySnapshotToState().
// ============================================================================
const STORAGE_KEYS = {
  playerId: 'dullasDishwater.playerId',
  save: 'dullasDishwater.save.v1',
  events: 'dullasDishwater.events.v1',
};
const MAX_STORED_EVENTS = 2000; // oldest events are dropped once this cap is hit

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

// Appends one telemetry event (run start/resume/end, round-complete, or
// upgrade purchase) to a capped local log - the raw material for tuning the
// game later. Best-effort: if localStorage is unavailable or full, events
// are silently dropped rather than crashing the game.
function logEvent(event) {
  let events = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.events);
    events = raw ? JSON.parse(raw) : [];
  } catch (e) { events = []; }
  events.push(event);
  if (events.length > MAX_STORED_EVENTS) events.splice(0, events.length - MAX_STORED_EVENTS);
  try { localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events)); } catch (e) { /* best effort */ }
}

// Saved at every round-complete and every purchase - just enough to
// reconstruct currency/upgrades/stacks and restart the round the player
// was on. Versioned so a future schema change can detect and ignore old saves.
function saveSnapshot() {
  const snapshot = {
    version: 1,
    playerId: state.playerId,
    runId: state.runId,
    round: state.round,
    platesCleaned: state.platesCleaned,
    totalPlatesWashed: state.totalPlatesWashed,
    goldenPlatesWashed: state.goldenPlatesWashed,
    totalPlatesSpent: state.totalPlatesSpent,
    upgrades: { ...state.upgrades },
    spongeRadius: state.spongeRadius,
    scrubEfficiency: state.scrubEfficiency,
    rewardMultiplier: state.rewardMultiplier,
    stacks: state.stacks.map((s) => [...s]),
    savedAt: Date.now(),
  };
  try { localStorage.setItem(STORAGE_KEYS.save, JSON.stringify(snapshot)); } catch (e) { /* best effort */ }
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.save);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.version === 1 ? data : null;
  } catch (e) {
    return null;
  }
}

function clearSnapshot() {
  try { localStorage.removeItem(STORAGE_KEYS.save); } catch (e) { /* best effort */ }
}

// Copies a saved snapshot into live state. Deliberately does NOT try to
// restore progress on the plate that was mid-scrub when the snapshot was
// taken - startRound() is called right after this (see the Continue button
// handler) to give a fresh dirty plate/pile for whichever round the player
// resumes into.
function applySnapshotToState(snapshot) {
  state.runId = snapshot.runId || state.runId;
  state.round = snapshot.round;
  state.platesCleaned = snapshot.platesCleaned;
  state.totalPlatesWashed = snapshot.totalPlatesWashed;
  state.goldenPlatesWashed = snapshot.goldenPlatesWashed;
  state.totalPlatesSpent = snapshot.totalPlatesSpent;
  state.upgrades = { ...snapshot.upgrades };
  state.spongeRadius = snapshot.spongeRadius;
  state.scrubEfficiency = snapshot.scrubEfficiency;
  state.rewardMultiplier = snapshot.rewardMultiplier;
  state.stacks = snapshot.stacks && snapshot.stacks.length ? snapshot.stacks.map((s) => [...s]) : [[]];
}

// ----------------------------------------------------------------------------
// Game state
// ----------------------------------------------------------------------------
const state = {
  round: 1,
  activePlate: null,
  animatingPlate: null, // plate mid-flight to a stack, see startPlateAnimation()
  stackRemaining: 0, // dirty plates still waiting underneath the active one
  stackOffsets: [], // random peek-out offset per waiting plate, see generateStackOffsets()
  stacks: [[]], // one array per drying stack (isGolden bools); persists & fills up across rounds - see ensureStackSpace()
  isScrubbing: false,
  mouseX: CANVAS_W / 2,
  mouseY: CANVAS_H / 2,
  spongeRadius: 34,
  scrubEfficiency: 1, // multiplies scrub strength; raised by the efficient-sponge upgrade
  rewardMultiplier: 1, // multiplies currency earned per plate; raised by "plates per plate"
  roundComplete: false,
  roundStartTime: 0, // performance.now() when the current round began, for the speed bonus
  roundTotalPlates: 0, // total plates in the current round, captured at round start
  roundPlatesWashed: 0, // plates washed so far THIS round only, reset each round
  roundCurrencyEarned: 0, // currency earned so far THIS round only (incl. bonuses)
  bubbles: [], // small suds particles while scrubbing
  platesCleaned: 0, // the game's currency: how many plates you've cleaned and can still spend
  totalPlatesWashed: 0, // lifetime count of actual plates washed this session (never spent)
  goldenPlatesWashed: 0, // lifetime count of golden plates specifically - subset of totalPlatesWashed
  upgrades: {}, // purchase counts per upgrade id, e.g. { largerSponge: 2 }
  totalPlatesSpent: 0, // lifetime currency spent on upgrades, see buyUpgrade()

  gameStarted: false, // true once the player clicks "Start Washing" on the splash screen
  gameOver: false, // true once the end/statistics screen is showing
  roundFinalElapsedMs: null, // elapsed time frozen at the moment the round ended, for the timer pie chart
  roundFinalBonusEarned: false, // whether the speed bonus was earned, frozen alongside roundFinalElapsedMs
  washTimestamps: [], // performance.now() of every plate wash, trimmed to the last 60s - see getPlatesPerMinute()
  stackBonusPopup: null, // { text, startTime, duration } fading bubble shown when a stack fills, see ensureStackSpace()

  upgradePressFlash: null, // { id, startTime, duration } brief "pressed" flash right after a buy-button click

  playerId: getOrCreatePlayerId(), // stable anonymous ID, persisted in localStorage - see PERSISTENCE section above
  runId: null, // set when a run starts/resumes, see the Start Washing / Continue handlers near the bottom of the file
  upgradeUnlockedAt: {}, // upgrade id -> performance.now() when it first unlocked, see updateUpgradeAvailabilityTracking()
  upgradeAffordableAt: {}, // upgrade id -> performance.now() when currency first covered its CURRENT cost
};

// ----------------------------------------------------------------------------
// Upgrades: each entry is purchasable with plates (the currency). Cost
// multiplies by def.costMultiplier (default 2x, i.e. doubling) every time
// that same upgrade is bought again. An entry with isMaxed() shows FULL and
// stops being purchasable once that returns true; maxLevel (if set) is
// shown next to the current level so the player can see the ceiling.
// currentValueLabel() reports the upgrade's live effect. Every entry is
// always shown in the panel, even before it unlocks - locked ones are just
// dimmed and can't be bought yet.
// ----------------------------------------------------------------------------
const UPGRADE_DEFS = [
  {
    id: 'largerSponge',
    name: 'Larger Sponge',
    description: '+20% sponge size',
    baseCost: 5,
    maxLevel: 11,
    apply: () => { state.spongeRadius = Math.min(PLATE_RADIUS, state.spongeRadius * 1.2); },
    isMaxed: () => (state.upgrades.largerSponge || 0) >= 11,
    // Recomputed from the level (rather than reading the mutated
    // state.spongeRadius directly) so the buy button can preview the
    // post-purchase value by passing levelOverride = level + 1.
    currentValueLabel: (levelOverride) => {
      const lvl = levelOverride != null ? levelOverride : (state.upgrades.largerSponge || 0);
      const radius = Math.min(PLATE_RADIUS, 34 * Math.pow(1.2, lvl));
      return `${Math.round((radius / PLATE_RADIUS) * 100)}% of plate size`;
    },
  },
  {
    id: 'efficientSponge',
    name: 'Efficient Sponge',
    description: '+10% cleaning efficiency per stroke',
    baseCost: 25,
    maxLevel: 10,
    // The displayed 0%->100% progress is purely cosmetic - it's a clean
    // 10%-per-level readout, independent of the real scrubEfficiency math
    // that actually drives how much grime a stroke removes (see Plate.scrubAt).
    apply: () => { state.scrubEfficiency += 0.2; },
    isMaxed: () => (state.upgrades.efficientSponge || 0) >= 10,
    currentValueLabel: (levelOverride) => {
      const lvl = levelOverride != null ? levelOverride : (state.upgrades.efficientSponge || 0);
      return `${lvl * 10}%`;
    },
  },
  {
    id: 'doublePlates',
    name: 'Extra Dishes',
    description: 'Doubles the number of plates each round (from next round on)',
    baseCost: 50,
    maxLevel: 10,
    apply: () => { /* platesForRound() reads state.upgrades.doublePlates directly */ },
    isMaxed: () => (state.upgrades.doublePlates || 0) >= 10,
    currentValueLabel: (levelOverride) => {
      const lvl = levelOverride != null ? levelOverride : (state.upgrades.doublePlates || 0);
      return `${Math.pow(2, lvl)}x plates/round`;
    },
  },
  {
    id: 'goldenBoost',
    name: 'Lucky Sponge',
    description: '+10% chance of a golden plate appearing',
    baseCost: 100,
    maxLevel: 10,
    apply: () => { /* currentGoldenChance() reads state.upgrades.goldenBoost directly */ },
    isMaxed: () => (state.upgrades.goldenBoost || 0) >= 10,
    currentValueLabel: (levelOverride) => {
      const lvl = levelOverride != null ? levelOverride : (state.upgrades.goldenBoost || 0);
      const chance = Math.min(GOLDEN_CHANCE_CAP, BASE_GOLDEN_CHANCE + lvl * GOLDEN_CHANCE_PER_LEVEL);
      return `${Math.round(chance * 100)}% golden chance`;
    },
  },
  {
    id: 'platesPerPlate',
    name: 'Plates Per Plate',
    description: 'Doubles the plates you earn per plate cleaned',
    baseCost: 150,
    costMultiplier: 3, // triples per purchase instead of the default doubling
    maxLevel: 11,
    apply: () => { state.rewardMultiplier *= 2; },
    isMaxed: () => (state.upgrades.platesPerPlate || 0) >= 11,
    currentValueLabel: (levelOverride) => {
      const lvl = levelOverride != null ? levelOverride : (state.upgrades.platesPerPlate || 0);
      return `${Math.pow(2, lvl)}x plates/plate`;
    },
  },
];

function upgradeCost(def) {
  const level = state.upgrades[def.id] || 0;
  return def.baseCost * Math.pow(def.costMultiplier || 2, level);
}

function buyUpgrade(def, index) {
  if (!isUpgradeUnlocked(index)) return false;
  if (def.isMaxed && def.isMaxed()) return false;
  const cost = upgradeCost(def);
  if (state.platesCleaned < cost) return false;

  const now = performance.now();
  const unlockedAt = state.upgradeUnlockedAt[def.id];
  const affordableAt = state.upgradeAffordableAt[def.id];

  state.platesCleaned -= cost;
  state.totalPlatesSpent += cost;
  state.upgrades[def.id] = (state.upgrades[def.id] || 0) + 1;
  def.apply();

  logEvent({
    type: 'upgrade_purchase',
    playerId: state.playerId,
    runId: state.runId,
    upgradeId: def.id,
    level: state.upgrades[def.id],
    round: state.round,
    timestamp: Date.now(),
    cost,
    // How long the upgrade sat unlocked/affordable before this purchase -
    // null if that moment wasn't captured (e.g. it was already unlocked
    // when a resumed run started).
    msSinceUnlocked: unlockedAt != null ? Math.round(now - unlockedAt) : null,
    msSinceAffordable: affordableAt != null ? Math.round(now - affordableAt) : null,
  });
  // Recomputed fresh next frame against the NEXT level's (higher) cost.
  state.upgradeAffordableAt[def.id] = null;
  saveSnapshot();

  return true;
}

// Upgrades unlock one at a time: an entry can only be bought once the one
// before it has been bought at least once. The first entry is always
// unlocked. Locked entries still show in the panel (per design), just
// dimmed with a "Locked" button.
function isUpgradeUnlocked(index) {
  if (index === 0) return true;
  const prevDef = UPGRADE_DEFS[index - 1];
  return (state.upgrades[prevDef.id] || 0) >= 1;
}

// True once every upgrade that has a maxLevel/isMaxed() has actually hit it -
// one of the two win conditions for the game (the other is finishing round
// MAX_ROUNDS). Upgrades with no cap (none currently) would never satisfy
// this, so this only fires once the whole capped upgrade tree is exhausted.
function allUpgradesMaxed() {
  return UPGRADE_DEFS.every((def) => def.isMaxed && def.isMaxed());
}

// Records, once each, the moment an upgrade first unlocks and the moment it
// first becomes affordable at its CURRENT cost - purely for the purchase
// telemetry logged in buyUpgrade() (how long does a player sit on an
// available upgrade before buying it?). Called once per frame from tick().
function updateUpgradeAvailabilityTracking() {
  UPGRADE_DEFS.forEach((def, index) => {
    if (isUpgradeUnlocked(index) && state.upgradeUnlockedAt[def.id] == null) {
      state.upgradeUnlockedAt[def.id] = performance.now();
    }
    if (
      state.upgradeUnlockedAt[def.id] != null &&
      state.upgradeAffordableAt[def.id] == null &&
      !(def.isMaxed && def.isMaxed()) &&
      state.platesCleaned >= upgradeCost(def)
    ) {
      state.upgradeAffordableAt[def.id] = performance.now();
    }
  });
}

// Random peek-out offset for each dirty plate waiting under the active one.
// All of them are rendered (see drawStackPile()), but the distance is scaled
// so even the very last (farthest) one never exceeds STACK_MAX_OFFSET -
// keeping its centre inside the active plate's circle and on-screen.
// Generated once per round so the pile doesn't jitter frame to frame; index
// 0 is always the layer immediately beneath the active plate.
function generateStackOffsets(count) {
  const offsets = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = count <= 1 ? STACK_MAX_OFFSET : (STACK_MAX_OFFSET * (i + 1)) / count;
    offsets.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
  }
  return offsets;
}

function startRound(roundNum) {
  state.round = roundNum;
  const total = platesForRound(roundNum);
  state.roundTotalPlates = total;
  state.roundStartTime = performance.now();
  state.roundPlatesWashed = 0;
  state.roundCurrencyEarned = 0;
  state.stackRemaining = total - 1;
  state.stackOffsets = generateStackOffsets(state.stackRemaining);
  // Note: state.stacks is intentionally NOT reset here - stacks keep filling
  // up across rounds; see ensureStackSpace() for how the oldest one clears.
  state.animatingPlate = null;
  state.activePlate = new Plate(ACTIVE_X, ACTIVE_Y, PLATE_RADIUS, Math.random() < currentGoldenChance());
  state.roundComplete = false;
  state.roundFinalElapsedMs = null;
  state.roundFinalBonusEarned = false;
  roundCompletePanel.classList.add('hidden');
}

function onRoundComplete() {
  state.roundComplete = true;
  state.activePlate = null;

  const elapsed = performance.now() - state.roundStartTime;
  const timeLimitMs = state.roundTotalPlates * TIME_BONUS_SECONDS_PER_PLATE * 1000;
  const bonusEarned = elapsed < timeLimitMs;
  const bonusPlateCount = bonusEarned ? Math.round(state.roundTotalPlates * TIME_BONUS_PAYOUT_FRACTION) : 0;
  const bonusAmount = bonusPlateCount * NORMAL_REWARD * state.rewardMultiplier;
  if (bonusAmount > 0) {
    state.platesCleaned += bonusAmount;
    state.roundCurrencyEarned += bonusAmount;
  }

  // Freeze the pie-chart timer exactly where it stood at round end, so it
  // stops ticking but still shows green/red per whether the bonus landed.
  state.roundFinalElapsedMs = elapsed;
  state.roundFinalBonusEarned = bonusEarned;

  // Tuning telemetry + resume checkpoint - logged for every round,
  // including the final one, before the win-condition check below.
  logEvent({
    type: 'round_complete',
    playerId: state.playerId,
    runId: state.runId,
    round: state.round,
    timestamp: Date.now(),
    platesCleanedThisRound: state.roundPlatesWashed,
    currencyEarnedThisRound: state.roundCurrencyEarned,
    elapsedMs: Math.round(elapsed),
    timeLimitMs: Math.round(timeLimitMs),
    bonusEarned,
    bonusAmount,
    platesCleanedLifetime: state.totalPlatesWashed,
    goldenPlatesLifetime: state.goldenPlatesWashed,
    currency: state.platesCleaned,
    upgrades: { ...state.upgrades },
  });
  saveSnapshot();

  // Two win conditions, whichever comes first: finishing MAX_ROUNDS, or
  // maxing out every capped upgrade. Show the game-over/stats screen
  // instead of the usual round-complete panel when either is met.
  if (state.round >= MAX_ROUNDS || allUpgradesMaxed()) {
    const reason = state.round >= MAX_ROUNDS
      ? `You completed all ${MAX_ROUNDS} rounds!`
      : 'You maxed out every upgrade!';
    showGameOverScreen(reason);
    return;
  }

  roundCompleteTitle.textContent = `Round ${state.round} Complete!`;
  roundCompleteCleaned.textContent = `Plates cleaned this round: ${state.roundPlatesWashed}`;
  roundCompleteEarned.textContent = `Plates earned this round: ${state.roundCurrencyEarned}`;
  roundCompleteBonus.textContent = bonusEarned
    ? `⏱ Finished in ${formatDuration(elapsed)} - Speed bonus: +${bonusAmount} plates! (target: ${formatMinSec(timeLimitMs)})`
    : `⏱ Finished in ${formatDuration(elapsed)} - too slow for the speed bonus (target: ${formatMinSec(timeLimitMs)})`;
  roundCompletePanel.classList.remove('hidden');
}

// Shows the shared end screen (same dynamic logo + copyright as the splash
// screen) with a short reason and a handful of lifetime stats - shown when
// the player finishes round MAX_ROUNDS or maxes out every upgrade.
function showGameOverScreen(reason) {
  state.gameOver = true;
  state.roundComplete = true;
  state.activePlate = null;
  state.animatingPlate = null;
  roundCompletePanel.classList.add('hidden');

  logEvent({
    type: 'run_end',
    playerId: state.playerId,
    runId: state.runId,
    timestamp: Date.now(),
    reason,
    round: state.round,
    totalPlatesWashed: state.totalPlatesWashed,
    goldenPlatesWashed: state.goldenPlatesWashed,
    totalPlatesSpent: state.totalPlatesSpent,
  });
  // The run is finished, so there's no partial progress worth resuming -
  // the next launch starts a brand new run.
  clearSnapshot();

  // Only list upgrades actually bought at least once, in the same order
  // they appear in the upgrade panel.
  const purchasedLines = UPGRADE_DEFS
    .filter((def) => (state.upgrades[def.id] || 0) > 0)
    .map((def) => `<li>${def.name}: Lv. ${state.upgrades[def.id]}${def.maxLevel != null ? ` / ${def.maxLevel}` : ''}</li>`)
    .join('');

  gameOverReasonEl.textContent = reason;
  gameOverStatsEl.innerHTML = `
    <p>Rounds completed: ${state.round - (state.roundComplete ? 0 : 1)}</p>
    <p>Total Plates Cleaned: ${state.totalPlatesWashed}</p>
    <p>Golden Plates Cleaned: ${state.goldenPlatesWashed}</p>
    <p>Plates currency remaining: ${state.platesCleaned}</p>
    <p>Total Plates Spent on Upgrades: ${state.totalPlatesSpent}</p>
    <p class="game-over-upgrades-title">Upgrades Purchased:</p>
    <ul class="game-over-upgrades-list">${purchasedLines || '<li>None</li>'}</ul>
  `;
  gameOverScreen.classList.remove('hidden');
}

nextRoundBtn.addEventListener('click', () => {
  startRound(state.round + 1);
});

// Kicks off the fly-to-stack animation for a just-cleaned plate. The plate
// object is reused (repositioned each frame) purely for drawing; once the
// animation finishes it's discarded and a fresh dirty plate takes over. The
// target is computed up front so it flies straight to the exact spot on top
// of whichever stack (and slot within that stack) it will actually land in.
function startPlateAnimation(plate) {
  state.activePlate = null;
  plate.clearAllDirt();

  ensureStackSpace();
  const stackIndex = currentStackIndex();
  const plateIndexInStack = state.stacks[stackIndex].length;
  const target = stackPlatePosition(stackIndex, plateIndexInStack);

  state.animatingPlate = {
    plate,
    targetStackIndex: stackIndex,
    startTime: performance.now(),
    duration: 450,
    fromX: ACTIVE_X, fromY: ACTIVE_Y, fromR: PLATE_RADIUS,
    toX: target.x, toY: target.y, toR: 34,
  };
}

function updatePlateAnimation() {
  const anim = state.animatingPlate;
  const t = Math.min(1, (performance.now() - anim.startTime) / anim.duration);
  const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

  anim.plate.cx = anim.fromX + (anim.toX - anim.fromX) * eased;
  anim.plate.cy = anim.fromY + (anim.toY - anim.fromY) * eased;
  anim.plate.radius = anim.fromR + (anim.toR - anim.fromR) * eased;
  anim.plate.draw(ctx);

  if (t >= 1) {
    state.animatingPlate = null;
    const baseReward = anim.plate.isGolden ? GOLD_REWARD : NORMAL_REWARD;
    const reward = baseReward * state.rewardMultiplier;
    state.platesCleaned += reward;
    state.totalPlatesWashed += 1;
    if (anim.plate.isGolden) state.goldenPlatesWashed += 1;
    state.roundPlatesWashed += 1;
    state.roundCurrencyEarned += reward;
    state.washTimestamps.push(performance.now());
    state.stacks[anim.targetStackIndex].push(anim.plate.isGolden);

    if (state.stackRemaining > 0) {
      state.stackRemaining -= 1;
      state.stackOffsets.shift();
      state.activePlate = new Plate(ACTIVE_X, ACTIVE_Y, PLATE_RADIUS, Math.random() < currentGoldenChance());
    } else {
      onRoundComplete();
    }
  }
}

// ----------------------------------------------------------------------------
// Input handling (mouse + touch, since Google Play builds need touch)
// ----------------------------------------------------------------------------
function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

// No click-and-drag required: simply passing the sponge over the plate
// scrubs it. `isScrubbing` is kept only as a "sponge is on the board" flag
// for the visual indicator, not as a gate on cleaning.
function handleMove(x, y) {
  if (!state.gameStarted || state.gameOver) return;
  state.mouseX = x;
  state.mouseY = y;
  state.isScrubbing = true;
  if (!state.roundComplete && state.activePlate) {
    const scrubbed = state.activePlate.scrubAt(x, y, state.spongeRadius, state.scrubEfficiency);
    if (scrubbed && Math.random() < 0.4) spawnBubble(x, y);
  }
}

canvas.addEventListener('mousemove', (e) => {
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  handleMove(x, y);
});
canvas.addEventListener('mouseleave', () => { state.isScrubbing = false; });

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const { x, y } = getCanvasCoords(t.clientX, t.clientY);
  handleMove(x, y);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const { x, y } = getCanvasCoords(t.clientX, t.clientY);
  handleMove(x, y);
}, { passive: false });
window.addEventListener('touchend', () => { state.isScrubbing = false; });

// Upgrade "Buy" buttons are plain click/tap targets, like any other button -
// scrubbing stays hover-only (mousemove/touchmove above), but purchasing an
// upgrade needs an actual click/tap inside its button's hit-region (see
// upgradeButtonRect()). buyUpgrade() already no-ops safely if the upgrade
// is locked, maxed, or unaffordable, so there's nothing extra to gate here.
function tryBuyUpgradeAt(x, y) {
  if (!state.gameStarted || state.gameOver) return;
  for (let i = 0; i < UPGRADE_DEFS.length; i++) {
    const btn = upgradeButtonRect(i);
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      const def = UPGRADE_DEFS[i];
      if (buyUpgrade(def, i)) {
        state.upgradePressFlash = { id: def.id, startTime: performance.now(), duration: 150 };
      }
      break;
    }
  }
}

canvas.addEventListener('click', (e) => {
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  tryBuyUpgradeAt(x, y);
});

// Mobile needs its own tap handler: touchstart/touchmove above call
// preventDefault() (to stop the page scrolling while scrubbing), and doing
// so also suppresses the browser's synthetic "click" event it would
// otherwise fire after a tap - so the click listener above never runs on
// a touchscreen. Handling the tap directly on touchend fixes that.
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  if (!t) return;
  const { x, y } = getCanvasCoords(t.clientX, t.clientY);
  tryBuyUpgradeAt(x, y);
}, { passive: false });

// ----------------------------------------------------------------------------
// Suds particles (purely cosmetic feedback while scrubbing)
// ----------------------------------------------------------------------------
function spawnBubble(x, y) {
  state.bubbles.push({
    x: x + (Math.random() - 0.5) * 20,
    y: y + (Math.random() - 0.5) * 20,
    r: 2 + Math.random() * 4,
    life: 1,
  });
  if (state.bubbles.length > 120) state.bubbles.shift();
}

function updateBubbles() {
  for (const b of state.bubbles) {
    b.y -= 0.4;
    b.life -= 0.02;
  }
  state.bubbles = state.bubbles.filter((b) => b.life > 0);
}

function drawBubbles() {
  ctx.save();
  for (const b of state.bubbles) {
    ctx.globalAlpha = Math.max(0, b.life) * 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------
function drawBackground() {
  ctx.fillStyle = '#6e5947';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // subtle counter wood grain lines
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let y = HUD_HEIGHT; y < CANVAS_H; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y);
    ctx.stroke();
  }
}

// Dirty plates waiting underneath the active one. Every plate in the pile
// is rendered (see STACK_MAX_OFFSET for why the pile never runs off the
// active plate's circle or off-screen even for huge piles).
function drawStackPile() {
  const layers = state.stackRemaining;
  for (let depth = layers; depth >= 1; depth--) {
    const off = state.stackOffsets[depth - 1];
    if (!off) continue;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ACTIVE_X + off.x, ACTIVE_Y + off.y, PLATE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#d9d2c3';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#b8ae98';
    ctx.stroke();
    ctx.restore();
  }
}

// Progress bar shown just under the active plate, tracking its cleanliness.
function drawCleanlinessBar(percent) {
  const barW = PLATE_RADIUS * 1.6;
  const barH = 12;
  const barX = ACTIVE_X - barW / 2;
  const barY = ACTIVE_Y + PLATE_RADIUS + 14;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, barX, barY, barW, barH, 6);
  ctx.fill();

  const fillW = Math.max(0, Math.min(1, percent)) * barW;
  if (fillW > 0) {
    ctx.fillStyle = '#4caf7d';
    roundRect(ctx, barX, barY, fillW, barH, 6);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, barX, barY, barW, barH, 6);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '12px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(percent * 100)}% clean`, ACTIVE_X, barY + barH + 14);
  ctx.textAlign = 'left';
  ctx.restore();
}

// Drying stacks: one shared "Stacks" container in the bottom-right, holding
// up to STACK_SLOT_COUNT stacks of plates side by side. The array is kept
// capped at STACK_SLOT_COUNT entries (see ensureStackSpace()), so every
// stack currently in state.stacks is visible - nothing to skip here.
function drawStacks() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(STACK_CONTAINER.x, STACK_CONTAINER.y, STACK_CONTAINER.w, STACK_CONTAINER.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(STACK_CONTAINER.x, STACK_CONTAINER.y, STACK_CONTAINER.w, STACK_CONTAINER.h);

  ctx.fillStyle = '#e8f4ff';
  ctx.font = 'bold 13px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Stacks', STACK_CONTAINER.x + STACK_CONTAINER.w / 2, STACK_CONTAINER.y + 16);
  ctx.textAlign = 'left';
  ctx.restore();

  // The array only ever holds up to STACK_SLOT_COUNT stacks (see
  // ensureStackSpace()), so a stack's index is directly its visible slot.
  state.stacks.forEach((stack, stackIndex) => {
    stack.forEach((isGolden, i) => {
      const pos = stackPlatePosition(stackIndex, i);
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, 17, 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = isGolden ? '#ffd54f' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = isGolden ? '#b8860b' : '#cfd8dc';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  });
}

// Upgrades box on the left, mirroring drawStacks()'s container on the
// right. Each card shows name / level / current value plus a "Buy" button;
// buttons are clicked (see the canvas 'click' listener above) to purchase -
// see drawUpgradeButton().
function drawUpgradesPanel() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(UPGRADE_CONTAINER.x, UPGRADE_CONTAINER.y, UPGRADE_CONTAINER.w, UPGRADE_CONTAINER.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(UPGRADE_CONTAINER.x, UPGRADE_CONTAINER.y, UPGRADE_CONTAINER.w, UPGRADE_CONTAINER.h);

  ctx.fillStyle = '#e8f4ff';
  ctx.font = 'bold 13px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Upgrades', UPGRADE_CONTAINER.x + UPGRADE_CONTAINER.w / 2, UPGRADE_CONTAINER.y + 16);
  ctx.textAlign = 'left';
  ctx.restore();

  UPGRADE_DEFS.forEach((def, index) => {
    const item = upgradeItemRect(index);
    const unlocked = isUpgradeUnlocked(index);
    const level = state.upgrades[def.id] || 0;
    const cost = upgradeCost(def);
    const maxed = def.isMaxed ? def.isMaxed() : false;
    const affordable = unlocked && !maxed && state.platesCleaned >= cost;
    const maxLevelLabel = def.maxLevel != null ? def.maxLevel : '∞';

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, item.x, item.y, item.w, item.h, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    roundRect(ctx, item.x, item.y, item.w, item.h, 6);
    ctx.stroke();

    const textX = item.x + 8;
    const textMaxWidth = item.w - 16;

    ctx.globalAlpha = unlocked ? 1 : 0.5;
    ctx.textAlign = 'left';

    fittedFontSize(def.name, textMaxWidth, 14, 9, true);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(def.name, textX, item.y + 17);

    const levelText = `Lv. ${level} / ${maxLevelLabel}`;
    fittedFontSize(levelText, textMaxWidth, 12, 8, false);
    ctx.fillStyle = '#9fd8b8';
    ctx.fillText(levelText, textX, item.y + 35);

    const currentText = `Current: ${def.currentValueLabel()}`;
    fittedFontSize(currentText, textMaxWidth, 12, 8, false);
    ctx.fillStyle = '#cfe0d8';
    ctx.fillText(currentText, textX, item.y + 53);
    ctx.globalAlpha = 1;
    ctx.restore();

    const btn = upgradeButtonRect(index);
    let label, kind;
    if (!unlocked) {
      label = 'Locked'; kind = 'locked';
    } else if (maxed) {
      label = 'FULL'; kind = 'full';
    } else {
      // Previews the value one more purchase would give (level + 1), so
      // the player sees what they're actually about to buy, not just the
      // current level's value repeated.
      label = `Buy ${def.currentValueLabel(level + 1)} for ${cost} plates`;
      kind = affordable ? 'buy' : 'unaffordable';
    }
    drawUpgradeButton(def, index, btn, label, kind);
  });
}

// Draws one upgrade's buy button, including a brief darkened "pressed"
// flash right after a click on it fires a purchase (see the canvas
// 'click' listener above).
function drawUpgradeButton(def, index, rect, label, kind) {
  const pressed = state.upgradePressFlash
    && state.upgradePressFlash.id === def.id
    && (performance.now() - state.upgradePressFlash.startTime) < state.upgradePressFlash.duration;

  let bg = '#4a5a56';
  let fg = '#9aa5a2';
  if (kind === 'buy') { bg = pressed ? '#3d8f66' : '#4caf7d'; fg = '#ffffff'; }
  else if (kind === 'unaffordable') { bg = '#3a4a46'; fg = '#8fa39c'; }

  ctx.save();
  ctx.fillStyle = bg;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 5);
  ctx.fill();
  fittedFontSize(label, rect.w - 10, 11, 7, true);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// Small pie-chart clock showing elapsed round time as a fraction of the
// speed-bonus time limit: green while the bonus is still reachable, red
// once the pie fills all the way round (the window has closed).
function drawRoundTimer() {
  const timeLimitMs = state.roundTotalPlates * TIME_BONUS_SECONDS_PER_PLATE * 1000;
  // Once the round has ended, stop ticking and hold at the frozen elapsed
  // time captured in onRoundComplete() - green/red still reflects whether
  // the speed bonus was actually earned, not just whether the pie is full.
  const elapsed = state.roundComplete && state.roundFinalElapsedMs != null
    ? state.roundFinalElapsedMs
    : performance.now() - state.roundStartTime;
  const fraction = timeLimitMs > 0 ? Math.min(1, elapsed / timeLimitMs) : 1;
  const frozenColorOverride = state.roundComplete && state.roundFinalElapsedMs != null
    ? (state.roundFinalBonusEarned ? '#4caf7d' : '#e05252')
    : null;
  const cx = 45, cy = HUD_HEIGHT / 2, r = 26;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();

  if (fraction > 0) {
    const startAngle = -Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + fraction * Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = frozenColorOverride || (fraction >= 1 ? '#e05252' : '#4caf7d');
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, CANVAS_W, HUD_HEIGHT);

  drawRoundTimer();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Segoe UI, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Round ${state.round} / ${MAX_ROUNDS}`, 85, HUD_HEIGHT / 2 - 12);
  ctx.font = '15px Segoe UI, Arial, sans-serif';
  ctx.fillStyle = '#cfd8dc';
  const dirtyCount = state.stackRemaining + (state.activePlate ? 1 : 0);
  ctx.fillText(`${dirtyCount} plate${dirtyCount === 1 ? '' : 's'} left to clean`, 85, HUD_HEIGHT / 2 + 14);

  ctx.textAlign = 'center';
  ctx.font = 'bold 16px Segoe UI, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Total Plates Cleaned: ${state.totalPlatesWashed}`, CANVAS_W / 2, HUD_HEIGHT / 2 - 22);
  ctx.font = '13px Segoe UI, Arial, sans-serif';
  ctx.fillStyle = '#ffd54f';
  ctx.fillText(`Golden Plates Cleaned: ${state.goldenPlatesWashed}`, CANVAS_W / 2, HUD_HEIGHT / 2);
  ctx.fillStyle = '#9fd8b8';
  ctx.fillText(`Current Plates / Minute: ${getPlatesPerMinute()}`, CANVAS_W / 2, HUD_HEIGHT / 2 + 20);

  ctx.textAlign = 'right';
  ctx.font = 'bold 22px Segoe UI, Arial, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`Plates: ${state.platesCleaned}`, CANVAS_W - 20, HUD_HEIGHT / 2);
  ctx.textAlign = 'left';
  ctx.restore();
}

// Fading "Stack Completion Bonus" bubble, shown floating over the stack
// container whenever ensureStackSpace() pays one out. Purely cosmetic -
// state.stackBonusPopup is cleared once its duration elapses.
function drawStackBonusPopup() {
  const popup = state.stackBonusPopup;
  if (!popup) return;
  const elapsed = performance.now() - popup.startTime;
  if (elapsed >= popup.duration) {
    state.stackBonusPopup = null;
    return;
  }
  const alpha = 1 - elapsed / popup.duration;
  const cx = STACK_CONTAINER.x + STACK_CONTAINER.w / 2;
  const cy = STACK_CONTAINER.y - 18;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.font = 'bold 13px Segoe UI, Arial, sans-serif';
  const title = 'Stack Completion Bonus!';
  const titleW = ctx.measureText(title).width;
  const bodyW = ctx.measureText(popup.text).width;
  const boxW = Math.max(titleW, bodyW) + 24;
  const boxH = 44;
  ctx.fillStyle = 'rgba(20, 30, 35, 0.9)';
  roundRect(ctx, cx - boxW / 2, cy - boxH, boxW, boxH, 8);
  ctx.fill();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - boxW / 2, cy - boxH, boxW, boxH, 8);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(title, cx, cy - boxH + 17);
  ctx.font = '12px Segoe UI, Arial, sans-serif';
  ctx.fillStyle = '#e0e0e0';
  ctx.fillText(popup.text, cx, cy - boxH + 34);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawSponge() {
  const { mouseX: x, mouseY: y } = state;
  ctx.save();
  ctx.translate(x, y);

  // scrub-radius indicator - this circle is the actual cleaning area, and
  // matches state.spongeRadius exactly (raised by the larger-sponge upgrade).
  ctx.beginPath();
  ctx.arc(0, 0, state.spongeRadius, 0, Math.PI * 2);
  ctx.strokeStyle = state.isScrubbing ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)';
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // sponge body - scales with spongeRadius too, so the upgrade visibly
  // grows the sponge itself, not just its invisible cleaning radius.
  const w = state.spongeRadius * 1.353;
  const h = state.spongeRadius * 0.882;
  ctx.fillStyle = '#f2c94c';
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, 8);
  ctx.fill();
  ctx.stroke();

  // scrub texture lines
  ctx.strokeStyle = 'rgba(180,140,20,0.6)';
  ctx.lineWidth = 1.5;
  const lineSpacing = h / 4;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 4, i * lineSpacing);
    ctx.lineTo(w / 2 - 4, i * lineSpacing);
    ctx.stroke();
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ----------------------------------------------------------------------------
// Main loop
// ----------------------------------------------------------------------------
function tick() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawStackPile();
  updateUpgradeAvailabilityTracking();

  const plate = state.activePlate;
  if (plate && !state.animatingPlate) {
    if (plate.getCoveragePercent() >= COVERAGE_THRESHOLD && plate.getCleanPercent() >= CLEAN_THRESHOLD) {
      plate.clean = true;
      startPlateAnimation(plate);
    }
  }

  if (state.animatingPlate) {
    updatePlateAnimation();
  } else if (plate) {
    plate.draw(ctx);
    drawCleanlinessBar(plate.getDisplayCleanPercent());
  }

  drawStacks();
  drawUpgradesPanel();
  updateBubbles();
  drawBubbles();
  drawHUD();
  drawStackBonusPopup();
  // Drawn last so the sponge is always the topmost thing on screen,
  // consistently over the whole Upgrades panel (box, text, and buttons
  // alike) rather than the previous mixed look where the panel's opaque
  // text/buttons covered the sponge but its translucent box background
  // let it show through underneath.
  drawSponge();

  requestAnimationFrame(tick);
}

// ============================================================================
// UPGRADE HOOKS (for future collaboration)
//
// This is where round-to-round progression beyond "one more plate" should
// plug in. Ideas already accounted for in the structure above:
//   - UPGRADE_DEFS: add new purchasable entries here, the panel renders them
//     automatically (name, description, current value, level/max level, buy
//     button). Cost multiplies by def.costMultiplier per level (default 2x);
//     def.isMaxed() locks it and shows FULL once that condition is met.
//   - state.upgrades: purchase counts per upgrade id
//   - state.platesCleaned: the currency - earned by cleaning plates, spent
//     via buyUpgrade()
//   - state.scrubEfficiency: cleaning strength multiplier (efficient sponge)
//   - state.spongeRadius: brush size AND visual sponge size (larger sponge),
//     capped at PLATE_RADIUS
//   - state.rewardMultiplier: currency-per-plate multiplier (plates per
//     plate); both the speed bonus and the stack-fill bonus scale with it
//   - baselinePlatesForRound(round) / platesForRound(round): change the
//     difficulty curve or how the doubling upgrade stacks with it
//   - Plate class: new plate "types" (grease, baked-on, glass) could subclass
//     or add a `toughness` field that slows scrubAt()'s effective radius
//   - CLEAN_THRESHOLD / COVERAGE_THRESHOLD: could vary per plate type
//   - currentGoldenChance() / BASE_GOLDEN_CHANCE / GOLD_REWARD: tune golden
//     plate rarity and payout here
//   - STACK_CAPACITY / STACK_SLOT_COUNT / STACK_FILL_BONUS_PLATES: tune the
//     drying-stack layout and payout
// Nothing below this comment exists yet - build it together, round by round.
// ============================================================================

// The game does not auto-start: it sits on the splash screen until the
// player clicks "Start Washing" (or "Continue", if a saved game exists).
// The render loop itself runs from the very first frame (so the splash
// screen's animated logo etc. keep going), but startRound() - and
// therefore any actual gameplay - only fires once.
startWashingBtn.addEventListener('click', () => {
  if (state.gameStarted) return;
  // Starting fresh abandons any part-completed run rather than silently
  // leaving it orphaned in storage - logged so it's distinguishable from a
  // normal completed/finished run in the telemetry.
  const existing = loadSnapshot();
  if (existing) {
    logEvent({
      type: 'run_end',
      playerId: state.playerId,
      runId: existing.runId,
      timestamp: Date.now(),
      reason: 'abandoned_new_game',
      round: existing.round,
    });
    clearSnapshot();
  }
  state.runId = createId();
  logEvent({ type: 'run_start', playerId: state.playerId, runId: state.runId, timestamp: Date.now() });
  state.gameStarted = true;
  splashScreen.classList.add('hidden');
  startRound(1);
  saveSnapshot();
});

continueBtn.addEventListener('click', () => {
  if (state.gameStarted) return;
  const snapshot = loadSnapshot();
  if (!snapshot) return;
  applySnapshotToState(snapshot);
  logEvent({
    type: 'run_resumed',
    playerId: state.playerId,
    runId: state.runId,
    timestamp: Date.now(),
    round: state.round,
  });
  state.gameStarted = true;
  splashScreen.classList.add('hidden');
  // Restarts the round the player was on with a fresh dirty plate/pile -
  // see applySnapshotToState()'s comment for why mid-plate progress can't
  // be restored, and startRound() for why this leaves state.stacks alone.
  startRound(state.round);
});

// Offer "Continue" only if a resumable save actually exists.
const savedGame = loadSnapshot();
if (savedGame) {
  continueBtn.textContent = `Continue - Round ${savedGame.round}`;
  continueBtn.classList.remove('hidden');
}

requestAnimationFrame(tick);
