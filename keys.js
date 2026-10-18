/*  keys.js - moves typed on a keyboard: hybrid mode and
 *  keys mode.
 *
 *  Both are picked under Play by in Settings, and in both
 *  the mic stays off. They differ in what comes back:
 *    hybrid  everything is spoken or chimed, as in voice
 *            mode. Beside the board: what you are typing,
 *            and under it, in print, what was last said
 *            (showSpoken). Clock View shows just the
 *            clocks.
 *    keys    ("Keyboard") silent. What the page would have
 *            said comes here from speak() in voice.js and
 *            is shown under your clock, and along the
 *            bottom of Clock View.
 *
 *  Every entry ends with Enter:
 *    e2e4 or 5254     a move, with each file a letter or
 *                     a number (a=1 to h=8); they can be
 *                     mixed, as in h283
 *    e7e8n or 57584   a promotion to a knight: q r b n,
 *                     or 1 2 3 4. Without it, a queen.
 *                     A fifth key is only taken when the
 *                     four typed are a promotion.
 *    91               resign (asks first)
 *    92               offer a draw (asks first)
 *    93               repeat the last move
 *    94               the time left for each player
 *    95               flip Clock View's sides
 *    1 or 0           yes or no to the open question
 *  Backspace deletes a character, Escape clears. A key
 *  that can't go in the next place (a piece letter in a
 *  square, a letter as a rank) is ignored.
 *
 *  An entry that can't be played is cleared, so the next
 *  one starts from scratch. In hybrid mode the reason is
 *  spoken, without reading the entry back ("That is not a
 *  legal move."), and the refused entry and the reason
 *  stay in red beside the board until the next key. In
 *  keys mode what was typed and why it was refused show in
 *  red until the next key. Keys typed into a text box
 *  (Custom time, a Lichess name) are left to the box.
 *
 *  The look is in keys.css; the boxes filled in here are in
 *  audioplay.html (#keysPage beside the board, #keysClock
 *  in Clock View). ui.js shows and hides them.
 */

"use strict";

var KEY_FILES = "abcdefgh";
var KEY_PROMO_DIGIT = { 1: "q", 2: "r", 3: "b", 4: "n" };

// The open yes/no question, as shown in keys mode. These
// take the place of the spoken questions ("Say yes to
// accept...").
var KEY_QUESTIONS = {
  resign:        "Resign?  1 yes, 0 no",
  offerdraw:     "Offer a draw?  1 yes, 0 no",
  drawoffer:     "Draw offered.  1 accept, 0 decline",
  takebackoffer: "Takeback asked.  1 accept, 0 decline",
  claimvictory:  "Opponent left.  1 claim the win, 0 wait"
};

// The open yes/no question in hybrid mode, in the words it
// was spoken in (the first two are spoken by keys.js, the
// rest by lichess.js). How to answer (1 or 0) goes without
// saying.
function spokenQuestion(q) {
  var them = sentenceCase(colorWord(api.myColor === "w" ? "b" : "w"));
  return {
    resign:        "Resign the game?",
    offerdraw:     "Offer a draw?",
    drawoffer:     them + " offers a draw.",
    takebackoffer: them + " asks to take back a move.",
    claimvictory:  "You can claim the win."
  }[q] || "";
}

var keyEntry = "";   // what has been typed so far
var keyBad = false;  // the message is a refusal (red)

// Hybrid mode only: the entry just refused, shown in red
// in the entry box until the next key (the reason is in
// keyNote, under it).
var keyRefused = "";

// The latest message, and the game and move count it was
// shown at. It stays until the next move by either side,
// a new message, or a new game. keyNoteEarly: the message
// is about your own move, which Lichess may not have sent
// back yet, so it also shows one move early (noteIsFor).
var keyNote = "", keyNoteGame = null, keyNoteMoves = -1;
var keyNoteEarly = false;

var keysEntryPage = null, keysNotePage = null;
var keysMoveLeft = null, keysMoveRight = null;
var keysEntryLeft = null, keysEntryRight = null;
var keysNoteClock = null;

// ---- messages ----

function setNote(text) {
  keyNote = text;
  keyNoteGame = api.gameId;
  keyNoteMoves = api.moves.length;
  keyNoteEarly = false;
}

// Everything speak() says in hybrid mode, also printed.
// A new message takes the place of a refusal's reason (the
// refused entry stays red until the next key).
function showSpoken(text) {
  keyBad = false;
  setNote(sentenceCase(text));
  keysRender();
}

// Your move read back (Confirm: Voice): the message belongs
// with that move. If Lichess hasn't sent the move back yet,
// it is counted in now, so the message isn't wiped the
// moment the move arrives.
function noteIsFor(uci) {
  if (!hybridMode() || !keyNote) return;
  if (api.moves[api.moves.length - 1] === uci) return;
  keyNoteMoves = api.moves.length + 1;
  keyNoteEarly = true;
}

// Whether the latest message still belongs to this game
// and this move.
function noteCurrent() {
  if (!keyNote || keyNoteGame !== api.gameId) return false;
  var n = api.moves.length;
  return n === keyNoteMoves || (keyNoteEarly && n === keyNoteMoves - 1);
}

// Everything speak() is given in keys mode. The opponent's
// move is left out: the move lines under the clocks show
// it. (speak() is handed exactly moveToSpeech() of the
// move just played, plus a full stop.)
function showMessage(text) {
  if (api.lastSan &&
      text === moveToSpeech(api.lastSan, api.lastUci) + ".") return;
  log("MSG", text);
  setNote(sentenceCase(text));
  keysRender();
}

// ---- reading an entry ----

// A file typed as a letter, or as a number 1-8.
function typedFile(c) {
  return /[1-8]/.test(c) ? KEY_FILES[c - 1] : c;
}

// "e2e4", "5254", "h283" or "e7e8n" as {uci: "e2e4",
// promo: "n" or null}, or null if it is not a move's shape.
// Each place has one job (file, rank, file, rank, piece),
// so letters and numbers can mix without any doubt.
function readTypedMove(e) {
  var m = /^([a-h1-8])([1-8])([a-h1-8])([1-8])([qrbn1-4]?)$/.exec(e);
  if (!m) return null;
  return { uci: typedFile(m[1]) + m[2] + typedFile(m[3]) + m[4],
           promo: KEY_PROMO_DIGIT[m[5]] || m[5] || null };
}

// Clears the entry and says why it was refused. why is
// what keys mode shows, after what was typed, in red;
// said, if given, is what hybrid mode uses instead of
// why. Hybrid never reads the entry back, since that only
// costs time: it speaks the reason (which also prints it),
// and keeps the refused entry in the entry box with the
// reason under it, both in red, for a glance.
function refuse(why, said) {
  log("KEY", "refused " + keyEntry + ": " + why);
  if (hybridMode()) {
    keyRefused = keyEntry;
    keyEntry = "";
    speak(said || why);
    keyBad = true;   // after speak: showSpoken clears it
    keysRender();
    return;
  }
  setNote(keyEntry + ": " + why);
  keyBad = true;
  keyEntry = "";
  keysRender();
}

// A refusal's reason goes with it.
function clearEntry() {
  keyEntry = "";
  if (keyBad) keyNote = "";
  keyBad = false;
  keyRefused = "";
  keysRender();
}

// The next key takes a refusal away.
function editEntry(text) {
  keyEntry = text;
  keyRefused = "";
  if (keyBad) {
    keyBad = false;
    keyNote = "";
  }
  keysRender();
}

// The same answers as "yes" and "no" in dialogue.js. speak()
// says, or shows, what happened.
function answerQuestion(yes) {
  var spec = CONFIRMS[confirmAction];
  confirmAction = null;
  if (yes) confirmedAction(spec.yes, spec.yesSay);
  else if (spec.no) confirmedAction(spec.no, spec.noSay);
  else speak(spec.noSay);
}

// 93 in keys mode: the move as typed (e2e4), since the
// screen shows moves that way. Elsewhere it is spoken, as
// "repeat" is in voice mode.
function repeatTyped() {
  if (!keysMode()) { repeatLast(); return; }
  var mark = /[+#]$/.exec(api.lastSan || "");
  showMessage(api.lastUci
    ? "Last move: " + api.lastUci + (mark ? mark[0] : "")
    : "No move to repeat yet.");
}

// Enter. An open question takes only 1 or 0, as voice
// takes only yes or no.
function submitEntry() {
  var e = keyEntry;
  if (!e) return;
  log("KEY", "entered " + e);

  if (confirmAction) {
    if (e !== "1" && e !== "0") return refuse("1 or 0 first.", "Enter 1 or 0.");
    answerQuestion(e === "1");
    clearEntry();
    return;
  }
  if (e === "1" || e === "0") return refuse("No question to answer.");

  // the commands that need no game
  if (e === "93") { clearEntry(); repeatTyped(); return; }
  if (e === "94") { clearEntry(); speakClockTimes(); return; }
  if (e === "95") { clearEntry(); flipClockSides(); return; }

  if (e === "91" || e === "92") {
    if (!api.pos) return refuse("Not connected to a game yet.");
    if (api.over) return refuse("The game is over.");
    confirmAction = e === "91" ? "resign" : "offerdraw";
    clearEntry();

    // keys mode shows the question (KEY_QUESTIONS)
    if (hybridMode()) speak(spokenQuestion(confirmAction));
    return;
  }

  var mv = readTypedMove(e);
  if (!mv) return refuse("Not a move.", "Enter again.");
  if (!api.pos) return refuse("Not connected to a game yet.");
  if (api.over) return refuse("The game is over.");
  if (api.pos.turn !== api.myColor) {
    return refuse(sentenceCase(colorWord(api.pos.turn)) + " to move.");
  }

  // A pawn reaching the last rank becomes a queen unless
  // another piece was typed. findUci also takes castling
  // typed as king-takes-rook (e1h1).
  var legal = api.pos.legalMoves();
  var m = api.pos.findUci(mv.uci + (mv.promo || ""), legal);
  if (!m && !mv.promo) m = api.pos.findUci(mv.uci + "q", legal);
  if (!m) return refuse("Not a legal move.", "That is not a legal move.");

  // Played like a spoken move: confirmed by the Confirm
  // setting in hybrid mode (keys mode's confirmation is
  // silent, see confirmFeedback), and errors from Lichess
  // are spoken or shown.
  clearEntry();
  acceptMove({ m: m, san: api.pos.sanOf(m, legal) }, false);
}

// ---- the keyboard ----

// Entries are four keys long. A fifth is only taken when
// the four typed are your pawn reaching the last rank, on
// your turn, and it names a piece: q r b n, or 1 2 3 4.
// So a stray fifth key can't spoil a good move.
function takesFifthKey(c) {
  if (!/[qrbn1-4]/.test(c)) return false;
  var mv = readTypedMove(keyEntry);
  if (!mv || !api.pos || api.over || api.pos.turn !== api.myColor) {
    return false;
  }
  return !!api.pos.findUci(mv.uci + "q");
}

// Whether a key fits the next place in the entry. Keys
// that don't are ignored, so a slip can't spoil an entry.
//   1st  a file (a-h or 1-8), 9 (a command) or 0 (no)
//   2nd  a rank (1-8); after 9 only 1 to 5; after 0
//        nothing
//   3rd  a file (a-h or 1-8); after 91 to 95 nothing
//   4th  a rank (1-8)
//   5th  a piece, only for a promotion (takesFifthKey)
function fitsNext(c) {
  var n = keyEntry.length, first = keyEntry[0];
  if (n === 0) return /[a-h0-9]/.test(c);
  if (first === "0") return false;
  if (first === "9") return n === 1 && /[1-5]/.test(c);
  if (n === 1 || n === 3) return /[1-8]/.test(c);
  if (n === 2) return /[a-h1-8]/.test(c);
  if (n === 4) return takesFifthKey(c);
  return false;
}

function onKeyDown(e) {
  if (!typingMode()) return;

  // nothing is typed while the Settings menu is open
  if (settingsMenuOpen()) return;

  // Cmd-R and the like stay the browser's
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  var t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

  // Each key the game uses is kept from the page, so
  // Enter never presses a button that has the focus.
  var k = e.key;
  if (k === "Enter") {
    e.preventDefault();
    if (!e.repeat) submitEntry();
    return;
  }
  if (k === "Backspace") {
    e.preventDefault();
    editEntry(keyEntry.slice(0, -1));
    return;
  }
  if (k === "Escape") {
    e.preventDefault();
    editEntry("");
    return;
  }
  if (k.length !== 1) return;
  var c = k.toLowerCase();
  if (!/[a-h0-9qrn]/.test(c)) return;
  e.preventDefault();
  if (fitsNext(c)) editEntry(keyEntry + c);
}

// ---- drawing ----

// Writes only when the text changed, since this runs on
// every repaint tick.
function setKeyText(box, text) {
  if (box && box.textContent !== text) box.textContent = text;
}

// What has been typed, with blanks for the rest of a move.
// In hybrid mode, a refused entry until the next key.
function entryText() {
  var e = keyRefused || keyEntry;
  return e + "____".slice(e.length);
}

// A refusal wins, until the next key; then the open
// question, until it is answered; otherwise the latest
// message, if it still belongs to this game and this move.
function noteText() {
  if (keyBad && keyNote) return keyNote;
  if (confirmAction) {
    var q = hybridMode() ? spokenQuestion(confirmAction)
                         : KEY_QUESTIONS[confirmAction];
    if (q) return q;
  }
  return noteCurrent() ? keyNote : "";
}

// Each side's latest move. The last move in the list is by
// the side not to move, the one before it by the side to
// move. The latest gets + or # from its SAN.
function lastMoves() {
  var out = { w: "", b: "" };
  var n = api.moves ? api.moves.length : 0;
  if (!api.pos || !n) return out;
  var toMove = api.pos.turn;
  var moved = toMove === "w" ? "b" : "w";
  var mark = /[+#]$/.exec(api.lastSan || "");
  out[moved] = api.moves[n - 1] + (mark ? mark[0] : "");
  if (n > 1) out[toMove] = api.moves[n - 2];
  return out;
}

// Beside the board: your entry and the message. In Clock
// View: each side's last move under its clock, your entry
// under yours, and the message along the bottom. Hybrid
// mode shows only the entry and the message beside the
// board: ui.js hides the Clock View lines.
function keysRender() {
  if (!keysEntryPage || !typingMode()) return;
  var entry = entryText(), note = noteText();
  var mine = api.myColor || "w";
  var theirs = mine === "w" ? "b" : "w";
  var last = lastMoves();
  var left = PLAYER_ON_LEFT_OF_CLOCK;
  var myEntry = left ? keysEntryLeft : keysEntryRight;
  var otherEntry = left ? keysEntryRight : keysEntryLeft;

  setKeyText(keysEntryPage, entry);
  setKeyText(keysNotePage, note);
  sizeKeysNote();
  setKeyText(left ? keysMoveLeft : keysMoveRight, last[mine]);
  setKeyText(left ? keysMoveRight : keysMoveLeft, last[theirs]);
  setKeyText(myEntry, entry);
  setKeyText(otherEntry, "");
  setKeyText(keysNoteClock, note);

  keysEntryPage.classList.toggle("bad", !!keyRefused);
  var red = keyBad && note === keyNote;
  keysNotePage.classList.toggle("bad", red);
  keysNoteClock.classList.toggle("bad", red);
}

// The message beside the board may be wider than your
// clock, up to the board panel's right edge (less its
// padding), so it doesn't wrap early. CSS can't know that
// distance, so it is measured, on every repaint
// (keysRender): the clocks and names change the column's
// width, and so where it sits, after the page has loaded.
// Measuring only at load gave too little room.
function sizeKeysNote() {
  if (!keysNotePage) return;
  var panel = document.getElementById("panelBoard");
  var side = document.getElementById("sideBottom");
  var pad = parseFloat(getComputedStyle(panel).paddingRight) || 0;
  var room = panel.getBoundingClientRect().right - pad -
             side.getBoundingClientRect().left;
  var max = room > 0 ? Math.floor(room) + "px" : "";
  if (keysNotePage.style.maxWidth !== max) {
    keysNotePage.style.maxWidth = max;
  }
}

// Guarded so the listener is only added once: twice would
// type every character twice.
var keysWired = false;
function initKeys() {
  if (keysWired) return;
  keysWired = true;
  keysEntryPage = document.getElementById("keysEntryPage");
  keysNotePage = document.getElementById("keysNotePage");
  keysMoveLeft = document.getElementById("keysMoveLeft");
  keysMoveRight = document.getElementById("keysMoveRight");
  keysEntryLeft = document.getElementById("keysEntryLeft");
  keysEntryRight = document.getElementById("keysEntryRight");
  keysNoteClock = document.getElementById("keysNoteClock");
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", sizeKeysNote);
  sizeKeysNote();
  keysRender();
}
