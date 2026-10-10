(function () {
  'use strict';
  var key = 'peachjuice-display-scene';
  var scenes = [
    { id: 'original', label: 'Original' },
    { id: 'peachjuice', label: 'PeachJuice' },
    { id: 'sunny-blue', label: 'Sunny blue' }
  ];
  var saved = 'original';
  try { saved = localStorage.getItem(key) || saved; } catch (e) {}
  function valid(id) {
    for (var i = 0; i < scenes.length; i++) if (scenes[i].id === id) return true;
    return false;
  }
  if (!valid(saved)) saved = 'original';
  document.documentElement.setAttribute('data-scene', saved);
  function apply(id) {
    if (!valid(id)) return;
    document.documentElement.setAttribute('data-scene', id);
    try { localStorage.setItem(key, id); } catch (e) {}
  }
  function mount() {
    if (document.getElementById('pj-scene-switcher')) return;
    var wrap = document.createElement('div');
    wrap.id = 'pj-scene-switcher';
    wrap.innerHTML = '<label for="pj-scene-select">Display</label><select id="pj-scene-select" aria-label="Choose display style"><option value="original">Original</option><option value="peachjuice">Peach Juice</option><option value="sunny-blue">Sunny blue</option></select>';
    var select = wrap.querySelector('select');
    select.value = saved;
    select.addEventListener('change', function () { apply(select.value); });
    document.body.appendChild(wrap);
    updateVisibility();
    if (window.MutationObserver) {
      var obs = new MutationObserver(updateVisibility);
      obs.observe(document.body, { attributes: true, subtree: true, childList: true, attributeFilter: ['class', 'hidden'] });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-pj-play'] });
    }
  }
  // The Display dropdown is only for intro screens, flat pages and the home
  // page - it is hidden while a game is actually being played.
  //  - Splash-screen games (drying, dullas): shown only while #splash-screen is up.
  //  - Standup: shown only on #screen-start.
  //  - Nominate: its app.js sets data-pj-play="1" on <html> outside the home view.
  //  - Anything else (about/hints/highscores pages, home pages): always shown.
  function isPlaying() {
    var splash = document.getElementById('splash-screen');
    if (splash) return splash.classList.contains('hidden') || splash.classList.contains('fading-out');
    var start = document.getElementById('screen-start');
    if (start) return start.hidden;
    return document.documentElement.getAttribute('data-pj-play') === '1';
  }
  function updateVisibility() {
    var wrap = document.getElementById('pj-scene-switcher');
    if (wrap) wrap.style.display = isPlaying() ? 'none' : '';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}());
