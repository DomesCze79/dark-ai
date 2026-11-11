/* Dark AI – motiv (generováno z Nastavení → 🎨 Vzhled) */
window.DARK_AI_THEME = {
  appName: 'Dark AI',
  accent: '#e50914',
  accent2: '#ff2440',
  grad: 'linear-gradient(135deg, #e50914, #6b0f18)',
  bg: '#0b0708',
  bg2: '#140b0c'
};
(function () {
  var t = window.DARK_AI_THEME, r = document.documentElement.style;
  if (t.accent) r.setProperty('--accent', t.accent);
  if (t.accent2) r.setProperty('--accent2', t.accent2);
  if (t.grad) r.setProperty('--grad', t.grad);
  if (t.bg) r.setProperty('--bg', t.bg);
  if (t.bg2) r.setProperty('--bg2', t.bg2);
  if (t.appName) {
    document.title = t.appName + ' – tvoje vlastní AI';
    var b = document.querySelector('#sidebar .brand b');
    if (b) b.textContent = t.appName;
  }
})();
