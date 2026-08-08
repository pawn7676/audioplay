  /*========================= TOUCH TO MOVE ========================\
   *
   *  Two taps on the glance board play a move: one on the
   *  piece, one on its destination (w86). Built for the time
   *  scramble - a spoken move costs seconds of recognition
   *  and grammar, and under a minute those seconds are the
   *  game. Voice stays the medium; this is the fast lane
   *  beside it, and both feed the same acceptMove pipeline,
   *  so the busy guard, the post timeout, and every spoken
   *  error path are shared rather than reimplemented.
   *
   *  The choices, each the cheap end of its trade:
   *
   *  - TAPS, NOT DRAGS. No animation code, and no fight with
   *    the page's own scrolling for the gesture.
   *  - "click", NOT pointerdown. A drag that begins on the
   *    board (the user scrolling the page) fires pointerdown
   *    but no click, so scrolling can never pick up a piece.
   *    The cost is the tap landing on finger-up rather than
   *    finger-down, which is imperceptible next to the
   *    network round trip every real move pays anyway.
   *  - AUTO-QUEEN. A tapped promotion queens without asking;
   *    underpromotion stays a spoken move. It is rare enough
   *    to wait, and a question here burns exactly the seconds
   *    this feature exists to save.
   *  - NO READ-BACK, which is what the `quiet` argument to
   *    acceptMove says. Two taps prove the eyes are on the
   *    screen, where the piece appearing IS the answer;
   *    constraint 5 protects the eyes-free paths, and this
   *    one is eyes-on by construction. Errors still speak -
   *    a rejection, a slow-down, a dead token must be heard
   *    whichever way the move went in.
   *  - NO OPTIMISTIC PAINT. The piece appears when Lichess
   *    confirms the move (the practice board, all local,
   *    repaints at once). Painting ahead of the server would
   *    buy a frame of snap and a resync debt when it
   *    disagrees; if the round trip proves slow at the board,
   *    revisit then.
   *  - NO PREMOVE. Taps are read only while it is our turn.
   *
   *  FAIR PLAY: the only question asked here is the one the
   *  voice path already asks - which moves are LEGAL from a
   *  square. Nothing is ranked, nothing is suggested; a tap
   *  on a piece with no legal moves simply selects nothing.
   *
   *  The selection VALIDATES ITSELF at every read
   *  (touchSelGridSq): a takeback, a game ending, a new game,
   *  or the turn passing all make it stale, and rather than
   *  chase every path that could move the position, the
   *  accessor checks the selection against the position it is
   *  about to be drawn on and drops it the moment it stops
   *  making sense.
   */

  var touchSelSq = -1;   /* 0x88 square of the tapped piece, or -1 */

  function touchActive() {
    return !!(api && api.pos && !api.over && api.myColor &&
              api.pos.turn === api.myColor);
  }

  /* The selected square as a grid index for the renderer, or
   * -1 - and the validity check described above. */
  function touchSelGridSq() {
    if (touchSelSq < 0) return -1;
    var p = touchActive() ? api.pos.board[touchSelSq] : null;
    var mine = p && (api.myColor === "w") === (p === p.toUpperCase());
    if (!mine) { touchSelSq = -1; return -1; }
    var r = 7 - (touchSelSq >> 4), f = touchSelSq & 15;
    if (boardFlipped()) { r = 7 - r; f = 7 - f; }
    return r * 8 + f;
  }

  /* A tap's 0x88 square, or -1. The canvas draws at 768px and
   * displays at whatever CSS made of it, so the division is by
   * the on-screen rect, never MINI_PX. */
  function tapTo0x88(e) {
    var rect = mini.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    var f = Math.floor((e.clientX - rect.left) * 8 / rect.width);
    var r = Math.floor((e.clientY - rect.top) * 8 / rect.height);
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return gridTo0x88(r * 8 + f);
  }

  function onBoardTap(e) {
    if (!touchActive()) return;
    var sq = tapTo0x88(e);
    if (sq < 0) return;
    var legal = api.pos.legalMoves();

    if (touchSelGridSq() >= 0 && sq !== touchSelSq) {
      var found = legal.filter(function (m) {
        return m.from === touchSelSq && m.to === sq;
      });
      if (found.length) {
        /* more than one match is a promotion, four ways;
         * auto-queen picks for the finger */
        var m = found[0];
        for (var i = 0; i < found.length; i++) {
          if (found[i].promotion === "q") m = found[i];
        }
        touchSelSq = -1;
        log("TCH", "tap move " + api.pos.uciOf(m));
        acceptMove({ m: m, san: api.pos.sanOf(m, legal) }, true);
        /* after, not before: in practice mode acceptMove has
         * already applied the move, and the repaint shows it */
        renderMiniBoard();
        return;
      }
    }

    /* not a move: select the square if it is a piece of ours
     * with somewhere to go, toggle it off if it was already
     * chosen, clear otherwise */
    var can = sq !== touchSelSq &&
              legal.some(function (m) { return m.from === sq; });
    touchSelSq = can ? sq : -1;
    renderMiniBoard();
  }

  /* Guarded against a second call: a doubled listener makes
   * every tap run twice, and the second run TOGGLES THE
   * SELECTION STRAIGHT BACK OFF - a board that highlights and
   * then never moves. Found by the harness, whose element stub
   * keeps every listener for exactly this reason (see its
   * addEventListener note). */
  var touchWired = false;
  function initTouch() {
    if (!mini || touchWired) return;
    touchWired = true;
    mini.addEventListener("click", onBoardTap);
  }
