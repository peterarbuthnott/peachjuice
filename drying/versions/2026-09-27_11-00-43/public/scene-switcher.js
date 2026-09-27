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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}());
