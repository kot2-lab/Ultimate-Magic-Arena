export const VERSION = "1.3.0";
export const MAX_SPELLS = 20;
export const SAVE_KEY = "umaSave:v1.3.0";
export const SETTINGS_KEY = "umaSettings:v1.3.0";
export const LANES = ["left", "center", "right"];
export const LANE_NAMES = { left: "左翼", center: "中央", right: "右翼" };

export const ATTRIBUTES = [
  { id: "fire", name: "炎", icon: "🔥", cost: 2, color: "#df7048", role: "高火力・継続ダメージ" },
  { id: "water", name: "水", icon: "💧", cost: 2, color: "#62a7c5", role: "妨害・柔軟" },
  { id: "wind", name: "風", icon: "🌪", cost: 1, color: "#95b88b", role: "高速・機動" },
  { id: "grass", name: "草", icon: "🌱", cost: 2, color: "#7fad69", role: "回復・拘束" },
  { id: "thunder", name: "雷", icon: "⚡", cost: 3, color: "#d5b44e", role: "高速攻撃・麻痺" },
  { id: "ice", name: "氷", icon: "❄", cost: 2, color: "#83bdcb", role: "妨害・凍結" },
  { id: "light", name: "光", icon: "☀", cost: 3, color: "#e5ca7f", role: "回復・浄化" },
  { id: "dark", name: "闇", icon: "🌑", cost: 3, color: "#9b7db2", role: "弱体化・吸収" },
  { id: "poison", name: "毒", icon: "☠", cost: 2, color: "#8da564", role: "継続ダメージ" },
  { id: "ore", name: "鉱石", icon: "💎", cost: 2, color: "#b49b83", role: "防御・耐久" },
  { id: "robot", name: "ロボ", icon: "⚙", cost: 3, color: "#9fa6a0", role: "強化・安定" },
  { id: "neutral", name: "無属性", icon: "✦", cost: 1, color: "#c7c1b4", role: "特殊運用" },
];

export const SHAPES = [
  { id: "bullet", name: "弾", icon: "◈", cost: 1, kind: "damage", laneRule: "same", description: "基本の単体攻撃" },
  { id: "laser", name: "レーザー", icon: "〰", cost: 3, kind: "damage", laneRule: "same", description: "精密な直線攻撃" },
  { id: "explosion", name: "爆発", icon: "✹", cost: 4, kind: "damage", laneRule: "any", description: "隣のレーンにも届く" },
  { id: "wave", name: "波動", icon: "≈", cost: 3, kind: "damage", laneRule: "any", description: "広がる衝撃波" },
  { id: "beam", name: "ビーム", icon: "║", cost: 4, kind: "damage", laneRule: "same", description: "余波が次のターンも続く" },
  { id: "fall", name: "落下", icon: "↓", cost: 3, kind: "damage", laneRule: "target", description: "選んだレーンを撃つ" },
  { id: "summon", name: "召喚", icon: "♙", cost: 4, kind: "summon", laneRule: "any", description: "味方の使い魔を呼ぶ" },
  { id: "trap", name: "設置", icon: "⌖", cost: 2, kind: "damage", laneRule: "target", description: "指定したレーンに罠" },
  { id: "barrier", name: "バリア", icon: "⬡", cost: 3, kind: "barrier", laneRule: "self", description: "次の攻撃を軽減" },
  { id: "heal", name: "回復", icon: "✚", cost: 3, kind: "heal", laneRule: "self", description: "自分のHPを回復" },
  { id: "boost", name: "強化", icon: "✧", cost: 3, kind: "boost", laneRule: "self", description: "魔力を高める" },
  { id: "weaken", name: "弱体化", icon: "⌁", cost: 3, kind: "weaken", laneRule: "any", description: "敵の守りを崩す" },
  { id: "all", name: "全体", icon: "✺", cost: 5, kind: "damage", laneRule: "any", description: "レーンを問わず届く" },
  { id: "self", name: "自分", icon: "◎", cost: 1, kind: "self", laneRule: "self", description: "自分に属性の力を宿す" },
  { id: "range", name: "指定範囲", icon: "⌾", cost: 4, kind: "damage", laneRule: "target", description: "狙ったレーンへ発動" },
];

export const SPECIALS = [
  { id: "homing", name: "追尾", icon: "➶", cost: 3, description: "レーンを越えて追いかける" },
  { id: "pierce", name: "貫通", icon: "⇢", cost: 3, description: "防御を一部無視" },
  { id: "split", name: "分裂", icon: "⑂", cost: 3, description: "威力を少し高める" },
  { id: "chain", name: "連鎖", icon: "⛓", cost: 4, description: "魔力が連なり威力上昇" },
  { id: "absorb", name: "吸収", icon: "◉", cost: 4, description: "与えた力をHPへ還元" },
  { id: "efficient", name: "省エネ", icon: "◇", cost: 2, description: "最終MPコストを半減" },
  { id: "quick", name: "高速詠唱", icon: "↯", cost: 2, description: "命中と威力を補助" },
  { id: "knockback", name: "ノックバック", icon: "⇤", cost: 3, description: "敵を別レーンへ押し出す" },
  { id: "pull", name: "引き寄せ", icon: "⇥", cost: 3, description: "敵を同じレーンに引く" },
  { id: "pierceBurst", name: "貫通爆発", icon: "✹", cost: 5, description: "位置を越えて強く命中" },
  { id: "delayed", name: "時限発動", icon: "◷", cost: 2, description: "次の敵行動後に発動" },
  { id: "lasting", name: "持続", icon: "∞", cost: 4, description: "余波が2ターン続く" },
  { id: "critical", name: "クリティカル", icon: "✦", cost: 4, description: "会心の一撃を狙う" },
  { id: "breaker", name: "シールド破壊", icon: "⛏", cost: 3, description: "防御を大きく崩す" },
  { id: "random", name: "ランダム", icon: "⁂", cost: 1, description: "威力が不安定に変化" },
];

export const SYNERGIES = {
  "fire+wind": { name: "陽炎", bonus: 0.18 },
  "fire+ice": { name: "蒸気爆ぜ", bonus: 0.16 },
  "fire+ore": { name: "溶岩脈", bonus: 0.2 },
  "water+ice": { name: "霜流", bonus: 0.18 },
  "water+thunder": { name: "雷雨", bonus: 0.22 },
  "wind+thunder": { name: "風雷", bonus: 0.2 },
  "grass+poison": { name: "腐葉の毒", bonus: 0.2 },
  "light+grass": { name: "聖樹", bonus: 0.16 },
  "dark+poison": { name: "冥毒", bonus: 0.22 },
  "ore+robot": { name: "魔導鋼", bonus: 0.17 },
};

export const STATUS = [
  { id: "burn", name: "火傷", icon: "🔥", turns: 3, note: "毎ターン最大HPの5%" },
  { id: "poison", name: "毒", icon: "☠", turns: 4, note: "毎ターン最大HPの4%" },
  { id: "freeze", name: "凍結", icon: "❄", turns: 2, note: "行動失敗の可能性" },
  { id: "paralysis", name: "麻痺", icon: "⚡", turns: 3, note: "行動失敗の可能性" },
  { id: "confusion", name: "混乱", icon: "🌪", turns: 2, note: "行動が乱れる" },
  { id: "blind", name: "暗闇", icon: "🌑", turns: 3, note: "命中率が低下" },
  { id: "sleep", name: "睡眠", icon: "💤", turns: 2, note: "行動不能・被弾で解除" },
  { id: "curse", name: "呪い", icon: "💀", turns: 3, note: "与ダメージが低下" },
  { id: "bind", name: "拘束", icon: "⛓", turns: 2, note: "レーン移動不可" },
  { id: "silence", name: "沈黙", icon: "🔇", turns: 2, note: "魔法を封じる" },
];

export const CPU_NAMES = ["若葉の見習い", "石門の守り手", "霧森の術師", "雷塔の番人", "炎獅子の騎士", "氷晶の賢者", "深淵の魔導士", "星環の守護者", "古代の大賢者", "Arenaの覇者"];

export function costForSpell(spell) {
  const attribute = spell.attributes.reduce((total, id) => total + (ATTRIBUTES.find((item) => item.id === id)?.cost ?? 1), 0);
  const shape = SHAPES.find((item) => item.id === spell.shape)?.cost ?? 1;
  const special = SPECIALS.find((item) => item.id === spell.special)?.cost ?? 0;
  const power = Math.max(1, Math.ceil(Number(spell.power) / 10));
  const sum = attribute + shape + special + power;
  const efficient = spell.special === "efficient" ? 0.5 : 1;
  const synergy = synergyFor(spell.attributes);
  return Math.max(1, Math.ceil(sum * efficient * (synergy ? 0.94 : 1)));
}

export function synergyFor(attributes) {
  if (!Array.isArray(attributes) || attributes.length !== 2) return null;
  return SYNERGIES[[...attributes].sort().join("+")] ?? null;
}

export function requiredExp(level) {
  return Math.floor(80 + level * 22 + Math.pow(level, 1.16) * 4);
}

export function defaultSpells() {
  return [
    { id: "seed-fire", name: "Fire Ball", attributes: ["fire"], shape: "bullet", special: "critical", power: 24 },
    { id: "seed-ice", name: "Ice Shot", attributes: ["ice"], shape: "laser", special: "quick", power: 21 },
    { id: "seed-thunder", name: "Thunder Bolt", attributes: ["thunder"], shape: "wave", special: "pierce", power: 28 },
    { id: "seed-wind", name: "Wind Cutter", attributes: ["wind"], shape: "bullet", special: "homing", power: 18 },
    { id: "seed-stone", name: "Stone Spike", attributes: ["ore"], shape: "fall", special: "knockback", power: 32 },
  ].map((spell) => ({ ...spell, cost: costForSpell(spell) }));
}

export function freshPlayer() {
  return {
    name: "新人魔法使い", level: 1, exp: 0, rate: 1000,
    hp: 100, maxHP: 100, mp: 30, maxMP: 70, mpRegen: 5,
    wins: 0, losses: 0, battles: 0, lastBattle: null,
    spells: defaultSpells(), tutorialCompleted: false,
  };
}

export function freshSettings() {
  return { bgm: 0.22, sfx: 0.45, motion: true, reducedEffects: false };
}

export function migratePlayer(saved) {
  const base = freshPlayer();
  if (!saved || typeof saved !== "object") return base;
  const player = {
    ...base,
    ...saved,
    // Existing Ver.1.0 saves should continue without being interrupted by onboarding.
    tutorialCompleted: typeof saved.tutorialCompleted === "boolean" ? saved.tutorialCompleted : true,
  };
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  player.level = Math.min(999, Math.max(1, finite(player.level, 1)));
  player.exp = Math.max(0, finite(player.exp, 0));
  player.maxHP = Math.max(100, finite(player.maxHP, 100));
  player.maxMP = Math.max(70, finite(player.maxMP, 70));
  player.mpRegen = Math.max(5, finite(player.mpRegen, 5));
  player.hp = Math.min(player.maxHP, Math.max(1, finite(player.hp, 100)));
  player.mp = Math.min(player.maxMP, Math.max(0, finite(player.mp, 30)));
  player.spells = Array.isArray(saved.spells) && saved.spells.length ? saved.spells : base.spells;
  return player;
}

export function newSave(player = freshPlayer()) {
  return { schemaVersion: 1, player, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
