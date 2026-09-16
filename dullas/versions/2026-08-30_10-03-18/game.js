// ============================================================================
// DISH DUTY - core game loop
//
// Round 1 starts with 5 dirty plates. Move the mouse (sponge) with the
// button held to scrub dirt off. Clean plates -> earn plates (currency) ->
// spend them on upgrades in the side panel, or clean every plate in a round
// to advance.
//
// Plates are the same fixed size every round. Each round is a stack of
// dirty plates; only the top one is active/scrubbable, the rest peek out
// underneath at random offsets. A plate only counts as clean once every
// part of it has been directly touched by the sponge AND the grime average
// is low enough - so a quick swipe that only grazes the middle won't cut it.
// Once clean, the plate animates over to a drying rack in the bottom-right
// corner before the next dirty plate becomes active.
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
const roundCompleteScore = document.getElementById('round-complete-score');
const nextRoundBtn = document.getElementById('next-round-btn');

const upgradePanel = document.getElementById('upgrade-panel');
const upgradeToggleBtn = document.getElementById('upgrade-toggle-btn');
const upgradeListEl = document.getElementById('upgrade-list');

const CANVAS_W = canvas.width;
const CANVAS_H = canvas.height;
const HUD_HEIGHT = 90;

// Fixed plate size and position for every round - plates never shrink as
// rounds add more of them.
const PLATE_RADIUS = 211;
const ACTIVE_X = 310;
const ACTIVE_Y = 350;

// Bottom-right drying rack where cleaned plates for the current round pile up.
const RACK_BOX = { x: CANVAS_W - 170, y: CANVAS_H - 170, w: 150, h: 140 };
const RACK_CENTER_X = RACK_BOX.x + RACK_BOX.w / 2;
const RACK_BASE_Y = RACK_BOX.y + RACK_BOX.h - 20;

const CLEAN_THRESHOLD = 0.95; // average grime remaining must drop below this
const COVERAGE_THRESHOLD = 0.95; // fraction of the plate that must have been directly touched

// ----------------------------------------------------------------------------
// Plate: owns two offscreen layers -
//   dirtCanvas  - the grime, erased with destination-out as you scrub
//   touchCanvas - a binary "has the sponge been here" mask, used to enforce
//                 that the whole plate gets scrubbed rather than just the
//                 statistically-easiest patch
// ----------------------------------------------------------------------------
class Plate {
  constructor(cx, cy, radius) {
    this.cx = cx;
    this.cy = cy;
    this.radius = radius;
    this.size = radius * 2;
    this.clean = false;

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

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.clean ? '#ffffff' : '#f3eee3';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.clean ? '#cfe8ff' : '#d6cdb9';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius * 0.72, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(190, 180, 160, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    if (!this.clean) {
      ctx.drawImage(this.dirtCanvas, this.cx - this.radius, this.cy - this.radius);
    } else {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = -0.7 + i * 0.5;
        ctx.beginPath();
        ctx.moveTo(this.cx + Math.cos(a) * this.radius * 0.3, this.cy + Math.sin(a) * this.radius * 0.3);
        ctx.lineTo(this.cx + Math.cos(a) * this.radius * 0.9, this.cy + Math.sin(a) * this.radius * 0.9);
        ctx.stroke();
      }
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

// ----------------------------------------------------------------------------
// Game state
// ----------------------------------------------------------------------------
const state = {
  round: 1,
  activePlate: null,
  animatingPlate: null, // plate mid-flight to the rack, see startPlateAnimation()
  stackRemaining: 0, // dirty plates still waiting underneath the active one
  stackOffsets: [], // random peek-out offset per waiting plate, see generateStackOffsets()
  rackCount: 0, // clean plates piled in this round's rack
  isScrubbing: false,
  mouseX: CANVAS_W / 2,
  mouseY: CANVAS_H / 2,
  spongeRadius: 34,
  scrubEfficiency: 1, // multiplies scrub strength; raised by the efficient-sponge upgrade
  roundComplete: false,
  bubbles: [], // small suds particles while scrubbing
  platesCleaned: 0, // the game's currency: how many plates you've cleaned and can still spend
  upgrades: {}, // purchase counts per upgrade id, e.g. { largerSponge: 2 }
};

// ----------------------------------------------------------------------------
// Upgrades: each entry is purchasable with plates (the currency). Cost
// doubles every time that same upgrade is bought again. Add more entries
// here as future upgrades are designed - the panel renders whatever is in
// this list automatically.
// ----------------------------------------------------------------------------
const UPGRADE_DEFS = [
  {
    id: 'largerSponge',
    name: 'Larger Sponge',
    description: '+20% sponge size',
    baseCost: 5,
    apply: () => { state.spongeRadius *= 1.2; },
  },
  {
    id: 'efficientSponge',
    name: 'Efficient Sponge',
    description: '+20% cleaning efficiency per stroke',
    baseCost: 25,
    apply: () => { state.scrubEfficiency += 0.2; },
  },
  {
    id: 'doublePlates',
    name: 'Extra Dishes',
    description: 'Doubles the number of plates each round (from next round on)',
    baseCost: 50,
    apply: () => { /* platesForRound() reads state.upgrades.doublePlates directly */ },
  },
];

function upgradeCost(def) {
  const level = state.upgrades[def.id] || 0;
  return def.baseCost * Math.pow(2, level);
}

function buyUpgrade(def) {
  const cost = upgradeCost(def);
  if (state.platesCleaned < cost) return false;
  state.platesCleaned -= cost;
  state.upgrades[def.id] = (state.upgrades[def.id] || 0) + 1;
  def.apply();
  renderUpgradePanel();
  return true;
}

function renderUpgradePanel() {
  upgradeListEl.innerHTML = '';
  for (const def of UPGRADE_DEFS) {
    const level = state.upgrades[def.id] || 0;
    const cost = upgradeCost(def);
    const affordable = state.platesCleaned >= cost;

    const item = document.createElement('div');
    item.className = 'upgrade-item';

    const header = document.createElement('div');
    header.className = 'upgrade-item-header';
    header.innerHTML = `<span class="upgrade-name">${def.name}</span><span class="upgrade-level">Lv. ${level}</span>`;

    const desc = document.createElement('p');
    desc.className = 'upgrade-desc';
    desc.textContent = def.description;

    const btn = document.createElement('button');
    btn.className = 'upgrade-buy-btn';
    btn.textContent = `Buy - ${cost} plates`;
    btn.disabled = !affordable;
    btn.addEventListener('click', () => buyUpgrade(def));

    item.appendChild(header);
    item.appendChild(desc);
    item.appendChild(btn);
    upgradeListEl.appendChild(item);
  }
}

upgradeToggleBtn.addEventListener('click', () => {
  upgradePanel.classList.toggle('open');
});

// Random peek-out offset for each dirty plate waiting under the active one.
// Farther-back layers (higher index) stick out more. Generated once per
// round so the stack doesn't jitter frame to frame; index 0 is always the
// layer immediately beneath the active plate.
function generateStackOffsets(count) {
  const offsets = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + i * 8 + Math.random() * 12;
    offsets.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
  }
  return offsets;
}

function startRound(roundNum) {
  state.round = roundNum;
  const total = platesForRound(roundNum);
  state.stackRemaining = total - 1;
  state.stackOffsets = generateStackOffsets(state.stackRemaining);
  state.rackCount = 0;
  state.animatingPlate = null;
  state.activePlate = new Plate(ACTIVE_X, ACTIVE_Y, PLATE_RADIUS);
  state.roundComplete = false;
  roundCompletePanel.classList.add('hidden');
}

function onRoundComplete() {
  state.roundComplete = true;
  state.activePlate = null;
  roundCompleteTitle.textContent = `Round ${state.round} Complete!`;
  roundCompleteScore.textContent = `Plates cleaned: ${state.platesCleaned}`;
  roundCompletePanel.classList.remove('hidden');
}

nextRoundBtn.addEventListener('click', () => {
  startRound(state.round + 1);
});

// Kicks off the fly-to-rack animation for a just-cleaned plate. The plate
// object is reused (repositioned each frame) purely for drawing; once the
// animation finishes it's discarded and a fresh dirty plate takes over.
function startPlateAnimation(plate) {
  state.activePlate = null;
  state.animatingPlate = {
    plate,
    startTime: performance.now(),
    duration: 450,
    fromX: ACTIVE_X, fromY: ACTIVE_Y, fromR: PLATE_RADIUS,
    toX: RACK_CENTER_X, toY: RACK_BASE_Y, toR: 34,
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
    state.platesCleaned += 1;
    state.rackCount += 1;
    renderUpgradePanel();

    if (state.stackRemaining > 0) {
      state.stackRemaining -= 1;
      state.stackOffsets.shift();
      state.activePlate = new Plate(ACTIVE_X, ACTIVE_Y, PLATE_RADIUS);
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

function handleMove(x, y) {
  state.mouseX = x;
  state.mouseY = y;
  if (state.isScrubbing && !state.roundComplete && state.activePlate) {
    const scrubbed = state.activePlate.scrubAt(x, y, state.spongeRadius, state.scrubEfficiency);
    if (scrubbed && Math.random() < 0.4) spawnBubble(x, y);
  }
}

canvas.addEventListener('mousedown', (e) => {
  state.isScrubbing = true;
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  handleMove(x, y);
});
window.addEventListener('mouseup', () => { state.isScrubbing = false; });
canvas.addEventListener('mousemove', (e) => {
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  handleMove(x, y);
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  state.isScrubbing = true;
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

// Dirty plates waiting underneath the active one. Purely visual - each one
// peeks out in its own random direction, farther layers sticking out more.
// Capped so a huge stack (later rounds) doesn't draw dozens of layers.
function drawStack() {
  const layers = Math.min(state.stackRemaining, 5);
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

// Drying rack in the bottom-right corner where finished plates for this
// round pile up, viewed edge-on as stacked ellipses.
function drawRack() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(RACK_BOX.x, RACK_BOX.y, RACK_BOX.w, RACK_BOX.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(RACK_BOX.x, RACK_BOX.y, RACK_BOX.w, RACK_BOX.h);

  ctx.fillStyle = '#e8f4ff';
  ctx.font = '13px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Rack', RACK_CENTER_X, RACK_BOX.y + 16);

  const shown = Math.min(state.rackCount, 6);
  for (let i = 0; i < shown; i++) {
    const cy = RACK_BASE_Y - i * 12;
    ctx.beginPath();
    ctx.ellipse(RACK_CENTER_X, cy, 34, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (state.rackCount > shown) {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 13px Segoe UI, Arial, sans-serif';
    ctx.fillText(`+${state.rackCount - shown}`, RACK_CENTER_X, RACK_BOX.y + 32);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, CANVAS_W, HUD_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Segoe UI, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Round ${state.round}`, 20, HUD_HEIGHT / 2 - 12);
  ctx.font = '15px Segoe UI, Arial, sans-serif';
  ctx.fillStyle = '#cfd8dc';
  const dirtyCount = state.stackRemaining + (state.activePlate ? 1 : 0);
  ctx.fillText(`${dirtyCount} plate${dirtyCount === 1 ? '' : 's'} left to clean`, 20, HUD_HEIGHT / 2 + 14);

  ctx.textAlign = 'right';
  ctx.font = 'bold 22px Segoe UI, Arial, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`Plates: ${state.platesCleaned}`, CANVAS_W - 20, HUD_HEIGHT / 2);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawSponge() {
  const { mouseX: x, mouseY: y } = state;
  ctx.save();
  ctx.translate(x, y);

  // scrub-radius indicator
  ctx.beginPath();
  ctx.arc(0, 0, state.spongeRadius, 0, Math.PI * 2);
  ctx.strokeStyle = state.isScrubbing ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)';
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // sponge body
  const w = 46, h = 30;
  ctx.fillStyle = '#f2c94c';
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, 8);
  ctx.fill();
  ctx.stroke();

  // scrub texture lines
  ctx.strokeStyle = 'rgba(180,140,20,0.6)';
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 4, i * 8);
    ctx.lineTo(w / 2 - 4, i * 8);
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
  drawStack();

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
    drawCleanlinessBar(plate.getCleanPercent());
  }

  drawRack();
  updateBubbles();
  drawBubbles();
  drawHUD();
  drawSponge();

  requestAnimationFrame(tick);
}

// ============================================================================
// UPGRADE HOOKS (for future collaboration)
//
// This is where round-to-round progression beyond "one more plate" should
// plug in. Ideas already accounted for in the structure above:
//   - UPGRADE_DEFS: add new purchasable entries here, the panel renders them
//     automatically (name, description, cost, level, buy button). Cost for
//     each entry doubles per level automatically via upgradeCost().
//   - state.upgrades: purchase counts per upgrade id
//   - state.platesCleaned: the currency - earned by cleaning plates, spent
//     via buyUpgrade()
//   - state.scrubEfficiency: cleaning strength multiplier (efficient sponge)
//   - state.spongeRadius: brush size (larger sponge)
//   - baselinePlatesForRound(round) / platesForRound(round): change the
//     difficulty curve or how the doubling upgrade stacks with it
//   - Plate class: new plate "types" (grease, baked-on, glass) could subclass
//     or add a `toughness` field that slows scrubAt()'s effective radius
//   - CLEAN_THRESHOLD / COVERAGE_THRESHOLD: could vary per plate type
// Nothing below this comment exists yet - build it together, round by round.
// ============================================================================

renderUpgradePanel();
startRound(1);
requestAnimationFrame(tick);
