// Generate side-by-side minified deployable assets. Originals stay editable
// and are never overwritten. Run only via `npm run build`, which runs tests first.
const fs = require('node:fs');
const path = require('node:path');
const { minify: minifyJs } = require('terser');
const minifyHtml = require('html-minifier-terser').minify;
const CleanCSS = require('clean-css');

const root = path.resolve(__dirname, '..');
const gameRoots = ['dullas/current', 'nominate', 'standup', 'drying'];
const skipDirs = new Set(['node_modules', 'data', 'versions', 'OLDER', '.git']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(?:js|html|css)$/i.test(entry.name) && !/\.min\.(?:js|html|css)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

(async () => {
  let count = 0;
  for (const gameRoot of gameRoots) {
    for (const file of walk(path.join(root, gameRoot))) {
      const ext = path.extname(file).toLowerCase();
      let output;
      if (ext === '.js') {
        output = (await minifyJs(fs.readFileSync(file, 'utf8'), { compress: true, mangle: true })).code;
        // ESM imports must follow the sidecars too (notably Nominate's view modules).
        output = output.replace(/(['"])(\.{1,2}\/[^'"]+)\.js\1/g, '$1$2.min.js$1');
      }
      else if (ext === '.css') output = new CleanCSS({ level: 2 }).minify(fs.readFileSync(file, 'utf8')).styles;
      else {
        let html = fs.readFileSync(file, 'utf8');
        html = html.replace(/\b(href|src)=(['"])([^'"]+)\2/gi, (whole, attribute, quote, value) => {
          if (/^(?:[a-z]+:|\/\/|\/|#)/i.test(value)) return whole;
          const rewritten = value.replace(/\.(js|css)(?=\?|$)/i, '.min.$1');
          return `${attribute}=${quote}${rewritten}${quote}`;
        });
        output = await minifyHtml(html, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
        removeAttributeQuotes: false,
      });
      }
      fs.writeFileSync(file.slice(0, -ext.length) + '.min' + ext, output + '\n');
      count++;
    }
  }
  console.log(`Created ${count} minified sidecar files; original sources were preserved.`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
