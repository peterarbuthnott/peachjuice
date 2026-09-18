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
const highscoreSection = document.getElementById('highscore-section');
const highscoreList = document.getElementById('highscore-list');

const playerNameEntry = document.getElementById('player-name-entry');
const playerNameInput = document.getElementById('player-name-input');
const playerNameSaveBtn = document.getElementById('player-name-save-btn');
const playerNameDisplay = document.getElementById('player-name-display');
const playerNameCurrentEl = document.getElementById('player-name-current');
const playerNameChangeBtn = document.getElementById('player-name-change-btn');

// ============================================================================
// AUDIO: every sound effect is synthesised on the fly with the Web Audio
// API - no sound files to ship or license, and every cue is just a couple
// of short oscillator/noise bursts shaped with a volume envelope. Browsers
// won't let an AudioContext actually produce sound until a real user
// gesture has happened - and, per Chrome/Firefox's own advice, constructing
// one *before* that gesture is what logs the "AudioContext was not allowed
// to start" console warning (harmless, but noisy). So ensureAudioContext()
// is never called until a real gesture: the first pointerdown/keydown
// anywhere on the page constructs+resumes it as early as possible, well
// before the player actually presses Start Washing, so that click's own
// playLetsGo() call is likely to find the context already running.
// ============================================================================
let audioCtx = null;
let masterGain = null;

function ensureAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.6; // overall SFX volume
    masterGain.connect(audioCtx.destination);
  } catch (e) {
    audioCtx = null; // Web Audio unavailable - every sound call below becomes a silent no-op
  }
}

// A freshly-created (or freshly-resumed) AudioContext can sit in
// 'suspended' for a moment before its clock actually starts advancing.
// Scheduling tones against audioCtx.currentTime during that gap used to
// cause a bug: every event got queued against a clock that hadn't moved
// yet, so the instant it finally started, everything queued during the
// silent gap fired at once - "no noise, then a burst of everything at
// once" a few seconds after starting/resuming a game. whenAudioRunning()
// defers a callback until the context is confirmed actually running, and
// playTone()/playSweep() below refuse to schedule anything otherwise, so a
// stray call made just before that point is silently skipped rather than
// queued up wrong.
function whenAudioRunning(fn) {
  if (!audioCtx) return;
  if (audioCtx.state === 'running') {
    fn();
  } else {
    audioCtx.resume().then(() => {
      if (audioCtx && audioCtx.state === 'running') fn();
    });
  }
}

// Fires resume() off the very first user gesture anywhere on the page -
// pointerdown/keydown happen slightly before the click a player uses to
// actually press Start Washing/Continue, so this gives the browser's audio
// thread a small head start. Once resumed, one totally silent tone is
// scheduled to force a real render cycle through the graph - some browsers
// (mobile Safari especially) still have a first-sound hitch otherwise, so
// this "spends" that hitch immediately instead of on the very first
// gameplay cue (the scrubbing "blubble").
function primeAudioOnFirstGesture() {
  ensureAudioContext();
  if (audioCtx) {
    audioCtx.resume().then(() => {
      playTone({ freq: 440, duration: 0.01, gain: 0.0001 });
    });
  }
  window.removeEventListener('pointerdown', primeAudioOnFirstGesture);
  window.removeEventListener('keydown', primeAudioOnFirstGesture);
}
window.addEventListener('pointerdown', primeAudioOnFirstGesture, { once: true });
window.addEventListener('keydown', primeAudioOnFirstGesture, { once: true });

// One short oscillator burst with a quick attack and an exponential decay
// (the shape almost every one-shot game SFX below is built from). `start`
// delays this particular burst relative to "now", so a cue can be composed
// of two or three overlapping/sequential playTone() calls.
function playTone({ freq, type = 'sine', duration = 0.15, start = 0, gain = 0.15, attack = 0.004 }) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const t0 = audioCtx.currentTime + start;
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// A rising/falling pitch sweep - used for the "less-go" start cue.
function playSweep({ freqStart, freqEnd, type = 'sawtooth', duration = 0.3, gain = 0.12 }) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// "clink" - a plate landing on the stack: two quick bright ceramic-ish tones.
function playClink() {
  playTone({ freq: 2200, type: 'triangle', duration: 0.12, gain: 0.18 });
  playTone({ freq: 3100, type: 'sine', duration: 0.09, gain: 0.10, start: 0.015 });
}

// "ka-ching" - a stack fills up: two rising square-wave chimes, cash-register style.
function playKaChing() {
  playTone({ freq: 1100, type: 'square', duration: 0.14, gain: 0.12 });
  playTone({ freq: 1650, type: 'square', duration: 0.18, gain: 0.14, start: 0.09 });
}

// "pa-ping" - upgrade bought: a short low "pa" thump followed by a bright "ping".
function playPaPing() {
  playTone({ freq: 160, type: 'square', duration: 0.07, gain: 0.16 });
  playTone({ freq: 1800, type: 'sine', duration: 0.16, gain: 0.14, start: 0.06 });
}

// "less-go" - game started/resumed: an energetic upward sweep.
function playLetsGo() {
  playSweep({ freqStart: 260, freqEnd: 920, type: 'sawtooth', duration: 0.35, gain: 0.12 });
}

// "bling" - a golden plate appears: three shimmering high tones. `start`
// offsets all three together, so this one shimmer can be scheduled to
// repeat back-to-back (see playGoldenBling() below) without duplicating
// the tone definitions.
function playBling(start = 0) {
  playTone({ freq: 2600, type: 'sine', duration: 0.22, gain: 0.10, start });
  playTone({ freq: 3300, type: 'sine', duration: 0.20, gain: 0.08, start: start + 0.03 });
  playTone({ freq: 4100, type: 'sine', duration: 0.18, gain: 0.06, start: start + 0.06 });
}

// A golden plate is a bigger deal, so its cue is the shimmer played twice
// back-to-back rather than once - roughly double the length of a lone
// "bling".
function playGoldenBling() {
  playBling(0);
  playBling(0.28);
}

// "da-dang" - a round ends: two punchy descending square-wave notes.
function playDaDang() {
  playTone({ freq: 520, type: 'square', duration: 0.16, gain: 0.14 });
  playTone({ freq: 360, type: 'square', duration: 0.22, gain: 0.16, start: 0.15 });
}

// "dang-da" - the reverse of the round-end cue, used for the Next Round
// button: same two notes, pitch order and timing flipped (rising instead
// of falling).
function playDangDa() {
  playTone({ freq: 360, type: 'square', duration: 0.16, gain: 0.14 });
  playTone({ freq: 520, type: 'square', duration: 0.22, gain: 0.16, start: 0.15 });
}

// "blubble-blubble" - a soft double-dip bubbly blip, used while actively
// scrubbing. Each call plays two quick, quiet, slightly-randomised sine
// dips so repeated calls don't sound mechanically identical. Pitched a
// little higher and a touch louder than the original design - low-
// frequency, very-quiet tones like the first pass used are exactly the
// range small phone speakers reproduce worst, so on mobile the cue could
// end up effectively inaudible even though it was technically playing.
function playBlubble() {
  const base = 230 + Math.random() * 90;
  playTone({ freq: base, type: 'sine', duration: 0.075, gain: 0.07, attack: 0.01 });
  playTone({ freq: base * 0.72, type: 'sine', duration: 0.09, gain: 0.055, start: 0.06, attack: 0.01 });
}

// The scrubbing sound is a stream of quiet "blubble" blips rather than a
// one-shot: updateScrubSound() is called once per frame from tick() and,
// whenever handleMove() reports an actual scrub against the plate
// (state.lastScrubSoundAt), fires off another blubble at a randomised
// interval so it doesn't sound like a mechanical loop.
let lastBlubbleAt = 0;
let nextBlubbleDelayMs = 0;

function updateScrubSound() {
  if (!audioCtx) return;
  // Mobile browsers can auto-suspend an idle-ish AudioContext (screen
  // dimming, backgrounding, power saving) with nothing else re-resuming it
  // afterwards - cheap to just ask again every frame while this runs.
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = performance.now();
  // Widened from the original 120ms: touch input on mobile devices often
  // fires touchmove at a coarser, coalesced rate than desktop mousemove, so
  // a tight window could see "scrubbingNow" flicker false between events
  // and starve the cue almost entirely.
  const scrubbingNow = now - state.lastScrubSoundAt < 220;
  if (!scrubbingNow) return;
  if (now - lastBlubbleAt >= nextBlubbleDelayMs) {
    playBlubble();
    lastBlubbleAt = now;
    nextBlubbleDelayMs = 90 + Math.random() * 110;
  }
}

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
    playKaChing();
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

// Standardised timestamp format for anything written to a log (telemetry
// events, save snapshots) - YYYY-MM-DDTHH:MM:SS, always UTC, with no
// fractional seconds since nothing reading these logs back will ever care
// about sub-second precision. toISOString() already produces exactly this
// shape plus a trailing ".mmmZ", so this just trims that off.
function isoTimestamp(date) {
  return (date || new Date()).toISOString().slice(0, 19);
}

// Standardised duration format for anything logging a time DIFFERENCE
// between two events (how long an upgrade sat available before being
// bought, how long a round took) rather than an absolute point in time -
// HH:MM:SS, since none of this logging needs sub-second resolution either.
function formatHms(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
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
    // willReadFrequently: true - samplePercentClear() calls getImageData()
    // on this context every time the clean/coverage cache goes stale
    // (essentially every scrub), which is exactly the repeated-readback
    // pattern this hint exists for; without it Chrome logs a console
    // warning suggesting it once enough reads have piled up.
    this._dirtSampleCtx = this._dirtSampleCanvas.getContext('2d', { willReadFrequently: true });
    this._cleanPercentCache = 0;
    this._dirtCacheStale = true;

    this._touchSampleCanvas = document.createElement('canvas');
    this._touchSampleCanvas.width = 32;
    this._touchSampleCanvas.height = 32;
    this._touchSampleCtx = this._touchSampleCanvas.getContext('2d', { willReadFrequently: true });
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

// Hard safety cap on plates in any single round, regardless of what the
// upgrade math above works out to - a backstop in case future upgrades
// stack on top of the "extra dishes" multiplier below.
const MAX_PLATES_PER_ROUND = 500;

function platesForRound(round) {
  const level = state.upgrades.doublePlates || 0;
  // Linear scaling: each level adds one more full multiple of the
  // baseline rather than doubling the whole count again (which used to
  // compound to 2^level - 1024x at max level, ~40,000 plates in round 35).
  // At max level (10) this is a flat 11x, landing a fully-upgraded round 35
  // around ~430 plates - a big, satisfying pile without being unplayable.
  const multiplier = 1 + level;
  return Math.min(MAX_PLATES_PER_ROUND, baselinePlatesForRound(round) * multiplier);
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
  playerName: 'dullasDishwater.playerName',
  save: 'dullasDishwater.save.v1',
  events: 'dullasDishwater.events.v1',
  lastSyncedEventCount: 'dullasDishwater.lastSyncedEventCount',
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

// Player name for the highscore board - asked once on the splash screen
// (see initPlayerNameUI()), reused for every future run. Entirely separate
// from playerId (the anonymous UUID used for save/resume and telemetry);
// this is just a display label.
function getPlayerName() {
  try { return localStorage.getItem(STORAGE_KEYS.playerName); } catch (e) { return null; }
}
function setPlayerName(name) {
  try { localStorage.setItem(STORAGE_KEYS.playerName, name); } catch (e) { /* best effort only */ }
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

// Reads the full local event log as-is (same storage logEvent() writes to) -
// used by syncEventsToServer() below, kept separate from logEvent() so
// reading never risks accidentally mutating the stored log.
function loadAllEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.events);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// Saved at every round-complete and every purchase - just enough to
// reconstruct currency/upgrades/stacks and restart the round the player
// was on. Versioned so a future schema change can detect and ignore old saves.
function saveSnapshot() {
  const snapshot = {
    version: 1,
    playerId: state.playerId,
    runId: state.runId,
    runStartedAt: state.runStartedAt,
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
    savedAt: isoTimestamp(),
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

// Wipes the local telemetry log outright - called once a run restarts or
// ends, since that log's contents belong to a run that's now over. Also
// removes lastSyncedEventCount: that value is an INDEX into the events
// array, so leaving a stale (larger) index in place after the array is
// emptied would make the next sync think the new run's first batch of
// events had already been sent, silently dropping them. Deliberately
// leaves playerId, playerName, and the save snapshot untouched - those are
// what let a returning player keep their identity and resumable game;
// only the append-only event log is being reset here.
function clearEvents() {
  try { localStorage.removeItem(STORAGE_KEYS.events); } catch (e) { /* best effort */ }
  try { localStorage.removeItem(STORAGE_KEYS.lastSyncedEventCount); } catch (e) { /* best effort */ }
}

// Copies a saved snapshot into live state. Deliberately does NOT try to
// restore progress on the plate that was mid-scrub when the snapshot was
// taken - startRound() is called right after this (see the Continue button
// handler) to give a fresh dirty plate/pile for whichever round the player
// resumes into.
function applySnapshotToState(snapshot) {
  state.runId = snapshot.runId || state.runId;
  // Older saves (pre-highscores-page) won't have this field - fall back to
  // "now" rather than leaving it null, so a resumed old save at least times
  // the remainder of the run instead of submitting a broken/missing metric.
  state.runStartedAt = snapshot.runStartedAt || Date.now();
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

// ============================================================================
// BACKEND SYNC: talks to the lightweight Pi server (see server.js) for the
// highscore board and centralized telemetry archive. Every call here is
// best-effort - wrapped so a missing/unreachable server (no Pi on the
// network, testing via a local file, offline dev) never breaks the game
// itself, exactly like the localStorage helpers above already tolerate a
// full/unavailable localStorage. Nothing here changes what's stored
// locally - it's purely an additional "also send a copy" step.
// ============================================================================
function postJson(url, data) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => null); // server unreachable - silently give up
}

// Submits this run's final result for the highscore board. Called once from
// showGameOverScreen().
//
// Two extra fields feed the highscores page's leaderboards (see server.js's
// /api/leaderboards) beyond what was already tracked here:
//   - platesEarned: lifetime currency earned this run - not separately
//     tracked in state, but exactly equal to what's been spent plus what's
//     still unspent, so it's just totalPlatesSpent + platesCleaned.
//   - timeTakenMs: wall-clock duration of the whole run, from the original
//     Start Washing click (state.runStartedAt, which survives a
//     save/resume - see applySnapshotToState()) to right now. Null if
//     runStartedAt somehow never got set, so the server can leave this run
//     out of the time leaderboard rather than showing a bogus 0:00.
function submitScore(reason) {
  postJson('/api/score', {
    playerId: state.playerId,
    name: getPlayerName() || 'Anonymous',
    round: state.round,
    totalPlatesWashed: state.totalPlatesWashed,
    goldenPlatesWashed: state.goldenPlatesWashed,
    totalPlatesSpent: state.totalPlatesSpent,
    platesEarned: state.totalPlatesSpent + state.platesCleaned,
    timeTakenMs: state.runStartedAt ? (Date.now() - state.runStartedAt) : null,
    upgrades: { ...state.upgrades },
    reason,
  });
}

// Sends only the events logged since the last successful sync (tracked via
// STORAGE_KEYS.lastSyncedEventCount), so the same history isn't re-sent
// wholesale every single call - the server-side events.ndjson file stays a
// clean append of genuinely new events. Called from both the Start Washing
// handler (restart) and showGameOverScreen() (end of run) - in both cases
// specifically so a run that's only being abandoned or ended still gets
// its telemetry (including partially-completed runs) onto the server, not
// just runs that reach a normal game-over.
//
// Returns true if there was nothing to send, or the send succeeded; false
// if there were new events but the request failed (offline, Pi server
// down/unreachable). Callers use this to decide whether it's safe to wipe
// the local log yet - see clearEvents()'s call sites. Returning false
// without touching STORAGE_KEYS.lastSyncedEventCount or the log itself
// means the exact same events are retried at the NEXT restart or
// game-over, so a temporary network blip doesn't silently lose a player's
// partial-run data - it just waits for the next opportunity to sync.
async function syncEventsToServer() {
  const allEvents = loadAllEvents();
  let lastSynced = 0;
  try {
    lastSynced = parseInt(localStorage.getItem(STORAGE_KEYS.lastSyncedEventCount), 10) || 0;
  } catch (e) { lastSynced = 0; }

  const newEvents = allEvents.slice(lastSynced);
  if (newEvents.length === 0) return true;

  const res = await postJson('/api/events', {
    playerId: state.playerId,
    runId: state.runId,
    events: newEvents,
  });
  if (res && res.ok) {
    try { localStorage.setItem(STORAGE_KEYS.lastSyncedEventCount, String(allEvents.length)); } catch (e) { /* best effort */ }
    return true;
  }
  return false;
}

// Fetches the top-10 board and renders it into #highscore-list. Leaves
// #highscore-section hidden (its default state in index.html) if the
// server can't be reached at all, so the game-over screen looks exactly as
// it did before this feature existed when there's no Pi to talk to.
async function fetchHighscores() {
  try {
    const res = await fetch('/api/highscores?limit=10');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.scores || !data.scores.length) return;

    highscoreList.innerHTML = data.scores
      .map((s) => `<li><strong>${escapeHtml(s.name)}</strong> - Round ${s.round}, ${s.totalPlatesWashed} plates</li>`)
      .join('');
    highscoreSection.classList.remove('hidden');
  } catch (e) {
    // Server unreachable - leave the section hidden.
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ----------------------------------------------------------------------------
// Player name entry (splash screen) - asked once, reused for every future
// run, changeable via the small "change" link. Purely a display label for
// the highscore board; has no effect on playerId/save/telemetry.
// ----------------------------------------------------------------------------
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
  lastScrubSoundAt: 0, // performance.now() of the last successful scrub-on-plate hit, drives the "blubble" sound - see updateScrubSound()

  playerId: getOrCreatePlayerId(), // stable anonymous ID, persisted in localStorage - see PERSISTENCE section above
  runId: null, // set when a run starts/resumes, see the Start Washing / Continue handlers near the bottom of the file
  runStartedAt: null, // Date.now() (wall-clock, not performance.now() - needs to survive a reload/resume) when this run first began, for the "time taken to complete" highscore metric
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
// Larger Sponge: radius grows by a constant per-level factor chosen so that
// level 10 (its max) lands the sponge radius exactly on PLATE_RADIUS - i.e.
// 100% of the plate's AREA, not its diameter. Coverage is what actually
// matters for scrubbing, and area scales with radius squared, so a sponge
// at 50% of the plate's width only covers 25% of its area - showing area
// directly avoids that misleading impression.
const LARGER_SPONGE_START_RADIUS = 34;
const LARGER_SPONGE_MAX_LEVEL = 10;
const LARGER_SPONGE_GROWTH_FACTOR = Math.pow(PLATE_RADIUS / LARGER_SPONGE_START_RADIUS, 1 / LARGER_SPONGE_MAX_LEVEL);

function largerSpongeRadiusForLevel(level) {
  return Math.min(PLATE_RADIUS, LARGER_SPONGE_START_RADIUS * Math.pow(LARGER_SPONGE_GROWTH_FACTOR, level));
}

const UPGRADE_DEFS = [
  {
    id: 'largerSponge',
    name: 'Larger Sponge',
    description: 'Grows sponge coverage area toward the whole plate - 100% of plate area at level 10',
    baseCost: 5,
    maxLevel: LARGER_SPONGE_MAX_LEVEL,
    apply: () => { state.spongeRadius = largerSpongeRadiusForLevel(state.upgrades.largerSponge || 0); },
    isMaxed: () => (state.upgrades.largerSponge || 0) >= LARGER_SPONGE_MAX_LEVEL,
    // Recomputed from the level (rather than reading the mutated
    // state.spongeRadius directly) so the buy button can preview the
    // post-purchase value by passing levelOverride = level + 1.
    currentValueLabel: (levelOverride) => {
      const lvl = levelOverride != null ? levelOverride : (state.upgrades.largerSponge || 0);
      const radius = largerSpongeRadiusForLevel(lvl);
      const areaPercent = Math.pow(radius / PLATE_RADIUS, 2) * 100;
      return `${Math.round(areaPercent)}% of plate area`;
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
    description: 'Adds more plates to the next round (capped at 500/round total)',
    baseCost: 50,
    maxLevel: 10,
    apply: () => { /* platesForRound() reads state.upgrades.doublePlates directly */ },
    isMaxed: () => (state.upgrades.doublePlates || 0) >= 10,
    // Shows the actual plate count this buys, in plain terms, rather than
    // the underlying multiplier math: how many MORE plates the next round
    // will have at this level, versus the unupgraded (level 0) baseline for
    // that same round - already accounting for the 500/round cap, so the
    // number shown is always exactly what you get.
    //
    // Two different phrasings share this one number: the "Current" line
    // wants the full "X extra plates per round" sentence, but that's too
    // long once it's also wrapped in the button's "Buy ... for N plates"
    // template - measured against the button's fixed width, it was
    // overflowing. forButtonLabel switches to the shorter "X more" for that
    // call site; drawUpgradesPanel() passes level + 1 and true together for
    // the buy-preview call.
    currentValueLabel: (levelOverride, forButtonLabel) => {
      const lvl = levelOverride != null ? levelOverride : (state.upgrades.doublePlates || 0);
      const nextRound = state.round + 1;
      const baseline = baselinePlatesForRound(nextRound);
      const atLevel = Math.min(MAX_PLATES_PER_ROUND, baseline * (1 + lvl));
      const atBaseline = Math.min(MAX_PLATES_PER_ROUND, baseline);
      const delta = atLevel - atBaseline;
      return forButtonLabel ? `${delta} more` : `${delta} extra plates per round`;
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
    timestamp: isoTimestamp(),
    cost,
    // How long the upgrade sat unlocked/affordable before this purchase -
    // null if that moment wasn't captured (e.g. it was already unlocked
    // when a resumed run started).
    timeSinceUnlocked: unlockedAt != null ? formatHms(now - unlockedAt) : null,
    timeSinceAffordable: affordableAt != null ? formatHms(now - affordableAt) : null,
  });
  // Recomputed fresh next frame against the NEXT level's (higher) cost.
  state.upgradeAffordableAt[def.id] = null;
  saveSnapshot();
  playPaPing();

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

// Spawns the next plate to be washed, rolling for golden odds and playing
// the "bling" cue on a hit. Centralized so both the round-start spawn and
// the mid-round respawn (after a plate lands) share the same behavior.
function spawnActivePlate() {
  const isGolden = Math.random() < currentGoldenChance();
  if (isGolden) playGoldenBling();
  return new Plate(ACTIVE_X, ACTIVE_Y, PLATE_RADIUS, isGolden);
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
  state.activePlate = spawnActivePlate();
  state.roundComplete = false;
  state.roundFinalElapsedMs = null;
  state.roundFinalBonusEarned = false;
  // Note: this "hides" the panel via visibility:hidden, not display:none -
  // see the #round-complete-panel.hidden override in style.css. That keeps
  // the round-complete ad's <ins> at a constant, real size at all times, so
  // it only ever needs to be pushed once (see window.__pushRoundCompleteAd
  // in index.html) rather than rebuilt/re-pushed every round.
  roundCompletePanel.classList.add('hidden');
}

function onRoundComplete() {
  playDaDang();
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
    timestamp: isoTimestamp(),
    platesCleanedThisRound: state.roundPlatesWashed,
    currencyEarnedThisRound: state.roundCurrencyEarned,
    elapsed: formatHms(elapsed),
    timeLimit: formatHms(timeLimitMs),
    bonusEarned,
    bonusAmount,
    platesCleanedLifetime: state.totalPlatesWashed,
    goldenPlatesLifetime: state.goldenPlatesWashed,
    currency: state.platesCleaned,
    upgrades: { ...state.upgrades },
  });
  saveSnapshot();

  // Two win conditions, whichever comes first: finishing MAX_ROUNDS, or
  // maxing out every capped upgrade. The upgrades-maxed condition is also
  // checked after every single plate lands (see updatePlateAnimation()), so
  // in practice it fires there first; the check is repeated here only as a
  // fallback (e.g. a round that starts with every upgrade already maxed).
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
  // window.__pushRoundCompleteAd() (see index.html's ADSENSE block) only
  // actually does anything the very first time this fires - it pushes the
  // round-complete ad once and never again, since #round-complete-panel.hidden
  // now uses visibility:hidden (see style.css) rather than display:none, so
  // the ad's <ins> never needs re-requesting. window.__pushRoundCompleteAd
  // not existing at all on a Steam/Play build (ad code stripped there) is
  // why this is guarded rather than called directly.
  if (window.__pushRoundCompleteAd) window.__pushRoundCompleteAd();
}

// Shows the shared end screen (same dynamic logo + copyright as the splash
// screen) with a short reason and a handful of lifetime stats - shown when
// the player finishes round MAX_ROUNDS or maxes out every upgrade.
function showGameOverScreen(reason) {
  state.gameOver = true;
  state.roundComplete = true;
  state.activePlate = null;
  state.animatingPlate = null;
  // See startRound()'s comment - visibility:hidden, not display:none.
  roundCompletePanel.classList.add('hidden');

  logEvent({
    type: 'run_end',
    playerId: state.playerId,
    runId: state.runId,
    timestamp: isoTimestamp(),
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

  // Best-effort calls to the Pi server - see the BACKEND SYNC section above.
  // None of these can throw or block the screen above from showing; a
  // missing/unreachable server just means no highscore list appears and
  // nothing gets archived server-side this time.
  submitScore(reason);
  // Archive this run's events on the server, then wipe the local log - but
  // only once that archive is confirmed (syncEventsToServer() resolves
  // true). If the server's unreachable right now, leave the log alone so
  // these events are retried at the next restart or game-over instead of
  // being lost - see syncEventsToServer()'s comment.
  syncEventsToServer().then((synced) => { if (synced) clearEvents(); });
  fetchHighscores();
}

nextRoundBtn.addEventListener('click', () => {
  playDangDa();
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
    playClink();
    const baseReward = anim.plate.isGolden ? GOLD_REWARD : NORMAL_REWARD;
    const reward = baseReward * state.rewardMultiplier;
    state.platesCleaned += reward;
    state.totalPlatesWashed += 1;
    if (anim.plate.isGolden) state.goldenPlatesWashed += 1;
    state.roundPlatesWashed += 1;
    state.roundCurrencyEarned += reward;
    state.washTimestamps.push(performance.now());
    state.stacks[anim.targetStackIndex].push(anim.plate.isGolden);

    // One of the two win conditions (the other is finishing MAX_ROUNDS,
    // checked in onRoundComplete()) is maxing out every upgrade. Checked
    // here, right after every single plate lands, so the game ends on the
    // exact plate that completes the last upgrade - not stalled until
    // whatever round happens to be in progress finishes.
    if (allUpgradesMaxed()) {
      showGameOverScreen('You maxed out every upgrade!');
      return;
    }

    if (state.stackRemaining > 0) {
      state.stackRemaining -= 1;
      state.stackOffsets.shift();
      state.activePlate = spawnActivePlate();
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
    const plate = state.activePlate;
    const scrubbed = plate.scrubAt(x, y, state.spongeRadius, state.scrubEfficiency);
    if (scrubbed) {
      // scrubAt() itself hit-tests against the plate's square canvas bounds
      // (for grime-drawing simplicity), so it returns true even in the
      // corners outside the round plate. The scrub sound should only play
      // when the sponge circle actually overlaps the round plate, i.e. the
      // distance between their centers is within the sum of their radii.
      const overPlate = Math.hypot(x - plate.cx, y - plate.cy) <= plate.radius + state.spongeRadius;
      if (overPlate) {
        state.lastScrubSoundAt = performance.now(); // drives the "blubble" sound - see updateScrubSound()
      }
      if (Math.random() < 0.4) spawnBubble(x, y);
    }
  }
}

canvas.addEventListener('mousemove', (e) => {
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  handleMove(x, y);
});
canvas.addEventListener('mouseleave', () => {
  state.isScrubbing = false;
  // Push off-canvas so the Upgrades panel doesn't keep showing a hover
  // highlight/tooltip at the last position the mouse was seen.
  state.mouseX = -9999;
  state.mouseY = -9999;
});

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
    // The whole upgrade card is the hit target, not just the small "Buy"
    // button - with a bigger sponge covering the panel, landing a click
    // precisely on the button became fiddly. buyUpgrade() itself still
    // silently no-ops for locked/maxed/unaffordable upgrades, so widening
    // the target is safe.
    const item = upgradeItemRect(i);
    if (x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h) {
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

  // Hovered upgrade card (if any) - the whole card lights up, and its full
  // buy/locked/maxed label gets drawn as a tooltip after the loop so it's
  // always fully legible even when the button itself is too small to fit
  // the whole string at readable size.
  let hoveredItem = null;
  let hoveredLabel = null;

  UPGRADE_DEFS.forEach((def, index) => {
    const item = upgradeItemRect(index);
    const unlocked = isUpgradeUnlocked(index);
    const level = state.upgrades[def.id] || 0;
    const cost = upgradeCost(def);
    const maxed = def.isMaxed ? def.isMaxed() : false;
    const affordable = unlocked && !maxed && state.platesCleaned >= cost;
    const maxLevelLabel = def.maxLevel != null ? def.maxLevel : '∞';

    const hovered = state.mouseX >= item.x && state.mouseX <= item.x + item.w
      && state.mouseY >= item.y && state.mouseY <= item.y + item.h;

    ctx.save();
    ctx.fillStyle = hovered ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
    roundRect(ctx, item.x, item.y, item.w, item.h, 6);
    ctx.fill();
    ctx.strokeStyle = hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)';
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
      label = 'All Washed Up'; kind = 'full';
    } else {
      // Previews the value one more purchase would give (level + 1), so
      // the player sees what they're actually about to buy, not just the
      // current level's value repeated. The `true` here is forButtonLabel -
      // only doublePlates' currentValueLabel() branches on it (short "X
      // more" instead of the longer "Current:" phrasing, to fit the
      // button); every other upgrade's currentValueLabel ignores the extra
      // argument entirely and behaves exactly as before.
      label = `Buy ${def.currentValueLabel(level + 1, true)} for ${cost} plates`;
      kind = affordable ? 'buy' : 'unaffordable';
    }
    drawUpgradeButton(def, index, btn, label, kind, hovered);

    if (hovered) {
      hoveredItem = item;
      hoveredLabel = label;
    }
  });

  if (hoveredItem && hoveredLabel) {
    drawUpgradeTooltip(hoveredItem, hoveredLabel);
  }
}

// Full-size popup showing exactly what a hovered upgrade card's button
// would do (its complete label - the button itself may have had to shrink
// this text down to fit). Anchored just to the right of the panel, in the
// game area, and clamped so it never runs off the canvas.
function drawUpgradeTooltip(item, label) {
  ctx.save();
  ctx.font = 'bold 13px Segoe UI, Arial, sans-serif';
  const paddingX = 10;
  const boxH = 30;
  const boxW = ctx.measureText(label).width + paddingX * 2;

  let x = item.x + item.w + 12;
  let y = item.y + item.h / 2 - boxH / 2;
  if (x + boxW > CANVAS_W - 8) x = CANVAS_W - 8 - boxW;
  if (y < 8) y = 8;
  if (y + boxH > CANVAS_H - 8) y = CANVAS_H - 8 - boxH;

  ctx.fillStyle = 'rgba(15,25,30,0.94)';
  roundRect(ctx, x, y, boxW, boxH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, boxW, boxH, 6);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + paddingX, y + boxH / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// Draws one upgrade's buy button, including a brief darkened "pressed"
// flash right after a click on it fires a purchase (see the canvas
// 'click' listener above).
function drawUpgradeButton(def, index, rect, label, kind, hovered = false) {
  const pressed = state.upgradePressFlash
    && state.upgradePressFlash.id === def.id
    && (performance.now() - state.upgradePressFlash.startTime) < state.upgradePressFlash.duration;

  let bg = hovered ? '#5c6d68' : '#4a5a56';
  let fg = '#9aa5a2';
  if (kind === 'buy') { bg = pressed ? '#3d8f66' : (hovered ? '#5ac48f' : '#4caf7d'); fg = '#ffffff'; }
  else if (kind === 'unaffordable') { bg = hovered ? '#465650' : '#3a4a46'; fg = '#8fa39c'; }

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
  updateScrubSound();

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
// Fades the splash screen out (see .overlay-screen.fading-out in style.css)
// instead of hiding it instantly, then runs onRevealed() once the fade has
// actually finished. The delay is short (350ms) but real: it gives the
// audio engine a moment to be fully up and running - primed already by
// primeAudioOnFirstGesture()/the click itself - before gameplay that needs
// sound (the scrubbing "blubble") can actually begin. Falls back to a
// timeout in case transitionend doesn't fire for any reason (e.g. a
// reduced-motion setting suppressing the transition), so the game can never
// get stuck behind a splash screen that failed to disappear.
function revealGameArea(onRevealed) {
  const FADE_MS = 350;
  splashScreen.classList.add('fading-out');
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    splashScreen.removeEventListener('transitionend', onTransitionEnd);
    splashScreen.classList.remove('fading-out');
    splashScreen.classList.add('hidden');
    onRevealed();
  };
  const onTransitionEnd = (e) => {
    if (e.target === splashScreen && e.propertyName === 'opacity') finish();
  };
  splashScreen.addEventListener('transitionend', onTransitionEnd);
  setTimeout(finish, FADE_MS + 100);
}

startWashingBtn.addEventListener('click', () => {
  if (state.gameStarted) return;
  // Played immediately on click - by now the context has likely already
  // been resumed by primeAudioOnFirstGesture() (fired on this same click's
  // pointerdown, slightly earlier), so this should fire with no delay.
  ensureAudioContext();
  whenAudioRunning(playLetsGo);
  // Starting fresh abandons any part-completed run rather than silently
  // leaving it orphaned in storage - logged so it's distinguishable from a
  // normal completed/finished run in the telemetry.
  const existing = loadSnapshot();
  if (existing) {
    logEvent({
      type: 'run_end',
      playerId: state.playerId,
      runId: existing.runId,
      timestamp: isoTimestamp(),
      reason: 'abandoned_new_game',
      round: existing.round,
    });
    clearSnapshot();
  }
  // Starting a new game abandons whatever run was in progress (if any), so
  // this is the one chance to get that partial run's telemetry onto the
  // server before its local trace is cleared - previously this only
  // happened on a full game-over, so an abandoned/partial run's events
  // never made it to the server at all. Only wipe the local log once the
  // server has confirmed receiving it; if it's unreachable right now, the
  // log is left alone and retried at the next restart or game-over - same
  // pattern as showGameOverScreen().
  syncEventsToServer().then((synced) => { if (synced) clearEvents(); });

  state.runId = createId();
  state.runStartedAt = Date.now();
  logEvent({ type: 'run_start', playerId: state.playerId, runId: state.runId, timestamp: isoTimestamp() });
  state.gameStarted = true;
  revealGameArea(() => {
    startRound(1);
    saveSnapshot();
  });
});

// ============================================================================
// CHEAT MODE (?cheat=never&<field>=<value>...): an intentionally
// undocumented escape hatch - nothing in the UI mentions it. A player who
// inspects their own save (localStorage's dullasDishwater.save.v1 blob) can
// see the exact field names a snapshot is built from - round, platesCleaned,
// totalPlatesWashed, goldenPlatesWashed, totalPlatesSpent, upgrades,
// spongeRadius, scrubEfficiency, rewardMultiplier, stacks - and pass any of
// those as a same-named, EXACT-CASE-MATCHED query parameter alongside
// cheat=never to build a fabricated "continue" snapshot with those values
// baked in. Simply visiting the URL with these params does nothing on its
// own - the fabricated snapshot only takes effect once the player actually
// presses the resulting "Continue - Round X WITH CHEATING" button.
// ============================================================================
function buildCheatSnapshotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('cheat') !== 'never') return null;

  // Starts from the player's real save (if any) so unspecified fields keep
  // their genuine progress, or a fresh round-1 baseline otherwise.
  const base = loadSnapshot() || {
    version: 1,
    playerId: state.playerId,
    runId: null,
    runStartedAt: null,
    round: 1,
    platesCleaned: 0,
    totalPlatesWashed: 0,
    goldenPlatesWashed: 0,
    totalPlatesSpent: 0,
    upgrades: {},
    spongeRadius: LARGER_SPONGE_START_RADIUS,
    scrubEfficiency: 1,
    rewardMultiplier: 1,
    stacks: [[]],
  };
  const cheatSnapshot = { ...base };

  params.forEach((rawValue, key) => {
    if (key === 'cheat') return;
    // Only known snapshot fields, and only an exact case-sensitive name
    // match - there's no partial matching or documented list to guess from.
    if (!Object.prototype.hasOwnProperty.call(base, key)) return;
    const current = base[key];
    if (typeof current === 'number') {
      const n = Number(rawValue);
      if (!Number.isNaN(n)) cheatSnapshot[key] = n;
    } else if (typeof current === 'object' && current !== null) {
      try { cheatSnapshot[key] = JSON.parse(rawValue); } catch (e) { /* malformed override ignored */ }
    } else {
      cheatSnapshot[key] = rawValue;
    }
  });

  return cheatSnapshot;
}

const cheatSnapshot = buildCheatSnapshotFromUrl();

continueBtn.addEventListener('click', () => {
  if (state.gameStarted) return;
  ensureAudioContext();
  whenAudioRunning(playLetsGo);
  const snapshot = cheatSnapshot || loadSnapshot();
  if (!snapshot) return;
  applySnapshotToState(snapshot);
  logEvent({
    type: 'run_resumed',
    playerId: state.playerId,
    runId: state.runId,
    timestamp: isoTimestamp(),
    round: state.round,
    cheated: !!cheatSnapshot,
  });
  state.gameStarted = true;
  // Restarts the round the player was on with a fresh dirty plate/pile -
  // see applySnapshotToState()'s comment for why mid-plate progress can't
  // be restored, and startRound() for why this leaves state.stacks alone.
  revealGameArea(() => {
    startRound(state.round);
    if (cheatSnapshot) saveSnapshot(); // persist the cheated state too, so a refresh doesn't lose it
  });
});

// Offer "Continue" if a resumable save exists, or - taking priority - if a
// cheat snapshot was built from the URL (see CHEAT MODE above).
const savedGame = loadSnapshot();
if (cheatSnapshot) {
  continueBtn.textContent = `Continue - Round ${cheatSnapshot.round} WITH CHEATING`;
  continueBtn.classList.remove('hidden');
} else if (savedGame) {
  continueBtn.textContent = `Continue - Round ${savedGame.round}`;
  continueBtn.classList.remove('hidden');
}

initPlayerNameUI();

requestAnimationFrame(tick);
