// Plain-JS port of src/components/NamingView.tsx.

import { fetchSavedPlayersFromCloud } from '../api.js';
import { icon } from '../icons.js';

const FUN_NAMES = ["Alice", "Bob", "Charlie", "David", "Emma", "Frank", "Grace", "Henry", "Isabella", "Jack", "Kate", "Liam"];

export function renderNamingView(container, gameState, { onConfirmNames, onBackToHome }) {
  const state = {
    names: Array(gameState.numberOfPlayers).fill('').map((_, i) => gameState.players[i]?.name || `Player ${i + 1}`),
    cloudProfiles: [],
    activeIndex: 0,
  };

  function render() {
    container.innerHTML = `
      <div class="screen" style="justify-content:space-between;">
        <div>
          <div class="naming-topbar">
            <button id="btn-cancel" class="btn-plain">← Cancel</button>
            <span class="sep">•</span>
            <span class="phase">Phase 2: Naming Players</span>
          </div>

          <h2 class="naming-heading">${icon('users')} Configure Seating Order</h2>
          <p class="naming-sub">Input player names in clockwise dealing order. You can choose from active saved profiles.</p>

          <div class="naming-slots">
            ${state.names.map((name, index) => `
              <div class="naming-slot ${index === state.activeIndex ? 'active' : ''}" data-slot="${index}">
                <div class="avatar">${index === 0 ? '👑' : index + 1}</div>
                <div class="field">
                  <div class="field-label">Slot ${index + 1} ${index === 0 ? '<span class="dealer-badge">DEALER</span>' : ''}</div>
                  <input type="text" id="player-name-input-${index}" name="player-name-input-${index}" autocomplete="off" data-name-input="${index}" value="${escapeAttr(name)}" placeholder="Player ${index + 1}" />
                </div>
                ${name.trim() !== '' ? icon('check-circle', 'check') : ''}
              </div>
            `).join('')}
          </div>

          ${state.cloudProfiles.length > 0 ? `
            <div class="autocomplete-panel">
              <div class="autocomplete-head">
                <span class="label">Saved Legends (Tap to fill)</span>
                <button id="btn-randomize" class="randomize" type="button">${icon('shuffle')} Randomize</button>
              </div>
              <div class="pill-wrap custom-scrollbar">
                ${state.cloudProfiles.filter(p => !state.names.includes(p.name)).slice(0, 10).map(profile => `
                  <button class="pill" data-autofill="${escapeAttr(profile.name)}">${icon('user-plus')} ${profile.name}</button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <div style="margin-top:32px;">
          <button id="btn-naming-done" class="btn btn-gold" style="width:100%;">
            Begin nomination scoring ${icon('arrow-right')}
          </button>
        </div>
      </div>
    `;
    attachListeners();
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function handleNameChange(index, val) {
    state.names[index] = val;
    // Only re-render the check-icon/slot styling lazily — but simplest and
    // still cheap at this scale is a full re-render; we just have to take
    // care to restore focus/caret afterward.
    const hadFocus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.nameInput === String(index);
    const caret = hadFocus ? document.activeElement.selectionStart : null;
    render();
    if (hadFocus) {
      const input = container.querySelector(`[data-name-input="${index}"]`);
      if (input) {
        input.focus();
        if (caret !== null) input.setSelectionRange(caret, caret);
      }
    }
  }

  function handleSelectAutocomplete(profileName) {
    if (state.names.includes(profileName)) return;
    state.names[state.activeIndex] = profileName;
    if (state.activeIndex < gameState.numberOfPlayers - 1) state.activeIndex += 1;
    render();
  }

  function handleRandomize() {
    const randomName = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];
    if (!state.names.includes(randomName)) {
      state.names[state.activeIndex] = randomName;
      render();
    }
  }

  function handleDone() {
    const validatedNames = state.names.map((name, i) => {
      const trimmed = name.trim();
      return trimmed === '' ? `Player ${i + 1}` : trimmed;
    });
    onConfirmNames(validatedNames);
  }

  function attachListeners() {
    const cancelBtn = container.querySelector('#btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', onBackToHome);

    container.querySelectorAll('[data-slot]').forEach(slot => {
      slot.addEventListener('click', () => {
        state.activeIndex = parseInt(slot.dataset.slot, 10);
        render();
      });
    });

    container.querySelectorAll('[data-name-input]').forEach(input => {
      const index = parseInt(input.dataset.nameInput, 10);
      input.addEventListener('click', (e) => {
        e.stopPropagation();
        state.activeIndex = index;
      });
      input.addEventListener('input', (e) => handleNameChange(index, e.target.value));
    });

    const randomizeBtn = container.querySelector('#btn-randomize');
    if (randomizeBtn) randomizeBtn.addEventListener('click', handleRandomize);

    container.querySelectorAll('[data-autofill]').forEach(pill => {
      pill.addEventListener('click', () => handleSelectAutocomplete(pill.dataset.autofill));
    });

    const doneBtn = container.querySelector('#btn-naming-done');
    if (doneBtn) doneBtn.addEventListener('click', handleDone);
  }

  render();

  fetchSavedPlayersFromCloud().then(profiles => {
    state.cloudProfiles = profiles || [];
    render();
  });
}
