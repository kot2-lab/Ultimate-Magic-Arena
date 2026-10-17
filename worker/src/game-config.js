export const DEFAULT_GAME_CONFIG = Object.freeze({
  maxSpells: 20,
  spellCostMultiplier: 1,
  playerPowerMultiplier: 1,
  cpuHpMultiplier: 1,
  cpuPowerMultiplier: 1,
  expRewardMultiplier: 1,
});

const RULES = Object.freeze({
  maxSpells: [5, 50, true],
  spellCostMultiplier: [0.5, 2, false],
  playerPowerMultiplier: [0.5, 1.5, false],
  cpuHpMultiplier: [0.5, 2, false],
  cpuPowerMultiplier: [0.5, 2, false],
  expRewardMultiplier: [0.25, 3, false],
});

export function validateGameConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const [key, [min, max, integer]] of Object.entries(RULES)) {
    const number = Number(value[key]);
    if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) return null;
    result[key] = integer ? number : Math.round(number * 100) / 100;
  }
  return result;
}

export async function readGameConfig(db) {
  if (!db) return { ...DEFAULT_GAME_CONFIG, updatedAt: null, updatedBy: null };
  const row = await db.prepare("SELECT value_json, updated_at, updated_by FROM admin_settings WHERE key = 'game_config'").first();
  let stored = null;
  try { stored = row ? JSON.parse(row.value_json) : null; } catch { stored = null; }
  return {
    ...(validateGameConfig(stored) ?? DEFAULT_GAME_CONFIG),
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  };
}
