// =========================
// Ultimate Magic Arena
// Ver0.1
// =========================

let playerHP = 100;
let playerMP = 30;

let enemyHP = 100;

let playerPosition = "center";

const positions = [
    "left",
    "center",
    "right"
];

// -------------------------
// レーン選択
// -------------------------

function selectLane(pos){

    playerPosition = pos;

    document.getElementById("playerPos").textContent =
        convertPosition(pos);

}

// -------------------------
// 攻撃
// -------------------------

function attack(){

    const enemyPosition =
        randomPosition();

    document.getElementById("enemyPos").textContent =
        convertPosition(enemyPosition);

    let damage = 0;

    if(playerPosition === enemyPosition){

        damage = 20;

        enemyHP -= damage;

        alert(
            `命中！ ${damage}ダメージ`
        );

    }else{

        alert(
            "攻撃を外した！"
        );

    }

    enemyTurn();

    updateUI();

    checkWinner();

}

// -------------------------
// 移動
// -------------------------

function move(){

    const newPos =
        randomPosition();

    playerPosition = newPos;

    document.getElementById("playerPos").textContent =
        convertPosition(newPos);

    alert(
        `移動した！ (${convertPosition(newPos)})`
    );

    enemyTurn();

    updateUI();

    checkWinner();

}

// -------------------------
// CPUターン
// -------------------------

function enemyTurn(){

    const attackPosition =
        randomPosition();

    if(
        attackPosition ===
        playerPosition
    ){

        const damage = 15;

        playerHP -= damage;

        alert(
            `敵の攻撃命中！ ${damage}ダメージ`
        );

    }else{

        alert(
            "敵の攻撃は外れた！"
        );

    }

}

// -------------------------
// 勝敗判定
// -------------------------

function checkWinner(){

    if(enemyHP <= 0){

        enemyHP = 0;

        updateUI();

        alert(
            "勝利！"
        );

        disableGame();

    }

    if(playerHP <= 0){

        playerHP = 0;

        updateUI();

        alert(
            "敗北..."
        );

        disableGame();

    }

}

// -------------------------
// UI更新
// -------------------------

function updateUI(){

    document.getElementById("playerHP").textContent =
        playerHP;

    document.getElementById("playerMP").textContent =
        playerMP;

    document.getElementById("enemyHP").textContent =
        enemyHP;

}

// -------------------------
// ユーティリティ
// -------------------------

function randomPosition(){

    return positions[
        Math.floor(
            Math.random() *
            positions.length
        )
    ];

}

function convertPosition(pos){

    switch(pos){

        case "left":
            return "左";

        case "center":
            return "中央";

        case "right":
            return "右";

        default:
            return "?";

    }

}

// -------------------------
// ゲーム終了
// -------------------------

function disableGame(){

    const buttons =
        document.querySelectorAll("button");

    buttons.forEach(btn => {

        btn.disabled = true;

    });

}