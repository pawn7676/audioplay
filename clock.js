/*  clock.js - Clock View, and the spoken time.
 *
 *  Clock View (the Clock button) covers the screen in black
 *  with just the two clocks side by side: whole minutes,
 *  then seconds under a minute, red under a minute, and the
 *  side to move in heavier digits. Tap anywhere to go back
 *  to Board View, the ordinary page. awake.js keeps the
 *  screen on while Clock View is up.
 *
 *  The screen itself is #clockView in audioplay.html, and
 *  its look is in audioplay.css. This file fills in the
 *  digits and sets classes: .low (under a minute), .turn
 *  (the side to move) and .wide (three digits).
 *
 *  No fullscreen: leaving fullscreen on iOS corrupts the
 *  page layout until Safari is restarted.
 */

"use strict";

var CLOCK_TICK_MS = 100;   // how often Clock View redraws

var clockScreen = null, clockLeft = null, clockRight = null;
var clockTimer = null;

function clockViewOn() {
  return !!clockScreen && !clockScreen.hidden;
}

// Whole minutes above a minute, seconds below.
function clockDigits(ms) {
  if (ms == null) return "--";
  if (ms < 0) ms = 0;
  var s = Math.floor(ms / 1000);
  if (s < 60) return String(s);
  return String(Math.floor(s / 60));
}

function paintClockSide(box, color) {
  var ms = remainingMs(color);
  var digits = clockDigits(ms);
  if (box.textContent !== digits) box.textContent = digits;

  // Three digits (100 minutes or more) need smaller digits.
  // They stay smaller from then on, so the numbers never
  // change size while being read.
  if (digits.length > 2 && !clockScreen.classList.contains("wide")) {
    clockScreen.classList.add("wide");
    log("CLK", "three digits - smaller digits from now on");
  }
  box.classList.toggle("low", ms != null && ms < 60000);
  box.classList.toggle("turn",
    !!(api.pos && !api.over && api.pos.turn === color));
}

// Which side is yours is read here, so "flip" only needs a
// repaint.
function renderClockView() {
  if (!clockScreen) return;
  var mine = api.myColor || "w";
  var theirs = mine === "w" ? "b" : "w";
  paintClockSide(PLAYER_ON_LEFT_OF_CLOCK ? clockLeft : clockRight, mine);
  paintClockSide(PLAYER_ON_LEFT_OF_CLOCK ? clockRight : clockLeft, theirs);
}

// The "flip" command. Says which side your clock is on now,
// since Clock View may not be on screen.
function flipClockSides() {
  PLAYER_ON_LEFT_OF_CLOCK = !PLAYER_ON_LEFT_OF_CLOCK;
  var side = PLAYER_ON_LEFT_OF_CLOCK ? "left" : "right";
  log("CLK", "my clock now on the " + side);
  renderClockView();
  speak("your clock on the " + side + ".");
}

// The "time" command: both times, yours first, in the same
// units as Clock View. Only ever spoken when asked.
function spokenClockReading(ms) {
  if (ms < 0) ms = 0;
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + (s === 1 ? " second" : " seconds");
  var m = Math.floor(s / 60);
  return m + (m === 1 ? " minute" : " minutes");
}

function speakClockTimes() {
  var mine = api.myColor || "w";
  var theirs = mine === "w" ? "b" : "w";
  var myMs = remainingMs(mine), oppMs = remainingMs(theirs);

  if (myMs == null || oppMs == null) {
    speak("no clock running.");
    return;
  }
  speak(colorWord(mine) + " " + spokenClockReading(myMs) + ", " +
        colorWord(theirs) + " " + spokenClockReading(oppMs) + ".");
}

// Going in and out of Clock View also checks the screen
// lock (awake.js) at once, during the tap, rather than on
// the next repaint tick.
function enterClockView() {
  if (!clockScreen) {
    clockScreen = document.getElementById("clockView");
    clockLeft = document.getElementById("clockLeft");
    clockRight = document.getElementById("clockRight");
    clockScreen.addEventListener("click", function () {
      exitClockView(true);
    });
  }
  clockScreen.hidden = false;
  renderClockView();
  clearInterval(clockTimer);
  clockTimer = setInterval(renderClockView, CLOCK_TICK_MS);
  keepAwakeCheck();
  renderButton();
  log("CLK", "Clock View on");
}

function exitClockView(byTap) {
  if (!clockViewOn()) return;
  clockScreen.hidden = true;
  clearInterval(clockTimer);
  clockTimer = null;
  keepAwakeCheck();
  renderButton();
  log("CLK", "Clock View off" + (byTap ? " (tap)" : ""));
}

function toggleClockView() {
  if (clockViewOn()) exitClockView(false);
  else enterClockView();
}
