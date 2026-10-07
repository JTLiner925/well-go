import { API_URL, NOTION_URL, SEASON_LABEL, EVENT } from './config.js';
import { COUNTRIES, flag, findCountry, searchCountries } from './countries.js';

// Add ?demo to the address to try the app with made-up people (nothing real is read or saved).
const DEMO = !API_URL || new URLSearchParams(location.search).has('demo');
const app = document.getElementById('app');
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = (n) => (n || '').split(' ')[0];
const initials = (n) => (n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const COLORS = ['#7048e8', '#1c7ed6', '#2f9e44', '#f08c00', '#e03131', '#0b8585', '#c2255c'];
const colorOf = (s) => COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const av = (name) => `<div class="av" style="background:${colorOf(name)}">${esc(initials(name))}</div>`;

const MILESTONES = [10, 25, 50, 100, COUNTRIES.length];
const PLACES = ['Coffee shop', 'Park', 'Grocery', 'Bus stop', 'Campus', 'Bar / patio', 'Laundromat', 'Gym', 'Hospital', 'Mall', 'Under the bridge', 'Event', 'Other'];
const OUTCOMES = ['Friendly chat', 'Prayed together', 'Healing reported', 'Heard the gospel', 'Said yes to Jesus', 'Not interested'];
const LIGHTS = { Green: '#2f9e44', Yellow: '#f0b400', Red: '#e03131', Believer: '#1c7ed6' };
const TIER_HEAD = { Easy: 'Level 1 · Warm up', Medium: 'Level 2 · Step out', Hard: 'Level 3 · Go deeper', Legendary: 'Legendary' };
const PROOF = { Instant: 'Instant points', Photo: '📷 Photo required', 'Leader approval': '🛡️ Leader approval' };
const METRICS = { conversations: 'Conversations', prayers: 'People prayed for', nations: 'New nations', places: 'New places', points: 'Points' };
const GIFT_EMOJI = { Prophecy: '💬', Knowledge: '👁️', Healing: '🤕', Tongues: '🌬️', Discernment: '🔍', Faith: '⚡', Miracles: '🌟', Mercy: '🫶', Hospitality: '🏠', Giving: '💝', Teaching: '🎓', Wisdom: '🧠', Leadership: '📣', Helps: '🧰' };
const TIER_EMOJI = { Easy: '🌱', Medium: '🎯', Hard: '🔥', Legendary: '👑' };
const emojiOf = (c) => c.emoji || GIFT_EMOJI[c.gift] || (c.passport === 'Nations' ? '🌍' : c.passport === 'Places' ? '📍' : TIER_EMOJI[c.tier] || '✨');
const isLeader = (m) => m && m.role !== 'Player';

// ---------- Session ----------

const SESSION_KEY = DEMO ? 'wg.demo.session' : 'wg.session';
let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { session = null; }
function saveSession(s) {
  session = s;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}
const me = () => session?.me;

// ---------- API ----------

async function api(action, body = {}) {
  if (DEMO) {
    const { mockApi } = await import('./mock.js');
    return mockApi(action, body, session);
  }
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.token ? { 'x-session': session.token } : {}) },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    const e = new Error('No connection. Try again when you have signal.');
    e.offline = true;
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && action !== 'login') {
    saveSession(null);
    go('signin');
    throw new Error(data.error || 'Please sign in.');
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

let boot = null;
async function getBoot(force) {
  if (!boot || force) boot = await api('bootstrap');
  return boot;
}

// ---------- Small helpers ----------

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}
const fail = (e) => toast(e?.message || 'Something went wrong.');
const when = (d) => {
  if (!d) return '';
  const n = Math.round((new Date(new Date().toISOString().slice(0, 10)) - new Date(d.slice(0, 10))) / 864e5);
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`;
};
const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, Math.round((v / Math.max(max, 1)) * 100))}%"></i></div>`;
const chips = (group, items, sel = '') => `<div class="chips" data-group="${group}">${items.map((x) => `<button type="button" class="chip ${x === sel ? 'on' : ''}" data-val="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
const pick = (group, root = document) => $(`[data-group="${group}"] .chip.on`, root)?.dataset.val || '';

function openSheet(html) {
  $('#sheet').innerHTML = `<div class="grab"></div>${html}`;
  $('#sheetbg').classList.add('on');
}
const closeSheet = () => $('#sheetbg').classList.remove('on');
$('#sheetbg').addEventListener('click', (e) => { if (e.target.id === 'sheetbg') closeSheet(); });

// Chips act like radio buttons inside a [data-group]; [data-multi] allows many.
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip[data-val]');
  if (!chip) return;
  const grp = chip.parentElement;
  if (grp.hasAttribute('data-multi')) chip.classList.toggle('on');
  else if (chip.classList.contains('on') && grp.hasAttribute('data-optional')) chip.classList.remove('on');
  else { $$('.chip', grp).forEach((c) => c.classList.remove('on')); chip.classList.add('on'); }
  grp.dispatchEvent(new CustomEvent('chipchange', { bubbles: true }));
});

// ---------- Routing ----------

const go = (path) => { location.hash = '#/' + path; };
let cleanup = null;
const leave = () => { if (cleanup) { cleanup(); cleanup = null; } };
let tabBadge = 0;

function drawTabs(active) {
  const tabs = [['home', '🏠', 'Home'], ['play', '🎯', 'Play'], ['map', '🗺️', 'Map'], ['ranks', '🏆', 'Ranks'], ['chat', '💬', 'Chat'], ['more', '☰', 'More']];
  const mapTo = { followups: 'more', stats: 'more', leader: 'more', settings: 'more', passport: 'home' };
  const a = mapTo[active] || active;
  $('#tabs').innerHTML = `<div class="in">${tabs.map(([r, ic, l]) =>
    `<a class="tab ${r === a ? 'on' : ''}" href="#/${r}"><span class="ic">${ic}</span>${l}${r === 'more' && tabBadge ? `<span class="dot" style="background:var(--purple)">${tabBadge}</span>` : ''}</a>`).join('')}</div>`;
}

async function render() {
  leave();
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const R = { signin, home, play, map, ranks, chat, more, followups, stats, leader, settings, passport };
  const view = R[name] ? name : 'home';
  if (!session && view !== 'signin') return go('signin');
  const authed = !!session && view !== 'signin';
  app.className = authed ? '' : 'bare';
  $('#tabs').hidden = !authed;
  $('#fab').hidden = !authed || view === 'chat';
  if (authed) drawTabs(view);
  app.innerHTML = '<p class="mute" style="padding:24px 0">Loading…</p>';
  window.scrollTo(0, 0);
  try { await R[view](decodeURIComponent(arg || '')); } catch (e) { if (e.message) app.innerHTML = `<div class="card"><b>Couldn't load this.</b><p class="mute">${esc(e.message)}</p><button class="btn ghost sm" style="margin-top:10px" onclick="location.reload()">Try again</button></div>`; }
}
window.addEventListener('hashchange', render);

// ---------- Sign in ----------

async function signin() {
  const { players } = await api('players');
  app.innerHTML = `
    <div style="text-align:center;margin:30px 0 20px"><div style="font-size:54px">💧</div><h1>Well Go</h1><p class="mute">Go meet people. Love them well.</p></div>
    ${DEMO ? '<div class="demo">Demo mode: made-up people. Code for everyone: 1234</div>' : ''}
    <div class="card">
      <div class="label" style="margin-top:0">Who are you?</div>
      <select id="who">${players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.team ? ` · ${esc(p.team)}` : ''}</option>`).join('')}</select>
      <div class="label">Your code</div>
      <input id="code" type="password" inputmode="numeric" autocomplete="current-password" placeholder="6-digit code">
      <button class="btn" id="go" style="margin-top:14px">Let's go</button>
      <p class="mute" style="margin-top:10px">Don't have a code? Ask your team leader.</p>
    </div>`;
  const submit = async () => {
    $('#go').disabled = true;
    try {
      const r = await api('login', { id: $('#who').value, code: $('#code').value.trim() });
      saveSession({ token: r.token, me: r.me });
      boot = null;
      go('home');
    } catch (e) { fail(e); $('#go').disabled = false; }
  };
  $('#go').onclick = submit;
  $('#code').onkeydown = (e) => { if (e.key === 'Enter') submit(); };
}

// ---------- Home ----------

async function home() {
  const [h, j, b] = await Promise.all([api('home'), api('journey').catch(() => null), getBoot()]);
  tabBadge = (h.quiet || 0);
  drawTabs('home');
  const seen = new Set();
  const gotCountries = h.nations.map((n) => findCountry(n)).filter((c) => c && !seen.has(c.code) && seen.add(c.code));
  const nextMile = MILESTONES.find((m) => m > gotCountries.length) ?? COUNTRIES.length;
  const placesGot = new Set(h.places);
  const giftNames = [...new Set(b.challenges.map((c) => c.gift).filter(Boolean))];
  const easy = b.challenges.filter((c) => c.tier === 'Easy');
  const daily = easy[Math.floor(Date.now() / 864e5) % Math.max(easy.length, 1)];
  const giftsTried = giftNames.filter((g) => h.gifts[g]);
  app.innerHTML = `
    <div class="row"><div class="sp"><div class="mute">${esc(SEASON_LABEL)}${me().teamName ? ' · ' + esc(me().teamName) : ''}</div><h2 style="margin:2px 0 8px">Hey ${esc(first(me().name))} 👋</h2></div>${av(me().name)}</div>
    ${isLeader(me()) && h.quiet ? `<a class="banner" href="#/leader" style="text-decoration:none;color:inherit"><span style="font-size:22px">💛</span><div class="sp"><b>${h.quiet} teammate${h.quiet > 1 ? 's' : ''} could use a check-in</b><div class="mute">Quiet for a while. Tap to reach out. (Leaders only)</div></div>›</a>` : ''}
    <div class="hero">
      <div class="row"><div><div class="mute" style="color:#bfe9ea">Season points</div><div class="big">${h.points.toLocaleString()}</div></div><div class="sp"></div><div style="text-align:right"><div style="font-size:26px">🔥 ${h.streak}</div><div style="font-size:12px">day streak</div></div></div>
      <div class="row" style="margin-top:10px;font-size:13px"><span>Level ${h.level}</span><div class="sp"></div><span>${h.toNext} to Level ${h.level + 1}</span></div>
      <div class="bar" style="margin-top:6px"><i style="width:${Math.round(((300 - h.toNext) / 300) * 100)}%"></i></div>
    </div>
    ${h.pending ? `<div class="card"><b>⏳ ${h.pending} waiting for leader approval</b><div class="mute">Points are added as soon as they're approved.</div></div>` : ''}
    ${EVENT ? `<div class="card" style="background:linear-gradient(135deg,#0f6f73,#33cccc);color:#0c1218"><b>🌍 Event: ${esc(EVENT.name)}</b><div style="font-size:12px">${esc(EVENT.when)}</div></div>` : ''}
    ${j?.buddy ? buddyCard(j.buddy, true) : ''}
    <div class="row" style="gap:10px;margin-bottom:12px">
      ${[[h.conversations, 'conversations'], [h.prayedFor, 'prayed for'], [h.needFollowUp, 'need follow-up']].map(([n, l]) => `<div class="card sp" style="margin:0;text-align:center"><div class="pts" style="font-size:22px">${n}</div><div class="mute">${l}</div></div>`).join('')}
    </div>
    <div class="card"><div class="row"><b>🛂 Nations Passport</b><div class="sp"></div><span class="mute">${gotCountries.length} of ${COUNTRIES.length}</span></div>
      <div class="mute">Talk with people from around the world. Each new country or people group earns a stamp and +10. Next milestone: ${nextMile}.</div>
      <div class="bar" style="margin-top:8px"><i style="width:${Math.min(100, Math.round((gotCountries.length / nextMile) * 100))}%"></i></div>
      <a class="btn ghost sm" style="display:inline-block;margin-top:10px;text-decoration:none" href="#/passport">🗺️ See your world map</a>
      <div class="stamps">${gotCountries.map((c) => `<div class="stamp got" title="${esc(c.name)}"><div><div style="font-size:20px">${flag(c.code)}</div>${esc(c.name)}</div></div>`).join('')}${Array.from({ length: Math.max(0, 10 - gotCountries.length) }, () => '<div class="stamp">?</div>').join('')}</div></div>
    <div class="card"><div class="row"><b>📍 Places Passport</b><div class="sp"></div><span class="mute">${placesGot.size} / ${PLACES.length - 1}</span></div>
      <div class="mute">Pray or talk somewhere new. Each new kind of place earns a stamp and +10.</div>
      <div class="pz">${PLACES.filter((p) => p !== 'Other').map((p) => `<span class="${placesGot.has(p) ? 'got' : ''}">${esc(p)}</span>`).join('')}</div></div>
    <div class="card"><div class="row"><b>🎁 Gifts Discovery</b><div class="sp"></div><span class="mute">${giftsTried.length} / ${giftNames.length} tried</span></div>
      <div class="mute">Try a challenge in each gift area. Your leader can affirm where they see fruit.</div>
      <div style="margin-top:8px;display:grid;gap:7px;font-size:13px">${giftNames.map((g) => `<div class="row"><span style="width:118px">${GIFT_EMOJI[g] || '🎁'} ${esc(g)}</span><div class="sp">${bar(h.gifts[g] || 0, 4)}</div><span class="mute" style="width:24px;text-align:right">${h.gifts[g] || 0}</span></div>`).join('')}</div>
      <a class="btn ghost sm" style="display:inline-block;margin-top:10px;text-decoration:none" href="#/play" data-filter="Gifts">See gift challenges</a></div>
    ${daily ? `<div class="card"><div class="row"><b>Today's easy win</b><div class="sp"></div><span class="pill easy">Easy</span></div><div class="chal" style="margin-top:8px" data-act="log" data-arg="${esc(daily.id)}"><div class="em">${emojiOf(daily)}</div><div class="sp"><b>${esc(daily.title)}</b><span class="mute">${esc(daily.description)}</span></div><span class="pts">+${daily.points}</span></div></div>` : ''}`;
  const g = $('[data-filter]');
  if (g) g.onclick = () => { playFilter = 'Gifts'; };
}

// ---------- World map of the Nations Passport ----------

let worldData;
async function loadWorld() {
  if (!worldData) {
    const res = await fetch('https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json');
    if (!res.ok) throw new Error("The world map couldn't load.");
    worldData = await res.json();
  }
  return worldData;
}

async function passport() {
  const h = await api('home');
  const seen = new Set();
  const got = h.nations.map((n) => findCountry(n)).filter((c) => c && !seen.has(c.code) && seen.add(c.code));
  const countries = got.filter((c) => !c.people);
  const peoples = got.filter((c) => c.people);
  app.innerHTML = `<a class="btn ghost sm" style="text-decoration:none" href="#/home">‹ Home</a><h2>My world</h2>
    <div class="row" style="gap:10px;margin-bottom:12px">
      <div class="card sp" style="margin:0;text-align:center"><div class="pts" style="font-size:24px">${countries.length}</div><div class="mute">countries</div></div>
      <div class="card sp" style="margin:0;text-align:center"><div class="pts" style="font-size:24px">${peoples.length}</div><div class="mute">people groups</div></div>
      <div class="card sp" style="margin:0;text-align:center"><div class="pts" style="font-size:24px">${COUNTRIES.filter((c) => !c.people).length - countries.length}</div><div class="mute">still to meet</div></div></div>
    <div id="wmap" class="map wmap"></div>
    <div class="legend"><span><i style="background:#33cccc"></i>Stamped</span><span><i style="background:#c9d6d6"></i>Not yet</span></div>
    <div id="wsmall"></div>
    <div class="label">Your stamps</div>
    <div class="card">${got.length ? `<div class="pz" style="margin-top:0">${got.map((c) => `<span class="got">${flag(c.code)} ${esc(c.name)}</span>`).join('')}</div>` : '<p class="mute">Log a conversation and pick their country to earn your first stamp. 🌍</p>'}</div>`;
  const stamped = new Set(countries.map((c) => c.code));
  const [data] = await Promise.all([loadWorld(), loadLeaflet()]);
  if (!document.contains($('#wmap'))) return;
  const m = L.map('wmap', { zoomControl: true, minZoom: 1, maxZoom: 6, worldCopyJump: false, attributionControl: false, zoomSnap: 0.25 });
  m.fitBounds([[-56, -168], [78, 178]]);
  cleanup = () => m.remove();
  const drawn = new Set();
  L.geoJSON(data, {
    style: (f) => {
      const c = findCountry(f.properties.name);
      return c && stamped.has(c.code) ? { fillColor: '#33cccc', fillOpacity: 0.95, color: '#0b8585', weight: 1 } : { fillColor: '#c9d6d6', fillOpacity: 1, color: '#ffffff', weight: 0.6 };
    },
    onEachFeature: (f, layer) => {
      const c = findCountry(f.properties.name);
      if (c) drawn.add(c.code);
      layer.bindTooltip(c ? `${flag(c.code)} ${c.name}${stamped.has(c.code) ? ' ✔' : ''}` : esc(f.properties.name), { sticky: true });
    },
  }).addTo(m);
  // Countries too small to show on the map.
  const small = countries.filter((c) => !drawn.has(c.code));
  if (small.length) $('#wsmall').innerHTML = `<p class="mute" style="margin-top:8px">Too small to see on the map: ${small.map((c) => `${flag(c.code)} ${esc(c.name)}`).join(', ')}</p>`;
}

// ---------- Play (challenges) ----------

let playFilter = 'All';
async function play() {
  const [b, h] = await Promise.all([getBoot(), api('home')]);
  const done = new Set(h.done);
  const paint = () => {
    const f = playFilter;
    const show = (c) => f === 'All' || c.tier === f || (f === 'Team' && c.team) || (f === 'Gifts' && c.gift);
    let html = `<h2>Challenges</h2><div class="seg" id="pf">${['All', 'Easy', 'Medium', 'Hard', 'Team', 'Gifts'].map((x) => `<button class="${x === f ? 'on' : ''}" data-f="${x}">${x === 'Gifts' ? '🎁 Gifts' : x}</button>`).join('')}</div>`;
    for (const tier of ['Easy', 'Medium', 'Hard', 'Legendary']) {
      const items = b.challenges.filter((c) => c.tier === tier && show(c));
      if (!items.length) continue;
      html += `<div class="label">${TIER_HEAD[tier]}</div>` + items.map((c) => `
        <div class="card chal ${done.has(c.id) ? 'done' : ''}" data-act="log" data-arg="${esc(c.id)}"><div class="em">${emojiOf(c)}</div>
          <div class="sp"><b>${esc(c.title)}${c.team ? '<span class="tag">TEAM</span>' : ''}${c.gift ? `<span class="tag gift">🎁 ${esc(c.gift)}</span>` : ''}</b>
          <span class="pill ${tier.toLowerCase()}">${tier}</span> <span class="mute">${PROOF[c.proof] || ''}</span>${c.limit ? `<div class="cap">⏱ Limit: ${esc(c.limit)}</div>` : ''}</div>
          <div style="text-align:right"><div class="pts">+${c.points}</div>${done.has(c.id) ? '<div style="color:var(--green)">✔</div>' : ''}</div></div>`).join('');
    }
    app.innerHTML = html;
    $$('#pf button').forEach((x) => { x.onclick = () => { playFilter = x.dataset.f; paint(); }; });
  };
  paint();
}

// ---------- Log an interaction ----------

let photo = null;
let fix = null;
const OUTBOX = 'wg.outbox';
const outbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]'); } catch { return []; } };
const setOutbox = (l) => { try { localStorage.setItem(OUTBOX, JSON.stringify(l)); } catch { toast('Phone storage is full.'); } };

async function flushOutbox() {
  if (!session || !navigator.onLine) return;
  const list = outbox();
  if (!list.length) return;
  const left = [];
  let sent = 0;
  for (const item of list) {
    try { await api('log', item); sent++; } catch (e) { if (e.offline) left.push(item); }
  }
  setOutbox(left);
  if (sent) { toast(`Sent ${sent} saved log${sent > 1 ? 's' : ''} ✓`); render(); }
}
window.addEventListener('online', flushOutbox);

async function compress(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.72));
  const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  return { name: 'photo.jpg', type: 'image/jpeg', data, preview: `data:image/jpeg;base64,${data}` };
}

async function openLog(chId) {
  const b = await getBoot();
  const ch = b.challenges.find((c) => c.id === chId);
  photo = null;
  const needPhoto = ch?.proof === 'Photo';
  openSheet(`
    <b style="font-size:18px">${ch ? `${emojiOf(ch)} ${esc(ch.title)}` : '＋ Log a conversation'}</b>
    ${ch ? `<div style="margin-top:4px"><span class="pill ${ch.tier.toLowerCase()}">${ch.tier}</span> <span class="mute">${PROOF[ch.proof] || ''}</span> <span class="pts" style="float:right;font-size:20px">+${ch.points}</span></div><p class="mute" style="margin:8px 0 2px">${esc(ch.description)}</p>${ch.limit ? `<p class="mute">⏱ Limit: ${esc(ch.limit)}. Extra tries still log the person, but earn no challenge points.</p>` : ''}` : '<p class="mute">Not tied to a challenge: +10 points (up to 5 a day).</p>'}
    <p class="mute" id="gps" style="margin-top:8px">📍 Finding your location…</p>
    <div class="label">Count it toward</div>
    <select id="lch"><option value="">Just a conversation</option>${b.challenges.map((c) => `<option value="${esc(c.id)}" ${ch?.id === c.id ? 'selected' : ''}>${esc(c.title)} (+${c.points})</option>`).join('')}</select>
    <div class="label">Who did you talk to? <span style="text-transform:none;font-weight:400">(private: you, your leader, admins)</span></div>
    <input id="lname" placeholder="First name" autocomplete="off">
    <div class="label">Country or people group (for your Nations Passport)</div>
    <div style="position:relative"><input id="lnation" autocomplete="off" autocapitalize="words" placeholder="Start typing a country or people group…"><div id="lcl" class="cl" hidden></div></div>
    <p class="mute" id="lcn" style="margin-top:4px"></p>
    <div class="label">Where were you? (for your Places Passport)</div>${chips('place', PLACES)}
    <div class="label">How did it go?</div>${chips('outcome', OUTCOMES, 'Friendly chat')}
    <div class="label">Light</div>${chips('light', Object.keys(LIGHTS))}
    <div class="label">Their need / prayer request</div><textarea id="lneed" rows="2" placeholder="e.g. back pain, new in town, wants a Bible"></textarea>
    <div class="label">Phone (only if they offered it)</div><input id="lphone" type="tel" inputmode="tel" placeholder="(512) 555-0100">
    <button type="button" class="toggle" id="lfu" style="margin-top:12px"><div class="sw"></div><div><b style="font-size:14px">Needs follow-up</b><div class="mute">Adds them to Follow-ups and tells your leader</div></div></button>
    <div id="lphotoWrap"><div class="label">Photo ${needPhoto ? '(required)' : '(optional)'} <span style="text-transform:none;font-weight:400">Only photograph people who say yes</span></div>
      <label class="photo-up" id="lphoto">📷 Tap to take or choose a photo<input type="file" accept="image/*" capture="environment" id="lfile" hidden></label></div>
    <div class="row" style="margin-top:16px"><button class="btn ghost" id="lcancel">Cancel</button><button class="btn" id="lsave">${ch?.proof === 'Leader approval' ? 'Submit for approval' : 'Save'}</button></div>`);
  $('#lfu').onclick = () => $('#lfu').classList.toggle('on');
  const nin = $('#lnation');
  const ncl = $('#lcl');
  let hot = 0;
  const choose = (c) => { nin.value = c.name; ncl.hidden = true; $('#lcn').textContent = `${flag(c.code)} ${c.name}`; };
  const showList = () => {
    const found = searchCountries(nin.value);
    $('#lcn').textContent = '';
    const exact = findCountry(nin.value);
    if (exact) $('#lcn').textContent = `${flag(exact.code)} ${exact.name}`;
    hot = 0;
    ncl.hidden = !found.length || (exact && found.length === 1);
    ncl.innerHTML = found.map((c, i) => `<button type="button" class="${i === hot ? 'hot' : ''}" data-code="${c.code}">${flag(c.code)} ${esc(c.name)}</button>`).join('');
  };
  nin.oninput = showList;
  nin.onfocus = () => { if (nin.value) showList(); };
  nin.onkeydown = (e) => {
    const items = $$('button', ncl);
    if (ncl.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hot = (hot + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; items.forEach((b, i) => b.classList.toggle('hot', i === hot)); }
    if (e.key === 'Enter') { e.preventDefault(); choose(COUNTRIES.find((c) => c.code === items[hot].dataset.code)); }
  };
  ncl.onmousedown = (e) => { const b = e.target.closest('button'); if (b) { e.preventDefault(); choose(COUNTRIES.find((c) => c.code === b.dataset.code)); } };
  nin.onblur = () => setTimeout(() => { ncl.hidden = true; const c = findCountry(nin.value); if (c) nin.value = c.name; }, 120);
  $('#lcancel').onclick = closeSheet;
  $('#lfile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { photo = await compress(f); $('#lphoto').classList.add('has'); $('#lphoto').innerHTML = `<img src="${photo.preview}" alt="">`; } catch { toast("Couldn't read that photo."); }
  };
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (p) => { fix = { lat: p.coords.latitude, lng: p.coords.longitude }; $('#gps') && ($('#gps').textContent = `📍 Location on (±${Math.round(p.coords.accuracy)} m): this will show on the map`); },
      () => { fix = null; $('#gps') && ($('#gps').textContent = '📍 Location is off. Allow it for this site to put this on the map.'); },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 });
  } else $('#gps').textContent = "📍 Location isn't available on this device.";
  $('#lsave').onclick = async () => {
    const chosen = $('#lch').value || '';
    const c2 = b.challenges.find((c) => c.id === chosen);
    if (c2?.proof === 'Photo' && !photo) return toast('📷 Add a photo first.');
    const country = findCountry($('#lnation').value);
    if ($('#lnation').value.trim() && !country) return toast('Pick a country or people group from the list.');
    if (c2?.passport === 'Nations' && !country) return toast('Pick the person’s country for the passport.');
    const payload = {
      challengeId: chosen, contactName: $('#lname').value, contactPhone: $('#lphone').value, nation: country ? country.name : '', place: pick('place'),
      outcome: pick('outcome'), light: pick('light'), need: $('#lneed').value, followUp: $('#lfu').classList.contains('on'),
      ...(fix || {}), ...(photo ? { photo: { name: photo.name, type: photo.type, data: photo.data } } : {}),
    };
    $('#lsave').disabled = true;
    try {
      const r = await api('log', payload);
      closeSheet();
      toast(r.message + (r.newNation ? ' 🌍 New nation stamped!' : '') + (r.newPlace ? ' 📍 New place stamped!' : ''));
      render();
    } catch (e) {
      $('#lsave').disabled = false;
      if (e.offline) {
        setOutbox([...outbox(), payload]);
        closeSheet();
        toast('Saved on your phone. It will send when you have signal.');
      } else fail(e);
    }
  };
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act="log"]');
  if (t) openLog(t.dataset.arg);
});
$('#fab').onclick = () => openLog('');

// ---------- Map ----------

let leafletReady;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (!leafletReady) {
    leafletReady = new Promise((ok, no) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = ok;
      s.onerror = () => no(new Error("The map couldn't load. Check your connection."));
      document.head.appendChild(s);
    });
  }
  return leafletReady;
}

const mapPrefs = { scope: 'team', days: 30, show: 'all' };
async function map() {
  app.innerHTML = `<h2>Map</h2>
    <div class="seg" id="ms"><button data-v="team" class="${mapPrefs.scope === 'team' ? 'on' : ''}">Team</button><button data-v="me" class="${mapPrefs.scope === 'me' ? 'on' : ''}">Just me</button></div>
    <div class="row" style="gap:6px;margin-bottom:8px">
      <select id="md">${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months']].map(([d, l]) => `<option value="${d}" ${d === mapPrefs.days ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="mf">${[['all', 'All doors'], ['conversation', 'Conversations only'], ['accepted', 'Said yes to Jesus'], ['followup', 'Open follow-ups']].map(([k, l]) => `<option value="${k}" ${k === mapPrefs.show ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="mute" id="msum" style="margin-bottom:6px"></div><div id="map" class="map"></div>
    <div class="legend">${Object.entries(LIGHTS).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}<span><i style="background:#adb5bd"></i>No light</span><span>✝ Said yes</span><span><i style="background:#fff;border:2px solid #7048e8"></i>Open follow-up</span></div>
    <p class="mute" id="mnote" style="margin-top:8px"></p>`;
  $$('#ms button').forEach((x) => { x.onclick = () => { mapPrefs.scope = x.dataset.v; map(); }; });
  $('#md').onchange = (e) => { mapPrefs.days = Number(e.target.value); map(); };
  $('#mf').onchange = (e) => { mapPrefs.show = e.target.value; map(); };
  const [{ interactions }] = await Promise.all([api('interactions', { scope: mapPrefs.scope, days: mapPrefs.days }), loadLeaflet()]);
  if (!document.contains($('#map'))) return;
  const keep = (i) => ({ all: true, conversation: !!i.outcome, accepted: i.outcome === 'Said yes to Jesus', followup: i.followUp && i.fuStatus !== 'Done' }[mapPrefs.show]);
  const shown = interactions.filter(keep);
  const placed = shown.filter((i) => i.lat != null && i.lng != null);
  $('#msum').innerHTML = `<b>${shown.length}</b> logs · ✝ <b>${shown.filter((i) => i.outcome === 'Said yes to Jesus').length}</b> said yes · <b>${shown.filter((i) => i.followUp && i.fuStatus !== 'Done').length}</b> follow-ups open`;
  const missing = shown.length - placed.length;
  $('#mnote').textContent = missing ? `${missing} log${missing > 1 ? 's' : ''} in this view ${missing > 1 ? 'have' : 'has'} no location (logged with location off), so ${missing > 1 ? "they aren't" : "it isn't"} on the map.` : '';
  const m = L.map('map', { zoomControl: true }).setView([30.2672, -97.7431], 12);
  cleanup = () => m.remove();
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
  const pts = [];
  for (const i of placed) {
    const yes = i.outcome === 'Said yes to Jesus';
    const col = LIGHTS[i.light] || '#adb5bd';
    const size = yes ? 26 : i.outcome ? 20 : 14;
    const ring = i.followUp && i.fuStatus !== 'Done' ? ';box-shadow:0 0 0 3px #7048e8' : '';
    const icon = L.divIcon({ className: '', html: `<div class="dotp" style="width:${size}px;height:${size}px;background:${col}${ring}">${yes ? '✝' : ''}</div>`, iconSize: [size, size] });
    const popup = `<b>${esc(i.playerName)}</b> · ${esc(when(i.when))}<br>${esc(i.outcome || 'Door')}${i.place ? ' · ' + esc(i.place) : ''}${i.canSee && i.contactName ? `<br>With ${esc(i.contactName)}` : ''}${i.canSee && i.need ? `<br><i>${esc(i.need)}</i>` : ''}`;
    L.marker([i.lat, i.lng], { icon }).bindPopup(popup).addTo(m);
    pts.push([i.lat, i.lng]);
  }
  if (pts.length) m.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
}

// ---------- Ranks + My Journey ----------

let ranksView = 'board';
let boardScope = 'people';
async function ranks() {
  const paintTop = () => `<h2>Ranks</h2><div class="seg" id="rv"><button data-v="board" class="${ranksView === 'board' ? 'on' : ''}">🏆 Leaderboard</button><button data-v="journey" class="${ranksView === 'journey' ? 'on' : ''}">🤝 My Journey</button></div>`;
  if (ranksView === 'journey') await journey(paintTop); else await board(paintTop);
  $$('#rv button').forEach((x) => { x.onclick = () => { ranksView = x.dataset.v; ranks(); }; });
}

async function board(top) {
  const d = await api('leaderboard');
  const rows = boardScope === 'people' ? d.people : d.teams;
  const t3 = rows.slice(0, 3);
  const colors = ['#f0a500', '#adb5bd', '#c2813b'];
  app.innerHTML = `${top()}
    <div class="seg" id="bs"><button data-v="people" class="${boardScope === 'people' ? 'on' : ''}">People</button><button data-v="teams" class="${boardScope === 'teams' ? 'on' : ''}">Teams</button></div>
    ${t3.length === 3 ? `<div class="podium">${[1, 0, 2].map((i) => `<div>${av(t3[i].name)}<b style="font-size:12px">${esc(t3[i].name)}</b><div class="pts">${t3[i].points.toLocaleString()}</div><div class="blk" style="height:${[110, 80, 60][i]}px;background:${colors[i]}">${i + 1}</div></div>`).join('')}</div>` : ''}
    <div class="card">${rows.map((r, i) => `<div class="lb ${r.you || r.yours ? 'me' : ''}"><div class="rank">${i + 1}</div>${av(r.name)}<div class="sp"><b>${esc(r.name)}${r.you ? ' (you)' : ''}</b><div class="mute">${boardScope === 'people' ? esc(r.team || 'Solo') + ' · Level ' + r.level : r.members + ' members'}</div></div><div class="pts">${r.points.toLocaleString()}</div></div>`).join('') || '<p class="mute">No one yet.</p>'}</div>
    <p class="mute" style="text-align:center">Team score = the points of everyone on the team</p>`;
  $$('#bs button').forEach((x) => { x.onclick = () => { boardScope = x.dataset.v; ranks(); }; });
}

function buddyCard(b, compact) {
  const pct = Math.min(100, Math.round((b.total / b.target) * 100));
  return `<div class="card"><div class="row">${av('You')}<div style="font-size:22px">🤝</div>${av(b.buddyName)}<div class="sp"><b>You &amp; ${esc(first(b.buddyName))}</b><div class="mute">⏱ until ${esc(b.end)}</div></div></div>
    <div style="margin-top:10px"><b>Shared goal:</b> ${b.target} ${esc((METRICS[b.metric] || b.metric).toLowerCase())}</div>
    <div class="bar" style="margin:6px 0"><i style="width:${pct}%"></i></div><div class="mute">${b.total} / ${b.target} · You ${b.me} · ${esc(first(b.buddyName))} ${b.them}</div>
    ${b.celebrate ? `<div class="mute" style="margin-top:4px">Celebrate with: ${esc(b.celebrate)}</div>` : ''}
    <div class="row" style="margin-top:10px"><button class="btn ghost sm sp" data-cheer="${esc(b.buddyId)}" data-kind="cheer">👏 Cheer</button><button class="btn ghost sm sp" data-cheer="${esc(b.buddyId)}" data-kind="pray">🙏 Pray for them</button>${compact ? '' : `<a class="btn sm sp" style="text-decoration:none;text-align:center" href="#/chat">💬 Message</a>`}</div></div>`;
}

document.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-cheer]');
  if (!c) return;
  e.stopPropagation();
  try { await api('cheer', { toId: c.dataset.cheer, kind: c.dataset.kind }); toast(c.dataset.kind === 'pray' ? '🙏 Prayer sent' : '👏 Cheer sent'); } catch (x) { fail(x); }
});

async function journey(top) {
  const [j, b] = await Promise.all([api('journey'), getBoot()]);
  app.innerHTML = `${top()}
    <div class="card" style="background:linear-gradient(135deg,#182330,#0f6f73);color:#fff"><b style="font-size:16px">Play your own game</b><div style="font-size:13px;margin-top:4px;opacity:.9">Beat your own best, set weekly goals, and cheer on a buddy. No one loses here.</div></div>
    <div class="label">This week's personal goals</div>
    <div class="card"><div style="display:grid;gap:12px;font-size:13.5px">${j.goals.map((g) => `<div><div class="row"><b>${esc(METRICS[g.metric] || g.metric)}</b><div class="sp"></div><span class="mute">${g.done} / ${g.target}${g.done >= g.target ? ' ✔' : ''}</span></div>${bar(g.done, g.target)}</div>`).join('') || '<p class="mute">No goals yet.</p>'}</div>
      <button class="btn ghost sm" id="eg" style="margin-top:12px">✏️ Edit goals</button></div>
    <div class="label">Personal bests</div>
    <div class="card"><div class="row" style="text-align:center"><div class="sp"><div class="pts" style="font-size:22px">${j.bests.bestWeek}</div><div class="mute">best week<br>(this week: ${j.bests.thisWeek})</div></div><div class="sp"><div class="pts" style="font-size:22px">${j.bests.bestDay}</div><div class="mute">best day<br>conversations</div></div><div class="sp"><div class="pts" style="font-size:22px">${j.bests.streak}</div><div class="mute">current<br>streak (days)</div></div></div>
      ${j.bests.bestWeek && j.bests.thisWeek < j.bests.bestWeek ? `<div class="mute" style="margin-top:10px;text-align:center">You're ${j.bests.bestWeek - j.bests.thisWeek} points from a new personal best 🎉</div>` : ''}</div>
    <div class="label">My buddy</div>
    ${j.invite ? `<div class="card"><b>${esc(j.invite.fromName)} invited you to be buddies</b><div class="mute">Shared goal: ${j.invite.target} ${esc((METRICS[j.invite.metric] || '').toLowerCase())} in ${j.invite.days} days</div><div class="row" style="margin-top:10px"><button class="btn ghost sm sp" id="bno">Not now</button><button class="btn green sm sp" id="byes">Accept</button></div></div>` : ''}
    ${j.buddy ? buddyCard(j.buddy, false) : '<div class="card"><div class="mute">No buddy yet. Pick a teammate to share a goal with and cheer each other on.</div></div>'}
    <button class="btn" id="ib">🤝 Invite a buddy</button>
    <div class="label">Cheers for you</div>
    <div class="card">${j.cheers.map((c) => `<div class="lb"><div class="sp"><b>${esc(c.from)}</b> ${esc(c.text)}</div><span class="mute">${esc(when(c.at))}</span></div>`).join('') || '<p class="mute">Cheers from teammates will show up here.</p>'}</div>`;
  if ($('#byes')) { $('#byes').onclick = async () => { await api('answerBuddy', { accept: true }); toast('Buddies! 🤝'); ranks(); }; $('#bno').onclick = async () => { await api('answerBuddy', { accept: false }); ranks(); }; }
  $('#ib').onclick = () => {
    const others = b.players.filter((p) => p.id !== me().id);
    openSheet(`<b style="font-size:18px">🤝 Invite a buddy</b><p class="mute" style="margin-top:4px">Buddies share a goal and see each other's progress. You can pair with anyone, even someone on another team.</p>
      <div class="label">Pick a buddy</div><select id="bb">${others.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.team ? ' · ' + esc(p.team) : ''}</option>`).join('')}</select>
      <div class="label">Shared goal</div><div class="row"><input id="bt" type="number" min="1" value="20" style="width:90px"><select id="bm">${Object.entries(METRICS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="label">Length</div>${chips('days', ['3 days', 'Weekend', '1 week', '2 weeks'], '1 week')}
      <div class="label">Celebrate together (optional)</div>${chips('cel', ['Coffee together ☕', 'Pray for each other 🙏', 'Share a testimony at team night 🎤', 'Go out again together 👣'])}
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="bc">Cancel</button><button class="btn" id="bs2">Send invite</button></div>`);
    $('#bc').onclick = closeSheet;
    $('#bs2').onclick = async () => {
      const days = { '3 days': 3, Weekend: 3, '1 week': 7, '2 weeks': 14 }[pick('days')] || 7;
      try { await api('inviteBuddy', { buddyId: $('#bb').value, metric: $('#bm').value, target: Number($('#bt').value), days, celebrate: pick('cel') }); closeSheet(); toast('Buddy invite sent 🤝'); } catch (x) { fail(x); }
    };
  };
  $('#eg').onclick = () => {
    openSheet(`<b style="font-size:18px">✏️ Weekly goals</b><p class="mute" style="margin-top:4px">Pick up to 3. These are just for you.</p>
      ${[0, 1, 2].map((i) => `<div class="row" style="margin-top:8px"><select id="gm${i}"><option value="">None</option>${Object.entries(METRICS).map(([k, l]) => `<option value="${k}" ${j.goals[i]?.metric === k ? 'selected' : ''}>${l}</option>`).join('')}</select><input id="gt${i}" type="number" min="1" value="${j.goals[i]?.target ?? 5}" style="width:80px"></div>`).join('')}
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="gc">Cancel</button><button class="btn" id="gs">Save</button></div>`);
    $('#gc').onclick = closeSheet;
    $('#gs').onclick = async () => {
      const goals = [0, 1, 2].map((i) => ({ metric: $(`#gm${i}`).value, target: Number($(`#gt${i}`).value) })).filter((g) => g.metric);
      try { await api('setGoals', { goals }); closeSheet(); ranks(); } catch (x) { fail(x); }
    };
  };
}

// ---------- Chat ----------

async function chat(thread) {
  if (!thread) {
    const { threads } = await api('threads');
    const b = await getBoot();
    const seen = (() => { try { return JSON.parse(localStorage.getItem('wg.seen') || '{}'); } catch { return {}; } })();
    app.innerHTML = `<h2>Messages</h2>${threads.map((t) => `<a class="card row" style="text-decoration:none;color:inherit" href="#/chat/${encodeURIComponent(t.id)}">${av(t.title)}<div class="sp"><b>${esc(t.title)}</b><div class="mute" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.last ? esc((t.last.sender_name ? first(t.last.sender_name) + ': ' : '') + t.last.body) : 'No messages yet'}</div></div>${t.last && t.last.created_at > (seen[t.id] || '') && t.last.sender_id !== me().id ? '<span class="pill" style="background:var(--red)">new</span>' : ''}</a>`).join('')}
      <button class="btn ghost" id="nm">＋ New message</button>`;
    $('#nm').onclick = () => {
      openSheet(`<b style="font-size:18px">New message</b><div class="label">To</div><select id="dmto">${b.players.filter((p) => p.id !== me().id).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.team ? ' · ' + esc(p.team) : ''}</option>`).join('')}</select><div class="row" style="margin-top:16px"><button class="btn ghost" id="dmc">Cancel</button><button class="btn" id="dmg">Open</button></div>`);
      $('#dmc').onclick = closeSheet;
      $('#dmg').onclick = async () => { try { const r = await api('startDm', { id: $('#dmto').value }); closeSheet(); go('chat/' + encodeURIComponent(r.thread)); } catch (x) { fail(x); } };
    };
    return;
  }
  const { threads } = await api('threads');
  const title = threads.find((t) => t.id === thread)?.title || (thread.startsWith('dm:') ? 'Message' : thread);
  app.innerHTML = `<div class="row" style="margin-bottom:8px"><a class="btn ghost sm" style="text-decoration:none" href="#/chat">‹ Back</a><b style="font-size:16px">${esc(title)}</b></div>
    <div class="msgs" id="msgs"></div>
    <div class="compose"><input id="cin" placeholder="Message…" autocomplete="off"><button class="btn sm" id="csend">Send</button></div>`;
  let last = 0;
  const msgs = $('#msgs');
  const draw = (list) => {
    for (const m of list) {
      last = Math.max(last, m.id);
      const el = document.createElement('div');
      el.className = m.sender_id === 'system' ? 'msg sys' : `msg ${m.sender_id === me().id ? 'mine' : ''}`;
      el.innerHTML = m.sender_id === 'system' || m.sender_id === me().id ? esc(m.body) : `<small>${esc(m.sender_name)}</small>${esc(m.body)}`;
      msgs.appendChild(el);
    }
    if (list.length) window.scrollTo(0, document.body.scrollHeight);
  };
  const pull = async () => {
    try {
      const { messages } = await api('messages', { thread, after: last });
      draw(messages);
      if (messages.length) { const s = (() => { try { return JSON.parse(localStorage.getItem('wg.seen') || '{}'); } catch { return {}; } })(); s[thread] = new Date().toISOString(); try { localStorage.setItem('wg.seen', JSON.stringify(s)); } catch { /* ignore */ } }
    } catch { /* keep trying */ }
  };
  await pull();
  const timer = setInterval(pull, 6000);
  cleanup = () => clearInterval(timer);
  const send = async () => {
    const t = $('#cin').value.trim();
    if (!t) return;
    $('#cin').value = '';
    try { await api('send', { thread, text: t }); await pull(); } catch (x) { $('#cin').value = t; fail(x); }
  };
  $('#csend').onclick = send;
  $('#cin').onkeydown = (e) => { if (e.key === 'Enter') send(); };
}

// ---------- More, follow-ups, stats, leader, settings ----------

async function more() {
  const h = await api('home');
  tabBadge = h.quiet || 0;
  drawTabs('more');
  app.innerHTML = `<h2>More</h2><div class="card menu">
    <a href="#/followups"><span class="ic">☑︎</span><span class="sp">Follow-ups &amp; people</span>${h.needFollowUp ? `<span class="pill" style="background:var(--red)">${h.needFollowUp}</span>` : ''}</a>
    <a href="#/stats"><span class="ic">▮</span><span class="sp">Stats</span></a>
    ${isLeader(me()) ? `<a href="#/leader"><span class="ic">🛡️</span><span class="sp">Leader tools</span>${h.quiet ? `<span class="pill" style="background:var(--purple)">${h.quiet} check-in${h.quiet > 1 ? 's' : ''}</span>` : ''}</a>` : ''}
    <a href="#/settings"><span class="ic">⚙︎</span><span class="sp">Settings</span></a></div>
    <p class="mute" style="text-align:center">Well Go</p>`;
}

let fuFilter = 'open';
async function followups() {
  const [{ followups: list }, b] = await Promise.all([api('followups'), getBoot()]);
  const shown = list.filter((i) => fuFilter === 'all' || i.fuStatus !== 'Done');
  const phoneOf = (i) => (i.contactPhone ? `<a class="btn ghost sm" style="text-decoration:none" href="sms:${esc(i.contactPhone)}">Text</a><a class="btn ghost sm" style="text-decoration:none" href="tel:${esc(i.contactPhone)}">Call</a>` : '');
  app.innerHTML = `<a class="btn ghost sm" style="text-decoration:none" href="#/more">‹ More</a><h2>Follow-ups &amp; people</h2>
    <div class="seg" id="ff"><button data-v="open" class="${fuFilter === 'open' ? 'on' : ''}">Needs follow-up</button><button data-v="all" class="${fuFilter === 'all' ? 'on' : ''}">All</button></div>
    ${shown.map((i) => `<div class="card fu ${i.fuStatus === 'Done' ? 'ok' : i.fuStatus === 'In progress' ? 'warm' : ''}" data-id="${esc(i.id)}">
      <div class="row"><b>${esc(i.contactName || 'Someone')}</b><span class="mute">${esc(i.nation)}</span><div class="sp"></div><span class="mute">${esc(when(i.when))}</span></div>
      <div style="margin:6px 0;font-size:13.5px">${esc(i.need || i.outcome || '')}</div>
      <div class="mute">Met by ${esc(i.playerName)}${i.assignedName ? ' · Assigned to ' + esc(i.assignedName) : ''}</div>
      ${isLeader(me()) ? `<select class="as" style="margin-top:8px"><option value="">Assign to…</option>${b.players.map((p) => `<option value="${esc(p.id)}" ${p.name === i.assignedName ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
      <textarea class="fn" rows="2" placeholder="Follow-up notes" style="margin-top:8px">${esc(i.fuNotes)}</textarea>
      <div class="row" style="margin-top:8px;flex-wrap:wrap">${phoneOf(i)}<div class="sp"></div>${['Open', 'In progress', 'Done'].map((s) => `<button class="chip st ${i.fuStatus === s ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')}</div></div>`).join('') || '<p class="mute">Nothing here. 🙌</p>'}`;
  $$('#ff button').forEach((x) => { x.onclick = () => { fuFilter = x.dataset.v; followups(); }; });
  $$('.card[data-id]').forEach((card) => {
    const id = card.dataset.id;
    $$('.st', card).forEach((s) => { s.onclick = async () => { try { await api('updateFollowup', { id, status: s.dataset.s }); toast('Saved ✓'); followups(); } catch (x) { fail(x); } }; });
    $('.fn', card).onchange = async (e) => { try { await api('updateFollowup', { id, notes: e.target.value }); toast('Notes saved ✓'); } catch (x) { fail(x); } };
    const as = $('.as', card);
    if (as) as.onchange = async () => { try { await api('updateFollowup', { id, assignedTo: as.value }); toast('Assigned ✓'); } catch (x) { fail(x); } };
  });
}

async function stats() {
  const [{ interactions: t }, h] = await Promise.all([api('interactions', { scope: 'team', days: 30 }), api('home')]);
  const n = (f) => t.filter(f).length;
  const lights = Object.keys(LIGHTS).map((k) => [k, n((i) => i.light === k)]);
  const total = lights.reduce((s, [, c]) => s + c, 0) || 1;
  app.innerHTML = `<a class="btn ghost sm" style="text-decoration:none" href="#/more">‹ More</a><h2>Stats · last 30 days</h2>
    <div class="row" style="gap:8px;margin-bottom:12px">${[[t.length, 'logs'], [n((i) => i.outcome && i.outcome !== 'Not interested'), 'conversations'], [n((i) => i.outcome === 'Said yes to Jesus'), 'said yes ✝']].map(([v, l]) => `<div class="card sp" style="margin:0;text-align:center"><div class="pts" style="font-size:22px">${v}</div><div class="mute">${l}</div></div>`).join('')}</div>
    <div class="card"><b>Lights</b><div style="display:flex;height:14px;border-radius:9px;overflow:hidden;margin:8px 0">${lights.map(([k, c]) => `<i style="width:${(c / total) * 100}%;background:${LIGHTS[k]}"></i>`).join('')}</div><div class="mute">${lights.map(([k, c]) => `${k} ${c}`).join(' · ')}</div></div>
    <div class="card"><b>You</b><div class="mute">${h.points.toLocaleString()} season points · Level ${h.level} · ${h.streak}-day streak</div></div>`;
}

async function leader() {
  if (!isLeader(me())) return go('more');
  const [nu, ap, fu, b] = await Promise.all([api('nudges', {}), api('approvals'), api('followups'), getBoot()]);
  const unassigned = fu.followups.filter((i) => !i.assignedTo && i.fuStatus !== 'Done');
  app.innerHTML = `<a class="btn ghost sm" style="text-decoration:none" href="#/more">‹ More</a><h2>Leader tools</h2>
    <div class="row" style="gap:10px;margin-bottom:12px"><div class="card sp" style="margin:0;text-align:center"><div class="pts" style="font-size:22px">${ap.approvals.length}</div><div class="mute">to approve</div></div><div class="card sp" style="margin:0;text-align:center"><div class="pts" style="font-size:22px">${unassigned.length}</div><div class="mute">unassigned follow-ups</div></div></div>
    <div class="label">Check-ins · haven't been active</div>
    ${nu.quiet.map((q) => `<div class="card nudge" data-pid="${esc(q.id)}"><div class="row">${av(q.name)}<div class="sp"><b>${esc(q.name)}</b><div class="mute">${q.daysQuiet >= 999 ? 'Never logged' : q.daysQuiet + ' days quiet'}${q.team ? ' · ' + esc(q.team) : ''}</div></div></div><div class="row" style="margin-top:10px"><button class="btn ghost sm sp" data-n="encourage">💬 Encourage</button><button class="btn ghost sm sp" data-n="pray">🙏 Pray</button><button class="btn ghost sm sp" data-n="snooze">Snooze</button></div></div>`).join('') || '<div class="card"><div class="mute">Everyone has been active. 🎉</div></div>'}
    <div class="card"><b style="font-size:14px">Nudge me when someone is quiet for…</b>${chips('nz', ['3 days', '5 days', '7 days', '14 days'], nu.days + ' days')}<div class="mute" style="margin-top:8px">Nudges are private to leaders and are meant as care, not a scorecard. Nothing is shown to the person or the team.</div></div>
    <div class="label">Pending approval</div>
    ${ap.approvals.map((a) => `<div class="card" data-aid="${esc(a.id)}"><div class="row">${a.photos[0] ? `<a href="${esc(a.photos[0])}" target="_blank" rel="noopener"><img src="${esc(a.photos[0])}" alt="" style="width:70px;height:70px;object-fit:cover;border-radius:12px"></a>` : ''}<div class="sp"><b>${esc(a.playerName)}</b><div class="mute">${esc(a.challengeTitle || a.summary)}</div><div class="pts">+${a.points}</div>${a.need ? `<div class="mute"><i>${esc(a.need)}</i></div>` : ''}</div></div><div class="row" style="margin-top:10px"><button class="btn ghost sm sp" data-r="send_back">Send back</button><button class="btn green sm sp" data-r="approve">Approve</button></div></div>`).join('') || '<div class="card"><div class="mute">Nothing waiting.</div></div>'}
    <div class="label">Unassigned follow-ups</div>
    ${unassigned.map((i) => `<div class="card fu" data-fid="${esc(i.id)}"><div class="row"><b>${esc(i.contactName || 'Someone')}</b><div class="sp"></div><span class="mute">${esc(i.need || i.outcome)}</span></div><div class="row" style="margin-top:8px"><select class="as"><option value="">Assign to…</option>${b.players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><button class="btn sm" data-assign>Assign</button></div></div>`).join('') || '<div class="card"><div class="mute">All assigned.</div></div>'}
    <a class="btn ghost" style="display:block;text-align:center;text-decoration:none;margin-top:6px" href="${esc(NOTION_URL)}" target="_blank" rel="noopener">📓 Open Notion Home Base</a>
    <p class="mute" style="margin-top:6px">Every interaction, follow-up, photo and approval also lives in Notion. You can approve there too.</p>`;
  $$('.nudge').forEach((card) => $$('[data-n]', card).forEach((x) => {
    x.onclick = async () => {
      const id = card.dataset.pid;
      if (x.dataset.n === 'encourage') {
        const name = first(nu.quiet.find((q) => q.id === id)?.name);
        openSheet(`<b style="font-size:18px">💬 Encourage ${esc(name)}</b><p class="mute" style="margin-top:4px">Sent as a private message. Keep it light.</p><textarea id="nt" rows="3" style="margin-top:8px">Hey ${esc(name)}, thinking of you! No pressure, just checking in. How are you doing?</textarea><div class="row" style="margin-top:14px"><button class="btn ghost" id="nc">Cancel</button><button class="btn" id="ns">Send</button></div>`);
        $('#nc').onclick = closeSheet;
        $('#ns').onclick = async () => { try { await api('nudgeAction', { id, action: 'encourage', text: $('#nt').value }); closeSheet(); toast('💬 Sent'); leader(); } catch (e) { fail(e); } };
      } else { try { await api('nudgeAction', { id, action: x.dataset.n }); toast(x.dataset.n === 'pray' ? '🙏 Marked: praying' : 'Snoozed'); leader(); } catch (e) { fail(e); } }
    };
  }));
  const nz = $('[data-group="nz"]');
  nz.addEventListener('chipchange', async () => { try { await api('nudges', { days: parseInt(pick('nz'), 10) }); toast('Saved ✓'); leader(); } catch (e) { fail(e); } });
  $$('[data-aid]').forEach((card) => $$('[data-r]', card).forEach((x) => { x.onclick = async () => { try { await api('review', { id: card.dataset.aid, decision: x.dataset.r }); toast(x.dataset.r === 'approve' ? 'Approved ✓ points awarded' : 'Sent back'); leader(); } catch (e) { fail(e); } }; }));
  $$('[data-fid]').forEach((card) => { $('[data-assign]', card).onclick = async () => { const v = $('.as', card).value; if (!v) return toast('Pick someone first.'); try { await api('updateFollowup', { id: card.dataset.fid, assignedTo: v }); toast('Assigned ✓'); leader(); } catch (e) { fail(e); } }; });
}

async function settings() {
  const m = me();
  app.innerHTML = `<a class="btn ghost sm" style="text-decoration:none" href="#/more">‹ More</a><h2>Settings</h2>
    <div class="card"><div class="row">${av(m.name)}<div class="sp"><b>${esc(m.name)}</b><div class="mute">${esc(m.role)}${m.teamName ? ' · ' + esc(m.teamName) : m.solo ? ' · Solo player' : ''}</div></div></div>
      <p class="mute" style="margin-top:10px">Your code, team, and role are managed in Notion by an admin. Ask your leader if something needs to change.</p></div>
    ${outbox().length ? `<div class="card"><b>${outbox().length} log${outbox().length > 1 ? 's' : ''} waiting to send</b><div class="mute">They'll send automatically when you have signal.</div><button class="btn ghost sm" id="fl" style="margin-top:8px">Try now</button></div>` : ''}
    ${DEMO ? '<button class="btn ghost" id="dr" style="margin-bottom:10px">Reset demo data</button>' : ''}
    <button class="btn ghost" id="so">Sign out</button>`;
  $('#so').onclick = () => { saveSession(null); boot = null; go('signin'); };
  if ($('#dr')) $('#dr').onclick = async () => { const { demoReset } = await import('./mock.js'); demoReset(); };
  if ($('#fl')) $('#fl').onclick = flushOutbox;
}

if (!location.hash) location.hash = session ? '#/home' : '#/signin';
render();
flushOutbox();
