let game = "0";
let startButton;

let enemy1;

//booleans for switching through the 3 main buttons
let atkBtn = false;
let dfnBtn = false;
let heaBtn = false;

//booleans for switching through the 3 attack buttons
let atkBtnLow = false;
let atkBtnMid = false;
let atkBtnHigh = false;

let showElements = false;

let berserkButton;
let berserk = false;

let moveListPlayer = [];
let moveListEnemy = [];
let playerElementHistory = [];

let playerResolvedMove = {};
let enemyResolvedMove = {};
//attack, defend, heal
let moveType;

let playerID
let hasExported = false;

//lowAttack, midAttack, highAttack
//lowDefend, midDefend, highDefend
//lowHeal, midHeal, highHeal
let move;

//fire, water, earth, neutral, none
let moveElement;
let moveOutcome = "";
let enemyMoveOutcome = "";

let enemyMoveType;
let enemyMove;
let enemyElement;

let moveNum = 1;

let damagePlayer = "";
let damageEnemy = "";
let healPlayer = "";
let healEnemy = "";
let playerSuccess = false;
let enemySuccess = false;

let elementMultiplierPlayer = 1;
let elementMultiplierEnemy = 1;

let playerDefense = 0;
let enemyDefense = 0;

let playerDefSuc = false;
let enemyDefSuc = false;

let timer = 0;

let lowmessage = false;
let midmessage = false;
let highmessage = false;

let aiAggression = 1.0; // 1.0 = normal, 1.5 = hard, 0.75 = easy

let accPenalty = 0;

let tooltip;

let slides = [];
let currentSlide = 0;

function preload() {
  for (let i = 1; i <= 13; i++) {
    slides.push(loadImage(`assets/Slide ${i}.png`));
  }
}

function setup() {
  let canvas = createCanvas(800, 600);
  canvas.parent("canvas-wrapper")
  rectMode(CENTER);

  let canvasX = canvas.position().x;
  let canvasY = canvas.position().y;

  playerID = generateID();

  //Start game button - Home screen
  startButton = createButton("Start game");
  startButton.class("hoverColor1");
  startButton.mousePressed(startGame);
  startButton.position(canvasX + 270, canvasY + 300);
  startButton.style("background-color", "#452929");
  startButton.style("border", "none");
  startButton.style("font-size", "50px");

  //How to play button - Home screen
  tutorialButton = createButton("How to play");
  tutorialButton.class("hoverColor1");
  tutorialButton.mousePressed(tutorial);
  tutorialButton.position(canvasX + 288, canvasY + 390);
  tutorialButton.style("background-color", "#452929");
  tutorialButton.style("border", "none");
  tutorialButton.style("font-size", "40px");

  //Attack button - battle screen
  attackButton = createButton("Attack");
  attackButton.class("attackButton");
  attackButton.mousePressed(attackButtons);
  attackButton.position(canvasX + 15, canvasY + 500);
  attackButton.style("background-color", "#B69963");
  attackButton.style("border", "none");
  attackButton.style("font-size", "20px");
  attackButton.style("color", "#362521");

  attackButton.hide();

  //Defend button - battle screen
  defendButton = createButton("Defend");
  defendButton.class("defendButton");
  defendButton.mousePressed(defendButtons);
  defendButton.position(canvasX + 122, canvasY + 500);
  defendButton.style("background-color", "#B69963");
  defendButton.style("border", "none");
  defendButton.style("font-size", "20px");
  defendButton.style("color", "#362521");

  defendButton.hide();

  //Heal button - battle screen
  healButton = createButton("Heal");
  healButton.class("healButton");
  healButton.mousePressed(healButtons);
  healButton.position(canvasX + 230, canvasY + 500);
  healButton.style("background-color", "#B69963");
  healButton.style("border", "none");
  healButton.style("font-size", "20px");
  healButton.style("color", "#362521");

  healButton.hide();

  //MOVE BUTTONS---------------------------------------------------------------------

  //Attack button - Low - battle screen
  attackButtonLow = createButton("");
  attackButtonLow.html(`
    <div style="display: flex; justify-content: space-between; text-align: left;">
    <div>
      <strong style="color: #3D763A">Minor</strong><br>
      <span style="color: ##362521">Attack</span>
    </div>
    <div style="text-align: left;">
      15 damage<br>
      100% accuracy
    </div>
    </div>
    `);
  attackButtonLow.class("hoverColor2");
  attackButtonLow.mousePressed(lowAttack);
  attackButtonLow.position(canvasX + 337, canvasY + 440);
  attackButtonLow.hide();
  attackButtonLow.style("background-color", "#B69963");
  attackButtonLow.style("border", "none");
  attackButtonLow.style("font-size", "14px");
  attackButtonLow.style("padding", "2px");
  attackButtonLow.style("padding-left", "6px");
  attackButtonLow.style("padding-right", "6px");
  attackButtonLow.style("color", "#362521");
  attackButtonLow.style("width", "170px");

  //Attack button - Mid - battle screen
  attackButtonMid = createButton("");
  attackButtonMid.html(`
    <div style="display: flex; justify-content: space-between; text-align: left;">
    <div>
      <strong style="color: #F9EA4D">Average</strong><br>
      <span style="color: #362521">Attack</span>
    </div>
    <div style="text-align: left;">
      30 damage<br>
      75% accuracy
    </div>
    </div>
    `);
  attackButtonMid.class("hoverColor2");
  attackButtonMid.mousePressed(midAttack);
  attackButtonMid.position (canvasX + 337, canvasY + 494);
  attackButtonMid.hide();
  attackButtonMid.style("background-color", "#B69963");
  attackButtonMid.style("border", "none");
  attackButtonMid.style("font-size", "14px");
  attackButtonMid.style("padding", "2px");
  attackButtonMid.style("padding-left", "6px");
  attackButtonMid.style("padding-right", "6px");
  attackButtonMid.style("color", "#362521");
  attackButtonMid.style("width", "170px");

  //Attack button - High - battle screen
  attackButtonHigh = createButton("");
  attackButtonHigh.html(`
    <div style="display: flex; justify-content: space-between; text-align: left;">
    <div>
      <strong style="color: #A93A30">High</strong><br>
      <span style="color: #362521">Attack</span>
    </div>
    <div style="text-align: left;">
      45 damage<br>
      50% accuracy
    </div>
    </div>
    `);
  attackButtonHigh.class("hoverColor2");
  attackButtonHigh.mousePressed(highAttack);
  attackButtonHigh.position(canvasX + 337, canvasY + 548);
  attackButtonHigh.hide();
  attackButtonHigh.style("background-color", "#B69963");
  attackButtonHigh.style("border", "none");
  attackButtonHigh.style("font-size", "14px");
  attackButtonHigh.style("padding", "2px");
  attackButtonHigh.style("padding-left", "6px");
  attackButtonHigh.style("padding-right", "6px");
  attackButtonHigh.style("color", "#362521");
  attackButtonHigh.style("width", "170px");

  //Defend button - Low - battle screen
  defendButtonLow = createButton("");
  defendButtonLow.html(`
    <div style="display: flex; justify-content: space-between; text-align: left;">
    <div>
      <strong style="color: #3D763A">Minor</strong><br>
      <span style="color: ##362521">Defend</span>
    </div>
    <div style="text-align: left;">
      10% defence<br>
      100% accuracy
    </div>
    </div>
    `);
  defendButtonLow.class("hoverColor2");
  defendButtonLow.mousePressed(lowDefend);
  defendButtonLow.position(canvasX + 337, canvasY + 440);
  defendButtonLow.hide();
  defendButtonLow.style("background-color", "#B69963");
  defendButtonLow.style("border", "none");
  defendButtonLow.style("font-size", "14px");
  defendButtonLow.style("padding", "2px");
  defendButtonLow.style("padding-left", "6px");
  defendButtonLow.style("padding-right", "6px");
  defendButtonLow.style("color", "#362521");
  defendButtonLow.style("width", "170px");

  //Defend button - Mid - battle screen
  defendButtonMid = createButton("");
  defendButtonMid.html(`
    <div style="display: flex; justify-content: space-between; text-align: left;">
    <div>
      <strong style="color:#F9EA4D">Average</strong><br>
      <span style="color: ##362521">Defend</span>
    </div>
    <div style="text-align: left;">
      20% defence<br>
      60% accuracy
    </div>
    </div>
    `);
  defendButtonMid.class("hoverColor2");
  defendButtonMid.mousePressed(midDefend);
  defendButtonMid.position(canvasX + 337, canvasY + 494);
  defendButtonMid.hide();
  defendButtonMid.style("background-color", "#B69963");
  defendButtonMid.style("border", "none");
  defendButtonMid.style("font-size", "14px");
  defendButtonMid.style("padding", "2px");
  defendButtonMid.style("padding-left", "6px");
  defendButtonMid.style("padding-right", "6px");
  defendButtonMid.style("color", "#362521");
  defendButtonMid.style("width", "170px");

  //Defend button - High - battle screen
  defendButtonHigh = createButton("");
  defendButtonHigh.html(`
    <div style="display: flex; justify-content: space-between; text-align: left;">
    <div>
      <strong style="color: #A93A30">High</strong><br>
      <span style="color: #362521">Defend</span>
    </div>
    <div style="text-align: left;">
      50% defence<br>
      50% accuracy
    </div>
    </div>
    `);
  defendButtonHigh.class("hoverColor2");
  defendButtonHigh.mousePressed(highDefend);
  defendButtonHigh.position(canvasX + 337, canvasY + 548);
  defendButtonHigh.hide();
  defendButtonHigh.style("background-color", "#B69963");
  defendButtonHigh.style("border", "none");
  defendButtonHigh.style("font-size", "14px");
  defendButtonHigh.style("padding", "2px");
  defendButtonHigh.style("padding-left", "6px");
  defendButtonHigh.style("padding-right", "6px");
  defendButtonHigh.style("color", "#362521");
  defendButtonHigh.style("width", "170px");

  //Heal button - Low - battle screen
  healButtonLow = createButton("");
  healButtonLow.html(`
    <div style="display: flex; justify-content: space-between; text-align: left;">
    <div>
      <strong style="color: #3D763A">Minor</strong><br>
      <span style="color: ##362521">Heal</span>
    </div>
    <div style="text-align: left;">
      10 health<br>
      75% accuracy
    </div>
    </div>
    `);
  healButtonLow.class("hoverColor2");
  healButtonLow.mousePressed(lowHeal);
  healButtonLow.position(canvasX + 337, canvasY + 440);
  healButtonLow.hide();
  healButtonLow.style("background-color", "#B69963");
  healButtonLow.style("border", "none");
  healButtonLow.style("font-size", "14px");
  healButtonLow.style("padding", "2px");
  healButtonLow.style("padding-left", "6px");
  healButtonLow.style("padding-right", "6px");
  healButtonLow.style("color", "#362521");
  healButtonLow.style("width", "170px");

  //Heal button - Mid - battle screen
  healButtonMid = createButton("");
  healButtonMid.html(`
    <div style="display: flex; justify-content: space-between; text-align: left;">
    <div>
      <strong style="color:#F9EA4D">Average</strong><br>
      <span style="color: ##362521">Heal</span>
    </div>
    <div style="text-align: left;">
      25 health<br>
      60% accuracy
    </div>
    </div>
    `);
  healButtonMid.class("hoverColor2");
  healButtonMid.mousePressed(midHeal);
  healButtonMid.position(canvasX + 337, canvasY + 494);
  healButtonMid.hide();
  healButtonMid.style("background-color", "#B69963");
  healButtonMid.style("border", "none");
  healButtonMid.style("font-size", "14px");
  healButtonMid.style("padding", "2px");
  healButtonMid.style("padding-left", "6px");
  healButtonMid.style("padding-right", "6px");
  healButtonMid.style("color", "#362521");
  healButtonMid.style("width", "170px");

  //Heal button - High - battle screen
  healButtonHigh = createButton("");
  healButtonHigh.html(`
    <div style="display: flex; justify-content: space-between; text-align: left;">
    <div>
      <strong style="color: #A93A30">High</strong><br>
      <span style="color: #362521">Heal</span>
    </div>
    <div style="text-align: left;">
      40 health<br>
      50% accuracy
    </div>
    </div>
    `);
  healButtonHigh.class("hoverColor2");
  healButtonHigh.mousePressed(highHeal);
  healButtonHigh.position(canvasX + 337, canvasY + 548);
  healButtonHigh.hide();
  healButtonHigh.style("background-color", "#B69963");
  healButtonHigh.style("border", "none");
  healButtonHigh.style("font-size", "14px");
  healButtonHigh.style("padding", "2px");
  healButtonHigh.style("padding-left", "6px");
  healButtonHigh.style("padding-right", "6px");
  healButtonHigh.style("color", "#362521");
  healButtonHigh.style("width", "170px");

  // Desperation move - Berserk Strike
  berserkButton = createButton(
    "Berserk Strike<br><span style='font-size:14px'>60              damage&nbsp;&nbsp;35% accuracy</span>"
  );
  berserkButton.class("hoverColor2");
  berserkButton.position(canvasX + 113, canvasY + 175);
  berserkButton.style("background-color", "#400000");
  berserkButton.style("border", "none");
  berserkButton.style("font-size", "26px");
  berserkButton.style("color", "#FF4D4D");
  berserkButton.hide();
  berserkButton.mousePressed(berserkStrike);

  //ELEMENT BUTTONS---------------------------------------------------------------------

  //Fire Button - battle screen
  fireButton = createButton("Fire");
  fireButton.class("fireHover");
  fireButton.mousePressed(fireBtn);
  fireButton.position(canvasX + 640, canvasY + 439);
  fireButton.style("padding-top", "15px");
  fireButton.style("padding-bottom", "15px");
  fireButton.style("padding-left", "10px");
  fireButton.style("padding-right", "10px");
  fireButton.style("background-color", "#C93232");
  fireButton.style("color", "#650000");
  fireButton.style("border", "none");
  fireButton.style("font-size", "16px");

  fireButton.hide();

  //Water Button - battle screen
  waterButton = createButton("Water");
  waterButton.class("waterHover");
  waterButton.mousePressed(waterBtn);
  waterButton.position(canvasX + 698, canvasY + 540);
  waterButton.style("padding-top", "15px");
  waterButton.style("padding-bottom", "15px");
  waterButton.style("padding-left", "5px");
  waterButton.style("padding-right", "5px");
  waterButton.style("background-color", "#29A1D4");
  waterButton.style("color", "#053A4E");
  waterButton.style("border", "none");
  waterButton.style("font-size", "14px");

  waterButton.hide();

  //Earth Button - battle screen
  earthButton = createButton("Earth");
  earthButton.class("earthHover");
  earthButton.mousePressed(earthBtn);
  earthButton.position(canvasX + 581, canvasY + 540);
  earthButton.style("padding-top", "15px");
  earthButton.style("padding-bottom", "15px");
  earthButton.style("padding-left", "7px");
  earthButton.style("padding-right", "7px");
  earthButton.style("background-color", "#40A027");
  earthButton.style("color", "#324E05");
  earthButton.style("border", "none");
  earthButton.style("font-size", "14px");

  earthButton.hide();

  //Neutral Button - battle screen
  neutralButton = createButton("Neutral");
  neutralButton.class("neutralHover");
  neutralButton.mousePressed(neutralBtn);
  neutralButton.position(canvasX + 644, canvasY + 504);
  neutralButton.style("padding-top", "15px");
  neutralButton.style("padding-bottom", "15px");
  neutralButton.style("padding-left", "4.5px");
  neutralButton.style("padding-right", "4.5px");
  neutralButton.style("background-color", "#737373");
  neutralButton.style("color", "#000000");
  neutralButton.style("border", "none");
  neutralButton.style("font-size", "10px");

  neutralButton.hide();

  healButtonLow.elt.addEventListener("mouseenter", () => {
    lowmessage = true;
  });

  healButtonLow.elt.addEventListener("mouseleave", () => {
    lowmessage = false;
  });

  healButtonMid.elt.addEventListener("mouseenter", () => {
    midmessage = true;
  });

  healButtonMid.elt.addEventListener("mouseleave", () => {
    midmessage = false;
  });

  healButtonHigh.elt.addEventListener("mouseenter", () => {
    highmessage = true;
  });

  healButtonHigh.elt.addEventListener("mouseleave", () => {
    highmessage = false;
  });
   // Left arrow
  leftArrowButton = createButton("◀");
  leftArrowButton.position(canvasX +50, canvasY + height / 2 - 25);
  leftArrowButton.mousePressed(leftButton);
  leftArrowButton.style("background-color", "#B69963");
  leftArrowButton.style("border", "none");
  leftArrowButton.style("font-size", "30px");
  leftArrowButton.style("color", "#362521");
  leftArrowButton.class("hoverColor2");
  
  leftArrowButton.hide();

  // Right arrow
  rightArrowButton = createButton("▶");
  rightArrowButton.position(canvasX + width - 90, canvasY + height / 2 - 25);
  rightArrowButton.mousePressed(rightButton);
  rightArrowButton.style("background-color", "#B69963");
  rightArrowButton.style("border", "none");
  rightArrowButton.style("font-size", "30px");
  rightArrowButton.style("color", "#362521");
  rightArrowButton.class("hoverColor2");
  
  rightArrowButton.hide();

  // Return home button
  backHomeButton = createButton("⤺ Back");
  backHomeButton.position(canvasX + 20, canvasY + 20);
  backHomeButton.mousePressed(backButton);
  backHomeButton.style("background-color", "#B69963");
  backHomeButton.style("border", "none");
  backHomeButton.style("font-size", "30px");
  backHomeButton.style("color", "#362521");
  backHomeButton.class("hoverColor2");
  
  backHomeButton.hide();

  //class syntax:
  //x,y,size,health,maxHealth,name,color
  enemy1 = new enemy(600, 300, 100, 200, 200, "Enemy", "#FF6B6B");
  player1 = new player(200, 300, 100, 100, 100, "Player", "#98C1FF");
}

function draw() {
  if (game == "0") {
    titleScreen();
  }

  if (game == "0.5") {
    slideShow();
  }

  if (game == "1") {
    //renders the board, makes buttons work properly
    //and removes content of last screen
    showBoard();
    buttonHover();
    buttonFunctionality();
    hideHomeButtons();

    //renders all player information and logic
    enemy1.render();
    enemy1.renderHealth();
    enemy1.renderInfo();

    //renders all enemy information and logic
    player1.render();
    player1.renderHealth();
    player1.renderInfo();

    //displays the text after each turn
    displayVisuals();

    if (player1.playerHealth <= 0) {
      gameOver();
    }

    if (enemy1.enemyHealth <= 0) {
      gameWin();
    }
  }
}

function mousePressed() {}

function keyPressed() {
  //EVERYTHING HERE IS FOR DEBUG PURPOSES
  if (key == "q") {
    console.log(moveListPlayer);
  }

  if (key == "e") {
    console.log(moveListEnemy);
  }

  if (key == "s") {
    console.log("ACCPEN: " + accPenalty);
  }

  if (key == "p") {
    console.log(playerID);
  }
}

function buttonHover() {
  push();
  rectMode(CORNERS);
  if (lowmessage == true) {
    fill(255, 83, 83);
    textSize(27);
    text("Penalty:\n-10% accuracy\nnext turn", 650, 500);
  }

  if (midmessage == true) {
    fill(255, 83, 83);
    textSize(27);
    text("Penalty:\n-20% accuracy\nnext turn", 650, 500);
  }

  if (highmessage == true) {
    fill(255, 83, 83);
    textSize(27);
    text("Penalty:\n-30% accuracy\nnext turn", 650, 500);
  }
  pop();
}

function displayVisuals() {
  if (timer > 0) {
    text(moveOutcome, 200, 380);
    text(enemyMoveOutcome, 600, 380);

    if (moveType == "Attack" && playerSuccess == true) {
      fill(255, 0, 0);
      text("-" + damageEnemy, 490, 300);
    }

    if (moveType == "Heal" && playerSuccess == true) {
      fill(0, 255, 0);
      text("+" + healPlayer, 300, 270);
    }

    if (enemyType == "attack" && enemySuccess == true) {
      fill(255, 0, 0);
      text("-" + damagePlayer, 300, 300);
    }

    if (enemyType == "heal" && enemySuccess == true) {
      fill(0, 255, 0);
      text("+" + healEnemy, 490, 270);
    }

    if (moveType == "Defend" && playerSuccess == true) {
      fill(181, 181, 85, 50);
      ellipse(200, 300, 200, 200);
    }

    if (enemyType == "defend" && enemySuccess == true) {
      fill(181, 181, 85, 50);
      ellipse(600, 300, 200, 200);
    }

    attackButton.hide();
    defendButton.hide();
    healButton.hide();
    berserkButton.hide();
    berserk = false;
    showElements = false;

    timer--;
  }

  if (timer == 0) {
    playerSuccess = false;
    enemySuccess = false;

    if (player1.playerHealth / player1.playerMaxHealth <= 0.15) {
      push();
      fill("#FF4D4D");
      textAlign(CENTER);
      textSize(14);
      textStyle(ITALIC);
      text("Take 10 damage on miss", 200, 165);
      pop();
    }
  }

  if (accPenalty > 0) {
    fill(255, 0, 0);
    text("Accuracy penalty: -" + accPenalty + "%", 270, 40);
  }
}
//hides all the buttons in once function, this
//will be useful when the home screen has several
//buttons
function hideHomeButtons() {
  startButton.hide();
  tutorialButton.hide();
}

//this shows the screen for the main game
function showBoard() {
  background("#5F3E2C");
  noStroke();
  fill("#3A1E16");
  rect(400, 500, 800, 200);
  showBoardButtons();
  backHomeButton.show();
}

function gameOver() {
  hideBoardButtons();
  backHomeButton.hide();
  background("#5F3E2C");
  fill(255);
  textSize(50);
  text("Game over!", 400, 300);
  textSize(30);
  text("Please answer the post-game survey",400,400);
  
    if (!hasExported) {
    exportGameDataCSV();
    hasExported = true;
  }
}

function gameWin() {
  hideBoardButtons();
  background("#5F3E2C");
  fill(255);
  textSize(50);
  text("You win!", 400, 300);
  textSize(30);
  text("Please answer the post-game survey",400,400);
  
    if (!hasExported) {
    exportGameDataCSV();
    hasExported = true;
  }
}

function showBoardButtons() {
  //these STAY this way and don't change
  attackButton.show();
  defendButton.show();
  healButton.show();
}

function hideBoardButtons() {
  attackButton.hide();
  defendButton.hide();
  healButton.hide();
  berserkButton.hide();
  showElements = false;
}

//starts the game when the "Start game" button is pressed
function startGame() {
  game = "1";
}

function tutorial() {
  game = "0.5";
}

//shows all three tiers of attacks when pressed
function attackButtons() {
  atkBtn = true;
  dfnBtn = false;
  heaBtn = false;
  berserk = false;

  moveType = "Attack";
}

function lowAttack() {
  atkBtnLow = true;
  atkBtnMid = false;
  atkBtnHigh = false;

  move = "Low Attack";
}

function midAttack() {
  atkBtnMid = true;
  atkBtnLow = false;
  atkBtnHigh = false;

  move = "Mid Attack";
}

function highAttack() {
  atkBtnHigh = true;
  atkBtnLow = false;
  atkBtnMid = false;

  move = "High Attack";
}

function berserkStrike() {
  moveType = "Attack";
  move = "Berserk Strike";
  moveElement = "Neutral"; // or allow element choice if desired
  berserk = true;
  atkBtn = false;
  dfnBtn = false;
  heaBtn = false;
}

//shows all three tiers of defends when pressed
function defendButtons() {
  dfnBtn = true;
  atkBtn = false;
  heaBtn = false;
  berserk = false;

  moveType = "Defend";
}

function lowDefend() {
  move = "Low Defend";
  moveElement = "n/a";
  moveRegister();
}

function midDefend() {
  move = "Mid Defend";
  moveElement = "n/a";
  moveRegister();
}

function highDefend() {
  move = "High Defend";
  moveElement = "n/a";
  moveRegister();
}

//shows all three tiers of attacks when pressed
function healButtons() {
  heaBtn = true;
  atkBtn = false;
  dfnBtn = false;
  berserk = false;

  moveType = "Heal";
}

function lowHeal() {
  move = "Low Heal";
  moveElement = "n/a";
  moveRegister();
}

function midHeal() {
  move = "Mid Heal";
  moveElement = "n/a";
  moveRegister();
}

function highHeal() {
  move = "High Heal";
  moveElement = "n/a";
  moveRegister();
}

function fireBtn() {
  moveElement = "Fire";
  moveRegister();
}

function waterBtn() {
  moveElement = "Water";
  moveRegister();
}

function earthBtn() {
  moveElement = "Earth";
  moveRegister();
}

function neutralBtn() {
  moveElement = "Neutral";
  moveRegister();
}

//finishes the move, registers the move and tells the computer what
//the user has done
function moveRegister() {
  //player choose their move by pressing buttons

  //enemy chooses their move
  enemyChooseMove();

  if (moveElement !== "n/a") {
    playerElementHistory.push(moveElement);
    if (playerElementHistory.length > 10) {
      playerElementHistory.shift(); // limit memory to last 10 rounds
    }
  }

  //the comparison to the moves happens here
  //calculates defense of both parties first
  defendLogic();
  elementLogic();

  //Player move is applied to the game
  attemptMovePlayer(moveType, move, moveElement);

  //Enemy move is applied to the game
  attemptMoveEnemy(enemyType, enemyMove, enemyElement);

  const moveDataPlayer = `Move ${moveNum}, ${moveType}, ${move}, ${moveElement}, ${moveOutcome}`;
  const moveDataEnemy = `Nove ${moveNum}, ${enemyType}, ${enemyMove}, ${enemyElement}, ${enemyMoveOutcome}`;

  console.log("PLAYER: " + moveDataPlayer);
  console.log("ENEMY: " + moveDataEnemy);
  moveListPlayer.push(moveDataPlayer);
  moveListEnemy.push(moveDataEnemy);

  //remove all button selections
  dfnBtn = false;
  atkBtn = false;
  heaBtn = false;

  atkBtnLow = false;
  atkBtnMid = false;
  atkBtnHigh = false;

  //reset defense and attack boosts each turn
  //so effects only last for one round
  playerDefense = 0;
  enemyDefense = 0;
  elementMultiplierPlayer = 1;
  elementMultiplierEnemy = 1;
  timer = 180;

  moveNum++;
}

function elementLogic() {
  if (moveElement == "Fire") {
    if (enemyElement == "Water") {
      elementMultiplierPlayer = 0.5;
    }
    if (enemyElement == "Earth") {
      elementMultiplierPlayer = 2;
    }
    if (enemyElement == "Fire") {
      elementMultiplierPlayer = 1;
    }
  }

  if (enemyElement == "Fire") {
    if (moveElement == "Water") {
      elementMultiplierEnemy = 0.5;
    }
    if (moveElement == "Earth") {
      elementMultiplierEnemy = 2;
    }
    if (moveElement == "Fire") {
      elementMultiplierEnemy = 1;
    }
  }

  if (moveElement == "Water") {
    if (enemyElement == "Water") {
      elementMultiplierPlayer = 1;
    }
    if (enemyElement == "Earth") {
      elementMultiplierPlayer = 0.5;
    }
    if (enemyElement == "Fire") {
      elementMultiplierPlayer = 2;
    }
  }

  if (enemyElement == "Water") {
    if (moveElement == "Water") {
      elementMultiplierEnemy = 1;
    }
    if (moveElement == "Earth") {
      elementMultiplierEnemy = 0.5;
    }
    if (moveElement == "Fire") {
      elementMultiplierEnemy = 2;
    }
  }

  if (moveElement == "Earth") {
    if (enemyElement == "Water") {
      elementMultiplierPlayer = 2;
    }
    if (enemyElement == "Earth") {
      elementMultiplierPlayer = 1;
    }
    if (enemyElement == "Fire") {
      elementMultiplierPlayer = 0.5;
    }
  }

  if (enemyElement == "Earth") {
    if (moveElement == "Water") {
      elementMultiplierEnemy = 2;
    }
    if (moveElement == "Earth") {
      elementMultiplierEnemy = 1;
    }
    if (moveElement == "Fire") {
      elementMultiplierEnemy = 0.5;
    }
  }
}

function defendLogic() {
  playerDefense = 0;
  playerSuccess = false;
  let accuracy = 100;

  if (moveType !== "Defend") {
    playerDefense = 0;
    let accuracy = 100;
  }

  if (move === "Low Defend") {
    playerDefense = 0.1;
    accuracy = 100;
  }
  if (move === "Mid Defend") {
    playerDefense = 0.2;
    accuracy = 60;
  }
  if (move === "High Defend") {
    playerDefense = 0.5;
    accuracy = 50;
  }

  playerSuccess = random(100) < accuracy - accPenalty;

  if (!playerSuccess) {
    playerDefense = 0; // reset if failed
  }

  enemyDefense = 0;
  enemySuccess = false;

  if (enemyMoveType !== "defend") {
    enemyDefense = 0;
    let accuracy = 100;
  }

  if (enemyMove === "Low Defend") {
    enemyDefense = 0.1;
    accuracy = 100;
  }
  if (enemyMove === "Mid Defend") {
    enemyDefense = 0.2;
    accuracy = 60;
  }
  if (enemyMove === "High Defend") {
    enemyDefense = 0.5;
    accuracy = 50;
  }

  enemySuccess = random(100) < accuracy;

  if (!enemySuccess) {
    enemyDefense = 0;
  }
}

function attemptMovePlayer(moveType, move, moveElement) {
  let damage = 0;
  let heal = 0;
  let accuracy = 100;
  let success = true;

  if (moveType === "Attack") {
    if (move === "Low Attack") {
      damage = 15;
      accuracy = 100;
    } else if (move === "Mid Attack") {
      damage = 30;
      accuracy = 75;
    } else if (move === "High Attack") {
      damage = 45;
      accuracy = 50;
    } else if (move === "Berserk Strike") {
      damage = 60;
      accuracy = 35;
    }

    success = random(100) < accuracy - accPenalty;

    if (success) {
      playerSuccess = true;
      damage = round(damage * elementMultiplierPlayer);
      damage = round(damage * (1 - enemyDefense));
      enemy1.enemyHealth -= damage;
      enemy1.enemyHealth = max(0, enemy1.enemyHealth);
      damageEnemy = damage;
      moveOutcome = `Hit for ${damage} damage`;
      console.log(moveOutcome);
      accPenalty = 0;
    } else {
      playerSuccess = false;
      moveOutcome = `Missed`;
      console.log("Your attack missed!");
      accPenalty = 0;
    }

    if (move === "Berserk Strike" && !success) {
      player1.playerHealth -= 10;
      player1.playerHealth = max(0, player1.playerHealth);
    }
  } else if (moveType === "Heal") {
    if (move === "Low Heal") {
      heal = 10;
      accuracy = 75 + 10; //accuracy+10 to account for penalty
      accPenalty = 10;
    } else if (move === "Mid Heal") {
      heal = 25;
      accuracy = 60 + 20; //accuracy +20 to account for penalty
      accPenalty = 20;
    } else if (move === "High Heal") {
      heal = 40;
      accuracy = 50 + 30; //accuracy +30 to account for penalty
      accPenalty = 30;
    }

    console.log("Accuracy: " + accuracy);
    success = random(100) < accuracy - accPenalty;
    console.log("Accuracy after: " + (accuracy - accPenalty));

    if (success) {
      playerSuccess = true;
      player1.playerHealth += heal;
      player1.playerHealth = min(player1.playerHealth, player1.playerMaxHealth);
      healPlayer = heal;
      moveOutcome = `Healed for ${heal}`;
      console.log(moveOutcome);
    } else {
      playerSuccess = false;
      moveOutcome = "Heal failed";
      console.log("Your heal failed!");
      accPenalty = 0;
    }
  } else if (moveType === "Defend") {
    if (playerSuccess) {
      moveOutcome = `Applied ${playerDefense * 100}% defense`;
      accPenalty = 0;
    } else {
      moveOutcome = "Defense failed!";
      accPenalty = 0;
    }
    console.log(moveOutcome);
  }
}

function attemptMoveEnemy(enemyMoveType, enemyMove, enemyElement) {
  let damage = 0;
  let heal = 0;
  let accuracy = 100;
  let success = true;

  if (enemyMoveType === "attack") {
    if (enemyMove === "Low Attack") {
      damage = 20;
      accuracy = 100;
    } else if (enemyMove === "Mid Attack") {
      damage = 35;
      accuracy = 75;
    } else if (enemyMove === "High Attack") {
      damage = 55;
      accuracy = 50;
    }

    success = random(100) < accuracy;

    if (success) {
      enemySuccess = true;
      damage = round(damage * elementMultiplierEnemy);
      damage = round(damage * (1 - playerDefense));
      player1.playerHealth -= damage;
      damagePlayer = damage;
      player1.playerHealth = max(0, player1.playerHealth);
      enemyMoveOutcome = `Enemy hit for ${damage} damage`;
      console.log(enemyMoveOutcome);
    } else {
      enemySuccess = false;
      enemyMoveOutcome = `Missed`;
      console.log("Enemy attack missed!");
    }
  } else if (enemyMoveType === "heal") {
    if (enemyMove === "Low Heal") {
      heal = 20;
      accuracy = 75;
    } else if (enemyMove === "Mid Heal") {
      heal = 35;
      accuracy = 60;
    } else if (enemyMove === "High Heal") {
      heal = 50;
      accuracy = 50;
    }

    success = random(100) < accuracy;

    if (success) {
      enemySuccess = true;
      enemy1.enemyHealth += heal;
      enemy1.enemyHealth = min(enemy1.enemyHealth, enemy1.enemyMaxHealth);
      healEnemy = heal;
      enemyMoveOutcome = `Enemy healed for ${heal}`;
      console.log(enemyMoveOutcome);
    } else {
      enemySuccess = false;
      enemyMoveOutcome = "Heal failed";
      console.log("Enemy heal failed!");
    }
  } else if (enemyMoveType === "defend") {
    if (enemySuccess) {
      enemyMoveOutcome = `Applied ${enemyDefense * 100}% defense`;
    } else {
      enemyMoveOutcome = "Defense failed!";
    }
    console.log(enemyMoveOutcome);
  }
}

function enemyChooseMove() {
  const moveTiers = {
    attack: ["Low Attack", "Mid Attack", "High Attack"],
    defend: ["Low Defend", "Mid Defend", "High Defend"],
    heal: ["Low Heal", "Mid Heal", "High Heal"],
  };

  // % Health logic
  const enemyHealthPercent = enemy1.enemyHealth / enemy1.enemyMaxHealth;
  const playerHealthPercent = player1.playerHealth / player1.playerMaxHealth;

  // Analyze player's recent strategy
  const recentMoves = moveListPlayer.slice(-5);
  const playerLowRiskSpamming =
    recentMoves.filter((m) => m.includes("Low")).length >= 3;
  const playerHasHealedRecently =
    recentMoves.filter((m) => m.includes("Heal")).length >= 2;

  // AI decision-making logic
  let type = "attack";

  // Heal if health < 35%
  if (enemyHealthPercent < 0.35 && random() < 0.7) {
    type = "heal";
  }

  // Defend if player spams low damage
  else if (playerLowRiskSpamming && random() < 0.5) {
    type = "defend";
  }

  // Pressure player if they're healing often or low HP
  else if (
    (playerHealthPercent < 0.25 || playerHasHealedRecently) &&
    random() < 0.6
  ) {
    type = "attack";
  }

  // Else randomly pick attack/defend, weighted slightly toward attack
  else {
    type = random() < 0.6 ? "attack" : "defend";
  }

  // Tier selection: smarter (avoid low attack spam)
  let tierOptions = moveTiers[type];
  let selectedMove;

  if (type === "attack") {
    // More aggressive if player is low
    if (playerHealthPercent < 0.3 && random() < 0.5) {
      selectedMove = random(["Mid Attack", "High Attack"]);
    } else {
      selectedMove = random(tierOptions);
    }
  } else if (type === "defend") {
    // Mid or High defense if low on health
    selectedMove =
      enemyHealthPercent < 0.5
        ? random(["Mid Defend", "High Defend"])
        : random(tierOptions);
  } else if (type === "heal") {
    // Use strongest heal more often when critically low
    selectedMove = enemyHealthPercent < 0.2 ? "High Heal" : random(tierOptions);
  }

  // Element prediction only for attack
  let selectedElement = "n/a";
  if (type === "attack") {
    selectedElement = predictLikelyPlayerElement(); // Fair prediction (based on past)
  }

  // Apply to enemy
  enemyType = type;
  enemyMove = selectedMove;
  enemyElement = selectedElement;
}

function predictLikelyPlayerElement() {
  if (playerElementHistory.length === 0) {
    return random(["Fire", "Water", "Earth", "Neutral"]);
  }

  // Count occurrences
  const counts = { Fire: 0, Water: 0, Earth: 0, Neutral: 0 };
  playerElementHistory.forEach((el) => counts[el]++);

  // Determine most common
  let mostCommon = "Neutral";
  let maxCount = -1;
  for (let el in counts) {
    if (counts[el] > maxCount) {
      mostCommon = el;
      maxCount = counts[el];
    }
  }

  // Predict counter-element (like rock-paper-scissors psychology)
  if (mostCommon === "Fire") return random(["Water", "Water", "Neutral"]);
  if (mostCommon === "Water") return random(["Earth", "Earth", "Neutral"]);
  if (mostCommon === "Earth") return random(["Fire", "Fire", "Neutral"]);
  return random(["Fire", "Water", "Earth", "Neutral"]);
}

function drawElementArrows() {
  push();
  //water -> fire
  stroke(255);
  strokeWeight(2);
  bezier(696, 461, 729, 476, 734, 491, 719, 530);
  drawArrowHead(694, 461, 60);

  //fire -> earth
  stroke(255);
  strokeWeight(2);
  bezier(629, 460, 596, 475, 591, 490, 606, 529);
  drawArrowHead(602, 529, 110);

  //earth -> water
  stroke(255);
  strokeWeight(2);
  bezier(634, 570, 659, 586, 669, 587, 691, 570);
  drawArrowHead(693, 573, 20);

  pop();
}

function drawArrowHead(x, y, angle) {
  push();
  translate(x, y);
  rotate(angle);
  fill(255);
  noStroke();
  triangle(0, 0, -8, -5, -8, 5);
  pop();
}

//lets the player switch through the buttons freely
function buttonFunctionality() {
  // RESET ELEMENT VISIBILITY FIRST (default)
  showElements = false;

  // ------------------- BUTTON STATE -------------------
  if (atkBtn === true) {
    attackButtonLow.show();
    attackButtonMid.show();
    attackButtonHigh.show();
    attackButton.style("background-color", "#FFB732");
  } else {
    attackButtonLow.hide();
    attackButtonMid.hide();
    attackButtonHigh.hide();
    atkBtnLow = false;
    atkBtnMid = false;
    atkBtnHigh = false;
    attackButton.style("background-color", "#B69963");
  }

  if (dfnBtn === true) {
    defendButtonLow.show();
    defendButtonMid.show();
    defendButtonHigh.show();
    defendButton.style("background-color", "#FFB732");
  } else {
    defendButtonLow.hide();
    defendButtonMid.hide();
    defendButtonHigh.hide();
    defendButton.style("background-color", "#B69963");
  }

  if (heaBtn === true) {
    healButtonLow.show();
    healButtonMid.show();
    healButtonHigh.show();
    healButton.style("background-color", "#FFB732");
  } else {
    healButtonLow.hide();
    healButtonMid.hide();
    healButtonHigh.hide();
    healButton.style("background-color", "#B69963");
  }

  // ------------------- ELEMENT DISPLAY LOGIC -------------------
  const isStandardAttackChosen = atkBtnLow || atkBtnMid || atkBtnHigh;
  const isBerserkSelected = berserk === true;

  // Only show elements if one attack type (low/mid/high or berserk) is selected
  if (isStandardAttackChosen || isBerserkSelected) {
    showElements = true;
  }

  if (showElements === true) {
    drawElementArrows();
    fireButton.show();
    waterButton.show();
    earthButton.show();
    neutralButton.show();
  } else {
    fireButton.hide();
    waterButton.hide();
    earthButton.hide();
    neutralButton.hide();
  }

  // Highlight individual attack buttons
  attackButtonLow.style("background-color", atkBtnLow ? "#FFB732" : "#B69963");
  attackButtonMid.style("background-color", atkBtnMid ? "#FFB732" : "#B69963");
  attackButtonHigh.style(
    "background-color",
    atkBtnHigh ? "#FFB732" : "#B69963"
  );
  berserkButton.style("background-color", berserk ? "#FFB732" : "#400000");

  // ------------------- DESPERATION MOVE VISIBILITY -------------------
  if (player1.playerHealth / player1.playerMaxHealth <= 0.15) {
    berserkButton.show();
  } else {
    berserkButton.hide();
  }
}

function downloadCSV(data, filename) {
  fetch("/save-csv", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: filename,
      content: data,
    }),
  })
    .then((res) => {
      if (res.ok) {
        console.log(`CSV saved to /sessions/${filename}`);
      } else {
        console.error("Failed to save CSV");
      }
    })
    .catch((err) => {
      console.error("Error:", err);
    });
}

function exportGameDataCSV() {
  let csv = "PlayerID,MoveNum,Role,MoveType,MoveTier,Element,Outcome,Value,Success\n";

  for (let i = 0; i < moveListPlayer.length; i++) {
    const [_, moveType, move, element, outcome] = moveListPlayer[i].split(", ");
    const value = outcome.includes("damage") || outcome.includes("Healed") ? outcome.match(/\d+/)[0] : 0;
    const success = !outcome.includes("fail") && !outcome.includes("Miss");
    csv += `${playerID},${i + 1},Player,${moveType},${move},${element},${outcome},${value},${success}\n`;
  }

  for (let i = 0; i < moveListEnemy.length; i++) {
    const [_, moveType, move, element, outcome] = moveListEnemy[i].split(", ");
    const value = outcome.includes("damage") || outcome.includes("Healed") ? outcome.match(/\d+/)[0] : 0;
    const success = !outcome.includes("fail") && !outcome.includes("Miss");
    csv += `${playerID},${i + 1},Enemy,${moveType},${move},${element},${outcome},${value},${success}\n`;
  }

  // NEW: Send to backend instead of downloading
  fetch('/save-csv', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: `session_${playerID}.csv`,
      content: csv
    })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to save CSV on server.');
    }
    console.log('CSV saved successfully on server.');
  })
  .catch(error => {
    console.error('Error saving CSV:', error);
  });
}

//shows the title screen when the game boots
function titleScreen() {
  background("#5F3E2C");

  startButton.show();
  tutorialButton.show();
  
  leftArrowButton.hide();
  rightArrowButton.hide();
  backHomeButton.hide();
  
  attackButton.hide();
  defendButton.hide();
  healButton.hide();
  
  attackButtonLow.hide();
  attackButtonMid.hide();
  attackButtonHigh.hide();
  
  defendButtonLow.hide();
  defendButtonMid.hide();
  defendButtonHigh.hide();
  
  healButtonLow.hide();
  healButtonMid.hide();
  healButtonHigh.hide();
  
  showElements = false;

  textAlign(CENTER, CENTER);
  textSize(96);
  fill(255);
  text("Epic Wizard\nBattle!", 400, 150);
}

function slideShow() {
  background("#5F3E2C");

  startButton.hide();
  tutorialButton.hide();
  leftArrowButton.show();
  rightArrowButton.show();
  backHomeButton.show();

  if (currentSlide == 0){
    leftArrowButton.hide()
  }
  
  
  if (currentSlide == 12){
    rightArrowButton.hide()
  }
  imageMode(CENTER);
  if (slides[currentSlide]) {
    image(slides[currentSlide], width / 2, height / 2,600,450);
  } else {
    fill(255);
    textSize(24);
    textAlign(CENTER, CENTER);
    text("Slide not found.", width / 2, height / 2);
  }
}

function leftButton() {
  if (currentSlide > 0) {
    currentSlide--;
  }
}

function rightButton() {
  if (currentSlide < slides.length - 1) {
    currentSlide++;
  }
}

function backButton(){
  game = "0"
  currentSlide = 0;
}

function generateID() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(floor(random(chars.length)));
  }
    // Update the ID in the webpage
    const idDisplay = document.getElementById("player-id");
    if (idDisplay) {
      idDisplay.textContent = result;
    }
  
    return result;
}

class enemy {
  constructor(
    enemyX,
    enemyY,
    enemySize,
    enemyHealth,
    enemyMaxHealth,
    enemyName,
    enemyColor
  ) {
    this.enemyX = enemyX;
    this.enemyY = enemyY;
    this.enemySize = enemySize;
    this.enemyHealth = enemyHealth;
    this.enemyMaxHealth = enemyMaxHealth;
    this.enemyName = enemyName;
    this.enemyColor = enemyColor;
  }

  render() {
    fill(this.enemyColor);
    rect(this.enemyX, this.enemyY, this.enemySize);
  }

  renderHealth() {
    push();
    rectMode(CORNER);

    fill("#D43434");
    rect(this.enemyX - 63, this.enemyY - 90, 125, 30);

    fill("#34D447");
    rect(
      this.enemyX - 63,
      this.enemyY - 90,
      map(this.enemyHealth, 0, this.enemyMaxHealth, 0, 125),
      30
    );
    pop();
  }

  renderInfo() {
    fill(255);
    textSize(20);
    text(
      this.enemyHealth + "/" + this.enemyMaxHealth,
      this.enemyX,
      this.enemyY - 105
    );
    fill(255);
    textSize(40);
    text(this.enemyName, this.enemyX, this.enemyY - 135);
  }
}

class player {
  constructor(
    playerX,
    playerY,
    playerSize,
    playerHealth,
    playerMaxHealth,
    playerName,
    playerColor
  ) {
    this.playerX = playerX;
    this.playerY = playerY;
    this.playerSize = playerSize;
    this.playerHealth = playerHealth;
    this.playerMaxHealth = playerMaxHealth;
    this.playerName = playerName;
    this.playerColor = playerColor;
  }

  render() {
    fill(this.playerColor);
    rect(this.playerX, this.playerY, this.playerSize);
  }

  renderHealth() {
    push();

    rectMode(CORNER);

    fill("#D43434");
    rect(15, 440, 300, 40);

    fill("#34D447");
    rect(15, 440, map(this.playerHealth, 0, this.playerMaxHealth, 0, 300), 40);

    pop();
  }

  renderInfo() {
    fill(255);
    textSize(24);
    text(
      "Health : " + this.playerHealth + "/" + this.playerMaxHealth,
      103,
      420
    );
  }
}
