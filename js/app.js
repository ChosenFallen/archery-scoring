import {
  ROUNDS, BOWS, FACES, hasX, allowedLabels, sortArrows, labelClass, rulesHint,
  roundStats, compareScores, configKey, describeConfig,
} from './rules.js';
import * as store from './store.js';
import {
  faceSVG, singleSpotSVG, hitTest, markerSVG, plotted, groupCentre, centreSVG, describeOffset,
} from './face.js';

// How far above the finger the arrow marker sits while placing it on the target.
const TOUCH_OFFSET_PX = 56;

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const ui = { editing: null, justFinished: null, historyFilter: 'all', statsConfig: null };

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
const go = hash => { location.hash = hash; };

function currentEnd(round) { return round.ends[round.ends.length - 1]; }
const singleSpotEntry = round => round.face === 'triple40';
function endIsFull(round) { return currentEnd(round).length >= ROUNDS[round.type].arrowsPerEnd; }

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

window.addEventListener('hashchange', () => { ui.editing = null; render(); window.scrollTo(0, 0); });

// ---------- shared pieces ----------

function roundRow(r) {
  const st = roundStats(r);
  const status = r.finishedAt ? '' : '<span class="badge">In progress</span>';
  return `
    <a class="round-row" href="#/round/${r.id}">
      <div>
        <div class="rr-date">${esc(fmtDate(r.date))} ${status}</div>
        <div class="rr-config">${esc(describeConfig(r))}${r.location ? ' · ' + esc(r.location) : ''}</div>
      </div>
      <div class="rr-score">
        <b>${st.total}</b><small>/${st.maxScore}</small>
        <div class="rr-sub">${st.tens}×10${hasX(r.bow) ? ` · ${st.xs}X` : ''}</div>
      </div>
    </a>`;
}

function bestByConfig(rounds) {
  const best = new Map();
  for (const r of rounds) {
    if (!r.finishedAt) continue;
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
  const active = rounds.filter(r => !r.finishedAt);
  const recent = rounds.filter(r => r.finishedAt).slice(0, 5);
  const best = [...bestByConfig(rounds).values()];

  const activeHtml = active.map(r => {
    const st = roundStats(r);
    return `
      <div class="card active-card">
        <div class="card-label">Round in progress</div>
        <div class="active-main">
          <div>
            <div class="rr-config">${esc(describeConfig(r))}</div>
            <div class="muted">${esc(fmtDate(r.date))} · End ${r.ends.length} of ${ROUNDS[r.type].ends}</div>
          </div>
          <div class="big-num">${st.total}</div>
        </div>
        <a class="btn primary block" href="#/score/${r.id}">Resume scoring</a>
      </div>`;
  }).join('');

  const bestHtml = best.length ? `
    <h2 class="section">Personal bests</h2>
    <div class="card list">${best.map(({ r, st }) => `
      <a class="pb-row" href="#/round/${r.id}">
        <span>${esc(describeConfig(r))}</span>
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

function renderNew() {
  const s = store.getSettings();
  const seg = (name, options, value) => `
    <div class="segmented">${Object.entries(options).map(([k, label]) => `
      <label><input type="radio" name="${name}" value="${k}" ${k === value ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}
    </div>`;

  app.innerHTML = shell({
    title: 'New round',
    back: true,
    nav: false,
    body: `
      <form id="new-form" class="form">
        <div class="field">
          <span class="field-label">Round</span>
          <select name="type">${Object.values(ROUNDS).map(t => `<option value="${t.id}">${esc(t.name)} · ${t.ends * t.arrowsPerEnd} arrows</option>`).join('')}</select>
        </div>
        <div class="field"><span class="field-label">Bow</span>${seg('bow', BOWS, s.defaultBow)}</div>
        <div class="field"><span class="field-label">Target face</span>${seg('face', FACES, s.defaultFace)}</div>
        <div class="card hint" id="rules-hint"></div>
        <label class="field"><span class="field-label">Date</span><input type="date" name="date" value="${today()}" required></label>
        <label class="field"><span class="field-label">Location <small>(optional)</small></span><input type="text" name="location" placeholder="e.g. Club range" maxlength="80"></label>
        <label class="field"><span class="field-label">Notes <small>(optional)</small></span><textarea name="notes" rows="2" placeholder="Equipment, conditions, goals…" maxlength="500"></textarea></label>
        <button class="btn primary block big" type="submit">Start scoring</button>
      </form>`,
  });

  const form = $('#new-form');
  const updateHint = () => {
    const f = new FormData(form);
    $('#rules-hint').innerHTML = rulesHint(f.get('bow'), f.get('face')).map(p => `<p>${esc(p)}</p>`).join('');
  };
  form.addEventListener('change', updateHint);
  updateHint();

  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    const round = {
      id: uid(),
      type: f.get('type'),
      bow: f.get('bow'),
      face: f.get('face'),
      date: f.get('date') || today(),
      location: (f.get('location') || '').trim(),
      notes: (f.get('notes') || '').trim(),
      createdAt: Date.now(),
      finishedAt: null,
      ends: [[]],
    };
    store.addRound(round);
    store.updateSettings({ defaultBow: round.bow, defaultFace: round.face });
    navigator.storage?.persist?.().catch(() => {});
    location.replace(`#/score/${round.id}`);
  });
}

// ---------- scoring ----------

function renderScore() {
  const round = store.getRound(current.id);
  if (!round) return go('#/');
  if (round.finishedAt) return location.replace(`#/round/${round.id}`);

  const tpl = ROUNDS[round.type];
  const st = roundStats(round);
  const settings = store.getSettings();
  const mode = settings.showTarget ? settings.defaultEntry : 'keypad';
  const endIdx = round.ends.length - 1;
  const end = currentEnd(round);
  const full = end.length >= tpl.arrowsPerEnd;
  const lastEnd = endIdx === tpl.ends - 1;
  const half = Math.floor(endIdx / (tpl.ends / tpl.halves)) + 1;
  const endTotal = st.endTotals[endIdx] || 0;
  const labels = allowedLabels(round.bow, round.face);

  const slots = Array.from({ length: tpl.arrowsPerEnd }, (_, i) => {
    const a = end[i];
    return a
      ? `<div class="slot filled ${labelClass(a.v)}">${esc(a.v)}</div>`
      : `<div class="slot ${i === end.length ? 'next' : ''}"></div>`;
  }).join('');

  const prev = round.ends[endIdx - 1];
  const prevHtml = prev
    ? `<div class="prev-end">End ${endIdx}: ${sortArrows(prev).map(a => chip(a.v)).join('')} <b>${st.endTotals[endIdx - 1]}</b></div>`
    : `<div class="prev-end muted">Half ${half} · ${esc(describeConfig(round))}</div>`;

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
      <div class="preview" id="preview">${full ? 'End complete' : 'Touch and drag to place the arrow'}</div>
      <div class="face-wrap" id="face-wrap">${single ? singleSpotSVG(round.face, content, attrs) : faceSVG(round.face, content, attrs)}</div>`;
  } else {
    entry = `<div class="keypad ${labels.length <= 7 ? 'small' : ''}">${labels.map(v =>
      `<button type="button" class="key ${labelClass(v)}" data-action="arrow" data-v="${v}" ${full ? 'disabled' : ''}>${v}</button>`).join('')}</div>`;
  }

  const nextBtn = full
    ? (lastEnd
      ? '<button type="button" class="btn primary" data-action="finish">Finish round</button>'
      : '<button type="button" class="btn primary" data-action="next-end">Next end →</button>')
    : `<button type="button" class="btn" disabled>${end.length}/${tpl.arrowsPerEnd} arrows</button>`;

  app.innerHTML = shell({
    title: `End ${endIdx + 1} of ${tpl.ends}`,
    back: true,
    nav: false,
    cls: 'score-screen',
    right: `<a class="icon-btn" href="#/round/${round.id}" aria-label="Scorecard">${ICONS.card}</a>`,
    body: `
      <div class="stat-strip">
        <div><small>Total</small><b>${st.total}</b></div>
        <div><small>10s</small><b>${st.tens}</b></div>
        ${hasX(round.bow) ? `<div><small>Xs</small><b>${st.xs}</b></div>` : ''}
        <div><small>Avg</small><b>${st.avg.toFixed(2)}</b></div>
      </div>
      <div class="end-row">${slots}<div class="end-total"><small>End</small>${endTotal}</div></div>
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

function undo(round) {
  if (!currentEnd(round).length && round.ends.length > 1) round.ends.pop();
  currentEnd(round).pop();
  store.updateRound(round);
  render();
}

function finishRound(round) {
  round.finishedAt = Date.now();
  store.updateRound(round);
  ui.justFinished = round.id;
  location.replace(`#/round/${round.id}`);
}

// ---------- scorecard ----------

function scorecardHTML(round) {
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
  const arrows = round.ends.flat();
  const pts = plotted(arrows);

  let banner = '';
  if (ui.justFinished === round.id) {
    ui.justFinished = null;
    const pb = isPersonalBest(round) && store.getRounds().filter(r => r.finishedAt && configKey(r) === configKey(round)).length > 1;
    banner = `<div class="card banner ${pb ? 'pb' : ''}">${pb ? '🏆 New personal best!' : 'Round complete!'} <b>${st.total}/${st.maxScore}</b></div>`;
  }

  const group = pts.length ? (() => {
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
      ${banner}
      <div class="card totals">
        <div class="total-big"><b>${st.total}</b><small>/ ${st.maxScore}</small></div>
        <div class="total-grid">
          <div><small>10s</small><b>${st.tens}</b></div>
          ${hasX(round.bow) ? `<div><small>Xs</small><b>${st.xs}</b></div>` : ''}
          <div><small>Misses</small><b>${st.misses}</b></div>
          <div><small>Avg/arrow</small><b>${st.avg.toFixed(2)}</b></div>
        </div>
        <div class="muted meta">${esc(fmtDate(round.date))} · ${esc(tpl.name)} · ${esc(describeConfig(round))}${round.location ? ' · ' + esc(round.location) : ''}</div>
        ${round.notes ? `<p class="notes">${esc(round.notes)}</p>` : ''}
      </div>
      ${round.finishedAt ? '' : `<a class="btn primary block" href="#/score/${round.id}">Continue scoring</a>`}
      <p class="muted small-print">Tap an end to correct it.</p>
      ${scorecardHTML(round)}
      ${group}
      <div class="row-actions">
        <button type="button" class="btn" data-action="share">Share score</button>
        <button type="button" class="btn danger" data-action="delete-round">Delete round</button>
      </div>`,
  });
}

function shareText(round) {
  const st = roundStats(round);
  return `${ROUNDS[round.type].name} · ${describeConfig(round)}\n${fmtDate(round.date)}: ${st.total}/${st.maxScore} ` +
    `(${st.tens}×10${hasX(round.bow) ? `, ${st.xs}X` : ''})`;
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

function openEdit(round, i) {
  ui.editing = { roundId: round.id, i, arrows: round.ends[i].map(a => ({ ...a })), sel: 0 };
  renderModal();
}

function renderModal() {
  const ed = ui.editing;
  if (!ed) { modal.hidden = true; modal.innerHTML = ''; return; }
  const round = store.getRound(ed.roundId);
  const labels = allowedLabels(round.bow, round.face);
  modal.hidden = false;
  modal.innerHTML = `
    <div class="sheet" role="dialog" aria-label="Edit end">
      <h2>Edit end ${ed.i + 1}</h2>
      <p class="muted">Tap an arrow, then its correct score.</p>
      <div class="end-row">${ed.arrows.map((a, k) => `
        <button type="button" class="slot filled ${labelClass(a.v)} ${k === ed.sel ? 'sel' : ''}" data-action="edit-sel" data-k="${k}">${esc(a.v)}</button>`).join('')}
      </div>
      <div class="keypad ${labels.length <= 7 ? 'small' : ''}">${labels.map(v =>
        `<button type="button" class="key ${labelClass(v)}" data-action="edit-set" data-v="${v}">${v}</button>`).join('')}</div>
      <div class="row-actions">
        <button type="button" class="btn" data-action="edit-cancel">Cancel</button>
        <button type="button" class="btn primary" data-action="edit-save">Save</button>
      </div>
    </div>`;
}

// ---------- history ----------

function configOptions(rounds) {
  const seen = new Map();
  for (const r of rounds) if (!seen.has(configKey(r))) seen.set(configKey(r), describeConfig(r));
  return seen;
}

function renderHistory() {
  const rounds = store.getRounds();
  const configs = configOptions(rounds);
  if (ui.historyFilter !== 'all' && !configs.has(ui.historyFilter)) ui.historyFilter = 'all';
  const shown = ui.historyFilter === 'all' ? rounds : rounds.filter(r => configKey(r) === ui.historyFilter);

  app.innerHTML = shell({
    title: 'History',
    body: rounds.length ? `
      ${configs.size > 1 ? `<select class="filter" data-change="history-filter">
        <option value="all">All rounds (${rounds.length})</option>
        ${[...configs].map(([k, label]) => `<option value="${k}" ${k === ui.historyFilter ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      </select>` : ''}
      <div class="card list">${shown.map(roundRow).join('')}</div>`
      : '<div class="empty"><p>No rounds yet. Your scored rounds will appear here.</p><a class="btn primary" href="#/new">Start a round</a></div>',
  });
}

// ---------- stats ----------

function trendSVG(rounds) {
  const vals = rounds.map(r => roundStats(r).total);
  const W = 340, H = 150, L = 36, R = 10, T = 12, B = 22;
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 10) { const mid = (max + min) / 2; min = mid - 5; max = mid + 5; }
  const pad = (max - min) * 0.1;
  min = Math.floor(min - pad); max = Math.ceil(max + pad);
  const x = i => L + (vals.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (vals.length - 1));
  const y = v => T + (max - v) * (H - T - B) / (max - min);
  const best = Math.max(...vals);
  const grid = [min, Math.round((min + max) / 2), max].map(v =>
    `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const line = vals.length > 1 ? `<polyline class="trend" points="${vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>` : '';
  const dots = vals.map((v, i) => `<circle class="${v === best ? 'pt best' : 'pt'}" cx="${x(i)}" cy="${y(v)}" r="${v === best ? 4.5 : 3.2}"><title>${esc(fmtDate(rounds[i].date))}: ${v}</title></circle>`).join('');
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
  const configs = configOptions(finished);
  if (!ui.statsConfig || !configs.has(ui.statsConfig)) ui.statsConfig = configKey(finished[0]);
  const rounds = finished.filter(r => configKey(r) === ui.statsConfig);
  const sample = rounds[0];
  const stats = rounds.map(roundStats);
  const n = rounds.length;
  const sum = f => stats.reduce((t, s) => t + f(s), 0);
  const bestIdx = stats.reduce((bi, s, i) => (compareScores(s, stats[bi]) < 0 ? i : bi), 0);
  const arrows = rounds.flatMap(r => r.ends.flat());
  const showX = hasX(sample.bow);

  const tile = (label, value) => `<div class="tile"><small>${label}</small><b>${value}</b></div>`;
  const tiles = [
    tile('Rounds', n),
    tile('Best', `${stats[bestIdx].total}`),
    tile('Average', (sum(s => s.total) / n).toFixed(1)),
    tile('Avg/arrow', (sum(s => s.total) / sum(s => s.arrows)).toFixed(2)),
    tile('10s/round', (sum(s => s.tens) / n).toFixed(1)),
    showX ? tile('Xs/round', (sum(s => s.xs) / n).toFixed(1)) : tile('Misses/round', (sum(s => s.misses) / n).toFixed(1)),
  ].join('');

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
    <h2 class="section">Grouping <small class="muted">${n > 1 ? `last ${Math.min(10, n)} rounds` : ''}</small></h2>
    <div class="card plot">${singleSpotSVG(sample.face, pts.map(a => markerSVG(sample.face, a, { cls: 'mk dot', r: 0.4, single: true })).join('') + centreSVG(c))}
    <p class="muted">${pts.length} plotted arrows. ${esc(describeOffset(c))}</p></div>` : '';

  const chrono = [...rounds].reverse().slice(-30);

  app.innerHTML = shell({
    title: 'Stats',
    body: `
      ${configs.size > 1 ? `<select class="filter" data-change="stats-config">
        ${[...configs].map(([k, label]) => `<option value="${k}" ${k === ui.statsConfig ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      </select>` : `<p class="muted">${esc(describeConfig(sample))}</p>`}
      <div class="tiles">${tiles}</div>
      <h2 class="section">Score trend</h2>
      <div class="card">${trendSVG(chrono)}</div>
      ${halfHtml}
      <h2 class="section">Where your arrows score</h2>
      <div class="card dist">${dist}</div>
      ${plot}`,
  });
}

// ---------- settings ----------

function renderSettings() {
  const s = store.getSettings();
  app.innerHTML = shell({
    title: 'Settings',
    body: `
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
  const rows = [['round_id', 'date', 'round', 'bow', 'face', 'location', 'end', 'arrow', 'score', 'value', 'x_cm', 'y_cm', 'spot']];
  for (const r of [...store.getRounds()].reverse()) {
    r.ends.forEach((end, i) => end.forEach((a, k) => rows.push([
      r.id, r.date, ROUNDS[r.type].name, BOWS[r.bow], FACES[r.face], r.location || '', i + 1, k + 1, a.v,
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
    case 'next-end':
      round.ends.push([]);
      store.updateRound(round);
      render();
      break;
    case 'finish': finishRound(round); break;
    case 'mode':
      store.updateSettings({ defaultEntry: el.dataset.m });
      render();
      break;
    case 'edit-end': openEdit(round, Number(el.dataset.i)); break;
    case 'edit-sel': ui.editing.sel = Number(el.dataset.k); renderModal(); break;
    case 'edit-set': {
      const ed = ui.editing;
      // A typed score replaces any plotted position, since it no longer matches.
      ed.arrows[ed.sel] = { v: el.dataset.v };
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
    case 'wipe':
      if (confirm('Delete ALL rounds and settings from this phone?') && confirm('Are you sure? Export a backup first if you might want them back.')) {
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
  if (e.target === modal && pressedBackdrop) { ui.editing = null; renderModal(); }
});

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    let value = el.type === 'checkbox' ? el.checked : el.value;
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
