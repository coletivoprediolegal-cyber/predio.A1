(function(){
  'use strict';
  // Respeita a preferencia do navegador por padrao. Em navegadores que nao
  // repassam o modo escuro do Android, o usuario pode forcar a paleta azul.
  var root = document.documentElement;
  var storageKey = 'pl:theme-mode';
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var mode = 'auto';
  try {
    var saved = window.localStorage.getItem(storageKey);
    if (saved === 'dark' || saved === 'light') mode = saved;
  } catch (_) { /* Armazenamento bloqueado: manter modo automatico. */ }

  function apply() {
    var dark = mode === 'dark' || (mode === 'auto' && !!(darkQuery && darkQuery.matches));
    root.classList.toggle('pl-night', dark);
    root.dataset.plTheme = dark ? 'dark' : 'light';
    // O picture segue o tema realmente aplicado, e nao o palpite do navegador.
    var logoSource = document.querySelector('.pl-logo-picture source');
    if (logoSource) logoSource.media = dark ? 'all' : 'not all';
    var select = document.getElementById('pl-theme-mode');
    if (select && select.value !== mode) select.value = mode;
  }

  function setMode(next) {
    if (next !== 'auto' && next !== 'light' && next !== 'dark') return;
    mode = next;
    try {
      if (mode === 'auto') window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, mode);
    } catch (_) { /* A escolha segue ativa ate recarregar. */ }
    apply();
  }

  function setup() {
    var select = document.getElementById('pl-theme-mode');
    if (select) {
      select.value = mode;
      select.addEventListener('change', function () { setMode(select.value); });
    }
    apply();
  }

  // Classes de tema sao aplicadas ja no head para evitar flashes de outra paleta.
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once:true});
  else setup();
  if (darkQuery) {
    if (typeof darkQuery.addEventListener === 'function') darkQuery.addEventListener('change', function(){ if(mode === 'auto') apply(); });
    else if (typeof darkQuery.addListener === 'function') darkQuery.addListener(function(){ if(mode === 'auto') apply(); });
  }
  window.PLTheme = {setMode:setMode, getMode:function(){return mode;}};
})();
