// =====================================
// Ultimate Magic Arena
// Ver 0.3
// =====================================

// =====================
// Screen
// =====================

const screens =
document.querySelectorAll(".screen");

function showScreen(id){

    screens.forEach(screen=>{

        screen.classList.remove("active");

    });

    document
    .getElementById(id)
    .classList.add("active");

}

// =====================
// Save Data
// =====================

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
    localStorage.getItem(
        "umaSave"
    );

    if(save){

        playerData =
        JSON.parse(save);

    }

}

// =====================
// Magic List
// =====================

const magicList = [

{
name:"Fire Ball",
damage:20,
cost:5,
effect:"🔥"
},

{
name:"Ice Shot",
damage:18,
cost:4,
effect:"❄"
},

{
name:"Thunder Bolt",
damage:25,
cost:8,
effect:"⚡"
},

{
name:"Wind Cutter",
damage:15,
cost:3,
effect:"🌪"
},

{
name:"Stone Spike",
damage:30,
cost:10,
effect:"🪨"
}

];

// =====================
// CPU
// =====================

const cpuData = {

1:{
name:"Goblin",
image:"assets/images/enemy1.png"
},

2:{
name:"Slime King",
image:"assets/images/enemy2.png"
},

3:{
name:"Magic Soldier",
image:"assets/images/enemy3.png"
}

};

// =====================
// Battle Data
// =====================

let currentCpuLevel = 1;

let enemyHP = 100;

let playerPos = "center";

const lanes = [

"left",
"center",
"right"

];

// =====================
// Loading
// =====================

window.addEventListener(
"load",
()=>{

    loadGame();

    updateUI();

    setTimeout(()=>{

        showScreen(
            "titleScreen"
        );

    },2000);

}
);

// =====================
// Title
// =====================

document
.getElementById("startBtn")
.addEventListener(
"click",
()=>{

    showScreen(
        "homeScreen"
    );

}
);

document
.getElementById("backBtn")
.addEventListener(
"click",
()=>{

    showScreen(
        "titleScreen"
    );

}
);

// =====================
// Help
// =====================

const helpModal =
document.getElementById(
"helpModal"
);

document
.getElementById("helpBtn")
.addEventListener(
"click",
()=>{

helpModal.style.display =
"flex";

}
);

document
.getElementById("closeHelpBtn")
.addEventListener(
"click",
()=>{

helpModal.style.display =
"none";

}
);

// =====================
// CPU Select
// =====================

document
.getElementById("cpuBattleBtn")
.addEventListener(
"click",
()=>{

showScreen(
"cpuSelectScreen"
);

}
);

document
.getElementById("cpuBackBtn")
.addEventListener(
"click",
()=>{

showScreen(
"homeScreen"
);

}
);

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

// =====================
// Battle Start
// =====================

function startBattle(){

enemyHP =
100 +
currentCpuLevel * 20;

playerData.hp =
playerData.maxHP;

playerData.mp =
playerData.maxMP;

playerPos =
"center";

document
.getElementById(
"enemyImage"
)
.src =
cpuData[
currentCpuLevel
].image;

document
.getElementById(
"battleLog"
)
.innerHTML =
"Battle Start<br>";

showScreen(
"battleScreen"
);

updateUI();

}

// =====================
// Lane
// =====================

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

}
);

});

// =====================
// Attack
// =====================

document
.getElementById(
"attackBtn"
)
.addEventListener(
"click",
attack
);

function attack(){

const magic =
magicList[
Math.floor(
Math.random() *
magicList.length
)
];

if(
playerData.mp <
magic.cost
){

log(
"MP不足"
);

return;

}

playerData.mp -=
magic.cost;

const enemyPos =
randomLane();

document
.getElementById(
"enemyPos"
)
.textContent =
laneName(enemyPos);

showEffect(
magic.effect
);

if(
enemyPos === playerPos
){

enemyHP -=
magic.damage;

showDamage(
magic.damage
);

log(
magic.name +
" 命中!"
);

}else{

log(
magic.name +
" ミス"
);

}

enemyTurn();

mpRegen();

updateUI();

checkWinner();

}

// =====================
// Move
// =====================

document
.getElementById(
"moveBtn"
)
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

// =====================
// Effect
// =====================

function showEffect(icon){

const layer =
document.getElementById(
"effectLayer"
);

layer.innerHTML =
`
<div class="attackEffect">
${icon}
</div>
`;

setTimeout(()=>{

layer.innerHTML = "";

},600);

}

function showDamage(value){

const popup =
document.getElementById(
"damagePopup"
);

popup.textContent =
"-" + value;

popup.classList.remove(
"damageShow"
);

void popup.offsetWidth;

popup.classList.add(
"damageShow"
);

}

// =====================
// Enemy Turn
// =====================

function enemyTurn(){

const pos =
randomLane();

if(
pos === playerPos
){

const damage =
10 +
currentCpuLevel * 2;

playerData.hp -=
damage;

showDamage(
damage
);

log(
"敵攻撃命中"
);

}else{

log(
"敵攻撃失敗"
);

}

}

// =====================
// EXP
// =====================

function giveRewards(){

const exp =

100 +

currentCpuLevel * 25;

playerData.exp +=
exp;

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

playerData.exp -=
need;

playerData.level++;

playerData.maxHP += 5;
playerData.maxMP += 2;

need =
playerData.level * 100;

}

}

// =====================
// MP
// =====================

function mpRegen(){

playerData.mp =
Math.min(

playerData.maxMP,

playerData.mp + 3

);

}

// =====================
// Winner
// =====================

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

// =====================
// Result
// =====================

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

// =====================
// UI
// =====================

function updateUI(){

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

// =====================
// Log
// =====================

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

// =====================
// Utility
// =====================

function randomLane(){

return lanes[
Math.floor(
Math.random() *
lanes.length
)
];

}

function laneName(lane){

if(lane==="left") return "左";
if(lane==="center") return "中央";
if(lane==="right") return "右";

return "?";

}
