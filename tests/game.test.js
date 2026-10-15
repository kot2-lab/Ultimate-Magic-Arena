import test from "node:test";
import assert from "node:assert/strict";
import { ATTRIBUTES, MAX_SPELLS, SHAPES, SPECIALS, costForSpell, defaultSpells, freshPlayer, migratePlayer, requiredExp, synergyFor } from "../src/data.js";
import { awardExperience, castSpell, createBattle, moveUnit, resolvePlayerAction } from "../src/battle.js";
import { backupProgress, loadProgress, saveProgress } from "../src/storage.js";

const silentRandom = () => 0.99;

test("the published magic catalog has the specified counts", () => {
  assert.equal(ATTRIBUTES.length, 12);
  assert.equal(SHAPES.length, 15);
  assert.equal(SPECIALS.length, 15);
});

test("the magic archive supports twenty registered spells", () => {
  assert.equal(MAX_SPELLS, 20);
  const existingSave = migratePlayer({ ...freshPlayer(), spells: Array.from({ length: 15 }, (_, index) => ({ id: `saved-${index}` })) });
  assert.equal(existingSave.spells.length, 15);
});

test("spell costs and paired attribute synergy stay within builder constraints", () => {
  const spell = { attributes: ["fire", "wind"], shape: "bullet", special: "efficient", power: 24 };
  assert.equal(synergyFor(spell.attributes).name, "陽炎");
  assert.ok(costForSpell(spell) > 0);
});

test("save migration preserves zero MP and clamps invalid values", () => {
  const player = migratePlayer({ ...freshPlayer(), mp: 0, exp: -8, level: 1004 });
  assert.equal(player.mp, 0);
  assert.equal(player.exp, 0);
  assert.equal(player.level, 999);
  assert.equal(player.tutorialCompleted, false);
  assert.equal(migratePlayer({ name: "既存プレイヤー" }).tutorialCompleted, true);
  assert.equal(migratePlayer({ name: "既存プレイヤー" }).battleControlsTutorialCompleted, false);
  assert.equal(migratePlayer({ ...freshPlayer(), battleControlsTutorialCompleted: true }).battleControlsTutorialCompleted, true);
});

test("local save round-trips through storage and corrupt data is recoverable", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(loadProgress(storage).hasSave, false);
  const player = freshPlayer(); player.mp = 0;
  saveProgress(player, storage);
  assert.equal(loadProgress(storage).player.mp, 0);
  assert.equal(loadProgress(storage).hasSave, true);
  assert.equal(backupProgress(storage), true);
  assert.equal(values.get("umaSave.backup"), values.get("umaSave"));
  values.set("umaSave", "{");
  assert.equal(loadProgress(storage).recovered, true);
  assert.equal(loadProgress(storage).hasSave, false);
  assert.equal(values.get("umaSave.backup"), "{");
});

test("lane movement validates destination and bind prevents movement", () => {
  const battle = createBattle(freshPlayer(), 1, silentRandom);
  assert.equal(moveUnit(battle, "player", "right").ok, true);
  battle.player.statuses.push({ id: "bind", turns: 2 });
  assert.equal(moveUnit(battle, "player", "left").ok, false);
});

test("a delayed spell resolves after the enemy action and charges MP only once", () => {
  const battle = createBattle(freshPlayer(), 1, silentRandom);
  battle.enemy.spells = [];
  battle.enemy.hp = battle.enemy.maxHP = 300;
  battle.enemy.lane = "right";
  battle.player.lane = "right";
  const spell = { id: "test-delay", name: "時の矢", attributes: ["neutral"], shape: "bullet", special: "delayed", power: 100 };
  const mpBefore = battle.player.mp;
  const cost = costForSpell(spell);
  assert.equal(castSpell(battle, "player", spell, { targetLane: "right", random: silentRandom }).ok, true);
  assert.equal(battle.pendingSpell.spell.id, spell.id);
  const enemyHP = battle.enemy.hp;
  resolvePlayerAction(battle, { type: "pass" }, silentRandom);
  assert.equal(battle.pendingSpell, null);
  assert.ok(battle.enemy.hp < enemyHP);
  assert.equal(battle.player.mp, mpBefore - cost + battle.player.mpRegen);
});

test("damage spells respect barriers and low-level battle starts with a valid turn", () => {
  const battle = createBattle(freshPlayer(), 1, silentRandom);
  assert.equal(battle.secondsLeft, 15);
  assert.equal(battle.player.mp, battle.player.maxMP);
  assert.equal(battle.enemy.maxHP, 90);
  assert.equal(battle.enemy.mp, 25);
  assert.equal(battle.enemy.mpRegen, 4);
  battle.enemy.lane = "center";
  battle.enemy.buffs.push({ type: "barrier", turns: 2, value: 0.45 });
  const spell = { attributes: ["neutral"], shape: "bullet", special: "critical", power: 30 };
  const before = battle.enemy.hp;
  assert.equal(castSpell(battle, "player", spell, { targetLane: "center", random: silentRandom }).ok, true);
  assert.ok(battle.enemy.hp < before);
});

test("critical hits are called out in the battle log, while missed critical spells are not", () => {
  const battle = createBattle(freshPlayer(), 1, silentRandom);
  const spell = { attributes: ["neutral"], shape: "bullet", special: "critical", power: 30 };
  battle.player.lane = "center";
  battle.enemy.lane = "center";
  castSpell(battle, "player", spell, { targetLane: "center", random: () => 0 });
  assert.match(battle.log[0], /クリティカル！/);

  const missedBattle = createBattle(freshPlayer(), 1, silentRandom);
  missedBattle.player.lane = "left";
  missedBattle.enemy.lane = "right";
  castSpell(missedBattle, "player", spell, { targetLane: "right", random: () => 0 });
  assert.match(missedBattle.log[0], /届かなかった/);
  assert.doesNotMatch(missedBattle.log[0], /クリティカル/);
});

test("beginner CPU tuning does not change the next difficulty", () => {
  const battle = createBattle(freshPlayer(), 2, silentRandom);
  assert.equal(battle.enemy.maxHP, 128);
  assert.equal(battle.enemy.mp, 40);
  assert.equal(battle.enemy.mpRegen, 5);
});

test("experience rewards battles and levels without exceeding the cap", () => {
  const player = freshPlayer();
  const reward = awardExperience(player, "victory", 2, silentRandom);
  assert.ok(reward.earned >= 110);
  assert.equal(player.wins, 1);
  assert.ok(requiredExp(player.level) > 0);
  player.level = 999; player.exp = 0;
  awardExperience(player, "victory", 999, silentRandom);
  assert.equal(player.level, 999);
});
