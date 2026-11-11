/* Dark AI – motiv (generováno z Nastavení → 🎨 Vzhled) */
window.DARK_AI_THEME = {
  appName: 'Dark AI',
  accent: '#b9b9c4',
  accent2: '#8f8f9a',
  grad: 'linear-gradient(135deg, #6a6a74, #3a3a42)',
  bg: '#0c0c0e',
  bg2: '#151517'
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
