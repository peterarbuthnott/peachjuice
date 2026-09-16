// Plain-JS port of src/components/ScoringView.tsx. This is the most
// stateful view (bid/won selectors, mobile layout switch, the two-stage
// bidding -> tricking flow) so it leans a bit more on local mutable state
// than the others, same as the original did with useState.
//
// Note on lifecycle: app.js fully remounts this view (root.innerHTML = ''
// + a fresh renderScoringView call) every time the round or stage
// advances, because that comes from a brand new GameState object flowing
// back through onUpdateGame. That naturally reproduces the original's
// `useEffect([currentRound, roundState, gameState])` reset — bids/won
// local state is (re)initialized once per mount, from the fresh
// gameState, exactly like the effect did.

import { getRoundInfo, computeScoredPlayers, shiftDealer } from '../gameEngine.js';
import { saveGameToCloud } from '../api.js';
import { icon } from '../icons.js';

export function renderScoringView(container, gameState, { onUpdateGame, onExitToHome }) {
  const currentRound = gameState.currentRound;
  const roundState = gameState.roundState; // 0 = bidding stage, 1 = won-tricks stage
  const roundInfo = getRoundInfo(currentRound);

  const state = {
    bids: {},
    won: {},
    errorText: null,
    selectedPlayerName: '',
    isMobile: false,
    mobileShowResults: false,
  };

  // --- one-time init (mirrors the old effect keyed on [currentRound, roundState, gameState]) ---
  gameState.players.forEach((p) => {
    const prs = p.roundScores[currentRound];
    if (prs) {
      state.bids[p.name] = prs.tricksNominated || 0;
      state.won[p.name] = prs.tricksWon || 0;
    }
  });
  {
    const dealerIndex = gameState.players.findIndex((p) => p.isDealer);
    const nextIndex = dealerIndex !== -1 ? (dealerIndex + 1) % gameState.players.length : 0;
    state.selectedPlayerName = gameState.players[nextIndex]?.name || '';
  }

  function computeIsMobile() {
    const isMobileWidth = window.innerWidth < 800;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobileWidth || isMobileUA;
  }
  state.isMobile = computeIsMobile();

  // Only one resize listener should ever be live app-wide (this view can
  // be torn down and rebuilt many times as rounds advance).
  if (window.__nominateResizeHandler) {
    window.removeEventListener('resize', window.__nominateResizeHandler);
  }
  window.__nominateResizeHandler = () => {
    const next = computeIsMobile();
    if (next !== state.isMobile) {
      state.isMobile = next;
      render();
    }
  };
  window.addEventListener('resize', window.__nominateResizeHandler);

  function handleBidChange(playerName, val) { state.bids[playerName] = val; }
  function handleWonChange(playerName, val) { state.won[playerName] = val; }

  function handleBiddingDone() {
    let totalBids = 0;
    let dealerName = '';
    gameState.players.forEach((p) => {
      totalBids += (state.bids[p.name] ?? 0);
      if (p.isDealer) dealerName = p.name;
    });

    const tricksAvailable = roundInfo.tricks;
    if (totalBids === tricksAvailable) {
      state.errorText = `The total nominated bids (${totalBids}) cannot equal the total tricks (${tricksAvailable}). Dealer [${dealerName}] must adjust their bid to ensure drama!`;
      render();
      return;
    }

    const updatedPlayers = gameState.players.map((p) => {
      const copyRoundScores = { ...p.roundScores };
      copyRoundScores[currentRound] = {
        ...copyRoundScores[currentRound],
        tricksNominated: state.bids[p.name] ?? 0,
      };
      return { ...p, roundScores: copyRoundScores };
    });

    const updatedGame = {
      ...gameState,
      players: updatedPlayers,
      roundState: 1,
      updatedAt: new Date().toISOString(),
    };

    // Alert (not just console.error) on a failed save - a silent failure
    // here is exactly how a completed round can vanish with no resume
    // option and no visible sign anything went wrong.
    saveGameToCloud(updatedGame).catch((err) => {
      console.error('Failed to save bidding state:', err);
      window.alert('Could not save this round to the server - your bids may not be saved. Check your connection and try again.');
    });
    onUpdateGame(updatedGame);
  }

  function handleTrickingDone() {
    let totalTricksWon = 0;
    const tricksAvailable = roundInfo.isMiss ? 7 : roundInfo.tricks;
    gameState.players.forEach((p) => { totalTricksWon += (state.won[p.name] ?? 0); });

    if (totalTricksWon !== tricksAvailable) {
      state.errorText = `Total tricks won (${totalTricksWon}) must equal the tricks available in this round (${tricksAvailable}). Please correct.`;
      render();
      return;
    }

    let updatedPlayers = gameState.players.map((p) => {
      const copyRoundScores = { ...p.roundScores };
      copyRoundScores[currentRound] = {
        ...copyRoundScores[currentRound],
        tricksWon: state.won[p.name] ?? 0,
      };
      return { ...p, roundScores: copyRoundScores };
    });

    updatedPlayers = computeScoredPlayers(updatedPlayers, currentRound, roundInfo.isMiss);

    const nextRound = currentRound + 1;
    let nextRoundState = 0;
    let nextStatus = gameState.status;

    if (nextRound > 18) {
      nextStatus = 'completed';
    } else {
      updatedPlayers = shiftDealer(updatedPlayers);
      const nextRoundInfo = getRoundInfo(nextRound);
      if (nextRoundInfo.isMiss) nextRoundState = 1;
    }

    const updatedGame = {
      ...gameState,
      status: nextStatus,
      currentRound: nextRound,
      roundState: nextRoundState,
      players: updatedPlayers,
      updatedAt: new Date().toISOString(),
    };

    // Same reasoning as the bidding save above: make a failed save
    // impossible to miss, since this is the write that would otherwise
    // silently drop the round from the resumable game.
    saveGameToCloud(updatedGame).catch((err) => {
      console.error('Failed to save completed round:', err);
      window.alert('Could not save this round to the server - your results may not be saved. Check your connection and try again.');
    });
    onUpdateGame(updatedGame);
  }

  function suitSymbol(suit) {
    if (suit.includes('♣')) return `<b style="color:var(--zinc-950);">♣</b>`;
    if (suit.includes('♦')) return `<b style="color:#e11d48;">♦</b>`;
    if (suit.includes('♥')) return `<b style="color:#e11d48;">♥</b>`;
    if (suit.includes('♠')) return `<b style="color:var(--zinc-950);">♠</b>`;
    return `<span style="color:#71717a;">NT</span>`;
  }

  const dealerPlayerName = gameState.players.find((p) => p.isDealer)?.name || 'None';

  function buildLedgerTable() {
    const rows = Array.from({ length: 18 }, (_, idx) => {
      const roundNum = idx + 1;
      const rInfo = getRoundInfo(roundNum);
      const isCurrent = roundNum === currentRound;
      const rowClass = isCurrent ? 'current' : rInfo.isMiss ? 'miss' : rInfo.isBlind ? 'blind' : '';

      const cells = gameState.players.map((p) => {
        const urs = p.roundScores[roundNum];
        const isPlayed = roundNum < currentRound;
        const hasActiveBids = isCurrent && roundState === 1;

        const bidCell = isPlayed ? urs.tricksNominated : (isCurrent ? (state.bids[p.name] ?? '-') : '-');
        const wonCell = isPlayed ? urs.tricksWon : (isCurrent && hasActiveBids ? (state.won[p.name] ?? '-') : '-');

        let ptsClass = 'pts-blank';
        let ptsText = '-';
        if (isPlayed) {
          ptsClass = urs.madeBid ? 'pts-made' : 'pts-missed';
          ptsText = `${urs.score > 0 ? '+' : ''}${urs.score}`;
        } else if (isCurrent) {
          ptsClass = 'pts-current';
        }

        return `
          <td class="bid-cell ${isPlayed ? 'played' : isCurrent ? 'current-cell' : ''}">${bidCell}</td>
          <td class="won-cell ${isPlayed ? 'played' : (isCurrent && hasActiveBids) ? 'current-cell' : ''}">${wonCell}</td>
          <td class="pts-cell ${ptsClass}">${ptsText}</td>
        `;
      }).join('');

      return `
        <tr class="${rowClass}">
          <td class="round-cell">
            <span class="r">R${roundNum}</span>
            ${rInfo.isBlind ? '🙈' : ''} ${rInfo.isMiss ? '❌' : ''}
            ${rInfo.isMiss ? 'Miss' : rInfo.tricks}
            <span class="suit">${suitSymbol(rInfo.trumpSuit)}</span>
          </td>
          ${cells}
        </tr>
      `;
    }).join('');

    const headPlayers = gameState.players.map((p) => `<th class="player" colspan="3">${p.name}</th>`).join('');
    const subCols = gameState.players.map(() => `<td>BID</td><td>WON</td><td class="pts">PTS</td>`).join('');
    const footCols = gameState.players.map((p) => `
      <td class="hit" colspan="2">Hit: <b>${p.madeBids}</b>/18</td>
      <td class="score">${p.currentScore}</td>
    `).join('');

    return `
      <div class="ledger-scroll custom-scrollbar">
        <table class="ledger-table">
          <thead>
            <tr class="head-row">
              <th>ROUND / SUIT</th>
              ${headPlayers}
            </tr>
            <tr class="sub-row">
              <th>No. / Trump</th>
              ${subCols}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td class="label">AGGREGATE SCORING</td>
              ${footCols}
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  function buildTrumpStamp() {
    if (roundInfo.trumpSuit === 'no') {
      return `<span class="value none">NO TRUMP</span>`;
    }
    return `<span class="value ${roundInfo.isRedSuit ? 'red' : 'black'}">${roundInfo.trumpSuit.toUpperCase()}</span>`;
  }

  function buildRoundMeta() {
    return `
      <div class="round-meta">
        <div class="cell">
          <span class="k">DEALER</span>
          <span class="v">💬 ${dealerPlayerName}</span>
        </div>
        <div class="cell">
          <span class="k">TRICKS LIMIT</span>
          <span class="v gold">${roundInfo.isMiss ? '7 (M)' : `${roundInfo.tricks}`}</span>
        </div>
        <div class="cell">
          <span class="k">RULES TYPE</span>
          <span class="v ${roundInfo.isBlind ? 'blind' : roundInfo.isMiss ? 'miss' : ''}">
            ${roundInfo.isBlind ? '🙈 BLIND ' : ''}${roundInfo.isMiss ? '❌ MISS' : '⭐ REGULAR'}
          </span>
        </div>
      </div>
    `;
  }

  function buildMobileStandings() {
    const sorted = [...gameState.players].sort((a, b) => b.currentScore - a.currentScore);
    return `
      <div class="fade-in-up">
        <button id="btn-mobile-back-1" class="btn-ghost-dark" style="width:100%;margin-bottom:12px;">← Back to Round Scoring Input</button>

        <div class="mobile-standings">
          <h4>
            <span class="left">${icon('crown')} CURRENT STANDINGS</span>
            <span class="tag">AGGREGATE SCORING</span>
          </h4>
          ${sorted.map((p, idx) => `
            <div class="standing-row">
              <span class="name"><span class="standing-rank">#${idx + 1}</span> ${p.name} ${p.name === dealerPlayerName ? '<span class="dealer-tag">DEALER</span>' : ''}</span>
              <span class="right">
                <span class="hit">Hit: ${p.madeBids}/18</span>
                <span class="score">${p.currentScore} pts</span>
              </span>
            </div>
          `).join('')}
        </div>

        <div class="ledger-panel">
          <h3 class="head"><span class="left">${icon('trophy')} Score Sheet Ledger</span><span class="tag">SCROLL MATRIX</span></h3>
          ${buildLedgerTable()}
        </div>

        <button id="btn-mobile-back-2" class="btn-ghost-dark" style="width:100%;margin-top:8px;">← Return to Active Round Input</button>
      </div>
    `;
  }

  function buildInputPanel() {
    const rows = gameState.players.map((p, idx) => {
      const isSelected = state.selectedPlayerName === p.name;
      // DevTools flags any <select>/<input> with no id/name (autofill
      // heuristics expect one) - these are otherwise addressed purely via
      // data-bid/data-won for the click handlers below, so the id here is
      // just to satisfy that check. Built from the player's index rather
      // than their name, since names are free-text and could collide or
      // contain characters that aren't safe inside an id attribute.
      const control = roundState === 0
        ? `
          <span class="side-label">Nominate:</span>
          <select id="bid-select-${idx}" name="bid-select-${idx}" data-bid="${p.name}">
            ${Array.from({ length: roundInfo.tricks + 1 }, (_, i) => `<option value="${i}" ${((state.bids[p.name] ?? 0) === i) ? 'selected' : ''}>${i}</option>`).join('')}
          </select>
        `
        : `
          <span class="side-label">Bid: <b>${state.bids[p.name] ?? p.roundScores[currentRound]?.tricksNominated ?? 0}</b></span>
          <span class="side-label">Won:</span>
          <select id="won-select-${idx}" name="won-select-${idx}" data-won="${p.name}">
            ${Array.from({ length: (roundInfo.isMiss ? 8 : roundInfo.tricks + 1) }, (_, i) => `<option value="${i}" ${((state.won[p.name] ?? 0) === i) ? 'selected' : ''}>${i}</option>`).join('')}
          </select>
        `;

      return `
        <div class="player-input-row ${isSelected ? 'selected' : ''}" data-select-player="${p.name}">
          <div class="left">
            <span class="role-tag ${p.isDealer ? 'dealer' : ''}">${p.isDealer ? 'Dealer' : 'Opp'}</span>
            <span class="pname">${p.name}</span>
          </div>
          <div class="right">${control}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="input-panel">
        <h3 class="head">
          <span>${roundState === 0 ? '📝 Bid Nominations' : '🎰 Won Trick Allocation'}</span>
          <span class="stage-pill">STAGE ${roundState + 1}/2</span>
        </h3>
        ${rows}
        <button id="${roundState === 0 ? 'btn-bid-done' : 'btn-won-done'}" class="btn ${roundState === 0 ? 'btn-cyan' : 'btn-gold-sm'}" style="width:100%;margin-top:16px;">
          ${roundState === 0 ? `Confirm Bids ${icon('chevron-right')}` : `${icon('check')} Submit Results`}
        </button>
      </div>
    `;
  }

  function render() {
    container.innerHTML = `
      <div class="screen scoring-screen">
        <div class="scoring-topbar">
          <button id="btn-exit" class="btn-plain">← Leave App</button>
          <div class="protocol">
            <span class="dot dot-green pulse"></span>
            <span>PROTOCOL: ${gameState.id.toUpperCase()}</span>
          </div>
        </div>

        <div class="round-card">
          <div class="top">
            <div>
              <div class="eyebrow">ACTIVE ROUND</div>
              <h2>Round ${currentRound} of 18</h2>
            </div>
            <div class="trump-stamp">
              <span class="label">TRUMP</span>
              ${buildTrumpStamp()}
            </div>
          </div>
          ${buildRoundMeta()}
        </div>

        ${state.errorText ? `
          <div class="error-banner fade-in-up">
            ${icon('alert-circle')}
            <div class="text">${state.errorText}</div>
          </div>
        ` : ''}

        ${state.isMobile && state.mobileShowResults
          ? buildMobileStandings()
          : `
            <div>
              ${buildInputPanel()}
              ${state.isMobile ? `<button id="btn-mobile-results" class="mobile-results-btn">${icon('trophy')} View Score Details</button>` : ''}
            </div>
          `}

        ${!state.isMobile ? `
          <div class="ledger-panel">
            <h3 class="head"><span class="left">${icon('trophy')} Game Results</span><span class="tag">SCROLLABLE MATRIX DATA</span></h3>
            ${buildLedgerTable()}
          </div>
        ` : ''}
      </div>
    `;

    attachListeners();
  }

  function attachListeners() {
    container.querySelector('#btn-exit').addEventListener('click', onExitToHome);

    container.querySelectorAll('[data-select-player]').forEach((row) => {
      row.addEventListener('click', () => {
        state.selectedPlayerName = row.dataset.selectPlayer;
        render();
      });
    });

    container.querySelectorAll('[data-bid]').forEach((select) => {
      select.addEventListener('click', (e) => e.stopPropagation());
      select.addEventListener('change', (e) => handleBidChange(select.dataset.bid, parseInt(e.target.value, 10)));
    });
    container.querySelectorAll('[data-won]').forEach((select) => {
      select.addEventListener('click', (e) => e.stopPropagation());
      select.addEventListener('change', (e) => handleWonChange(select.dataset.won, parseInt(e.target.value, 10)));
    });

    const bidDoneBtn = container.querySelector('#btn-bid-done');
    if (bidDoneBtn) bidDoneBtn.addEventListener('click', handleBiddingDone);
    const wonDoneBtn = container.querySelector('#btn-won-done');
    if (wonDoneBtn) wonDoneBtn.addEventListener('click', handleTrickingDone);

    const mobileResultsBtn = container.querySelector('#btn-mobile-results');
    if (mobileResultsBtn) mobileResultsBtn.addEventListener('click', () => { state.mobileShowResults = true; render(); });
    const back1 = container.querySelector('#btn-mobile-back-1');
    if (back1) back1.addEventListener('click', () => { state.mobileShowResults = false; render(); });
    const back2 = container.querySelector('#btn-mobile-back-2');
    if (back2) back2.addEventListener('click', () => { state.mobileShowResults = false; render(); });
  }

  render();
}
