// Standalone leaderboard page — public/legends.html's entry script.
//
// Same idea as the dullas/standup highscores page: a page of its own
// (not just a tab buried inside the game), loading the leaderboard 20
// rows at a time with a "Load More" button, backed by the same
// offset/limit pagination server.js's /api/players route added for this.

import { fetchLeaderboardPage } from '../api.js';
import { icon } from '../icons.js';

const PAGE_SIZE = 20;

export function renderLegendsView(container) {
  const state = {
    entries: [],
    total: 0,
    offset: 0,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: null,
  };

  function winRate(p) {
    if (!p.gamesPlayed) return 0;
    return Math.round((p.gamesWon / p.gamesPlayed) * 100);
  }

  function render() {
    let body;
    if (state.loading) {
      body = `<div class="loading-inline"><div class="loading-spinner spin"></div><p>Loading legends...</p></div>`;
    } else if (state.error) {
      body = `
        <div class="empty-state">
          ${icon('alert-triangle')}
          <div class="title">Couldn't load the leaderboard</div>
          <p class="desc">${state.error}</p>
        </div>
      `;
    } else if (state.entries.length === 0) {
      body = `
        <div class="empty-state">
          ${icon('users')}
          <div class="title">No legends yet</div>
          <p class="desc">Player statistics are created automatically when names are entered and games finish.</p>
        </div>
      `;
    } else {
      body = `
        <div class="list-scroll custom-scrollbar" style="max-height:none;">
          ${state.entries.map((profile, i) => `
            <div class="player-row">
              <div class="left">
                <div class="player-rank">#${i + 1}</div>
                <div>
                  <div class="name">${profile.name} ${i === 0 ? icon('crown') : ''}</div>
                  <div class="stats">Played ${profile.gamesPlayed} • Win Rate ${winRate(profile)}%</div>
                </div>
              </div>
              <div class="right">
                <div class="score">${profile.totalScore} pts</div>
                <div class="bids">${profile.totalBidsMade} bids won</div>
              </div>
            </div>
          `).join('')}
        </div>
        ${state.hasMore ? `
          <button id="btn-load-more" class="btn-outline" style="width:100%;margin-top:12px;" ${state.loadingMore ? 'disabled' : ''}>
            ${state.loadingMore ? 'Loading…' : `Load 20 More (${state.entries.length} of ${state.total})`}
          </button>
        ` : (state.entries.length > 0 ? `<p style="text-align:center;font-size:9px;color:var(--text-30);font-family:var(--font-mono);margin-top:12px;">— end of the leaderboard (${state.total} legends) —</p>` : '')}
      `;
    }

    container.innerHTML = `
      <div class="screen">
        <header class="home-header">
          <div>
            <a href="." class="btn-plain" style="display:inline-block;margin-bottom:8px;">← Back to Nominate</a>
            <h1 style="font-size:30px;">Legends</h1>
            <p class="subtitle">All-Time Leaderboard</p>
          </div>
        </header>

        <a href="https://www.andisdad.net/" class="site-exit-link">${icon('home')} Leave Nominate — back to andisdad.net</a>

        <h3 class="section-title">${icon('trophy')} Ranked by Wins, then Score</h3>

        ${body}
      </div>
    `;

    attachListeners();
  }

  function attachListeners() {
    const loadMoreBtn = container.querySelector('#btn-load-more');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMore);
  }

  async function loadPage(offset) {
    const page = await fetchLeaderboardPage(offset, PAGE_SIZE);
    return page;
  }

  async function loadMore() {
    state.loadingMore = true;
    render();
    try {
      const page = await loadPage(state.offset + PAGE_SIZE);
      state.entries = state.entries.concat(page.entries || []);
      state.total = page.total || 0;
      state.offset = page.offset || (state.offset + PAGE_SIZE);
      state.hasMore = !!page.hasMore;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
    } finally {
      state.loadingMore = false;
      render();
    }
  }

  render();

  loadPage(0)
    .then((page) => {
      state.entries = page.entries || [];
      state.total = page.total || 0;
      state.offset = page.offset || 0;
      state.hasMore = !!page.hasMore;
      state.loading = false;
      render();
    })
    .catch((err) => {
      state.error = err instanceof Error ? err.message : String(err);
      state.loading = false;
      render();
    });
}

// legends.html loads this file directly (it's not mounted by app.js like
// the other views are), so bootstrap itself here.
renderLegendsView(document.getElementById('app'));
