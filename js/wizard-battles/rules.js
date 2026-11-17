// the rules of wizard battles, taken line for line from the uni version (js/wizard-battles/sketch.js) so the
// game plays exactly the same. the only change is that it doesn't draw anything: a turn goes in, and what
// happened comes out, so duel.js can act it out. the uni version's quirks are kept on purpose (a heal ignores
// the last heal's penalty, berserk lets you pick an element, the enemy still gets its move after it hits 0)
// because the study's data came from that version.
//
// rand is Math.random by default. tests/rules-check.js runs this and the uni sketch side by side with the
// same seeded random numbers and checks every turn comes out the same.
const WizardRules = (() => {
  // what each button does, for the buttons and the how to play pages. the numbers used in a turn are the
  // ones written out in the functions below, same as the original
  const MOVES = {
    Attack: [
      { move: 'Low Attack', tier: 'Minor', amount: 15, unit: 'damage', chance: 100 },
      { move: 'Mid Attack', tier: 'Average', amount: 30, unit: 'damage', chance: 75 },
      { move: 'High Attack', tier: 'High', amount: 45, unit: 'damage', chance: 50 },
    ],
    Defend: [
      { move: 'Low Defend', tier: 'Minor', amount: 10, unit: '% defence', chance: 100 },
      { move: 'Mid Defend', tier: 'Average', amount: 20, unit: '% defence', chance: 60 },
      { move: 'High Defend', tier: 'High', amount: 50, unit: '% defence', chance: 50 },
    ],
    Heal: [
      { move: 'Low Heal', tier: 'Minor', amount: 10, unit: 'health', chance: 75, penalty: 10 },
      { move: 'Mid Heal', tier: 'Average', amount: 25, unit: 'health', chance: 60, penalty: 20 },
      { move: 'High Heal', tier: 'High', amount: 40, unit: 'health', chance: 50, penalty: 30 },
    ],
  };
  const BERSERK = { move: 'Berserk Strike', amount: 60, chance: 35, selfDamage: 10 };
  const ELEMENTS = ['Fire', 'Water', 'Earth', 'Neutral'];

  function newBattle(rand = Math.random) {
    const random = (a) => (Array.isArray(a) ? a[Math.floor(rand() * a.length)] : a === undefined ? rand() : rand() * a);
    const b = {
      player: { health: 100, maxHealth: 100 },
      enemy: { health: 200, maxHealth: 200 },
      accPenalty: 0,
      moveNum: 1,
      moveListPlayer: [],
      moveListEnemy: [],
      playerElementHistory: [],
      // berserk shows up at 15% health or less
      get desperate() { return b.player.health / b.player.maxHealth <= 0.15; },
      // same order as the original's draw(): you lose first, but a win drawn after it wins
      get result() { return b.enemy.health <= 0 ? 'win' : b.player.health <= 0 ? 'lose' : null; },
      turn,
    };

    // moveType: Attack, Defend or Heal. move: 'Low Attack' etc or 'Berserk Strike'. moveElement: Fire,
    // Water, Earth, Neutral, or 'n/a' for defends and heals. the original's moveRegister()
    function turn(moveType, move, moveElement) {
      const t = { moveType, move, moveElement, moveNum: b.moveNum, playerSuccess: false, enemySuccess: false,
        playerDefense: 0, enemyDefense: 0, elementMultiplierPlayer: 1, elementMultiplierEnemy: 1,
        damageEnemy: 0, healPlayer: 0, damagePlayer: 0, healEnemy: 0, selfDamage: 0, moveOutcome: '', enemyMoveOutcome: '' };

      enemyChooseMove(t);

      if (moveElement !== 'n/a') {
        b.playerElementHistory.push(moveElement);
        if (b.playerElementHistory.length > 10) b.playerElementHistory.shift();
      }

      defendLogic(t);
      elementLogic(t);
      attemptMovePlayer(t);
      attemptMoveEnemy(t);

      // the original spells "Nove" for the enemy too, kept so the csv matches
      b.moveListPlayer.push(`Move ${b.moveNum}, ${moveType}, ${move}, ${moveElement}, ${t.moveOutcome}`);
      b.moveListEnemy.push(`Nove ${b.moveNum}, ${t.enemyType}, ${t.enemyMove}, ${t.enemyElement}, ${t.enemyMoveOutcome}`);
      b.moveNum++;
      t.accPenaltyAfter = b.accPenalty;
      return t;
    }

    function elementLogic(t) {
      const beats = { Fire: 'Earth', Water: 'Fire', Earth: 'Water' };
      const mine = t.moveElement;
      const theirs = t.enemyElement;
      // only fire, water and earth change anything, and only against each other
      if (beats[mine] && beats[theirs]) {
        if (beats[mine] === theirs) t.elementMultiplierPlayer = 2;
        if (beats[theirs] === mine) t.elementMultiplierPlayer = 0.5;
        if (beats[theirs] === mine) t.elementMultiplierEnemy = 2;
        if (beats[mine] === theirs) t.elementMultiplierEnemy = 0.5;
      }
    }

    function defendLogic(t) {
      let accuracy = 100;
      if (t.move === 'Low Defend') { t.playerDefense = 0.1; accuracy = 100; }
      if (t.move === 'Mid Defend') { t.playerDefense = 0.2; accuracy = 60; }
      if (t.move === 'High Defend') { t.playerDefense = 0.5; accuracy = 50; }
      t.playerSuccess = random(100) < accuracy - b.accPenalty;
      if (!t.playerSuccess) t.playerDefense = 0;

      // accuracy carries over from the player's like the original, it only matters when the enemy defends
      if (t.enemyMove === 'Low Defend') { t.enemyDefense = 0.1; accuracy = 100; }
      if (t.enemyMove === 'Mid Defend') { t.enemyDefense = 0.2; accuracy = 60; }
      if (t.enemyMove === 'High Defend') { t.enemyDefense = 0.5; accuracy = 50; }
      t.enemySuccess = random(100) < accuracy;
      if (!t.enemySuccess) t.enemyDefense = 0;
    }

    function attemptMovePlayer(t) {
      let damage = 0;
      let heal = 0;
      let accuracy = 100;
      let success = true;

      if (t.moveType === 'Attack') {
        if (t.move === 'Low Attack') { damage = 15; accuracy = 100; }
        else if (t.move === 'Mid Attack') { damage = 30; accuracy = 75; }
        else if (t.move === 'High Attack') { damage = 45; accuracy = 50; }
        else if (t.move === 'Berserk Strike') { damage = 60; accuracy = 35; }

        t.accuracy = accuracy - b.accPenalty;
        success = random(100) < accuracy - b.accPenalty;
        if (success) {
          t.playerSuccess = true;
          damage = Math.round(damage * t.elementMultiplierPlayer);
          damage = Math.round(damage * (1 - t.enemyDefense));
          b.enemy.health = Math.max(0, b.enemy.health - damage);
          t.damageEnemy = damage;
          t.moveOutcome = `Hit for ${damage} damage`;
        } else {
          t.playerSuccess = false;
          t.moveOutcome = 'Missed';
        }
        b.accPenalty = 0;

        if (t.move === 'Berserk Strike' && !success) {
          b.player.health = Math.max(0, b.player.health - 10);
          t.selfDamage = 10;
        }
      } else if (t.moveType === 'Heal') {
        // the penalty is added on and taken off again, so a heal never feels the last heal's penalty
        if (t.move === 'Low Heal') { heal = 10; accuracy = 75 + 10; b.accPenalty = 10; }
        else if (t.move === 'Mid Heal') { heal = 25; accuracy = 60 + 20; b.accPenalty = 20; }
        else if (t.move === 'High Heal') { heal = 40; accuracy = 50 + 30; b.accPenalty = 30; }

        t.accuracy = accuracy - b.accPenalty;
        success = random(100) < accuracy - b.accPenalty;
        if (success) {
          t.playerSuccess = true;
          b.player.health = Math.min(b.player.health + heal, b.player.maxHealth);
          t.healPlayer = heal;
          t.moveOutcome = `Healed for ${heal}`;
        } else {
          t.playerSuccess = false;
          t.moveOutcome = 'Heal failed';
          b.accPenalty = 0;
        }
      } else if (t.moveType === 'Defend') {
        t.moveOutcome = t.playerSuccess ? `Applied ${t.playerDefense * 100}% defense` : 'Defense failed!';
        b.accPenalty = 0;
      }
    }

    function attemptMoveEnemy(t) {
      let damage = 0;
      let heal = 0;
      let accuracy = 100;
      let success = true;

      if (t.enemyType === 'attack') {
        if (t.enemyMove === 'Low Attack') { damage = 20; accuracy = 100; }
        else if (t.enemyMove === 'Mid Attack') { damage = 35; accuracy = 75; }
        else if (t.enemyMove === 'High Attack') { damage = 55; accuracy = 50; }

        success = random(100) < accuracy;
        if (success) {
          t.enemySuccess = true;
          damage = Math.round(damage * t.elementMultiplierEnemy);
          damage = Math.round(damage * (1 - t.playerDefense));
          b.player.health = Math.max(0, b.player.health - damage);
          t.damagePlayer = damage;
          t.enemyMoveOutcome = `Enemy hit for ${damage} damage`;
        } else {
          t.enemySuccess = false;
          t.enemyMoveOutcome = 'Missed';
        }
      } else if (t.enemyType === 'heal') {
        if (t.enemyMove === 'Low Heal') { heal = 20; accuracy = 75; }
        else if (t.enemyMove === 'Mid Heal') { heal = 35; accuracy = 60; }
        else if (t.enemyMove === 'High Heal') { heal = 50; accuracy = 50; }

        success = random(100) < accuracy;
        if (success) {
          t.enemySuccess = true;
          b.enemy.health = Math.min(b.enemy.health + heal, b.enemy.maxHealth);
          t.healEnemy = heal;
          t.enemyMoveOutcome = `Enemy healed for ${heal}`;
        } else {
          t.enemySuccess = false;
          t.enemyMoveOutcome = 'Heal failed';
        }
      } else if (t.enemyType === 'defend') {
        t.enemyMoveOutcome = t.enemySuccess ? `Applied ${t.enemyDefense * 100}% defense` : 'Defense failed!';
      }
    }

    function enemyChooseMove(t) {
      const moveTiers = {
        attack: ['Low Attack', 'Mid Attack', 'High Attack'],
        defend: ['Low Defend', 'Mid Defend', 'High Defend'],
        heal: ['Low Heal', 'Mid Heal', 'High Heal'],
      };
      const enemyHealthPercent = b.enemy.health / b.enemy.maxHealth;
      const playerHealthPercent = b.player.health / b.player.maxHealth;

      // looks at your last five moves
      const recentMoves = b.moveListPlayer.slice(-5);
      const playerLowRiskSpamming = recentMoves.filter((m) => m.includes('Low')).length >= 3;
      const playerHasHealedRecently = recentMoves.filter((m) => m.includes('Heal')).length >= 2;

      let type = 'attack';
      if (enemyHealthPercent < 0.35 && random() < 0.7) type = 'heal';
      else if (playerLowRiskSpamming && random() < 0.5) type = 'defend';
      else if ((playerHealthPercent < 0.25 || playerHasHealedRecently) && random() < 0.6) type = 'attack';
      else type = random() < 0.6 ? 'attack' : 'defend';

      let selectedMove;
      if (type === 'attack') {
        selectedMove = playerHealthPercent < 0.3 && random() < 0.5 ? random(['Mid Attack', 'High Attack']) : random(moveTiers[type]);
      } else if (type === 'defend') {
        selectedMove = enemyHealthPercent < 0.5 ? random(['Mid Defend', 'High Defend']) : random(moveTiers[type]);
      } else {
        selectedMove = enemyHealthPercent < 0.2 ? 'High Heal' : random(moveTiers[type]);
      }

      t.enemyType = type;
      t.enemyMove = selectedMove;
      t.enemyElement = type === 'attack' ? predictLikelyPlayerElement() : 'n/a';
    }

    // counters the element you've used most in your last 10 attacks
    function predictLikelyPlayerElement() {
      if (b.playerElementHistory.length === 0) return random(['Fire', 'Water', 'Earth', 'Neutral']);
      const counts = { Fire: 0, Water: 0, Earth: 0, Neutral: 0 };
      b.playerElementHistory.forEach((el) => counts[el]++);
      let mostCommon = 'Neutral';
      let maxCount = -1;
      for (const el in counts) {
        if (counts[el] > maxCount) { mostCommon = el; maxCount = counts[el]; }
      }
      if (mostCommon === 'Fire') return random(['Water', 'Water', 'Neutral']);
      if (mostCommon === 'Water') return random(['Earth', 'Earth', 'Neutral']);
      if (mostCommon === 'Earth') return random(['Fire', 'Fire', 'Neutral']);
      return random(['Fire', 'Water', 'Earth', 'Neutral']);
    }

    return b;
  }

  // the session as a csv, the same columns as the original's exportGameDataCSV()
  function csv(b, playerID) {
    let out = 'PlayerID,MoveNum,Role,MoveType,MoveTier,Element,Outcome,Value,Success\n';
    for (const [role, list] of [['Player', b.moveListPlayer], ['Enemy', b.moveListEnemy]]) {
      list.forEach((row, i) => {
        const [, moveType, move, element, outcome] = row.split(', ');
        const value = outcome.includes('damage') || outcome.includes('Healed') ? outcome.match(/\d+/)[0] : 0;
        const success = !outcome.includes('fail') && !outcome.includes('Miss');
        out += `${playerID},${i + 1},${role},${moveType},${move},${element},${outcome},${value},${success}\n`;
      });
    }
    return out;
  }

  return { MOVES, BERSERK, ELEMENTS, newBattle, csv };
})();

if (typeof module !== 'undefined') module.exports = WizardRules;
