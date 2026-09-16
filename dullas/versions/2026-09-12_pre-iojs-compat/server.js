// ============================================================================
// DULLAS DISHWATER - lightweight backend
//
// Purpose: serve the static game files, and give the game somewhere to
// report highscores and end-of-run telemetry to, without needing a real
// database. Everything is a flat, append-only NDJSON (newline-delimited
// JSON) file under data/ - "no database" by design, so there's nothing to
// install, migrate, or patch on the Pi: just Node itself.
//
// HOW TO RUN ON THE PI
//   node server.js
//   (or set PORT=8080 node server.js to use a different port; default 3000)
//
// To run it persistently across reboots, wrap it in a systemd unit or use
// `pm2 start server.js --name dullas-dishwater`, either of which just needs
// this one file and a Node install - no build step, no extra packages.
//
// DATA FILES (created automatically under ./data on first run)
//   data/highscores.ndjson - one line per submitted run's final score.
//     GET /api/highscores reads this, keeps only each player's best line,
//     sorts, and returns the top N - never deletes/rewrites the file.
//   data/events.ndjson - one line per local telemetry event (round
//     completions, upgrade purchases, run start/resume/end), submitted
//     once per game-over from the same capped local event log the game
//     already keeps in the browser's localStorage. This file is kept
//     entirely separate from highscores.ndjson - it's for the two of you
//     to look through later (tail/grep/awk it, or load it into a
//     spreadsheet - no query language needed), not for the leaderboard.
//
// Both files are plain text, so backup is "copy the file" and inspection
// is "open the file" - no export step, no admin UI, nothing to log into.
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const HIGHSCORES_FILE = path.join(DATA_DIR, 'highscores.ndjson');
const EVENTS_FILE = path.join(DATA_DIR, 'events.ndjson');

const MAX_BODY_BYTES = 200 * 1024; // 200KB
const HIGHSCORE_LIMIT_DEFAULT = 10;
const HIGHSCORE_LIMIT_MAX = 100;

fs.mkdirSync(DATA_DIR, { recursive: true });

function appendLine(filePath, obj) {
  fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf8');
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      lines.push(JSON.parse(trimmed));
    } catch (e) { /* skip corrupted line */ }
  }
  return lines;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT_DIR, reqPath));
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function handlePostScore(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    sendJson(res, 400, { error: e.message });
    return;
  }
  if (!body || typeof body.playerId !== 'string' || typeof body.round !== 'number') {
    sendJson(res, 400, { error: 'playerId (string) and round (number) are required' });
    return;
  }
  const entry = {
    playerId: body.playerId,
    name: typeof body.name === 'string' ? body.name.slice(0, 24) : 'Anonymous',
    round: body.round,
    totalPlatesWashed: body.totalPlatesWashed || 0,
    goldenPlatesWashed: body.goldenPlatesWashed || 0,
    totalPlatesSpent: body.totalPlatesSpent || 0,
    upgrades: body.upgrades || {},
    reason: typeof body.reason === 'string' ? body.reason : null,
    submittedAt: Date.now(),
  };
  appendLine(HIGHSCORES_FILE, entry);
  sendJson(res, 200, { ok: true });
}

function handleGetHighscores(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let limit = parseInt(url.searchParams.get('limit'), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = HIGHSCORE_LIMIT_DEFAULT;
  limit = Math.min(limit, HIGHSCORE_LIMIT_MAX);
  const all = readLines(HIGHSCORES_FILE);
  const bestByPlayer = new Map();
  for (const entry of all) {
    const existing = bestByPlayer.get(entry.playerId);
    if (!existing || isBetterScore(entry, existing)) {
      bestByPlayer.set(entry.playerId, entry);
    }
  }
  const ranked = Array.from(bestByPlayer.values())
    .sort((a, b) => (isBetterScore(a, b) ? -1 : isBetterScore(b, a) ? 1 : 0))
    .slice(0, limit)
    .map((entry) => ({
      name: entry.name,
      round: entry.round,
      totalPlatesWashed: entry.totalPlatesWashed,
      goldenPlatesWashed: entry.goldenPlatesWashed,
      reason: entry.reason,
      submittedAt: entry.submittedAt,
    }));
  sendJson(res, 200, { scores: ranked });
}

function isBetterScore(a, b) {
  if (a.round !== b.round) return a.round > b.round;
  return (a.totalPlatesWashed || 0) > (b.totalPlatesWashed || 0);
}

async function handlePostEvents(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    sendJson(res, 400, { error: e.message });
    return;
  }
  if (!body || !Array.isArray(body.events)) {
    sendJson(res, 400, { error: 'events (array) is required' });
    return;
  }
  const receivedAt = Date.now();
  for (const event of body.events) {
    appendLine(EVENTS_FILE, {
      playerId: body.playerId || null,
      runId: body.runId || null,
      event,
      receivedAt,
    });
  }
  sendJson(res, 200, { ok: true, count: body.events.length });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  if (req.method === 'POST' && urlPath === '/api/score') { handlePostScore(req, res); return; }
  if (req.method === 'GET' && urlPath === '/api/highscores') { handleGetHighscores(req, res); return; }
  if (req.method === 'POST' && urlPath === '/api/events') { handlePostEvents(req, res); return; }
  if (req.method === 'GET') { serveStatic(req, res); return; }
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Dullas Dishwater server running at http://localhost:${PORT}`);
  console.log(`Data files: ${HIGHSCORES_FILE}, ${EVENTS_FILE}`);
});
