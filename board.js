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
 *  The piece pictures come from pieces.js, which is shared
 *  with other projects, so it is in the "shared" folder next
 *  to this page's folder (audioplay.html loads it). Each of
 *  the twelve is drawn once at start onto a small hidden
 *  canvas, one square in size, and copied from there.
 */

"use strict";

var mini = null, miniCtx = null;

// Drawing size of one square, in canvas pixels. Everything
// else (labels, glow) is sized from this.
var MINI_CELL = 144, MINI_PX = MINI_CELL * 8;
var BOARD_FILES = "abcdefgh";

// A FEN letter's piece, as pieces.js names its pictures:
// "white-king", "black-pawn" and so on.
var PIECE_NAMES = { k: "king", q: "queen", r: "rook",
                    b: "bishop", n: "knight", p: "pawn" };

// 0 for a light square, 1 for dark. Square 0 is the
// top-left of the drawing.
function sqClass(i) {
  var r = Math.floor(i / 8), f = i % 8;
  return (r + f) % 2 === 0 ? 0 : 1;
}

// The pieces at square size, by FEN letter ("K" the white
// king, "p" a black pawn). Each one is missing until its
// picture has loaded (the board is drawn without it until
// then). Drawing each picture onto a canvas once, then
// copying from that, means it is only drawn at one size.
var pieceArt = {};

// Without pieces.js the board is drawn with no pieces, and
// the log says why; the game itself still plays.
function bakePieces() {
  if (typeof PIECE_SVG === "undefined") {
    log("ERR", "pieces.js is missing - no piece pictures (keep " +
        "it in the \"shared\" folder, next to this page's folder)");
    return;
  }
  ["w", "b"].forEach(function (c) {
    Object.keys(PIECE_NAMES).forEach(function (t) {
      var name = (c === "w" ? "white-" : "black-") + PIECE_NAMES[t];
      var art = PIECE_SVG[name];
      if (!art) { log("ERR", "pieces.js has no picture named " + name); return; }
      // The picture wrapped in an <svg> of its own. Without
      // xmlns (a label, not a download) the browser won't
      // draw an <svg> that stands alone like this.
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
                PIECE_VIEWBOX + '" width="' + MINI_CELL + '" height="' +
                MINI_CELL + '">' + art + "</svg>";
      var img = new Image();
      img.onerror = function () {
        log("ERR", "piece picture failed to load: " + name);
      };
      img.onload = function () {
        var cv = document.createElement("canvas");
        cv.width = MINI_CELL; cv.height = MINI_CELL;
        cv.getContext("2d").drawImage(img, 0, 0, MINI_CELL, MINI_CELL);
        pieceArt[c === "w" ? t.toUpperCase() : t] = cv;
        renderMiniBoard();
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  });
}

// Draws one piece (a FEN letter) into the square at x, y.
function drawPiece(p, x, y) {
  var art = pieceArt[p];
  if (art) miniCtx.drawImage(art, x, y, MINI_CELL, MINI_CELL);
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
