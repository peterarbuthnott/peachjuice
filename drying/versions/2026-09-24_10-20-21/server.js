// WATCH THE DRYING -- server
//
// Targets io.js 1.5.1 (V8 4.1, ~Node 0.12 era) on a Raspberry Pi, same as
// the standup and nominate games this one is meant to sit alongside, so
// this file is written in plain ES5 on purpose:
//   - var, not let/const
//   - function expressions, not arrow functions
//   - string concatenation, not template literals
//   - callbacks, not Promises / async-await
//   - plain objects/arrays instead of Map/Set
//   - legacy require('url').parse(), not the global URL class
//   - manual loops instead of Array.prototype.find (ES6, not in V8 4.1)
// Only core modules are used (http, fs, path, url) -- no npm install
// needed, so `iojs server.js` (or `node server.js` on newer runtimes) is
// all it takes to run it.
//
// Responsibilities:
//   - Serve the static front end from /public
//   - Accept a final run summary from the client and persist it to
//     data/highscores.json (trusting the client, same as Dullas Dishwater
//     does for /api/score -- there's no server-side simulation of the
//     paint job or the drying clock to check it against)
//   - Serve a simple paginated leaderboard, sorted fastest-dry-time-first
//
// This file works two ways:
//
//   1. Standalone: `iojs server.js` starts its own http server on PORT
//      (default 3000). Set BASE_PATH if it needs to answer requests that
//      arrive with a path prefix still attached, e.g.:
//        BASE_PATH=/drying iojs server.js
//
//   2. Mounted inside another process: the existing "dullas" iojs app
//      already bound to the public port for the whole site does:
//        var drying = require('/path/to/drying/server.js').createHandler('/drying');
//        // then, inside its own request listener, before its own routing:
//        if (req.url === '/drying' || req.url.indexOf('/drying/') === 0) {
//          return drying(req, res);
//        }
//      This is the setup actually used in production -- see
//      dullas/current/server.js's DRYING_SERVER_PATH block.

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var ROOT_DIR = __dirname;
var DATA_DIR = path.join(ROOT_DIR, 'data');
var HIGHSCORES_FILE = path.join(DATA_DIR, 'highscores.json');
var PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// Highscores are capped at 200 entries -- once a new score pushes past
// that, whatever falls off the bottom (sorted worst-last, see
// handlePostScore below) is just dropped. Unlike the standup game's
// lowscore.json archive, nothing here is precious enough to keep around
// once it's fallen out of the top 200.
var MAX_HIGHSCORES_STORED = 200;
var DEFAULT_HIGHSCORES_PAGE_SIZE = 20;
var MAX_HIGHSCORES_PAGE_SIZE = 100;

function mkdirIfMissing(dirPath) {
  try {
    fs.mkdirSync(dirPath);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}
mkdirIfMissing(DATA_DIR);

function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function isPlainNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

function sendJSON(res, statusCode, payload) {
  var body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, callback) {
  var data = '';
  var tooLarge = false;
  var done = false;

  function finish(err, body) {
    if (done) return;
    done = true;
    callback(err, body);
  }

  req.on('data', function (chunk) {
    if (tooLarge) return;
    data += chunk;
    if (data.length > 200000) {
      tooLarge = true;
      finish(new Error('Request body too large'));
      try { req.destroy(); } catch (e) { /* ignore */ }
    }
  });

  req.on('end', function () {
    if (tooLarge) return;
    if (!data) return finish(null, {});
    try {
      finish(null, JSON.parse(data));
    } catch (err) {
      finish(err);
    }
  });

  req.on('error', function (err) {
    finish(err);
  });
}

var CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  var relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  var filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  // Guard against path traversal outside of /public
  if (filePath.slice(0, PUBLIC_DIR.length) !== PUBLIC_DIR) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, function (err, content) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    var ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// Standardised HH:MM:SS formatter for a duration in ms -- matches the
// format used elsewhere on the site (e.g. dullas's formatHms()) so the
// leaderboard reads consistently across games.
function formatHms(ms) {
  var totalSeconds = Math.max(0, Math.round(ms / 1000));
  var hours = Math.floor(totalSeconds / 3600);
  var mins = Math.floor((totalSeconds % 3600) / 60);
  var secs = totalSeconds % 60;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return pad(hours) + ':' + pad(mins) + ':' + pad(secs);
}

function handleApi(req, res, pathname) {
  if (pathname === '/api/score' && req.method === 'POST') {
    readBody(req, function (err, body) {
      if (err) return sendJSON(res, 400, { error: 'Invalid request body' });
      if (!body || typeof body.playerId !== 'string' || !isPlainNumber(body.totalElapsedMs)) {
        return sendJSON(res, 400, { error: 'playerId (string) and totalElapsedMs (number) are required' });
      }

      var cleanName = (typeof body.name === 'string' ? body.name.trim() : '').slice(0, 24) || 'Anonymous';
      var entry = {
        playerId: body.playerId,
        name: cleanName,
        colorName: typeof body.colorName === 'string' ? body.colorName.slice(0, 24) : 'Unknown',
        coveragePercent: isPlainNumber(body.coveragePercent) ? Math.round(body.coveragePercent) : null,
        totalElapsedMs: Math.round(body.totalElapsedMs),
        watchedMs: isPlainNumber(body.watchedMs) ? Math.round(body.watchedMs) : null,
        awayMs: isPlainNumber(body.awayMs) ? Math.round(body.awayMs) : null,
        lookAwayCount: isPlainNumber(body.lookAwayCount) ? Math.round(body.lookAwayCount) : 0,
        submittedAt: new Date().toISOString()
      };

      var highscores = loadJSON(HIGHSCORES_FILE, []);
      highscores.push(entry);
      // Fastest total time (paint + watch the drying) first. This rewards
      // a thorough-but-quick paint job AND not looking away, since looking
      // away pauses the drying clock in game.js -- see WATCHING mechanic
      // there.
      highscores.sort(function (a, b) { return a.totalElapsedMs - b.totalElapsedMs; });
      if (highscores.length > MAX_HIGHSCORES_STORED) {
        highscores = highscores.slice(0, MAX_HIGHSCORES_STORED);
      }
      saveJSON(HIGHSCORES_FILE, highscores);

      sendJSON(res, 200, { ok: true, formattedTime: formatHms(entry.totalElapsedMs) });
    });
    return;
  }

  if (pathname === '/api/highscores' && req.method === 'GET') {
    var query = url.parse(req.url, true).query || {};

    var offset = parseInt(query.offset, 10);
    if (!isPlainNumber(offset) || offset < 0) offset = 0;

    var limit = parseInt(query.limit, 10);
    if (!isPlainNumber(limit) || limit <= 0) limit = DEFAULT_HIGHSCORES_PAGE_SIZE;
    if (limit > MAX_HIGHSCORES_PAGE_SIZE) limit = MAX_HIGHSCORES_PAGE_SIZE;

    var all = loadJSON(HIGHSCORES_FILE, []);
    var page = all.slice(offset, offset + limit);
    var ranked = [];
    for (var i = 0; i < page.length; i++) {
      var e = page[i];
      ranked.push({
        rank: offset + i + 1,
        name: e.name,
        colorName: e.colorName,
        coveragePercent: e.coveragePercent,
        totalElapsedMs: e.totalElapsedMs,
        formattedTime: formatHms(e.totalElapsedMs),
        lookAwayCount: e.lookAwayCount,
        submittedAt: e.submittedAt
      });
    }

    sendJSON(res, 200, {
      entries: ranked,
      total: all.length,
      offset: offset,
      limit: limit,
      hasMore: offset + page.length < all.length
    });
    return;
  }

  sendJSON(res, 404, { error: 'Not found' });
}

function createHandler(basePath) {
  basePath = (basePath || '').replace(/\/+$/, '');

  return function (req, res) {
    var parsed = url.parse(req.url);
    var pathname = parsed.pathname;

    if (basePath) {
      if (pathname === basePath) {
        // Missing trailing slash -- redirect so relative asset/API paths
        // on the page resolve under the base path, not the domain root.
        res.writeHead(302, { Location: basePath + '/' + (parsed.search || '') });
        return res.end();
      }
      if (pathname.indexOf(basePath + '/') === 0) {
        pathname = pathname.slice(basePath.length);
      } else {
        res.writeHead(404);
        return res.end('Not found');
      }
    }

    if (pathname.indexOf('/api/') === 0) {
      try {
        handleApi(req, res, pathname);
      } catch (err) {
        console.error(err);
        sendJSON(res, 500, { error: 'Internal server error' });
      }
      return;
    }

    if (req.method === 'GET') {
      serveStatic(req, res, pathname);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  };
}

exports.createHandler = createHandler;

// Only start our own standalone server when this file is run directly
// (`iojs server.js`), not when another process requires() it to mount our
// routes inside its own server.
if (require.main === module) {
  var PORT = process.env.PORT || 3000;
  var server = http.createServer(createHandler(process.env.BASE_PATH || ''));
  server.listen(PORT, function () {
    console.log('Watch the Drying is running at http://localhost:' + PORT);
  });
}
