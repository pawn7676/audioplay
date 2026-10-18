/*  practice.js - a local game, with nothing sent to Lichess.
 *
 *  Everything works as in a real game - mic, parsing,
 *  speech, clock, log - but the opponent plays a random
 *  legal move. Good for trying out phrasings.
 *
 *  dryRun is the practice flag, set by the Practice button
 *  in ui.js. lichess.js sends nothing while it is true.
 */

"use strict";

var dryRun = false;

function dryStart() {
  // Close every connection to Lichess, so no real game can
  // start during practice: it would be played in silence.
  // Turning practice off connects again (ui.js).
  stopEverything();
  clearDialogue();
  clearGame();
  api.gameId = "PRACTICE";
  api.myColor = "w";
  api.pos = new RULES.Position();

  // Ten minutes each, on a clock that runs like a real
  // game's. Nothing ends the game on time, though: a flag
  // just sits at 0:00.
  api.wtime = 600000;
  api.btime = 600000;
  api.clockAt = Date.now();

  log("DRY", "practice mode ON - nothing will be sent to Lichess");
  speakWhenAudioSettled("Practice mode. You are white.");
}

// Stops the mover's clock as their move is played, doing
// what Lichess does for a real game. Called before the move
// is applied, while the mover is still the side to move.
function bankPracticeClock() {
  if (api.gameId !== "PRACTICE" || api.over || !api.pos) return;
  var mover = api.pos.turn;
  var left = remainingMs(mover);
  if (left != null) {
    if (left < 0) left = 0;
    if (mover === "w") api.wtime = left;
    else api.btime = left;
  }
  api.clockAt = Date.now();
}

function dryOpponentReply() {
  // This runs on a delay, so practice may have ended in the
  // meantime, and a real game may have started: then it
  // does nothing.
  if (!dryRun || api.over || api.gameId !== "PRACTICE") return;
  var legal = api.pos.legalMoves();
  if (!legal.length) {
    api.over = true;
    sayResult("Practice game over.");
    return;
  }
  var m = legal[Math.floor(Math.random() * legal.length)];
  var san = api.pos.sanOf(m);
  var uci = api.pos.uciOf(m);
  bankPracticeClock();
  api.pos.apply(m);
  api.moves.push(uci);
  api.lastSan = san;
  api.lastUci = uci;
  log("DRY", "opponent plays random legal move " + uci + " = " + san);
  speak(moveToSpeech(san, uci) + ".");
  if (!api.pos.legalMoves().length) {
    api.over = true;
    sayResult("Practice game over.");
  }
}
