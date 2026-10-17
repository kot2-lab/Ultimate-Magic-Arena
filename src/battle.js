import { ATTRIBUTES, CPU_NAMES, LANES, LANE_NAMES, MAX_CPU_LEVEL, SHAPES, SPECIALS, STATUS, costForSpell, defaultSpells, getRuntimeConfig, synergyFor } from "./data.js?v=1.5.2";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const roll = (chance, random) => random() < chance;

export function createBattle(player, cpuLevel = 1, random = Math.random) {
  const difficulty = clamp(Number(cpuLevel) || 1, 1, MAX_CPU_LEVEL);
  const enemyLevel = Math.max(1, player.level + difficulty - 1);
  const hpBonus = difficulty === 1 ? 0 : Math.floor(Math.pow(difficulty - 1, 1.35) * 1.7);
  const mpBonus = difficulty === 1 ? 0 : Math.floor(Math.pow(difficulty - 1, 1.15) * 0.75);
  const enemyMaxHP = Math.max(1, Math.round((difficulty === 1 ? 90 : 100 + difficulty * 14 + hpBonus) * getRuntimeConfig().cpuHpMultiplier));
  const enemyMaxMP = difficulty === 1 ? 75 : 70 + difficulty * 5 + mpBonus;
  const enemyStartingMP = difficulty === 1 ? 25 : Math.min(enemyMaxMP, 30 + difficulty * 5 + Math.floor((difficulty - 1) * 0.5));
  const spellPowerScale = difficulty === 1 ? 1 : 1 + (difficulty - 1) * 0.025;
  return {
    difficulty,
    turn: 1,
    secondsLeft: 15,
    phase: "player",
    result: null,
    pendingSpell: null,
    player: {
      name: player.name || "魔法使い", level: player.level,
      hp: player.maxHP, maxHP: player.maxHP, mp: player.maxMP, maxMP: player.maxMP, mpRegen: player.mpRegen,
      speed: Math.min(200, Math.max(1, Number(player.speed) || 100) + Math.floor((player.level - 1) / 3)),
      lane: "center", statuses: [], buffs: [], barriers: 0,
      spells: structuredClone(player.spells?.length ? player.spells : defaultSpells()),
    },
    enemy: {
      name: CPU_NAMES[difficulty - 1], level: enemyLevel,
      hp: enemyMaxHP,
      maxHP: enemyMaxHP,
      mp: enemyStartingMP,
      maxMP: enemyMaxMP, mpRegen: difficulty === 1 ? 4 : 5 + Math.floor((difficulty - 1) / 3),
      speed: 90 + difficulty * 2,
      lane: LANES[Math.floor(random() * LANES.length)], statuses: [], buffs: [], barriers: 0,
      spells: defaultSpells().map((spell) => ({ ...spell, power: Math.round(spell.power * spellPowerScale) })),
    },
    log: ["魔法陣が戦場を囲む。戦いの始まりだ。"],
  };
}

function addLog(battle, message) {
  battle.log.unshift(message);
  battle.log.length = Math.min(battle.log.length, 24);
}

function getAttribute(id) { return ATTRIBUTES.find((item) => item.id === id); }
function getShape(id) { return SHAPES.find((item) => item.id === id); }
function getSpecial(id) { return SPECIALS.find((item) => item.id === id); }

function refreshBuff(unit, type, turns, value = 1) {
  const current = unit.buffs.find((buff) => buff.type === type);
  if (current) Object.assign(current, { turns, value });
  else unit.buffs.push({ type, turns, value });
}

function applyStatus(unit, statusId, turns) {
  if (!statusId) return;
  const meta = STATUS.find((status) => status.id === statusId);
  if (!meta) return;
  const existing = unit.statuses.find((status) => status.id === statusId);
  if (existing) { existing.turns = Math.max(existing.turns, turns ?? meta.turns); return; }
  if (unit.statuses.length >= 3) unit.statuses.shift();
  unit.statuses.push({ id: statusId, turns: turns ?? meta.turns });
}

function removeStatus(unit, statusId) {
  const before = unit.statuses.length;
  unit.statuses = unit.statuses.filter((status) => status.id !== statusId);
  return before !== unit.statuses.length;
}

function canReach(caster, target, shape, special, targetLane) {
  if (special === "homing" || special === "pierceBurst") return true;
  if (shape.laneRule === "any") return true;
  if (shape.laneRule === "target") return (targetLane || caster.lane) === target.lane;
  return caster.lane === target.lane;
}

function damageMultiplier(unit) {
  let multiplier = unit.buffs.find((buff) => buff.type === "power")?.value ?? 1;
  if (unit.buffs.some((buff) => buff.type === "weakened")) multiplier *= 0.78;
  if (unit.statuses.some((status) => status.id === "curse")) multiplier *= 0.8;
  return multiplier;
}

function applyDamage(target, amount, special) {
  let damage = Math.max(1, Math.round(amount));
  const barrier = target.buffs.find((buff) => buff.type === "barrier");
  if (barrier && special !== "breaker" && special !== "pierce") damage = Math.max(1, Math.ceil(damage * 0.55));
  if (special === "breaker" && (barrier || target.barriers > 0)) damage = Math.ceil(damage * 1.5);
  if (target.statuses.some((status) => status.id === "curse")) damage = Math.ceil(damage * 1.12);
  if (target.barriers > 0) target.barriers -= 1;
  target.hp = Math.max(0, target.hp - damage);
  if (target.statuses.some((status) => status.id === "sleep")) removeStatus(target, "sleep");
  return damage;
}

function inflictByAttribute(target, spell, random) {
  const attributes = spell.attributes ?? [];
  const proc = (id, chance) => attributes.includes(id) && roll(chance, random);
  if (proc("fire", 0.34)) return "burn";
  if (proc("poison", 0.38)) return "poison";
  if (proc("ice", 0.22)) return "freeze";
  if (proc("thunder", 0.28)) return "paralysis";
  if (proc("grass", 0.24)) return "bind";
  if (proc("dark", 0.2)) return "curse";
  if (proc("water", 0.18)) return "blind";
  if (proc("wind", 0.18)) return "confusion";
  if (proc("robot", 0.16)) return "silence";
  if (proc("water", 0.1)) return "sleep";
  return null;
}

export function castSpell(battle, casterSide, spell, { targetLane, random = Math.random, delayed = false } = {}) {
  const caster = battle[casterSide];
  const target = battle[casterSide === "player" ? "enemy" : "player"];
  const shape = getShape(spell.shape);
  const special = getSpecial(spell.special);
  if (!shape || !special) return { ok: false, message: "その魔法は使えない。" };
  const cost = costForSpell(spell);
  let forcedMovement = "";
  if (caster.statuses.some((status) => status.id === "silence")) return { ok: false, message: `${caster.name}は沈黙している。` };
  if (!delayed && caster.mp < cost) return { ok: false, message: "MPが足りない。" };
  if (!delayed) caster.mp -= cost;

  if (special.id === "delayed" && !delayed) {
    battle.pendingSpell = { side: casterSide, spell: structuredClone(spell), targetLane: targetLane || target.lane };
    return { ok: true, message: `${spell.name}の魔法陣が時を刻み始めた。`, damage: 0 };
  }

  const base = Math.max(1, Number(spell.power) || 10);
  const synergy = synergyFor(spell.attributes);
  const tuning = getRuntimeConfig();
  let power = base * damageMultiplier(caster) * (synergy ? 1 + synergy.bonus : 1) * (casterSide === "enemy" ? tuning.cpuPowerMultiplier : tuning.playerPowerMultiplier);
  if (special.id === "quick") power *= 1.12;
  if (special.id === "pierce" || special.id === "split" || special.id === "chain") power *= 1.14;
  if (special.id === "pierceBurst") power *= 1.22;
  if (special.id === "random") power *= 0.72 + random() * 0.56;
  const critical = special.id === "critical" && roll(0.28, random);
  if (critical) power *= 1.75;

  let message = `${getAttribute(spell.attributes[0])?.icon ?? "✦"} ${caster.name}の「${spell.name}」`;
  let damage = 0;
  if (shape.kind === "heal") {
    const amount = Math.round(power * 1.35);
    caster.hp = Math.min(caster.maxHP, caster.hp + amount);
    if (spell.attributes.includes("light")) caster.statuses = [];
    message += `。${critical ? "クリティカル回復！" : ""}HPが${amount}回復した。`;
  } else if (shape.kind === "barrier") {
    refreshBuff(caster, "barrier", 2, 0.45);
    caster.barriers = Math.max(caster.barriers, 1);
    message += "。魔力の盾が展開された。";
  } else if (shape.kind === "boost" || shape.kind === "self") {
    refreshBuff(caster, "power", 3, 1.25);
    if (spell.attributes.includes("water")) caster.mp = Math.min(caster.maxMP, caster.mp + 4);
    message += "。魔力が高まった。";
  } else if (shape.kind === "weaken") {
    refreshBuff(target, "weakened", 3, 0.78);
    message += `。${target.name}の力を弱めた。`;
  } else if (shape.kind === "summon") {
    refreshBuff(caster, "summon", 2, Math.max(7, Math.round(power * 0.42)));
    message += "。使い魔が戦列に加わった。";
  } else {
    const hit = canReach(caster, target, shape, special.id, targetLane);
    const darkened = caster.statuses.some((status) => status.id === "blind");
    if (!hit || (darkened && roll(0.4, random))) {
      message += "は届かなかった。";
      addLog(battle, message);
      return { ok: true, message, damage: 0, hit: false };
    }
    if (shape.id === "explosion" && caster.lane !== target.lane) power *= 0.78;
    if (shape.id === "beam" || special.id === "lasting") applyStatus(target, "poison", 2);
    const status = inflictByAttribute(target, spell, random);
    if (spell.attributes.includes("light")) caster.statuses = [];
    if (status) applyStatus(target, status, status === "burn" || status === "poison" ? 3 : 2);
    const originalTargetLane = target.lane;
    if (special.id === "knockback") target.lane = LANES[(LANES.indexOf(target.lane) + 1) % LANES.length];
    if (special.id === "pull") target.lane = caster.lane;
    if (target.lane !== originalTargetLane) forcedMovement = `${target.name}は${LANE_NAMES[originalTargetLane]}から${LANE_NAMES[target.lane]}へ${special.id === "pull" ? "引き寄せられた" : "押し出された"}`;
    damage = applyDamage(target, power, special.id);
    if (special.id === "absorb") caster.hp = Math.min(caster.maxHP, caster.hp + Math.ceil(damage * 0.22));
    if (shape.id === "trap") applyStatus(target, "bind", 2);
    if (shape.id === "beam" || special.id === "lasting") refreshBuff(target, "lingering", 2, Math.ceil(base * 0.22));
    if (special.id === "split" && target.hp > 0) applyStatus(target, status ?? "blind", 1);
    message += `。${critical ? "クリティカル！" : ""}${damage}ダメージ${status ? `、${STATUS.find((item) => item.id === status)?.name}を付与` : ""}${forcedMovement ? `。${forcedMovement}` : ""}。`;
  }
  addLog(battle, message);
  if (target.buffs.some((buff) => buff.type === "weakened")) power *= 1.05;
  return { ok: true, message, damage, hit: true };
}

export function moveUnit(battle, side, lane) {
  const unit = battle[side];
  if (!LANES.includes(lane)) return { ok: false, message: "そのレーンには移動できない。" };
  if (unit.statuses.some((status) => status.id === "bind")) return { ok: false, message: "拘束されていて移動できない。" };
  if (unit.lane === lane) return { ok: false, message: "すでにそのレーンにいる。" };
  unit.lane = lane;
  const message = `${unit.name}は${{ left: "左翼", center: "中央", right: "右翼" }[lane]}へ移動した。`;
  addLog(battle, message);
  return { ok: true, message };
}

function tickStatuses(battle, side, random) {
  const unit = battle[side];
  for (const status of [...unit.statuses]) {
    if (status.id === "burn" || status.id === "poison") {
      const ratio = status.id === "burn" ? 0.05 : 0.04;
      const damage = Math.max(1, Math.ceil(unit.maxHP * ratio));
      unit.hp = Math.max(0, unit.hp - damage);
      addLog(battle, `${unit.name}は${status.id === "burn" ? "火傷" : "毒"}で${damage}ダメージを受けた。`);
    }
    status.turns -= 1;
    if (status.turns <= 0) removeStatus(unit, status.id);
  }
  for (const buff of [...unit.buffs]) {
    if (buff.type === "lingering") {
      unit.hp = Math.max(0, unit.hp - buff.value);
      addLog(battle, `${unit.name}に魔力の余波が${buff.value}ダメージを与えた。`);
    }
    if (buff.type === "summon") {
      const target = battle[side === "player" ? "enemy" : "player"];
      target.hp = Math.max(0, target.hp - buff.value);
      addLog(battle, `使い魔が${target.name}に${buff.value}ダメージ。`);
    }
    buff.turns -= 1;
    if (buff.turns <= 0) unit.buffs = unit.buffs.filter((item) => item.type !== buff.type);
  }
  if (unit.statuses.some((status) => status.id === "sleep") && roll(0.25, random)) removeStatus(unit, "sleep");
}

function scoreSpell(spell, battle, side) {
  const actor = battle[side];
  const opponent = battle[side === "player" ? "enemy" : "player"];
  const shape = getShape(spell.shape);
  if (actor.mp < costForSpell(spell) || actor.statuses.some((status) => status.id === "silence")) return -Infinity;
  let score = spell.power / costForSpell(spell);
  if (shape.kind === "heal") score += (1 - actor.hp / actor.maxHP) * 4;
  if (shape.kind === "barrier") score += actor.hp / actor.maxHP < 0.45 ? 1.5 : 0;
  if (shape.kind === "boost" || shape.kind === "self") score += actor.buffs.some((buff) => buff.type === "power") ? -2 : 1;
  if (shape.kind === "weaken") score += opponent.buffs.some((buff) => buff.type === "weakened") ? -1 : 0.7;
  if (shape.kind === "damage" && !canReach(actor, opponent, shape, spell.special, opponent.lane)) score -= 3;
  if (actor.mp < costForSpell(spell) + actor.mpRegen) score -= 0.35;
  return score;
}

function chooseEnemyAction(battle, random) {
  const difficulty = battle.difficulty;
  const enemy = battle.enemy;
  const player = battle.player;
  const allowed = enemy.spells.filter((spell) => enemy.mp >= costForSpell(spell));
  const sorted = allowed.map((spell) => ({ spell, score: scoreSpell(spell, battle, "enemy") })).sort((a, b) => b.score - a.score);
  const quality = difficulty === 1 ? 0.18 : Math.min(0.97, 0.36 + difficulty * 0.057);
  if (sorted.length && random() < quality) return { type: "spell", spell: sorted[0].spell, targetLane: player.lane };
  const moveToOtherLane = () => {
    const options = LANES.filter((lane) => lane !== enemy.lane);
    return options[Math.floor(random() * options.length)];
  };
  if (difficulty === 1 && sorted.length && random() >= 0.55) {
    return { type: "move", lane: moveToOtherLane() };
  }
  if (enemy.lane !== player.lane && difficulty >= 4 && random() < Math.min(0.93, 0.4 + difficulty * 0.04)) return { type: "move", lane: player.lane };
  if (sorted.length && random() < 0.7) return { type: "spell", spell: sorted[Math.floor(random() * Math.min(sorted.length, 3))].spell, targetLane: player.lane };
  return { type: "move", lane: moveToOtherLane() };
}

function actorIsStopped(unit, random) {
  if (unit.statuses.some((status) => status.id === "sleep")) return "睡眠で行動できない。";
  if (unit.statuses.some((status) => status.id === "freeze") && roll(0.5, random)) return "凍結で動けなかった。";
  if (unit.statuses.some((status) => status.id === "paralysis") && roll(0.35, random)) return "麻痺で行動に失敗した。";
  return null;
}

function finishIfNeeded(battle) {
  if (battle.player.hp <= 0) battle.result = "defeat";
  else if (battle.enemy.hp <= 0) battle.result = "victory";
  if (battle.result) { battle.phase = "finished"; battle.secondsLeft = 0; }
}

export function resolvePlayerAction(battle, action, random = Math.random) {
  if (battle.result || battle.phase !== "player") return { ok: false, message: "今は行動できない。" };
  if (action.type === "spell") {
    if (!getShape(action.spell?.shape) || !getSpecial(action.spell?.special)) return { ok: false, message: "その魔法は使えない。" };
    if (battle.player.statuses.some((status) => status.id === "silence")) return { ok: false, message: `${battle.player.name}は沈黙している。` };
    if (battle.player.mp < costForSpell(action.spell)) return { ok: false, message: "MPが足りない。" };
  }
  if (action.type === "move" && (!LANES.includes(action.lane) || battle.player.statuses.some((status) => status.id === "bind") || battle.player.lane === action.lane)) {
    return { ok: false, message: battle.player.lane === action.lane ? "すでにそのレーンにいる。" : "そのレーンには移動できない。" };
  }
  let resolvedAction = action;
  const runPlayerAction = () => {
    const stopped = actorIsStopped(battle.player, random);
    if (battle.player.statuses.some((status) => status.id === "confusion") && resolvedAction.type === "spell") {
      resolvedAction = { ...resolvedAction, targetLane: LANES[Math.floor(random() * LANES.length)] };
      addLog(battle, "混乱により、狙いが乱れた。");
    }
    if (stopped) { addLog(battle, stopped); return { ok: true, message: stopped }; }
    if (resolvedAction.type === "spell") return castSpell(battle, "player", resolvedAction.spell, { targetLane: resolvedAction.targetLane, random });
    if (resolvedAction.type === "move") return moveUnit(battle, "player", resolvedAction.lane);
    const result = { ok: true, message: "魔力を整え、ターンを終えた。" };
    addLog(battle, result.message);
    return result;
  };
  const playerFirst = battle.player.speed === battle.enemy.speed ? random() < 0.5 : battle.player.speed > battle.enemy.speed;
  const plannedOrder = playerFirst ? ["player", "enemy"] : ["enemy", "player"];
  const actionOrder = [];
  let playerResult;
  let enemyAction = null;
  let playerActed = false;
  for (const side of plannedOrder) {
    if (battle.result) break;
    actionOrder.push(side);
    if (side === "player") {
      playerResult = runPlayerAction();
      if (!playerResult.ok) return playerResult;
      playerActed = true;
    } else {
      const cpuAction = chooseEnemyAction(battle, random);
      const stopped = actorIsStopped(battle.enemy, random);
      if (stopped) {
        addLog(battle, `${stopped} (${battle.enemy.name})`);
        enemyAction = { type: "stopped", message: stopped };
      } else if (cpuAction.type === "spell") {
        if (battle.enemy.statuses.some((status) => status.id === "confusion")) cpuAction.targetLane = LANES[Math.floor(random() * LANES.length)];
        const result = castSpell(battle, "enemy", cpuAction.spell, { targetLane: cpuAction.targetLane, random });
        enemyAction = { type: "spell", spell: cpuAction.spell, result };
      } else {
        const from = battle.enemy.lane;
        const options = LANES.filter((lane) => lane !== from);
        const destination = cpuAction.lane === from ? options[Math.floor(random() * options.length)] : cpuAction.lane;
        const result = moveUnit(battle, "enemy", destination);
        enemyAction = { type: "move", from, to: battle.enemy.lane, result };
      }
    }
    finishIfNeeded(battle);
  }
  if (!playerResult) playerResult = { ok: true, message: "相手の先手で行動できなかった。" };
  battle.lastActionOrder = actionOrder;
  const orderSummary = actionOrder.map((side) => `${battle[side].name}（素早さ ${battle[side].speed}）`).join(" → ");
  addLog(battle, `行動順：${orderSummary}`);
  if (battle.result) return { ...playerResult, enemyAction, playerActed, actionOrder };
  if (battle.pendingSpell) {
    const pending = battle.pendingSpell;
    battle.pendingSpell = null;
    castSpell(battle, pending.side, pending.spell, { targetLane: pending.targetLane, random, delayed: true });
    finishIfNeeded(battle);
  }
  tickStatuses(battle, "player", random);
  tickStatuses(battle, "enemy", random);
  finishIfNeeded(battle);
  if (!battle.result) {
    battle.turn += 1;
    battle.player.mp = Math.min(battle.player.maxMP, battle.player.mp + battle.player.mpRegen);
    battle.enemy.mp = Math.min(battle.enemy.maxMP, battle.enemy.mp + battle.enemy.mpRegen);
    battle.secondsLeft = 15;
    battle.phase = "player";
  }
  return { ...playerResult, enemyAction, playerActed, actionOrder };
}

export function expirePlayerTurn(battle, random = Math.random) {
  if (!battle || battle.phase !== "player" || battle.result) return { ok: false };
  addLog(battle, "時間切れ。行動せずにターンを終えた。");
  return resolvePlayerAction(battle, { type: "pass" }, random);
}

export function awardExperience(player, outcome, enemyLevel, random = Math.random) {
  const tuning = getRuntimeConfig();
  const participation = 10 + Math.floor(random() * 21);
  const victory = outcome === "victory" ? 100 + Math.floor(random() * 21) : 0;
  const levelDifference = Math.max(0, enemyLevel - player.level);
  const levelBonus = levelDifference ? 5 + Math.floor(random() * 6) + (outcome === "victory" ? 20 : 0) : 0;
  const earned = Math.round((participation + victory + levelBonus) * tuning.expRewardMultiplier);
  player.exp += earned;
  const levels = [];
  while (player.level < 999) {
    const threshold = 80 + player.level * 22 + Math.floor(player.level ** 1.16 * 4);
    if (player.exp < threshold) break;
    player.exp -= threshold;
    player.level += 1;
    player.maxHP += 5;
    player.maxMP += 2;
    if (player.level % 5 === 0) player.mpRegen += 1;
    if (player.level % 10 === 0) { player.maxHP += 10; player.maxMP += 5; }
    player.hp = player.maxHP;
    player.mp = player.maxMP;
    levels.push(player.level);
  }
  player.battles = (player.battles || 0) + 1;
  if (outcome === "victory") { player.wins = (player.wins || 0) + 1; player.rate = (player.rate || 1000) + 12; }
  else { player.losses = (player.losses || 0) + 1; player.rate = Math.max(500, (player.rate || 1000) - 8); }
  player.lastBattle = { outcome, earned, at: new Date().toISOString() };
  return { participation, victory, levelBonus, earned, levels };
}
