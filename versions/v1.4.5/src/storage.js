import { freshPlayer, freshSettings, migratePlayer, SAVE_KEY, SETTINGS_KEY } from "./data.js?v=1.4.5";

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

export function loadProgress(storage = window.localStorage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return { player: freshPlayer(), recovered: false, hasSave: false };
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") {
    try { storage.setItem(`${SAVE_KEY}.backup`, raw); } catch { /* Keep the game playable if backup storage is unavailable. */ }
    return { player: freshPlayer(), recovered: true, hasSave: false };
  }
  return { player: migratePlayer(parsed.player ?? parsed), recovered: false, hasSave: true };
}

export function backupProgress(storage = window.localStorage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return false;
  storage.setItem(`${SAVE_KEY}.backup`, raw);
  return true;
}

export function saveProgress(player, storage = window.localStorage) {
  storage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 1, player, updatedAt: new Date().toISOString() }));
}

export function loadSettings(storage = window.localStorage) {
  const parsed = safeParse(storage.getItem(SETTINGS_KEY) || "null");
  const base = freshSettings();
  if (!parsed || typeof parsed !== "object") return base;
  return {
    ...base,
    ...parsed,
    bgm: Math.max(0, Math.min(1, Number(parsed.bgm ?? base.bgm))),
    sfx: Math.max(0, Math.min(1, Number(parsed.sfx ?? base.sfx))),
  };
}

export function saveSettings(settings, storage = window.localStorage) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
