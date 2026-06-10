// =======================
// Ultimate Magic Arena
// Core System Ver0.1
// =======================

const screens = document.querySelectorAll(".screen");

function showScreen(id){

    screens.forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById(id)
        .classList.add("active");

}

// -----------------------
// 初期ロード
// -----------------------

window.addEventListener("load", () => {

    setTimeout(() => {

        showScreen("titleScreen");

    }, 2000);

});

// -----------------------
// タイトル画面
// -----------------------

document
.getElementById("startBtn")
.addEventListener("click", () => {

    showScreen("homeScreen");

});

document
.getElementById("backBtn")
.addEventListener("click", () => {

    showScreen("titleScreen");

});

// -----------------------
// HELP
// -----------------------

const helpModal =
document.getElementById("helpModal");

document
.getElementById("helpBtn")
.addEventListener("click", () => {

    helpModal.style.display = "flex";

});

document
.getElementById("closeHelpBtn")
.addEventListener("click", () => {

    helpModal.style.display = "none";

});

// -----------------------
// 戦闘開始
// -----------------------

document
.getElementById("cpuBattleBtn")
.addEventListener("click", () => {

    showScreen("battleScreen");

});

// -----------------------
// リザルト→ホーム
// -----------------------

document
.getElementById("returnHomeBtn")
.addEventListener("click", () => {

    showScreen("homeScreen");

});

// =======================
// 戦闘システム
// =======================

let playerHP = 100;
let playerMP = 30;

let enemyHP = 100;

let playerPos = "center";

const lanes = [
    "left",
    "center",
    "right"
];

// -----------------------
// レーン選択
// -----------------------

document
.querySelectorAll("[data-lane]")
.forEach(button => {

    button.addEventListener("click", () => {

        playerPos =
        button.dataset.lane;

        document
        .getElementById("playerPos")
        .textContent =
        laneName(playerPos);

        log(
            "移動先を " +
            laneName(playerPos) +
            " に変更"
        );

    });

});

// -----------------------
// 攻撃
// -----------------------

document
.getElementById("attackBtn")
.addEventListener("click", attack);

function attack(){

    const enemyPos =
    randomLane();

    document
    .getElementById("enemyPos")
    .textContent =
    laneName(enemyPos);

    if(playerPos === enemyPos){

        enemyHP -= 20;

        log(
            "攻撃命中！20ダメージ"
        );

    }else{

        log(
            "攻撃を外した"
        );

    }

    enemyTurn();

    updateUI();

    checkWinner();

}

// -----------------------
// 移動
// -----------------------

document
.getElementById("moveBtn")
.addEventListener("click", move);

function move(){

    playerPos =
    randomLane();

    document
    .getElementById("playerPos")
    .textContent =
    laneName(playerPos);

    log(
        "移動した"
    );

    enemyTurn();

    updateUI();

    checkWinner();

}

// -----------------------
// CPU
// -----------------------

function enemyTurn(){

    const attackPos =
    randomLane();

    if(attackPos === playerPos){

        playerHP -= 15;

        log(
            "敵の攻撃命中！15ダメージ"
        );

    }else{

        log(
            "敵の攻撃は外れた"
        );

    }

}

// -----------------------
// UI
// -----------------------

function updateUI(){

    document
    .getElementById("playerHP")
    .textContent =
    playerHP;

    document
    .getElementById("playerMP")
    .textContent =
    playerMP;

    document
    .getElementById("enemyHP")
    .textContent =
    enemyHP;

}

// -----------------------
// 勝敗
// -----------------------

function checkWinner(){

    if(enemyHP <= 0){

        document
        .getElementById("resultText")
        .textContent =
        "Victory";

        showScreen("resultScreen");

    }

    if(playerHP <= 0){

        document
        .getElementById("resultText")
        .textContent =
        "Defeat";

        showScreen("resultScreen");

    }

}

// -----------------------
// ログ
// -----------------------

function log(text){

    document
    .getElementById("battleLog")
    .innerHTML =
    text + "<br>" +
    document
    .getElementById("battleLog")
    .innerHTML;

}

// -----------------------
// 補助
// -----------------------

function randomLane(){

    return lanes[
        Math.floor(
            Math.random() *
            lanes.length
        )
    ];

}

function laneName(lane){

    if(lane === "left") return "左";
    if(lane === "center") return "中央";
    if(lane === "right") return "右";

    return "?";

}
