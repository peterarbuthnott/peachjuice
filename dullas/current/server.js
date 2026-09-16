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
// HTTPS: iojs terminates TLS itself here rather than sitting behind Apache -
// see the HTTPS block near the bottom of this file. If a cert+key are found
// (default ./certs/fullchain.pem + ./certs/privkey.pem, next to this file;
// override with HTTPS_CERT_FILE / HTTPS_KEY_FILE) an additional HTTPS
// listener is started on HTTPS_PORT (default 443) using the exact same
// request handler as the plain HTTP one - same routes, same static files,
// just a second socket. If no cert/key are present, this whole block is
// skipped and only plain HTTP (port 3000) runs, so local/dev use is
// unaffected. Binding to 443 needs a privileged port - see HTTPS-SETUP.md
// for the setcap/root notes.
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
var https = require('https');
var fs = require('fs');
var path = require('path');
var urlModule = require('url');

var PORT = process.env.PORT || 3000;
var ROOT_DIR = __dirname;
var DATA_DIR = path.join(ROOT_DIR, 'data');
var HIGHSCORES_FILE = path.join(DATA_DIR, 'highscores.ndjson');
var EVENTS_FILE = path.join(DATA_DIR, 'events.ndjson');

// ----------------------------------------------------------------------------
// The Standup Memory Game - mounted at /standup on this same process/port,
// since this iojs server already owns the public port for the whole site.
// standup/server.js exports createHandler(basePath) for exactly this: it
// strips the "/standup" prefix internally and serves its own static files
// and /api/* routes from its own directory, independent of this file's
// ROOT_DIR/DATA_DIR. Adjust STANDUP_SERVER_PATH below if the standup folder
// doesn't live as a sibling of this dullas folder.
// ----------------------------------------------------------------------------
var STANDUP_SERVER_PATH = path.join(ROOT_DIR, '..', 'standup', 'server.js');
var standupHandler = null;
try {
  standupHandler = require(STANDUP_SERVER_PATH).createHandler('/standup');
} catch (e) {
  console.error('Could not load the standup game from ' + STANDUP_SERVER_PATH + ': ' + e.message);
  console.error('/standup will 404 until this path is fixed (see STANDUP_SERVER_PATH above).');
}

// Same mounting trick for the Nomination Whist scoring app: its own
// server.js exports createHandler(basePath), strips the "/nominate" prefix
// internally, and serves its own static files and /api/* routes from its
// own directory, independent of this file's ROOT_DIR/DATA_DIR. Adjust
// NOMINATE_SERVER_PATH below if the nominate-app folder doesn't live as a
// sibling of this dullas folder.
var NOMINATE_SERVER_PATH = path.join(ROOT_DIR, '..', 'nominate-app', 'server.js');
var nominateHandler = null;
try {
  nominateHandler = require(NOMINATE_SERVER_PATH).createHandler('/nominate');
} catch (e) {
  console.error('Could not load the nominate game from ' + NOMINATE_SERVER_PATH + ': ' + e.message);
  console.error('/nominate will 404 until this path is fixed (see NOMINATE_SERVER_PATH above).');
}

// HTTPS is optional - see the "HTTPS" block near the bottom of this file.
var HTTPS_PORT = process.env.HTTPS_PORT || 443;
var HTTPS_CERT_FILE = process.env.HTTPS_CERT_FILE || path.join(ROOT_DIR, 'certs', 'fullchain.pem');
var HTTPS_KEY_FILE = process.env.HTTPS_KEY_FILE || path.join(ROOT_DIR, 'certs', 'privkey.pem');

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

// Standardised timestamp format - YYYY-MM-DDTHH:MM:SS, no fractional
// seconds, matching the format game.js uses for its own logging.
// toISOString() is a plain ES5 Date method (safe on io.js), it just needs
// its trailing ".mmmZ" trimmed off.
function isoTimestamp() {
  return new Date().toISOString().slice(0, 19);
}

// Standardised duration format for anything logging a time DIFFERENCE
// rather than a point in time - HH:MM:SS, matching game.js's own
// formatHms(). Used to render timeTakenMs into something human-readable in
// the /api/leaderboards response.
function formatHms(ms) {
  var totalSeconds = Math.max(0, Math.round(ms / 1000));
  var hours = Math.floor(totalSeconds / 3600);
  var mins = Math.floor((totalSeconds % 3600) / 60);
  var secs = totalSeconds % 60;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return pad(hours) + ':' + pad(mins) + ':' + pad(secs);
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
  // Without this, ads.txt (and any other .txt file) fell through to the
  // 'application/octet-stream' default below - confirmed live by fetching
  // https://www.andisdad.net/ads.txt directly. Google's ads.txt crawler is
  // known to be picky about this; serving it as a generic binary download
  // rather than plain text is a plausible contributor to the AdSense
  // dashboard showing this site stuck in "Getting ready".
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res) {
  var reqPath = decodeURIComponent(req.url.split('?')[0]);
  // '/' now serves the site home page (blurb + links out to the game and
  // the highscores page) rather than dropping straight into the game -
  // index.html is still reachable directly at /index.html.
  if (reqPath === '/') reqPath = '/home.html';
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
      // Added for the highscores page's leaderboards (see
      // handleGetLeaderboards below) - platesEarned is lifetime currency
      // earned this run, timeTakenMs is the run's total wall-clock
      // duration. Both are optional: older game.js builds won't send
      // them, so they default to 0/null and that run is just excluded
      // from the leaderboards that need them.
      platesEarned: typeof body.platesEarned === 'number' ? body.platesEarned : 0,
      timeTakenMs: typeof body.timeTakenMs === 'number' ? body.timeTakenMs : null,
      upgrades: body.upgrades || {},
      reason: typeof body.reason === 'string' ? body.reason : null,
      submittedAt: isoTimestamp(),
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

// ----------------------------------------------------------------------------
// /api/leaderboards - the highscores page's 2-category x 4-metric boards.
// These exact strings are game.js's showGameOverScreen() reason text for
// its two win conditions (round MAX_ROUNDS finished vs every upgrade
// maxed) - if MAX_ROUNDS ever changes there, this constant needs updating
// too, since there's no shared module between the two ES5/ES2017 files.
// ----------------------------------------------------------------------------
var REASON_ROUND_COMPLETE = 'You completed all 35 rounds!';
var REASON_UPGRADE_COMPLETE = 'You maxed out every upgrade!';
var LEADERBOARD_LIMIT = 10;

// Keeps, per playerId, whichever entry is best according to metricFn -
// entries where metricFn returns null/undefined (e.g. an older run with no
// timeTakenMs recorded) are skipped entirely rather than sorting as 0.
function pickBestPerPlayer(entries, metricFn, higherIsBetter) {
  var bestByPlayer = {};
  var i, e, v, existing, existingV, better;
  for (i = 0; i < entries.length; i++) {
    e = entries[i];
    v = metricFn(e);
    if (v === null || v === undefined || !isFinite(v)) continue;
    existing = bestByPlayer[e.playerId];
    if (!existing) {
      bestByPlayer[e.playerId] = e;
      continue;
    }
    existingV = metricFn(existing);
    better = higherIsBetter ? (v > existingV) : (v < existingV);
    if (better) bestByPlayer[e.playerId] = e;
  }
  var list = [];
  for (var playerId in bestByPlayer) {
    if (Object.prototype.hasOwnProperty.call(bestByPlayer, playerId)) list.push(bestByPlayer[playerId]);
  }
  return list;
}

// Builds one ranked, capped-at-LEADERBOARD_LIMIT board for a single metric:
// best-per-player first (see above), then sorted best-to-worst.
function rankTop(entries, metricFn, higherIsBetter, formatFn) {
  var candidates = pickBestPerPlayer(entries, metricFn, higherIsBetter);
  candidates.sort(function (a, b) {
    var av = metricFn(a);
    var bv = metricFn(b);
    return higherIsBetter ? (bv - av) : (av - bv);
  });
  var top = candidates.slice(0, LEADERBOARD_LIMIT);
  var out = [];
  for (var i = 0; i < top.length; i++) {
    var v = metricFn(top[i]);
    out.push({
      rank: i + 1,
      name: top[i].name,
      value: v,
      formattedValue: formatFn ? formatFn(v) : v,
      submittedAt: top[i].submittedAt,
    });
  }
  return out;
}

// The 4 sections asked for, in the requested order: time to complete
// (least to most - lower is better), plates earned (most to least),
// plates cleaned (most to least), golden plates (most to least).
function buildCategoryLeaderboards(entries) {
  return {
    timeTaken: rankTop(entries, function (e) { return e.timeTakenMs; }, false, formatHms),
    platesEarned: rankTop(entries, function (e) { return e.platesEarned || 0; }, true, null),
    platesCleaned: rankTop(entries, function (e) { return e.totalPlatesWashed || 0; }, true, null),
    goldenPlates: rankTop(entries, function (e) { return e.goldenPlatesWashed || 0; }, true, null),
  };
}

// Live, uncached read of highscores.ndjson on every single request - never
// serves a cached/stale board, at the cost of re-reading and re-ranking the
// whole file each time. Fine at this data scale (flat file, single Pi).
function handleGetLeaderboards(req, res) {
  var all = readLines(HIGHSCORES_FILE);
  var roundEntries = [];
  var upgradeEntries = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].reason === REASON_ROUND_COMPLETE) {
      roundEntries.push(all[i]);
    } else if (all[i].reason === REASON_UPGRADE_COMPLETE) {
      upgradeEntries.push(all[i]);
    }
  }
  sendJson(res, 200, {
    roundCompletion: buildCategoryLeaderboards(roundEntries),
    upgradeCompletion: buildCategoryLeaderboards(upgradeEntries),
  });
}

function handlePostEvents(req, res) {
  readJsonBody(req).then(function (body) {
    if (!body || !Array.isArray(body.events)) {
      sendJson(res, 400, { error: 'events (array) is required' });
      return;
    }
    var receivedAt = isoTimestamp();
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

// Shared by both the HTTP and HTTPS listeners below - same routes, same
// static files, just two different sockets.
function requestHandler(req, res) {
  var urlPath = req.url.split('?')[0];
  if (standupHandler && (urlPath === '/standup' || urlPath.indexOf('/standup/') === 0)) {
    standupHandler(req, res);
    return;
  }
  if (nominateHandler && (urlPath === '/nominate' || urlPath.indexOf('/nominate/') === 0)) {
    nominateHandler(req, res);
    return;
  }
  if (req.method === 'POST' && urlPath === '/api/score') { handlePostScore(req, res); return; }
  if (req.method === 'GET' && urlPath === '/api/highscores') { handleGetHighscores(req, res); return; }
  if (req.method === 'GET' && urlPath === '/api/leaderboards') { handleGetLeaderboards(req, res); return; }
  if (req.method === 'POST' && urlPath === '/api/events') { handlePostEvents(req, res); return; }
  if (req.method === 'GET') { serveStatic(req, res); return; }
  sendJson(res, 404, { error: 'Not found' });
}

var server = http.createServer(requestHandler);
server.listen(PORT, function () {
  console.log('Dullas Dishwater HTTP server running at http://localhost:' + PORT);
  console.log('Data files: ' + HIGHSCORES_FILE + ', ' + EVENTS_FILE);
});
server.on('error', function (e) {
  console.error('HTTP server failed to start on port ' + PORT + ': ' + e.message);
});

// ----------------------------------------------------------------------------
// HTTPS - only started if a cert and key are both found on disk (see
// HTTPS_CERT_FILE / HTTPS_KEY_FILE above). This lets iojs terminate TLS
// itself directly on HTTPS_PORT (443 by default), so Apache can be left
// alone on port 80 and doesn't need any proxy/rewrite config for this site
// at all. See HTTPS-SETUP.md for how to get a cert onto the Pi and how to
// let iojs bind a privileged port (setcap, or running the service as root).
// ----------------------------------------------------------------------------
if (fs.existsSync(HTTPS_CERT_FILE) && fs.existsSync(HTTPS_KEY_FILE)) {
  var httpsOptions = {
    cert: fs.readFileSync(HTTPS_CERT_FILE),
    key: fs.readFileSync(HTTPS_KEY_FILE),
  };
  var httpsServer = https.createServer(httpsOptions, requestHandler);
  httpsServer.listen(HTTPS_PORT, function () {
    console.log('Dullas Dishwater HTTPS server running at https://localhost:' + HTTPS_PORT);
  });
  httpsServer.on('error', function (e) {
    console.error('HTTPS server failed to start on port ' + HTTPS_PORT + ': ' + e.message);
    if (e.code === 'EACCES') {
      console.error('Port ' + HTTPS_PORT + ' needs a privileged bind - see HTTPS-SETUP.md.');
    }
  });
} else {
  console.log('No cert/key found (looked for ' + HTTPS_CERT_FILE + ' and ' + HTTPS_KEY_FILE + ') - running HTTP only.');
}
