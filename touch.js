/*  touch.js - move by tapping the board.
 *
 *  Tap a piece, then tap where it goes. Useful when time
 *  is short, since a spoken move takes a few seconds.
 *
 *  - Taps only, no dragging, and only on your turn.
 *  - "click" rather than pointerdown, so scrolling the page
 *    never picks up a piece.
 *  - A tapped promotion always makes a queen; say the move
 *    to underpromote.
 *  - Nothing is spoken on success (you can see the piece
 *    move), but errors are still spoken.
 *  - The piece moves when Lichess confirms, not before.
 *
 *  Which square was tapped is worked out by the shared
 *  board, board.js (in the "shared" folder); the tapped
 *  piece's highlight is drawn by it too (describeBoard in
 *  ui.js).
 */

"use strict";

var touchSelSq = -1;   // 0x88 square of the selected piece, or -1

function touchActive() {
  return !!(api && api.pos && !api.over && api.myColor &&
            api.pos.turn === api.myColor);
}

// The selected square, or -1. Clears the selection if it no
// longer makes sense (a takeback, the turn passing, a new
// game).
function touchSelectedSq() {
  if (touchSelSq < 0) return -1;
  var p = touchActive() ? api.pos.board[touchSelSq] : null;
  var mine = p && (api.myColor === "w") === (p === p.toUpperCase());
  if (!mine) touchSelSq = -1;
  return touchSelSq;
}

function onBoardTap(e) {
  if (!touchActive() || typeof BOARD === "undefined") return;
  // (the right way up first, in case your colour just
  // changed)
  orientBoard();
  var sq = BOARD.squareFromPoint(e.clientX, e.clientY);
  if (sq < 0) return;
  var legal = api.pos.legalMoves();

  if (touchSelectedSq() >= 0 && sq !== touchSelSq) {
    var found = legal.filter(function (m) {
      return m.from === touchSelSq && m.to === sq;
    });
    if (found.length) {
      // several matches means a promotion: take the queen
      var m = found[0];
      for (var i = 0; i < found.length; i++) {
        if (found[i].promotion === "q") m = found[i];
      }
      touchSelSq = -1;
      log("TCH", "tap move " + api.pos.uciOf(m));
      acceptMove({ m: m, san: api.pos.sanOf(m, legal) }, true);

      renderMiniBoard();
      return;
    }
  }

  // Not a move: select a piece of ours that can move, tap
  // it again to deselect, anything else clears.
  var can = sq !== touchSelSq &&
            legal.some(function (m) { return m.from === sq; });
  touchSelSq = can ? sq : -1;
  renderMiniBoard();
}

// Guarded so the listener is only added once: twice would
// select and then immediately deselect on every tap.
var touchWired = false;
function initTouch() {
  var cv = document.getElementById("mini");
  if (!cv || touchWired) return;
  touchWired = true;
  cv.addEventListener("click", onBoardTap);
}
