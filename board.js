/*  board.js - draws the board on the page.
 *
 *  Draws the position in api.pos onto the #mini canvas, with
 *  the last move tinted, a checked king's square glowing
 *  red, and a tapped piece highlighted. The board flips
 *  when you play black.
 *
 *  The colours are Lichess's: the squares, the last-move
 *  and selected tints, and the check glow, whose four
 *  colour stops are chessground's (Lichess's board, under
 *  the GPL, version 3 or later). See CREDITS.md.
 *
 *  The piece pictures come from pieces.svg, a grid of all
 *  twelve. It is drawn once at start onto a hidden sheet at
 *  board size, and each piece is copied from its cell.
 */

"use strict";

var mini = null, miniCtx = null;

// Drawing size of one square, in canvas pixels. Everything
// else (labels, glow) is sized from this.
var MINI_CELL = 144, MINI_PX = MINI_CELL * 8;
var BOARD_FILES = "abcdefgh";

// Where each piece sits in pieces.svg: white on the top
// row, black on the bottom, columns in this order.
var PIECE_SHEET = "pieces.svg";
var PIECE_COL = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };
var PIECE_ROW = { w: 0, b: 1 };

// 0 for a light square, 1 for dark. Square 0 is the
// top-left of the drawing.
function sqClass(i) {
  var r = Math.floor(i / 8), f = i % 8;
  return (r + f) % 2 === 0 ? 0 : 1;
}

// The pieces at board size, or null until pieces.svg has
// loaded (the board is drawn without pieces until then).
// Drawing the picture onto a canvas once, then copying
// from that, means the picture is only drawn at one size.
var pieceSheet = null;

function bakePieces() {
  var img = new Image();
  img.onerror = function () {
    log("ERR", "piece pictures failed to load: " + PIECE_SHEET);
  };
  img.onload = function () {
    var cv = document.createElement("canvas");
    cv.width = MINI_CELL * 6; cv.height = MINI_CELL * 2;
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    pieceSheet = cv;
    renderMiniBoard();
  };
  img.src = PIECE_SHEET;
}

// Draws one piece (a FEN letter) into the square at x, y.
function drawPiece(p, x, y) {
  if (!pieceSheet) return;
  var row = PIECE_ROW[p === p.toUpperCase() ? "w" : "b"];
  var col = PIECE_COL[p.toLowerCase()];
  if (row == null || col == null) return;
  miniCtx.drawImage(pieceSheet,
                    col * MINI_CELL, row * MINI_CELL, MINI_CELL, MINI_CELL,
                    x, y, MINI_CELL, MINI_CELL);
}

// Black at the bottom when you play black.
function boardFlipped() {
  return api && api.myColor === "b";
}

// Drawing index (0 = top-left) to the 0x88 square in
// api.pos.board.
function gridTo0x88(i) {
  var r = Math.floor(i / 8), f = i % 8;
  if (boardFlipped()) { r = 7 - r; f = 7 - f; }
  return (7 - r) * 16 + f;
}

// The last move's two squares, as drawing indexes.
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

// The checked king's square as a drawing index, or -1.
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
  var selSq = touchSelGridSq();
  for (var i = 0; i < 64; i++) {
    var x = (i % 8) * MINI_CELL, y = Math.floor(i / 8) * MINI_CELL;

    // square colour: plain, last-move tint, or the tapped
    // piece's highlight (which wins)
    var moved = tint && tint.indexOf(i) >= 0;
    var chosen = i === selSq;
    miniCtx.fillStyle = sqClass(i) === 0
      ? (chosen ? "#809668" : moved ? "#ccd069" : "#f0d9b5")
      : (chosen ? "#636e40" : moved ? "#a8a23b" : "#b58863");
    miniCtx.fillRect(x, y, MINI_CELL, MINI_CELL);
    if (i === checkSq) {
      // Lichess's red check glow: chessground's colour
      // stops (see CREDITS.md)
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
    if (p) drawPiece(p, x, y);
  }

  // Coordinates where Lichess puts them: letters along the
  // bottom, numbers down the right, each in the opposite
  // colour to its square.
  miniCtx.font = "600 " + Math.round(MINI_CELL * 0.21) +
                 'px Menlo, "SF Mono", monospace';
  miniCtx.textBaseline = "top";
  var flip = boardFlipped();
  var padX = Math.round(MINI_CELL * 0.0625);
  var letterY = MINI_PX - Math.round(MINI_CELL * 0.26);
  var numberX = MINI_PX - Math.round(MINI_CELL * 0.177);
  var padY = Math.round(MINI_CELL * 0.052);
  for (var f = 0; f < 8; f++) {
    miniCtx.fillStyle = sqClass(56 + f) === 0 ? "#b58863" : "#f0d9b5";
    miniCtx.fillText(BOARD_FILES[flip ? 7 - f : f],
                     f * MINI_CELL + padX, letterY);
  }
  for (var r = 0; r < 8; r++) {
    miniCtx.fillStyle = sqClass(r * 8 + 7) === 0 ? "#b58863" : "#f0d9b5";
    miniCtx.fillText(String(flip ? r + 1 : 8 - r),
                     numberX, r * MINI_CELL + padY);
  }
}

// With no game yet, the start position is drawn, white at
// the bottom. (Every path that sets myColor also sets pos,
// so a flipped board with no position cannot happen.)
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
