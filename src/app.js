import { ATTRIBUTES, CPU_NAMES, LANES, LANE_NAMES, MAX_SPELLS, SHAPES, SPECIALS, STATUS, VERSION, costForSpell, freshPlayer, freshSettings, migratePlayer, requiredExp, synergyFor } from "./data.js?v=1.4.6";
import { awardExperience, createBattle, expirePlayerTurn, resolvePlayerAction } from "./battle.js?v=1.4.6";
import { backupProgress, loadProgress, loadSettings, saveProgress, saveSettings } from "./storage.js?v=1.4.6";
import { Soundscape } from "./audio.js?v=1.4.6";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sound = new Soundscape();
const initialProgress = loadProgress();
let player = initialProgress.player;
const recovered = initialProgress.recovered;
let hasSavedProgress = initialProgress.hasSave;
const settings = loadSettings();
let battle = null;
let battleTimer = null;
let battleResultTimer = null;
let battleActionTimer = null;
let battleAnimationLocked = false;
let pendingBattleAction = null;
let selectedAttributes = ["fire"];
let selectedShape = "bullet";
let selectedTargetLane = "center";
let editingSpellId = null;
let nameDialogMode = "rename";
let savedBeforeNewJourney = null;
let tutorialIndex = 0;
let utilityOpenedFromTitle = false;
let battleGuideIndex = 0;
let battleGuideMarksComplete = false;

const battleGuideSteps = [
  { title: "まずは戦場を見よう", body: "画面上部に自分と相手のHP・MP、中央に三つのレーンがあります。相手のいる場所を見ながら、次の一手を決めます。" },
  { title: "狙う場所を選ぶ", body: "「狙うレーン」で左翼・中央・右翼を選びます。最初から相手のレーンが選ばれているので、迷ったらそのままで大丈夫です。" },
  { title: "使う行動を選ぶ", body: "魔法、移動、パスから一つ選びます。この時点ではまだ実行されません。魔法はMPが足りないと選べません。" },
  { title: "確認してから決定", body: "下の確認欄に選んだ行動が表示されます。「この行動を決定」で実行。違うと思ったら、別の行動を選ぶか「選び直す」で取り消せます。" },
  { title: "時間はゆっくり考えてOK", body: "自分の番は15秒です。時間切れになるとその番はパスになります。ガイドを閉じるまで時間は進まないので、まずは気楽に試してみましょう。" },
];

const tutorialSteps = [
  { view: "homeScreen", title: "ここが冒険の拠点", body: "ホームから対戦、魔法工房、魔法書庫へ進めます。まずは自分の魔法を整えてから、闘技場へ向かいましょう。" },
  { view: "magicScreen", title: "魔法工房で術を編む", body: "属性・形状・特殊効果・威力を組み合わせて魔法を作ります。威力を上げるとMP消費も増えるので、プレビューを見ながら調整しましょう。" },
  { view: "libraryScreen", title: "魔法書庫で準備する", body: `作った魔法は書庫に保存され、対戦で使えます。既存の魔法も編集できます。登録できる魔法は最大${MAX_SPELLS}個です。` },
  { view: "cpuSelectScreen", title: "相手を選んで闘技場へ", body: "CPUは10段階。最初は初心者向けから試すのがおすすめです。勝敗に応じて経験値を獲得し、勝つとレーティングも上がります。" },
  { view: "helpScreen", title: "レーンを読んで行動する", body: "戦闘は左翼・中央・右翼の3レーン制です。狙うレーンを選び、魔法を使うか移動・パスを選択します。1ターン15秒、行動は1回です。" },
  { view: "settingsScreen", title: "冒険の記録は自動保存", body: "進行状況はこのブラウザーに自動保存されます。次回はタイトル画面の「冒険をつづける」から再開できます。別の端末への同期には対応していません。" },
];

function rankFor(rating) {
  if (rating >= 1800) return "S";
  if (rating >= 1600) return "A";
  if (rating >= 1450) return "B";
  if (rating >= 1300) return "C";
  if (rating >= 1150) return "D";
  if (rating >= 1050) return "E";
  return "F";
}

function save() {
  try {
    saveProgress(player);
    hasSavedProgress = true;
    renderTitleActions();
    return true;
  } catch {
    toast("保存できませんでした。ブラウザーの保存領域を確認してください。", true);
    return false;
  }
}

function renderTitleActions() {
  const button = $("#continueBtn");
  if (!button) return;
  button.disabled = !hasSavedProgress;
  $("#continueCaption").textContent = hasSavedProgress ? "このブラウザーの冒険を読み込む" : "セーブデータがありません";
}

function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = `toast${error ? " error" : ""}`;
  node.textContent = message;
  $("#toastRegion").append(node);
  window.setTimeout(() => node.remove(), 3400);
}

function showView(id) {
  if (id === "creditsDialog") { $("#creditsDialog").showModal(); return; }
  const view = document.getElementById(id);
  if (!view) return;
  $("#titleScreen").classList.remove("active");
  $("#gameShell").classList.add("active");
  $$(".view").forEach((item) => item.classList.toggle("active", item === view));
  $$(".rail-link").forEach((item) => item.classList.toggle("active", item.dataset.open === id));
  if (id === "homeScreen") renderHome();
  if (id === "cpuSelectScreen") renderCpuList();
  if (id === "magicScreen") renderForge();
  if (id === "libraryScreen") renderLibrary();
  if (id === "profileScreen") renderProfile();
  if (id === "settingsScreen") renderSettings();
  if (id === "battleScreen") renderBattle();
  window.scrollTo({ top: 0, behavior: settings.motion ? "smooth" : "instant" });
}

function showTitle() {
  stopBattleTimer();
  $("#gameShell").classList.remove("active");
  $("#titleScreen").classList.add("active");
  $$(".rail-link").forEach((item) => item.classList.remove("active"));
}

function renderHome() {
  const need = requiredExp(player.level);
  const progress = Math.min(100, player.exp / need * 100);
  $("#homeLevel").textContent = player.level;
  $("#homeExp").textContent = `EXP ${player.exp} / ${need}`;
  $("#homeExpBar").style.width = `${progress}%`;
  $("#homeRate").textContent = Number(player.rate).toLocaleString("ja-JP");
  $("#homeRank").textContent = rankFor(player.rate);
  $("#homeWins").textContent = player.wins;
  $("#homeLosses").textContent = player.losses;
  $("#homeSpellCount").textContent = player.spells.length;
  $("#homeSpellLimit").textContent = String(MAX_SPELLS);
  $("#headerPlayerName").textContent = player.name;
  $("#headerLevel").textContent = player.level;
  $("#headerRank").textContent = rankFor(player.rate);
}

function renderCpuList() {
  const labels = ["初心者向け", "やや簡単", "標準", "少し手強い", "中級者向け", "上級者向け", "高難易度", "熟練者向け", "エキスパート", "最上級AI"];
  $("#cpuGrid").replaceChildren(...CPU_NAMES.map((name, index) => {
    const button = document.createElement("button");
    button.className = "cpu-card";
    button.type = "button";
    button.dataset.cpuLevel = String(index + 1);
    button.innerHTML = `<span class="cpu-level">${String(index + 1).padStart(2, "0")}</span><span><strong></strong><small></small></span><span class="cpu-rank">${index < 3 ? "RISING" : index < 7 ? "VETERAN" : "MASTER"}</span>`;
    $("strong", button).textContent = name;
    $("small", button).textContent = labels[index];
    return button;
  }));
}

function renderForge() {
  $("#attributeChoices").replaceChildren(...ATTRIBUTES.map((attribute) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `attribute-option${selectedAttributes.includes(attribute.id) ? " selected" : ""}`;
    button.dataset.attribute = attribute.id;
    button.setAttribute("aria-pressed", String(selectedAttributes.includes(attribute.id)));
    button.innerHTML = `<span class="attr-icon">${attribute.icon}</span><span class="attr-name"></span>`;
    $(".attr-name", button).textContent = attribute.name;
    return button;
  }));
  $("#shapeChoices").replaceChildren(...SHAPES.map((shape) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice-option${selectedShape === shape.id ? " selected" : ""}`;
    button.dataset.shape = shape.id;
    button.setAttribute("aria-pressed", String(selectedShape === shape.id));
    button.innerHTML = `<span class="choice-icon">${shape.icon}</span><span class="choice-name"></span>`;
    $(".choice-name", button).textContent = shape.name;
    return button;
  }));
  const select = $("#spellSpecial");
  const previousSpecial = select.value || "critical";
  select.replaceChildren(...SPECIALS.map((special) => {
    const option = document.createElement("option");
    option.value = special.id;
    option.textContent = `${special.icon} ${special.name}`;
    return option;
  }));
  select.value = SPECIALS.some((item) => item.id === previousSpecial) ? previousSpecial : "critical";
  updatePreview();
  $("#spellName").focus({ preventScroll: true });
}

function currentDraft() {
  return {
    name: $("#spellName").value.trim() || "名もなき魔法",
    attributes: selectedAttributes,
    shape: selectedShape,
    special: $("#spellSpecial").value || "critical",
    power: Number($("#spellPower").value),
  };
}

function updatePreview() {
  const draft = currentDraft();
  const first = ATTRIBUTES.find((item) => item.id === draft.attributes[0]) || ATTRIBUTES[0];
  const shape = SHAPES.find((item) => item.id === draft.shape) || SHAPES[0];
  const special = SPECIALS.find((item) => item.id === draft.special) || SPECIALS[0];
  const synergy = synergyFor(draft.attributes);
  $("#powerValue").value = String(draft.power);
  $("#powerValue").textContent = String(draft.power);
  $("#previewAttribute").textContent = draft.attributes.map((id) => ATTRIBUTES.find((item) => item.id === id)?.icon || "✦").join(" ");
  $("#previewName").textContent = draft.name;
  $("#previewDescription").textContent = `${draft.attributes.map((id) => ATTRIBUTES.find((item) => item.id === id)?.name).join("・")} · ${shape.name} · ${special.name}`;
  $("#previewPower").textContent = String(draft.power);
  $("#previewCost").textContent = String(costForSpell(draft));
  $("#specialDescription").textContent = special.description;
  $("#synergyNote").hidden = !synergy;
  $("#synergyNote").textContent = synergy ? `✧ ${synergy.name}のシナジー · 威力 +${Math.round(synergy.bonus * 100)}%` : "";
  $("#spellPreviewArt").style.setProperty("--spell-color", first.color);
  $("#spellPreviewArt").style.background = `radial-gradient(circle, ${first.color}3d, rgba(26,27,32,.2) 62%), linear-gradient(130deg,rgba(76,75,73,.21),rgba(20,22,27,.85))`;
}

function prepareNewSpell() {
  editingSpellId = null;
  $("#spellName").value = "新しい魔法";
  $("#spellPower").value = "24";
  $("#spellSpecial").value = "critical";
  selectedAttributes = ["fire"];
  selectedShape = "bullet";
  renderForge();
}

function editSpell(spell) {
  editingSpellId = spell.id;
  $("#spellName").value = spell.name;
  $("#spellPower").value = String(spell.power);
  selectedAttributes = [...spell.attributes];
  selectedShape = spell.shape;
  renderForge();
  $("#spellSpecial").value = spell.special;
  updatePreview();
  showView("magicScreen");
}

function renderLibrary() {
  $("#libraryCount").textContent = String(player.spells.length);
  $("#librarySpellLimit").textContent = String(MAX_SPELLS);
  const library = $("#spellLibrary");
  library.replaceChildren();
  if (!player.spells.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "書庫はまだ空です。魔法工房で最初の魔法を創りましょう。";
    library.append(empty);
    return;
  }
  player.spells.forEach((spell, index) => {
    const card = document.createElement("article");
    card.className = "spell-card";
    const attributeIcons = spell.attributes.map((id) => ATTRIBUTES.find((item) => item.id === id)?.icon || "✦").join("");
    card.innerHTML = `<div class="spell-card-art"></div><div><h3></h3><p></p><span class="spell-cost">✦ ${costForSpell(spell)} MP</span></div><div class="spell-card-actions"><button class="icon-button" data-spell-action="up" aria-label="上へ移動">↑</button><button class="icon-button" data-spell-action="down" aria-label="下へ移動">↓</button><button class="icon-button" data-spell-action="edit" aria-label="編集">✎</button><button class="icon-button delete" data-spell-action="delete" aria-label="削除">×</button></div>`;
    $(".spell-card-art", card).textContent = attributeIcons;
    $("h3", card).textContent = spell.name;
    const shapeName = SHAPES.find((item) => item.id === spell.shape)?.name || "弾";
    const specialName = SPECIALS.find((item) => item.id === spell.special)?.name || "なし";
    $("p", card).textContent = `${spell.attributes.map((id) => ATTRIBUTES.find((item) => item.id === id)?.name).join("・")} · ${shapeName} · ${specialName}`;
    $$("[data-spell-action]", card).forEach((button) => {
      button.dataset.index = String(index);
      if ((button.dataset.spellAction === "up" && index === 0) || (button.dataset.spellAction === "down" && index === player.spells.length - 1)) button.disabled = true;
    });
    library.append(card);
  });
}

function renderProfile() {
  const rank = rankFor(player.rate);
  $("#profileName").textContent = player.name;
  $("#profileRank").textContent = rank;
  $("#profileLevel").textContent = String(player.level);
  const stats = [
    ["レーティング", Number(player.rate).toLocaleString("ja-JP")], ["勝利", String(player.wins)], ["敗北", String(player.losses)], ["総対戦数", String(player.battles)],
    ["最大HP", String(player.maxHP)], ["最大MP", String(player.maxMP)], ["MP回復量", `${player.mpRegen} / turn`], ["勝率", player.battles ? `${Math.round(player.wins / player.battles * 100)}%` : "—"],
  ];
  $("#profileStats").replaceChildren(...stats.map(([label, value]) => {
    const item = document.createElement("div"); item.className = "profile-stat";
    const caption = document.createElement("small"); caption.textContent = label;
    const number = document.createElement("strong"); number.textContent = value;
    item.append(caption, number); return item;
  }));
  const last = player.lastBattle;
  $("#lastBattle").textContent = last ? `${last.outcome === "victory" ? "勝利" : "敗北"} · EXP +${last.earned} · ${new Date(last.at).toLocaleString("ja-JP")}` : "まだ対戦記録がありません。闘技場に挑戦してみましょう。";
  $("#profileSpells").replaceChildren(...player.spells.slice(0, 6).map((spell) => {
    const chip = document.createElement("span"); chip.className = "profile-spell-chip";
    const mark = document.createElement("span"); mark.textContent = spell.attributes.map((id) => ATTRIBUTES.find((item) => item.id === id)?.icon || "✦").join("");
    const name = document.createElement("span"); name.textContent = spell.name;
    chip.append(mark, name); return chip;
  }));
}

function renderSettings() {
  $("#bgmVolume").value = String(settings.bgm);
  $("#sfxVolume").value = String(settings.sfx);
  $("#motionSetting").checked = settings.motion;
  document.body.classList.toggle("reduce-motion", !settings.motion);
}

function renderBattle() {
  if (!battle) return;
  renderUnit("player", battle.player);
  renderUnit("enemy", battle.enemy);
  $("#turnNumber").textContent = String(battle.turn);
  $("#playerLaneLabel").textContent = LANE_NAMES[battle.player.lane];
  $("#enemyLaneLabel").textContent = LANE_NAMES[battle.enemy.lane];
  renderBattleLaneMap();
  $("#battleLog").replaceChildren(...battle.log.slice(0, 15).map((message, index) => {
    const entry = document.createElement("div"); entry.className = "battle-log-entry";
    const time = document.createElement("time"); time.textContent = `TURN ${battle.turn - Math.floor(index / 3)}`;
    const text = document.createElement("span"); text.textContent = message;
    entry.append(time, text); return entry;
  }));
  const spellList = $("#battleSpellList");
  spellList.replaceChildren(...battle.player.spells.map((spell) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = `battle-spell${pendingBattleAction?.type === "spell" && pendingBattleAction.spell.id === spell.id ? " selected" : ""}`; button.dataset.battleSpell = spell.id;
    const cost = costForSpell(spell);
    const icon = ATTRIBUTES.find((item) => item.id === spell.attributes[0])?.icon || "✦";
    button.innerHTML = `<span class="battle-spell-icon">${icon}</span><span class="battle-spell-name"></span><span class="battle-spell-cost">${cost}MP</span>`;
    $(".battle-spell-name", button).textContent = spell.name;
    button.disabled = battle.player.mp < cost || battle.phase !== "player" || battleAnimationLocked || battle.player.statuses.some((status) => status.id === "silence");
    return button;
  }));
  const blocked = battle.player.statuses.some((status) => ["sleep"].includes(status.id));
  $("#actionHint").textContent = battleAnimationLocked ? `${battle.enemy.name}のターン · 相手の動きを見よう` : blocked ? "状態異常で行動できません" : "1ターンに1行動";
  $$("[data-move-lane]").forEach((button) => {
    button.classList.toggle("selected", pendingBattleAction?.type === "move" && pendingBattleAction.lane === button.dataset.moveLane);
    button.disabled = battle.phase !== "player" || battleAnimationLocked || battle.player.lane === button.dataset.moveLane || battle.player.statuses.some((status) => status.id === "bind");
  });
  $$("[data-target-lane]").forEach((button) => { button.classList.toggle("selected", button.dataset.targetLane === selectedTargetLane); button.disabled = battle.phase !== "player" || battleAnimationLocked; });
  $("#passTurnBtn").disabled = battle.phase !== "player" || battleAnimationLocked;
  $("#passTurnBtn").classList.toggle("selected", pendingBattleAction?.type === "pass");
  $("#actionPreview").textContent = describePendingBattleAction();
  $("#confirmBattleActionBtn").disabled = !pendingBattleAction || battle.phase !== "player" || battleAnimationLocked;
  $("#cancelBattleActionBtn").disabled = !pendingBattleAction || battle.phase !== "player" || battleAnimationLocked;
  $("#actionConfirmation").classList.toggle("has-selection", Boolean(pendingBattleAction));
  $("#retreatBtn").disabled = Boolean(battle.result);
  updateTimerDisplay();
}

function describePendingBattleAction() {
  if (!pendingBattleAction) return "①狙うレーン → ②行動を選ぶ → ③決定。決定前なら何度でも選び直せます。";
  if (pendingBattleAction.type === "spell") return `「${pendingBattleAction.spell.name}」を使用 · ${LANE_NAMES[pendingBattleAction.targetLane]}を狙う`;
  if (pendingBattleAction.type === "move") return `${LANE_NAMES[pendingBattleAction.lane]}へ移動`;
  return "このターンはパスする";
}

function selectBattleAction(action) {
  if (!battle || battle.phase !== "player" || battleAnimationLocked) return;
  pendingBattleAction = action;
  renderBattle();
}

function renderBattleLaneMap() {
  let map = $("#battleLaneMap");
  if (!map) {
    map = document.createElement("div");
    map.id = "battleLaneMap";
    map.className = "battle-lane-map";
    map.setAttribute("aria-label", "戦場のレーンと双方の位置");
    $("#battleArena").append(map);
  }
  map.replaceChildren(...LANES.map((lane) => {
    const slot = document.createElement("div");
    slot.className = `battle-lane${selectedTargetLane === lane ? " aiming" : ""}`;
    const label = document.createElement("span");
    label.className = "battle-lane-name";
    label.textContent = LANE_NAMES[lane];
    if (selectedTargetLane === lane) {
      const aim = document.createElement("em");
      aim.className = "lane-aim-tag";
      aim.textContent = "狙い";
      label.append(" ", aim);
    }
    const pieces = document.createElement("span");
    pieces.className = "battle-lane-pieces";
    if (battle.enemy.lane === lane) {
      const enemyPiece = document.createElement("b");
      enemyPiece.className = "lane-piece enemy-piece";
      enemyPiece.textContent = "敵";
      pieces.append(enemyPiece);
    }
    if (battle.player.lane === lane) {
      const playerPiece = document.createElement("b");
      playerPiece.className = "lane-piece player-piece";
      playerPiece.textContent = "自分";
      pieces.append(playerPiece);
    }
    slot.append(label, pieces);
    return slot;
  }));
}

function renderUnit(side, unit) {
  const playerSide = side === "player";
  const prefix = playerSide ? "player" : "enemy";
  if (playerSide) {
    $("#battlePlayerName").textContent = unit.name;
    $("#battlePlayerLevel").textContent = String(unit.level);
  } else {
    $("#enemyName").textContent = unit.name;
    $("#enemyLevel").textContent = String(unit.level);
    $("#enemyAvatar").textContent = ["♜", "♟", "♙", "♞", "♛", "♜", "♟", "♘", "♚", "♕"][battle.difficulty - 1];
  }
  $(`#${prefix}HPText`).textContent = String(unit.hp);
  $(`#${prefix}MaxHPText`).textContent = String(unit.maxHP);
  $(`#${prefix}MPText`).textContent = String(unit.mp);
  $(`#${prefix}MaxMPText`).textContent = String(unit.maxMP);
  $(`#${prefix}HPBar`).style.width = `${Math.max(0, unit.hp / unit.maxHP * 100)}%`;
  $(`#${prefix}MPBar`).style.width = `${Math.max(0, unit.mp / unit.maxMP * 100)}%`;
  const labels = [...unit.statuses.map((item) => `${STATUS.find((status) => status.id === item.id)?.icon || "✧"} ${STATUS.find((status) => status.id === item.id)?.name} ${item.turns}`), ...unit.buffs.map((buff) => `${buff.type === "barrier" ? "⬡" : "✦"} ${buff.type === "barrier" ? "結界" : buff.type === "power" ? "魔力上昇" : buff.type === "weakened" ? "弱体" : buff.type === "summon" ? "使い魔" : "余波"} ${buff.turns}`)];
  $(`#${prefix}Tags`).replaceChildren(...labels.map((label) => { const tag = document.createElement("span"); tag.className = "unit-tag"; tag.textContent = label; return tag; }));
}

function startBattle(cpuLevel) {
  if (battleResultTimer) window.clearTimeout(battleResultTimer);
  if (battleActionTimer) window.clearTimeout(battleActionTimer);
  battleActionTimer = null;
  battleAnimationLocked = false;
  pendingBattleAction = null;
  battleResultTimer = null;
  sound.unlock();
  sound.effect("select");
  battle = createBattle(player, cpuLevel);
  selectedTargetLane = battle.enemy.lane;
  showView("battleScreen");
  $("#battleArena").dataset.difficulty = String(cpuLevel);
  renderBattle();
  stopBattleTimer();
  if (!player.battleControlsTutorialCompleted) {
    battleGuideMarksComplete = true;
    battleGuideIndex = 0;
    renderBattleGuide();
  } else startBattleTimer();
}

function startBattleTimer() {
  stopBattleTimer();
  battleTimer = window.setInterval(() => {
    if (!battle || battle.phase !== "player" || battleAnimationLocked || battle.result) return;
    battle.secondsLeft -= 1;
    updateTimerDisplay();
    if (battle.secondsLeft <= 0) {
      pendingBattleAction = null;
      const before = { playerHP: battle.player.hp, enemyHP: battle.enemy.hp, playerLane: battle.player.lane, enemyLane: battle.enemy.lane, log: [...battle.log] };
      expirePlayerTurn(battle);
      animateBattleEvents(before, { type: "pass" });
      afterAction(before);
    }
  }, 1000);
}

function renderBattleGuide() {
  const step = battleGuideSteps[battleGuideIndex];
  $("#battleGuideCounter").textContent = `BATTLE GUIDE · ${String(battleGuideIndex + 1).padStart(2, "0")} / ${String(battleGuideSteps.length).padStart(2, "0")}`;
  $("#battleGuideTitle").textContent = step.title;
  $("#battleGuideBody").textContent = step.body;
  $("#battleGuideProgress").style.width = `${((battleGuideIndex + 1) / battleGuideSteps.length) * 100}%`;
  $("#battleGuideBackBtn").disabled = battleGuideIndex === 0;
  $("#battleGuideNextBtn").querySelector("span").textContent = battleGuideIndex === battleGuideSteps.length - 1 ? "対戦を始める" : "次へ";
  if (!$("#battleGuideDialog").open) $("#battleGuideDialog").showModal();
}

function startBattleGuide(markComplete = false) {
  battleGuideMarksComplete = markComplete;
  battleGuideIndex = 0;
  if (battle) stopBattleTimer();
  renderBattleGuide();
}

function finishBattleGuide() {
  if ($("#battleGuideDialog").open) $("#battleGuideDialog").close("complete");
  if (battleGuideMarksComplete) {
    player.battleControlsTutorialCompleted = true;
    save();
  }
  battleGuideMarksComplete = false;
  if (battle && battle.phase === "player" && !battle.result) startBattleTimer();
}

function stopBattleTimer() {
  if (battleTimer) window.clearInterval(battleTimer);
  battleTimer = null;
}

function updateTimerDisplay() {
  if (!battle) return;
  $("#turnTimer").textContent = String(Math.max(0, battle.secondsLeft));
  $(".battle-timer").classList.toggle("urgent", battle.secondsLeft <= 5);
  $(".timer-caption").textContent = battleAnimationLocked ? "戦況確認中" : battle.phase === "enemy" ? "CPU TURN" : "YOUR TURN";
}

function doPlayerAction(action, soundKind = "magic") {
  if (!battle || battle.phase !== "player" || battleAnimationLocked) return;
  const before = {
    playerHP: battle.player.hp,
    enemyHP: battle.enemy.hp,
    playerLane: battle.player.lane,
    enemyLane: battle.enemy.lane,
    log: [...battle.log],
  };
  const result = resolvePlayerAction(battle, action);
  if (!result.ok) { toast(result.message, true); return; }
  pendingBattleAction = null;
  sound.effect(soundKind);
  animateBattleEvents(before, action, result);
  afterAction(before);
}

function newBattleLogEntries(previousLog) {
  if (!previousLog.length) return [...battle.log];
  for (let offset = 0; offset < battle.log.length; offset += 1) {
    const overlap = Math.min(previousLog.length, battle.log.length - offset);
    if (overlap > 0 && previousLog.slice(0, overlap).every((entry, index) => entry === battle.log[offset + index])) {
      return battle.log.slice(0, offset);
    }
  }
  return battle.log.slice(0, 6);
}

function animateBattleEvents(before, action, playerResult = null) {
  const freshLogs = newBattleLogEntries(before.log);
  const playerSpell = action.type === "spell" && freshLogs.some((entry) => entry.includes(`${battle.player.name}の「${action.spell.name}」`));
  const playerSpellLog = playerSpell ? freshLogs.find((entry) => entry.includes(`${battle.player.name}の「${action.spell.name}」`)) : "";
  if (playerSpell) {
    const shape = SHAPES.find((item) => item.id === action.spell.shape);
    if (playerSpellLog.includes("クリティカル回復")) showBattleAnnouncement("CRITICAL HEAL!", `回復 · ${action.spell.name}`, "heal");
    else if (playerSpellLog.includes("クリティカル")) showBattleAnnouncement(`CRITICAL! −${playerResult?.damage || 0}`, `クリティカル · ${action.spell.name}`, "critical");
    else if (playerResult?.hit === false) showBattleAnnouncement("MISS", `届かなかった · ${shape?.name || "魔法"} · ${action.spell.name}`, "miss");
    else if (shape?.kind === "heal") showBattleAnnouncement(`回復！ +${playerSpellLog.match(/HPが(\d+)回復/)?.[1] || 0}`, `${action.spell.name} · HPを回復`, "heal");
    else if (shape?.kind === "damage" && playerResult?.damage > 0) showBattleAnnouncement("命中！", `${shape.name} · ${action.spell.name} · −${playerResult.damage}`, "attack");
    else showBattleAnnouncement("魔法発動！", `${shape?.name || "魔法"} · ${action.spell.name}`, "attack");
    animateSpell(action.spell, "player");
  } else if (action.type === "move") {
    showBattleAnnouncement("移動！", `レーンを移動 · ${LANE_NAMES[action.lane]}`, "move");
  } else if (action.type === "pass") {
    showBattleAnnouncement("様子を見る", "魔力を整え、次の一手へ", "move");
  }
  const enemySpell = battle.enemy.spells.find((spell) => freshLogs.some((entry) => entry.includes(`${battle.enemy.name}の「${spell.name}」`)));
  const enemySpellLog = enemySpell ? freshLogs.find((entry) => entry.includes(`${battle.enemy.name}の「${enemySpell.name}」`)) : "";
  const playerDelta = before.playerHP - battle.player.hp;
  const enemyDelta = before.enemyHP - battle.enemy.hp;
  if (before.playerLane !== battle.player.lane) animateMovement("player");
  const enemyBeatDelay = settings.motion ? (playerSpell ? 1350 : 750) : 80;
  if (enemyDelta > 0) window.setTimeout(() => revealBattleImpact("enemy", enemyDelta), settings.motion && playerSpell ? 820 : 100);
  else if (enemyDelta < 0) window.setTimeout(() => revealBattleImpact("enemy", -enemyDelta, true), 650);
  if (settings.motion && enemyBeatDelay > 500) {
    window.setTimeout(() => showBattleAnnouncement(`${battle.enemy.name}のターン`, "相手が次の一手を選ぶ…", "enemy"), enemyBeatDelay - 500);
  }
  window.setTimeout(() => {
    if (enemySpell) {
      if (enemySpellLog.includes("クリティカル回復")) showBattleAnnouncement("相手 CRITICAL HEAL!", `${enemySpell.name} · 相手が回復`, "enemy");
      else if (enemySpellLog.includes("クリティカル")) showBattleAnnouncement(`相手 CRITICAL! −${playerDelta}`, `${enemySpell.name} · クリティカル`, "critical");
      else if (enemySpellLog.includes("届かなかった")) showBattleAnnouncement("回避！", `相手の魔法 · ${enemySpell.name}`, "move");
      else if (playerDelta > 0) showBattleAnnouncement("被弾！", `${battle.enemy.name}の攻撃 · ${enemySpell.name} · −${playerDelta}`, "damage");
      else if (enemyDelta < 0) showBattleAnnouncement(`CPU回復！ +${-enemyDelta}`, `相手の魔法 · ${enemySpell.name}`, "enemy");
      else showBattleAnnouncement("相手の行動", `CPUの魔法 · ${enemySpell.name}`, "enemy");
      animateSpell(enemySpell, "enemy");
    } else if (before.enemyLane !== battle.enemy.lane) {
      showBattleAnnouncement("相手が移動！", `${battle.enemy.name} · ${LANE_NAMES[battle.enemy.lane]}へ`, "enemy");
    } else if (playerDelta > 0) {
      showBattleAnnouncement("被弾！", `状態異常などのダメージ · −${playerDelta}`, "damage");
    }
    if (before.enemyLane !== battle.enemy.lane) animateMovement("enemy");
    if (playerDelta > 0) window.setTimeout(() => revealBattleImpact("player", playerDelta), enemySpell && settings.motion ? 820 : 100);
    else if (playerDelta < 0) window.setTimeout(() => revealBattleImpact("player", -playerDelta, true), 100);
  }, enemyBeatDelay);
}

function showBattleAnnouncement(title, detail, kind = "attack") {
  const arena = $("#battleArena");
  let banner = $("#battleAnnouncement", arena);
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "battleAnnouncement";
    banner.className = "battle-announcement";
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-atomic", "true");
    arena.append(banner);
  }
  banner.className = `battle-announcement ${kind}`;
  banner.replaceChildren();
  const main = document.createElement("strong");
  main.textContent = title;
  const sub = document.createElement("span");
  sub.textContent = detail;
  banner.append(main, sub);
  banner.classList.remove("active");
  void banner.offsetWidth;
  banner.classList.add("active");
  window.clearTimeout(banner.announcementTimer);
  banner.announcementTimer = window.setTimeout(() => banner.classList.remove("active"), 1450);
}

function updateCombatHP(side) {
  const unit = battle[side];
  const prefix = side === "player" ? "player" : "enemy";
  $(`#${prefix}HPText`).textContent = String(unit.hp);
  $(`#${prefix}HPBar`).style.width = `${Math.max(0, unit.hp / unit.maxHP * 100)}%`;
}

function revealBattleImpact(side, amount, healing = false) {
  updateCombatHP(side);
  animateImpact(side, amount, healing);
}

function getBattleAvatar(side) {
  return side === "player" ? $(".player-avatar-large") : $("#enemyAvatar");
}

function animateMovement(side) {
  const avatar = getBattleAvatar(side);
  avatar?.classList.add("is-moving");
  window.setTimeout(() => avatar?.classList.remove("is-moving"), 460);
}

function animateImpact(side, amount, healing = false) {
  const avatar = getBattleAvatar(side);
  if (!avatar) return;
  sound.effect(healing ? "heal" : "hit");
  avatar.classList.remove("is-hit", "is-healing");
  void avatar.offsetWidth;
  avatar.classList.add(healing ? "is-healing" : "is-hit");
  const number = document.createElement("span");
  number.className = `impact-number${healing ? " healing" : ""}`;
  number.textContent = `${healing ? "+" : "−"}${amount}`;
  avatar.append(number);
  window.setTimeout(() => { number.remove(); avatar.classList.remove("is-hit", "is-healing"); }, 820);
}

function afterAction(before) {
  if (!battle) return;
  battleAnimationLocked = true;
  renderBattle();
  for (const side of ["player", "enemy"]) {
    const hp = side === "player" ? before.playerHP : before.enemyHP;
    const unit = battle[side];
    const prefix = side === "player" ? "player" : "enemy";
    $(`#${prefix}HPText`).textContent = String(hp);
    $(`#${prefix}HPBar`).style.width = `${Math.max(0, hp / unit.maxHP * 100)}%`;
  }
  if (battle.result) {
    stopBattleTimer();
    battleResultTimer = window.setTimeout(finishBattle, settings.motion ? 3000 : 450);
  } else {
    battleActionTimer = window.setTimeout(() => {
      battleActionTimer = null;
      battleAnimationLocked = false;
      $("#battleEffect").classList.remove("active");
      $("#battleAnnouncement")?.classList.remove("active");
      updateTimerDisplay();
      renderBattle();
    }, settings.motion ? 3000 : 450);
  }
}

function animateSpell(spell, side) {
  const attribute = ATTRIBUTES.find((item) => item.id === spell.attributes[0]);
  const shape = SHAPES.find((item) => item.id === spell.shape);
  const effect = $("#battleEffect");
  effect.classList.add("active");
  const projectile = document.createElement("span");
  const selfTarget = ["heal", "barrier", "boost", "self", "summon"].includes(shape?.kind);
  projectile.className = `spell-projectile ${side === "player" ? "from-player" : "from-enemy"}${selfTarget ? " self-target" : ""}`;
  projectile.style.setProperty("--spell-color", attribute?.color || "var(--gold-bright)");
  projectile.textContent = attribute?.icon || "✦";
  const glyph = document.createElement("i");
  glyph.textContent = shape?.icon || "✦";
  projectile.append(glyph);
  effect.append(projectile);
  const callout = document.createElement("span");
  callout.className = `spell-callout ${side === "player" ? "for-player" : "for-enemy"}`;
  callout.textContent = `${side === "player" ? "あなたの魔法" : `${battle.enemy.name}の魔法`} · ${spell.name}`;
  effect.append(callout);
  const avatar = getBattleAvatar(side);
  avatar?.style.setProperty("--spell-color", attribute?.color || "var(--gold-bright)");
  avatar?.classList.add("is-casting");
  window.setTimeout(() => { projectile.remove(); callout.remove(); avatar?.classList.remove("is-casting"); avatar?.style.removeProperty("--spell-color"); }, 1200);
}

function finishBattle() {
  if (battleResultTimer) window.clearTimeout(battleResultTimer);
  if (battleActionTimer) window.clearTimeout(battleActionTimer);
  battleActionTimer = null;
  battleAnimationLocked = false;
  pendingBattleAction = null;
  battleResultTimer = null;
  stopBattleTimer();
  const outcome = battle.result;
  const cpuName = battle.enemy.name;
  const playerLevel = player.level;
  player.hp = Math.max(1, battle.player.hp);
  player.mp = Math.max(0, battle.player.mp);
  const reward = awardExperience(player, outcome, battle.enemy.level);
  save();
  renderHome();
  $("#resultScreen").classList.toggle("defeat", outcome === "defeat");
  $("#resultTitle").textContent = outcome === "victory" ? "勝利" : "敗北";
  $("#resultEyebrow").textContent = outcome === "victory" ? "THE ARENA REMEMBERS" : "RISE AGAIN, SPELLWEAVER";
  $("#resultSigil").textContent = outcome === "victory" ? "✦" : "◇";
  $("#resultOpponent").textContent = `${cpuName}との戦い · ${battle.turn}ターン`;
  $("#rewardExp").textContent = String(reward.earned);
  $("#levelUpNotice").textContent = reward.levels.length ? `LEVEL UP · ${playerLevel} → ${player.level}` : "";
  $("#resultRecord").innerHTML = `<span>RANK ${rankFor(player.rate)}</span><span>LV ${player.level}</span><span>${player.wins}勝 ${player.losses}敗</span>`;
  sound.effect(outcome === "victory" ? "victory" : "defeat");
  showView("resultScreen");
}

function confirm(message, title = "確認") {
  const dialog = $("#confirmDialog");
  $("#dialogTitle").textContent = title;
  $("#dialogMessage").textContent = message;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    const onClose = () => { dialog.removeEventListener("close", onClose); resolve(dialog.returnValue === "confirm"); };
    dialog.addEventListener("close", onClose);
  });
}

function renderTutorialStep() {
  const step = tutorialSteps[tutorialIndex];
  showView(step.view);
  $("#tutorialCounter").textContent = `FIELD GUIDE · ${String(tutorialIndex + 1).padStart(2, "0")} / ${String(tutorialSteps.length).padStart(2, "0")}`;
  $("#tutorialTitle").textContent = step.title;
  $("#tutorialBody").textContent = step.body;
  $("#tutorialProgress").style.width = `${((tutorialIndex + 1) / tutorialSteps.length) * 100}%`;
  $("#tutorialBackBtn").disabled = tutorialIndex === 0;
  $("#tutorialNextBtn").querySelector("span").textContent = tutorialIndex === tutorialSteps.length - 1 ? "冒険を始める" : "次へ";
  if (!$("#tutorialDialog").open) $("#tutorialDialog").showModal();
}

function startTutorial() {
  tutorialIndex = 0;
  renderTutorialStep();
}

function finishTutorial() {
  player.tutorialCompleted = true;
  save();
  if ($("#tutorialDialog").open) $("#tutorialDialog").close("complete");
  showView("homeScreen");
}

function openNameDialog(mode) {
  nameDialogMode = mode;
  $("#nameDialogTitle").textContent = mode === "onboarding" ? "魔法使いの名前を決めよう" : "新しい名前";
  $("#nameDialogLabel").textContent = mode === "onboarding" ? "闘技場で呼ばれる名前（あとから変更できます）" : "闘技場で呼ばれる名前";
  $("#nameSubmitLabel").textContent = mode === "onboarding" ? "この名前で進む" : "名前を刻む";
  $("#playerNameInput").value = mode === "onboarding" ? "" : player.name;
  $("#nameCancelButton").textContent = mode === "onboarding" ? "タイトルへ戻る" : "戻る";
  $("#nameDialog").showModal();
  $("#playerNameInput").focus();
}

async function beginNewJourney() {
  sound.unlock();
  sound.effect("select");
  savedBeforeNewJourney = null;
  if (hasSavedProgress) {
    const accepted = await confirm("現在の冒険をJSONファイルとブラウザー内バックアップに保存してから、新しい冒険を始めます。続けますか？", "新しい冒険を始める");
    if (!accepted) return;
    try {
      if (!backupProgress()) throw new Error("save not found");
      downloadSave();
      savedBeforeNewJourney = JSON.parse(JSON.stringify(player));
    } catch {
      toast("現在の冒険をバックアップできなかったため、新しい冒険は開始しませんでした。", true);
      return;
    }
    player = freshPlayer();
  } else {
    const accepted = await confirm("新しい冒険を始めます。ユーザー名を決めて、チュートリアルへ進みますか？", "冒険を始める");
    if (!accepted) return;
  }
  openNameDialog("onboarding");
}

function continueJourney() {
  sound.unlock();
  sound.effect("select");
  const latest = loadProgress();
  if (!latest.hasSave) {
    hasSavedProgress = false;
    renderTitleActions();
    toast("このブラウザーに続きの冒険がありません。", true);
    return;
  }
  player = latest.player;
  hasSavedProgress = true;
  renderTitleActions();
  if (!player.tutorialCompleted) startTutorial();
  else showView("homeScreen");
}

function saveDraft(event) {
  event.preventDefault();
  const draft = currentDraft();
  if (!draft.name || draft.name.length > 24) { toast("魔法名を1〜24文字で入力してください。", true); return; }
  const existingIndex = player.spells.findIndex((spell) => spell.id === editingSpellId);
  if (existingIndex < 0 && player.spells.length >= MAX_SPELLS) { toast(`魔法書庫は${MAX_SPELLS}個までです。既存の魔法を整理してください。`, true); return; }
  const spell = { ...draft, id: editingSpellId || `spell-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, cost: costForSpell(draft) };
  if (existingIndex >= 0) player.spells[existingIndex] = spell;
  else player.spells.push(spell);
  editingSpellId = null;
  save(); renderHome(); renderLibrary();
  sound.effect("level");
  toast(`「${spell.name}」を魔法書庫に刻みました。`);
  showView("libraryScreen");
}

function downloadSave() {
  const payload = JSON.stringify({ version: VERSION, exportedAt: new Date().toISOString(), player, settings }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = `uma-save-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("保存データを書き出しました。");
}

async function restoreSave(file) {
  if (battle) {
    toast("対戦中は復元できません。試合を終えてから設定画面を開いてください。", true);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || !parsed.player || typeof parsed.player !== "object" || Array.isArray(parsed.player)) throw new Error("invalid save");
    if (typeof parsed.player.name !== "string" || !parsed.player.name.trim() || !Array.isArray(parsed.player.spells)) throw new Error("invalid player");
    if (parsed.settings !== undefined && (!parsed.settings || typeof parsed.settings !== "object" || Array.isArray(parsed.settings))) throw new Error("invalid settings");
  } catch {
    toast("このファイルはUMAの保存データとして読み込めません。", true);
    return;
  }

  const accepted = await confirm(`「${parsed.player.name}」の冒険を読み込みます。現在の冒険はJSONファイルとブラウザー内バックアップに保全します。続けますか？`, "保存データを復元");
  if (!accepted) return;

  const restoredPlayer = migratePlayer(parsed.player);
  const restoredSettings = { ...freshSettings(), ...(parsed.settings || {}) };
  restoredSettings.bgm = Math.max(0, Math.min(1, Number(restoredSettings.bgm) || 0));
  restoredSettings.sfx = Math.max(0, Math.min(1, Number(restoredSettings.sfx) || 0));
  restoredSettings.motion = restoredSettings.motion !== false;
  const previousPlayer = player;
  const previousSettings = { ...settings };
  try {
    if (hasSavedProgress) {
      saveProgress(player);
      if (!backupProgress()) throw new Error("backup failed");
      downloadSave();
    }
    saveProgress(restoredPlayer);
    saveSettings(restoredSettings);
  } catch {
    try { saveProgress(previousPlayer); saveSettings(previousSettings); } catch { /* Keep the in-memory adventure available. */ }
    toast("復元できませんでした。現在の冒険を保持しています。保存領域を確認してください。", true);
    return;
  }
  player = restoredPlayer;
  Object.assign(settings, restoredSettings);
  hasSavedProgress = true;
  sound.setVolumes(settings.bgm, settings.sfx);
  document.body.classList.toggle("reduce-motion", !settings.motion);
  renderTitleActions();
  renderHome();
  renderSettings();
  showView("homeScreen");
  toast("冒険を復元しました。");
}

function setName(value) {
  const name = value.trim().slice(0, 18);
  if (!name) { toast("名前を入力してください。", true); return false; }
  player.name = name;
  renderHome();
  renderProfile();
  if (!save()) return false;
  toast(`「${name}」で登録しました。`);
  return true;
}

function setVolume() { sound.setVolumes(settings.bgm, settings.sfx); }

function bindEvents() {
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open]");
    if (opener) {
      event.preventDefault();
      const destination = opener.dataset.open;
      const isTitleUtility = ["helpScreen", "updatesScreen", "settingsScreen"].includes(destination);
      if (opener.classList.contains("back-link") && utilityOpenedFromTitle) {
        utilityOpenedFromTitle = false;
        showTitle();
      } else {
        if (opener.closest("#titleScreen")) utilityOpenedFromTitle = isTitleUtility;
        else if (!isTitleUtility && destination !== "creditsDialog") utilityOpenedFromTitle = false;
        showView(destination);
      }
      sound.effect("select");
    }
  });

  $("#startBtn").addEventListener("click", beginNewJourney);
  $("#continueBtn").addEventListener("click", continueJourney);
  $("#tutorialNextBtn").addEventListener("click", () => {
    if (tutorialIndex === tutorialSteps.length - 1) finishTutorial();
    else { tutorialIndex += 1; renderTutorialStep(); }
  });
  $("#tutorialBackBtn").addEventListener("click", () => { if (tutorialIndex > 0) { tutorialIndex -= 1; renderTutorialStep(); } });
  $("#tutorialSkipBtn").addEventListener("click", finishTutorial);
  $("#tutorialDialog").addEventListener("cancel", (event) => { event.preventDefault(); finishTutorial(); });
  $("#replayTutorialBtn").addEventListener("click", startTutorial);
  $("#replayBattleGuideBtn").addEventListener("click", () => startBattleGuide(false));
  $("#battleGuideNextBtn").addEventListener("click", () => {
    if (battleGuideIndex === battleGuideSteps.length - 1) finishBattleGuide();
    else { battleGuideIndex += 1; renderBattleGuide(); }
  });
  $("#battleGuideBackBtn").addEventListener("click", () => { if (battleGuideIndex > 0) { battleGuideIndex -= 1; renderBattleGuide(); } });
  $("#battleGuideSkipBtn").addEventListener("click", finishBattleGuide);
  $("#battleGuideDialog").addEventListener("cancel", (event) => { event.preventDefault(); finishBattleGuide(); });
  $("#cpuGrid").addEventListener("click", (event) => { const button = event.target.closest("[data-cpu-level]"); if (button) startBattle(Number(button.dataset.cpuLevel)); });
  $("#magicForm").addEventListener("submit", saveDraft);
  $("#magicForm").addEventListener("input", updatePreview);
  $("#magicForm").addEventListener("change", updatePreview);
  $("#attributeChoices").addEventListener("click", (event) => {
    const button = event.target.closest("[data-attribute]"); if (!button) return;
    const id = button.dataset.attribute;
    if (selectedAttributes.includes(id)) {
      if (selectedAttributes.length === 1) { toast("魔法には少なくとも1属性が必要です。", true); return; }
      selectedAttributes = selectedAttributes.filter((item) => item !== id);
    } else if (selectedAttributes.length >= 2) toast("属性は最大2つまでです。", true);
    else selectedAttributes.push(id);
    renderForge();
  });
  $("#shapeChoices").addEventListener("click", (event) => { const button = event.target.closest("[data-shape]"); if (!button) return; selectedShape = button.dataset.shape; renderForge(); });

  $("#spellLibrary").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-spell-action]"); if (!button) return;
    const index = Number(button.dataset.index); const action = button.dataset.spellAction; const spell = player.spells[index];
    if (!spell) return;
    if (action === "edit") { editSpell(spell); return; }
    if (action === "delete") {
      if (!(await confirm(`「${spell.name}」を魔法書庫から削除します。この操作は取り消せません。`, "魔法を削除"))) return;
      player.spells.splice(index, 1); save(); renderLibrary(); renderHome(); toast("魔法を削除しました。"); return;
    }
    const next = action === "up" ? index - 1 : index + 1;
    if (next < 0 || next >= player.spells.length) return;
    [player.spells[index], player.spells[next]] = [player.spells[next], player.spells[index]];
    save(); renderLibrary();
  });
  $("#spellName").addEventListener("input", updatePreview);
  $("#spellPower").addEventListener("input", updatePreview);
  $("#spellSpecial").addEventListener("change", updatePreview);

  $("#targetLanePicker").addEventListener("click", (event) => { const button = event.target.closest("[data-target-lane]"); if (!button) return; selectedTargetLane = button.dataset.targetLane; if (pendingBattleAction?.type === "spell") pendingBattleAction.targetLane = selectedTargetLane; renderBattle(); });
  $("#moveLanePicker").addEventListener("click", (event) => { const button = event.target.closest("[data-move-lane]"); if (button) selectBattleAction({ type: "move", lane: button.dataset.moveLane }); });
  $("#battleSpellList").addEventListener("click", (event) => { const button = event.target.closest("[data-battle-spell]"); if (!button || !battle) return; const spell = battle.player.spells.find((item) => item.id === button.dataset.battleSpell); if (spell) selectBattleAction({ type: "spell", spell, targetLane: selectedTargetLane }); });
  $("#passTurnBtn").addEventListener("click", () => selectBattleAction({ type: "pass" }));
  $("#confirmBattleActionBtn").addEventListener("click", () => { if (pendingBattleAction) doPlayerAction(pendingBattleAction, pendingBattleAction.type === "spell" ? "magic" : "select"); });
  $("#cancelBattleActionBtn").addEventListener("click", () => { pendingBattleAction = null; renderBattle(); });
  $("#retreatBtn").addEventListener("click", async () => { if (battle?.result) return; if (await confirm("この戦いを降参してホームへ戻ります。参加EXPは獲得できます。", "降参する")) { battle.result = "defeat"; finishBattle(); } });
  $("#returnHomeBtn").addEventListener("click", () => { battle = null; showView("homeScreen"); });

  $("#bgmVolume").addEventListener("input", (event) => { settings.bgm = Number(event.target.value); setVolume(); });
  $("#bgmVolume").addEventListener("change", () => saveSettings(settings));
  $("#sfxVolume").addEventListener("input", (event) => { settings.sfx = Number(event.target.value); setVolume(); });
  $("#sfxVolume").addEventListener("change", () => saveSettings(settings));
  $("#motionSetting").addEventListener("change", (event) => { settings.motion = event.target.checked; document.body.classList.toggle("reduce-motion", !settings.motion); saveSettings(settings); });
  $("#soundToggle").addEventListener("click", () => { sound.unlock(); sound.toggle(!sound.enabled); $("#soundToggle").classList.toggle("is-muted", !sound.enabled); });
  $("#exportSaveBtn").addEventListener("click", downloadSave);
  $("#importSaveBtn").addEventListener("click", () => $("#importSaveInput").click());
  $("#importSaveInput").addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (file) await restoreSave(file);
    event.target.value = "";
  });

  $("#renamePlayerBtn").addEventListener("click", () => openNameDialog("rename"));
  $("#nameCancelButton").addEventListener("click", () => $("#nameDialog").close("cancel"));
  $("#renameForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (nameDialogMode === "onboarding") player.tutorialCompleted = false;
    if (!setName($("#playerNameInput").value)) return;
    $("#nameDialog").close("confirm");
  });
  $("#nameDialog").addEventListener("close", () => {
    if (nameDialogMode !== "onboarding") return;
    const confirmed = $("#nameDialog").returnValue === "confirm";
    nameDialogMode = "rename";
    if (confirmed) {
      savedBeforeNewJourney = null;
      startTutorial();
      return;
    }
    player = savedBeforeNewJourney || freshPlayer();
    savedBeforeNewJourney = null;
    renderTitleActions();
    showTitle();
  });
}

function initialize() {
  document.querySelectorAll(".version-number").forEach((node) => { node.textContent = VERSION.split(".").slice(0, 2).join("."); });
  sound.setVolumes(settings.bgm, settings.sfx);
  document.body.classList.toggle("reduce-motion", !settings.motion);
  bindEvents();
  renderTitleActions();
  renderHome();
  window.setTimeout(() => {
    $("#loadingScreen").classList.remove("active");
    $("#titleScreen").classList.add("active");
  }, 650);
  if (recovered) window.setTimeout(() => toast("保存データを読み込めませんでした。新しい冒険を開始しました。", true), 850);
}

initialize();
