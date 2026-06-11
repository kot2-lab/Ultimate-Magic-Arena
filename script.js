// =====================================
// Ultimate Magic Arena
// Ver 0.2
// =====================================

// =======================
// Screen System
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

// =======================
// Save Data
// =======================

let playerData = {

    level:1,
    exp:0,
    rate:1000,

    hp:100,
    maxHP:100,

    mp:30,
    maxMP:30

};

function saveGame(){

    localStorage.setItem(
        "umaSave",
        JSON.stringify(playerData)
    );

}

function loadGame(){

    const save =
    localStorage.getItem("umaSave");

    if(save){

        playerData =
        JSON.parse(save);

    }

}

// =======================
// Battle Data
// =======================

let enemyHP = 100;

let playerPos = "center";

let currentCpuLevel = 1;

const lanes = [
    "left",
    "center",
    "right"
];

// =======================
// Loading
// =======================

window.addEventListener("load",()=>{

    loadGame();

    updateUI();

    setTimeout(()=>{

        showScreen(
            "titleScreen"
        );

    },2000);

});

// =======================
// Title
// =======================

document
.getElementById("startBtn")
.addEventListener("click",()=>{

    showScreen(
        "homeScreen"
    );

});

document
.getElementById("backBtn")
.addEventListener("click",()=>{

    showScreen(
        "titleScreen"
    );

});

// =======================
// Help
// =======================

const helpModal =
document.getElementById(
    "helpModal"
);

document
.getElementById("helpBtn")
.addEventListener("click",()=>{

    helpModal.style.display =
    "flex";

});

document
.getElementById(
    "closeHelpBtn"
)
.addEventListener("click",()=>{

    helpModal.style.display =
    "none";

});

// =======================
// CPU Select
// =======================

document
.getElementById(
    "cpuBattleBtn"
)
.addEventListener("click",()=>{

    showScreen(
        "cpuSelectScreen"
    );

});

document
.getElementById(
    "cpuBackBtn"
)
.addEventListener("click",()=>{

    showScreen(
        "homeScreen"
    );

});

document
.querySelectorAll(".cpuBtn")
.forEach(button=>{

    button.addEventListener(
        "click",
        ()=>{

            currentCpuLevel =
            Number(
                button.dataset.level
            );

            startBattle();

        }
    );

});

// =======================
// Start Battle
// =======================

function startBattle(){

    enemyHP =
    100 +
    (
        currentCpuLevel * 20
    );

    playerData.hp =
    playerData.maxHP;

    playerData.mp =
    playerData.maxMP;

    playerPos =
    "center";

    document
    .getElementById("battleLog")
    .innerHTML =
    "Battle Start<br>";

    updateUI();

    showScreen(
        "battleScreen"
    );

}

// =======================
// Lane Buttons
// =======================

document
.querySelectorAll(
    "[data-lane]"
)
.forEach(button=>{

    button.addEventListener(
        "click",
        ()=>{

            playerPos =
            button.dataset.lane;

            document
            .getElementById(
                "playerPos"
            )
            .textContent =
            laneName(playerPos);

            log(
                "移動先を変更"
            );

        }
    );

});

// =======================
// Attack
// =======================

document
.getElementById("attackBtn")
.addEventListener(
    "click",
    attack
);

function attack(){

    const enemyPos =
    randomLane();

    document
    .getElementById(
        "enemyPos"
    )
    .textContent =
    laneName(enemyPos);

    if(playerPos === enemyPos){

        enemyHP -= 20;

        log(
            "攻撃命中！20ダメージ"
        );

    }else{

        log(
            "攻撃失敗"
        );

    }

    enemyTurn();

    mpRegen();

    updateUI();

    checkWinner();

}

// =======================
// Move
// =======================

document
.getElementById("moveBtn")
.addEventListener(
    "click",
    move
);

function move(){

    playerPos =
    randomLane();

    document
    .getElementById(
        "playerPos"
    )
    .textContent =
    laneName(playerPos);

    log(
        "移動した"
    );

    enemyTurn();

    mpRegen();

    updateUI();

    checkWinner();

}

// =======================
// MP Regen
// =======================

function mpRegen(){

    const regen =
    5 +
    Math.floor(
        playerData.level / 50
    );

    playerData.mp =
    Math.min(
        playerData.maxMP,
        playerData.mp + regen
    );

}

// =======================
// Enemy Turn
// =======================

function enemyTurn(){

    const attackPos =
    randomLane();

    if(
        attackPos === playerPos
    ){

        playerData.hp -=
        10 +
        currentCpuLevel * 2;

        log(
            "敵の攻撃命中"
        );

    }else{

        log(
            "敵の攻撃失敗"
        );

    }

}

// =======================
// EXP
// =======================

function giveRewards(){

    let exp =

        randomInt(10,30)

        +

        randomInt(100,120);

    playerData.exp += exp;

    document
    .getElementById(
        "rewardArea"
    )
    .textContent =
    "EXP +" + exp;

    levelCheck();

    saveGame();

}

function levelCheck(){

    let need =
    playerData.level * 100;

    while(
        playerData.exp >= need
    ){

        playerData.exp -= need;

        playerData.level++;

        playerData.maxHP += 5;

        playerData.maxMP += 2;

        log(
            "Level Up!"
        );

        need =
        playerData.level * 100;

    }

}

// =======================
// Winner
// =======================

function checkWinner(){

    if(enemyHP <= 0){

        giveRewards();

        document
        .getElementById(
            "resultText"
        )
        .textContent =
        "Victory";

        showScreen(
            "resultScreen"
        );

        updateUI();

    }

    if(playerData.hp <= 0){

        document
        .getElementById(
            "resultText"
        )
        .textContent =
        "Defeat";

        showScreen(
            "resultScreen"
        );

    }

}

// =======================
// Result
// =======================

document
.getElementById(
    "returnHomeBtn"
)
.addEventListener(
    "click",
    ()=>{

        saveGame();

        updateUI();

        showScreen(
            "homeScreen"
        );

    }
);

// =======================
// UI
// =======================

function updateUI(){

    document
    .getElementById(
        "playerHP"
    )
    .textContent =
    playerData.hp;

    document
    .getElementById(
        "playerMP"
    )
    .textContent =
    playerData.mp;

    document
    .getElementById(
        "playerMaxHP"
    )
    .textContent =
    playerData.maxHP;

    document
    .getElementById(
        "playerMaxMP"
    )
    .textContent =
    playerData.maxMP;

    document
    .getElementById(
        "enemyHP"
    )
    .textContent =
    enemyHP;

    document
    .getElementById(
        "playerLevel"
    )
    .textContent =
    playerData.level;

    document
    .getElementById(
        "playerEXP"
    )
    .textContent =
    playerData.exp;

    document
    .getElementById(
        "playerRate"
    )
    .textContent =
    playerData.rate;

    document
    .getElementById(
        "playerHPFill"
    )
    .style.width =
    (
        playerData.hp /
        playerData.maxHP
    ) * 100 + "%";

    document
    .getElementById(
        "playerMPFill"
    )
    .style.width =
    (
        playerData.mp /
        playerData.maxMP
    ) * 100 + "%";

}

// =======================
// Log
// =======================

function log(text){

    document
    .getElementById(
        "battleLog"
    )
    .innerHTML =
    text +
    "<br>" +
    document
    .getElementById(
        "battleLog"
    )
    .innerHTML;

}

// =======================
// Utility
// =======================

function randomLane(){

    return lanes[
        Math.floor(
            Math.random() *
            lanes.length
        )
    ];

}

function randomInt(
    min,
    max
){

    return Math.floor(
        Math.random() *
        (max - min + 1)
    ) + min;

}

function laneName(lane){

    if(lane==="left"){
        return "左";
    }

    if(lane==="center"){
        return "中央";
    }

    if(lane==="right"){
        return "右";
    }

    return "?";

}
