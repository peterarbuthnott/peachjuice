// Plain-JS port of src/components/HomeView.tsx. No React: this module
// keeps its own local state in a closure and re-renders its own markup
// into `container` whenever that state changes (tab switches, async data
// loads, toast messages, the delete/wipe confirm flow).

import { fetchRecentGamesFromCloud, fetchSavedPlayersFromCloud, deleteGameFromCloud, clearAllDatabaseDocs } from '../api.js';
import { icon } from '../icons.js';

// Set to true to bring back the "Remove All App Data" wipe control on the
// home screen. Left in place (rather than deleted) so it's a one-line
// change to restore later - the wipe logic itself (renderDangerZone,
// btn-wipe-* listeners, clearAllDatabaseDocs call) is untouched below.
const SHOW_DANGER_ZONE = false;

export function renderHomeView(container, { onStartNewGame, onResumeGame }) {
  const state = {
    numPlayers: 4,
    recentGames: [],
    savedPlayers: [],
    loading: true,
    activeTab: 'new', // 'new' | 'resume' | 'players'
    toastMessage: null,
    confirmingWipe: false,
  };
  let toastTimer = null;

  function setToast(message) {
    state.toastMessage = message;
    render();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.toastMessage = null;
      render();
    }, 4000);
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderNewTab() {
    return `
      <div class="fade-in-up">
        <div class="card new-game-card">
          <h3 class="section-title">${icon('plus-circle')} Configure Game Session</h3>
          <label>Nominee Selection: How many players? (2 to 8)</label>
          <div class="player-count-grid">
            ${[2,3,4,5,6,7,8].map(num => `
              <button type="button" class="player-count-btn ${state.numPlayers === num ? 'active' : ''}" data-num="${num}">${num}</button>
            `).join('')}
          </div>
          <div class="hint-box">
            ${icon('users')}
            <span>Players take turns dealing. Nomination Whist has 18 rounds. Sum of bids cannot equal total tricks for the round to guarantee high drama!</span>
          </div>
        </div>
        <button id="btn-start-game" class="btn btn-gold" style="width:100%;margin-bottom:16px;">
          ${icon('play')} Initialize Scoring Card
        </button>
      </div>
    `;
  }

  function renderResumeTab() {
    const activeGames = state.recentGames.filter(g => g.status !== 'completed');
    let body;
    if (state.loading) {
      body = `<div class="loading-inline"><div class="loading-spinner spin" style="border-color:transparent;border-top-color:var(--gold);"></div><p>Loading telemetry...</p></div>`;
    } else if (activeGames.length === 0) {
      body = `
        <div class="empty-state">
          ${icon('calendar')}
          <div class="title">No active games in progress</div>
          <p class="desc">Start a game of Whist and it will instantly save to local JSON storage for you to resume later.</p>
        </div>
      `;
    } else {
      body = `
        <div class="list-scroll custom-scrollbar">
          ${activeGames.map(game => `
            <div class="game-row" data-resume="${game.id}">
              <div class="flex-1" style="flex:1;padding-right:8px;min-width:0;">
                <div class="meta">
                  <span class="round-badge">Round ${game.currentRound}/18</span>
                  <span class="date">${fmtDate(game.updatedAt)}</span>
                </div>
                <div class="names">${game.players.map(p => p.name).join(', ')}</div>
              </div>
              <button class="delete-btn" data-delete="${game.id}" title="Delete log">${icon('trash')}</button>
            </div>
          `).join('')}
        </div>
      `;
    }
    return `
      <div class="fade-in-up">
        <h3 class="section-title">${icon('history')} Durable Game Records</h3>
        ${body}
      </div>
    `;
  }

  function renderPlayersTab() {
    let body;
    if (state.loading) {
      body = `<div class="loading-inline"><div class="loading-spinner spin"></div><p>Loading telemetry...</p></div>`;
    } else if (state.savedPlayers.length === 0) {
      body = `
        <div class="empty-state">
          ${icon('users')}
          <div class="title">No profiles loaded</div>
          <p class="desc">Player statistics are created automatically when names are entered and games finish.</p>
        </div>
      `;
    } else {
      body = `
        <div class="list-scroll custom-scrollbar">
          ${state.savedPlayers.map((profile, i) => `
            <div class="player-row">
              <div class="left">
                <div class="player-rank">#${i + 1}</div>
                <div>
                  <div class="name">${profile.name} ${i === 0 ? icon('crown') : ''}</div>
                  <div class="stats">Played ${profile.gamesPlayed} • Win Rate ${Math.round((profile.gamesWon / profile.gamesPlayed) * 100)}%</div>
                </div>
              </div>
              <div class="right">
                <div class="score">${profile.totalScore} pts</div>
                <div class="bids">${profile.totalBidsMade} bids won</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
    return `
      <div class="fade-in-up">
        <h3 class="section-title">${icon('crown')} Player Profiles Leaderboard</h3>
        ${body}
        <a href="legends.html" class="btn-outline" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:12px;text-decoration:none;box-sizing:border-box;">${icon('trophy')} View Full Legends Page</a>
      </div>
    `;
  }

  function renderDangerZone() {
    if (!state.confirmingWipe) {
      return `
        <div class="danger-zone-row">
          <span class="label">Database Settings</span>
          <button id="btn-wipe-open" class="btn-danger-outline">${icon('trash')} Remove All App Data</button>
        </div>
      `;
    }
    return `
      <div class="danger-confirm">
        <div class="warning">
          ${icon('alert-triangle')}
          <p><b>WARNING:</b> This will permanently delete all saved games, scores, and player statistics from the local JSON files. This cannot be undone.</p>
        </div>
        <div class="actions">
          <button id="btn-wipe-cancel" class="btn-outline" style="height:auto;padding:5px 10px;font-size:9px;">Cancel</button>
          <button id="btn-wipe-confirm" class="btn-danger-solid">Wipe Everything</button>
        </div>
      </div>
    `;
  }

  function render() {
    const activeCount = state.recentGames.filter(g => g.status !== 'completed').length;
    container.innerHTML = `
      <div class="screen">
        <header class="home-header">
          <div>
            <h1>Nominate</h1>
            <p class="subtitle">Whist Scoring</p>
          </div>
          <div class="status">
            <div class="status-row"><span class="dot dot-green pulse"></span> SYNC ACTIVE</div>
            <p class="version">v1.0.4 Protocol</p>
          </div>
        </header>

        <a href="https://www.andisdad.net/" class="site-exit-link">${icon('home')} Leave Nominate — back to andisdad.net</a>

        <div class="info-grid">
          <div class="info-cell">
            <div class="label">Local State</div>
            <div class="value"><span class="dot-emerald"></span> Synchronized</div>
          </div>
          <div class="info-cell">
            <div class="label">Players Tracked</div>
            <div class="value plain">${state.savedPlayers.length} profiles</div>
          </div>
        </div>

        <div class="tabs">
          <button class="tab ${state.activeTab === 'new' ? 'active' : ''}" data-tab="new">${icon('plus-circle')} New Game</button>
          <button class="tab ${state.activeTab === 'resume' ? 'active' : ''}" data-tab="resume">${icon('history')} Resume ${activeCount > 0 ? `<span class="dot" style="width:6px;height:6px;background:var(--gold);border-radius:999px;" class="ping"></span>` : ''}</button>
          <button class="tab ${state.activeTab === 'players' ? 'active' : ''}" data-tab="players">${icon('trophy')} Legends</button>
        </div>

        <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;">
          ${state.activeTab === 'new' ? renderNewTab() : state.activeTab === 'resume' ? renderResumeTab() : renderPlayersTab()}
        </div>

        ${SHOW_DANGER_ZONE ? `
        <div class="danger-zone">
          ${renderDangerZone()}
        </div>
        ` : ''}
      </div>

      ${state.toastMessage ? `
        <div class="toast fade-in-up">
          <span class="dot ping"></span>
          <span>${state.toastMessage}</span>
        </div>
      ` : ''}
    `;

    attachListeners();
  }

  function attachListeners() {
    container.querySelectorAll('[data-num]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.numPlayers = parseInt(btn.dataset.num, 10);
        render();
      });
    });

    const startBtn = container.querySelector('#btn-start-game');
    if (startBtn) startBtn.addEventListener('click', () => onStartNewGame(state.numPlayers));

    container.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.dataset.tab;
        render();
      });
    });

    container.querySelectorAll('[data-resume]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete]')) return;
        const game = state.recentGames.find(g => g.id === row.dataset.resume);
        if (game) onResumeGame(game);
      });
    });

    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gameId = btn.dataset.delete;
        if (confirm('Are you sure you want to delete this game record?')) {
          await deleteGameFromCloud(gameId);
          state.recentGames = state.recentGames.filter(g => g.id !== gameId);
          render();
          setToast('Game record deleted.');
        }
      });
    });

    const wipeOpen = container.querySelector('#btn-wipe-open');
    if (wipeOpen) wipeOpen.addEventListener('click', () => { state.confirmingWipe = true; render(); });

    const wipeCancel = container.querySelector('#btn-wipe-cancel');
    if (wipeCancel) wipeCancel.addEventListener('click', () => { state.confirmingWipe = false; render(); });

    const wipeConfirm = container.querySelector('#btn-wipe-confirm');
    if (wipeConfirm) wipeConfirm.addEventListener('click', async () => {
      try {
        state.loading = true;
        render();
        await clearAllDatabaseDocs();
        localStorage.clear();
        state.recentGames = [];
        state.savedPlayers = [];
        state.confirmingWipe = false;
        setToast('All app data completely removed.');
      } catch (err) {
        setToast('Error wiping data: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        state.loading = false;
        render();
      }
    });
  }

  render();

  Promise.all([fetchRecentGamesFromCloud(10), fetchSavedPlayersFromCloud()]).then(([games, players]) => {
    state.recentGames = games || [];
    state.savedPlayers = [...(players || [])].sort((a, b) => b.gamesWon - a.gamesWon);
    state.loading = false;
    render();
  });
}
