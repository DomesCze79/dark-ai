/* ===== Dark AI – app.js ===== */
'use strict';

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uid = () => Math.random().toString(36).slice(2, 10);

function toast(msg, ms = 4200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* plné úložiště */ }
}

/* ---------- state ---------- */
const DEF_SETTINGS = {
  provider: 'gemini', apiKey: '', orKey: '', model: 'gemini-3.5-flash-lite',
  search: true,
  name: 'Dark', avatar: '🤖', preset: 'universal', openMode: true, extra: '',
  appName: 'Dark AI', themePreset: 'mono',
  themeAccent: '#b9b9c4', themeAccent2: '#8f8f9a', themeBg: '#0c0c0e',
  themeGrad: 'linear-gradient(135deg, #6a6a74, #3a3a42)',
  voiceReplies: true, recLang: 'cs-CZ',
  ttsEngine: 'auto', ttsVoice: 'Puck', ttsLang: 'cs-CZ', ttsModel: 'gemini-3.8-flash-tts',
  imgModel: 'gemini-3.1-flash-image',
  searchDDG: true, searchSocial: true, hiveSize: 4,
  githubToken: '',
  veoModel: 'veo-3.1-generate-preview',
  chatMode: 'agent', battleModel: 'gemini-3.5-flash-lite', battleScore: {}
};

let settings, chats, memory, currentChatId;

function loadState() {
  settings = Object.assign({}, DEF_SETTINGS, loadJSON('mai.settings', {}));
  if (!settings.themeMigrated) {
    settings.themeMigrated = true;
    if (!settings.themePreset || settings.themePreset === 'darkred') {
      const g = THEMES.mono;
      settings.themePreset = 'mono';
      settings.themeAccent = g.accent;
      settings.themeAccent2 = g.accent2;
      settings.themeGrad = g.grad;
      settings.themeBg = g.bg;
    }
    saveSettings();
  }
  const deadOr = ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat:free', 'google/gemma-3-27b-it:free'];
  if (deadOr.indexOf(settings.model) >= 0) { settings.model = 'openrouter/free'; saveSettings(); }
  if (deadOr.indexOf(settings.battleModel) >= 0) { settings.battleModel = 'gemini-3.5-flash-lite'; saveSettings(); }
  chats = loadJSON('mai.chats', []);
  memory = loadJSON('mai.memory', []);
  currentChatId = loadJSON('mai.current', null);
}
function saveSettings() { saveJSON('mai.settings', settings); }
function saveChats() { saveJSON('mai.chats', chats); saveJSON('mai.current', currentChatId); }
function saveMemory() { saveJSON('mai.memory', memory); }

function currentModel() {
  const m = (settings.model || '').trim();
  if (m) return m;
  if (settings.provider === 'openai') return 'gpt-4o-mini';
  if (settings.provider === 'openrouter') return 'openrouter/free';
  return 'gemini-3.5-flash-lite';
}

function providerForModel(m) {
  m = (m || '').trim();
  if (/^gpt/i.test(m)) return 'openai';
  if (m.indexOf('/') >= 0) return 'openrouter';
  return 'gemini';
}

function keyFor(provider) {
  if (provider === 'openrouter') return (settings.orKey || '').trim();
  return (settings.apiKey || '').trim();
}

function openaiChatUrl(provider) {
  return provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
}

const MODEL_OPTS = [
  ['gemini-3.5-flash-lite', '💨 Gemini 3.5 Lite'],
  ['gemini-3.8-flash', '⚡ Gemini 3.8 Flash'],
  ['openrouter/free', '🆓 Router zdarma (automaticky)'],
  ['nvidia/nemotron-3-ultra-550b-a55b:free', '🧠 Nemotron 3 Ultra (zdarma)'],
  ['google/gemma-4-31b-it:free', '💎 Gemma 4 31B (zdarma)'],
  ['nvidia/nemotron-3.5-lightning:free', '⚡ Nemotron Lightning (zdarma)'],
  ['gpt-4o-mini', '🟣 GPT-4o mini'],
  ['gpt-4o', '🔮 GPT-4o']
];

function modelLabel(m) {
  const o = MODEL_OPTS.find((x) => x[0] === m);
  return o ? o[1] : m;
}

async function chatOnceWith(model, history, sys) {
  const prevM = settings.model, prevP = settings.provider;
  try {
    settings.model = model;
    settings.provider = providerForModel(model);
    return await chatOnce(history, sys);
  } finally {
    settings.model = prevM; settings.provider = prevP;
  }
}

function menuFor(menu) {
  $('#modeMenu').classList.add('hidden');
  $('#modelMenu').classList.add('hidden');
  $('#toolsMenu').classList.add('hidden');
  if (menu) menu.classList.toggle('hidden');
}

function fillModels(container, current, onPick, opts) {
  container.innerHTML = '';
  (opts || MODEL_OPTS).forEach((o) => {
    const b = document.createElement('button');
    b.className = 'model-opt' + (o[0] === current ? ' active' : '');
    b.innerHTML = '<span>' + esc(o[1]) + '</span><span class="tick">' + (o[0] === current ? '✓' : '') + '</span>';
    b.addEventListener('click', () => onPick(o[0]));
    container.appendChild(b);
  });
}

let OR_FREE_CACHE = null;
function fetchOrFreeModels() {
  if (OR_FREE_CACHE) return Promise.resolve(OR_FREE_CACHE);
  return fetch('https://openrouter.ai/api/v1/models')
    .then((r) => r.json())
    .then((j) => {
      OR_FREE_CACHE = (j.data || [])
        .filter((m) => m.id && /:free$/.test(m.id))
        .map((m) => [m.id, '🆓 ' + String(m.name || m.id).replace(/ \(free\)$/i, '')]);
      return OR_FREE_CACHE;
    })
    .catch(() => { OR_FREE_CACHE = []; return OR_FREE_CACHE; });
}

function fillModelsAsync(container, current, onPick) {
  fetchOrFreeModels().then((extra) => {
    const opts = MODEL_OPTS.concat((extra || []).filter((o) => !MODEL_OPTS.some((x) => x[0] === o[0])));
    fillModels(container, current, onPick, opts);
  });
}

function syncModeUI() {
  const mode = (settings && settings.chatMode) || 'agent';
  const names = { battle: '⚔️ Battle', agent: '🤖 Agent', chat: '💬 Chat', team: '🐝 Tým' };
  const icos = { battle: '⚔️', agent: '🤖', chat: '💬', team: '🐝' };
  const bm = $('#btnMode');
  if (bm) bm.innerHTML = (icos[mode] || icos.agent) + ' <small>▾</small>';
  $$('#modeMenu .mode-opt').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  const pm = $('#btnModel');
  if (pm && settings) pm.innerHTML = '⚡ <small>▾</small>';
  const ss = $('#toolSearchState'); if (ss && settings) ss.textContent = settings.search ? 'zapnuto' : 'vypnuto';
  const vs = $('#toolVoiceState'); if (vs && settings) vs.textContent = settings.voiceReplies ? 'zapnuto' : 'vypnuto';
  const pickMain = (m) => {
    settings.model = m;
    settings.provider = providerForModel(m);
    saveSettings();
    const me = $('#setModel'); if (me) me.value = m;
    syncModeUI(); menuFor(null);
    toast('🧠 Model: ' + modelLabel(m));
  };
  const pickOpp = (m) => {
    settings.battleModel = m; saveSettings(); syncModeUI(); menuFor(null);
    toast('⚔️ Soupeř: ' + modelLabel(m));
  };
  const oppHead = $('#oppHead'), oppList = $('#oppList');
  if (oppHead) oppHead.classList.toggle('hidden', mode !== 'battle');
  if (oppList) {
    oppList.classList.toggle('hidden', mode !== 'battle');
    fillModels(oppList, settings.battleModel, pickOpp);
    fillModelsAsync(oppList, settings.battleModel, pickOpp);
  }
  const ml = $('#modelList');
  if (ml) {
    fillModels(ml, currentModel(), pickMain);
    fillModelsAsync(ml, currentModel(), pickMain);
  }
}

/* ---------- motiv / vzhled (editor v appce) ---------- */
const THEMES = {
  darkred: { label: '🖤❤️ Dark AI', appName: 'Dark AI', accent: '#e50914', accent2: '#ff2440', grad: 'linear-gradient(135deg, #e50914, #6b0f18)', bg: '#0b0708', bg2: '#140b0c' },
  matrix: { label: '💚 Matrix', appName: 'Dark AI', accent: '#00e676', accent2: '#00ff9d', grad: 'linear-gradient(135deg, #00c853, #003d1f)', bg: '#070b08', bg2: '#0c1410' },
  ice: { label: '🧊 Ice', appName: 'Dark AI', accent: '#2f9bff', accent2: '#7fd0ff', grad: 'linear-gradient(135deg, #1e88e5, #062a4a)', bg: '#070a10', bg2: '#0b1220' },
  purple: { label: '🟣 Neon', appName: 'Dark AI', accent: '#b14aff', accent2: '#e05cff', grad: 'linear-gradient(135deg, #8e24aa, #3b0d52)', bg: '#0a0710', bg2: '#130b1c' },
  mono: { label: '🩶 Černosedivá', appName: 'Dark AI', accent: '#b9b9c4', accent2: '#8f8f9a', grad: 'linear-gradient(135deg, #6a6a74, #3a3a42)', bg: '#0c0c0e', bg2: '#151517' }
};

function shade(hex, amt) {
  let c = String(hex || '#000000').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const n = parseInt(c, 16) || 0;
  const cl = (x) => Math.max(0, Math.min(255, x));
  const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function applyTheme() {
  const r = document.documentElement.style;
  const accent = settings.themeAccent || '#b9b9c4';
  const accent2 = settings.themeAccent2 || '#8f8f9a';
  const bg = settings.themeBg || '#0c0c0e';
  r.setProperty('--accent', accent);
  r.setProperty('--accent2', accent2);
  r.setProperty('--grad', settings.themeGrad || ('linear-gradient(135deg, ' + accent + ', ' + shade(accent, -60) + ')'));
  r.setProperty('--bg', bg);
  r.setProperty('--bg2', shade(bg, 14));
  syncHeader();
}

function fillThemeInputs() {
  const set = (id, v) => { const el = $(id); if (el && v) el.value = v; };
  set('#setThemeAccent', settings.themeAccent);
  set('#setThemeAccent2', settings.themeAccent2);
  set('#setThemeBg', settings.themeBg);
  const an = $('#setAppName');
  if (an) an.value = settings.appName || 'Dark AI';
}

function buildThemeJs() {
  const t = {
    appName: settings.appName || 'Dark AI',
    accent: settings.themeAccent || '#b9b9c4',
    accent2: settings.themeAccent2 || '#8f8f9a',
    grad: settings.themeGrad || ('linear-gradient(135deg, ' + (settings.themeAccent || '#b9b9c4') + ', #3a3a42)'),
    bg: settings.themeBg || '#0c0c0e',
    bg2: '#151517'
  };
  return '/* Dark AI – motiv (z Nastavení → Vzhled) */\n' +
    'window.DARK_AI_THEME = ' + JSON.stringify(t) + ';\n' +
    '(function(){var t=window.DARK_AI_THEME,r=document.documentElement.style;' +
    'if(t.accent)r.setProperty("--accent",t.accent);' +
    'if(t.accent2)r.setProperty("--accent2",t.accent2);' +
    'if(t.grad)r.setProperty("--grad",t.grad);' +
    'if(t.bg)r.setProperty("--bg",t.bg);' +
    'if(t.bg2)r.setProperty("--bg2",t.bg2);' +
    'if(t.appName){document.title=t.appName+" – tvoje vlastní AI";' +
    'var b=document.querySelector("#sidebar .brand b");if(b)b.textContent=t.appName;}})();\n';
}

/* ---------- pluginy (vývojář appky přímo v appce) ---------- */
function getPlugins() { return loadJSON('mai.plugins', []); }
function putPlugins(list) { saveJSON('mai.plugins', list); }

function buildPluginsJs() {
  return '/* Dark AI – pluginy (ze záložky 🧩 Funkce) */\nwindow.DARK_AI_PLUGINS = ' +
    JSON.stringify(getPlugins()) + ';\n';
}

const PLUGIN_SYS = 'Jsi vývojář aplikace Dark AI (webová appka, vanilla JS, české UI). Vytvoř NOVOU FUNKCI jako plugin podle zadání uživatele. Vrať VÝHRADNĚ jeden ```json blok ve tvaru:\n' +
  '{"name":"Název funkce","desc":"Krátký popis česky","css":"volitelné styly","html":"volitelný obsah karty (jen vnitřek)","code":"JavaScript"}\n' +
  'Pravidla pro code (spouští se při startu appky):\n' +
  '- K dispozici: $ (querySelector), esc(text), toast(zpráva), settings, saveSettings(), fetch, DarkAI (objekt s metodou reload()).\n' +
  '- Kód musí být kompletní, robustní (try/catch) a fungovat samostatně. UI prvky dávej do html karty a v kódu na ně napoj posluchače přes unikátní ID.\n' +
  '- Potřebuješ-li AI odpovědi, volej fetch na https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key= + settings.apiKey (body: {contents:[{parts:[{text:...}]}]}).\n' +
  '- Žádné externí knihovny ani CDN. Všechny texty česky. Žádné škodlivé kódy.';

async function generatePlugin(desc) {
  const r = await chatOnce([{ role: 'user', content: desc }], PLUGIN_SYS);
  const m = r.text.match(/```(?:json)?\n?([\s\S]*?)```/) || r.text.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error('AI nevrátila plugin.');
  return JSON.parse(m[1]);
}

function runPlugins() {
  const all = (window.DARK_AI_PLUGINS || []).concat(getPlugins());
  const seen = {};
  for (const p of all) {
    if (!p || !p.name || seen[p.name] || p.enabled === false) continue;
    seen[p.name] = true;
    try {
      if (p.css) {
        const st = document.createElement('style');
        st.textContent = p.css;
        st.dataset.plugin = p.name;
        document.head.appendChild(st);
      }
      if (p.html) {
        const holder = document.createElement('div');
        holder.innerHTML = p.html;
        const cards = $('#pluginCards');
        if (cards) cards.appendChild(holder);
      }
      if (p.code) {
        const fn = new Function('DarkAI', '$', 'esc', 'toast', 'settings', 'saveSettings', p.code);
        fn({ reload: () => location.reload(), settings: settings }, $, esc, toast, settings, saveSettings);
      }
    } catch (e) {
      console.warn('Plugin selhal:', p.name, e);
    }
  }
}

function initPluginsUI() {
  const renderList = () => {
    const list = $('#pluginList');
    if (!list) return;
    const stored = getPlugins();
    if (!stored.length) {
      list.innerHTML = '<p class="muted small">Zatím nic nainstalovaného. Výše popiš první funkci! 👆</p>';
      return;
    }
    list.innerHTML = '';
    stored.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'mem-item';
      el.innerHTML = `<span>${p.enabled === false ? '⚪' : '🧩'} <b>${esc(p.name || 'Bez názvu')}</b> <i class="muted">${esc(p.desc || '')}</i></span>` +
        `<button class="dl" title="Zapnout/vypnout">${p.enabled === false ? '▶️' : '⏸'}</button>` +
        `<button class="del" title="Smazat">✕</button>`;
      el.querySelector('.dl').addEventListener('click', () => {
        const s = getPlugins();
        s[i].enabled = s[i].enabled === false;
        putPlugins(s);
        renderList();
        toast('Nastavení pluginu – použij 🔄 Aplikovat změny.');
      });
      el.querySelector('.del').addEventListener('click', () => {
        const s = getPlugins();
        s.splice(i, 1);
        putPlugins(s);
        renderList();
        toast('Plugin smazán.');
      });
      list.appendChild(el);
    });
  };
  renderList();

  let pending = null;
  $('#plugGen').addEventListener('click', async () => {
    const desc = $('#plugPrompt').value.trim();
    if (!desc) { toast('Popiš novou funkci.'); return; }
    if (!settings.apiKey.trim()) { toast('Potřebuješ API klíč (Nastavení → Mozek 🧠).'); switchView('settings'); return; }
    const btn = $('#plugGen');
    btn.disabled = true;
    btn.textContent = '⏳ Programuji funkci…';
    $('#plugStatus').textContent = 'AI píše kód… chvilku to trvá.';
    try {
      pending = await generatePlugin(desc);
      $('#plugName').textContent = '🧩 ' + (pending.name || 'Nová funkce');
      $('#plugDesc').textContent = pending.desc || '';
      $('#plugCode').textContent = pending.code || '(bez kódu)';
      $('#plugPreview').hidden = false;
      $('#plugStatus').textContent = 'Projdi si kód a funkci nainstaluj.';
    } catch (e) {
      $('#plugStatus').textContent = '❌ ' + (e.message || e);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Vygenerovat funkci';
    }
  });

  $('#plugInstall').addEventListener('click', () => {
    if (!pending) return;
    const ok = confirm('Nainstalovat funkci "' + (pending.name || '') + '"?\n\nKód pluginu se spustí v appce (náhled kódu je výše).');
    if (!ok) return;
    const s = getPlugins();
    pending.enabled = true;
    pending.id = uid();
    s.push(pending);
    putPlugins(s);
    pending = null;
    $('#plugPreview').hidden = true;
    $('#plugPrompt').value = '';
    renderList();
    $('#plugStatus').textContent = '✅ Nainstalováno! Klikni na 🔄 Aplikovat změny.';
    toast('Funkce nainstalována 🧩');
  });

  $('#plugCancel').addEventListener('click', () => {
    pending = null;
    $('#plugPreview').hidden = true;
    $('#plugStatus').textContent = '';
  });

  $('#plugReload').addEventListener('click', () => location.reload());
}

/* ---------- markdown-lite ---------- */

function inlineMd(s) {
  let x = esc(s);
  x = x.replace(/`([^`]+)`/g, '<code>$1</code>');
  x = x.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  x = x.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  x = x.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return x;
}

function renderText(t) {
  if (!t || !t.trim()) return '';
  const lines = t.split('\n');
  let html = '', list = null;
  let para = [];
  const flushPara = () => { if (para.length) { html += `<p>${inlineMd(para.join(' '))}</p>`; para = []; } };
  const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const lvl = Math.min(h[1].length + 1, 4);
      html += `<h${lvl}>${inlineMd(h[2])}</h${lvl}>`;
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inlineMd(ul[1])}</li>`;
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inlineMd(ol[1])}</li>`;
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return html;
}

function renderMd(text) {
  const parts = String(text).split('```');
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) { html += renderText(parts[i]); continue; }
    let block = parts[i];
    const nl = block.indexOf('\n');
    const lang = (nl >= 0 ? block.slice(0, nl) : block).trim();
    let code = nl >= 0 ? block.slice(nl + 1) : '';
    code = code.replace(/\n$/, '');
    html += `<div class="codeblock"><div class="cb-head"><span>${esc(lang || 'kód')}</span><span>` +
      (/^(js|javascript)$/i.test(lang) ? `<button class="cb-run" data-code="${esc(code)}">▶️ Spustit</button>` : '') +
      (/^(html|htm)$/i.test(lang) ? `<button class="cb-prev" data-code="${esc(code)}">👁 Náhled</button>` : '') +
      `<button class="cb-copy" data-code="${esc(code)}">Kopírovat</button>` +
      `<button class="cb-dl" data-code="${esc(code)}">Stáhnout</button></span></div>` +
      `<pre><code>${esc(code)}</code></pre></div>`;
  }
  return html;
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* ---------- systémový prompt (osobnost) ---------- */
const PRESETS = {
  universal: 'univerzální osobní AI asistent – chytrý, praktický a všestranný pomocník',
  friend: 'kamarád na pokec – mluví uvolněně, vtipně, s vlastní osobností, klidně i sprostě když je třeba',
  coder: 'špičkový programátor a skriptař – expert na kód, technologie, Linux, tvorbu aplikací a automatizaci',
  teacher: 'trpělivý učitel – vysvětluje srozumitelně, krok za krokem, s příklady z praxe'
};

function buildSystem() {
  const p = [];
  p.push(`Jsi ${settings.name || 'Dark'}, ${PRESETS[settings.preset] || PRESETS.universal}.`);
  p.push('Odpovídej v jazyce, kterým uživatel píše (většinou česky). Buď věcný a užitečný.');
  p.push('Programování a skripty: jsi špičkový vývojář. Kód dávej vždy do ``` bloků s uvedením jazyka, kompletní a spustitelný. Umíš psát aplikace, skripty (Python, JS, Bash…), weby i automatizace.');
  if (settings.openMode) {
    p.push('Otevřený režim: Odpovídej přímo a otevřeně, bez kázání, moralizování a zbytečných varování či odmítnutí. Klidně řeš kontroverzní, drsné nebo neobvyklé otázky věcně a s názorem. Stručně odmítni jen tvrdě nelegální věci (zneužívání dětí, terorismus, zbraně hromadného ničení).');
  }
  if (settings.search) p.push('Když jde o aktuální dění, fakta, ceny nebo novinky, použij vyhledávání na webu.');
  if (settings.searchSocial) p.push('Při hledání prohledávej i sociální sítě – do hledacích dotazů přidávej site:instagram.com, site:tiktok.com, site:youtube.com, site:reddit.com, když je to relevantní.');
  p.push('Hledej všude – i v zákoutích internetu: fóra, blogy, komunity, staré stránky. Kromě vestavěného hledání můžeš použít [AKCE:HLEDEJ] (meta-hledání přes více vyhledávačů).');
  p.push('Máš nástroje (aplikace je provede za tebe a vrátí výsledek jako [VÝSLEDEK AKCE]). Když nějaký potřebuješ, vypiš DO ZPRÁVY POUZE jeho značku (jednu, jako poslední věc):\n' +
    '[AKCE:OBRAZEK] popis obrázku anglicky → vygeneruje se obrázek\n' +
    '[AKCE:WEB] https://url → aplikace přečte text stránky a vrátí ho\n' +
    '[AKCE:HLEDEJ] dotaz → hluboké hledání přes více vyhledávačů (i sociální sítě, fóra)\n' +
    '[AKCE:KOD] ```javascript kód ``` → kód se spustí v sandboxu, vrátí se výstup konzole\n' +
    '[AKCE:HUDBA] ```json partitura``` → vygeneruje a přehraje skladbu. Schéma: {"name":"Název","bpm":90,"bars":8,"melody":[{"n":"C4","t":0,"d":1}],"bass":[{"n":"C2","t":0,"d":2}],"drums":[{"t":0,"k":"kick"},{"t":2,"k":"snare"},{"t":1,"k":"hat"}]} – n=nota (C0–B7, lze #/b), t=počátek v beatech, d=délka v beatech, k=kick|snare|hat\n' +
    '[AKCE:TIM] úkol → včelí úl: tým AI specialistů (počet dle nastavení) zpracuje úkol PARALELNĚ a ty jejich výstupy shrneš\n' +
    '[AKCE:PRIKAZ] příkaz → spustí příkaz na počítači uživatele (jen v desktop režimu; uživatel musí vždy potvrdit)\n' +
    '[AKCE:SOUBOR: nazev-souboru.txt] ```obsah``` → vytvoří se soubor ke stažení\n' +
    'Po obdržení [VÝSLEDEK AKCE] normálně pokračuj odpovědí pro uživatele. Značku [AKCE:] nikdy nepiš, pokud ji opravdu nechceš spustit. Na výpočty a logiku používej [AKCE:KOD].');
  p.push('Weby, stránky, appky a software: piš kompletní funkční kód. U webových stránek a menších aplikací preferuj jeden kompletní HTML soubor s vnořeným CSS i JS (ať funguje okamžitě). U větších projektů ulož každý soubor zvlášť přes [AKCE:SOUBOR: ...]. Písničky: text/lyrics napiš slovně a hudbu udělej přes [AKCE:HUDBA].');
  if (pcOnline) {
    p.push('DESKTOP REŽIM: Máš přístup k počítači uživatele – soubory, terminál, spouštění programů, screenshoty, plánované úkoly. Příkazy spouštěj přes [AKCE:PRIKAZ] příkaz; každý musí uživatel ručně potvrdit, takže navrhuj jen smysluplné příkazy a vždy stručně vysvětli, co dělají.');
  }
  if ((settings.githubToken || '').trim()) {
    p.push('GitHub je připojený. Repozitáře spravuj přes [AKCE:GITHUB] s JSON akcí: {"action":"create_repo","name":"nazev","description":"popis","private":true} nebo {"action":"push_file","repo":"nazev","file":"soubor-z-aplikace.html","path":"index.html"} (soubor musí být v 📁 Souborech aplikace).');
  }
  if (memory.length) {
    p.push('Trvalá paměť – důležité informace, které si o uživateli pamatuješ:\n- ' + memory.join('\n- '));
  }
  p.push('Když se uživatel zmíní o důležité informaci do budoucna (jméno, preference, projekt…), vypiš na samostatný řádek přesně tento formát: [ZAPAMATUJ: stručná informace]');
  if ((settings.extra || '').trim()) p.push('Další pokyny uživatele: ' + settings.extra.trim());
  return p.join('\n\n');
}

function extractMemory(text) {
  const found = [];
  const cleaned = String(text).replace(/\[ZAPAMATUJ:\s*([^\]]+)\]/gi, (m, g) => {
    const f = g.trim();
    if (f && !memory.includes(f)) { memory.push(f); found.push(f); }
    return '';
  }).trim();
  if (found.length) saveMemory();
  return { cleaned, found };
}

/* ---------- API: Gemini & OpenAI ---------- */
async function errFromRes(res) {
  let msg = 'HTTP ' + res.status;
  try {
    const j = await res.json();
    if (j?.error?.message) msg = j.error.message;
    else if (j?.error) msg = JSON.stringify(j.error);
  } catch (e) { /* ne-JSON */ }
  return new Error(msg);
}

async function geminiStream(history, sys, onDelta) {
  const key = settings.apiKey.trim();
  const model = currentModel();
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
    ':streamGenerateContent?alt=sse&key=' + encodeURIComponent(key);
  const body = {
    contents: geminiContents(history),
    systemInstruction: { parts: [{ text: sys }] }
  };
  if (settings.search) body.tools = [{ google_search: {} }];

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw await errFromRes(res);
  if (!res.body) return geminiGenerate(history, sys);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '';
  const sources = [];
  const takeSources = (gm) => {
    if (gm && gm.groundingChunks) {
      for (const c of gm.groundingChunks) {
        const w = c.web;
        if (w && w.uri && !sources.some((s) => s.uri === w.uri)) sources.push({ uri: w.uri, title: w.title || w.uri });
      }
    }
  };
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        const o = JSON.parse(data);
        const cand = o.candidates && o.candidates[0];
        if (cand && cand.content && cand.content.parts) {
          for (const p of cand.content.parts) {
            if (p.text) { text += p.text; onDelta(text); }
          }
        }
        takeSources(cand && cand.groundingMetadata);
      } catch (e) { /* neúplný chunk */ }
    }
  }
  return { text, sources };
}

async function geminiGenerate(history, sys) {
  const key = settings.apiKey.trim();
  const model = currentModel();
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
    ':generateContent?key=' + encodeURIComponent(key);
  const body = {
    contents: geminiContents(history),
    systemInstruction: { parts: [{ text: sys }] }
  };
  if (settings.search) body.tools = [{ google_search: {} }];
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
  const cand = j.candidates && j.candidates[0];
  let text = '';
  if (cand && cand.content && cand.content.parts) {
    for (const p of cand.content.parts) if (p.text) text += p.text;
  }
  const sources = [];
  const gm = cand && cand.groundingMetadata;
  if (gm && gm.groundingChunks) {
    for (const c of gm.groundingChunks) {
      const w = c.web;
      if (w && w.uri) sources.push({ uri: w.uri, title: w.title || w.uri });
    }
  }
  return { text, sources };
}

async function openaiStream(history, sys, onDelta) {
  const res = await fetch(openaiChatUrl(settings.provider), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keyFor(settings.provider) },
    body: JSON.stringify({
      model: currentModel(),
      stream: true,
      messages: [{ role: 'system', content: sys }].concat(history.map((m) => ({
        role: m.role,
        content: m.image
          ? [{ type: 'text', text: m.content }, { type: 'image_url', image_url: { url: m.image } }]
          : m.content
      })))
    })
  });
  if (!res.ok) throw await errFromRes(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const o = JSON.parse(data);
        const d = o.choices && o.choices[0] && o.choices[0].delta && o.choices[0].delta.content;
        if (d) { text += d; onDelta(text); }
      } catch (e) { /* neúplný chunk */ }
    }
  }
  return { text, sources: [] };
}

/* ---------- TTS (dabing) ---------- */
function pcmToWav(pcm, rate = 24000, channels = 1, bits = 16) {
  const blockAlign = channels * bits / 8;
  const byteRate = rate * blockAlign;
  const buf = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, rate, true); v.setUint32(28, byteRate, true); v.setUint16(32, blockAlign, true);
  v.setUint16(34, bits, true); w(36, 'data'); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

async function geminiTTS(text) {
  const key = settings.apiKey.trim();
  const model = (settings.ttsModel || '').trim() || 'gemini-3.8-flash-tts';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
    ':generateContent?key=' + encodeURIComponent(key);
  const body = {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        languageCode: settings.ttsLang || 'cs-CZ',
        voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.ttsVoice || 'Puck' } }
      }
    }
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const part = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!part) throw new Error('Model nevrátil audio.');
  const bin = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
  const isWav = bin.length > 12 && bin[0] === 0x52 && bin[1] === 0x49 && bin[2] === 0x46 && bin[3] === 0x46;
  return new Blob([isWav ? bin : pcmToWav(bin, 24000)], { type: 'audio/wav' });
}

/* ---------- nástroje agenta (v2) ---------- */
function geminiContents(history) {
  return history.map((m) => {
    const parts = [];
    if (m.image) {
      const data = String(m.image).split(',')[1] || '';
      parts.push({ inlineData: { mimeType: m.mime || 'image/png', data: data } });
    }
    parts.push({ text: m.content });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: parts };
  });
}

async function geminiImage(prompt) {
  const key = settings.apiKey.trim();
  const model = (settings.imgModel || '').trim() || 'gemini-3.1-flash-image';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
    ':generateContent?key=' + encodeURIComponent(key);
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const part = parts.find((p) => p.inlineData && p.inlineData.data && /^image\//.test(p.inlineData.mimeType || 'image/png'));
  if (!part) throw new Error('Model nevrátil obrázek.');
  const bin = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
  return new Blob([bin], { type: part.inlineData.mimeType || 'image/png' });
}

const WORKER_SRC = [
  "self.onmessage = function(e) {",
  "  var out = [];",
  "  function fmt(a) { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch (err) { return String(a); } }",
  "  console.log = function() { out.push([].map.call(arguments, fmt).join(' ')); };",
  "  console.error = console.warn = console.info = console.log;",
  "  try {",
  "    var r = eval(e.data);",
  "    if (r !== undefined) out.push('=> ' + fmt(r));",
  "  } catch (err) { out.push('Chyba: ' + String(err)); }",
  "  self.postMessage(out.join('\\n') || '(bez výstupu)');",
  "};"
].join('\n');

function runJS(code, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let w;
    try {
      w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })));
    } catch (e) {
      reject(new Error('Sandbox pro kód není v tomto prohlížeči k dispozici.'));
      return;
    }
    const t = setTimeout(() => {
      w.terminate();
      reject(new Error('Kód běžel déle než ' + (timeoutMs / 1000) + ' s – ukončeno.'));
    }, timeoutMs);
    w.onmessage = (ev) => {
      clearTimeout(t);
      w.terminate();
      resolve(String(ev.data || '(bez výstupu)'));
    };
    w.onerror = (ev) => {
      clearTimeout(t);
      w.terminate();
      reject(new Error(ev.message || 'Chyba v kódu.'));
    };
    w.postMessage(code);
  });
}

async function fetchWebText(url) {
  try {
    const r = await fetch('https://r.jina.ai/' + url);
    if (r.ok) {
      const t = await r.text();
      if (t && t.length > 50) return t;
    }
  } catch (e) { /* zkusíme přímo */ }
  try {
    const r = await fetch(url);
    if (r.ok) {
      return (await r.text())
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
    }
  } catch (e) { /* CORS */ }
  throw new Error('Stránku se nepodařilo načíst (omezení prohlížeče / ochrana webu).');
}

function parseAction(text) {
  let m = text.match(/\[AKCE:\s*OBRAZEK\]\s*([\s\S]+)$/i);
  if (m) return { type: 'image', prompt: m[1].trim(), icon: '🎨', label: 'Generuji obrázek' };
  m = text.match(/\[AKCE:\s*WEB\]\s*(https?:\/\/\S+)/i);
  if (m) return { type: 'web', url: m[1], icon: '🕸️', label: 'Čtu webovou stránku' };
  m = text.match(/\[AKCE:\s*HLEDEJ\]\s*([^\n\[\]]+)/i);
  if (m) return { type: 'search', query: m[1].trim(), icon: '🔎', label: 'Hledám v zákoutích internetu' };
  m = text.match(/\[AKCE:\s*K[ÓO]D\]\s*```(\w*)\n?([\s\S]*?)```/i);
  if (m) return { type: 'code', lang: (m[1] || 'javascript').toLowerCase(), code: m[2], icon: '💻', label: 'Spouštím kód' };
  m = text.match(/\[AKCE:\s*HUDBA\]\s*```(?:json)?\n?([\s\S]*?)```/i);
  if (m) {
    let score = null;
    try { score = JSON.parse(m[1]); } catch (e) { score = null; }
    return { type: 'music', score: score, icon: '🎵', label: 'Tvořím hudbu' };
  }
  m = text.match(/\[AKCE:\s*TIM\]\s*([\s\S]+)$/i);
  if (m) return { type: 'team', task: m[1].trim(), icon: '🐝', label: 'Tým AI botů pracuje paralelně' };
  m = text.match(/\[AKCE:\s*P[ŘR]I[KC]A[ZŽ]\]\s*([\s\S]+)$/i);
  if (m) return { type: 'cmd', cmd: m[1].trim(), icon: '⌨️', label: 'Spouštím příkaz na počítači' };
  m = text.match(/\[AKCE:\s*GITHUB\]\s*```(?:json)?\n?([\s\S]*?)```/i) || text.match(/\[AKCE:\s*GITHUB\]\s*(\{[\s\S]*?\})/i);
  if (m) {
    let params = null;
    try { params = JSON.parse(m[1]); } catch (e) { params = null; }
    return { type: 'github', params: params, icon: '🐙', label: 'Pracuji s GitHubem' };
  }
  m = text.match(/\[AKCE:\s*SOUBOR:\s*([^\]\n]+)\]\s*```(\w*)\n?([\s\S]*?)```/i);
  if (m) return { type: 'file', name: m[1].trim(), code: m[3], icon: '📁', label: 'Ukládám soubor' };
  return null;
}

function stripActions(text) {
  const i = String(text).search(/\[AKCE:/i);
  return (i >= 0 ? String(text).slice(0, i) : String(text)).trim();
}

async function executeAction(a, shownImages, shownAudios) {
  try {
    if (a.type === 'image') {
      const blob = await geminiImage(a.prompt);
      const url = URL.createObjectURL(blob);
      if (shownImages) shownImages.push(url);
      return '[VÝSLEDEK AKCE OBRAZEK] Obrázek byl vygenerován a je zobrazený uživateli.';
    }
    if (a.type === 'web') {
      const t = await fetchWebText(a.url);
      return '[VÝSLEDEK AKCE WEB] Text stránky (zkráceno):\n' + t.slice(0, 6000);
    }
    if (a.type === 'search') {
      const t = await metaSearch(a.query);
      return '[VÝSLEDEK AKCE HLEDEJ] Výsledky hledání (název — odkaz):\n' + t.slice(0, 6000);
    }
    if (a.type === 'music') {
      if (!a.score) return '[VÝSLEDEK AKCE HUDBA] Chyba: partitura nebyl platný JSON. Zkus to znovu.';
      const wav = await renderMusic(a.score);
      const url = URL.createObjectURL(wav);
      if (shownAudios) shownAudios.push(url);
      return '[VÝSLEDEK AKCE HUDBA] Skladba "' + (a.score.name || 'bez názvu') + '" byla vygenerována a přehrává se uživateli.';
    }
    if (a.type === 'team') {
      const t = await runHive(a.task);
      return t;
    }
    if (a.type === 'cmd') {
      if (!pcOnline) return '[VÝSLEDEK AKCE PRIKAZ] Chyba: desktop režim není připojený (appka musí běžet přes server.py v počítači). Nenavrhuj další příkazy.';
      const ok = confirm('AI chce spustit příkaz na počítači:\n\n' + a.cmd + '\n\nSchvaluješ spuštění?');
      if (!ok) return '[VÝSLEDEK AKCE PRIKAZ] Uživatel příkaz NESCHVÁLIL. Nespouštěj ho znovu.';
      const r = await pcExec(a.cmd);
      const out = (((r.stdout || '') + (r.stderr || '') + (r.error || '')).trim()) || '(bez výstupu)';
      return '[VÝSLEDEK AKCE PRIKAZ] Výsledek (exit ' + (r.code != null ? r.code : '?') + '):\n' + out.slice(0, 4000);
    }
    if (a.type === 'github') {
      if (!(settings.githubToken || '').trim()) return '[VÝSLEDEK AKCE GITHUB] Chyba: GitHub není připojený (Nastavení → Propojení).';
      const p = a.params || {};
      if (p.action === 'create_repo') {
        const name = String(p.name || 'projekt').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
        const repo = await ghCreateRepo(name, p.description, p.private !== false);
        return '[VÝSLEDEK AKCE GITHUB] Repo vytvořeno: ' + repo.html_url;
      }
      if (p.action === 'push_file') {
        const f = getFiles().find((x) => x.name === p.file);
        if (!f) return '[VÝSLEDEK AKCE GITHUB] Chyba: soubor "' + p.file + '" není v 📁 Souborech aplikace.';
        const r = await ghPushFile(String(p.repo), String(p.path || f.name), f.content, p.message);
        return '[VÝSLEDEK AKCE GITHUB] Soubor nahrán: ' + ((r.content && r.content.html_url) || 'hotovo');
      }
      return '[VÝSLEDEK AKCE GITHUB] Neznámá akce. Použij {"action":"create_repo","name":"nazev"} nebo {"action":"push_file","repo":"nazev","file":"soubor.html"}.';
    }
    if (a.type === 'code') {
      const out = await runJS(a.code);
      return '[VÝSLEDEK AKCE KOD] Výstup programu:\n' + String(out || '(bez výstupu)').slice(0, 3000);
    }
    if (a.type === 'file') {
      saveFile(a.name, a.code);
      return '[VÝSLEDEK AKCE SOUBOR] Soubor "' + a.name + '" byl uložen a uživatel si ho může stáhnout.';
    }
  } catch (e) {
    return '[VÝSLEDEK AKCE] Chyba při provádění: ' + (e.message || e);
  }
  return '[VÝSLEDEK AKCE] Neznámá akce.';
}

/* souborové úložiště */
let attachedImage = null;

function clearAttachment() {
  attachedImage = null;
  const p = $('#attachPreview');
  p.classList.add('hidden');
  p.innerHTML = '';
}

function getFiles() { return loadJSON('mai.files', []); }
function putFiles(files) { saveJSON('mai.files', files); }

function saveFile(name, content) {
  const files = getFiles();
  files.unshift({ name: name, content: content, ts: Date.now() });
  putFiles(files.slice(0, 60));
  renderFiles();
}

function renderFiles() {
  const list = $('#fileList');
  if (!list) return;
  const files = getFiles();
  if (!files.length) {
    list.innerHTML = '<p class="muted small">Zatím žádné soubory. Zkus AI napsat: „ulož mi soubor…“</p>';
    return;
  }
  list.innerHTML = '';
  files.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = 'mem-item';
    el.innerHTML = `<span>📄 ${esc(f.name)}</span><button class="dl" title="Stáhnout">⬇</button><button class="del" title="Smazat">✕</button>`;
    el.querySelector('.dl').addEventListener('click', () => downloadBlob(new Blob([f.content], { type: 'text/plain' }), f.name));
    el.querySelector('.del').addEventListener('click', () => {
      const fs = getFiles();
      fs.splice(i, 1);
      putFiles(fs);
      renderFiles();
    });
    list.appendChild(el);
  });
}

/* ---------- v3: projekty (ZIP), hudba, meta-hledání, včelí úl ---------- */
let pcOnline = false;
let lastProjectHtml = '';

async function ghApi(path, options) {
  const token = (settings.githubToken || '').trim();
  const res = await fetch('https://api.github.com' + path, Object.assign({}, options || {}, {
    headers: Object.assign({
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }, (options && options.headers) || {})
  }));
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || ('GitHub HTTP ' + res.status));
  return j;
}

async function ghCreateRepo(name, description, isPrivate) {
  return ghApi('/user/repos', {
    method: 'POST',
    body: JSON.stringify({ name: name, description: description || 'Projekt z Dark AI', private: isPrivate !== false, auto_init: true })
  });
}

async function ghPushFile(repo, path, content, message) {
  const user = await ghApi('/user');
  const b64 = btoa(unescape(encodeURIComponent(content)));
  let sha;
  try {
    const existing = await ghApi('/repos/' + user.login + '/' + repo + '/contents/' + path);
    sha = existing.sha;
  } catch (e) { /* nový soubor */ }
  return ghApi('/repos/' + user.login + '/' + repo + '/contents/' + path, {
    method: 'PUT',
    body: JSON.stringify(Object.assign({ message: message || 'Aktualizace z Dark AI', content: b64, branch: 'main' }, sha ? { sha: sha } : {}))
  });
}

async function pcExec(cmd) {
  try {
    const res = await fetch('api/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: cmd })
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: 'Desktop server není dostupný.' };
  }
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function ghPutFile(repo, path, b64, message) {
  const user = await ghApi('/user');
  let sha;
  try {
    const existing = await ghApi('/repos/' + user.login + '/' + repo + '/contents/' + path);
    sha = existing.sha;
  } catch (e) { /* nový soubor */ }
  return ghApi('/repos/' + user.login + '/' + repo + '/contents/' + path, {
    method: 'PUT',
    body: JSON.stringify(Object.assign({ message: message || 'Aktualizace z Dark AI', content: b64, branch: 'main' }, sha ? { sha: sha } : {}))
  });
}

async function deployApp() {
  const token = (settings.githubToken || '').trim();
  const status = $('#deployStatus');
  if (!token) { toast('Nejdřív vlož GitHub token v kartě výše ☝️'); return; }
    const raw = (prompt('Název repozitáře pro appku (vznikne adresa tvujucet.github.io/nazev):', (settings.appName || 'dark-ai').toLowerCase().replace(/[^a-z0-9._-]+/g, '-')) || '').trim();
  if (!raw) return;
  const name = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  try {
    status.textContent = '⏳ Vytvářím repozitář…';
    let repo;
    try {
      repo = await ghCreateRepo(name, (settings.appName || 'Dark AI') + ' – osobní AI asistent (webová appka)', false);
    } catch (e) {
      if (!/already exists/i.test(e.message || '')) throw e;
      const u0 = await ghApi('/user');
      repo = await ghApi('/repos/' + u0.login + '/' + name);
    }
    const files = ['index.html', 'style.css', 'app.js', 'theme.js', 'plugins.js', 'manifest.webmanifest', 'sw.js', 'icons/icon-512.png'];
    for (let i = 0; i < files.length; i++) {
      status.textContent = '⏳ Nahrávám soubory (' + (i + 1) + '/' + files.length + '): ' + files[i];
      let b64;
      if (files[i] === 'theme.js') {
        b64 = btoa(unescape(encodeURIComponent(buildThemeJs())));
      } else if (files[i] === 'plugins.js') {
        b64 = btoa(unescape(encodeURIComponent(buildPluginsJs())));
      } else {
        const res = await fetch(files[i]);
        if (!res.ok) continue;
        const isBin = /\.(png|jpg|jpeg|ico)$/i.test(files[i]);
        b64 = isBin ? arrayBufferToBase64(await res.arrayBuffer()) : btoa(unescape(encodeURIComponent(await res.text())));
      }
      await ghPutFile(name, files[i], b64, 'Aktualizace: ' + files[i]);
    }
    status.textContent = '⏳ Zapínám hosting (GitHub Pages)…';
    const user = await ghApi('/user');
    try {
      await ghApi('/repos/' + user.login + '/' + name + '/pages', {
        method: 'POST',
        body: JSON.stringify({ source: { branch: 'main', path: '/' } })
      });
    } catch (e) {
      if (!/already/i.test(e.message || '')) {
        status.innerHTML = '⚠️ Soubory jsou nahrané, ale Pages se nepodařilo zapnout automaticky. Zapni je ručně: v repu na GitHubu → <b>Settings → Pages → Deploy from branch → main</b>.';
        return;
      }
    }
    const url = 'https://' + user.login + '.github.io/' + name + '/';
    status.innerHTML = '✅ Živé! Tvá appka běží na <a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a> (zprovoznění trvá 1–2 minuty). Otevři ji a dej <b>Přidat na plochu</b> – ať ji máš jako appku.';
    toast('🎉 Appka je na hostingu!');
  } catch (e) {
    status.textContent = '❌ ' + (e.message || e);
  }
}

async function pcLoadFiles(path) {
  try {
    const r = await (await fetch('api/files?path=' + encodeURIComponent(path || '~'))).json();
    if (!r.ok) throw new Error(r.error || 'Složku nelze načíst');
    $('#pcPath').value = r.path;
    const list = $('#pcFiles');
    list.innerHTML = '';
    const base = String(r.path).replace(/[\\/]+$/, '');
    (r.entries || []).forEach((e) => {
      const el = document.createElement('div');
      el.className = 'mem-item';
      el.style.cursor = 'pointer';
      el.innerHTML = `<span>${e.dir ? '📁' : '📄'} ${esc(e.name)}</span><button class="dl" title="Otevřít">↗</button>`;
      el.addEventListener('click', () => {
        const full = base + '/' + e.name;
        if (e.dir) pcLoadFiles(full);
        else fetch('api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: full }) });
      });
      list.appendChild(el);
    });
    if (!(r.entries || []).length) list.innerHTML = '<p class="muted small">Prázdná složka.</p>';
  } catch (e) {
    toast('Soubory: ' + e.message);
  }
}

async function pcLoadTasks() {
  try {
    const r = await (await fetch('api/tasks')).json();
    const list = $('#taskList');
    if (!list) return;
    list.innerHTML = '';
    (r.tasks || []).forEach((t) => {
      const el = document.createElement('div');
      el.className = 'mem-item';
      const spec = t.spec && t.spec.type === 'every'
        ? ('každých ' + t.spec.min + ' min')
        : ('každý den ' + ((t.spec && t.spec.time) || '08:00'));
      el.innerHTML = `<span>⏰ <b>${esc(t.name)}</b> – ${esc(spec)} <i class="muted">${esc(t.cmd)}</i></span><button class="del" title="Smazat">✕</button>`;
      el.querySelector('.del').addEventListener('click', async () => {
        await fetch('api/tasks/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) });
        pcLoadTasks();
      });
      list.appendChild(el);
    });
    if (!(r.tasks || []).length) list.innerHTML = '<p class="muted small">Zatím žádné naplánované úkoly.</p>';
  } catch (e) { /* offline – sekce je prázdná */ }
}

async function detectPC() {
  try {
    const res = await fetch('api/status');
    if (res.ok) {
      const j = await res.json();
      pcOnline = !!(j && j.ok);
    }
  } catch (e) {
    pcOnline = false;
  }
  const badge = $('#pcStatus');
  if (badge) {
    badge.textContent = pcOnline ? 'online – automatizace k dispozici' : 'offline – potřebuješ desktop appku';
    badge.style.background = pcOnline ? 'rgba(80,220,120,0.2)' : 'rgba(255,180,60,0.2)';
    badge.style.color = pcOnline ? '#8dffb0' : '#ffc46b';
  }
  syncHeader();
}

async function chatOnce(history, sys) {
  if (settings.provider !== 'gemini') {
    const res = await fetch(openaiChatUrl(settings.provider), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keyFor(settings.provider) },
      body: JSON.stringify({
        model: currentModel(),
        messages: [{ role: 'system', content: sys }].concat(history.map((m) => ({ role: m.role, content: m.content })))
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
    return { text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '', sources: [] };
  }
  return geminiGenerate(history, sys);
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(String(f.name || 'soubor.txt'));
    const data = enc.encode(String(f.content || ''));
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
    local.set(name, 30);
    chunks.push(local, data);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob(chunks.concat(central, [end]), { type: 'application/zip' });
}

const NOTE_RE = /^([A-G])(#|b)?(\d)$/;
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(name) {
  const m = String(name).match(NOTE_RE);
  if (!m) return 440;
  const s = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (s - 9) / 12 + (+m[3] - 4));
}

function audioBufferToWav(buffer) {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytes = new Uint8Array(44 + len * numCh * 2);
  const dv = new DataView(bytes.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + len * numCh * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, numCh, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * numCh * 2, true); dv.setUint16(32, numCh * 2, true);
  dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, len * numCh * 2, true);
  const chs = [];
  for (let c = 0; c < numCh; c++) chs.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = Math.max(-1, Math.min(1, chs[c][i]));
      dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

async function renderMusic(score) {
  const bpm = Math.max(40, Math.min(220, score.bpm || 100));
  const spb = 60 / bpm;
  const bars = Math.max(1, Math.min(32, score.bars || 8));
  const dur = bars * 4 * spb + 1.2;
  const sr = 44100;
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC) throw new Error('Tvůj prohlížeč neumí syntézu zvuku.');
  const ctx = new AC(2, Math.ceil(sr * dur), sr);
  const master = ctx.createGain();
  master.gain.value = 0.75;
  master.connect(ctx.destination);

  function tone(freq, t, d, type, gain) {
    if (!(freq > 0) || t < 0) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.06, d));
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + d + 0.08);
  }
  function drum(kind, t) {
    if (t < 0) return;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.25);
    } else {
      const len = kind === 'hat' ? 0.05 : 0.16;
      const buf = ctx.createBuffer(1, Math.ceil(sr * len), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const g = ctx.createGain();
      g.gain.value = kind === 'hat' ? 0.22 : 0.5;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
    }
  }
  for (const n of (score.melody || [])) tone(noteFreq(n.n), (n.t || 0) * spb, (n.d || 0.5) * spb * 0.95, score.melodyType || 'triangle', 0.32);
  for (const n of (score.bass || [])) tone(noteFreq(n.n), (n.t || 0) * spb, (n.d || 1) * spb * 0.95, 'sine', 0.5);
  for (const d of (score.drums || [])) drum(d.k, (d.t || 0) * spb);
  const rendered = await ctx.startRendering();
  return audioBufferToWav(rendered);
}

async function metaSearch(query) {
  const lines = [];
  const seen = new Set();
  const targets = [];
  if (settings.searchDDG !== false) {
    targets.push('https://duckduckgo.com/html/?q=' + encodeURIComponent(query));
    targets.push('https://duckduckgo.com/html/?q=' + encodeURIComponent(query + ' fórum OR blog OR recenze'));
  }
  if (settings.searchSocial) {
    targets.push('https://www.bing.com/search?q=' + encodeURIComponent('(' + query + ') (site:instagram.com OR site:tiktok.com OR site:youtube.com OR site:reddit.com)'));
  }
  if (!targets.length) {
    targets.push('https://duckduckgo.com/html/?q=' + encodeURIComponent(query));
  }
  for (const url of targets.slice(0, 3)) {
    try {
      const t = await fetchWebText(url);
      const re = /\[([^\]\n]{4,140})\]\((https?:\/\/[^\s)]+)\)/g;
      let m, count = 0;
      while ((m = re.exec(t)) && count < 8) {
        const link = m[2].replace(/&amp;/g, '&');
        if (/duckduckgo\.com|bing\.com|microsoft\.com|go\.microsoft/.test(link)) continue;
        if (seen.has(link)) continue;
        seen.add(link);
        lines.push('- ' + m[1].trim() + ' — ' + link);
        count++;
      }
    } catch (e) {
      lines.push('- (zdroj se nepodařilo načíst: ' + url.split('/')[2] + ')');
    }
  }
  return lines.length ? lines.join('\n') : 'Žádné výsledky se nepodařilo načíst.';
}

async function runHive(task) {
  const roles = [
    { name: '🔍 Badatel', sys: 'Jsi badatel. Prozkoumej úkol, najdi klíčová fakta, souvislosti a co je důležité vědět.' },
    { name: '⚠️ Kritik', sys: 'Jsi kritický myslitel. Najdi slabá místa, rizika, protiargumenty a slepé skvrny.' },
    { name: '💡 Kreativec', sys: 'Jsi kreativec. Přines neotřelé nápady, možnosti a řešení, na které by ostatní nepřišli.' },
    { name: '🔧 Praktik', sys: 'Jsi praktik. Navrhni konkrétní postup krok za krokem, jak úkol vyřešit.' },
    { name: '📊 Analytik', sys: 'Jsi analytik. Rozlož úkol na data, čísla, trendy a měřitelné souvislosti.' },
    { name: '🗺️ Plánovač', sys: 'Jsi plánovač. Navrhni strategii, milníky a pořadí kroků s časovým odhadem.' }
  ];
  const n = Math.max(2, Math.min(6, settings.hiveSize || 4));
  const team = roles.slice(0, n);
  const results = await Promise.all(team.map(async (r) => {
    try {
      const res = await chatOnce(
        [{ role: 'user', content: task }],
        r.sys + '\n\nOdpovídej česky, stručně a věcně, maximálně 120 slov.'
      );
      return '### ' + r.name + '\n' + (res.text || '').trim();
    } catch (e) {
      return '### ' + r.name + '\n(chyba: ' + (e.message || e) + ')';
    }
  }));
  return '[VÝSLEDEK AKCE TIM] Včelí úl – ' + n + ' AI botů zpracovalo úkol paralelně. Jejich výstupy:\n\n' +
    results.join('\n\n') +
    '\n\n(Shrň tyto výstupy do jedné kvalitní odpovědi pro uživatele.)';
}

async function generateWebProject(desc) {
  const sys = 'Jsi špičkový webový vývojář a designér. Vytvoř KOMPLETNÍ jednosouborovou HTML stránku/aplikaci podle zadání: veškeré CSS i JS vnořené uvnitř, moderní vzhled, plně funkční, texty česky (pokud zadání neurčí jinak). Vrať POUZE jeden ```html blok s kompletním souborem.';
  const r = await chatOnce([{ role: 'user', content: desc }], sys);
  const m = r.text.match(/```(?:html)?\n?([\s\S]*?)```/);
  if (!m) throw new Error('Model nevrátil HTML kód.');
  return m[1];
}

async function generateMusicScore(prompt) {
  const sys = 'Jsi skladatel a zvukový designér. Vytvoř skladbu jako JSON partituru pro syntezátor. Vrať POUZE jeden ```json blok. Schéma: {"name":"Název","bpm":90,"bars":8,"melody":[{"n":"C4","t":0,"d":1}],"bass":[{"n":"C2","t":0,"d":2}],"drums":[{"t":0,"k":"kick"},{"t":2,"k":"snare"},{"t":1,"k":"hat"}]}. n=nota (C0–B7, #/b), t=začátek v beatech (0..bars*4), d=délka v beatech, k=kick|snare|hat. Melodie i basa: opakující se smyčka 4–8 taktů, bicí drží rytmus.';
  const r = await chatOnce([{ role: 'user', content: prompt }], sys);
  const m = r.text.match(/```(?:json)?\n?([\s\S]*?)```/) || r.text.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error('Model nevrátil partituru.');
  return JSON.parse(m[1]);
}

/* ---------- hlas: předčítání ---------- */
let speakResolve = null, currentAudio = null;

function stopSpeak() {
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
  if (speakResolve) { const r = speakResolve; speakResolve = null; r(); }
}

function speechText(t) {
  return String(t)
    .replace(/```[\s\S]*?```/g, ' Kód vypuštěn. ')
    .replace(/\[ZAPAMATUJ:[^\]]*\]/gi, '')
    .replace(/[#*`>_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

function speak(text) {
  return new Promise((resolve) => {
    if (!text) { resolve(); return; }
    stopSpeak();
    speakResolve = resolve;
    const done = () => { if (speakResolve === resolve) { speakResolve = null; resolve(); } };
    const browserTTS = () => {
      if (!window.speechSynthesis) { done(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = settings.ttsLang || settings.recLang || 'cs-CZ';
      const voices = window.speechSynthesis.getVoices() || [];
      const pref = u.lang.split('-')[0];
      const v = voices.find((x) => x.lang === u.lang) || voices.find((x) => x.lang && x.lang.startsWith(pref));
      if (v) u.voice = v;
      u.rate = 1.03;
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    };
    const useGemini = settings.apiKey && (settings.ttsEngine === 'gemini' || settings.ttsEngine === 'auto');
    if (useGemini) {
      geminiTTS(text).then((blob) => {
        const audio = new Audio(URL.createObjectURL(blob));
        currentAudio = audio;
        audio.onended = done;
        audio.onerror = () => { currentAudio = null; done(); };
        audio.play().catch(() => { currentAudio = null; browserTTS(); });
      }).catch((e) => {
        if (settings.ttsEngine === 'gemini') toast('AI hlas selhal (' + (e.message || e) + ') – zkouším hlas prohlížeče.');
        browserTTS();
      });
    } else {
      browserTTS();
    }
  });
}

/* ---------- hlas: mikrofon ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, callMode = false, recFinal = '';

function setListeningUI(on, interim) {
  $('#recBar').classList.toggle('hidden', !on);
  if (on && interim) $('#recText').textContent = interim;
  $('#btnMic').classList.toggle('listening', on);
  $('#btnCall').classList.toggle('listening', callMode);
  if (on) $('#topStatus').textContent = 'poslouchám…';
  else if ($('#topStatus').textContent === 'poslouchám…') $('#topStatus').textContent = 'připraven/a';
}

function startListen() {
  if (!SR) { toast('Rozpoznávání řeči nepodporuje tento prohlížeč. Zkus Chrome.'); return; }
  if (listening) return;
  try { rec = new SR(); } catch (e) { toast('Mikrofon nejde spustit.'); return; }
  rec.lang = settings.recLang || 'cs-CZ';
  rec.interimResults = true;
  rec.continuous = true;
  recFinal = '';
  rec.onstart = () => { listening = true; setListeningUI(true, 'Poslouchám…'); };
  rec.onerror = (e) => {
    const err = e && e.error;
    if (err === 'not-allowed' || err === 'service-not-allowed') {
      toast('Mikrofon je blokovaný. Otevři appku v nové kartě prohlížeče (ne v náhledu) a povol mikrofon.', 6500);
    } else if (err && err !== 'no-speech' && err !== 'aborted') {
      toast('Chyba mikrofonu: ' + err);
    }
  };
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) recFinal += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    setListeningUI(true, (recFinal + interim).trim() || 'Poslouchám…');
  };
  rec.onend = () => {
    listening = false;
    setListeningUI(false);
    const said = recFinal.trim();
    if (said) {
      const input = $('#input');
      if (callMode) {
        input.value = said;
        send(said);
        input.value = '';
      } else {
        input.value = (input.value ? input.value + ' ' : '') + said;
        input.dispatchEvent(new Event('input'));
      }
    }
  };
  try { rec.start(); } catch (e) { /* už běží */ }
}

function stopListen() {
  callMode = false;
  $('#btnCall').classList.remove('listening');
  try { if (rec) rec.stop(); } catch (e) {}
  setListeningUI(false);
}

/* ---------- chat ---------- */
const emptyStateEl = $('#emptyState');

function getChat(create) {
  let c = chats.find((x) => x.id === currentChatId);
  if (!c && create) {
    c = { id: uid(), title: 'Nový chat', messages: [], ts: Date.now() };
    chats.unshift(c);
    currentChatId = c.id;
    saveChats();
  }
  return c;
}

function fillChatList(list) {
  if (!list) return;
  list.innerHTML = '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  let lastGroup = null;
  for (const c of chats) {
    const ts = new Date(c.ts || 0);
    let g = '⭐️ Starší';
    if (ts >= today) g = 'Dnes';
    else if (ts >= yest) g = 'Včera';
    if (g !== lastGroup) {
      lastGroup = g;
      const h = document.createElement('div');
      h.className = 'side-label';
      h.textContent = g;
      list.appendChild(h);
    }
    const el = document.createElement('div');
    el.className = 'chat-item' + (c.id === currentChatId ? ' active' : '');
    el.innerHTML = `<span>${esc(c.title)}</span><button class="ren" title="Přejmenovat">✎</button><button class="del" title="Smazat">✕</button>`;
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('del')) {
        if (!confirm('Opravdu smazat chat „' + c.title + '“?')) return;
        chats = chats.filter((x) => x.id !== c.id);
        if (currentChatId === c.id) currentChatId = chats[0] ? chats[0].id : null;
        saveChats(); renderChatList(); renderMessages();
        return;
      }
      if (e.target.classList.contains('ren')) {
        const t = prompt('Nový název chatu:', c.title);
        if (t && t.trim()) { c.title = t.trim().slice(0, 40); saveChats(); renderChatList(); }
        return;
      }
      currentChatId = c.id;
      saveChats(); renderChatList(); renderMessages();
      closeDrawer();
      hideChatPanel();
      switchView('chat');
    });
    list.appendChild(el);
  }
}

function renderChatList() {
  fillChatList($('#chatList'));
  fillChatList($('#chatPanelList'));
  renderChatStrip();
}

function renderChatStrip() {
  const s = $('#chatStrip');
  if (!s) return;
  s.innerHTML = '';
  const add = document.createElement('button');
  add.className = 'strip-chip add';
  add.textContent = '＋ Nový chat';
  add.addEventListener('click', () => {
    hideChatPanel();
    $('#btnNewChat').click();
  });
  s.appendChild(add);
  for (const c of chats) {
    const el = document.createElement('button');
    el.className = 'strip-chip' + (c.id === currentChatId ? ' active' : '');
    el.textContent = c.title;
    el.title = c.title;
    el.addEventListener('click', () => {
      if (c.id === currentChatId) return;
      currentChatId = c.id;
      saveChats(); renderChatList(); renderMessages();
      switchView('chat');
    });
    s.appendChild(el);
  }
  const act = s.querySelector('.strip-chip.active');
  if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function hideChatPanel() { $('#chatPanel').classList.add('hidden'); }

function scrollBottom() {
  const m = $('#messages');
  m.scrollTop = m.scrollHeight;
}

function addMessageEl(role, content, sources) {
  const wrap = $('#messages .inner');
  let inner = wrap;
  if (!inner) {
    $('#messages').innerHTML = '';
    inner = document.createElement('div');
    inner.className = 'inner';
    $('#messages').appendChild(inner);
  }
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  const who = role === 'user' ? '🧑' : (settings.avatar || '🤖');
  el.innerHTML = `<div class="who">${who}</div><div class="bubble"></div>`;
  inner.appendChild(el);
  const bubble = el.querySelector('.bubble');
  bubble.innerHTML = renderMd(content || '');
  if (sources && sources.length) {
    bubble.insertAdjacentHTML('beforeend',
      '<div class="sources">🌐 Zdroje: ' + sources.map((s) => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('') + '</div>');
  }
  scrollBottom();
  return el;
}

function renderMessages() {
  const chat = chats.find((x) => x.id === currentChatId);
  const msgs = chat ? chat.messages : [];
  if (!msgs.length) {
    $('#messages').innerHTML = '';
    $('#messages').appendChild(emptyStateEl);
    return;
  }
  $('#messages').innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'inner';
  $('#messages').appendChild(inner);
  for (const m of msgs) {
    const el = document.createElement('div');
    el.className = 'msg ' + m.role;
    const who = m.role === 'user' ? '🧑' : (settings.avatar || '🤖');
    el.innerHTML = `<div class="who">${who}</div><div class="bubble">${renderMd(m.content)}` +
      (m.image ? `<img class="chat-img" src="${m.image}" alt="přiložený obrázek">` : '') + `</div>`;
    if (m.sources && m.sources.length) {
      el.querySelector('.bubble').insertAdjacentHTML('beforeend',
        '<div class="sources">🌐 Zdroje: ' + m.sources.map((s) => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('') + '</div>');
    }
    inner.appendChild(el);
  }
  scrollBottom();
}

let sending = false;

async function send(text) {
  text = (text || '').trim();
  if (!text || sending) return;
  if ((settings.chatMode || 'agent') === 'team') { return sendTeam(text); }
  if (!keyFor(settings.provider || 'gemini').trim()) {
    const where = settings.provider === 'openrouter' ? 'OpenRouter klíč (openrouter.ai/keys)' : 'API klíč (aistudio.google.com/apikey)';
    toast('Nejdřív přidej ' + where + ' v Nastavení → Mozek 🧠', 6000);
    switchView('settings');
    return;
  }
  sending = true;
  stopSpeak();
  const chat = getChat(true);
  const userMsg = { role: 'user', content: text };
  if (attachedImage) {
    userMsg.image = attachedImage.dataUrl;
    userMsg.mime = attachedImage.mime;
    clearAttachment();
  }
  chat.messages.push(userMsg);
  if (chat.title === 'Nový chat') chat.title = text.slice(0, 32);
  saveChats();
  renderChatList();
  renderMessages();

  const el = addMessageEl('assistant', '');
  const bubble = el.querySelector('.bubble');
  bubble.innerHTML = '<span class="cursor"></span>';
  $('#topStatus').textContent = 'přemýšlím…';

  const sys = buildSystem() + (settings.chatMode === 'chat'
    ? '\n\nRežim čistého chatu: NEPOUŽÍVEJ žádné [AKCE:…] příkazy ani speciální značky, jen odpovídej textem.'
    : '');
  let replyText = '';
  const shownImages = [];
  const shownAudios = [];

  try {
    if ((settings.chatMode || 'agent') === 'battle') {
      const modelA = currentModel();
      const modelB = settings.battleModel || 'gemini-3.5-flash-lite';
      const labelA = modelLabel(modelA), labelB = modelLabel(modelB);
      bubble.innerHTML = renderMd('⚔️ **Battle** – ' + labelA + ' vs ' + labelB) +
        '<div class="battle-grid">' +
        '<div class="battle-col"><b>🅰️ ' + esc(labelA) + '</b><div class="btl" id="btlA"><span class="cursor"></span></div></div>' +
        '<div class="battle-col"><b>🅱️ ' + esc(labelB) + '</b><div class="btl" id="btlB"><span class="cursor"></span></div></div>' +
        '</div>';
      scrollBottom();
      const bHistory = chat.messages.slice(-30).map((m) => ({ role: m.role, content: m.content, image: m.image, mime: m.mime }));
      let aText = '', bText = '';
      try { aText = ((await chatOnceWith(modelA, bHistory, sys)).text || '').trim(); } catch (e) { aText = '(chyba: ' + (e.message || e) + ')'; }
      $('#btlA').innerHTML = renderMd(aText);
      scrollBottom();
      try { bText = ((await chatOnceWith(modelB, bHistory, sys)).text || '').trim(); } catch (e) { bText = '(chyba: ' + (e.message || e) + ')'; }
      $('#btlB').innerHTML = renderMd(bText);
      bubble.insertAdjacentHTML('beforeend',
        '<div class="battle-vote"><button class="btn" data-w="a">👍 A lepší</button><button class="btn" data-w="b">👍 B lepší</button></div>');
      bubble.querySelectorAll('.battle-vote button').forEach((b) => b.addEventListener('click', () => {
        const score = settings.battleScore || (settings.battleScore = {});
        const m = b.dataset.w === 'a' ? modelA : modelB;
        score[m] = (score[m] || 0) + 1;
        saveSettings();
        toast('👍 Výhra: ' + (b.dataset.w === 'a' ? labelA : labelB));
      }));
      chat.messages.push({
        role: 'assistant',
        content: '⚔️ **Battle: ' + labelA + ' vs ' + labelB + '**\n\n**🅰️ ' + labelA + '**\n' + aText + '\n\n**🅱️ ' + labelB + '**\n' + bText
      });
      saveChats();
      scrollBottom();
    } else {
    for (let step = 0; step < 4; step++) {
      const history = chat.messages.slice(-30).map((m) => ({ role: m.role, content: m.content, image: m.image, mime: m.mime }));
      let result;
      const onDelta = (t) => {
        bubble.innerHTML = renderMd(stripActions(t)) + '<span class="cursor"></span>';
        scrollBottom();
      };
      if (settings.provider !== 'gemini') {
        result = await openaiStream(history, sys, onDelta);
      } else {
        try {
          result = await geminiStream(history, sys, onDelta);
        } catch (e1) {
          result = await geminiGenerate(history, sys);
        }
      }
      const raw = (result.text || '').trim() || '(model nevrátil odpověď)';
      const action = (settings.chatMode === 'chat') ? null : parseAction(raw);
      if (!action) {
        const mem = extractMemory(raw);
        const content = mem.cleaned;
        replyText = content;
        chat.messages.push({ role: 'assistant', content: content, sources: result.sources || [] });
        saveChats();
        bubble.innerHTML = renderMd(content);
        for (const u of shownImages) {
          bubble.insertAdjacentHTML('beforeend', `<img class="chat-img" src="${u}" alt="vygenerovaný obrázek">`);
        }
        for (const u of shownAudios) {
          bubble.insertAdjacentHTML('beforeend', `<audio class="chat-audio" controls src="${u}"></audio>`);
        }
        if (mem.found.length) {
          bubble.insertAdjacentHTML('beforeend',
            mem.found.map((f) => `<div class="mem-chip">🧠 Uloženo do paměti: ${esc(f)}</div>`).join(''));
          renderMemory();
        }
        if (result.sources && result.sources.length) {
          bubble.insertAdjacentHTML('beforeend',
            '<div class="sources">🌐 Zdroje: ' + result.sources.map((s) => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('') + '</div>');
        }
        renderChatList();
        break;
      }
      // model chce použít nástroj – zobraz akci, proveď ji a pošli výsledek zpět
      bubble.innerHTML = renderMd(stripActions(raw)) +
        `<div class="mem-chip">${action.icon} ${esc(action.label)}…</div>`;
      scrollBottom();
      const note = stripActions(raw) || ('*(' + action.icon + ' ' + action.label + ')*');
      chat.messages.push({ role: 'assistant', content: note });
      const resultText = await executeAction(action, shownImages, shownAudios);
      chat.messages.push({ role: 'user', content: resultText });
      saveChats();
      if (step === 3) {
        bubble.innerHTML = renderMd(stripActions(raw)) +
          `<div class="mem-chip">⚠️ Limit kroků agenta dosažen.</div>` +
          shownImages.map((u) => `<img class="chat-img" src="${u}" alt="obrázek">`).join('');
      }
    }
    }
    renderChatList();
  } catch (e) {
    const msg = e.message || String(e);
    const quota = /quota|429|rate|RESOURCE_EXHAUSTED|exceeded/i.test(msg);
    let done = false;
    if (!done && /unavailable for free|model not found|no endpoints|does not exist/i.test(msg) && providerForModel(settings.model || '') === 'openrouter') {
      settings.model = 'openrouter/free';
      saveSettings(); syncModeUI();
      try {
        const hist2 = chat.messages.slice(-30).map((m) => ({ role: m.role, content: m.content, image: m.image, mime: m.mime }));
        const r2 = await chatOnce(hist2, buildSystem());
        const content2 = ((r2.text || '').trim()) || '(model nevrátil odpověď)';
        chat.messages.push({ role: 'assistant', content: content2 });
        saveChats();
        bubble.innerHTML = '<div class="mem-chip">🆓 Model zdarma skončil – přepnul jsem na Router zdarma</div>' + renderMd(content2);
        done = true;
      } catch (e2) { /* zkusí se spodní hláška */ }
    }
    if (quota && /3\.8/.test(settings.model || '')) {
      settings.model = 'gemini-3.5-flash-lite';
      saveSettings(); syncModeUI();
      try {
        const hist = chat.messages.slice(-30).map((m) => ({ role: m.role, content: m.content, image: m.image, mime: m.mime }));
        const r = await chatOnce(hist, buildSystem());
        const content = ((r.text || '').trim()) || '(model nevrátil odpověď)';
        chat.messages.push({ role: 'assistant', content });
        saveChats();
        bubble.innerHTML = '<div class="mem-chip">💨 Přepnul jsem na Gemini 3.5 Lite (model 3.8 má plný limit)</div>' + renderMd(content);
        done = true;
      } catch (e2) { /* zkusí se spodní hláška */ }
    }
    if (!done) {
      if (quota) {
        bubble.innerHTML = '<p>⚠️ AI teď má plno (dočasný limit zdarma) – nic se neděje.</p>' +
          '<p class="muted small">Počkej pár minut a zkus to znovu. Využití limitu najdeš na aistudio.google.com (sekce Usage).</p>';
      } else {
        bubble.innerHTML = '<p>⚠️ Chyba: ' + esc(msg) + '</p>' +
          '<p class="muted small">Zkontroluj API klíč, model a připojení v Nastavení. U Gemini zdarma klíč získeš na aistudio.google.com/apikey.</p>';
      }
    }
  } finally {
    $('#topStatus').textContent = 'připraven/a';
    scrollBottom();
    sending = false;
    if (replyText && settings.voiceReplies) {
      await speak(speechText(replyText));
    }
    if (callMode) startListen();
  }
}

async function sendTeam(text) {
  text = (text || '').trim();
  if (!text || sending) return;
  if (!keyFor(settings.provider || 'gemini').trim()) {
    toast('Nejdřív přidej API klíč (Nastavení → Mozek 🧠).');
    switchView('settings');
    return;
  }
  sending = true;
  stopSpeak();
  const chat = getChat(true);
  chat.messages.push({ role: 'user', content: '🐝 Tým AI: ' + text });
  if (chat.title === 'Nový chat') chat.title = text.slice(0, 32);
  saveChats(); renderChatList(); renderMessages();
  const el = addMessageEl('assistant', '');
  const bubble = el.querySelector('.bubble');
  bubble.innerHTML = '<div class="mem-chip">🐝 Tým AI (více modelů) přemýšlí…</div><span class="cursor"></span>';
  $('#topStatus').textContent = 'tým přemýšlí…';
  try {
    const hive = await runHive(text);
    const r = await chatOnce([{ role: 'user', content: hive }],
      'Jsi vedoucí AI týmu. Shrň výstupy všech členů týmu do jedné kvalitní, přehledné odpovědi pro uživatele. Česky, s odrážkami.');
    const content = '🐝 **Tým AI** – ' + (settings.hiveSize || 4) + ' specialistů spolupracovalo\n\n' + (r.text || '').trim();
    chat.messages.push({ role: 'assistant', content });
    saveChats();
    bubble.innerHTML = renderMd(content);
  } catch (e) {
    bubble.innerHTML = '<p>⚠️ Chyba: ' + esc(e.message || String(e)) + '</p>';
  } finally {
    $('#topStatus').textContent = 'připraven/a';
    scrollBottom();
    sending = false;
    renderChatList();
    if (callMode) startListen();
  }
}

/* ---------- Studio: dabing, video, Veo ---------- */
let stAudioBlob = null;

function pcmReady() { return stAudioBlob; }

$('#stTts').addEventListener('click', async () => {
  const text = $('#stScript').value.trim();
  if (!text) { toast('Napiš nejdřív text, který má AI namluvit.'); return; }
  if (!settings.apiKey.trim()) { toast('AI hlas potřebuje API klíč (Nastavení → Mozek 🧠).'); switchView('settings'); return; }
  const btn = $('#stTts');
  btn.disabled = true; btn.textContent = '⏳ Generuji hlas…';
  try {
    stAudioBlob = await geminiTTS(text);
    const url = URL.createObjectURL(stAudioBlob);
    $('#stWav').href = url; $('#stWav').hidden = false;
    $('#stPlay').disabled = false;
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} }
    currentAudio = new Audio(url);
    currentAudio.play().catch(() => {});
    toast('Dabing hotový 🎉 Můžeš ho přehrát nebo stáhnout.');
  } catch (e) {
    toast('AI hlas selhal (' + (e.message || e) + '). Zkouším hlas prohlížeče (bez stahování).', 6000);
    speak(text);
  } finally {
    btn.disabled = false; btn.textContent = '🎙️ Vygenerovat dabing';
  }
});

$('#stPlay').addEventListener('click', () => {
  if (!stAudioBlob) return;
  if (currentAudio) { try { currentAudio.pause(); } catch (e) {} }
  currentAudio = new Audio(URL.createObjectURL(stAudioBlob));
  currentAudio.play().catch(() => {});
});

$('#stVideo').addEventListener('click', async () => {
  const text = $('#stScript').value.trim();
  if (!text) { toast('Napiš text (scénář) – vznikne z něj video s dabingem.'); return; }
  const btn = $('#stVideo');
  btn.disabled = true; btn.textContent = '⏳ Tvořím video…';
  toast('Tvořím video… podle délky textu to chvíli trvá.', 5000);
  try {
    let audioBlob = stAudioBlob;
    if (!audioBlob && settings.apiKey.trim()) {
      try {
        audioBlob = await geminiTTS(text);
        stAudioBlob = audioBlob;
        $('#stWav').href = URL.createObjectURL(audioBlob); $('#stWav').hidden = false;
        $('#stPlay').disabled = false;
      } catch (e) { /* video bude tiché */ }
    }
    const blob = await makeKineticVideo(text, audioBlob);
    const url = URL.createObjectURL(blob);
    $('#stVideoPlayer').src = url;
    $('#stVideoWrap').hidden = false;
    $('#stVideoDl').href = url; $('#stVideoDl').hidden = false;
    toast('Video hotové 🎬');
  } catch (e) {
    toast('Video se nepodařilo vytvořit: ' + (e.message || e), 6000);
  } finally {
    btn.disabled = false; btn.textContent = '🎬 Vytvořit video';
  }
});

async function makeKineticVideo(text, audioBlob) {
  if (!window.MediaRecorder) throw new Error('Tvůj prohlížeč neumí nahrávat video (MediaRecorder).');
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const words = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 400);

  let audioEl = null;
  let dur = Math.max(4, words.length * 0.42);
  if (audioBlob) {
    audioEl = new Audio(URL.createObjectURL(audioBlob));
    await new Promise((res) => {
      const t = setTimeout(res, 4000);
      audioEl.onloadedmetadata = () => { clearTimeout(t); res(); };
      audioEl.onerror = () => { clearTimeout(t); res(); };
    });
    if (isFinite(audioEl.duration) && audioEl.duration > 0) dur = audioEl.duration;
  }

  const stream = canvas.captureStream(25);
  let ac = null;
  if (audioEl) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaElementSource(audioEl);
      const dest = ac.createMediaStreamDestination();
      src.connect(dest);
      src.connect(ac.destination);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch (e) { ac = null; }
  }

  const mimes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mime = mimes.find((m) => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });

  const draw = (p) => {
    const W = canvas.width, H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1a0d10'); g.addColorStop(1, '#45090f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W * 0.82, H * 0.18, 40, W * 0.82, H * 0.18, 520);
    rg.addColorStop(0, 'rgba(229,9,20,0.35)'); rg.addColorStop(1, 'rgba(229,9,20,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    const total = words.length;
    const upTo = Math.max(1, Math.min(total, Math.floor(p * total) + 1));
    const win = words.slice(Math.max(0, upTo - 16), upTo);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = 46;
    ctx.font = '600 ' + fs + 'px -apple-system, "Segoe UI", sans-serif';
    const lines = []; let cur = '';
    for (const w of win) {
      if ((cur + ' ' + w).trim().length > 22) { lines.push(cur.trim()); cur = w; }
      else cur += ' ' + w;
    }
    if (cur.trim()) lines.push(cur.trim());
    const startY = H / 2 - (lines.length - 1) * fs * 0.72;
    lines.forEach((ln, i) => {
      ctx.fillStyle = i === lines.length - 1 ? '#e8e8ec' : 'rgba(232,232,236,0.88)';
      ctx.fillText(ln, W / 2, startY + i * fs * 1.45);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(W * 0.2, H - 74, W * 0.6, 8);
    ctx.fillStyle = '#9a9aa6';
    ctx.fillRect(W * 0.2, H - 74, W * 0.6 * Math.min(1, p), 8);
    ctx.font = '500 22px -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('🤖 ' + (settings.name || 'Dark AI'), W / 2, H - 32);
  };

  draw(0);
  rec.start(150);
  if (audioEl) { try { await audioEl.play(); } catch (e) { /* tiché video */ } }
  const t0 = performance.now();
  await new Promise((res) => {
    let raf;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      const p = Math.min(1, t / dur);
      draw(p);
      const audioDone = !audioEl || audioEl.ended || audioEl.paused;
      if (p >= 1 && (audioDone || t > dur + 4)) { cancelAnimationFrame(raf); res(); return; }
      if (t > dur + 8) { cancelAnimationFrame(raf); res(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  await sleep(350);
  rec.stop();
  await stopped;
  if (ac) { try { ac.close(); } catch (e) {} }
  return new Blob(chunks, { type: mime || 'video/webm' });
}

/* --- Veo (experimentální) --- */
$('#stVeoGo').addEventListener('click', async () => {
  const prompt = $('#stVeoPrompt').value.trim();
  if (!prompt) { toast('Napiš popis videa.'); return; }
  if (!settings.apiKey.trim()) { toast('Potřebuješ API klíč (Nastavení → Mozek 🧠).'); switchView('settings'); return; }
  const btn = $('#stVeoGo');
  const status = $('#stVeoStatus');
  btn.disabled = true;
  status.textContent = 'Spouštím generování…';
  try {
    const key = settings.apiKey.trim();
    const model = (settings.veoModel || 'veo-3.1-generate-preview').trim();
    const base = 'https://generativelanguage.googleapis.com/v1beta';
    const res = await fetch(base + '/models/' + encodeURIComponent(model) + ':predictLongRunning?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: prompt }],
        parameters: { aspectRatio: $('#stVeoAspect').value }
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
    const opName = j.name;
    if (!opName) throw new Error('API nevrátilo operaci.');
    let videoBlob = null;
    for (let i = 0; i < 75; i++) {
      status.textContent = '⏳ Generuji video… ' + (i * 8) + ' s (video se tvoří i několik minut)';
      await sleep(8000);
      const sres = await fetch(base + '/' + opName + '?key=' + encodeURIComponent(key));
      const sj = await sres.json().catch(() => ({}));
      if (sj.error) throw new Error(sj.error.message || 'Chyba operace.');
      if (sj.done) {
        if (sj.error || (sj.response && sj.response.error)) {
          throw new Error((sj.error && sj.error.message) || (sj.response && sj.response.error && sj.response.error.message) || 'Generování selhalo.');
        }
        const gvr = sj.response && sj.response.generateVideoResponse;
        const sample = gvr && gvr.generatedSamples && gvr.generatedSamples[0];
        const uri = sample && sample.video && sample.video.uri;
        if (!uri) throw new Error('Video nebylo vytvořeno (možná ho zablokovaly bezpečnostní filtry).');
        status.textContent = 'Stahuji video…';
        let dl = await fetch(uri, { headers: { 'x-goog-api-key': key } });
        if (!dl.ok) {
          dl = await fetch(uri + (uri.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key));
        }
        if (!dl.ok) throw new Error('Stažení videa selhalo (HTTP ' + dl.status + ').');
        videoBlob = await dl.blob();
        break;
      }
    }
    if (!videoBlob) throw new Error('Vypršel časový limit čekání.');
    const url = URL.createObjectURL(videoBlob);
    $('#stVeoPlayer').src = url;
    $('#stVeoWrap').hidden = false;
    $('#stVeoDl').href = url;
    status.textContent = '✅ Hotovo!';
    toast('AI video hotové ✨');
  } catch (e) {
    status.textContent = '❌ ' + (e.message || e) + ' – pokud Veo není na tvém klíči dostupné, použij „Video z textu" výše.';
  } finally {
    btn.disabled = false;
  }
});

/* --- Video seriál (Shorts / RealShort styl) --- */
async function veoGenerate(prompt, aspect, statusCb) {
  const key = (settings.apiKey || '').trim();
  const model = (settings.veoModel || 'veo-3.1-generate-preview').trim();
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const res = await fetch(base + '/models/' + encodeURIComponent(model) + ':predictLongRunning?key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [{ prompt: prompt }], parameters: { aspectRatio: aspect } })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
  const opName = j.name;
  if (!opName) throw new Error('API nevrátilo operaci.');
  for (let i = 0; i < 75; i++) {
    if (statusCb) statusCb(i * 8);
    await sleep(8000);
    const sres = await fetch(base + '/' + opName + '?key=' + encodeURIComponent(key));
    const sj = await sres.json().catch(() => ({}));
    if (sj.error) throw new Error(sj.error.message || 'Chyba operace.');
    if (sj.done) {
      const err = sj.error || (sj.response && sj.response.error);
      if (err) throw new Error(err.message || 'Generování selhalo.');
      const gvr = sj.response && sj.response.generateVideoResponse;
      const sample = gvr && gvr.generatedSamples && gvr.generatedSamples[0];
      const uri = sample && sample.video && sample.video.uri;
      if (!uri) throw new Error('Video nebylo vytvořeno (možná ho zablokovaly bezpečnostní filtry).');
      if (statusCb) statusCb(-1);
      let dl = await fetch(uri, { headers: { 'x-goog-api-key': key } });
      if (!dl.ok) dl = await fetch(uri + (uri.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key));
      if (!dl.ok) throw new Error('Stažení videa selhalo (HTTP ' + dl.status + ').');
      return await dl.blob();
    }
  }
  throw new Error('Vypršel časový limit čekání.');
}

const seState = { scenes: [], title: '', current: 0 };

function seParseScript(text, count) {
  let t = String(text || '').replace(/```json|```/gi, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  let j = null;
  try { j = JSON.parse(t); } catch (err) { j = null; }
  if (!j || !Array.isArray(j.scenes)) throw new Error('AI nevrátila scénář – zkus to znovu.');
  return {
    title: String(j.title || 'Můj seriál'),
    scenes: j.scenes.slice(0, count).map((sc) => ({
      visual: String(sc.visual || sc.prompt || '').trim(),
      subtitle: String(sc.subtitle || sc.text || '').trim()
    })).filter((sc) => sc.visual)
  };
}

function seDrawCaption(ctx, text, W, H) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, H - 132, W, 76);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const words = String(text || '').split(/\s+/);
  let line = '';
  const lines = [];
  words.forEach((w) => {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > W - 60 && line) { lines.push(line); line = w; } else line = test;
  });
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, H - 100 + i * 36));
  ctx.textAlign = 'start';
}

async function recordSeries() {
  const scenes = seState.scenes;
  const W = 540, H = 960;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const stream = c.captureStream(30);
  const mime = window.MediaRecorder && MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });
  rec.start(150);
  for (let i = 0; i < scenes.length; i++) {
    const v = document.createElement('video');
    v.src = scenes[i].url;
    v.playsInline = true;
    v.muted = true;
    await new Promise((res) => {
      v.onloadeddata = res;
      v.onerror = res;
      setTimeout(res, 8000);
    });
    try { v.currentTime = 0; await v.play(); } catch (e) { /* pokračujeme */ }
    await new Promise((res) => {
      const t0 = performance.now();
      let raf;
      const tick = () => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        const vr = (v.videoWidth || 9) / (v.videoHeight || 16);
        let dw = W, dh = H;
        if (vr > W / H) dh = W / vr; else dw = H * vr;
        try { ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch (e) { }
        seDrawCaption(ctx, scenes[i].subtitle, W, H);
        if (v.ended || performance.now() - t0 > 16000) { cancelAnimationFrame(raf); res(); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    try { v.pause(); } catch (e) { }
  }
  rec.stop();
  await stopped;
  return new Blob(chunks, { type: 'video/webm' });
}

function seShow() {
  $('#seWrap').hidden = false;
  seState.current = 0;
  const p = $('#sePlayer');
  p.src = seState.scenes[0].url;
  $('#seCaption').textContent = seState.scenes[0].subtitle || '';
  $('#seDots').innerHTML = seState.scenes.map((s, i) => '<i class="' + (i === 0 ? 'on' : '') + '"></i>').join('');
  const dl = $('#seDownloads');
  dl.innerHTML = '';
  seState.scenes.forEach((s, i) => {
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = s.url;
    a.download = 'scena-' + (i + 1) + '.mp4';
    a.textContent = '⬇ Scéna ' + (i + 1);
    dl.appendChild(a);
  });
  p.play().catch(() => {});
  $('#seAgain').hidden = false;
}

function seGoto(i) {
  seState.current = i;
  const p = $('#sePlayer');
  p.src = seState.scenes[i].url;
  $('#seCaption').textContent = seState.scenes[i].subtitle || '';
  const dots = $('#seDots').children;
  for (let k = 0; k < dots.length; k++) dots[k].className = (k === i ? 'on' : '');
  p.play().catch(() => {});
}

$('#sePlayer').addEventListener('ended', () => {
  if (seState.current + 1 < seState.scenes.length) {
    seGoto(seState.current + 1);
  } else {
    $('#seCaption').textContent = '🎞️ Konec dílu – stáhni si ho tlačítkem ⬇';
  }
});

$('#seAgain').addEventListener('click', () => {
  if (seState.scenes.length) seGoto(0);
});

$('#seGo').addEventListener('click', async () => {
  const idea = $('#seIdea').value.trim();
  if (!idea) { toast('Napiš námět děje.'); return; }
  if (!settings.apiKey.trim()) { toast('Potřebuješ API klíč (Nastavení → Mozek 🧠).'); switchView('settings'); return; }
  const btn = $('#seGo');
  const status = $('#seStatus');
  const count = parseInt($('#seCount').value, 10) || 3;
  const style = $('#seStyle').value;
  btn.disabled = true;
  $('#seWrap').hidden = true;
  seState.scenes = [];
  try {
    status.textContent = '🧠 Píšu scénář…';
    const sys = 'Jsi kreativní scenárista krátkých virálních videí. Odpovídej POUZE platným JSON.';
    const prompt = 'Vymysli mini-seriál (' + count + ' navazující scény) podle námětu: ' + idea +
      '. Žánr a styl: ' + style + '. Odpovz POUZE JSON: {"title":"název česky","scenes":[{"visual":"detailní anglický popis záběru pro AI video generátor (postava, místo, kamera, světlo, atmosféra, 5-8 sekund)","subtitle":"český titulek nebo dialog scény (1-2 věty)"}]}. Scény ať na sebe navazují jako příběh.';
    const r = await chatOnce([{ role: 'user', content: prompt }], sys);
    const script = seParseScript(r.text, count);
    if (!script.scenes.length) throw new Error('Scénář je prázdný – zkus to znovu.');
    seState.title = script.title;
    const scenes = [];
    for (let i = 0; i < script.scenes.length; i++) {
      const sc = script.scenes[i];
      status.textContent = '🎞️ Scéna ' + (i + 1) + '/' + script.scenes.length + ' se generuje… (může trvat pár minut)';
      try {
        const blob = await veoGenerate(sc.visual, '9:16', (s) => {
          status.textContent = '🎞️ Scéna ' + (i + 1) + '/' + script.scenes.length + ': ' + (s < 0 ? 'stahuji…' : ('čekám ' + s + ' s'));
        });
        scenes.push({ subtitle: sc.subtitle, url: URL.createObjectURL(blob) });
      } catch (e) {
        toast('Scéna ' + (i + 1) + ' se nepovedla: ' + (e.message || e));
      }
    }
    if (!scenes.length) throw new Error('Žádná scéna se nevygenerovala – pokud Veo není na tvém klíči, použij „Video z textu“.');
    seState.scenes = scenes;
    seShow();
    status.textContent = '✅ Hotovo! Díl „' + seState.title + '“ má ' + scenes.length + ' scén.';
    toast('🎬 Seriál hotový!');
  } catch (e) {
    status.textContent = '❌ ' + (e.message || e);
  } finally {
    btn.disabled = false;
  }
});

$('#seDl').addEventListener('click', async () => {
  if (!seState.scenes.length) { toast('Nejdřív vytvoř seriál.'); return; }
  const btn = $('#seDl');
  const status = $('#seStatus');
  btn.disabled = true;
  try {
    status.textContent = '⬇ Skládám celý díl…';
    const blob = await recordSeries();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (seState.title || 'serial').replace(/[^\w\- ]/gi, '').trim().replace(/\s+/g, '-') + '.webm';
    a.click();
    status.textContent = '✅ Díl stažen! (jednotlivé scény najdeš pod přehrávačem)';
    toast('⬇ Díl stažen');
  } catch (e) {
    status.textContent = '❌ Stažení selhalo: ' + (e.message || e);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Nastavení: UI ---------- */
function setStatus() { $('#topStatus').textContent = 'připraven/a'; }

function syncHeader() {
  const appName = settings.appName || 'Dark AI';
  document.title = appName + ' – tvoje vlastní AI';
  const brandB = document.querySelector('#sidebar .brand b');
  if (brandB) brandB.textContent = appName;
  $('#topName').textContent = settings.name || 'Dark';
  $('#topAvatar').textContent = settings.avatar || '🤖';
  $('#brandIcon').textContent = settings.avatar || '🤖';
  $('#heroAvatar').textContent = settings.avatar || '🤖';
  $('#heroName').textContent = settings.name || 'Dark';
  $('#btnSearch').classList.toggle('on', !!settings.search);
  $('#btnVoice').classList.toggle('on', !!settings.voiceReplies);
  $('#keyHint').innerHTML = settings.apiKey.trim()
    ? '✅ Mozek připojen – jdi na to!'
    : '💡 Začni tím, že si přidáš <b>zdarma API klíč</b> → <button class="chip" id="goSettings">Nastavení</button>';
  const gs = $('#goSettings');
  if (gs) gs.addEventListener('click', () => switchView('settings'));
  $('#stTtsInfo').textContent = 'Hlas: ' + (settings.ttsVoice || 'Puck') + ' • model: ' + (settings.ttsModel || 'gemini-3.8-flash-tts') +
    ' • režim: ' + ({ auto: 'automaticky', gemini: 'jen AI hlas', browser: 'jen hlas prohlížeče' }[settings.ttsEngine] || 'automaticky');
}

function bindText(id, key, cb) {
  const el = $(id);
  el.value = settings[key] != null ? settings[key] : '';
  el.addEventListener('input', () => {
    settings[key] = el.value;
    saveSettings();
    syncHeader();
    if (cb) cb();
  });
}
function bindCheck(id, key, cb) {
  const el = $(id);
  el.checked = !!settings[key];
  el.addEventListener('change', () => {
    settings[key] = el.checked;
    saveSettings();
    syncHeader();
    if (cb) cb();
  });
}

function renderMemory() {
  const list = $('#memList');
  list.innerHTML = '';
  if (!memory.length) {
    list.innerHTML = '<p class="muted small">Zatím prázdná paměť.</p>';
    return;
  }
  memory.forEach((m, i) => {
    const el = document.createElement('div');
    el.className = 'mem-item';
    el.innerHTML = `<span>${esc(m)}</span><button title="Odebrat">✕</button>`;
    el.querySelector('button').addEventListener('click', () => {
      memory.splice(i, 1);
      saveMemory();
      renderMemory();
    });
    list.appendChild(el);
  });
}

function initSettings() {
  // textová pole
  bindText('#setKey', 'apiKey');
  bindText('#setOrKey', 'orKey');
  bindText('#setName', 'name');
  bindText('#setExtra', 'extra');
  bindText('#setTtsVoice', 'ttsVoice');
  bindText('#setTtsLang', 'ttsLang');
  bindText('#setTtsModel', 'ttsModel');
  bindText('#setImgModel', 'imgModel');
  bindText('#setGithub', 'githubToken');
  bindCheck('#setSearchDDG', 'searchDDG');
  bindCheck('#setSearchSocial', 'searchSocial');
  const hiveEl = $('#setHiveSize');
  hiveEl.value = String(settings.hiveSize || 4);
  hiveEl.addEventListener('change', () => {
    settings.hiveSize = parseInt(hiveEl.value, 10) || 4;
    saveSettings();
    toast('Včelí úl: ' + settings.hiveSize + ' botů 🐝');
  });

  // model – výchozí dle poskytovatele
  const modelEl = $('#setModel');
  modelEl.value = settings.model;
  modelEl.addEventListener('input', () => { settings.model = modelEl.value.trim(); saveSettings(); });

  const provEl = $('#setProvider');
  provEl.value = settings.provider;
  provEl.addEventListener('change', () => {
    settings.provider = provEl.value;
    const m = settings.model || '';
    if (settings.provider === 'openai' && (!m || providerForModel(m) !== 'openai')) settings.model = 'gpt-4o-mini';
    if (settings.provider === 'gemini' && (!m || providerForModel(m) !== 'gemini')) settings.model = 'gemini-3.5-flash-lite';
    if (settings.provider === 'openrouter' && (!m || providerForModel(m) !== 'openrouter')) settings.model = 'openrouter/free';
    modelEl.value = settings.model;
    saveSettings();
    syncHeader();
    toast('Poskytovatel: ' + (settings.provider === 'openai' ? 'OpenAI' : 'Google Gemini'));
  });

  bindCheck('#setSearch', 'search');
  bindCheck('#setOpenMode', 'openMode');
  bindCheck('#setVoiceReplies', 'voiceReplies');

  const recEl = $('#setRecLang');
  recEl.value = settings.recLang;
  recEl.addEventListener('change', () => { settings.recLang = recEl.value; saveSettings(); });

  const engEl = $('#setTtsEngine');
  engEl.value = settings.ttsEngine;
  engEl.addEventListener('change', () => { settings.ttsEngine = engEl.value; saveSettings(); syncHeader(); });

  $('#btnShowKey').addEventListener('click', () => {
    const k = $('#setKey');
    k.type = k.type === 'password' ? 'text' : 'password';
  });
  $('#btnShowGh').addEventListener('click', () => {
    const k = $('#setGithub');
    k.type = k.type === 'password' ? 'text' : 'password';
  });
  $('#btnShowOrKey').addEventListener('click', () => {
    const k = $('#setOrKey');
    k.type = k.type === 'password' ? 'text' : 'password';
  });

  // předvolby osobnosti
  $$('#presetChips .preset').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.preset === settings.preset);
    chip.addEventListener('click', () => {
      settings.preset = chip.dataset.preset;
      $$('#presetChips .preset').forEach((c) => c.classList.toggle('active', c === chip));
      saveSettings();
    });
  });

  // avatar
  const avatars = ['🤖', '🦊', '👾', '😎', '🐉', '🧙', '👽', '🐱', '🐯', '🐼', '🦄', '🐸'];
  const picker = $('#avatarPicker');
  avatars.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a;
    if (a === settings.avatar) b.classList.add('active');
    b.addEventListener('click', () => {
      settings.avatar = a;
      $$('#avatarPicker button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      saveSettings();
      syncHeader();
      renderMessages();
    });
    picker.appendChild(b);
  });

  // motiv / vzhled (editor appky)
  fillThemeInputs();
  bindText('#setAppName', 'appName', () => applyTheme());
  const bindColor = (id, key) => {
    const el = $(id);
    if (!el) return;
    el.value = settings[key] || el.value;
    el.addEventListener('input', () => {
      settings[key] = el.value;
      settings.themePreset = 'custom';
      settings.themeGrad = '';
      saveSettings();
      applyTheme();
    });
  };
  bindColor('#setThemeAccent', 'themeAccent');
  bindColor('#setThemeAccent2', 'themeAccent2');
  bindColor('#setThemeBg', 'themeBg');
  $$('#themeChips .theme').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.theme === settings.themePreset);
    chip.addEventListener('click', () => {
      const t = THEMES[chip.dataset.theme];
      if (!t) return;
      settings.themePreset = chip.dataset.theme;
      settings.themeAccent = t.accent;
      settings.themeAccent2 = t.accent2;
      settings.themeBg = t.bg;
      settings.themeGrad = t.grad;
      settings.appName = t.appName || settings.appName;
      saveSettings();
      fillThemeInputs();
      applyTheme();
      $$('#themeChips .theme').forEach((c) => c.classList.toggle('active', c === chip));
      toast('Téma: ' + t.label);
    });
  });

  // paměť
  $('#memAdd').addEventListener('click', () => {
    const v = $('#memInput').value.trim();
    if (!v) return;
    memory.push(v);
    $('#memInput').value = '';
    saveMemory();
    renderMemory();
  });
  $('#memInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#memAdd').click(); }
  });

  // data
  $('#btnExport').addEventListener('click', () => {
    const data = JSON.stringify({ settings: settings, chats: chats, memory: memory, plugins: getPlugins() }, null, 2);
    downloadBlob(new Blob([data], { type: 'application/json' }), 'dark-ai-data.json');
    toast('Data exportována (pozor – soubor obsahuje i API klíč).');
  });
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d.settings) { settings = Object.assign({}, DEF_SETTINGS, d.settings); saveSettings(); }
        if (Array.isArray(d.chats)) { chats = d.chats; saveChats(); }
        if (Array.isArray(d.memory)) { memory = d.memory; saveMemory(); }
        if (Array.isArray(d.plugins)) { putPlugins(d.plugins); }
        location.reload();
      } catch (err) { toast('Soubor není platný.'); }
    };
    r.readAsText(f);
  });
  $('#btnWipe').addEventListener('click', () => {
    if (!confirm('Opravdu smazat všechny chaty, paměť i nastavení?')) return;
    ['mai.settings', 'mai.chats', 'mai.memory', 'mai.current'].forEach((k) => localStorage.removeItem(k));
    location.reload();
  });

  // instalace PWA
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
  });
  $('#btnInstall').addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
    } else {
      toast('V prohlížeči použij menu ⋮ → „Instalovat aplikaci" / „Přidat na plochu" (iPhone: Sdílet → Přidat na plochu).', 7000);
    }
  });
}

/* ---------- viewy / menu ---------- */
function switchView(name) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-' + name).classList.remove('hidden');
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  closeDrawer();
  hideChatPanel();
  if (name === 'chat') scrollBottom();
}
function closeDrawer() {
  $('#sidebar').classList.remove('open');
  $('#overlay').classList.add('hidden');
}

function initChrome() {
  $('#btnMenu').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
    $('#overlay').classList.toggle('hidden', !$('#sidebar').classList.contains('open'));
  });
  $('#overlay').addEventListener('click', closeDrawer);
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

  $('#btnChats').addEventListener('click', (e) => {
    e.stopPropagation();
    renderChatList();
    $('#chatPanel').classList.toggle('hidden');
  });
  $('#titleArea').addEventListener('click', (e) => {
    e.stopPropagation();
    renderChatList();
    $('#chatPanel').classList.toggle('hidden');
  });
  $('#btnNewChat2').addEventListener('click', () => {
    hideChatPanel();
    $('#btnNewChat').click();
  });
  $('#btnNewChatTop').addEventListener('click', () => {
    hideChatPanel();
    $('#btnNewChat').click();
  });
  document.addEventListener('click', (e) => {
    const p = $('#chatPanel');
    if (!p.classList.contains('hidden') && !p.contains(e.target) && e.target.id !== 'btnChats') hideChatPanel();
  });

  $('#btnMode').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#modeMenu');
    menuFor(m.classList.contains('hidden') ? m : null);
    syncModeUI();
  });
  $('#btnModel').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#modelMenu');
    menuFor(m.classList.contains('hidden') ? m : null);
    syncModeUI();
  });
  $('#btnTools').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#toolsMenu');
    menuFor(m.classList.contains('hidden') ? m : null);
    syncModeUI();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.pop-menu') && !['btnMode', 'btnModel', 'btnTools'].includes(e.target.id)) menuFor(null);
  });
  $('#toolAttach').addEventListener('click', () => { menuFor(null); $('#attachInput').click(); });
  $('#toolSearch').addEventListener('click', () => {
    settings.search = !settings.search;
    saveSettings(); syncHeader(); syncModeUI();
    toast(settings.search ? '🌐 Hledání na webu zapnuto' : '🌐 Hledání na webu vypnuto');
  });
  $('#toolVoice').addEventListener('click', () => {
    settings.voiceReplies = !settings.voiceReplies;
    saveSettings(); syncHeader(); syncModeUI();
    toast(settings.voiceReplies ? '🔊 Hlasové odpovědi zapnuty' : '🔊 Hlasové odpovědi vypnuty');
  });
  $('#toolGithub').addEventListener('click', () => { menuFor(null); switchView('settings'); });
  $$('#modeMenu .mode-opt').forEach((b) => b.addEventListener('click', () => {
    settings.chatMode = b.dataset.mode;
    saveSettings();
    syncModeUI();
    menuFor(null);
    if (b.dataset.mode === 'battle') toast('⚔️ Battle: pošli zprávu a dva AI modely se utkají!');
    if (b.dataset.mode === 'team') toast('🐝 Tým: pošli zprávu a rozešle ji více AI naráz!');
    $('#input').focus();
  }));
  syncModeUI();

  $('#btnNewChat').addEventListener('click', () => {
    currentChatId = null;
    getChat(true);
    saveChats();
    renderChatList();
    renderMessages();
    switchView('chat');
    closeDrawer();
    $('#input').focus();
  });

  $('#btnSearch').addEventListener('click', () => {
    settings.search = !settings.search;
    saveSettings(); syncHeader();
    toast(settings.search ? '🌐 Hledání na webu zapnuto' : 'Hledání na webu vypnuto');
  });
  $('#btnVoice').addEventListener('click', () => {
    settings.voiceReplies = !settings.voiceReplies;
    saveSettings(); syncHeader();
    if (!settings.voiceReplies) stopSpeak();
    toast(settings.voiceReplies ? '🔊 Hlasové odpovědi zapnuty' : 'Hlasové odpovědi vypnuty');
  });
  $('#btnMic').addEventListener('click', () => {
    if (listening) { try { rec.stop(); } catch (e) {} }
    else startListen();
  });
  $('#btnCall').addEventListener('click', () => {
    if (!settings.apiKey.trim()) { toast('Nejdřív přidej API klíč (Nastavení → Mozek 🧠).'); switchView('settings'); return; }
    if (callMode) { stopListen(); toast('Hovor ukončen.'); }
    else {
      callMode = true;
      $('#btnCall').classList.add('listening');
      toast('📞 Hovor spuštěn – mluv, poslouchám tě. Konec: 📞 znovu.', 5000);
      startListen();
    }
  });
  $('#recStop').addEventListener('click', stopListen);

  const input = $('#input');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(150, input.scrollHeight) + 'px';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      input.style.height = 'auto';
      send(v);
    }
  });
  $('#btnSend').addEventListener('click', () => {
    const v = input.value;
    input.value = '';
    input.style.height = 'auto';
    send(v);
  });

  // tlačítka pod návrhy
  $$('#emptyState .chip').forEach((c) => {
    c.addEventListener('click', () => {
      input.value = c.textContent;
      input.focus();
    });
  });

  // kopírování / stahování kódu
  $('#messages').addEventListener('click', (e) => {
    const copy = e.target.closest('.cb-copy');
    const dl = e.target.closest('.cb-dl');
    if (copy) {
      const code = copy.dataset.code || '';
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject())
        .then(() => toast('Zkopírováno ✓'))
        .catch(() => toast('Kopírování selhalo – označ si kód ručně.'));
    }
    if (dl) {
      const code = dl.dataset.code || '';
      downloadBlob(new Blob([code], { type: 'text/plain' }), 'kod.txt');
    }
  });
}

/* ---------- init v2: přílohy, spouštění kódu, studio nástroje ---------- */
function initV2() {
  renderFiles();

  const ai = $('#attachInput');
  $('#btnAttach').addEventListener('click', () => ai.click());
  ai.addEventListener('change', () => {
    const f = ai.files && ai.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      attachedImage = { dataUrl: r.result, mime: f.type || 'image/png' };
      const p = $('#attachPreview');
      p.classList.remove('hidden');
      p.innerHTML = `<img src="${r.result}" alt=""><span>🖼️ Přiložený obrázek – AI ho přečte</span>`;
      const b = document.createElement('button');
      b.className = 'icon-btn small';
      b.textContent = '✕';
      b.addEventListener('click', clearAttachment);
      p.appendChild(b);
    };
    r.readAsDataURL(f);
    ai.value = '';
  });

  // spuštění / náhled kódu v chatu
  $('#messages').addEventListener('click', async (e) => {
    const run = e.target.closest('.cb-run');
    const prev = e.target.closest('.cb-prev');
    if (run) {
      const code = run.dataset.code || '';
      const block = run.closest('.codeblock');
      let out = block.nextElementSibling;
      if (!out || !out.classList.contains('run-out')) {
        out = document.createElement('div');
        out.className = 'run-out';
        block.after(out);
      }
      out.textContent = '⏳ Spouštím…';
      try { out.textContent = (await runJS(code)) || '(bez výstupu)'; }
      catch (err) { out.textContent = 'Chyba: ' + (err.message || err); }
    }
    if (prev) {
      const code = prev.dataset.code || '';
      const block = prev.closest('.codeblock');
      let frame = block.nextElementSibling;
      if (!frame || !frame.classList.contains('html-prev')) {
        frame = document.createElement('iframe');
        frame.className = 'html-prev';
        frame.setAttribute('sandbox', 'allow-scripts');
        block.after(frame);
      }
      frame.srcdoc = code;
    }
  });

  // PC: terminál, soubory, screenshoty, plánovač
  $('#pcRun').addEventListener('click', async () => {
    const cmd = $('#pcCmd').value.trim();
    if (!cmd) return;
    if (!pcOnline) { toast('Desktop režim není připojený – spusť appku přes server.py.'); return; }
    if (!confirm('Spustit tento příkaz na počítači?\n\n' + cmd)) return;
    const out = $('#pcOut');
    out.classList.remove('hidden');
    out.textContent = '⏳ Běží…';
    const r = await pcExec(cmd);
    out.textContent = '(exit ' + (r.code != null ? r.code : '?') + ')\n' +
      (((r.stdout || '') + (r.stderr || '') + (r.error || '')).trim() || '(bez výstupu)');
  });

  $('#pcList').addEventListener('click', () => pcLoadFiles($('#pcPath').value));

  $('#pcShot').addEventListener('click', async () => {
    if (!pcOnline) { toast('Desktop režim není připojený.'); return; }
    try {
      const r = await (await fetch('api/screenshot')).json();
      if (!r.ok) throw new Error(r.error || 'Screenshot selhal');
      $('#pcShotImg').src = 'data:image/png;base64,' + r.image;
      $('#pcShotImg').hidden = false;
    } catch (e) {
      toast('Screenshot: ' + e.message);
    }
  });

  $('#taskAdd').addEventListener('click', async () => {
    if (!pcOnline) { toast('Desktop režim není připojený.'); return; }
    const name = $('#taskName').value.trim() || 'Úkol';
    const cmd = $('#taskCmd').value.trim();
    const type = $('#taskSpec').value;
    const time = $('#taskTime').value.trim() || (type === 'daily' ? '08:00' : '30');
    if (!cmd) { toast('Zadej příkaz úkolu.'); return; }
    const spec = type === 'daily'
      ? { type: 'daily', time: time }
      : { type: 'every', min: parseInt(time, 10) || 30 };
    await fetch('api/tasks/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, cmd: cmd, spec: spec })
    });
    $('#taskName').value = '';
    $('#taskCmd').value = '';
    pcLoadTasks();
    toast('Úkol přidán ⏰');
  });

  detectPC();
  pcLoadTasks();

  // GitHub: nahrání projektu
  $('#stProjGh').addEventListener('click', async () => {
    const token = (settings.githubToken || '').trim();
    if (!token) { toast('Nejdřív přidej GitHub token v Nastavení → Propojení 🔗.'); switchView('settings'); return; }
    const html = lastProjectHtml || (getFiles().find((f) => f.name === 'projekt.html') || {}).content;
    if (!html) { toast('Nejdřív vygeneruj projekt (tlačítko 🏗️).'); return; }
    const raw = (prompt('Název repozitáře na GitHubu:', 'dark-ai-projekt') || '').trim();
    if (!raw) return;
    const name = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const status = $('#ghStatus');
    status.textContent = '⏳ Vytvářím repo a nahrávám…';
    try {
      const repo = await ghCreateRepo(name, 'Projekt vytvořený v Dark AI', true);
      await ghPushFile(name, 'index.html', html, 'Projekt z Dark AI');
      status.innerHTML = '✅ Hotovo: <a href="' + esc(repo.html_url) + '" target="_blank" rel="noopener">' + esc(repo.html_url) + '</a>';
      toast('Projekt je na GitHubu 🐙🎉');
    } catch (e) {
      status.textContent = '❌ ' + (e.message || e);
    }
  });

  $('#btnDeploy').addEventListener('click', deployApp);

  // studio: weby/appky/software + hudba + zip
  $('#btnZip').addEventListener('click', () => {
    const files = getFiles();
    if (!files.length) { toast('Zatím žádné soubory ke stažení.'); return; }
    downloadBlob(makeZip(files), 'dark-ai-projekty.zip');
    toast('ZIP připraven 📦');
  });

  $('#stProjGo').addEventListener('click', async () => {
    const desc = $('#stProjPrompt').value.trim();
    if (!desc) { toast('Popiš stránku / appku / software.'); return; }
    if (!settings.apiKey.trim()) { toast('Potřebuješ API klíč (Nastavení → Mozek 🧠).'); switchView('settings'); return; }
    const btn = $('#stProjGo');
    btn.disabled = true; btn.textContent = '⏳ Stavím projekt…';
    try {
      const html = await generateWebProject(desc);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      $('#stProjPrev').srcdoc = html;
      $('#stProjPrev').hidden = false;
      $('#stProjDl').href = url;
      $('#stProjDl').hidden = false;
      saveFile('projekt.html', html);
      lastProjectHtml = html;
      toast('Projekt hotový 🏗️ Náhled je dole a soubor v 📁 Souborech.');
    } catch (e) {
      toast('Projekt se nepodařil: ' + (e.message || e), 6000);
    } finally {
      btn.disabled = false; btn.textContent = '🏗️ Vygenerovat projekt';
    }
  });

  $('#stMusicGo').addEventListener('click', async () => {
    const desc = $('#stMusicPrompt').value.trim();
    if (!desc) { toast('Popiš náladu/žánr písničky.'); return; }
    if (!settings.apiKey.trim()) { toast('Potřebuješ API klíč (Nastavení → Mozek 🧠).'); switchView('settings'); return; }
    const btn = $('#stMusicGo');
    btn.disabled = true; btn.textContent = '⏳ Skládám…';
    try {
      const score = await generateMusicScore(desc);
      const wav = await renderMusic(score);
      const url = URL.createObjectURL(wav);
      $('#stMusicPlayer').src = url;
      $('#stMusicWrap').hidden = false;
      $('#stMusicDl').href = url;
      $('#stMusicDl').hidden = false;
      toast('Skladba hotová 🎵 ' + (score.name || ''));
    } catch (e) {
      toast('Skladba se nepodařila: ' + (e.message || e), 6000);
    } finally {
      btn.disabled = false; btn.textContent = '🎵 Vygenerovat skladbu';
    }
  });

  // studio: obrázky
  $('#stImgGo').addEventListener('click', async () => {
    const prompt = $('#stImgPrompt').value.trim();
    if (!prompt) { toast('Napiš popis obrázku.'); return; }
    if (!settings.apiKey.trim()) { toast('Potřebuješ API klíč (Nastavení → Mozek 🧠).'); switchView('settings'); return; }
    const btn = $('#stImgGo');
    btn.disabled = true; btn.textContent = '⏳ Generuji…';
    try {
      const blob = await geminiImage(prompt);
      const url = URL.createObjectURL(blob);
      $('#stImgResult').src = url;
      $('#stImgResult').hidden = false;
      $('#stImgDl').href = url;
      $('#stImgDl').hidden = false;
      toast('Obrázek hotový 🎨');
    } catch (e) {
      toast('Obrázek se nepodařil: ' + (e.message || e) + ' – zkontroluj model pro obrázky v Nastavení.', 6500);
    } finally {
      btn.disabled = false; btn.textContent = '🎨 Vygenerovat obrázek';
    }
  });
}

/* ---------- start ---------- */
function init() {
  loadState();
  initSettings();
  initChrome();
  initV2();
  renderChatList();
  renderMessages();
  renderMemory();
  applyTheme();
  getChat(true);
  renderChatList();
  runPlugins();
  initPluginsUI();

  // hlasy prohlížeče se načítají asynchronně
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  // service worker (PWA) – selže tiše v sandboxu, v prohlížeči funguje
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }
}

init();
