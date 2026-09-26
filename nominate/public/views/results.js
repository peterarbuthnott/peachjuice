// Plain-JS port of src/components/ResultsView.tsx.

import { recordGameResultsForPlayers } from '../api.js';
import { icon } from '../icons.js';

export function renderResultsView(container, gameState, { onRestart }) {
  const scoreboard = [...gameState.players].sort((a, b) => b.currentScore - a.currentScore);
  const winner = scoreboard[0];

  const state = {
    syncedCloudStatus: 'idle', // idle | syncing | synced | failed
  };

  function render() {
    container.innerHTML = `
      <div class="screen" style="justify-content:space-between;">
        <div>
          <div class="results-hero">
            <div class="badge bounce">${icon('trophy')}</div>
            <h2>Grand Finale</h2>
            <p>18 rounds scoring complete</p>
          </div>

          <div class="podium">
            ${scoreboard[1] ? `
              <div class="podium-slot second">
                <div class="pname">${scoreboard[1].name}</div>
                <div class="pscore">${scoreboard[1].currentScore} pts</div>
                <div class="bar"><span>2</span></div>
              </div>
            ` : ''}
            ${scoreboard[0] ? `
              <div class="podium-slot first">
                ${icon('crown')}
                <div class="pname">${scoreboard[0].name}</div>
                <div class="pscore">${scoreboard[0].currentScore} pts</div>
                <div class="bar"><span>1</span></div>
              </div>
            ` : ''}
            ${scoreboard[2] ? `
              <div class="podium-slot third">
                <div class="pname">${scoreboard[2].name}</div>
                <div class="pscore">${scoreboard[2].currentScore} pts</div>
                <div class="bar"><span>3</span></div>
              </div>
            ` : ''}
          </div>

          <div class="sync-status">
            ${state.syncedCloudStatus === 'syncing'
              ? `<span class="syncing">Saving totals to local storage...</span>`
              : state.syncedCloudStatus === 'synced'
                ? `<span class="synced">✓ Scores Logged to Global Leaderboard</span>`
                : state.syncedCloudStatus === 'failed'
                  ? `<span class="failed">Local server offline, scores saved locally</span>`
                  : ''}
          </div>

          <div class="performance-card">
            <h3 class="section-title">${icon('activity')} Performance</h3>
            <div class="performance-list">
              ${scoreboard.map((p, idx) => `
                <div class="performance-row">
                  <div class="left">
                    <span class="rank">#${idx + 1}</span>
                    <span class="name">${p.name}</span>
                  </div>
                  <div class="right">
                    <span class="bids">Bids Hit: <b>${p.madeBids}/18</b></span>
                    <div class="score">
                      <span class="num">${p.currentScore}</span>
                      <span class="lbl">points</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="results-actions">
          <button id="btn-share" class="btn-outline" style="width:100%;">${icon('share')} Share Match Summary</button>
          <button id="btn-restart" class="btn btn-gold" style="width:100%;">${icon('home')} Back to Start Screen</button>
        </div>
      </div>
    `;
    attachListeners();
  }

  function handleShare() {
    const trophyPodium = scoreboard
      .map((p, idx) => `${idx + 1}. ${p.name} - ${p.currentScore} pts (bids: ${p.madeBids}/18)`)
      .join('\n');
    const shareText = `🏆 Nominate Scoring App Result!\n\nWinner: ${winner?.name} with ${winner?.currentScore} points!\n\nFinal Standings:\n${trophyPodium}\n\nPlayed on Nominate Whist scoring App.`;

    navigator.clipboard.writeText(shareText);
    alert('📋 Results copied to clipboard! You can paste and share with friends.');
  }

  function attachListeners() {
    container.querySelector('#btn-share').addEventListener('click', handleShare);
    container.querySelector('#btn-restart').addEventListener('click', onRestart);
  }

  render();

  // Automatically save endgame records to the players data file.
  state.syncedCloudStatus = 'syncing';
  render();
  const payload = gameState.players.map((p) => ({
    name: p.name,
    score: p.currentScore,
    won: p.name === winner.name,
    bidsMade: p.madeBids,
  }));
  recordGameResultsForPlayers(payload)
    .then(() => { state.syncedCloudStatus = 'synced'; render(); })
    .catch((e) => { console.error(e); state.syncedCloudStatus = 'failed'; render(); });
}
