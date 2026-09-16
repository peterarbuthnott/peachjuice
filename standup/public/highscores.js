(function () {
  'use strict';

  const PAGE_SIZE = 20;

  const listEl = document.getElementById('highscore-list');
  const errorEl = document.getElementById('highscore-error');
  const loadMoreBtn = document.getElementById('btn-load-more');

  let offset = 0;

  function appendEntries(entries) {
    entries.forEach((entry) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = entry.name;
      const value = document.createElement('span');
      value.textContent = entry.score + ' / ' + entry.totalAnswered;
      li.appendChild(label);
      li.appendChild(value);
      listEl.appendChild(li);
    });
  }

  function loadPage() {
    loadMoreBtn.disabled = true;
    fetch('api/highscores?offset=' + offset + '&limit=' + PAGE_SIZE)
      .then((res) => {
        if (!res.ok) throw new Error('Could not load high scores right now.');
        return res.json();
      })
      .then((result) => {
        if (offset === 0 && !result.entries.length) {
          const li = document.createElement('li');
          li.textContent = 'No scores yet -- be the first to play!';
          listEl.appendChild(li);
        } else {
          appendEntries(result.entries);
        }
        offset += result.entries.length;
        loadMoreBtn.hidden = !result.hasMore;
        loadMoreBtn.disabled = false;
      })
      .catch((err) => {
        errorEl.hidden = false;
        errorEl.textContent = err.message;
        loadMoreBtn.disabled = false;
      });
  }

  loadMoreBtn.addEventListener('click', loadPage);

  loadPage();
})();
