// All data lives in this phone's browser storage. Nothing is sent anywhere.

const KEY = 'archery-scoring-v1';

const DEFAULT_SETTINGS = {
  arrowDiameterMm: 9.1,
  defaultBow: 'recurve',
  defaultFace: 'full40',
  defaultEntry: 'keypad',
  showTarget: true,
  myName: '',
  // Archers chosen for the last round, offered again for the next one.
  lastArchers: null,
};

const empty = () => ({ rounds: [], people: [], settings: { ...DEFAULT_SETTINGS } });

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        rounds: Array.isArray(d.rounds) ? d.rounds : [],
        people: Array.isArray(d.people) ? d.people : [],
        settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
      };
    }
  } catch (e) {
    console.error('Could not read saved data', e);
  }
  return empty();
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

// Rounds scored together share a groupId; seat is the order archers are scored in.
export function getGroup(round) {
  if (!round.groupId) return [round];
  return data.rounds.filter(r => r.groupId === round.groupId).sort((a, b) => (a.seat || 0) - (b.seat || 0));
}

// ---------- people ----------
// "You" are not in this list: your rounds use the archer id 'me' and your name is in settings.

export const ME = 'me';

export const getPeople = () => [...data.people].sort((a, b) => a.name.localeCompare(b.name));

export function addPerson(name) {
  const person = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name };
  data.people.push(person);
  save();
  return person;
}

export function renamePerson(id, name) {
  const p = data.people.find(x => x.id === id);
  if (p) { p.name = name; save(); }
}

export function deletePerson(id) {
  data.people = data.people.filter(p => p.id !== id);
  save();
}

export function archerName(id) {
  if (!id || id === ME) return data.settings.myName || 'Me';
  return data.people.find(p => p.id === id)?.name || 'Unknown archer';
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
  const knownPeople = new Set(data.people.map(p => p.id));
  for (const p of Array.isArray(d.people) ? d.people : []) {
    if (p && p.id && p.name && !knownPeople.has(p.id)) data.people.push({ id: p.id, name: p.name });
  }
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
  data = empty();
  save();
}
