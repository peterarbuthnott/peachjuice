// App controller — plain-JS replacement for src/App.tsx.
//
// There's no React here: this module owns the one piece of persisted
// state (the current GameState, or null when we're on the Home screen)
// and swaps the contents of #app between the four "views" exactly like
// the original component switched between <HomeView>/<NamingView>/
// <ScoringView>/<ResultsView> based on gameState.status.

import { createNewGame } from './gameEngine.js';
import { saveGameToCloud, pingServer } from './api.js';
import { renderHomeView } from './views/home.js';
import { renderNamingView } from './views/naming.js';
import { renderScoringView } from './views/scoring.js';
import { renderResultsView } from './views/results.js';

const root = document.getElementById('app');

let currentGame = null;

function showLoading() {
  root.innerHTML = `
    <div class="loading-screen">
      <div class="loading-spinner spin"></div>
      <h2>Nominate</h2>
      <p>Establishing secure protocol...</p>
    </div>
  `;
}

function showLoadingError(message) {
  root.innerHTML = `
    <div class="loading-screen">
      <h2>Nominate</h2>
      <p style="color:#fb7185;text-transform:none;letter-spacing:normal;">${message}</p>
      <p style="margin-top:8px;">Check that the JSON-file server (npm run server / node server.js) is running, then reload.</p>
    </div>
  `;
}

function showHome() {
  currentGame = null;
  root.innerHTML = '';
  renderHomeView(root, {
    onStartNewGame: handleStartNewGame,
    onResumeGame: handleResumeGame,
  });
}

function showNaming(game) {
  root.innerHTML = '';
  renderNamingView(root, game, {
    onConfirmNames: handleConfirmNames,
    onBackToHome: showHome,
  });
}

function showScoring(game) {
  root.innerHTML = '';
  renderScoringView(root, game, {
    onUpdateGame: handleUpdateGame,
    onExitToHome: showHome,
  });
}

function showResults(game) {
  root.innerHTML = '';
  renderResultsView(root, game, {
    onRestart: showHome,
  });
}

function showByStatus(game) {
  if (!game) return showHome();
  if (game.status === 'setup_names') return showNaming(game);
  if (game.status === 'scoring') return showScoring(game);
  if (game.status === 'completed') return showResults(game);
  return showHome();
}

function handleStartNewGame(numPlayers) {
  const game = createNewGame(numPlayers);
  game.status = 'setup_names';
  currentGame = game;
  showNaming(game);
}

function handleConfirmNames(names) {
  if (!currentGame) return;

  const updatedPlayers = currentGame.players.map((p, idx) => ({
    ...p,
    name: names[idx] || p.name,
  }));

  currentGame = {
    ...currentGame,
    status: 'scoring',
    players: updatedPlayers,
    updatedAt: new Date().toISOString(),
  };

  saveGameToCloud(currentGame);
  showScoring(currentGame);
}

function handleUpdateGame(game) {
  currentGame = game;
  // Scoring already awaits/alerts on its own saveGameToCloud call for this
  // same game object - this second save is a harmless-but-redundant belt
  // and suspenders. Still needs a .catch of its own though, or a failure
  // here becomes an unhandled promise rejection instead of just a
  // console message.
  saveGameToCloud(game).catch((err) => console.error('Failed to save game (app.js):', err));
  showByStatus(game);
}

function handleResumeGame(game) {
  currentGame = game;
  showByStatus(game);
}

// bootstrap: same idea as the old Firebase anonymous-auth handshake in
// App.tsx, just checking the local server is reachable before letting the
// player into the app.
showLoading();
pingServer()
  .then((ok) => {
    if (!ok) {
      showLoadingError('Could not reach the local Nominate server.');
      return;
    }
    showHome();
  })
  .catch((err) => {
    showLoadingError(err instanceof Error ? err.message : String(err));
  });
