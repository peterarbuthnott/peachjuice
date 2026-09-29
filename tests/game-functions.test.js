const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../nominate/public/gameEngine.js'), 'utf8');
const engineUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

test('Nomination Whist round sequence covers standard, miss, and final hands', async () => {
  const { getRoundInfo } = await import(engineUrl);
  assert.deepEqual(getRoundInfo(1), {
    roundNumber: 1, trumpSuit: 'clubs ♣', isRedSuit: false, suit: ' ♣', tricks: 1,
    isMiss: false, isBlind: false,
  });
  assert.equal(getRoundInfo(8).isMiss, true);
  assert.equal(getRoundInfo(8).tricks, 0);
  assert.equal(getRoundInfo(10).isBlind, true);
  assert.equal(getRoundInfo(18).tricks, 1);
});

test('Nomination Whist round scoring awards made bids and counts miss tricks as penalties', async () => {
  const { computeScoredPlayers } = await import(engineUrl);
  const player = (bid, won) => ({
    currentScore: 20, madeBids: 2,
    roundScores: { 3: { tricksNominated: bid, tricksWon: won, score: 0, madeBid: false } },
  });
  const exactBid = computeScoredPlayers([player(2, 2)], 3, false)[0];
  assert.equal(exactBid.roundScores[3].score, 12);
  assert.equal(exactBid.currentScore, 32);
  assert.equal(exactBid.madeBids, 3);
  const missedBid = computeScoredPlayers([player(2, 1)], 3, false)[0];
  assert.equal(missedBid.roundScores[3].score, 1);
  const missPlayer = { ...player(0, 2), roundScores: { 8: { tricksNominated: 0, tricksWon: 2, score: 0, madeBid: false } } };
  const missHand = computeScoredPlayers([missPlayer], 8, true)[0];
  assert.equal(missHand.roundScores[8].score, -6);
  assert.equal(missHand.currentScore, 14);
});

test('dealer rotation advances cyclically and repairs a missing dealer', async () => {
  const { shiftDealer } = await import(engineUrl);
  const players = [{ name: 'A', isDealer: true }, { name: 'B', isDealer: false }, { name: 'C', isDealer: false }];
  assert.deepEqual(shiftDealer(players).map(p => p.isDealer), [false, true, false]);
  assert.deepEqual(shiftDealer(players.slice(1)).map(p => p.isDealer), [true, false]);
});

test('new games initialize 18 empty rounds for every player', async () => {
  const { createNewGame } = await import(engineUrl);
  const game = createNewGame(4);
  assert.equal(game.players.length, 4);
  assert.equal(game.currentRound, 1);
  assert.equal(game.players.filter(p => p.isDealer).length, 1);
  assert.equal(Object.keys(game.players[0].roundScores).length, 18);
  assert.equal(game.players[0].roundScores[18].score, 0);
});

test('each game entry experience links to all four crawler-readable guide pages', () => {
  const pages = [
    '../dullas/index.html',
    '../nominate/public/index.html',
    '../standup/public/index.html',
    '../drying/public/index.html',
  ];
  for (const relative of pages) {
    const html = fs.readFileSync(path.join(__dirname, relative), 'utf8');
    // Nominate renders its home navigation from view templates after startup;
    // its static index is only the app mount point.
    const renderedViews = relative.includes('nominate/public/index.html')
      ? ['../nominate/public/views/home.js', '../nominate/public/views/legends.js']
          .map(view => fs.readFileSync(path.join(__dirname, view), 'utf8'))
          .join('\n')
      : '';
    const navigationSource = html + '\n' + renderedViews;
    for (const page of ['about.html', 'hints.html', 'highscores-info.html', 'ideas.html']) {
      assert.match(navigationSource, new RegExp(`href="${page}"`), `${relative} should link to ${page}`);
      const guidePath = path.join(__dirname, relative.replace(/(?:index\.html)$/, page));
      assert.ok(fs.existsSync(guidePath), `${guidePath} should exist`);
    }
  }
});

test('Dullas ad slots reserve 150 px from the active play area', () => {
  const css = fs.readFileSync(path.join(__dirname, '../dullas/style.css'), 'utf8');
  assert.match(css, /\.skyscraper-ad:first-child\s*\{\s*margin-right:\s*150px/);
  assert.match(css, /\.skyscraper-ad:last-child\s*\{\s*margin-left:\s*150px/);
  assert.match(css, /\.medium-rectangle-ad[\s\S]*?margin:\s*150px\s+auto/);
});

test('the live static roots expose a sitemap and select built minified assets when present', () => {
  const sitemap = fs.readFileSync(path.join(__dirname, '../dullas/sitemap.xml'), 'utf8');
  const robots = fs.readFileSync(path.join(__dirname, '../dullas/robots.txt'), 'utf8');
  assert.match(robots, /Sitemap:\s*https:\/\/www\.andisdad\.net\/sitemap\.xml/);
  const dullasServer = fs.readFileSync(path.join(__dirname, '../dullas/server.js'), 'utf8');
  assert.match(dullasServer, /'\.xml':\s*'application\/xml; charset=utf-8'/);
  for (const game of ['dullas', 'nominate/public', 'standup/public', 'drying/public']) {
    for (const page of ['about.html', 'hints.html', 'highscores-info.html', 'ideas.html']) {
      const url = game === 'dullas' ? `https://www.andisdad.net/${page}` : `https://www.andisdad.net/${game.split('/')[0]}/${page}`;
      assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${url} should be in the sitemap`);
    }
  }
  for (const file of ['../dullas/server.js', '../nominate/server.js', '../standup/server.js', '../drying/server.js']) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.match(source, /fs\.existsSync\(minFilePath\)/, `${file} should select a built sidecar`);
  }
});
