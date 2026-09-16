// The Standup Memory Game -- server
//
// Targets io.js 1.5.1 (V8 4.1, ~Node 0.12 era) on a Raspberry Pi, so this
// file is written in plain ES5 on purpose:
//   - var, not let/const
//   - function expressions, not arrow functions
//   - string concatenation, not template literals
//   - callbacks, not Promises / async-await
//   - plain objects/arrays instead of Map/Set
//   - legacy require('url').parse(), not the global URL class
//   - manual loops instead of Array.prototype.find (ES6, not in V8 4.1)
// Only core modules are used (http, fs, path, crypto, url) -- no npm
// install needed, so `iojs server.js` (or `node server.js` on newer
// runtimes) is all it takes to run it.
//
// Responsibilities:
//   - Serve the static front end from /public
//   - Hand out questions WITHOUT the correct answer (so the client can't cheat)
//   - Score answers server-side, keyed by an in-memory session
//   - Persist final scores to data/highscores.json and serve the leaderboard

var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var url = require('url');

// This file works two ways:
//
//   1. Standalone: `iojs server.js` starts its own http server on PORT
//      (default 3000). Set BASE_PATH if it needs to answer requests that
//      arrive with a path prefix still attached, e.g.:
//        BASE_PATH=/standup iojs server.js
//
//   2. Mounted inside another process: some other server (e.g. the existing
//      "dullas" iojs app already bound to the public port) can do:
//        var standup = require('/path/to/standup/server.js').createHandler('/standup');
//        // then, inside its own request listener, before its own routing:
//        if (req.url === '/standup' || req.url.indexOf('/standup/') === 0) {
//          return standup(req, res);
//        }
//      This is the setup to use when one iojs process already owns the
//      public port for the whole site and just needs to hand off "/standup"
//      requests to this game.

var ROOT_DIR = __dirname;
var DATA_DIR = path.join(ROOT_DIR, 'data');
var QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
var HIGHSCORES_FILE = path.join(DATA_DIR, 'highscores.json');
var LOWSCORE_FILE = path.join(DATA_DIR, 'lowscore.json');
var PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// The highscores file is capped at 100 entries. Whenever a new score pushes
// it over that cap, whatever falls off the bottom is archived into
// lowscore.json rather than deleted outright, in case it's wanted again
// later (or for someone to manually prune that file on a schedule).
var MAX_HIGHSCORES_STORED = 100;
var DEFAULT_HIGHSCORES_PAGE_SIZE = 20;
var MAX_HIGHSCORES_PAGE_SIZE = 100;

// sessionId -> { score: number, answered: { questionId: true }, answeredCount: number }
var sessions = {};

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

function makeSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

function isPlainInteger(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
}

function findQuestionById(questions, id) {
  for (var i = 0; i < questions.length; i++) {
    if (questions[i].id === id) return questions[i];
  }
  return null;
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
    if (data.length > 1e6) {
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
  '.css': 'text/css; charset=utf-8'
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

function publicQuestion(q) {
  // Strip correctIndex before it ever reaches the client
  return { id: q.id, source: q.source, question: q.question, choices: q.choices };
}

function handleApi(req, res, pathname) {
  if (pathname === '/api/session/start' && req.method === 'POST') {
    var sessionId = makeSessionId();
    sessions[sessionId] = { score: 0, answered: {}, answeredCount: 0 };
    sendJSON(res, 200, { sessionId: sessionId });
    return;
  }

  if (pathname === '/api/questions' && req.method === 'GET') {
    var questions = loadJSON(QUESTIONS_FILE, []);
    var safeQuestions = [];
    for (var i = 0; i < questions.length; i++) {
      safeQuestions.push(publicQuestion(questions[i]));
    }
    sendJSON(res, 200, safeQuestions);
    return;
  }

  if (pathname === '/api/answer' && req.method === 'POST') {
    readBody(req, function (err, body) {
      if (err) return sendJSON(res, 400, { error: 'Invalid request body' });

      var sessionId = body.sessionId;
      var questionId = body.questionId;
      var choiceIndex = body.choiceIndex;
      var session = sessions[sessionId];

      if (!session) {
        return sendJSON(res, 400, { error: 'Unknown or expired session. Start a new game.' });
      }
      if (session.answered[questionId]) {
        return sendJSON(res, 400, { error: 'That question was already answered this game.' });
      }

      var allQuestions = loadJSON(QUESTIONS_FILE, []);
      var q = findQuestionById(allQuestions, questionId);
      if (!q) {
        return sendJSON(res, 404, { error: 'Unknown question.' });
      }

      var correct = isPlainInteger(choiceIndex) && choiceIndex === q.correctIndex;
      session.answered[questionId] = true;
      session.answeredCount += 1;
      if (correct) session.score += 1;

      sendJSON(res, 200, {
        correct: correct,
        correctIndex: q.correctIndex,
        explanation: q.explanation || '',
        score: session.score,
        totalAnswered: session.answeredCount
      });
    });
    return;
  }

  if (pathname === '/api/score' && req.method === 'POST') {
    readBody(req, function (err, body) {
      if (err) return sendJSON(res, 400, { error: 'Invalid request body' });

      var sessionId = body.sessionId;
      var name = body.name;
      var session = sessions[sessionId];

      if (!session) {
        return sendJSON(res, 400, { error: 'Unknown or expired session. Start a new game.' });
      }

      var cleanName = (typeof name === 'string' ? name.trim() : '').slice(0, 30) || 'Anonymous';
      var highscores = loadJSON(HIGHSCORES_FILE, []);
      highscores.push({
        name: cleanName,
        score: session.score,
        totalAnswered: session.answeredCount,
        date: new Date().toISOString()
      });
      highscores.sort(function (a, b) { return b.score - a.score; });

      if (highscores.length > MAX_HIGHSCORES_STORED) {
        var overflow = highscores.slice(MAX_HIGHSCORES_STORED);
        highscores = highscores.slice(0, MAX_HIGHSCORES_STORED);

        var lowscores = loadJSON(LOWSCORE_FILE, []);
        lowscores = lowscores.concat(overflow);
        saveJSON(LOWSCORE_FILE, lowscores);
      }

      saveJSON(HIGHSCORES_FILE, highscores);

      delete sessions[sessionId];
      sendJSON(res, 200, { saved: true });
    });
    return;
  }

  if (pathname === '/api/highscores' && req.method === 'GET') {
    var query = url.parse(req.url, true).query || {};

    var offset = parseInt(query.offset, 10);
    if (!isPlainInteger(offset) || offset < 0) offset = 0;

    var limit = parseInt(query.limit, 10);
    if (!isPlainInteger(limit) || limit <= 0) limit = DEFAULT_HIGHSCORES_PAGE_SIZE;
    if (limit > MAX_HIGHSCORES_PAGE_SIZE) limit = MAX_HIGHSCORES_PAGE_SIZE;

    var allHighscores = loadJSON(HIGHSCORES_FILE, []);
    var page = allHighscores.slice(offset, offset + limit);

    sendJSON(res, 200, {
      entries: page,
      total: allHighscores.length,
      offset: offset,
      limit: limit,
      hasMore: offset + page.length < allHighscores.length
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
    console.log('The Standup Memory Game is running at http://localhost:' + PORT);
  });
}
