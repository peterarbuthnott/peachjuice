// ============================================================================
// DULLAS DISHWATER - lightweight backend
//
// Purpose: serve the static game files, and give the game somewhere to
// report highscores and end-of-run telemetry to, without needing a real
// database. Everything is a flat, append-only NDJSON (newline-delimited
// JSON) file under data/ - "no database" by design, so there's nothing to
// install, migrate, or patch on the Pi: just a JS runtime.
//
// COMPATIBILITY NOTE: this file is intentionally written in old-style ES5
// JavaScript (var instead of const/let, function expressions instead of
// arrow functions, string concatenation instead of template literals,
// Promise.then()/.catch() instead of async/await, a plain object instead
// of Map, url.parse() instead of the newer global URL class, and a manual
// recursive mkdir instead of fs.mkdirSync's { recursive: true } option).
// That's all to run on io.js v1.5.1 - the newest JS runtime that still
// matches the glibc/libstdc++ on a Raspberry Pi 1 Model B running Debian
// Wheezy. If this ever moves to a Pi running a current OS with a modern
// Node, none of this compatibility care is required anymore - normal
// modern JS would work fine and could be restored.
//
// HOW TO RUN ON THE PI
//   iojs server.js
//   (or PORT=8080 iojs server.js to use a different port; default 3000)
//
// To run it persistently across reboots, wrap it in a systemd unit (see the
// dullas-dishwater.service instructions) - just needs this one file and the
// io.js install, no build step, no extra packages.
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

var http = require('http');
var fs = require('fs');
var path = require('path');
var urlModule = require('url');

var PORT = process.env.PORT || 3000;
var ROOT_DIR = __dirname;
var DATA_DIR = path.join(ROOT_DIR, 'data');
var HIGHSCORES_FILE = path.join(DATA_DIR, 'highscores.ndjson');
var EVENTS_FILE = path.join(DATA_DIR, 'events.ndjson');

var MAX_BODY_BYTES = 200 * 1024; // 200KB
var HIGHSCORE_LIMIT_DEFAULT = 10;
var HIGHSCORE_LIMIT_MAX = 100;

// Manual recursive mkdir - fs.mkdirSync's { recursive: true } option was
// only added in much newer Node (v10.12+), so on io.js this walks the path
// one segment at a time instead, ignoring "already exists" errors.
function mkdirRecursiveSync(dirPath) {
  var parts = path.resolve(dirPath).split(path.sep);
  var current = '';
  for (var i = 0; i < parts.length; i++) {
    current += parts[i] + path.sep;
    try {
      fs.mkdirSync(current);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

mkdirRecursiveSync(DATA_DIR);

function appendLine(filePath, obj) {
  fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf8');
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  var raw = fs.readFileSync(filePath, 'utf8');
  var lines = [];
  var rawLines = raw.split('\n');
  for (var i = 0; i < rawLines.length; i++) {
    var trimmed = rawLines[i].trim();
    if (!trimmed) continue;
    try {
      lines.push(JSON.parse(trimmed));
    } catch (e) { /* skip corrupted line */ }
  }
  return lines;
}

var MIME_TYPES = {
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
  var reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  var filePath = path.normalize(path.join(ROOT_DIR, reqPath));
  if (filePath.indexOf(ROOT_DIR) !== 0) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    var size = 0;
    var chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        if (typeof req.destroy === 'function') {
          req.destroy();
        } else if (req.connection) {
          req.connection.destroy();
        }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      try {
        var raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function handlePostScore(req, res) {
  readJsonBody(req).then(function (body) {
    if (!body || typeof body.playerId !== 'string' || typeof body.round !== 'number') {
      sendJson(res, 400, { error: 'playerId (string) and round (number) are required' });
      return;
    }
    var entry = {
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
  }).catch(function (e) {
    sendJson(res, 400, { error: e.message });
  });
}

function isBetterScore(a, b) {
  if (a.round !== b.round) return a.round > b.round;
  return (a.totalPlatesWashed || 0) > (b.totalPlatesWashed || 0);
}

function handleGetHighscores(req, res) {
  var parsed = urlModule.parse(req.url, true);
  var limit = parseInt(parsed.query.limit, 10);
  if (!isFinite(limit) || limit <= 0) limit = HIGHSCORE_LIMIT_DEFAULT;
  limit = Math.min(limit, HIGHSCORE_LIMIT_MAX);

  var all = readLines(HIGHSCORES_FILE);
  // Plain object instead of Map, keyed by playerId (always a string).
  var bestByPlayer = {};
  for (var i = 0; i < all.length; i++) {
    var entry = all[i];
    var existing = bestByPlayer[entry.playerId];
    if (!existing || isBetterScore(entry, existing)) {
      bestByPlayer[entry.playerId] = entry;
    }
  }

  var allBest = [];
  for (var playerId in bestByPlayer) {
    if (Object.prototype.hasOwnProperty.call(bestByPlayer, playerId)) {
      allBest.push(bestByPlayer[playerId]);
    }
  }

  allBest.sort(function (a, b) {
    if (isBetterScore(a, b)) return -1;
    if (isBetterScore(b, a)) return 1;
    return 0;
  });

  var ranked = allBest.slice(0, limit).map(function (entry) {
    return {
      name: entry.name,
      round: entry.round,
      totalPlatesWashed: entry.totalPlatesWashed,
      goldenPlatesWashed: entry.goldenPlatesWashed,
      reason: entry.reason,
      submittedAt: entry.submittedAt,
    };
  });

  sendJson(res, 200, { scores: ranked });
}

function handlePostEvents(req, res) {
  readJsonBody(req).then(function (body) {
    if (!body || !Array.isArray(body.events)) {
      sendJson(res, 400, { error: 'events (array) is required' });
      return;
    }
    var receivedAt = Date.now();
    for (var i = 0; i < body.events.length; i++) {
      appendLine(EVENTS_FILE, {
        playerId: body.playerId || null,
        runId: body.runId || null,
        event: body.events[i],
        receivedAt: receivedAt,
      });
    }
    sendJson(res, 200, { ok: true, count: body.events.length });
  }).catch(function (e) {
    sendJson(res, 400, { error: e.message });
  });
}

var server = http.createServer(function (req, res) {
  var urlPath = req.url.split('?')[0];
  if (req.method === 'POST' && urlPath === '/api/score') { handlePostScore(req, res); return; }
  if (req.method === 'GET' && urlPath === '/api/highscores') { handleGetHighscores(req, res); return; }
  if (req.method === 'POST' && urlPath === '/api/events') { handlePostEvents(req, res); return; }
  if (req.method === 'GET') { serveStatic(req, res); return; }
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, function () {
  console.log('Dullas Dishwater server running at http://localhost:' + PORT);
  console.log('Data files: ' + HIGHSCORES_FILE + ', ' + EVENTS_FILE);
});
