(function () {
  'use strict';

  const HIGHSCORE_PAGE_SIZE = 20;

  const screens = {
    start: document.getElementById('screen-start'),
    question: document.getElementById('screen-question'),
    results: document.getElementById('screen-results'),
  };

  const el = {
    playerName: document.getElementById('player-name'),
    btnStart: document.getElementById('btn-start'),
    startError: document.getElementById('start-error'),

    questionProgress: document.getElementById('question-progress'),
    questionSource: document.getElementById('question-source'),
    questionText: document.getElementById('question-text'),
    choices: document.getElementById('choices'),
    feedback: document.getElementById('feedback'),
    answerDetail: document.getElementById('answer-detail'),
    btnNext: document.getElementById('btn-next'),

    resultName: document.getElementById('result-name'),
    resultScore: document.getElementById('result-score'),
    resultTotal: document.getElementById('result-total'),
    highscoreList: document.getElementById('highscore-list'),
    btnLoadMoreScores: document.getElementById('btn-load-more-scores'),
    btnPlayAgain: document.getElementById('btn-play-again'),
  };

  // Game state for the current playthrough
  let state = {
    sessionId: null,
    playerName: '',
    questions: [],
    currentIndex: 0,
    score: 0,
  };

  let highscoreOffset = 0;

  function showScreen(name) {
    Object.keys(screens).forEach((key) => {
      screens[key].hidden = key !== name;
    });
  }

  async function api(path, options) {
    const res = await fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
    }, options));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || 'Something went wrong. Please try again.');
    }
    return body;
  }

  async function startGame() {
    const name = el.playerName.value.trim();
    el.startError.hidden = true;

    if (!name) {
      el.startError.textContent = 'Please enter your name to start.';
      el.startError.hidden = false;
      return;
    }

    el.btnStart.disabled = true;
    try {
      const [{ sessionId }, questions] = await Promise.all([
        api('api/session/start', { method: 'POST' }),
        api('api/questions', { method: 'GET' }),
      ]);

      if (!questions.length) {
        throw new Error('No questions are loaded yet. Check back soon!');
      }

      state = {
        sessionId,
        playerName: name,
        questions,
        currentIndex: 0,
        score: 0,
      };

      showScreen('question');
      renderQuestion();
    } catch (err) {
      el.startError.textContent = err.message;
      el.startError.hidden = false;
    } finally {
      el.btnStart.disabled = false;
    }
  }

  function renderQuestion() {
    const q = state.questions[state.currentIndex];

    el.questionProgress.textContent =
      'Question ' + (state.currentIndex + 1) + ' of ' + state.questions.length;

    el.questionSource.innerHTML = '';
    if (/^https?:\/\//.test(q.source || '')) {
      const link = document.createElement('a');
      link.href = q.source;
      link.textContent = q.source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      el.questionSource.appendChild(link);
    } else {
      el.questionSource.textContent = q.source || '';
    }

    el.questionText.textContent = q.question;

    el.choices.innerHTML = '';
    q.choices.forEach((choiceText, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.textContent = choiceText;
      btn.addEventListener('click', () => submitAnswer(q, index, btn));
      el.choices.appendChild(btn);
    });

    el.feedback.hidden = true;
    el.answerDetail.hidden = true;
    el.btnNext.hidden = true;
  }

  async function submitAnswer(question, choiceIndex, clickedBtn) {
    // Disable all choice buttons immediately so a player can't double-answer
    const buttons = Array.from(el.choices.querySelectorAll('.choice-btn'));
    buttons.forEach((b) => { b.disabled = true; });

    try {
      const result = await api('api/answer', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: state.sessionId,
          questionId: question.id,
          choiceIndex,
        }),
      });

      state.score = result.score;

      buttons[result.correctIndex].classList.add('correct');
      if (!result.correct) {
        clickedBtn.classList.add('incorrect');
      }

      el.feedback.hidden = false;
      el.feedback.className = 'feedback ' + (result.correct ? 'correct' : 'incorrect');
      el.feedback.textContent = result.correct
        ? 'Correct!'
        : 'Not quite -- the right answer is highlighted above.';

      if (result.explanation) {
        el.answerDetail.hidden = false;
        el.answerDetail.textContent = result.explanation;
      }

      el.btnNext.hidden = false;
      el.btnNext.textContent =
        state.currentIndex + 1 < state.questions.length ? 'Next Question' : 'See Results';
    } catch (err) {
      el.feedback.hidden = false;
      el.feedback.className = 'feedback incorrect';
      el.feedback.textContent = err.message;
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  function nextQuestion() {
    state.currentIndex += 1;
    if (state.currentIndex < state.questions.length) {
      renderQuestion();
    } else {
      finishGame();
    }
  }

  async function finishGame() {
    try {
      await api('api/score', {
        method: 'POST',
        body: JSON.stringify({ sessionId: state.sessionId, name: state.playerName }),
      });
    } catch (err) {
      // Non-fatal: still show the player their result even if saving failed
      console.error(err);
    }

    el.resultName.textContent = state.playerName;
    el.resultScore.textContent = state.score;
    el.resultTotal.textContent = state.questions.length;

    await renderHighscores();
    showScreen('results');
  }

  async function loadHighscorePage() {
    el.btnLoadMoreScores.disabled = true;
    try {
      const result = await api(
        'api/highscores?offset=' + highscoreOffset + '&limit=' + HIGHSCORE_PAGE_SIZE,
        { method: 'GET' }
      );

      if (highscoreOffset === 0 && !result.entries.length) {
        const li = document.createElement('li');
        li.textContent = 'No scores yet -- you could be first!';
        el.highscoreList.appendChild(li);
      } else {
        result.entries.forEach((entry) => {
          const li = document.createElement('li');
          const isMe = entry.name === state.playerName && entry.score === state.score;
          if (isMe) li.classList.add('me');
          const label = document.createElement('span');
          label.textContent = entry.name;
          const value = document.createElement('span');
          value.textContent = entry.score + ' / ' + entry.totalAnswered;
          li.appendChild(label);
          li.appendChild(value);
          el.highscoreList.appendChild(li);
        });
      }

      highscoreOffset += result.entries.length;
      el.btnLoadMoreScores.hidden = !result.hasMore;
    } catch (err) {
      const li = document.createElement('li');
      li.textContent = 'Could not load high scores right now.';
      el.highscoreList.appendChild(li);
    } finally {
      el.btnLoadMoreScores.disabled = false;
    }
  }

  async function renderHighscores() {
    el.highscoreList.innerHTML = '';
    highscoreOffset = 0;
    el.btnLoadMoreScores.hidden = true;
    await loadHighscorePage();
  }

  function resetToStart() {
    el.playerName.value = state.playerName || '';
    showScreen('start');
  }

  el.btnStart.addEventListener('click', startGame);
  el.playerName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });
  el.btnNext.addEventListener('click', nextQuestion);
  el.btnLoadMoreScores.addEventListener('click', loadHighscorePage);
  el.btnPlayAgain.addEventListener('click', resetToStart);

  showScreen('start');
})();
