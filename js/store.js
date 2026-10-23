// All data lives in this phone's browser storage. Nothing is sent anywhere.

const KEY = 'archery-scoring-v1';

const DEFAULT_SETTINGS = {
  arrowDiameterMm: 9.1,
  defaultBow: 'recurve',
  defaultFace: 'full40',
  defaultEntry: 'keypad',
  showTarget: true,
};

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { rounds: Array.isArray(d.rounds) ? d.rounds : [], settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } };
    }
  } catch (e) {
    console.error('Could not read saved data', e);
  }
  return { rounds: [], settings: { ...DEFAULT_SETTINGS } };
}

let onSaveError = () => {};
export const setSaveErrorHandler = fn => { onSaveError = fn; };

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Could not save', e);
    onSaveError(e);
  }
}

const byNewest = (a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt);

export const getRounds = () => [...data.rounds].sort(byNewest);
export const getRound = id => data.rounds.find(r => r.id === id);

export function addRound(round) {
  data.rounds.push(round);
  save();
}

export function updateRound(round) {
  const i = data.rounds.findIndex(r => r.id === round.id);
  if (i >= 0) data.rounds[i] = round;
  save();
}

export function deleteRound(id) {
  data.rounds = data.rounds.filter(r => r.id !== id);
  save();
}

export const getSettings = () => data.settings;

export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  save();
}

export function exportJSON() {
  return JSON.stringify({ app: 'archery-scoring', version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
}

// Adds rounds from a backup. Rounds already on this phone (same id) are kept as they are.
export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.rounds)) throw new Error('This file is not an archery scoring backup.');
  const existing = new Set(data.rounds.map(r => r.id));
  let added = 0;
  for (const r of d.rounds) {
    if (r && r.id && Array.isArray(r.ends) && !existing.has(r.id)) {
      data.rounds.push(r);
      added++;
    }
  }
  save();
  return { added, skipped: d.rounds.length - added };
}

export function wipeAll() {
  data = { rounds: [], settings: { ...DEFAULT_SETTINGS } };
  save();
}
