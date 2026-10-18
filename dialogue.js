/*  dialogue.js - decides what to do with what was heard.
 *
 *  Order matters in handleTranscripts: a memo first (so a
 *  memo that mentions a move is never played), then an open
 *  yes/no question, then commands, then a move.
 *
 *  Every path speaks or chimes - silence would sound like
 *  "not heard" - except two on purpose: room talk with no
 *  square in it, and yes/no/cancel with no question open.
 *
 *  Anything that is not one clean legal move gets the same
 *  answer, "Say again." The one exception is a whole move,
 *  heard clearly, that is illegal: "That is not a legal
 *  move." Nothing is read back, explained or suggested.
 */

"use strict";

var confirmAction = null;   // which yes/no question is open

// The yes/no questions: what to send and say for each
// answer. A null action sends nothing.
var CONFIRMS = {
  resign:        { yes: "resign", yesSay: "resigning.",
                   no: null, noSay: "cancelled." },
  offerdraw:     { yes: "draw/yes", yesSay: "draw offered.",
                   no: null, noSay: "cancelled." },
  drawoffer:     { yes: "draw/yes", yesSay: "draw accepted.",
                   no: "draw/no", noSay: "draw declined." },
  takebackoffer: { yes: "takeback/yes", yesSay: "takeback accepted.",
                   no: "takeback/no", noSay: "takeback declined." },

  // the opponent has left; "no" sends nothing and keeps
  // waiting
  claimvictory:  { yes: "claim-victory", yesSay: "claiming the win.",
                   no: null, noSay: "waiting." }
};

// How to answer a yes/no question: "Say yes to accept, no
// to decline." by voice. When typing nothing is added,
// since 1 and 0 go without saying (keys mode shows its own
// question, KEY_QUESTIONS in keys.js).
function answerHint(yesTo, noTo) {
  if (typingMode()) return "";
  return "Say yes to " + yesTo + ", no to " + noTo + ".";
}

var busy = false;   // a move is being sent

// Drops any open question. Called whenever a game starts or
// ends, so a "yes" can never answer a question from a
// different game.
function clearDialogue() {
  confirmAction = null;
  armedUci = null;
}

// The move we just sent by voice or keyboard, waiting to
// be confirmed.
// Lichess confirms it twice - the reply to our request and
// the move coming back on the game stream - in either
// order. Whichever arrives first plays the confirmation and
// clears this, so the other stays quiet. A request that
// gets no reply in time leaves it armed, in case the move
// went through (see acceptMove). Tapped moves and moves
// made on lichess.org are never armed.
var armedUci = null;

// The confirmation for your move, per the Confirm setting.
// If the chime can't play, "okay." is said instead. Keys
// mode is silent, so it gets nothing at all.
function confirmFeedback(san, uci) {
  if (keysMode() || CONFIRM_MODE === "none") return;
  if (CONFIRM_MODE === "voice") {
    speak(moveToSpeech(san, uci) + ".");
    noteIsFor(uci);   // hybrid: the printed copy goes with it
    return;
  }
  // If the chime's clock turns out to be stuck, chimes.js
  // calls the chime off and this says "okay." instead.
  if (playConfirmChime(function () { speak("okay."); })) return;
  speak("okay.");
}

// announce=false is a silent catch-up (after a reconnect):
// it clears the arm but says nothing.
function readBackMine(san, uci, announce) {
  if (!armedUci || armedUci !== uci) return;
  armedUci = null;
  if (!announce) return;

  // checkmate: the result announcement says it better
  if (api.over || /#$/.test(san)) return;
  confirmFeedback(san, uci);
}

// Plays a move: locally in practice, otherwise by sending
// it to Lichess. quiet=true is a tapped move, which gets no
// confirmation - but every error is still spoken. Spoken
// and typed moves are not quiet.
function acceptMove(c, quiet) {
  if (busy) {
    log("DLG", "ignored, busy");
    speak("still sending the last move.");
    return;
  }
  busy = true;
  var uci = api.pos.uciOf(c.m);

  if (dryRun) {
    bankPracticeClock();
    api.pos.apply(c.m);
    api.moves.push(uci);
    api.lastSan = c.san;
    api.lastUci = uci;
    busy = false;
    log("DRY", "you play " + uci + " = " + c.san + " (not sent)");

    if (!quiet) confirmFeedback(c.san, uci);

    setTimeout(function () { dryOpponentReply(); }, 1600);
    return;
  }

  armedUci = quiet ? null : uci;
  postMove(uci).then(function (r) {
    busy = false;
    var ok = r.status === 200 && r.body && r.body.ok !== false && !r.body.error;
    log("PST", uci + " -> " + r.status + " " + JSON.stringify(r.body).slice(0, 120));
    if (ok) {
      readBackMine(c.san, uci, true);
    } else {
      armedUci = null;

      // a refused token is not a bad move
      if (r.status === 401 || r.status === 403) {
        var firstAuthFail = !authGone;
        noteAuthFailure(new Error("move HTTP " + r.status));
        if (!firstAuthFail) speak("still signed out. sign in again.");
        return;
      }
      if (r.status === 429) {
        speak("Lichess asks us to slow down. " +
              "wait a moment, then say the move again.");
        return;
      }
      var msg = (r.body && r.body.error) ? String(r.body.error) : ("error " + r.status);
      speak("Lichess rejected that move. " + msg);
    }
  }).catch(function (e) {
    busy = false;
    log("ERR", "post: " + e.message);

    // No reply in time: the move may still have reached
    // Lichess, so it stays armed, and is confirmed as usual
    // if it comes back on the game stream. A request that
    // failed outright never got there.
    if (e.noReply) {
      speak("No reply from Lichess yet.");
      return;
    }
    armedUci = null;
    speak("Could not reach Lichess.");
  });
}

// Sends the answer to a yes/no question, and only says it
// happened once Lichess has accepted it.
function confirmedAction(path, saidWhenSent) {
  if (dryRun) { speak(saidWhenSent); return; }
  postAction(path).then(function (r) {
    if (r.ok) { speak(saidWhenSent); return; }

    if (r.status === 401 || r.status === 403) {
      var firstFail = !authGone;
      noteAuthFailure(new Error("action HTTP " + r.status));
      if (!firstFail) speak("still signed out. sign in again.");
      return;
    }
    if (r.status === 429) {
      speak("Lichess asks us to slow down. try that again in a moment.");
      return;
    }
    var why = "";
    try { why = String(JSON.parse(r.body).error || ""); } catch (e) {}
    log("ERR", "action " + path + " refused: " + r.status +
        (why ? " " + why : ""));
    speak("Lichess refused that." + (why ? " " + why : ""));
  }).catch(function (e) {
    log("ERR", "action " + path + ": " + e.message);
    speak("could not reach Lichess. that did not go through.");
  });
}

function repeatLast() {
  speak(api.lastSan
          ? "Last move: " + moveToSpeech(api.lastSan, api.lastUci)
          : "No move to repeat yet.");
}

// Everything the mic hears comes here.
function handleTranscripts(rawList) {
  var transcripts = dedupeTranscripts(rawList);
  var primary = transcripts[0] || "";
  var dropped = (rawList ? rawList.length : 0) - transcripts.length;
  log("HRD", transcripts.map(function (t, i) {
    return i + ":" + t;
  }).join(" | ") + (dropped ? "   (" + dropped + " dup)" : ""));

  var memoText = memoTranscript(transcripts);
  if (memoText) {
    log("MEMO", memoText);
    speak("Memo recorded in log.");
    return;
  }

  // Commands come from the mic's first reading only:
  // "resign" or "yes" can end a game, so a lower-ranked
  // guess must never trigger one.
  var cmd = classifyCommand(primary);

  if (confirmAction) {
    var spec = CONFIRMS[confirmAction];

    if (cmd === "yes") {
      confirmAction = null;
      confirmedAction(spec.yes, spec.yesSay);
      return;
    }
    if (cmd === "no" || cmd === "cancel") {
      confirmAction = null;
      if (spec.no) confirmedAction(spec.no, spec.noSay);
      else speak(spec.noSay);
      return;
    }
    speak("Say yes or no.");
    return;
  }

  if (cmd === "repeat") { repeatLast(); return; }
  if (cmd === "time") { speakClockTimes(); return; }
  if (cmd === "flip") { flipClockSides(); return; }

  if (cmd === "resign") { confirmAction = "resign";
    speak("Resign the game?"); return; }
  if (cmd === "draw") { confirmAction = "offerdraw";
    speak("Offer a draw?"); return; }

  // Silent on purpose: "stop" and "forget" turn up in
  // ordinary talk at the board.
  if (cmd === "yes" || cmd === "no" || cmd === "cancel") return;

  // A whole square in any reading means it was aimed at us.
  var moveLike = transcripts.some(hasSquare);

  if (!api.pos || api.over || api.pos.turn !== api.myColor) {
    if (!moveLike) {
      log("HRD", "ignored, not a move: " + primary);
      return;
    }

    if (!api.pos) speak("Not connected to a game yet.");
    else if (api.over) speak("The game is over.");
    else speak(colorWord(api.pos.turn) + " to move.");
    return;
  }

  log("PRS", describeItems(primary));
  var cands = collectMoves(api.pos, transcripts);
  log("CND", cands.map(function (c) { return c.san; }).join(",") ||
      "(none)");

  if (cands.length === 1) {
    acceptMove(cands[0]);
    return;
  }

  // Two different legal moves means the mic is guessing;
  // none means damaged, incomplete or illegal.
  if (moveLike || cands.length > 1) {
    if (!cands.length && namesIllegalMove(api.pos, transcripts)) {
      speak("That is not a legal move.");
      return;
    }
    speak("Say again.");
    return;
  }

  log("HRD", "ignored, not a move: " + primary);
}
