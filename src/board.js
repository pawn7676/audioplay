/*  audioplay-web — board.js
 *  Read the header.js front door first: it carries the project
 *  story, the hard constraints, and the file map.
 *
 *  BoardEye's mini-board canvas renderer, ported with the
 *  camera code stripped: no tap-to-inspect, no quietState,
 *  no calibration overlay. What remains draws ONE thing,
 *  the position in api.pos, with the last recorded move's
 *  two squares tinted and a checked king under a red halo —
 *  which is the whole job here: a board that mimics the game
 *  state, read at a glance to confirm the voice pipeline and
 *  Lichess agree. The colours are Lichess's own, so the
 *  glance carries over: the board browns, the green-tinted
 *  last-move pair, and the check gradient are what
 *  lichess.org itself paints. (Constraint 6 — stylesheet owns
 *  the looks — stops at the canvas edge: CSS cannot reach
 *  inside a canvas, so these colours live here, all of them
 *  in this one file.)
 *
 *  Piece art is the cburnett SVG set carried in
 *  index.html's #pieceDefs block (the same block BoardEye
 *  ships), baked once into per-piece canvases.
 *
 *  One behaviour BoardEye never needed: ORIENTATION
 *  FOLLOWS THE PLAYER. BoardEye draws what the camera
 *  sees; this board draws what the player owns, so when
 *  api.myColor is black the board flips to put black at
 *  the bottom, as Lichess itself does.
 */

var mini = null, miniCtx = null;
var MINI_CELL = 96, MINI_PX = MINI_CELL * 8;
var BOARD_FILES = "abcdefgh";

var PIECE_ID = {
  w: { k: "white-king", q: "white-queen", r: "white-rook",
       b: "white-bishop", n: "white-knight", p: "white-pawn" },
  b: { k: "black-king", q: "black-queen", r: "black-rook",
       b: "black-bishop", n: "black-knight", p: "black-pawn" }
};

// light square when file+rank is odd, counting from a8 at
// grid index 0 — matches BoardEye's sqClass exactly.
function sqClass(i) {
  var r = Math.floor(i / 8), f = i % 8;
  return (r + f) % 2 === 0 ? 0 : 1;
}

var pieceArt = {};
var bakeRepaint = null;    /* coalesces the twelve load repaints */
function bakePieces() {
  var ser = new XMLSerializer();
  ["w", "b"].forEach(function (c) {
    ["k", "q", "r", "b", "n", "p"].forEach(function (t) {
      var id = PIECE_ID[c][t], g = document.getElementById(id);
      if (!g) return;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" ' +
        'viewBox="0 0 45 45" width="' + MINI_CELL + '" height="' +
        MINI_CELL + '">' + ser.serializeToString(g) + "</svg>";
      var img = new Image();
      // a piece that fails to bake stays absent silently; the
      // start position doubling as proof-the-art-loaded is the
      // real guard, but the log should still say which (w63)
      img.onerror = function () {
        log("ERR", "piece art failed to load: " + id);
      };
      img.onload = function () {
        var cv = document.createElement("canvas");
        cv.width = MINI_CELL; cv.height = MINI_CELL;
        cv.getContext("2d").drawImage(img, 0, 0, MINI_CELL, MINI_CELL);
        pieceArt[id] = cv;
        // ONE REPAINT FOR THE WHOLE SET, NOT ONE EACH (w53).
        // Twelve images load within a frame or two of each
        // other at boot and each redrew the entire board, so
        // the first eleven were guaranteed to be replaced by
        // the twelfth. Coalescing to the end of the turn draws
        // once, with every piece present.
        clearTimeout(bakeRepaint);
        bakeRepaint = setTimeout(renderMiniBoard, 0);
      };
      img.src = "data:image/svg+xml;charset=utf-8," +
                encodeURIComponent(svg);
    });
  });
}

// Whether black sits at the bottom of the drawing.
function boardFlipped() {
  return api && api.myColor === "b";
}

// grid index (0 = top-left of the DRAWING) -> 0x88 square
// in api.pos.board. Unflipped, top-left is a8; flipped it
// is h1.
function gridTo0x88(i) {
  var r = Math.floor(i / 8), f = i % 8;
  if (boardFlipped()) { r = 7 - r; f = 7 - f; }
  return (7 - r) * 16 + f;
}

// last move's two squares as grid indexes for the tint
function lastMoveGridSqs() {
  if (!api || !api.moves || !api.moves.length) return null;
  var uci = api.moves[api.moves.length - 1];
  if (!uci || uci.length < 4) return null;
  var out = [];
  [uci.slice(0, 2), uci.slice(2, 4)].forEach(function (s) {
    var f = s.charCodeAt(0) - 97, r = s.charCodeAt(1) - 49;
    if (f < 0 || f > 7 || r < 0 || r > 7) return;
    var gr = 7 - r, gf = f;
    if (boardFlipped()) { gr = 7 - gr; gf = 7 - gf; }
    out.push(gr * 8 + gf);
  });
  return out.length === 2 ? out : null;
}

// the checked king's square as a grid index, or -1. The rules
// object already knows both halves of the question — never
// re-derive a chess fact the one truth can answer.
function checkGridSq() {
  if (!api || !api.pos) return -1;
  if (!api.pos.inCheck(api.pos.turn)) return -1;
  var k = api.pos.kingSq(api.pos.turn);
  if (k < 0) return -1;
  var r = 7 - (k >> 4), f = k & 15;
  if (boardFlipped()) { r = 7 - r; f = 7 - f; }
  return r * 8 + f;
}

function renderMiniBoard() {
  if (!miniCtx) return;
  var board = api && api.pos ? api.pos.board : null;
  var tint = lastMoveGridSqs();
  var checkSq = checkGridSq();
  var selSq = touchSelGridSq();   /* touch.js; -1 when nothing chosen */
  for (var i = 0; i < 64; i++) {
    var x = (i % 8) * MINI_CELL, y = Math.floor(i / 8) * MINI_CELL;
    // Lichess's last-move highlight is rgba(155,199,0,.41)
    // laid over the board browns; these are the flat colours
    // that compositing lands on, painted directly so the
    // squares stay a single fill each. The chosen-square pair
    // (w86) is the same idea for the touch selection: the
    // owner's screenshot measurements of Lichess's own
    // selected square over each brown, and it outranks the
    // last-move tint because it answers the newer question.
    var moved = tint && tint.indexOf(i) >= 0;
    var chosen = i === selSq;
    miniCtx.fillStyle = sqClass(i) === 0
      ? (chosen ? "#809668" : moved ? "#ccd069" : "#f0d9b5")
      : (chosen ? "#636e40" : moved ? "#a8a23b" : "#b58863");
    miniCtx.fillRect(x, y, MINI_CELL, MINI_CELL);
    if (i === checkSq) {
      // Lichess's check halo, stop for stop. Its CSS ellipse
      // sizes to the square's farthest corner: half a cell
      // times root two.
      var cx = x + MINI_CELL / 2, cy = y + MINI_CELL / 2;
      var halo = miniCtx.createRadialGradient(cx, cy, 0,
                                              cx, cy, MINI_CELL * 0.708);
      halo.addColorStop(0, "rgb(255,0,0)");
      halo.addColorStop(0.25, "rgb(231,0,0)");
      halo.addColorStop(0.89, "rgba(169,0,0,0)");
      halo.addColorStop(1, "rgba(158,0,0,0)");
      miniCtx.fillStyle = halo;
      miniCtx.fillRect(x, y, MINI_CELL, MINI_CELL);
    }
    var p = board ? board[gridTo0x88(i)] : startPieceAt(i);
    if (p) {
      var c = p === p.toUpperCase() ? "w" : "b";
      var art = pieceArt[PIECE_ID[c][p.toLowerCase()]];
      if (art) miniCtx.drawImage(art, x, y);
    }
  }
  // coordinates where Lichess puts them: letters in the lower
  // LEFT of the bottom rank, numbers in the upper RIGHT of the
  // rightmost file. Each label is inked in its square's
  // opposite colour, so the number column keys off the RIGHT
  // edge's squares now that it lives there.
  miniCtx.font = '600 20px Menlo, "SF Mono", monospace';
  miniCtx.textBaseline = "top";
  var flip = boardFlipped();
  for (var f = 0; f < 8; f++) {
    miniCtx.fillStyle = sqClass(56 + f) === 0 ? "#b58863" : "#f0d9b5";
    miniCtx.fillText(BOARD_FILES[flip ? 7 - f : f],
                     f * MINI_CELL + 6, MINI_PX - 25);
  }
  for (var r = 0; r < 8; r++) {
    miniCtx.fillStyle = sqClass(r * 8 + 7) === 0 ? "#b58863" : "#f0d9b5";
    miniCtx.fillText(String(flip ? r + 1 : 8 - r),
                     MINI_PX - 17, r * MINI_CELL + 5);
  }
}

// Before any game is connected the board shows the start
// position, which doubles as proof the piece art loaded.
// ORIENTATION-BLIND ON PURPOSE, and safe only by a coupling
// worth naming (w63): black is drawn on the top grid rows
// regardless of flip, which would be wrong if the board could
// be flipped with no position - but every path that sets
// myColor sets pos in the same breath (joinGame, gameFull,
// pollOnce, signOut, dryStart), so a flipped, position-less
// board cannot currently exist. If that coupling ever
// loosens, apply boardFlipped() here too.
var START_BACK = ["r", "n", "b", "q", "k", "b", "n", "r"];
function startPieceAt(i) {
  var r = Math.floor(i / 8), f = i % 8;
  if (r === 0) return START_BACK[f];
  if (r === 1) return "p";
  if (r === 6) return "P";
  if (r === 7) return START_BACK[f].toUpperCase();
  return null;
}

function initBoard() {
  mini = document.getElementById("mini");
  if (!mini) return;
  miniCtx = mini.getContext("2d");
  bakePieces();
  renderMiniBoard();
}
