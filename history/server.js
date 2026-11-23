// Static history timeline service, mounted by the Dullas server at /history.
// Kept in ES5 style to match the legacy Raspberry Pi runtime used by the site.
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var ROOT_DIR = __dirname;
var PUBLIC_DIR = path.join(ROOT_DIR, 'public');
var CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function serveStatic(req, res, pathname) {
  try { pathname = decodeURIComponent(pathname); } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }
  var relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  var filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));
  var relativeToPublic = path.relative(PUBLIC_DIR, filePath);
  if (relativeToPublic === '..' || relativeToPublic.indexOf('..' + path.sep) === 0 || path.isAbsolute(relativeToPublic)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  var ext = path.extname(filePath).toLowerCase();
  var minFilePath = filePath.slice(0, -ext.length) + '.min' + ext;
  if ((ext === '.html' || ext === '.js' || ext === '.css') && fs.existsSync(minFilePath)) filePath = minFilePath;

  fs.readFile(filePath, function (err, content) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    var servedExt = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[servedExt] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
}

function createHandler(basePath) {
  basePath = (basePath || '').replace(/\/+$/, '');
  return function (req, res) {
    var parsed = url.parse(req.url);
    var pathname = parsed.pathname;
    if (basePath) {
      if (pathname === basePath) {
        res.writeHead(302, { Location: basePath + '/' + (parsed.search || '') });
        return res.end();
      }
      if (pathname.indexOf(basePath + '/') === 0) pathname = pathname.slice(basePath.length);
      else {
        res.writeHead(404);
        return res.end('Not found');
      }
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
    res.writeHead(404);
    res.end('Not found');
  };
}

exports.createHandler = createHandler;

if (require.main === module) {
  var PORT = process.env.PORT || 3002;
  var server = http.createServer(createHandler(process.env.BASE_PATH || ''));
  server.listen(PORT, function () {
    console.log('The history timeline is running at http://localhost:' + PORT);
  });
}
