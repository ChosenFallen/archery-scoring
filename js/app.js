import {
  ROUNDS, BOWS, FACES, hasX, allowedLabels, sortArrows, labelClass, rulesHint, ringOuter, lowestRing,
  roundStats, compareScores, configKey, describeConfig, archerOf, roundSpec, isPractice,
} from './rules.js';
import * as store from './store.js';
import {
  faceSVG, singleSpotSVG, hitTest, markerSVG, plotted, groupCentre, centreSVG, describeOffset,
  hasPos, snapToScore,
} from './face.js';

// How far above the finger the arrow marker sits while placing it on the target.
const TOUCH_OFFSET_PX = 56;

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const ui = {
  editing: null, restoring: false, justFinished: new Set(),
  historyFilter: 'all', statsArcher: null, statsConfig: null, newArchers: null,
};

// ---------- helpers ----------

const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const buzz = () => { try { navigator.vibrate?.(12); } catch { /* not supported */ } };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = action.fn;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (!action) toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

store.setSaveErrorHandler(() => toast('Could not save. Phone storage may be full.'));

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const chip = v => `<span class="chip ${labelClass(v)}">${esc(v)}</span>`;

// Rows are laid out so buttons of the same ring colour always share a row:
// gold scores and M first, then the rest four to a row (8 7 6 5 / 4 3 2 1).
function keypadHTML(labels, action, disabled = false) {
  const gold = labels.filter(v => labelClass(v) === 'z-gold');
  const rest = labels.filter(v => labelClass(v) !== 'z-gold' && v !== 'M');
  const rows = [[...gold, 'M']];
  for (let i = 0; i < rest.length; i += 4) rows.push(rest.slice(i, i + 4));
  const key = v => `<button type="button" class="key ${labelClass(v)}" data-action="${action}" data-v="${v}" ${disabled ? 'disabled' : ''}>${v}</button>`;
  return `<div class="keypad">${rows.map(r => `<div class="key-row">${r.map(key).join('')}</div>`).join('')}</div>`;
}
const go = hash => { location.hash = hash; };

const nameOf = r => store.archerName(archerOf(r));
// Names are only shown once more than one archer has been used, so a solo archer sees no change.
const showNames = () => store.getPeople().length > 0 || store.getRounds().some(r => archerOf(r) !== store.ME);

function currentEnd(round) { return round.ends[round.ends.length - 1]; }
const singleSpotEntry = round => round.face === 'triple40';
// Whether no more arrows fit in this end. A practice end with no limit is never full.
function endIsFull(round) {
  const per = roundSpec(round).arrowsPerEnd;
  return !!per && currentEnd(round).length >= per;
}
// Whether this archer has shot this end, so scoring can move on. With no limit, one arrow is enough.
function endIsDone(round) {
  return roundSpec(round).arrowsPerEnd ? endIsFull(round) : currentEnd(round).length > 0;
}

function shell({ title, back = false, right = '', body, nav = true, cls = '' }) {
  const tab = (href, label, icon) =>
    `<a href="${href}" class="${current.name === href.slice(2) || (href === '#/' && current.name === '') ? 'on' : ''}">${icon}<span>${label}</span></a>`;
  return `
    <header class="topbar">
      ${back ? `<button class="icon-btn" data-action="back" aria-label="Back">${ICONS.back}</button>` : '<span class="logo">' + ICONS.target + '</span>'}
      <h1>${esc(title)}</h1>
      <div class="topbar-right">${right}</div>
    </header>
    <main class="screen ${cls}">${body}</main>
    ${nav ? `<nav class="tabbar">
      ${tab('#/', 'Home', ICONS.home)}
      ${tab('#/history', 'History', ICONS.list)}
      ${tab('#/stats', 'Stats', ICONS.chart)}
      ${tab('#/settings', 'Settings', ICONS.gear)}
    </nav>` : ''}`;
}

const ICONS = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h14M5 18h14" /></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>',
  card: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>',
};

// ---------- routing ----------

let current = { name: '', id: null };

function parseRoute() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  return { name: parts[0] || '', id: parts[1] || null };
}

function render() {
  current = parseRoute();
  const screens = { '': renderHome, new: renderNew, score: renderScore, round: renderRound, history: renderHistory, stats: renderStats, settings: renderSettings };
  (screens[current.name] || renderHome)();
  renderModal();
}

window.addEventListener('hashchange', () => {
  ui.editing = null;
  ui.restoring = false;
  // Start each visit to the new round screen from the remembered archers.
  if (parseRoute().name !== 'new') ui.newArchers = null;
  render();
  window.scrollTo(0, 0);
});

// ---------- shared pieces ----------

function roundRow(r) {
  const st = roundStats(r);
  const status = r.finishedAt ? '' : '<span class="badge">In progress</span>';
  const named = showNames();
  return `
    <a class="round-row" href="#/round/${r.id}">
      <div>
        <div class="rr-date">${esc(named ? nameOf(r) : fmtDate(r.date))} ${status}</div>
        <div class="rr-config">${named ? esc(fmtDate(r.date)) + ' · ' : ''}${esc(describeConfig(r))}${r.location ? ' · ' + esc(r.location) : ''}</div>
      </div>
      <div class="rr-score">${isPractice(r) ? `
        <b>${st.avg.toFixed(2)}</b><small> avg</small>
        <div class="rr-sub">${st.total} from ${st.arrows} arrows</div>` : `
        <b>${st.total}</b><small>/${st.maxScore}</small>
        <div class="rr-sub">${st.tens}×10${hasX(r.bow) ? ` · ${st.xs}X` : ''}</div>`}
      </div>
    </a>`;
}

function bestByConfig(rounds) {
  const best = new Map();
  for (const r of rounds) {
    // Practice has no fixed length, so its totals can't be compared as personal bests.
    if (!r.finishedAt || isPractice(r)) continue;
    const st = roundStats(r);
    const k = configKey(r);
    if (!best.has(k) || compareScores(st, best.get(k).st) < 0) best.set(k, { r, st });
  }
  return best;
}

function isPersonalBest(round) {
  const best = bestByConfig(store.getRounds()).get(configKey(round));
  return best && best.r.id === round.id;
}

// ---------- home ----------

function renderHome() {
  const rounds = store.getRounds();
  const recent = rounds.filter(r => r.finishedAt).slice(0, 5);
  const best = [...bestByConfig(rounds).values()];
  const named = showNames();

  // One card per in-progress session, listing every archer in it.
  const seen = new Set();
  const sessions = [];
  for (const r of rounds) {
    if (r.finishedAt || seen.has(r.groupId || r.id)) continue;
    seen.add(r.groupId || r.id);
    sessions.push(store.getGroup(r).filter(g => !g.finishedAt));
  }

  const activeHtml = sessions.map(group => {
    const first = group[0];
    const lines = group.map(r => {
      const st = roundStats(r);
      return `<div class="active-archer"><span>${named ? `<b>${esc(nameOf(r))}</b> · ` : ''}${esc(describeConfig(r))}</span><b class="${group.length > 1 ? '' : 'big-num'}">${st.total}</b></div>`;
    }).join('');
    return `
      <div class="card active-card">
        <div class="card-label">Round in progress</div>
        <div class="muted">${esc(fmtDate(first.date))} · ${isPractice(first)
          ? `Practice · End ${first.ends.length}`
          : `End ${first.ends.length} of ${ROUNDS[first.type].ends}`}</div>
        <div class="active-list">${lines}</div>
        <a class="btn primary block" href="#/score/${first.id}">Resume scoring</a>
      </div>`;
  }).join('');

  const bestHtml = best.length ? `
    <h2 class="section">Personal bests</h2>
    <div class="card list">${best.map(({ r, st }) => `
      <a class="pb-row" href="#/round/${r.id}">
        <span>${named ? `<b>${esc(nameOf(r))}</b> · ` : ''}${esc(describeConfig(r))}</span>
        <span><b>${st.total}</b> <small class="muted">${st.tens}×10${hasX(r.bow) ? ` ${st.xs}X` : ''}</small></span>
      </a>`).join('')}</div>` : '';

  const recentHtml = recent.length ? `
    <h2 class="section">Recent rounds <a href="#/history" class="see-all">See all</a></h2>
    <div class="card list">${recent.map(roundRow).join('')}</div>` : '';

  const empty = !rounds.length ? `
    <div class="empty">
      ${faceSVG('full40')}
      <p><b>Ready when you are.</b><br>Start a World Archery 18m round: 60 arrows, 20 ends of 3.</p>
    </div>` : '';

  app.innerHTML = shell({
    title: 'Archery Scoring',
    body: `${activeHtml}<a class="btn primary block big" href="#/new">+ Start new round</a>${empty}${bestHtml}${recentHtml}`,
  });
}

// ---------- new round ----------

// Each archer row is { who: 'me' | person id | 'new', newName, bow, face }.
function defaultArchers() {
  const s = store.getSettings();
  const people = new Set(store.getPeople().map(p => p.id));
  const seen = new Set();
  const last = (s.lastArchers || []).filter(a =>
    (a.who === store.ME || people.has(a.who)) && !seen.has(a.who) && seen.add(a.who));
  return last.length
    ? last.map(a => ({ ...a, newName: '' }))
    : [{ who: store.ME, newName: '', bow: s.defaultBow, face: s.defaultFace }];
}

function archerRowsHTML() {
  const rows = ui.newArchers;
  const myName = store.getSettings().myName;
  const people = store.getPeople();
  const opt = (map, value) => Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return rows.map((a, i) => {
    const taken = new Set(rows.filter((_, j) => j !== i).map(x => x.who));
    const choice = (id, label) => `<option value="${id}" ${a.who === id ? 'selected' : ''} ${taken.has(id) ? 'disabled' : ''}>${esc(label)}</option>`;
    return `
      <div class="archer-row" data-row="${i}">
        <div class="archer-top">
          <span class="archer-no">${i + 1}</span>
          <select data-arch="who" aria-label="Archer ${i + 1}">
            ${choice(store.ME, myName ? `${myName} (me)` : 'Me')}
            ${people.map(p => choice(p.id, p.name)).join('')}
            <option value="new" ${a.who === 'new' ? 'selected' : ''}>+ New person…</option>
          </select>
          ${rows.length > 1 ? `<button type="button" class="icon-btn remove" data-action="archer-remove" data-i="${i}" aria-label="Remove archer ${i + 1}">✕</button>` : ''}
        </div>
        ${a.who === 'new' ? `<input type="text" data-arch="newName" value="${esc(a.newName)}" placeholder="Their name" maxlength="40" autocomplete="off">` : ''}
        <div class="archer-opts">
          <select data-arch="bow" aria-label="Bow">${opt(BOWS, a.bow)}</select>
          <select data-arch="face" aria-label="Target face">${opt(FACES, a.face)}</select>
        </div>
      </div>`;
  }).join('');
}

function rulesHintHTML() {
  // Rules for every bow and face in use, without repeating the same line.
  const lines = [...new Set(ui.newArchers.flatMap(a => rulesHint(a.bow, a.face)))];
  return lines.map(p => `<p>${esc(p)}</p>`).join('');
}

function renderNew() {
  if (!ui.newArchers) ui.newArchers = defaultArchers();
  const s = store.getSettings();
  const lastType = ROUNDS[s.lastType] ? s.lastType : 'wa18';
  const roundLabel = t => (t.practice ? `${t.name} · no set length` : `${t.name} · ${t.ends * t.arrowsPerEnd} arrows`);
  const perEndOptions = ['', ...Array.from({ length: 12 }, (_, i) => String(i + 1))]
    .map(v => `<option value="${v}" ${v === String(s.lastPerEnd || '') ? 'selected' : ''}>${v ? `${v} arrow${v === '1' ? '' : 's'}` : 'No limit'}</option>`).join('');

  app.innerHTML = shell({
    title: 'New round',
    back: true,
    nav: false,
    body: `
      <form id="new-form" class="form">
        <div class="field">
          <span class="field-label">Round</span>
          <select name="type">${Object.values(ROUNDS).map(t => `<option value="${t.id}" ${t.id === lastType ? 'selected' : ''}>${esc(roundLabel(t))}</option>`).join('')}</select>
        </div>
        <label class="field" id="per-end-field" ${ROUNDS[lastType].practice ? '' : 'hidden'}>
          <span class="field-label">Arrows per end</span>
          <select name="perEnd">${perEndOptions}</select>
          <small class="muted">With no limit, you choose when each end is over. Finish the practice whenever you're done.</small>
        </label>
        <div class="field">
          <span class="field-label">Archers</span>
          <div id="archers" class="archers">${archerRowsHTML()}</div>
          <button type="button" class="btn block" data-action="archer-add">+ Add archer</button>
        </div>
        <div class="card hint" id="rules-hint">${rulesHintHTML()}</div>
        <label class="field"><span class="field-label">Date</span><input type="date" name="date" value="${today()}" required></label>
        <label class="field"><span class="field-label">Location <small>(optional)</small></span><input type="text" name="location" placeholder="e.g. Club range" maxlength="80"></label>
        <label class="field"><span class="field-label">Notes <small>(optional)</small></span><textarea name="notes" rows="2" placeholder="Equipment, conditions, goals…" maxlength="500"></textarea></label>
        <button class="btn primary block big" type="submit">Start scoring</button>
      </form>`,
  });

  const form = $('#new-form');
  const archers = $('#archers');

  const onArcherInput = e => {
    const el = e.target;
    const row = el.closest('[data-row]');
    if (!row || !el.dataset.arch) return;
    ui.newArchers[Number(row.dataset.row)][el.dataset.arch] = el.value;
    // Picking "New person" adds a name box, and other rows' choices change, so redraw the rows.
    if (el.dataset.arch === 'who' && e.type === 'change') {
      archers.innerHTML = archerRowsHTML();
      if (el.value === 'new') archers.querySelector(`[data-row="${row.dataset.row}"] [data-arch="newName"]`)?.focus();
    }
    $('#rules-hint').innerHTML = rulesHintHTML();
  };
  archers.addEventListener('change', onArcherInput);
  archers.addEventListener('input', onArcherInput);
  form.elements.type.addEventListener('change', e => {
    $('#per-end-field').hidden = !ROUNDS[e.target.value].practice;
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const rows = ui.newArchers;
    const unnamed = rows.findIndex(a => a.who === 'new' && !a.newName.trim());
    if (unnamed >= 0) { toast(`Enter a name for archer ${unnamed + 1}`); return; }
    const picked = rows.filter(a => a.who !== 'new').map(a => a.who);
    if (new Set(picked).size !== picked.length) { toast('The same archer is listed twice'); return; }

    const f = new FormData(form);
    const groupId = uid();
    const type = f.get('type');
    const perEnd = ROUNDS[type].practice ? Number(f.get('perEnd')) || null : null;
    const base = {
      type,
      ...(ROUNDS[type].practice ? { arrowsPerEnd: perEnd } : {}),
      date: f.get('date') || today(),
      location: (f.get('location') || '').trim(),
      notes: (f.get('notes') || '').trim(),
      createdAt: Date.now(),
      finishedAt: null,
      groupId,
    };
    const chosen = rows.map(a => ({ ...a, who: a.who === 'new' ? store.addPerson(a.newName.trim()).id : a.who }));
    const rounds = chosen.map((a, seat) => ({ ...base, id: uid() + seat, archerId: a.who, seat, bow: a.bow, face: a.face, ends: [[]] }));
    rounds.forEach(store.addRound);

    store.updateSettings({
      defaultBow: chosen[0].bow,
      defaultFace: chosen[0].face,
      lastArchers: chosen.map(({ who, bow, face }) => ({ who, bow, face })),
      lastType: type,
      ...(ROUNDS[type].practice ? { lastPerEnd: perEnd } : {}),
    });
    ui.newArchers = null;
    navigator.storage?.persist?.().catch(() => {});
    location.replace(`#/score/${rounds[0].id}`);
  });
}

// ---------- scoring ----------

function renderScore() {
  const round = store.getRound(current.id);
  if (!round) return go('#/');
  if (round.finishedAt) return location.replace(`#/round/${round.id}`);

  const tpl = roundSpec(round);
  const practice = isPractice(round);
  const st = roundStats(round);
  const settings = store.getSettings();
  const mode = settings.showTarget ? settings.defaultEntry : 'keypad';
  const group = store.getGroup(round);
  const endIdx = round.ends.length - 1;
  const end = currentEnd(round);
  const per = tpl.arrowsPerEnd;
  const full = endIsFull(round);
  const done = endIsDone(round);
  const lastEnd = !practice && endIdx === tpl.ends - 1;
  const endTotal = st.endTotals[endIdx] || 0;
  const labels = allowedLabels(round.bow, round.face);

  // With no limit per end, there is always one empty box waiting for the next arrow.
  const slots = Array.from({ length: per || end.length + 1 }, (_, i) => {
    const a = end[i];
    return a
      ? `<button type="button" class="slot filled ${labelClass(a.v)}" data-action="edit-arrow" data-i="${endIdx}" data-k="${i}" aria-label="Change arrow ${i + 1}">${esc(a.v)}</button>`
      : `<div class="slot ${i === end.length ? 'next' : ''}"></div>`;
  }).join('');

  const prev = round.ends[endIdx - 1];
  const where = practice ? '' : `Half ${Math.floor(endIdx / (tpl.ends / tpl.halves)) + 1} · `;
  const prevHtml = prev
    ? `<div class="prev-end">End ${endIdx}: ${sortArrows(prev).map(a => chip(a.v)).join('')} <b>${st.endTotals[endIdx - 1]}</b></div>`
    : `<div class="prev-end muted">${where}${esc(describeConfig(round))}</div>`;

  // With several archers, tabs show whose arrows are being entered; a tick means their end is done.
  const archerTabs = group.length > 1 ? `
    <div class="archer-tabs">${group.map(r => `
      <button type="button" class="archer-tab ${r.id === round.id ? 'on' : ''}" data-action="goto-archer" data-id="${r.id}">
        <span>${endIsDone(r) ? '✓ ' : ''}${esc(nameOf(r))}</span><b>${roundStats(r).total}</b>
      </button>`).join('')}
    </div>` : (archerOf(round) !== store.ME ? `<div class="solo-name">Scoring <b>${esc(nameOf(round))}</b></div>` : '');

  let entry;
  if (mode === 'target') {
    const single = singleSpotEntry(round);
    const earlier = round.ends.slice(0, endIdx).flat();
    const content =
      earlier.map(a => markerSVG(round.face, a, { cls: 'mk faint', r: 0.4, single })).join('') +
      end.map((a, i) => markerSVG(round.face, a, { label: String(i + 1), single, r: Math.max(settings.arrowDiameterMm / 20, 0.3) })).join('') +
      `<g id="ghost" class="ghost" style="display:none"><circle class="ghost-ring" r="2.4"/><circle class="ghost-dot" r="${Math.max(settings.arrowDiameterMm / 20, 0.3)}"/></g>`;
    const attrs = 'id="target-svg"';
    entry = `
      <div class="preview" id="preview">${full ? 'End complete. Tap a score above to adjust it.' : end.length ? 'Place the next arrow, or tap a score to adjust it' : 'Touch and drag to place the arrow'}</div>
      <div class="face-wrap" id="face-wrap">${single ? singleSpotSVG(round.face, content, attrs) : faceSVG(round.face, content, attrs)}</div>`;
  } else {
    entry = keypadHTML(labels, 'arrow', full);
  }

  // After this archer's end: move on to the next archer still to shoot, then to the next end.
  const seat = group.indexOf(round);
  const waiting = [...group.slice(seat + 1), ...group.slice(0, seat)].find(r => !endIsDone(r));
  let nextBtn;
  if (!done) nextBtn = `<button type="button" class="btn" disabled>${per ? `${end.length}/${per} arrows` : 'No arrows yet'}</button>`;
  else if (waiting) nextBtn = `<button type="button" class="btn primary" data-action="goto-archer" data-id="${waiting.id}">Next: ${esc(nameOf(waiting))} →</button>`;
  else if (lastEnd) nextBtn = '<button type="button" class="btn primary" data-action="finish">Finish round</button>';
  else nextBtn = '<button type="button" class="btn primary" data-action="next-end">Next end →</button>';

  app.innerHTML = shell({
    title: practice ? `Practice · End ${endIdx + 1}` : `End ${endIdx + 1} of ${tpl.ends}`,
    back: true,
    nav: false,
    cls: 'score-screen',
    // Practice has no last end, so it can be finished at any time.
    right: (practice ? '<button type="button" class="text-btn" data-action="finish">Finish</button>' : '') +
      `<a class="icon-btn" href="#/round/${round.id}" aria-label="Scorecard">${ICONS.card}</a>`,
    body: `
      ${archerTabs}
      <div class="stat-strip">
        <div><small>Total</small><b>${st.total}</b></div>
        <div><small>10s</small><b>${st.tens}</b></div>
        ${hasX(round.bow) ? `<div><small>Xs</small><b>${st.xs}</b></div>` : ''}
        <div><small>Avg</small><b>${st.avg.toFixed(2)}</b></div>
      </div>
      <div class="end-row ${per ? '' : 'open'}"><div class="slots">${slots}</div><div class="end-total"><small>End</small>${endTotal}</div></div>
      ${prevHtml}
      ${settings.showTarget ? `<div class="mode-tabs">
        <button type="button" data-action="mode" data-m="keypad" class="${mode === 'keypad' ? 'on' : ''}">Keypad</button>
        <button type="button" data-action="mode" data-m="target" class="${mode === 'target' ? 'on' : ''}">Target</button>
      </div>` : ''}
      <div class="entry mode-${mode}">${entry}</div>
      <div class="score-actions">
        <button type="button" class="btn" data-action="undo" ${st.arrows ? '' : 'disabled'}>Undo</button>
        ${mode === 'target' ? `<button type="button" class="btn z-miss" data-action="arrow" data-v="M" ${full ? 'disabled' : ''}>Miss</button>` : ''}
        ${nextBtn}
      </div>`,
  });

  if (mode === 'target') bindTarget(round, full);
}

function bindTarget(round, full) {
  const wrap = $('#face-wrap');
  const svg = $('#target-svg');
  const ghost = $('#ghost');
  const preview = $('#preview');
  if (!wrap || !svg || full) return;
  const diameter = store.getSettings().arrowDiameterMm;
  let hit = null;

  const update = e => {
    const offset = e.pointerType === 'mouse' ? 0 : TOUCH_OFFSET_PX;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY - offset;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    hit = hitTest(round.face, round.bow, p.x, p.y, diameter, singleSpotEntry(round));
    ghost.setAttribute('transform', `translate(${p.x} ${p.y})`);
    ghost.style.display = '';
    preview.innerHTML = `Arrow ${currentEnd(round).length + 1}: ${chip(hit.v)} <small>release to place</small>`;
  };
  const cancel = () => {
    hit = null;
    ghost.style.display = 'none';
    preview.textContent = 'Touch and drag to place the arrow';
  };

  wrap.addEventListener('pointerdown', e => {
    e.preventDefault();
    wrap.setPointerCapture(e.pointerId);
    update(e);
  });
  wrap.addEventListener('pointermove', e => { if (hit) update(e); });
  wrap.addEventListener('pointerup', () => {
    if (!hit) return;
    const a = hit;
    hit = null;
    addArrow(round, a);
  });
  wrap.addEventListener('pointercancel', cancel);
}

function addArrow(round, arrow) {
  if (endIsFull(round)) return;
  currentEnd(round).push(arrow);
  store.updateRound(round);
  buzz();
  render();
}

// Archers in a group always have the same number of ends, so going back an end
// happens for everyone, and only once nobody has started the current end.
function undo(round) {
  const group = store.getGroup(round);
  if (!currentEnd(round).length) {
    if (round.ends.length < 2) return;
    if (group.some(r => currentEnd(r).length)) {
      toast(`${nameOf(round)} has no arrows in this end yet`);
      return;
    }
    for (const r of group) { r.ends.pop(); store.updateRound(r); }
  }
  currentEnd(round).pop();
  store.updateRound(round);
  render();
}

function nextEnd(round) {
  const group = store.getGroup(round);
  for (const r of group) { r.ends.push([]); store.updateRound(r); }
  // Each end starts again with the first archer.
  if (group[0].id !== round.id) location.replace(`#/score/${group[0].id}`);
  else render();
}

function finishRound(round) {
  let group = store.getGroup(round);
  if (isPractice(round)) {
    if (!confirm('Finish this practice?')) return;
    // Drop an end that was started but not shot, and anyone who shot nothing at all.
    for (const r of group) if (r.ends.length > 1 && !currentEnd(r).length) r.ends.pop();
    const empty = group.filter(r => !r.ends.flat().length);
    empty.forEach(r => store.deleteRound(r.id));
    group = group.filter(r => !empty.includes(r));
    if (!group.length) {
      location.replace('#/');
      toast('Nothing was scored, so the practice was not saved');
      return;
    }
  }
  for (const r of group) {
    r.finishedAt = Date.now();
    store.updateRound(r);
    ui.justFinished.add(r.id);
  }
  location.replace(`#/round/${group[0].id}`);
}

// ---------- scorecard ----------

// Practice ends can be any size, so each end's arrows share one cell.
function practiceCardHTML(round) {
  const st = roundStats(round);
  const rows = round.ends.map((end, i) => end.length ? `
    <tr class="editable" data-action="edit-end" data-i="${i}">
      <td class="end-no">${i + 1}</td>
      <td class="arrows-cell">${sortArrows(end).map(a => chip(a.v)).join('')}</td>
      <td class="num">${st.endTotals[i]}</td>
      <td class="num run">${st.running[i]}</td>
    </tr>` : '').join('');
  return `
    <table class="scorecard">
      <thead><tr><th>End</th><th>Arrows</th><th>End</th><th>Total</th></tr></thead>
      <tbody>${rows || '<tr class="blank"><td colspan="4">No arrows yet</td></tr>'}</tbody>
    </table>`;
}

function scorecardHTML(round) {
  if (isPractice(round)) return practiceCardHTML(round);
  const tpl = ROUNDS[round.type];
  const st = roundStats(round);
  const perHalf = tpl.ends / tpl.halves;
  let html = '';
  for (let h = 0; h < tpl.halves; h++) {
    let rows = '';
    for (let i = h * perHalf; i < (h + 1) * perHalf; i++) {
      const end = round.ends[i];
      const shot = end && end.length;
      const cells = Array.from({ length: tpl.arrowsPerEnd }, (_, k) => {
        const a = shot ? sortArrows(end)[k] : null;
        return `<td>${a ? chip(a.v) : ''}</td>`;
      }).join('');
      rows += `<tr class="${shot ? 'editable' : 'blank'}" ${shot ? `data-action="edit-end" data-i="${i}"` : ''}>
        <td class="end-no">${i + 1}</td>${cells}
        <td class="num">${shot ? st.endTotals[i] : ''}</td>
        <td class="num run">${shot ? st.running[i] : ''}</td>
      </tr>`;
    }
    html += `
      <table class="scorecard">
        <thead><tr><th>End</th>${Array.from({ length: tpl.arrowsPerEnd }, (_, k) => `<th>${k + 1}</th>`).join('')}<th>End</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="${tpl.arrowsPerEnd + 2}">Half ${h + 1}</td><td class="num">${st.halfTotals[h]}</td></tr></tfoot>
      </table>`;
  }
  return html;
}

function renderRound() {
  const round = store.getRound(current.id);
  if (!round) return go('#/');
  const st = roundStats(round);
  const tpl = ROUNDS[round.type];
  const practice = isPractice(round);
  const arrows = round.ends.flat();
  const pts = plotted(arrows);

  const group = store.getGroup(round);
  const named = showNames();

  let banner = '';
  if (ui.justFinished.has(round.id)) {
    ui.justFinished.delete(round.id);
    const who = named ? `${nameOf(round)}: ` : '';
    if (practice) {
      banner = `<div class="card banner">${esc(who)}practice saved! <b>${st.arrows} arrows, ${st.avg.toFixed(2)} avg</b></div>`;
    } else {
      const pb = isPersonalBest(round) && store.getRounds().filter(r => r.finishedAt && configKey(r) === configKey(round)).length > 1;
      banner = `<div class="card banner ${pb ? 'pb' : ''}">${pb ? `🏆 ${esc(who)}new personal best!` : `${esc(who)}round complete!`} <b>${st.total}/${st.maxScore}</b></div>`;
    }
  }

  // Everyone scored in the same session, best first, to switch between their cards.
  // Practice archers may shoot different numbers of arrows, so they're ranked by average.
  const ranked = [...group].sort((a, b) => practice
    ? roundStats(b).avg - roundStats(a).avg
    : compareScores(roundStats(a), roundStats(b)));
  const groupTabs = group.length > 1 ? `
    <div class="archer-tabs">${ranked.map(r => `
      <button type="button" class="archer-tab ${r.id === round.id ? 'on' : ''}" data-action="goto-card" data-id="${r.id}">
        <span>${esc(nameOf(r))}</span><b>${practice ? roundStats(r).avg.toFixed(2) : roundStats(r).total}</b>
      </button>`).join('')}
    </div>` : '';

  const plot = pts.length ? (() => {
    const c = groupCentre(arrows);
    const dots = pts.map(a => markerSVG(round.face, a, { cls: 'mk dot', r: 0.45, single: true })).join('');
    return `
      <h2 class="section">Arrow plot</h2>
      <div class="card plot">${singleSpotSVG(round.face, dots + centreSVG(c))}<p class="muted">${pts.length} plotted arrows. ${esc(describeOffset(c))}</p></div>`;
  })() : '';

  app.innerHTML = shell({
    title: round.finishedAt ? 'Scorecard' : 'Scorecard (in progress)',
    back: true,
    body: `
      ${groupTabs}
      ${banner}
      <div class="card totals">
        ${named ? `<div class="card-name">${esc(nameOf(round))}</div>` : ''}
        <div class="total-big"><b>${st.total}</b><small>${practice ? ` from ${st.arrows} arrows` : `/ ${st.maxScore}`}</small></div>
        <div class="total-grid">
          <div><small>10s</small><b>${st.tens}</b></div>
          ${hasX(round.bow) ? `<div><small>Xs</small><b>${st.xs}</b></div>` : ''}
          <div><small>Misses</small><b>${st.misses}</b></div>
          <div><small>Avg/arrow</small><b>${st.avg.toFixed(2)}</b></div>
        </div>
        <div class="muted meta">${esc(fmtDate(round.date))} · ${practice ? '' : esc(tpl.name) + ' · '}${esc(describeConfig(round))}${round.location ? ' · ' + esc(round.location) : ''}</div>
        ${round.notes ? `<p class="notes">${esc(round.notes)}</p>` : ''}
      </div>
      ${round.finishedAt ? '' : `<a class="btn primary block" href="#/score/${round.id}">Continue scoring</a>`}
      <p class="muted small-print">Tap an end to correct it.</p>
      ${scorecardHTML(round)}
      ${plot}
      <div class="row-actions">
        <button type="button" class="btn" data-action="share">Share score</button>
        <button type="button" class="btn danger" data-action="delete-round">Delete round</button>
      </div>`,
  });
}

function shareText(round) {
  const st = roundStats(round);
  const who = showNames() ? nameOf(round) + ' · ' : '';
  const tens = `${st.tens}×10${hasX(round.bow) ? `, ${st.xs}X` : ''}`;
  if (isPractice(round)) {
    return `${who}${describeConfig(round)}\n${fmtDate(round.date)}: ${st.total} from ${st.arrows} arrows, ${st.avg.toFixed(2)} avg (${tens})`;
  }
  return `${who}${ROUNDS[round.type].name} · ${describeConfig(round)}\n${fmtDate(round.date)}: ${st.total}/${st.maxScore} (${tens})`;
}

async function share(round) {
  const text = shareText(round);
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('Score copied to clipboard');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Could not share');
  }
}

// ---------- edit end modal ----------

function openEdit(round, i, sel = 0) {
  ui.editing = { roundId: round.id, i, arrows: round.ends[i].map(a => ({ ...a })), sel };
  renderModal();
}

// Changing a plotted arrow's score moves its dot into the new ring; an unplotted one just changes.
function setEditedScore(v) {
  const ed = ui.editing;
  const round = store.getRound(ed.roundId);
  const a = ed.arrows[ed.sel];
  const pos = snapToScore(a, round.bow, round.face, v, store.getSettings().arrowDiameterMm);
  ed.arrows[ed.sel] = pos ? { ...a, v, ...pos } : { v };
}

function editPlotHTML(round, ed) {
  const pts = ed.arrows.filter(hasPos);
  if (!pts.length) return '';
  const r = Math.max(store.getSettings().arrowDiameterMm / 20, 0.3);
  // Every arrow's position is relative to its own spot, so draw one spot zoomed to fit the arrows.
  const reach = Math.max(...pts.map(a => Math.hypot(a.x, a.y)));
  const zoom = Math.min(Math.max(reach + 2.5, 6), ringOuter(lowestRing(round.face)) + 1);
  const marks = ed.arrows.map((a, k) =>
    markerSVG(round.face, a, { label: String(k + 1), single: true, r, cls: k === ed.sel ? 'mk sel' : 'mk' })).join('');
  return `<div class="edit-plot">${singleSpotSVG(round.face, marks, '', zoom)}</div>`;
}

function closeModal() {
  ui.editing = null;
  ui.restoring = false;
  renderModal();
}

function renderModal() {
  if (ui.restoring) return renderRestoreSheet();
  const ed = ui.editing;
  if (!ed) { modal.hidden = true; modal.innerHTML = ''; return; }
  const round = store.getRound(ed.roundId);
  const labels = allowedLabels(round.bow, round.face);
  modal.hidden = false;
  modal.innerHTML = `
    <div class="sheet" role="dialog" aria-label="Edit end">
      <h2>Edit end ${ed.i + 1}</h2>
      <p class="muted">Tap an arrow, then its correct score.${ed.arrows.some(hasPos) ? ' Plotted arrows move into the ring you pick.' : ''}</p>
      <div class="end-row">${ed.arrows.map((a, k) => `
        <button type="button" class="slot filled ${labelClass(a.v)} ${k === ed.sel ? 'sel' : ''}" data-action="edit-sel" data-k="${k}">${esc(a.v)}</button>`).join('')}
      </div>
      ${editPlotHTML(round, ed)}
      ${keypadHTML(labels, 'edit-set')}
      <div class="row-actions">
        <button type="button" class="btn" data-action="edit-cancel">Cancel</button>
        <button type="button" class="btn primary" data-action="edit-save">Save</button>
      </div>
    </div>`;
}

// ---------- backup code (clipboard) ----------

// A backup code is the JSON backup, compressed and base64url-encoded, behind a short prefix.
const BACKUP_PREFIX = 'ARCHERY1:';

async function encodeBackup(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return BACKUP_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decodeBackup(code) {
  const clean = code.replace(/\s+/g, '');
  if (!clean.startsWith(BACKUP_PREFIX)) throw new Error("That doesn't look like an archery backup code.");
  let b64 = clean.slice(BACKUP_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  try {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  } catch {
    throw new Error('The backup code is incomplete or damaged. Make sure you copied all of it.');
  }
}

async function copyBackupCode() {
  const code = await encodeBackup(store.exportJSON());
  try {
    await navigator.clipboard.writeText(code);
    const n = store.getRounds().length;
    toast(`Backup code copied: ${n} round${n === 1 ? '' : 's'}. Paste it somewhere safe.`);
  } catch {
    // Clipboard blocked: show the code so it can be copied by hand.
    ui.restoring = true;
    renderModal();
    const box = $('#restore-code');
    box.value = code;
    box.select();
    toast('Could not copy automatically. Select the code and copy it.');
  }
}

function renderRestoreSheet() {
  modal.hidden = false;
  modal.innerHTML = `
    <div class="sheet" role="dialog" aria-label="Restore from backup code">
      <h2>Backup code</h2>
      <p class="muted">Paste a backup code to add its rounds to this phone. Rounds already here are kept.</p>
      <textarea id="restore-code" class="code-box" rows="6" spellcheck="false" autocomplete="off" placeholder="ARCHERY1:…"></textarea>
      <button type="button" class="btn block" data-action="restore-paste">Paste from clipboard</button>
      <div class="row-actions">
        <button type="button" class="btn" data-action="modal-close">Cancel</button>
        <button type="button" class="btn primary" data-action="restore-import">Restore</button>
      </div>
    </div>`;
}

async function restoreFromCode() {
  const code = $('#restore-code').value.trim();
  if (!code) { toast('Paste a backup code first'); return; }
  try {
    const { added, skipped } = store.importJSON(await decodeBackup(code));
    closeModal();
    render();
    toast(`Restored ${added} round${added === 1 ? '' : 's'}${skipped ? `, ${skipped} already here` : ''}`);
  } catch (err) {
    toast(err.message || 'Could not read that backup code');
  }
}

// ---------- history ----------

function configOptions(rounds) {
  const seen = new Map();
  for (const r of rounds) if (!seen.has(configKey(r))) seen.set(configKey(r), describeConfig(r));
  return seen;
}

// Archers who have rounds, you first, then everyone else by name.
function archerOptions(rounds) {
  const ids = [...new Set(rounds.map(archerOf))];
  return ids
    .map(id => [id, store.archerName(id)])
    .sort((a, b) => (b[0] === store.ME) - (a[0] === store.ME) || a[1].localeCompare(b[1]));
}

function renderHistory() {
  const rounds = store.getRounds();
  const archers = archerOptions(rounds);
  if (ui.historyFilter !== 'all' && !archers.some(([id]) => id === ui.historyFilter)) ui.historyFilter = 'all';
  const shown = ui.historyFilter === 'all' ? rounds : rounds.filter(r => archerOf(r) === ui.historyFilter);

  app.innerHTML = shell({
    title: 'History',
    body: rounds.length ? `
      ${archers.length > 1 ? `<select class="filter" data-change="history-filter" aria-label="Archer">
        <option value="all">Everyone (${rounds.length} rounds)</option>
        ${archers.map(([id, name]) => `<option value="${id}" ${id === ui.historyFilter ? 'selected' : ''}>${esc(name)}</option>`).join('')}
      </select>` : ''}
      <div class="card list">${shown.map(roundRow).join('')}</div>`
      : '<div class="empty"><p>No rounds yet. Your scored rounds will appear here.</p><a class="btn primary" href="#/new">Start a round</a></div>',
  });
}

// ---------- stats ----------

// Plots each round's total, or for practice its average per arrow (decimals = 2).
function trendSVG(rounds, value = r => roundStats(r).total, decimals = 0) {
  const vals = rounds.map(value);
  const W = 340, H = 150, L = 36, R = 10, T = 12, B = 22;
  const minSpan = decimals ? 0.5 : 10;
  const step = 10 ** -decimals;
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < minSpan) { const mid = (max + min) / 2; min = mid - minSpan / 2; max = mid + minSpan / 2; }
  const pad = (max - min) * 0.1;
  min = Math.floor((min - pad) / step) * step; max = Math.ceil((max + pad) / step) * step;
  const fmt = v => v.toFixed(decimals);
  const x = i => L + (vals.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (vals.length - 1));
  const y = v => T + (max - v) * (H - T - B) / (max - min);
  const best = Math.max(...vals);
  const grid = [min, (min + max) / 2, max].map(v =>
    `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('');
  const line = vals.length > 1 ? `<polyline class="trend" points="${vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>` : '';
  const dots = vals.map((v, i) => `<circle class="${v === best ? 'pt best' : 'pt'}" cx="${x(i)}" cy="${y(v)}" r="${v === best ? 4.5 : 3.2}"><title>${esc(fmtDate(rounds[i].date))}: ${fmt(v)}</title></circle>`).join('');
  const first = fmtDate(rounds[0].date), last = fmtDate(rounds[rounds.length - 1].date);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}${line}${dots}
    <text class="axis" x="${L}" y="${H - 4}">${esc(first)}</text>
    ${rounds.length > 1 ? `<text class="axis" x="${W - R}" y="${H - 4}" text-anchor="end">${esc(last)}</text>` : ''}</svg>`;
}

function renderStats() {
  const finished = store.getRounds().filter(r => r.finishedAt);
  if (!finished.length) {
    app.innerHTML = shell({ title: 'Stats', body: '<div class="empty"><p>Finish a round to see your stats, personal bests and trends.</p></div>' });
    return;
  }
  const archers = archerOptions(finished);
  if (!archers.some(([id]) => id === ui.statsArcher)) ui.statsArcher = archers[0][0];
  const mine = finished.filter(r => archerOf(r) === ui.statsArcher);
  const configs = configOptions(mine);
  if (!ui.statsConfig || !configs.has(ui.statsConfig)) ui.statsConfig = configKey(mine[0]);
  const rounds = mine.filter(r => configKey(r) === ui.statsConfig);
  const sample = rounds[0];
  const stats = rounds.map(roundStats);
  const n = rounds.length;
  const sum = f => stats.reduce((t, s) => t + f(s), 0);
  const bestIdx = stats.reduce((bi, s, i) => (compareScores(s, stats[bi]) < 0 ? i : bi), 0);
  const arrows = rounds.flatMap(r => r.ends.flat());
  const showX = hasX(sample.bow);

  const practice = isPractice(sample);
  const totalArrows = sum(s => s.arrows);
  const pct = f => `${totalArrows ? Math.round((sum(f) / totalArrows) * 100) : 0}%`;
  const tile = (label, value) => `<div class="tile"><small>${label}</small><b>${value}</b></div>`;
  // Practice sessions vary in length, so they're compared per arrow rather than by total.
  const tiles = (practice ? [
    tile('Sessions', n),
    tile('Arrows', totalArrows),
    tile('Avg/arrow', (sum(s => s.total) / totalArrows).toFixed(2)),
    tile('Best avg', Math.max(...stats.map(s => s.avg)).toFixed(2)),
    tile('10s', pct(s => s.tens)),
    showX ? tile('Xs', pct(s => s.xs)) : tile('Misses', pct(s => s.misses)),
  ] : [
    tile('Rounds', n),
    tile('Best', `${stats[bestIdx].total}`),
    tile('Average', (sum(s => s.total) / n).toFixed(1)),
    tile('Avg/arrow', (sum(s => s.total) / totalArrows).toFixed(2)),
    tile('10s/round', (sum(s => s.tens) / n).toFixed(1)),
    showX ? tile('Xs/round', (sum(s => s.xs) / n).toFixed(1)) : tile('Misses/round', (sum(s => s.misses) / n).toFixed(1)),
  ]).join('');

  const counts = {};
  for (const a of arrows) counts[a.v] = (counts[a.v] || 0) + 1;
  const labels = allowedLabels(sample.bow, sample.face);
  const maxCount = Math.max(1, ...Object.values(counts));
  const dist = labels.map(v => {
    const c = counts[v] || 0;
    const pct = arrows.length ? (c / arrows.length) * 100 : 0;
    return `<div class="bar-row">${chip(v)}<div class="bar"><span class="${labelClass(v)}" style="width:${(c / maxCount) * 100}%"></span></div><small>${pct.toFixed(0)}%</small></div>`;
  }).join('');

  const halves = ROUNDS[sample.type].halves;
  const halfAvg = Array.from({ length: halves }, (_, h) => sum(s => s.halfTotals[h]) / n);
  const halfHtml = halves === 2 ? `
    <div class="card"><div class="tiles two">
      ${tile('1st half avg', halfAvg[0].toFixed(1))}${tile('2nd half avg', halfAvg[1].toFixed(1))}
    </div></div>` : '';

  const recentArrows = rounds.slice(0, 10).flatMap(r => r.ends.flat());
  const pts = plotted(recentArrows);
  const c = groupCentre(recentArrows);
  const plot = pts.length ? `
    <h2 class="section">Grouping <small class="muted">${n > 1 ? `last ${Math.min(10, n)} ${practice ? 'sessions' : 'rounds'}` : ''}</small></h2>
    <div class="card plot">${singleSpotSVG(sample.face, pts.map(a => markerSVG(sample.face, a, { cls: 'mk dot', r: 0.4, single: true })).join('') + centreSVG(c))}
    <p class="muted">${pts.length} plotted arrows. ${esc(describeOffset(c))}</p></div>` : '';

  const chrono = [...rounds].reverse().slice(-30);

  app.innerHTML = shell({
    title: 'Stats',
    body: `
      ${archers.length > 1 ? `<select class="filter" data-change="stats-archer" aria-label="Archer">
        ${archers.map(([id, name]) => `<option value="${id}" ${id === ui.statsArcher ? 'selected' : ''}>${esc(name)}</option>`).join('')}
      </select>` : ''}
      ${configs.size > 1 ? `<select class="filter" data-change="stats-config" aria-label="Bow and face">
        ${[...configs].map(([k, label]) => `<option value="${k}" ${k === ui.statsConfig ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      </select>` : `<p class="muted">${esc(describeConfig(sample))}</p>`}
      <div class="tiles">${tiles}</div>
      <h2 class="section">${practice ? 'Average per arrow' : 'Score trend'}</h2>
      <div class="card">${practice ? trendSVG(chrono, r => roundStats(r).avg, 2) : trendSVG(chrono)}</div>
      ${halfHtml}
      <h2 class="section">Where the arrows score</h2>
      <div class="card dist">${dist}</div>
      ${plot}`,
  });
}

// ---------- settings ----------

function renderSettings() {
  const s = store.getSettings();
  const rounds = store.getRounds();
  const roundCount = id => rounds.filter(r => archerOf(r) === id).length;
  const peopleHtml = store.getPeople().map(p => {
    const n = roundCount(p.id);
    return `
      <div class="person-row">
        <input type="text" value="${esc(p.name)}" data-person="${p.id}" maxlength="40" aria-label="Name">
        ${n
          ? `<small class="muted">${n} round${n === 1 ? '' : 's'}</small>`
          : `<button type="button" class="icon-btn remove" data-action="person-delete" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button>`}
      </div>`;
  }).join('');

  app.innerHTML = shell({
    title: 'Settings',
    body: `
      <div class="card form">
        <label class="field"><span class="field-label">Your name</span>
          <input type="text" value="${esc(s.myName)}" data-setting="myName" placeholder="Shown on your scorecards" maxlength="40" autocomplete="name"></label>
      </div>

      <h2 class="section">Other archers</h2>
      <div class="card form">
        ${peopleHtml || '<p class="muted small-print">Add the people you score for. You can also add someone when starting a round.</p>'}
        <div class="person-row">
          <input type="text" id="new-person" placeholder="New archer's name" maxlength="40" autocomplete="off">
          <button type="button" class="btn" data-action="person-add">Add</button>
        </div>
        ${peopleHtml ? '<p class="muted small-print">Tap a name to change it. Archers with rounds can\'t be removed.</p>' : ''}
      </div>

      <h2 class="section">Scoring</h2>
      <div class="card form">
        <label class="toggle">
          <span><span class="field-label">Target face</span>
            <small class="muted">Plot arrows by tapping on the target. When off, you score with the keypad only.</small></span>
          <input type="checkbox" role="switch" data-setting="showTarget" ${s.showTarget ? 'checked' : ''}>
        </label>
        ${s.showTarget ? `
        <label class="field"><span class="field-label">Arrow shaft diameter (mm)</span>
          <input type="number" inputmode="decimal" step="0.1" min="3" max="12" value="${s.arrowDiameterMm}" data-setting="arrowDiameterMm"></label>
        <p class="muted small-print">Used when you tap on the target so an arrow touching a line scores the higher ring.
          Shaft sizes like "2315" or "23" mean 23/64 inch, which is about 9.1mm.</p>` : ''}
      </div>

      <h2 class="section">Backup</h2>
      <div class="card">
        <p class="muted small-print">Your scores are saved only on this phone. Export a backup now and then so you don't lose them if you change phones or clear Chrome's data.</p>
        <div class="stack">
          <button type="button" class="btn block" data-action="copy-code">Copy backup code</button>
          <button type="button" class="btn block" data-action="restore-open">Restore from backup code</button>
          <p class="muted small-print">A backup code is all your rounds as one line of text. Paste it into a note, email or message to keep it safe.</p>
          <button type="button" class="btn block" data-action="export-json">Export backup (.json)</button>
          <label class="btn block">Import backup<input type="file" accept="application/json,.json" data-change="import" hidden></label>
          <button type="button" class="btn block" data-action="export-csv">Export spreadsheet (.csv)</button>
        </div>
      </div>

      <h2 class="section">Scoring rules</h2>
      <div class="card rules">
        <p><b>World Archery 18m round:</b> 60 arrows shot as 20 ends of 3, in two halves of 10 ends. Highest possible score is 600.</p>
        <p><b>40cm full face:</b> rings score 10 down to 1. <b>Triple spot:</b> only 10 to 6 score; outside the 6 ring is a miss.</p>
        <p><b>Recurve and barebow:</b> the whole 10 ring scores 10, and the inner ring is an X. <b>Compound:</b> only the inner ring scores 10.</p>
        <p>An arrow touching a line scores the higher ring. Arrows are written highest first on the scorecard. Ties are ranked by number of 10s, then Xs.</p>
      </div>

      <h2 class="section">Data</h2>
      <div class="card"><button type="button" class="btn danger block" data-action="wipe">Delete all rounds</button></div>`,
  });
}

function exportCSV() {
  const rows = [['round_id', 'archer', 'date', 'round', 'bow', 'face', 'location', 'end', 'arrow', 'score', 'value', 'x_cm', 'y_cm', 'spot']];
  for (const r of [...store.getRounds()].reverse()) {
    r.ends.forEach((end, i) => end.forEach((a, k) => rows.push([
      r.id, nameOf(r), r.date, ROUNDS[r.type].name, BOWS[r.bow], FACES[r.face], r.location || '', i + 1, k + 1, a.v,
      a.v === 'X' ? 10 : a.v === 'M' ? 0 : Number(a.v), a.x ?? '', a.y ?? '', a.x != null ? (a.s || 0) + 1 : '',
    ])));
  }
  const csv = rows.map(row => row.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n');
  download(`archery-scores-${today()}.csv`, csv, 'text/csv');
}

// ---------- events ----------

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const action = el.dataset.action;
  const round = current.id ? store.getRound(current.id) : null;

  switch (action) {
    case 'back':
      if (history.length > 1) history.back(); else go('#/');
      break;
    case 'arrow': addArrow(round, { v: el.dataset.v }); break;
    case 'undo': undo(round); break;
    case 'next-end': nextEnd(round); break;
    case 'finish': finishRound(round); break;
    case 'goto-archer': location.replace(`#/score/${el.dataset.id}`); break;
    case 'goto-card': location.replace(`#/round/${el.dataset.id}`); break;
    case 'archer-add': {
      const rows = ui.newArchers;
      const taken = new Set(rows.map(a => a.who));
      const free = [store.ME, ...store.getPeople().map(p => p.id)].find(id => !taken.has(id));
      const last = rows[rows.length - 1];
      rows.push({ who: free || 'new', newName: '', bow: last.bow, face: last.face });
      $('#archers').innerHTML = archerRowsHTML();
      $('#rules-hint').innerHTML = rulesHintHTML();
      if (!free) $(`[data-row="${rows.length - 1}"] [data-arch="newName"]`)?.focus();
      break;
    }
    case 'archer-remove':
      ui.newArchers.splice(Number(el.dataset.i), 1);
      $('#archers').innerHTML = archerRowsHTML();
      $('#rules-hint').innerHTML = rulesHintHTML();
      break;
    case 'person-add': {
      const box = $('#new-person');
      const name = box.value.trim();
      if (!name) { toast('Enter a name first'); box.focus(); return; }
      store.addPerson(name);
      render();
      toast(`Added ${name}`);
      break;
    }
    case 'person-delete':
      store.deletePerson(el.dataset.id);
      render();
      break;
    case 'mode':
      store.updateSettings({ defaultEntry: el.dataset.m });
      render();
      break;
    case 'edit-end': openEdit(round, Number(el.dataset.i)); break;
    case 'edit-sel': ui.editing.sel = Number(el.dataset.k); renderModal(); break;
    case 'edit-arrow': openEdit(round, Number(el.dataset.i), Number(el.dataset.k)); break;
    case 'edit-set': {
      const ed = ui.editing;
      setEditedScore(el.dataset.v);
      ed.sel = Math.min(ed.sel + 1, ed.arrows.length - 1);
      renderModal();
      break;
    }
    case 'edit-cancel': ui.editing = null; renderModal(); break;
    case 'edit-save': {
      const r = store.getRound(ui.editing.roundId);
      r.ends[ui.editing.i] = ui.editing.arrows;
      store.updateRound(r);
      ui.editing = null;
      render();
      toast('End updated');
      break;
    }
    case 'share': share(round); break;
    case 'delete-round':
      if (confirm('Delete this round? This cannot be undone.')) {
        store.deleteRound(round.id);
        location.replace('#/history');
      }
      break;
    case 'export-json': download(`archery-backup-${today()}.json`, store.exportJSON(), 'application/json'); break;
    case 'export-csv': exportCSV(); break;
    case 'copy-code': copyBackupCode(); break;
    case 'restore-open': ui.restoring = true; renderModal(); $('#restore-code').focus(); break;
    case 'restore-paste':
      navigator.clipboard.readText()
        .then(text => { $('#restore-code').value = text; })
        .catch(() => toast('Could not read the clipboard. Long-press the box and choose Paste.'));
      break;
    case 'restore-import': restoreFromCode(); break;
    case 'modal-close': closeModal(); break;
    case 'wipe':
      if (confirm('Delete ALL rounds, archers and settings from this phone?') && confirm('Are you sure? Export a backup first if you might want them back.')) {
        store.wipeAll();
        toast('All data deleted');
        go('#/');
      }
      break;
  }
});

// Close the sheet when tapping the dimmed area, but only if the tap also started there.
let pressedBackdrop = false;
modal.addEventListener('pointerdown', e => { pressedBackdrop = e.target === modal; });
modal.addEventListener('click', e => {
  if (e.target === modal && pressedBackdrop) closeModal();
});

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.person) {
    const name = el.value.trim();
    if (!name) { el.value = store.archerName(el.dataset.person); toast('A name is needed'); return; }
    store.renamePerson(el.dataset.person, name);
    toast('Saved');
    return;
  }
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    let value = el.type === 'checkbox' ? el.checked : el.value;
    if (key === 'myName') value = value.trim();
    if (key === 'arrowDiameterMm') {
      value = Number(value);
      if (!(value >= 3 && value <= 12)) { toast('Enter a diameter between 3 and 12mm'); return; }
    }
    store.updateSettings({ [key]: value });
    // The shaft diameter field only shows while the target face is on.
    if (key === 'showTarget') render();
    toast('Saved');
    return;
  }
  switch (el.dataset.change) {
    case 'history-filter': ui.historyFilter = el.value; render(); break;
    case 'stats-archer': ui.statsArcher = el.value; ui.statsConfig = null; render(); break;
    case 'stats-config': ui.statsConfig = el.value; render(); break;
    case 'import': {
      const file = el.files[0];
      if (!file) return;
      try {
        const { added, skipped } = store.importJSON(await file.text());
        toast(`Imported ${added} round${added === 1 ? '' : 's'}${skipped ? `, ${skipped} already here` : ''}`);
      } catch (err) {
        toast(err.message || 'Could not read that file');
      }
      el.value = '';
      break;
    }
  }
});

// ---------- offline support ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('A new version is ready', { label: 'Update', fn: () => location.reload() });
          }
        });
      });
    }).catch(err => console.warn('Offline support unavailable', err));
  });
}

render();
