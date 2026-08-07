/* Harness for the website (the only build): stub the browser, load
 * the files named in manifest.txt (minus the IIFE wrapper,
 * so every function and var lands in the sandbox as a global
 * the tests can reach), boot, then drive handleTranscripts
 * through practice mode with real utterance shapes from the
 * userscript's game logs, plus the web shell's own behaviour
 * (account button, status line, remembered panels, mic
 * restart). Anything thrown, any missing global, fails loudly.
 *
 * WHAT THIS TESTS IS WHAT SHIPS: the same src/ files build.js
 * concatenates into the root index.html, in the same order.
 * Only header.js and closure-footer.js are skipped - they hold
 * no code, just the closure and its documentation.
 *
 * The w19 harness's silent-mode, low-time, voice-dropdown and
 * MODE_SETTINGS tests are gone WITH THEIR FEATURES: silent
 * mode left canon at v109, the rest were w-era apparatus the
 * w20 rebuild retired (see header.js). Do not resurrect a
 * test without its feature.
 *
 *   node test_harness.js
 *
 * Perft, whenever rules.js changes (it is FROZEN):
 *   node perft_check.js
 */

"use strict";
const fs = require("fs");
const vm = require("vm");

const elements = {};   // declared before element(), which registers into it

// the nine preset buttons the template carries, as real stub
// elements with their data-tc, so wireTimeRow finds them
const tcButtons = ((fsSrc) =>
  (fsSrc.match(/data-tc="([^"]+)"/g) || []).map(m => {
    const el = element("");
    const tc = m.slice(9, -1);
    el.tagName = "BUTTON";
    el.getAttribute = k => (k === "data-tc" ? tc : null);
    el.classList = {
      _on: false,
      toggle(name, v) { if (name === "picked") this._on = !!v; },
      add() {}, remove() {}
    };
    return el;
  })
)(require("fs").readFileSync("src/index.html", "utf8"));

function element(id) {
  const el = {
    style: {}, textContent: "", innerHTML: "",
    disabled: false, checked: false, title: "",
    value: id === "seekMinutes" ? "15"
      : id === "seekIncrement" ? "10" : id === "challengeWho" ? "maia1"
      : id === "challengeColour" ? "random" : "",
    classList: {
      _on: {},
      add(n) { this._on[n] = true; },
      remove(n) { this._on[n] = false; },
      toggle(n, v) { this._on[n] = v === undefined ? !this._on[n] : !!v; },
      contains(n) { return !!this._on[n]; }
    },
    options: [],
    // EVERY LISTENER, NOT THE LAST ONE. The first stub kept
    // this["on_" + name] = fn, so a second addEventListener on
    // the same element silently threw the first away. The real
    // page registers twice on the settings button - buildUI
    // anchors it one way, buildWebUI re-anchors it for this
    // page - and under the old stub only the second ever ran,
    // so the pair could not be tested at all and the w24 check
    // fell back to grepping ui.js. on_<name>() still works: it
    // is now the dispatcher rather than the one handler.
    _listeners: {},
    addEventListener(name, fn) {
      var list = this._listeners[name] || (this._listeners[name] = []);
      list.push(fn);
      var el = this;
      this["on_" + name] = function (ev) {
        list.slice().forEach(function (f) { f.call(el, ev); });
      };
    },
    // real parent/child, so a test can ask which element
    // actually got styled instead of grepping the source
    children: [],
    appendChild(c) {
      if (!c) return c;
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);   // a real move
      this.children.push(c);
      return c;
    },
    insertBefore(c, ref) {
      if (!c) return c;
      const had = this.children.indexOf(c);
      if (had >= 0) this.children.splice(had, 1);
      const at = ref ? this.children.indexOf(ref) : -1;
      if (at >= 0) this.children.splice(at, 0, c);
      else this.children.push(c);
      return c;
    },
    get firstChild() { return this.children[0] || null; },
    remove() {},
    getContext() { return new Proxy({}, { get: () => () => {} }); },
    // a full rect: the settings anchoring reads .bottom and
    // .left, and a missing field silently anchors to NaN
    getBoundingClientRect() {
      return { width: 100, height: 100, top: 500, bottom: 600,
               left: 40, right: 140 };
    },
    play() { return Promise.resolve(); }, pause() {}, load() {},
    scrollTop: 0, scrollHeight: 0
  };
  // assigning an id registers the element, as a real
  // document does when the node is in the tree
  Object.defineProperty(el, "id", {
    get() { return el._id || ""; },
    set(v) { el._id = v; elements[v] = el; },
    enumerable: true
  });
  el.id = id || "";
  return el;
}
// two collapsible panels, as the w20 page has (the log panel
// is the shared UI's floating one now, not a page panel)
const fakePanels = ["panelBoard", "panelLichess",
                    "panelInstructions"].map(id => ({
  open: true,
  parentNode: { id: id },
  addEventListener(n, fn) { this["on_" + n] = fn; }
}));

// getElementById RETURNS null FOR IDS THE PAGE DOES NOT HAVE.
// The first version of this stub created any id on demand,
// which meant buildUI's own guard - "if the button row already
// exists, do nothing" - fired on the first call and THE UI
// WAS NEVER BUILT in any test. Everything that looked like a
// UI test was really a source grep. The known ids are read
// from the real template, and elements register themselves
// when code assigns an id (that is how voicemove-ui appears
// once buildUI creates it).
const templateIds = (fs.readFileSync("src/index.html", "utf8")
  .match(/id="[^"]+"/g) || []).map(s => s.slice(4, -1));
templateIds.forEach(id => { elements[id] = element(id); });
function getEl(id) {
  return elements[id] || null;
}

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, JSON, Math, Date, Array, Object, String, Number, RegExp,
  parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  btoa: s => Buffer.from(s, "binary").toString("base64"),
  TextEncoder, TextDecoder, Uint8Array, URLSearchParams,
  AbortController,
  Image: function () { this.onload = null; },
  XMLSerializer: function () { this.serializeToString = () => "<g/>"; },
  navigator: { clipboard: { writeText() {} } },
  localStorage: (() => {
    const s = {};
    return { getItem: k => (k in s ? s[k] : null),
             setItem: (k, v) => { s[k] = String(v); },
             removeItem: k => { delete s[k]; },
             __all__: s };            // for the memory tests
  })(),
  crypto: {
    getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = i & 255; return a; },
    subtle: { digest: () => Promise.resolve(new ArrayBuffer(32)) }
  },
  location: { origin: "https://example.github.io", pathname: "/audioplay/",
              search: "", href: "" },
  history: { replaceState() {} },
  fetch: (url) => Promise.reject(new Error("no network in harness: " + url)),
  speechSynthesis: { getVoices: () => [], cancel() {}, speak(u) { if (u.onend) setTimeout(u.onend, 1); },
                     speaking: false, paused: false, pending: false, resume() {} },
  SpeechSynthesisUtterance: function (t) { this.text = t; },
  Blob: function () {}, URL: { createObjectURL: () => "blob:x" },
  Audio: function () { return element("audio"); },
  MutationObserver: function () { this.observe = () => {}; },
  document: {
    readyState: "complete",
    getElementById: getEl,
    querySelectorAll: (sel) => {
      if (sel.indexOf("details") >= 0) return fakePanels;
      if (sel.indexOf("button.tc") >= 0) return tcButtons;
      return [];
    },
    createElement: tag => {
      const e = element("");          // a fresh node has NO id
      e.tagName = String(tag).toUpperCase();
      return e;
    },
    body: element("body"),
    documentElement: element("html"),
    addEventListener() {},
    hidden: false
  },
  innerHeight: 800
};
sandbox.addEventListener = function () {};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

// The manifest is the load order; the wrapper files hold no
// code. CONCATENATED INTO ONE SCRIPT before evaluating, not
// run file by file: the shipped build is one script, so a
// function declared late (makeRules, in rules.js) hoists
// above a top-level call in an earlier one (RULES, in lichess.js).
// Separate evaluations lose that hoisting and fail on code
// the real page runs fine.
const order = fs.readFileSync("manifest.txt", "utf8").split("\n")
  .map(s => s.trim())
  .filter(s => s && !s.startsWith("#") && !s.startsWith("@"))
  .filter(s => s !== "header.js" && s !== "closure-footer.js");
const wholeSrc = order
  .map(f => fs.readFileSync("src/" + f, "utf8")).join("");
vm.runInContext(wholeSrc, sandbox, { filename: "concat(manifest)" });
console.log("loaded", order.length, "files as one script");

// capture speech after load (they are globals now)
vm.runInContext(`
  var __spoken = [];
  speak = function (t) { __spoken.push(t); };
  speakWhenAudioSettled = function (t) { __spoken.push(t); };
`, sandbox);

// boot ran on load (readyState complete). Now: practice. The
// practice button is created by createElement so the harness
// cannot find it by id; enter the mode the way the button does.
vm.runInContext(`
  dryRun = true; running = true;
  pending = null; confirmAction = null;
  dryStart();
`, sandbox);

function say(t) {
  vm.runInContext(`handleTranscripts(${JSON.stringify([t])});`, sandbox);
}
function heard() {
  return vm.runInContext("__spoken.splice(0)", sandbox);
}

heard(); // drop the practice greeting
/* THE WAITS ARE A MARGIN, AND THE MARGIN WAS 100x (w54).
 * Nearly every sleep here is waiting for a speech chain to
 * settle, and the TTS stub fires onend after ONE millisecond -
 * so a 120ms wait was two orders of magnitude more than the
 * thing it waits for needs. Across 57 of them that is most of
 * the suite's wall time, and a suite that takes twenty seconds
 * is one that gets run less often than the rule says it must.
 *
 * Scaled rather than rewritten: virtualising the clock would
 * be the real fix and it would mean the harness no longer
 * drives the product's own timers, which is a bigger change
 * than this batch should carry. HARNESS_SLEEP=1 restores the
 * old margins if anything ever looks timing-flaky - and if it
 * does, that is worth knowing rather than papering over.
 */
const SLEEP_SCALE = Number(process.env.HARNESS_SLEEP || 0.35);
const sleep = ms =>
  new Promise(r => setTimeout(r, Math.max(15, Math.round(ms * SLEEP_SCALE))));

(async () => {
  let pass = 0, fail = 0;
  async function expect(utt, want) {
    say(utt);
    await sleep(120);            // let TTS onend chains fire
    const out = heard().join(" | ");
    const ok = want.test(out);
    console.log((ok ? "PASS" : "FAIL"), JSON.stringify(utt), "->",
                out || "(silence)");
    ok ? pass++ : fail++;
  }
  function check(name, cond) {
    console.log((cond ? "PASS " : "FAIL ") + name);
    cond ? pass++ : fail++;
  }

  await expect("knight foxtrot three", /knight foxtrot 3/i);
  await sleep(150); heard();     // the practice random reply
  await expect("whose turn", /(white|black) to move/i);
  await expect("what is on foxtrot three", /white knight/i);
  await expect("repeat", /./);
  await expect("memo testing the port", /memo recorded/i);

  // the bare-square property, spot-checked on a fresh
  // practice game: a bare square must never come back as
  // a piece move
  vm.runInContext(`
    dryRun = true; running = true;
    pending = null; confirmAction = null;
    dryStart();
  `, sandbox);
  await sleep(150); heard();
  say("delta four");
  await sleep(120);
  const d4 = heard().join(" | ");
  const pieceWords = /(knight|bishop|rook|queen|king) delta 4/i;
  if (pieceWords.test(d4)) {
    console.log("FAIL bare d4 read as a piece:", d4); fail++;
  } else {
    console.log("PASS bare square stayed a pawn:", d4); pass++;
  }
  await sleep(200); heard();   // let the random reply land

  // ---- clock mode, as v133 ships it (clock.js) ----
  vm.runInContext("enterClockMode();", sandbox);
  check("clock mode reports on",
        vm.runInContext("clockModeOn()", sandbox) === true);
  // FLIP CLOCK ANSWERS (w54). This used to assert only that a
  // string was absent from the log - which a throw inside
  // speak() would have crashed the harness over anyway, so it
  // proved almost nothing, and it never checked the flip
  // happened. It is a VOICE command reachable with the overlay
  // down, where the repaint is invisible: the spoken answer is
  // the only thing that reaches the user at all.
  heard();
  const sideBefore = vm.runInContext("PLAYER_ON_LEFT_OF_CLOCK", sandbox);
  say("flip clock");
  await sleep(120);
  const flipSaid = heard().join(" | ");
  check("flip clock actually flips the sides",
        vm.runInContext("PLAYER_ON_LEFT_OF_CLOCK", sandbox) !== sideBefore);
  check("and says which side is yours now (" + flipSaid + ")",
        /your clock on the (left|right)/i.test(flipSaid));
  vm.runInContext("exitClockMode(true);", sandbox);
  check("tap leaves clock mode",
        vm.runInContext("clockModeOn()", sandbox) === false);

  // per-mode read-back (v124 settings): each mode follows its
  // OWN switch. The defaults are not asserted - they are the
  // owner's to change, and he has (w2 shipped clock read-back
  // off; v133's default is on). What must hold is the routing.
  check("voice mode follows readBackMine",
        vm.runInContext("readBackMineNow() === CFG.readBackMine",
                        sandbox) === true);
  vm.runInContext("enterClockMode();", sandbox);
  check("clock mode follows clockReadBackMine",
        vm.runInContext("readBackMineNow() === CFG.clockReadBackMine",
                        sandbox) === true);
  vm.runInContext(`
    CFG.clockReadBackMine = !CFG.clockReadBackMine;
    __flip = readBackMineNow();
    CFG.clockReadBackMine = !CFG.clockReadBackMine;
  `, sandbox);
  check("flipping the clock switch flips the answer",
        vm.runInContext("__flip !== readBackMineNow()", sandbox) === true);
  vm.runInContext("exitClockMode(true);", sandbox);

  // the message-channel invariant (v129): loadSettings must
  // never come back with both channels off
  const chans = vm.runInContext(`
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(
      { clockSpeakMessages: false, clockShowMessages: false }));
    var c = loadSettings();
    [c.clockSpeakMessages, c.clockShowMessages];
  `, sandbox);
  check("messages always keep one channel (" + chans + ")",
        chans[0] === true || chans[1] === true);

  // ---- w10/w12: the account button is the identity ----
  vm.runInContext(`
    api.myId = "pawn76"; api.myName = "pawn76";
    renderAccount();
  `, sandbox);
  const btn = () => vm.runInContext(
    'document.getElementById("btnSignIn").textContent', sandbox);
  check("signed in: the button shows the name", btn() === "pawn76");
  vm.runInContext('api.myId = null; api.myName = null; renderAccount();',
                  sandbox);
  check("signed out: the button invites sign-in",
        btn() === "Sign in with Lichess");
  vm.runInContext(`
    api.myId = "pawn76"; api.myName = "pawn76"; renderAccount();
    __signInCalls = 0;
    signIn = function () { __signInCalls++; };
    document.getElementById("btnSignIn").on_click();
  `, sandbox);
  check("signed in: tapping the name does nothing",
        vm.runInContext("__signInCalls", sandbox) === 0);
  vm.runInContext(`
    api.myId = null; api.myName = null; renderAccount();
    document.getElementById("btnSignIn").on_click();
  `, sandbox);
  check("signed out: tapping it does sign in",
        vm.runInContext("__signInCalls", sandbox) === 1);

  // ---- w13: the status line follows the game ----
  const status = () => vm.runInContext(
    'document.getElementById("lichessLine").textContent', sandbox);
  vm.runInContext(`
    uiStatus("Challenge sent to maia1 - waiting.");
    api.gameId = "G1"; api.over = false;
    running = false; dryRun = false;
    renderStatus();
  `, sandbox);
  check("game start replaces the challenge message (" + status() + ")",
        /Tap the Start button/.test(status()));
  vm.runInContext('running = true; renderStatus();', sandbox);
  check("voice on: plain playing state (" + status() + ")",
        status() === "Playing.");
  vm.runInContext('api.over = true; renderStatus();', sandbox);
  check("game over reported (" + status() + ")", status() === "Game over.");
  vm.runInContext(`
    api.gameId = null; api.over = false;
    uiStatus("Seeking 5+3 casual...");
    renderStatus();
  `, sandbox);
  check("no game: the seek message stands (" + status() + ")",
        /Seeking/.test(status()));

  // ---- w14: game17 findings, carried into v133 ----
  // the dead mic: tapping the round button while speech
  // is in flight must not leave the mic off forever
  // DRIVE THE REAL startListening, NOT A COPY OF IT. This test
  // used to replace startListening with a harness-written
  // function that reimplemented the very guards it then
  // asserted - so mic.js could lose the `speaking` check
  // entirely and this would still pass. That is the w27/w28
  // failure exactly, reached through a stub instead of a grep.
  // The real function bails at its first line because the
  // sandbox has no SpeechRecognition; Rec is a global, so
  // handing it a counting constructor lets the true guards run.
  vm.runInContext(`
    __recBuilt = 0; __recStarted = 0;
    Rec = function () {
      __recBuilt++;
      this.start = function () { __recStarted++; };
      this.abort = function () {};
      this.stop = function () {};
    };
    running = true; listening = false; speaking = true;
    startListening();          // blocked, as during an announcement
  `, sandbox);
  check("mic refuses to start during speech",
        vm.runInContext("__recBuilt", sandbox) === 0);
  // v105: a silent refusal is how the game17 dead mic hid
  check("and says so in the log",
        /speech in flight/.test(
          vm.runInContext("LOG.slice(-3).join(' ')", sandbox)));
  vm.runInContext("speaking = false; startListening();", sandbox);
  check("mic starts once speech ends",
        vm.runInContext("__recBuilt", sandbox) === 1 &&
        vm.runInContext("__recStarted", sandbox) === 1);
  check("and the loop is marked live",
        vm.runInContext("listening", sandbox) === true);
  vm.runInContext("startListening();", sandbox);
  check("a second start while listening is refused",
        vm.runInContext("__recBuilt", sandbox) === 1);
  vm.runInContext("running = false; listening = false; startListening();",
                  sandbox);
  check("and it will not start with the voice loop off",
        vm.runInContext("__recBuilt", sandbox) === 1);
  // put the sandbox back to no-recogniser, which is what every
  // other test in this file has run under
  vm.runInContext(`
    clearTimeout(restartTimer);
    recognition = null; listening = false; Rec = null;
  `, sandbox);

  // ---- v134: the read-back race (game24) ----
  // whichever of the stream and the 200 arrives first
  // speaks; the loser finds the arm gone and says nothing
  vm.runInContext(`
    api.myColor = "w"; api.over = false;
    CFG.readBackMine = true;
    armedUci = "e2e4";
  `, sandbox);
  heard();
  vm.runInContext('readBackMine("e4", "e2e4", true);', sandbox);
  await sleep(50);
  check("armed move read back once (" + "winner speaks" + ")",
        /echo 4/.test(heard().join(" ")));
  vm.runInContext('readBackMine("e4", "e2e4", true);', sandbox);
  await sleep(50);
  check("the loser of the race says nothing", heard().length === 0);
  vm.runInContext('armedUci = "e2e4";' +
                  'readBackMine("e5", "e7e5", true);', sandbox);
  await sleep(50);
  check("a move we did not post is ignored", heard().length === 0);
  vm.runInContext('readBackMine("Qh7#", "e2e4", true);', sandbox);
  await sleep(50);
  check("mate is never read back (the result line says it)",
        heard().length === 0);
  vm.runInContext("armedUci = null;", sandbox);

  // ---- v134: the clock strip capitalises its sentences ----
  check("sentenceCase paints for the glass only",
        vm.runInContext('sentenceCase("checkmate. white wins.")',
                        sandbox) === "Checkmate. White wins.");

  // "tags" heard for "takes", game17
  check('"tags" counts as takes',
        vm.runInContext('!!TAKE_WORDS["tags"] && !!TAKE_WORDS["tag"]',
                        sandbox) === true);
  // "text" for "takes", game w43-1 at 17:31:04, where it lost
  // the move. Asked of the built vocabulary, then proved
  // through the real pipeline further down.
  check('"text" counts as takes (w44)',
        vm.runInContext('!!TAKE_WORDS["text"] && !!TAKE_WORDS["texts"]',
                        sandbox) === true);

  // ---- v136/w26: cancel closes a repair question ----
  // reproduce game w25-1 18:42:47: a bishop with half a
  // square, the rank asked for, then "cancel"
  vm.runInContext(`
    dryRun = true; running = true;
    pending = null; confirmAction = null;
    partialAsk = null; pieceAsk = null;
    dryStart();
  `, sandbox);
  await sleep(200); heard();          // let practice's own reply land FIRST
  // THEN the position: a board where "bishop bravo" is
  // genuinely half a square - Bc3 reaches b2 and b4, Bc6
  // reaches b5 and b7. (The start position cannot raise
  // this question at all: no bishop can move. The first
  // draft of this test used it and proved nothing, and the
  // second set the board before practice's stray reply,
  // which moved a bishop and flipped the turn - the
  // utterance was then correctly ignored as "not your
  // move". Both drafts failed for reasons that had nothing
  // to do with the fix under test.)
  vm.runInContext(`
    api.pos = new RULES.Position("k7/8/2B5/8/8/2B5/8/K7 w - - 0 1");
    api.moves = []; api.myColor = "w"; api.over = false;
  `, sandbox);
  say("bishop bravo");
  await sleep(120);
  const asked = heard().join(" | ");
  check("half a square asks for the missing half (" + asked + ")",
        /say the rank/i.test(asked) &&
        vm.runInContext("!!partialAsk", sandbox) === true);
  say("cancel");
  await sleep(120);
  const cancelled = heard().join(" | ");
  check("cancel is ANSWERED, not silent (" + cancelled + ")",
        /cancelled/i.test(cancelled));
  check("the question is actually closed",
        vm.runInContext("!partialAsk && !pieceAsk", sandbox) === true);
  await sleep(120); heard();

  // ---- v135/w23: the starting switches are logged ----
  const bootLine = vm.runInContext(
    'LOG.filter(function (l) { return l.indexOf("loaded:") >= 0; })[0] || ""',
    sandbox);
  check("boot logs every switch (" +
        bootLine.slice(bootLine.indexOf("loaded:")).slice(0, 40) + "...)",
        /loaded:/.test(bootLine) &&
        /confirmMyMove=(on|off)/.test(bootLine) &&
        /clockShowMessages=(on|off)/.test(bootLine) &&
        /voice=(system|\S+)/.test(bootLine));

  // ---- w21: first device findings ----
  vm.runInContext(`
    api.myColor = "w"; api.over = false;
    api.pos = { turn: "w" };
    renderTurn();
  `, sandbox);
  const turn = vm.runInContext(
    'document.getElementById("turnLine").textContent', sandbox);
  check('turn line: capitalised colour, no "that is you" (' + turn + ')',
        turn === "White to move." && !/that is you/.test(turn));

  // ---- w39: White and Black, and the ear-spelling ----
  const clocks = vm.runInContext(`
    (function () {
      api.myColor = "b"; api.wtime = 65000; api.btime = 30000;
      api.pos = { turn: "w" };
      renderPageClocks();
      return document.getElementById("clockLine").innerHTML;
    })()
  `, sandbox);
  check("clocks name the colours, White first (" +
        clocks.replace(/<[^>]+>/g, "") + ")",
        /White 1:05/.test(clocks) && /Black 0:30/.test(clocks) &&
        !/you|them/i.test(clocks));
  check("your own clock is still marked",
        /class="mine[^"]*">Black/.test(clocks));
  check("and marked low under a minute", /low[^"]*">Black/.test(clocks));
  // press Start with no token and listen, rather than
  // grepping the source for the string
  vm.runInContext(`
    running = false; dryRun = false;
    localStorage.removeItem("audioplay_lichess_token");
    TOKEN = "";
    // the Start button has no id - it is the first control
    // in the voice row, which is exactly how a finger finds
    // it too (w31 put it there)
    wrapEl.firstChild.children[0].on_click();
  `, sandbox);
  const startSaid = heard().join(" | ");
  check("signed out, Start says it for the EAR (" + startSaid + ")",
        /lee chess/.test(startSaid) && !/lichess/.test(startSaid));
  vm.runInContext("running = false; renderButton();", sandbox);
  // ---- w57: the manifest names every source, and only sources ----
  // Splitting dialogue.js into practice.js and repairs.js made
  // this concrete: a new file in src/ that nobody adds to the
  // manifest is simply NOT IN THE PAGE, and everything still
  // builds, still passes, and still runs - right up until
  // something calls a function that was never shipped. The
  // reverse is already caught (build.js exits on MISSING), so
  // this is the direction with no guard.
  const manifestNames = fs.readFileSync("manifest.txt", "utf8").split("\n")
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("#"))
    .map(s => s.replace(/^@template /, ""));
  const srcFiles = fs.readdirSync("src")
    .filter(f => /\.(js|html)$/.test(f));
  const missingFromManifest = srcFiles.filter(f => manifestNames.indexOf(f) < 0);
  const missingFromSrc = manifestNames.filter(f => srcFiles.indexOf(f) < 0);
  check("every file in src/ is named in the manifest (" +
        srcFiles.length + " files)" +
        (missingFromManifest.length ? " MISSING: " + missingFromManifest : ""),
        missingFromManifest.length === 0);
  // The reverse can never actually reach this line - the
  // harness loads the manifest's files at startup, so a name
  // with no file kills it with ENOENT before any test runs,
  // and build.js exits with MISSING besides. Asserted anyway,
  // because a check that documents which direction is guarded
  // by what is worth two lines.
  check("and the manifest names nothing that is not there" +
        (missingFromSrc.length ? " GHOST: " + missingFromSrc : ""),
        missingFromSrc.length === 0);

  const tmpl = fs.readFileSync("src/index.html", "utf8");
  // w56: the page must declare standards mode, and a doctype
  // anywhere but the FIRST line does nothing at all - so the
  // position is the assertion, not just the presence.
  //
  // Asked of the template rather than the built file on
  // purpose: CI runs this harness BEFORE build.js (the build
  // is the last step of checks.yml) and the root index.html is
  // gitignored, so reading the built page here passes locally
  // and fails on every clean checkout. build.js maps the
  // template line by line and replaces only the AUDIOPLAY_JS
  // line, so line one of the template IS line one of the page.
  check("the template opens with a doctype, on line one",
        /^<!doctype html>/i.test(tmpl.split("\n")[0].trim()));
  check("page button CSS is scoped to .panel",
        !/\n  button \{/.test(tmpl) && /\.panel button \{/.test(tmpl));
  check("the Voice panel hosts the buttons",
        tmpl.includes('id="panelControls"'));
  // ASK THE BUILT TREE (w54). This grepped ui.js for the
  // string 'el("panelControls")', which would pass on a page
  // that never called it, and is answered properly ten lines
  // down anyway - where the row's children are counted.
  check("the button row is re-parented into it",
        vm.runInContext(`
          (function () {
            var host = document.getElementById("panelControls");
            return !!host && host.children.indexOf(wrapEl) >= 0;
          })()
        `, sandbox) === true);

  // ---- w19: panel open/closed survives a reload ----
  vm.runInContext("savePanels();", sandbox);
  fakePanels[1].open = false;          // user collapses Lichess
  vm.runInContext("savePanels();", sandbox);
  fakePanels[1].open = true;           // markup default on reload
  vm.runInContext("restorePanels();", sandbox);
  check("a collapsed panel stays collapsed after reload",
        fakePanels[1].open === false);
  check("the other panels keep their state",
        fakePanels[0].open === true && fakePanels[2].open === true);

  // ---- w25: no double-tap zoom on the overlays ----
  // The built panels, not the source (w54). The old grep
  // matched the assignment wherever it appeared - including
  // inside the comment above it explaining why the viewport
  // meta cannot do this job.
  check("the overlays themselves get touch-action",
        vm.runInContext(`
          (function () {
            return [setPanel, logPanel].filter(Boolean).length === 2 &&
              [setPanel, logPanel].every(function (p) {
                return p.style.touchAction === "manipulation";
              });
          })()
        `, sandbox) === true);

  // ---- w29: the voice button is a labelled pill ----
  const btnState = () => vm.runInContext(`
    (function () {
      return { text: bigBtn.textContent,
               bg: bigBtn.style.background,
               primary: bigBtn.classList.contains("primary"),
               on: bigBtn.classList.contains("on") };
    })()
  `, sandbox);
  // THE STATE IS A CLASS, THE COLOUR IS THE STYLESHEET'S (w54).
  // These asserted the inline background, which is the thing
  // rule 6 says code must not be setting - so the test was
  // pinning the very habit that caused w21, w24 and w36. What
  // must hold is that the code says which state is current and
  // that the stylesheet gives that state its colour: both
  // halves are checked, on the built button and in the real
  // template (tmpl is read further up).
  vm.runInContext("running = false; renderButton();", sandbox);
  const offBtn = btnState();
  check("off: says what to do (" + offBtn.text + ")",
        /^\u25B6 Start$/.test(offBtn.text));
  check("off: marked as the page's primary control",
        offBtn.primary === true && offBtn.on === false);
  vm.runInContext("running = true; listening = true; renderButton();",
                  sandbox);
  const onBtn = btnState();
  check("on: says it is listening (" + onBtn.text + ")",
        /^\u25CF Listening$/.test(onBtn.text));
  check("on: marked as lit, not primary",
        onBtn.on === true && onBtn.primary === false);
  check("neither state paints a colour inline",
        !offBtn.bg && !onBtn.bg);
  check("and the stylesheet is what gives those two states colour",
        /\.panel button\.primary[^}]*var\(--accent\)/.test(tmpl) &&
        /\.panel button\.on\b[^}]*var\(--button-on\)/.test(tmpl));
  vm.runInContext("listening = false; renderButton();", sandbox);
  check("running but mic paused reads as on, not off",
        /^\u25CB On$/.test(btnState().text));
  // w32: the sizing is CLEARED so the stylesheet decides.
  // Checking the individual properties, not cssText - the
  // stub keeps whatever string was last assigned to cssText,
  // while a browser rewrites it as properties change.
  const sized = vm.runInContext(`
    (function () {
      var s = bigBtn.style;
      return { w: s.width, h: s.height, r: s.borderRadius,
               fs: s.fontSize, flex: s.flex, min: s.minWidth };
    })()
  `, sandbox);
  check("no 72px circle: the page's stylesheet sizes it now",
        sized.w === "" && sized.h === "" && sized.r === "" &&
        sized.fs === "" && sized.flex === "0 0 auto");
  check("only the width the stylesheet cannot know is set",
        sized.min === "124px");
  const others = vm.runInContext(`
    wrapEl.firstChild.children.slice(1).map(function (b) {
      return [b.style.fontSize, b.style.padding, b.style.flex].join("|");
    })
  `, sandbox);
  check("the other four are sized by the stylesheet too",
        others.every(s => s === "||0 0 auto"));
  vm.runInContext("running = false; listening = false; renderButton();",
                  sandbox);

  // every visible button label starts with a capital
  const labels = vm.runInContext(`
    (function () {
      var out = [];
      function collect(node) {
        (node.children || []).forEach(function (c) {
          if (c.tagName === "BUTTON" && c.textContent) {
            out.push(c.textContent);
          }
          collect(c);
        });
      }
      collect(wrapEl); collect(logPanel);
      return out;
    })()
  `, sandbox).filter(s => s && /[a-zA-Z]/.test(s));
  const lower = labels.filter(s => /^[\u25B6\u25CF\u25CB ]*[a-z]/.test(s));
  check("every button label is capitalised (" + labels.join(", ") + ")",
        lower.length === 0);

  // ---- w27/w28: the voice row runs button-first ----
  // Ask the built tree, not the source: w27's grep-the-file
  // test passed while the page was unchanged.
  const styled = vm.runInContext(`
    (function () {
      var host = document.getElementById("panelControls");
      var wrap = host && host.firstChild;
      var inner = wrap && wrap.firstChild;
      return {
        wrapKids: wrap ? wrap.children.length : -1,
        innerKids: inner ? inner.children.length : -1,
        innerDir: inner ? inner.style.flexDirection : "",
        wrapDir: wrap ? (wrap.style.flexDirection || "") : ""
      };
    })()
  `, sandbox);
  check("the row holding the buttons has all five " +
        "(" + styled.innerKids + " children)", styled.innerKids === 5);
  // w31: order is DOM order, so it survives wrapping
  const rowOrder = vm.runInContext(`
    wrapEl.firstChild.children.map(function (c) { return c.textContent; })
  `, sandbox);
  check("Start is first in the DOM (" + rowOrder.join(", ") + ")",
        /Start/.test(rowOrder[0]));
  // ask the built row, NOT the source: the first draft of
  // this check grepped ui.js for "row-reverse" and failed
  // on its own explanatory comment
  check("no row-reverse trick left - it wraps wrong on a phone",
        styled.innerDir !== "row-reverse");
  check("Practice sits furthest from Start (" +
        rowOrder[rowOrder.length - 1] + ")",
        /Practice/.test(rowOrder[rowOrder.length - 1]));

  // ---- w24: the settings panel anchors to its button ----
  // ASK THE BUILT PANEL. This grepped ui.js for four strings
  // until now, and one of the four had rotted into
  // `srcUi.includes(x) === srcUi.includes(x)` - a clause that
  // is true whatever the page does. The grep could not do
  // better: anchoring is the work of TWO click listeners (one
  // from buildUI, one from buildWebUI), and reading the file
  // says nothing about what happens when they both run. Open
  // the panel the way a tap does and read where it landed.
  const anchored = vm.runInContext(`
    (function () {
      setPanel.style.display = "none";     // start from closed
      settingsBtn.on_click();              // both real handlers
      var s = setPanel.style;
      var out = { display: s.display, top: s.top, left: s.left,
                  right: s.right, bottom: s.bottom };
      setPanel.style.display = "none";     // leave it as found
      return out;
    })()
  `, sandbox);
  // display proves buildUI's listener ran (it owns the toggle);
  // the released right/bottom prove buildWebUI's ran after it
  check("a tap opens the settings panel (" + anchored.display + ")",
        anchored.display === "block");
  check("settings panel anchored on both axes (top " + anchored.top +
        ", left " + anchored.left + ")",
        /^\d+px$/.test(anchored.top) && /^\d+px$/.test(anchored.left));
  check("and it lets go of the corner it was pinned to " +
        "(right " + anchored.right + ", bottom " + anchored.bottom + ")",
        anchored.right === "auto" && anchored.bottom === "auto");

  // ---- w33: time controls are presets ----
  // w34: the row is clean at load. Checked FIRST, before any
  // test picks anything - a later "reload" cannot be faked by
  // calling wireTimeRow, since a real reload starts a fresh
  // context and this state is simply the initial value.
  check("nothing picked at load",
        vm.runInContext("pickedTime === null", sandbox) === true &&
        vm.runInContext("selectedTimeControl()", sandbox) === null);
  check("no preset lit at load",
        tcButtons.every(b => b.classList._on === false));

  const tcs = tcButtons.map(b => b.getAttribute("data-tc"));
  check("nine presets, no bullet (" + tcs.join(" ") + ")",
        tcs.length === 9 && !tcs.includes("1+0") && !tcs.includes("2+1"));
  // picking one is remembered and read back as numbers
  const pick = tc => {
    tcButtons.find(b => b.getAttribute("data-tc") === tc).on_click();
  };
  pick("5+3");
  check("picked preset becomes the selected control",
        JSON.stringify(vm.runInContext("selectedTimeControl()", sandbox))
          === JSON.stringify({ minutes: 5, increment: 3 }));
  check("the picked one wears the green",
        tcButtons.find(b => b.getAttribute("data-tc") === "5+3")
          .classList._on === true);
  // custom: typing a valid #+# selects it; invalid never crashes
  vm.runInContext(`
    document.getElementById("timeCustom").value = " 20 + 15 ";
    document.getElementById("timeCustom").on_input();
  `, sandbox);
  check("custom parses with spaces",
        JSON.stringify(vm.runInContext("selectedTimeControl()", sandbox))
          === JSON.stringify({ minutes: 20, increment: 15 }));
  vm.runInContext(`
    document.getElementById("timeCustom").value = "banana";
  `, sandbox);
  check("invalid custom yields null, and seek would refuse",
        vm.runInContext("selectedTimeControl()", sandbox) === null);
  // w36: the custom box shows picked the same way the
  // presets do - one class, one CSS rule, no inline colours
  // that can leave black text on a green field
  vm.runInContext(`
    document.getElementById("timeCustom").value = "40+30";
    document.getElementById("timeCustom").on_input();
  `, sandbox);
  const boxEl = () => vm.runInContext(`
    (function () {
      var b = document.getElementById("timeCustom");
      return { picked: b.classList.contains("picked"),
               bg: b.style.background || "", fg: b.style.color || "" };
    })()
  `, sandbox);
  const cust = boxEl();
  check("custom box marks itself picked by class",
        cust.picked === true && cust.bg === "" && cust.fg === "");
  vm.runInContext('pickTime("5+0");', sandbox);
  check("and unmarks when a preset is picked",
        boxEl().picked === false);
  const tmplCss = fs.readFileSync("src/index.html", "utf8");
  check("the box has a colour of its own (the w36 bug)",
        /#timeCustom \{[^}]*color:/.test(tmplCss) &&
        /#timeCustom\.picked \{[^}]*color:/.test(tmplCss));

  // w37: tapping back into a custom time re-picks it
  vm.runInContext(`
    document.getElementById("timeCustom").value = "40+30";
    document.getElementById("timeCustom").on_input();
    pickTime("10+0");
  `, sandbox);
  check("a preset takes the pick from the custom box",
        vm.runInContext("pickedTime", sandbox) === "10+0");
  vm.runInContext('document.getElementById("timeCustom").on_focus();',
                  sandbox);
  check("focusing the unchanged custom box picks it again",
        vm.runInContext("pickedTime", sandbox) === "custom" &&
        JSON.stringify(vm.runInContext("selectedTimeControl()", sandbox))
          === JSON.stringify({ minutes: 40, increment: 30 }));
  // an empty box must not steal the pick just by being tapped
  vm.runInContext(`
    pickTime("5+0");
    document.getElementById("timeCustom").value = "";
    document.getElementById("timeCustom").on_focus();
  `, sandbox);
  check("focusing an empty box leaves the preset alone",
        vm.runInContext("pickedTime", sandbox) === "5+0");

  // w35: a LATER visit restores what was chosen. A reload is
  // modelled as the two things a reload really does: fresh
  // page state (pickedTime back to null, box empty) with
  // storage surviving - then wireTimeRow, which is what boot
  // calls. Storage is inspected directly so the test cannot
  // pass on in-memory state alone.
  vm.runInContext('pickTime("30+20");', sandbox);
  check("picking writes it to storage",
        vm.runInContext('localStorage.getItem("audioplay.web.timecontrol")',
                        sandbox) === "30+20");
  const reload = () => vm.runInContext(`
    (function () {
      pickedTime = null;
      document.getElementById("timeCustom").value = "";
      wireTimeRow();
      return { picked: pickedTime,
               tc: JSON.stringify(selectedTimeControl()),
               box: document.getElementById("timeCustom").value };
    })()
  `, sandbox);
  const back = reload();
  check("a later visit restores the preset (" + back.picked + ")",
        back.picked === "30+20" &&
        back.tc === JSON.stringify({ minutes: 30, increment: 20 }));
  // a custom time comes back too, box and all
  vm.runInContext(`
    document.getElementById("timeCustom").value = "25+15";
    document.getElementById("timeCustom").on_input();
  `, sandbox);
  const backCustom = reload();
  check("a later visit restores a custom time (" + backCustom.box + ")",
        backCustom.picked === "custom" && backCustom.box === "25+15" &&
        backCustom.tc === JSON.stringify({ minutes: 25, increment: 15 }));
  // junk in storage leaves a CLEAN row, not a broken one
  vm.runInContext(`
    localStorage.setItem("audioplay.web.timecontrol", "banana");
  `, sandbox);
  check("unreadable storage reads as never chosen",
        reload().picked === null);
  vm.runInContext('localStorage.removeItem("audioplay.web.timecontrol");',
                  sandbox);

  // acting with nothing picked names the missing thing and
  // sends nothing. (The repaint tick rewrites the status line
  // twice a second, so this reads it immediately, with no
  // await in between.)
  // the real startSeek is put back at the end of this block.
  // These tests are about the BUTTON's wiring, so counting the
  // calls is the right stub - but it was never restored, and a
  // stub that outlives its test silently disarms every later
  // one that touches the same name (the token-leak test at the
  // foot of this file was driving this counter, not the seek).
  vm.runInContext("__realSeek = startSeek;", sandbox);
  const seekWith = (picked) => vm.runInContext(`
    (function () {
      pickedTime = ${picked};
      document.getElementById("timeCustom").value = "";
      api.myId = "pawn76"; api.myName = "pawn76"; api.gameId = null;
      __seeks = 0; startSeek = function () { __seeks++; };
      document.getElementById("btnSeek").on_click();
      return { said: document.getElementById("lichessLine").textContent,
               seeks: __seeks };
    })()
  `, sandbox);
  const none = seekWith("null");
  check("nothing picked: says so, seeks nothing (" + none.said + ")",
        /Pick a time control first/.test(none.said) && none.seeks === 0);
  const bad = seekWith('"custom"');
  check("bad custom: says THAT instead (" + bad.said + ")",
        /looks like 10\+5/.test(bad.said) && bad.seeks === 0);
  const good = vm.runInContext(`
    (function () {
      pickTime("10+5");
      __seeks = 0;
      document.getElementById("btnSeek").on_click();
      return __seeks;
    })()
  `, sandbox);
  check("a picked control actually seeks", good === 1);
  vm.runInContext("pickTime(null); startSeek = __realSeek;", sandbox);

  // ---- w22: the instructions panel ----
  const tm = fs.readFileSync("src/index.html", "utf8");
  check("instructions panel exists, collapsible, at the bottom",
        tm.includes('id="panelInstructions"') &&
        tm.indexOf('id="panelInstructions"') >
          tm.indexOf('id="panelLichess"'));
  check("sign-in paragraph reworded",
        tm.includes("3 things on your behalf") &&
        !tm.includes("cannot change your account"));
  const lichessPanel = tm.slice(tm.indexOf('id="panelLichess"'),
                                tm.indexOf('id="panelInstructions"'));
  check("hints no longer crowd the Lichess panel",
        !lichessPanel.includes("SYSTEM voice") &&
        !lichessPanel.includes("round button starts"));

  // ---- w20: the web deltas themselves ----
  // delta 2: sign-in owns the connection - the voice-off path
  // must not abort the game stream
  // DRIVEN, NOT REGEXED (w54). This read an 800-character
  // window of ui.js ending at the string "voice play off" and
  // asserted three identifiers were absent from it - a test
  // whose result changes if someone adds a paragraph of
  // comment above the function, and which says nothing at all
  // about what happens when the button is actually pressed.
  // Press it, and watch what gets called.
  const offBehaviour = vm.runInContext(`
    (function () {
      var calls = [];
      var realStop = stopPolling, realRe = scheduleReconnect;
      var realAbort = streamAbort;
      stopPolling = function () { calls.push("stopPolling"); };
      scheduleReconnect = function () { calls.push("scheduleReconnect"); };
      streamAbort = { abort: function () { calls.push("streamAbort"); } };
      api.gameId = "G9"; api.over = false; dryRun = false;
      running = true;
      bigBtn.on_click();                 // turn voice OFF
      var out = { calls: calls, running: running };
      stopPolling = realStop; scheduleReconnect = realRe;
      streamAbort = realAbort;
      return out;
    })()
  `, sandbox);
  check("the button turns voice off", offBehaviour.running === false);
  check("and voice off tears down no network (" +
        (offBehaviour.calls.join(",") || "nothing") + ")",
        offBehaviour.calls.length === 0);

  // delta 3: leaving practice rejoins through the account API
  const practiceOff = vm.runInContext(`
    (function () {
      var called = 0;
      var real = rejoinCurrent;
      rejoinCurrent = function () { called++; };
      dryRun = true;
      practiceBtn.on_click();            // leave practice
      rejoinCurrent = real;
      return { called: called, dry: dryRun };
    })()
  `, sandbox);
  check("leaving practice actually leaves it", practiceOff.dry === false);
  check("and rejoins a live game through the account API",
        practiceOff.called === 1);
  // THE USERSCRIPT IS FROZEN AT v137 (Aug 5 2026): its
  // identity is the canon FILE, not continued buildability.
  // The numbered section files now serve the website and may
  // change freely - so the userscript is no longer rebuilt
  // and compared. What is guarded instead is the artifact:
  // the canon file and its recorded fingerprint must never
  // drift, because it is the owner's installed fallback.
  const crypto = require("crypto");
  const frozen = fs.readFileSync("frozen-userscript/userscript-frozen.sha256", "utf8").trim();
  const canonSha = crypto.createHash("sha256")
    .update(fs.readFileSync("frozen-userscript/lichess_audioplay.js")).digest("hex");
  check("frozen userscript artifact untouched (v137)",
        canonSha === frozen);

  // ---- w40: a capture may name its ORIGIN ----
  // Game w39-1, 14:29:28 to 14:30:03: four ways of saying
  // "the e-pawn takes" refused in a row, then the long form
  // accepted. Each utterance is driven on the board it was
  // actually spoken on. setBoard is used everywhere below
  // because practice's own random reply moves a piece and
  // flips the turn - see the note at the bishop test above.
  // PRACTICE'S RANDOM REPLY IS NOISE IN EVERY TEST BELOW, AND
  // IT WAS CORRUPTING THEM. A test that plays a move leaves an
  // opponent reply on a 1600ms timer (dialogue.js). Install a
  // position before it fires and it lands in the NEW one: it
  // moves a piece, bumps api.moves.length, and every open
  // question goes instantly stale, because pieceAsk and
  // partialAsk are both ply-guarded. The answer then comes back
  // "ignored, not a move" and the test fails for a reason that
  // has nothing to do with what it is testing. The comment on
  // the bishop test above learned this the same way.
  //
  // Sleeping it off was the first attempt and it is the wrong
  // shape: it makes every helper wait 1.7s and it still races.
  // These tests set their own position, so the random opponent
  // has no part in them at all - so it is switched off, and
  // that now calls off the one already in flight too.
  //
  // It could not, until w54. acceptMove scheduled the reply as
  // setTimeout(dryOpponentReply, 1600), which captures the
  // function REFERENCE, so this stub only affected replies
  // scheduled afterwards and the in-flight one still ran the
  // original - hence the 1.7-second sleep that used to sit
  // here, absorbing it. dialogue.js now schedules a call by
  // name, so the stub takes effect immediately and the wait is
  // gone along with the race the old comment admits to.
  vm.runInContext("dryOpponentReply = function () {};", sandbox);
  heard();

  async function setBoard(fen) {
    heard();
    vm.runInContext(`
      dryRun = true; running = true;
      pending = null; confirmAction = null;
      partialAsk = null; pieceAsk = null;
      api.pos = new RULES.Position(${JSON.stringify(fen)});
      api.moves = []; api.myColor = "w"; api.over = false;
    `, sandbox);
    heard();
  }
  async function onBoard(fen, utt, want, name) {
    await setBoard(fen);
    say(utt);
    await sleep(120);
    const out = heard().join(" | ");
    check((name || utt) + " (" + (out || "silence") + ")", want.test(out));
  }

  // 1.e4 Nf6 2.e5 c6 - the game position. The ONLY capture
  // from e5, and the only one from the whole e-file, is exf6.
  const GAME = "rnbqkb1r/pp1ppppp/2p2n2/4P3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3";
  const takesF6 = /echo takes foxtrot 6/i;
  await onBoard(GAME, "echo five takes", takesF6);
  await onBoard(GAME, "echo takes", takesF6);
  await onBoard(GAME, "pawn echo five takes", takesF6);
  await onBoard(GAME, "echo five takes night", takesF6);
  // the long form, which already worked, still works
  await onBoard(GAME, "echo five takes foxtrot six", takesF6);

  // nothing to take: a TRUE sentence, not "not a legal move"
  await onBoard("k7/8/8/4P3/8/8/8/K7 w - - 0 1", "echo five takes",
                /no capture from echo 5/i);
  await onBoard("k7/8/8/4P3/8/8/8/K7 w - - 0 1", "echo takes",
                /no capture from the echo file/i);

  // TWO victims from one origin: ask, never guess
  await setBoard("k7/8/3n1n2/4P3/8/8/8/K7 w - - 0 1");
  say("echo five takes");
  await sleep(120);
  const twoWays = heard().join(" | ");
  check("two victims ask instead of guessing (" + twoWays + ")",
        /did you mean/i.test(twoWays) &&
        vm.runInContext("!!pending", sandbox) === true);
  say("yes");
  await sleep(120);
  check("and yes plays one of them",
        /echo takes (delta 6|foxtrot 6)/i.test(heard().join(" | ")));

  // THE DESTINATION FORM SURVIVES UNTOUCHED: white pawn d4,
  // black pawn e5, and "takes echo five" is still dxe5.
  //
  // The repair is additive - it runs only where the ordinary
  // reading came back empty - so on THIS board "echo five
  // takes" also plays dxe5, and that is correct rather than a
  // near miss. For a whole square the two readings can never
  // both be live: if e5 carries a piece of ours the origin
  // reading has something to work with and nothing of ours can
  // capture onto its own square; if it carries theirs the
  // origin reading is empty and only the destination reading
  // remains. One capture in the room either way.
  const D4E5 = "k7/8/8/4p3/3P4/8/8/K7 w - - 0 1";
  await onBoard(D4E5, "takes echo five", /delta takes echo 5/i,
                'the destination form survives: "takes echo five"');
  await onBoard(D4E5, "echo five takes", /delta takes echo 5/i,
                "a live destination reading is never overridden");

  // The one deliberate reordering: "pawn echo takes" used to
  // reach the half-square repair, which reads a dangling file
  // as the DESTINATION file - here that would be dxe5. With a
  // take word the file is the origin, so it must be exf3.
  await onBoard("k7/8/8/4p3/3P4/5n2/4P3/K7 w - - 0 1", "pawn echo takes",
                /echo takes foxtrot 3/i,
                '"pawn echo takes" is the e-pawn, not the e-file target');

  // ---- w41: file takes file, and who counts as "on the file" ----
  // UNIQUENESS SPANS PIECES, NOT JUST PAWNS. "echo takes" can
  // be the e-pawn or a piece on the e-file whose name the mic
  // ate, so both must be counted before anything is played.
  // Here Rxe7 and exf3 are both captures from the e-file.
  await setBoard("4k3/4p3/8/4R3/8/5n2/4P3/K7 w - - 0 1");
  say("echo takes");
  await sleep(120);
  const eFile = heard().join(" | ");
  check("a PIECE on the file counts too, so it asks (" + eFile + ")",
        /did you mean/i.test(eFile) &&
        vm.runInContext("!!pending", sandbox) === true);
  // and with the rook gone it is the pawn's alone, played
  await onBoard("4k3/4p3/8/8/8/5n2/4P3/K7 w - - 0 1", "echo takes",
                /echo takes foxtrot 3/i,
                "one capture left on the file plays at once");

  // FILE TAKES FILE. 1.c4 d5 2.Nc3 a6: "charlie takes delta"
  // is cxd5 OR Nxd5 with the knight's name lost, so it asks.
  await onBoard("rnbqkbnr/1pp1pppp/p7/3p4/2P5/2N5/PP1PPPPP/R1BQKBNR w KQkq - 0 3",
                "charlie takes delta", /did you mean/i,
                '"charlie takes delta" with cxd5 AND Nxd5 asks');
  // 1.c4 d5: only the pawn can do it, so it plays at once
  await onBoard("rnbqkbnr/ppp1pppp/8/3p4/2P5/8/PP1PPPPP/RNBQKBNR w KQkq - 0 2",
                "charlie takes delta", /charlie takes delta 5/i,
                '"charlie takes delta" with only cxd5 plays');
  // the target half is NAMED when nothing fits, or the
  // sentence blames the wrong file
  await onBoard("rnbqkbnr/ppp1pppp/8/3p4/2P5/8/PP1PPPPP/RNBQKBNR w KQkq - 0 2",
                "charlie takes hotel",
                /no capture from the charlie file onto the hotel file/i,
                "a target that fits nothing is named in the refusal");
  // an origin SQUARE with a target file, same machinery
  await onBoard(GAME, "echo five takes foxtrot", takesF6,
                '"echo five takes foxtrot" resolves to exf6');
  // and the form that already worked is still untouched: a
  // lone file after "takes" with NO origin before it is still
  // the half-square repair's destination-file guess
  await onBoard("4k3/8/8/3Qn3/8/8/8/4K3 w - - 0 1", "queen takes",
                /queen takes echo 5/i,
                '"queen takes" still belongs to the v117 repair');

  // ---- w42: "takes charlie" needs no piece name ----
  // Game w41-1, 16:32:18. The owner said "takes charlie"
  // TWICE, got "Say again." both times, added the word "rook"
  // and played Rxc6 on the third. The sentence was complete;
  // the half-square repair just refused to run without a
  // piece. Replayed as the game actually went, rather than
  // from a FEN, so the position is checkable against the log.
  async function setGame(ucis) {
    heard();
    vm.runInContext(`
      dryRun = true; running = true;
      pending = null; confirmAction = null;
      partialAsk = null; pieceAsk = null;
      api.pos = new RULES.Position();
      ${JSON.stringify(ucis)}.forEach(function (u) { api.pos.applyUci(u); });
      api.moves = []; api.myColor = "w"; api.over = false;
    `, sandbox);
    heard();
  }
  const W41_GAME = ["c2c4","e7e6","b1c3","h7h6","d2d4","g8e7","e2e4","a7a6",
                    "b2b4","h8h7","f2f4","b7b6","g1f3","h6h5","h2h4","a6a5",
                    "d1a4","c8a6","b4a5","g7g5","f4g5","c7c6","a1b1","f7f5",
                    "b1b6","f8h6","g5h6","h7f7"];

  await setGame(W41_GAME);
  say("takes charlie");
  await sleep(120);
  const takesC = heard().join(" | ");
  // TWO captures land on the c-file here, Qxc6 and Rxc6, so
  // the honest answer is the question - not the rook. That is
  // the game6 count doing its job: the queen could also take
  // there, and the rook is what was meant.
  check('"takes charlie" is heard at all now (' + takesC + ")",
        !/say again/i.test(takesC));
  // w43 improved this case as well: Qxc6 and Rxc6 both land on
  // c6, so the rank is not the missing half here either and it
  // asks which piece. In the log this cost rank, then yes/no,
  // then no, then yes. It is now one question and one word.
  check("it names the movers, since both land on c6",
        /I heard takes charlie\./i.test(takesC) &&
        /queen takes charlie 6/i.test(takesC) &&
        /rook takes charlie 6/i.test(takesC));
  check("the lead is never \"undefined\"", !/undefined/i.test(takesC));
  say("rook");
  await sleep(120);
  check("and one word plays the rook capture from the log",
        /rook takes charlie 6/i.test(heard().join(" | ")));

  // the form that DID work in the log still works, unchanged
  await setGame(W41_GAME);
  say("rook takes charlie");
  await sleep(120);
  check("\"rook takes charlie\" still plays Rxc6 at once",
        /rook takes charlie 6/i.test(heard().join(" | ")));

  // one capture onto the file: play it, no question
  await onBoard("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1", "takes delta",
                /echo takes delta 5/i,
                "a unique piece-less capture onto a file plays");

  // REGRESSIONS. A named piece with half a square keeps its
  // own wording - the lead must still say the piece.
  await onBoard("4k3/8/8/3Q4/8/8/8/4K3 w - - 0 1", "queen alpha",
                /I heard queen alpha\. Say the rank/i,
                "a named piece still leads with the piece");
  // and a dangling file with NO take word must stay inert: a
  // square with no piece named is a push, never a piece move
  await setGame(W41_GAME);
  say("charlie");
  await sleep(120);
  const bareFile = heard().join(" | ");
  check("a bare file without \"takes\" is still not a move (" +
        bareFile + ")",
        !/did you mean/i.test(bareFile) && !/takes/i.test(bareFile));

  // ---- w43: ask about the half that actually narrows ----
  // Game w42-1, 16:51:44. "takes delta" with Nxd5 and cxd5 on
  // the board asked for the RANK - and both fits land on d5,
  // so the question had exactly one possible answer and could
  // not discriminate. "three" and "four" fit nothing, "five"
  // got back to where it started, and "knight" said in the
  // middle of it was ignored entirely.
  const W42_GAME = ["d2d4","b8a6","c2c4","d7d5","b1c3","e7e6"];

  await setGame(W42_GAME);
  say("takes delta");
  await sleep(120);
  const takesD = heard().join(" | ");
  check("it no longer asks for a rank it already knows (" +
        takesD + ")", !/say the rank/i.test(takesD));
  check("it asks WHICH PIECE, offering the knight and the pawn",
        /knight takes delta 5/i.test(takesD) &&
        /charlie takes delta 5/i.test(takesD));
  // w44: THE LEAD MUST NOT CLAIM A RANK NOBODY SAID. "takes
  // delta" was answered "I heard takes delta 5" - true move,
  // false sentence. The deduced square belongs in the options,
  // which name the whole move, never in the "I heard" clause.
  const lead = takesD.split(/ say /i)[0];
  check("the lead repeats only what was said (" + lead + ")",
        /I heard takes delta\./i.test(lead) && !/[1-8]/.test(lead));
  say("night");
  await sleep(120);
  check("and the piece answers it in one word",
        /knight takes delta 5/i.test(heard().join(" | ")));

  // the pawn is offered by its FILE, and answers by its file
  await setGame(W42_GAME);
  say("takes delta");
  await sleep(120); heard();
  say("charlie");
  await sleep(120);
  check("a file answers for the pawn that stands on it",
        /charlie takes delta 5/i.test(heard().join(" | ")));

  // REGRESSION: when the fits really do span ranks, the rank
  // question is still the right one. Rxd7 and Nxd5 differ in
  // destination, so "say the rank" narrows for real.
  await onBoard("4k3/8/8/3n4/8/2Nb4/2P5/4K3 w - - 0 1", "takes delta",
                /say the rank/i,
                "fits spanning ranks still ask for the rank");
  // and a piece name now answers THAT question too, instead of
  // falling silently through it
  say("night");
  await sleep(120);
  check("a piece name answers a rank question (w43)",
        /knight takes delta 5/i.test(heard().join(" | ")));

  // REGRESSION: a named piece with half a square is untouched
  await onBoard("4k3/8/8/3Q4/8/8/8/4K3 w - - 0 1", "queen alpha",
                /I heard queen alpha\. Say the rank/i,
                "a named piece with half a square still asks the rank");

  // and the whole utterance that was lost, driven for real:
  // "text delta" must reach the same question "takes delta"
  // does, not "Say again."
  await onBoard("4k3/8/8/3n4/8/2Nb4/2P5/4K3 w - - 0 1", "text delta",
                /say the rank/i,
                '"text delta" is heard as a capture (w44)');

  // ---- PROPERTY: "I heard" never claims what was not said ----
  // The unit-level properties live in property_check.js, which
  // runs the parser and matcher over hundreds of thousands of
  // generated utterances. Two invariants cannot be checked
  // there because they are about what the page SAYS, not about
  // which moves it finds, and saying things is the whole job:
  //
  //   1. every utterance with a content word in it gets an
  //      answer (CLAUDE.md rule 5 - silence reads as "not
  //      heard", never as "done")
  //   2. an "I heard ..." lead repeats only what was spoken
  //      (w44 - it is the one sentence that makes a claim about
  //      the USER, and the owner is across the room with it as
  //      his only evidence)
  //
  // Generated rather than listed, because w44 was a lie that a
  // hand-written test asserted verbatim and therefore blessed.
  const FILE_WORD = { a: "alpha", b: "bravo", c: "charlie", d: "delta",
                      e: "echo", f: "foxtrot", g: "golf", h: "hotel" };
  const RANK_WORD = { 1: "one", 2: "two", 3: "three", 4: "four",
                      5: "five", 6: "six", 7: "seven", 8: "eight" };
  const spokenForms = [];
  Object.keys(FILE_WORD).forEach(f => {
    spokenForms.push("takes " + FILE_WORD[f]);
    spokenForms.push(FILE_WORD[f] + " takes");
    spokenForms.push("queen " + FILE_WORD[f]);
    spokenForms.push(FILE_WORD[f] + " five takes");
    spokenForms.push("queen " + FILE_WORD[f] + " four");
    spokenForms.push(FILE_WORD[f] + " takes knight");
  });
  const boards = [
    ["1.c4 d5 2.Nc3 a6", null, W42_GAME],
    ["the w41 game at 16:32", null, W41_GAME]
  ];
  let heardClaims = 0, silences = 0, lies = 0, worst = "";
  for (const [, , game] of boards) {
    for (const utt of spokenForms) {
      await setGame(game);
      say(utt);
      await sleep(60);
      const out = heard().join(" | ");
      if (!out) { silences++; worst = worst || ("silent on: " + utt); continue; }
      // NOTHING SPOKEN MAY CONTAIN "undefined" (w54). One
      // hand-picked utterance was checked for this and the
      // whole generated battery was not - and this is the
      // cheapest possible check on a class of bug that is
      // pure embarrassment out loud: a missing table entry,
      // a renamed field, a piece with no spoken name. The
      // owner hears "I heard queen undefined" across a room
      // and has no idea what the program thinks it heard.
      if (/undefined|\[object|NaN/i.test(out)) {
        lies++;
        worst = worst || ('said "' + utt + '" -> spoke a placeholder: "' +
                          out + '"');
      }
      // A REFUSAL MUST CARRY THE READING. Checking only the
      // sentences that already say "I heard" leaves the way
      // out wide open: delete the clause and the property
      // stops looking. That mutant survived when this block
      // was first written, which is the same blind spot the
      // from-square property had this morning - a rule that
      // only inspects what already obeys it.
      //
      // The one legitimate bare refusal is an utterance that
      // parsed to NOTHING: there is no reading to give back,
      // and we cannot tell a mishearing from words that were
      // never a move. Ask the parser which case this is
      // rather than guessing from the text.
      if (/say again/i.test(out)) {
        const empty = vm.runInContext(
          "reqIsEmpty(parseTranscript(" + JSON.stringify(utt) + "))", sandbox);
        if (!empty && !/I heard/i.test(out)) {
          lies++;
          worst = worst ||
            ('said "' + utt + '" -> refused with no reading: "' + out + '"');
        }
      }
      const m = /I heard ([^.]*)\./i.exec(out);
      if (!m) continue;
      heardClaims++;
      const lead = m[1].toLowerCase();
      const bad = why => {
        lies++;
        worst = worst ||
          ('said "' + utt + '" -> "I heard ' + m[1] + '" (' + why + ")");
      };
      // EXACTLY WHAT WAS SAID: nothing added, nothing dropped.
      // w44 only checked the first half - that no rank appears
      // unless one was spoken - and that let the other half
      // through: heardSoFar rendered no squares at all, so
      // "queen delta four" came back as "queen" and nobody
      // noticed until the refusals started using it. A
      // read-back that swallows half the sentence fails the
      // same job as one that invents: the owner cannot tell a
      // mishearing from a bad move either way.
      const saidRank = Object.keys(RANK_WORD)
        .some(r => utt.indexOf(RANK_WORD[r]) >= 0);
      if (!saidRank && /[1-8]/.test(lead)) bad("rank nobody said");
      if (saidRank && !/[1-8]/.test(lead)) bad("rank dropped");
      Object.keys(FILE_WORD).forEach(f => {
        const said = utt.indexOf(FILE_WORD[f]) >= 0;
        const heardIt = lead.indexOf(FILE_WORD[f]) >= 0;
        if (heardIt && !said) bad(FILE_WORD[f] + " nobody said");
        if (said && !heardIt) bad(FILE_WORD[f] + " dropped");
      });
      // and the take word, which is what tells a capture from
      // a push - the one word that changes what a sentence
      // MEANS rather than which square it points at
      if (/\btakes?\b/.test(utt) !== /\btakes?\b/.test(lead)) {
        bad("take word " + (/takes?/.test(utt) ? "dropped" : "invented"));
      }
    }
  }
  check("every utterance got an answer (" +
        (spokenForms.length * boards.length) + " driven, " +
        heardClaims + ' made an "I heard" claim)',
        silences === 0);
  check('no "I heard" claimed anything unsaid' +
        (worst ? " (" + worst + ")" : ""), lies === 0);

  // ---- w45: two false sentences from game w44-1 ----
  const W44_GAME = ["e2e4","c7c6","d2d4","h7h6","c2c4","g7g6","f2f4","h8h7",
                    "g2g4","h7h8","h2h4","g6g5","h4g5","f7f6"];

  // 17:49:08. "golf takes night" - no knight to take, but gxh6
  // and gxf6 both sit there legal, so "No capture from the golf
  // file" blamed the wrong half of the sentence.
  await setGame(W44_GAME);
  say("golf takes night");
  await sleep(80);
  const noKnight = heard().join(" | ");
  check("a missing VICTIM is named, not blamed on the file (" +
        noKnight + ")", /knight/i.test(noKnight));
  check("and it does not claim there is no capture from the file",
        !/^No capture from the golf file\. Say again\./i.test(noKnight));
  // the file really is empty of captures -> the old sentence, correctly
  await onBoard("4k3/8/8/8/8/8/6P1/4K3 w - - 0 1", "golf takes",
                /no capture from the golf file/i,
                "an empty file still says so plainly");

  // 17:50:11. "takes delta" offered Qxd6, cxd6 and exd6; answering
  // "pawn" was refused with "no pawn can take there" while two of
  // the three options were pawn captures.
  await setGame(W44_GAME.concat(["e4e5","c6c5","d4c5","d7d6"]));
  say("takes delta");
  await sleep(80);
  const askedD = heard().join(" | ");
  check("the question offers the queen and both pawns (" + askedD + ")",
        /queen takes delta 6/i.test(askedD) &&
        /charlie takes delta 6/i.test(askedD) &&
        /echo takes delta 6/i.test(askedD));
  say("pawn");
  await sleep(80);
  const saidPawn = heard().join(" | ");
  check('"pawn" is no longer refused as impossible (' + saidPawn + ")",
        !/no pawn can take there/i.test(saidPawn));
  check('"pawn" narrows to the pawn captures and offers one',
        /(charlie|echo) takes delta 6/i.test(saidPawn) &&
        !/queen takes delta 6/i.test(saidPawn));
  // a named piece that genuinely cannot is still told so
  await setGame(W44_GAME.concat(["e4e5","c6c5","d4c5","d7d6"]));
  say("takes delta");
  await sleep(80); heard();
  say("bishop");
  await sleep(80);
  check("a piece that truly cannot take there is still refused",
        /no bishop can take there/i.test(heard().join(" | ")));

  // ---- w47: three things game w46-1 turned up ----

  // 19:19:24. Answering a question offered bxa4 and then bxa8
  // FOUR TIMES - queen, rook, bishop, knight. findMoves has
  // collapsed promotions for years; the six repair sites each
  // built their own candidate list and none of them did. Here
  // the four bxa8 variants are the ONLY captures from the
  // b-file, so before the fix this asked, and after it plays.
  await onBoard("r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1", "bravo takes",
                /bravo takes alpha 8, promotes to queen/i,
                "promotion variants collapse to one candidate");
  // and naming the piece still gets that piece
  await onBoard("r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1",
                "bravo takes alpha eight equals rook",
                /promotes to rook/i,
                "an underpromotion said out loud is still honoured");

  // 19:12:51 and 19:22:19. "Rook Delta" - a piece and a file,
  // said plainly - got a bare "Say again." twice, because
  // reqIsEmpty counts only castle, squares and victim, so this
  // read as nothing heard at all.
  await onBoard("4k3/8/8/8/8/8/8/R2QK3 w - - 0 1", "rook delta",
                /I heard rook delta\. That is not a legal move/i,
                '"rook delta" gets its reading back, not a bare refusal');
  // an utterance with genuinely nothing in it still gets the
  // bare sentence - there is no reading to repeat
  await setBoard("4k3/8/8/8/8/8/8/R2QK3 w - - 0 1");
  say("wobble");
  await sleep(80);
  const noise = heard().join(" | ");
  check("noise with no move in it stays bare (" + noise + ")",
        /say again/i.test(noise) && !/I heard/i.test(noise));

  // 19:26:49. "takes golf five" was refused with "No pawn can
  // GO there" - he had said takes. The verb has to match the
  // sentence it answers.
  await onBoard("4k3/8/8/6p1/8/5N2/8/4K1R1 w - - 0 1", "takes golf five",
                /no pawn can take there/i,
                "a capture is refused with the capture verb");
  // the push wording needs an EMPTY target: with a piece
  // standing on g5 the request takes the "that would be a
  // capture" branch instead, which is a different sentence.
  // The first draft of this test asserted the push wording on
  // the capture board and failed for that reason - the
  // position, not the code.
  await onBoard("4k3/8/8/8/8/5N2/8/4K1R1 w - - 0 1", "golf five",
                /no pawn can go there/i,
                "and a push is still refused with the push verb");

  // ---- w48: the pawn word, and the question it was asked ----
  // Game w47-1, 20:09:24. "pawn takes" with bxc6 and dxc6 both
  // available was answered "Say the target" - and both take on
  // c6. The owner filed a memo mid-game saying exactly that.
  // w43 had already taught this to the half-square repair; the
  // capture repair next door never got it.
  await onBoard("4k3/8/2n5/1P1P4/8/8/8/4K3 w - - 0 1", "pawn takes",
                /bravo takes charlie 6/i,
                '"pawn takes" names the movers, both landing on c6');
  const bothPawns = heard().join(" | ");
  check("and it does NOT ask for a target both moves share",
        !/say the target/i.test(bothPawns));
  // when the targets really do differ, the target question is
  // still the right one
  await onBoard("4k3/8/2n1n3/3P4/8/8/8/4K3 w - - 0 1", "pawn takes",
                /say the target/i,
                "two different targets still ask for the target");

  // 20:09:06. "Plants" was the primary and the move was lost.
  // Every one of these is a real Safari rendering of "pawn"
  // from that game, and three of them cost a move.
  for (const word of ["plants", "plant", "plantains",
                      "fontes", "pontes", "po"]) {
    await onBoard("4k3/8/2n5/1P1P4/8/8/8/4K3 w - - 0 1", word + " takes",
                  /bravo takes charlie 6/i,
                  '"' + word + '" is heard as the pawn');
    heard();
  }
  // "cakes" for takes, three times in the same log
  await onBoard("4k3/8/2n5/1P1P4/8/8/8/4K3 w - - 0 1", "pawn cakes",
                /bravo takes charlie 6/i,
                '"cakes" is heard as takes');

  // ---- w49: three from game w47-1 ----

  // 20:14:26. "queen takes pawn" with no queen-takes-pawn on
  // the board got the generic "That is not a legal move" three
  // times. The VICTIM ruled it out, and w45 settled that a
  // refusal names the half that did.
  await onBoard("4k3/8/3n4/8/8/8/8/3QK3 w - - 0 1", "queen takes pawn",
                /no pawn for it to take/i,
                "a named victim that rules everything out is named");
  await onBoard("4k3/8/3n4/8/8/8/8/3QK3 w - - 0 1", "takes bishop",
                /no bishop for it to take/i,
                "and with no mover named either");
  // a victim that IS available still just plays
  await onBoard("4k3/8/3n4/8/8/8/8/3QK3 w - - 0 1", "queen takes knight",
                /queen takes delta 6/i,
                "a victim that is there is still played");

  // 19:15:14. "Nate takes pawn" put an unrecognised word where
  // the piece belongs, so the knight-less reading ranked level
  // with the real one and contributed three non-knight moves.
  // "It takes pawn" - the word DROPPED rather than mutated -
  // was demoted correctly. Same evidence, one caught.
  const demoted = vm.runInContext(
    'JSON.stringify(clippedIndexes(["Night takes pawn","Nate takes pawn"]))',
    sandbox);
  check("a MIS-HEARD first word demotes like a dropped one (" +
        demoted + ")", demoted === '{"1":true}');
  check("and unrelated readings are left alone",
        vm.runInContext(
          'JSON.stringify(clippedIndexes(["Echo four","Delta four"]))',
          sandbox) === "{}");

  // 20:09:06. Six readings arrived; the SECOND was "Pond
  // takes", which parses and would have played. The primary
  // was "Plants" and the move was lost. A rival reading may
  // now raise the question - but only ask, never play.
  await setGame(["e2e4","b7b6","d2d4","h7h5","c2c4","b6b5","a2a4","g7g5"]);
  vm.runInContext(
    'handleTranscripts(["Plants","Pond takes","Takes","Plant takes"]);',
    sandbox);
  await sleep(90);
  const rival = heard().join(" | ");
  check("a rival reading is heard at all now (" + rival + ")",
        !/say again/i.test(rival) && rival.length > 0);
  // and the ask-only rule: a unique fit from a rival asks
  await setBoard("4k3/8/3n4/8/8/8/8/3QK3 w - - 0 1");
  vm.runInContext('handleTranscripts(["Wobble","Queen takes"]);', sandbox);
  await sleep(90);
  const onlyAsks = heard().join(" | ");
  check("a unique fit from a RIVAL reading asks, never plays (" +
        onlyAsks + ")",
        /did you mean/i.test(onlyAsks) && !/^white /i.test(onlyAsks));
  say("yes");
  await sleep(90);
  check("and yes then plays it",
        /queen takes delta 6/i.test(heard().join(" | ")));

  // "push" is a pawn word everywhere, not only on a push -
  // the owner's point after game w47-1, where "pawn" would
  // not transcribe. Odd English, and the parser does not care.
  await onBoard("4k3/8/2n5/1P1P4/8/8/8/4K3 w - - 0 1", "push takes",
                /bravo takes charlie 6/i,
                '"push takes" is heard as "pawn takes"');
  // and naming the pawn by its FILE needs no pawn word at all,
  // which in that position would have played first time
  await onBoard("4k3/8/2n5/1P1P4/8/8/8/4K3 w - - 0 1", "bravo takes",
                /bravo takes charlie 6/i,
                '"bravo takes" plays the b-pawn capture outright');

  // BARE LETTERS, which the grammar header promises work as
  // well as NATO words and which nothing tested until now.
  // Two lines in parsing.js carry all of it - the glued
  // "([a-h])([1-8])" square and the lone "[a-h]" file - and
  // either could have been refactored away with every test
  // still green. They are the owner's natural English, so
  // they will be reached for under time whatever the
  // practised habit is.
  const LETTERS = "4k3/8/2n5/1P1P4/8/8/8/4K3 w - - 0 1";
  await onBoard(LETTERS, "b takes", /bravo takes charlie 6/i,
                'a bare letter names the mover: "b takes"');
  await onBoard(LETTERS, "b takes c6", /bravo takes charlie 6/i,
                'a glued letter-and-digit square: "b takes c6"');
  await onBoard(LETTERS, "b takes charlie six", /bravo takes charlie 6/i,
                'letters and NATO words mix freely in one move');
  await onBoard("4k3/8/8/8/8/8/1P6/4K3 w - - 0 1", "b4",
                /bravo 4/i, 'a bare "b4" is still a pawn push');
  // and the game6 invariant holds for the short form too: a
  // bare square spoken as letters is a push, never a capture
  await onBoard("4k3/8/8/1n6/8/1P6/8/4K3 w - - 0 1", "b4",
                /bravo 4|nothing|say again|which/i,
                'a bare "b4" never becomes the capture on b5');

  // ---- w54: the version is a w-number, at RUNTIME ----
  // settings.js declared VERSION = "v137" and lichess.js
  // reassigned it, so the value was only ever right because
  // one file happens to load after the other. Reordering the
  // manifest would have shipped logs claiming a version this
  // project stopped using - and a pasted log naming the wrong
  // build is worse than one naming none. Asked of the loaded
  // program, not of either file.
  const ver = vm.runInContext("VERSION", sandbox);
  check("VERSION is a w-number at runtime (" + ver + ")",
        /^w\d+$/.test(ver));

  // ========= w61: THE OTHER PLAYER IS A HUMAN =========
  // seek and challenge both refuse without a token, so one is
  // banked for the block and cleared at its end
  vm.runInContext('saveToken("lip_w61_test_token");', sandbox);

  // 92: a challenge is kept alive, and aborting cancels it
  vm.runInContext(`
    __chBody = null; __chAborted = 0;
    __realFetch4 = fetch;
    fetch = function (url, opts) {
      if (String(url).indexOf("/api/challenge/") < 0) {
        return Promise.reject(new Error("unexpected " + url));
      }
      __chBody = String((opts && opts.body) || "");
      return Promise.resolve({
        ok: true, status: 200,
        body: { getReader: function () {
          var sent = false;
          return { read: function () {
            if (sent) return new Promise(function () {});  // held open
            sent = true;
            return Promise.resolve({ done: false,
              value: new TextEncoder().encode('{"id":"c1"}\\n') });
          } };
        } }
      });
    };
    dryRun = false; api.gameId = null; api.over = false;
    challengeAbort = null;
    sendChallenge("somebody", 10, 5, false, "random");
  `, sandbox);
  await sleep(60);
  check("the challenge asks Lichess to keep it alive",
        /keepAliveStream=true/.test(
          vm.runInContext("__chBody", sandbox) || ""));
  check("and the keep-alive stream is held open",
        vm.runInContext("challengeAbort !== null", sandbox) === true);
  vm.runInContext(`
    challengeAbort = { abort: function () { __chAborted++; } };
    stopEverything();
  `, sandbox);
  check("sign-out cancels an open challenge",
        vm.runInContext("__chAborted", sandbox) === 1 &&
        vm.runInContext("challengeAbort", sandbox) === null);
  vm.runInContext("fetch = __realFetch4;", sandbox);

  // 93: a refused seek says why, and blitz gets the way out
  const seekLine = () => vm.runInContext(
    'document.getElementById("lichessLine").textContent', sandbox);
  vm.runInContext(`
    __realFetch5 = fetch;
    fetch = function (url, opts) {
      return Promise.resolve({
        ok: false, status: 400,
        json: function () {
          return Promise.resolve({ error: "Invalid time control" });
        }
      });
    };
    seekAbort = null; api.gameId = null;
    startSeek(3, 2, false);
  `, sandbox);
  await sleep(60);
  const blitzMsg = seekLine();
  check("a refused seek carries Lichess's reason (" + blitzMsg + ")",
        /Invalid time control/.test(blitzMsg));
  check("and a blitz control is told the way out",
        /challenge someone instead/i.test(blitzMsg));
  vm.runInContext("seekAbort = null; startSeek(15, 10, false);", sandbox);
  await sleep(60);
  check("a rapid refusal gets the reason without the blitz hint",
        !/challenge someone instead/i.test(seekLine()));
  vm.runInContext("fetch = __realFetch5; seekAbort = null;", sandbox);

  // 94: an opponent who leaves is heard about, once, and the
  // claim window becomes a question
  heard();
  vm.runInContext(`
    dryRun = false; api.gameId = "G"; api.over = false;
    api.pos = new RULES.Position(); api.myColor = "w"; api.moves = [];
    oppGone = false; claimAsked = false; confirmAction = null;
    handleOpponentGone({ type: "opponentGone", gone: true,
                         claimWinInSeconds: 8 });
    handleOpponentGone({ type: "opponentGone", gone: true,
                         claimWinInSeconds: 5 });
  `, sandbox);
  await sleep(40);
  const goneSaid = heard();
  check("a departure is spoken once, not per tick (" +
        goneSaid.join(" | ") + ")",
        goneSaid.filter(function (s) {
          return /left the game/i.test(s);
        }).length === 1);
  heard();
  vm.runInContext(`
    handleOpponentGone({ type: "opponentGone", gone: true,
                         claimWinInSeconds: 0 });
  `, sandbox);
  await sleep(40);
  check("the open window becomes a yes/no question",
        /claim the win/i.test(heard().join(" | ")) &&
        vm.runInContext("confirmAction", sandbox) === "claimvictory");
  heard();
  vm.runInContext(`
    __claimPath = null;
    __realPA2 = postAction;
    postAction = function (p) {
      __claimPath = p;
      return Promise.resolve({ ok: true, status: 200, body: "" });
    };
  `, sandbox);
  say("yes");
  await sleep(60);
  check('saying yes posts claim-victory and says so (' +
        heard().join(" | ") + ")",
        vm.runInContext("__claimPath", sandbox) === "claim-victory");
  vm.runInContext("postAction = __realPA2;", sandbox);
  heard();
  vm.runInContext(`
    oppGone = true; claimAsked = true; confirmAction = "claimvictory";
    handleOpponentGone({ type: "opponentGone", gone: false });
  `, sandbox);
  await sleep(40);
  check("a returning opponent is announced and the question dies",
        /opponent is back/i.test(heard().join(" | ")) &&
        vm.runInContext("confirmAction", sandbox) === null);

  // 96: a game the Board API cannot play is named, not joined
  heard();
  const compatRefused = vm.runInContext(`
    (function () {
      var realJoin = joinGame, joined = null;
      joinGame = function (id) { joined = id; };
      dryRun = false;
      handleAccountEvent({ type: "gameStart",
        game: { gameId: "FAST1", compat: { board: false } } });
      joinGame = realJoin;
      return joined;
    })()
  `, sandbox);
  await sleep(40);
  const compatSaid = heard().join(" | ");
  check("a board-incompatible game is not joined", compatRefused === null);
  check("and the user is told why (" + compatSaid + ")",
        /cannot play/i.test(compatSaid) && /too fast/i.test(compatSaid));
  const compatOk = vm.runInContext(`
    (function () {
      var realJoin = joinGame, joined = [];
      joinGame = function (id) { joined.push(id); };
      handleAccountEvent({ type: "gameStart",
        game: { gameId: "OK1", compat: { board: true } } });
      handleAccountEvent({ type: "gameStart", game: { id: "LEGACY1" } });
      joinGame = realJoin;
      return joined.join(",");
    })()
  `, sandbox);
  check("a compatible game still joins, and so does the legacy id " +
        "field (" + compatOk + ")", compatOk === "OK1,LEGACY1");

  // 97: a variant game is named, not mangled
  heard();
  vm.runInContext(`
    api.gameId = "V1"; api.over = false; api.myId = "me";
    handleGameFull({ variant: { key: "chess960", name: "Chess960" },
                     white: { id: "me" }, state: { moves: "" } });
  `, sandbox);
  await sleep(40);
  const variantSaid = heard().join(" | ");
  check("a variant game is refused out loud (" + variantSaid + ")",
        /standard chess only/i.test(variantSaid));
  check("and marked over so nothing is sent",
        vm.runInContext("api.over", sandbox) === true);
  heard();
  vm.runInContext(`
    api.gameId = "V2"; api.over = false;
    handleGameFull({ variant: { key: "fromPosition" },
      initialFen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
      white: { id: "me" }, state: { moves: "" } });
  `, sandbox);
  await sleep(40);
  check("fromPosition is standard chess and stays playable",
        vm.runInContext("api.over", sandbox) === false &&
        vm.runInContext('RULES.sqName ? api.pos.board[RULES.nameSq("e2")] : null',
                        sandbox) === "P");
  vm.runInContext(
    "api.gameId = null; api.over = false; dryRun = true; clearToken();",
    sandbox);
  heard();

  // ========= w60: WHAT THE PAGE SAYS MUST BE TRUE =========

  // 91: a refused action is never announced as done. The Board
  // API 400s these in ordinary play (resign in the abortable
  // phase, a withdrawn takeback) and the old path spoke
  // "resigning." over the 400.
  vm.runInContext("__realPA = postAction;", sandbox);
  heard();
  vm.runInContext(`
    dryRun = false; authGone = false;
    api.gameId = "G"; api.over = false; api.moves = [];
    api.pos = new RULES.Position(); api.myColor = "w";
    postAction = function () {
      return Promise.resolve({ ok: false, status: 400,
        body: '{"error":"Cannot resign, game is aborting"}' });
    };
    confirmAction = "resign";
  `, sandbox);
  say("yes");
  await sleep(80);
  const refused = heard().join(" | ");
  check("a 400 action is not announced as done (" + refused + ")",
        !/resigning/i.test(refused));
  check("and the refusal carries Lichess's reason",
        /refused that\. Cannot resign/i.test(refused));

  // ...and a dead token speaks the sign-out sentence, once,
  // with the repeat case still answered
  heard();
  vm.runInContext(`
    authGone = false;
    postAction = function () {
      return Promise.resolve({ ok: false, status: 401, body: "" });
    };
    confirmAction = "resign";
  `, sandbox);
  say("yes");
  await sleep(80);
  const auth1 = heard().join(" | ");
  vm.runInContext('confirmAction = "resign";', sandbox);
  say("yes");
  await sleep(80);
  const auth2 = heard().join(" | ");
  check("a 401 action speaks the sign-out sentence (" + auth1 + ")",
        /signed you out|sign in again/i.test(auth1) && !/resigning/i.test(auth1));
  check("and a repeat is still answered, not swallowed (" + auth2 + ")",
        /still signed out/i.test(auth2));
  vm.runInContext("postAction = __realPA; authGone = false;", sandbox);

  // 124: practice never inherits a real game's clock anchor
  vm.runInContext(`
    api.clockAt = Date.now() - 300000;   // a real game, 5 min ago
    dryRun = true; running = true;
    dryStart();
  `, sandbox);
  await sleep(40); heard();
  check("practice clears the clock anchor",
        vm.runInContext("api.clockAt", sandbox) === null);
  check("so the practice clock is frozen at 10 minutes, not ticking",
        vm.runInContext('remainingMs("w")', sandbox) === 600000);

  // 127: the opponent's spoken clock is extrapolated too
  heard();
  vm.runInContext(`
    dryRun = false; api.myColor = "w"; api.over = false;
    api.pos = new RULES.Position(); api.pos.applyUci("e2e4"); // black to move
    api.moves = ["e2e4"];
    api.wtime = 600000; api.btime = 60000;
    api.clockAt = Date.now() - 15000;    // black thinking 15s
  `, sandbox);
  say("clock");
  await sleep(80);
  const clkSaid = heard().join(" | ");
  check("the opponent's clock is spoken extrapolated (" + clkSaid + ")",
        /black 4[0-5] seconds/i.test(clkSaid));
  vm.runInContext("api.clockAt = null; dryRun = true;", sandbox);

  // 104: the glance board repaints when the colour is learned
  const flipRepaint = vm.runInContext(`
    (function () {
      var real = uiGameChanged, calls = 0;
      uiGameChanged = function () { calls++; };
      api.gameId = "GB"; api.myColor = null; api.pos = null;
      repaintTick();                       // consumes the join
      var afterJoin = calls;
      api.myColor = "b"; api.pos = new RULES.Position();  // gameFull lands
      repaintTick();
      var afterColour = calls;
      uiGameChanged = real;
      return { join: afterJoin, colour: afterColour };
    })()
  `, sandbox);
  check("learning the colour repaints the board (" +
        flipRepaint.join + " -> " + flipRepaint.colour + ")",
        flipRepaint.colour === flipRepaint.join + 1);

  // 126: a stale ply-guarded ask no longer holds the strip
  const stale = vm.runInContext(`
    (function () {
      clearDialogue();
      api.moves = [];
      pieceAsk = { ply: 0, moves: [] };
      var live = questionOpen();
      api.moves = ["e2e4"];               // the game moved on
      var dead = questionOpen();
      clearDialogue(); api.moves = [];
      return { live: live, dead: dead };
    })()
  `, sandbox);
  check("a current repair question holds the strip", stale.live === true);
  check("an overtaken one lets messages expire again", stale.dead === false);

  // ---- w59: "clean" is a queen (game w58-1) ----
  // Safari returned "Clean check" for "queen check" twice
  // running. The fuzzy matcher could not have saved it -
  // "clean" is three edits from "queen" - so it is a named
  // spelling, and exact-only, because six ordinary words sit
  // one edit from it.
  check('"clean" parses as the queen',
        vm.runInContext('PIECES["clean"]', sandbox) === "q");
  check("and it is never a fuzzy target (clear/lean stay themselves)",
        vm.runInContext('FUZZY_EXACT_ONLY["clean"]', sandbox) === 1 &&
        vm.runInContext('fuzzyToken("clear")', sandbox) === null &&
        vm.runInContext('fuzzyToken("glean")', sandbox) === null);
  await onBoard("4k3/8/8/8/8/8/8/3QK3 w - - 0 1", "clean charlie two",
                /queen charlie 2/i,
                '"clean charlie two" plays the queen move');

  // ============ w58: "QUEEN CHECK", FROM A REAL GAME ==========
  // Game w56-1: "queen check" said twice, refused twice with
  // "that is not a legal move", and Qa4+ was available the
  // whole time - the owner played it seconds later by naming
  // the square. Mate had a repair; check did not.

  // EXACTLY ONE checking move by that piece: it plays, like
  // the mate and half-square repairs on the same weight of
  // evidence. Ra8+ is the only check a1 rook has here.
  await onBoard("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "rook check",
                /rook alpha 8, check/i,
                '"rook check" plays the one checking rook move');
  check("and it was actually played",
        vm.runInContext("api.moves.length", sandbox) === 1);

  // SEVERAL checking moves: it asks, it does not choose.
  // Uniqueness is counted over every legal move of that piece,
  // so a lost word can only ever turn one candidate into
  // several - which asks - never into a different move.
  await onBoard("4k3/8/8/8/8/8/8/3QK3 w - - 0 1", "queen check",
                /did you mean queen .*check/i,
                'several checks ask rather than guessing');
  check("and nothing was played while it asks",
        vm.runInContext("api.moves.length", sandbox) === 0);

  // the check word is repeated back, not swallowed
  await setBoard("4k3/8/8/8/8/8/8/1B2K3 w - - 0 1");
  say("queen check");
  await sleep(120);
  const qchk = heard().join(" | ");
  check('a refusal repeats the check word ("' + qchk + '")',
        /i heard queen check/i.test(qchk));

  // "checkmate" MUST go to the mate repair, not this one.
  // This board has two checking rook moves - Ra8# and Rh8+ -
  // and only one of them mates. The check repair would find
  // both and ask; the mate repair finds one and plays it. So
  // the difference between the two is exactly what "did you
  // mean" tells us, and asserting only that Ra8 is mentioned
  // would pass either way (it did, until this was tightened).
  // WHICH REPAIR ANSWERED is the claim, so that is what is
  // asserted - the log names it. Asserting on the spoken move
  // instead needs a board where the two repairs would differ,
  // and that is fiddly to construct and easy to get wrong: the
  // first version of this test used a board where the only
  // checking rook move WAS the mate, so it passed with the
  // guard deliberately removed.
  await setBoard("6k1/5ppp/8/8/8/8/8/R3K2R w - - 0 1");
  heard();
  vm.runInContext("LOG.length = 0;", sandbox);
  vm.runInContext('handleTranscripts(["rook checkmate"]);', sandbox);
  await sleep(120);
  const rmate = heard().join(" | ");
  const whichRepair = vm.runInContext(
    'LOG.filter(function (l) { return /(mate|check) repair/.test(l); })' +
    '.map(function (l) { return l.replace(/^.*CND  /, ""); }).join(" | ")',
    sandbox);
  check('"rook checkmate" is answered by the MATE repair (' +
        (whichRepair || "none") + ")",
        /mate repair/.test(whichRepair) && !/check repair/.test(whichRepair));
  check("and it plays the mate (" + rmate + ")",
        /rook alpha 8, checkmate/i.test(rmate));

  // and a piece with no checking move says so rather than
  // offering something else
  await onBoard("4k3/8/8/8/8/8/8/4K1NR w - - 0 1", "bishop check",
                /i heard bishop check/i,
                'no bishop at all: the refusal names what was said');

  // ============== w53: THE SAME ANSWER, FASTER =============
  // Every change in w53 is meant to be invisible. The risk is
  // not that it gets slower, it is that a list passed in to
  // save regenerating it is the WRONG list - and the thing it
  // is used for is disambiguation, which is silent when wrong:
  // "knight f3" instead of "knight b-f3" names a different
  // move than the one being played.
  const sanSame = vm.runInContext(`
    (function () {
      // two knights both able to reach d2: SAN must disambiguate
      var p = new RULES.Position("4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1");
      var legal = p.legalMoves();
      var out = { withList: [], without: [] };
      legal.forEach(function (m) {
        out.withList.push(p.sanOf(m, legal));
        out.without.push(p.sanOf(m));
      });
      return { same: out.withList.join(",") === out.without.join(","),
               sans: out.withList.join(","),
               disambiguated: out.withList.filter(function (s) {
                 return /^N[a-h]d2$/.test(s);
               }).length };
    })()
  `, sandbox);
  check("a passed legal list names moves identically",
        sanSame.same === true);
  check("and disambiguation still happens (" + sanSame.disambiguated +
        " of the Nd2 pair)", sanSame.disambiguated === 2);

  // findMoves given the list must answer as it does without
  const findSame = vm.runInContext(`
    (function () {
      var p = new RULES.Position("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      var legal = p.legalMoves();
      var req = parseTranscript("echo four");
      var a = findMoves(p, req).map(function (m) { return p.uciOf(m); }).join(",");
      var b = findMoves(p, req, false, legal)
                .map(function (m) { return p.uciOf(m); }).join(",");
      return { a: a, b: b };
    })()
  `, sandbox);
  check("findMoves answers the same with the list as without (" +
        findSame.a + ")", findSame.a === findSame.b && findSame.a.length > 0);

  // applyUci names the move the same way after sharing its list
  check("applyUci still names its move",
        vm.runInContext(`
          (function () {
            var p = new RULES.Position();
            return p.applyUci("g1f3").san;
          })()
        `, sandbox) === "Nf3");

  // the flattened fuzzy table finds what the loop found
  check("a near-miss still resolves (brooke -> rook)",
        vm.runInContext('JSON.stringify(fuzzyToken("brooke"))', sandbox)
          .indexOf('"v":"r"') >= 0);
  check("and an ambiguous near-miss still refuses to guess",
        vm.runInContext('fuzzyToken("zzzzzz")', sandbox) === null);

  // the log panel is not repainted while it cannot be seen
  const logPaint = vm.runInContext(`
    (function () {
      var before = logBody ? logBody.textContent : "";
      logPanelVisible = false;
      log("TST", "a line nobody can see");
      var hidden = logBody ? logBody.textContent : "";
      logPanelVisible = true;
      paintLog();
      var shown = logBody ? logBody.textContent : "";
      logPanelVisible = false;
      return { unchanged: hidden === before,
               painted: shown.indexOf("a line nobody can see") >= 0 };
    })()
  `, sandbox);
  check("a hidden log panel is not repainted", logPaint.unchanged === true);
  check("and opening it paints what was missed", logPaint.painted === true);

  // ============ w52: THE POLL FALLBACK, AT LAST ============
  // This path had no test at all, which is most of why it had
  // three faults. The device can stream, so none of it was ever
  // reached by playing; it is driven directly here instead.
  //
  // A stub for /api/account/playing. `rows` is what the
  // endpoint returns this tick.
  function pollWith(rows) {
    vm.runInContext(`
      __pollRows = ${JSON.stringify(rows)};
      fetch = function (url) {
        if (String(url).indexOf("/api/account/playing") < 0) {
          return Promise.reject(new Error("unexpected url " + url));
        }
        return Promise.resolve({
          ok: true, status: 200,
          json: function () {
            return Promise.resolve({ nowPlaying: __pollRows });
          }
        });
      };
    `, sandbox);
  }
  vm.runInContext("__realFetch3 = fetch;", sandbox);

  // PLAYING BLACK, secondsLeft IS OURS - not white's.
  vm.runInContext(`
    dryRun = false; running = true; api.over = false;
    api.gameId = "PG"; api.myColor = "b";
    api.pos = new RULES.Position(); api.moves = [];
    api.wtime = null; api.btime = null;
  `, sandbox);
  pollWith([{ gameId: "PG", color: "black", fen: "", lastMove: "",
              isMyTurn: true, secondsLeft: 90 }]);
  vm.runInContext("pollSeen = false; pollOnce();", sandbox);
  await sleep(80); heard();
  const pollClocks = vm.runInContext(
    "JSON.stringify({ w: api.wtime, b: api.btime })", sandbox);
  check("playing black, our clock lands on black (" + pollClocks + ")",
        vm.runInContext("api.btime", sandbox) === 90000);
  // the endpoint does not carry the opponent's clock, so the
  // honest answer is "unknown" - which speakClocks already says
  check("and the clock it cannot know stays unset, not wrong",
        vm.runInContext("api.wtime", sandbox) === null);

  // THE GAME LEAVING THE LIST IS THE GAME ENDING, and it must
  // be said and it must stop the polling.
  heard();
  vm.runInContext(`
    api.over = false; pollSeen = true; api.gameId = "PG";
    pollTimer = setInterval(function () {}, 100000);
  `, sandbox);
  pollWith([]);                       // the game is gone
  vm.runInContext("pollOnce();", sandbox);
  await sleep(80);
  const ended = heard().join(" | ");
  check("a game vanishing from the list is announced (" + ended + ")",
        /game over/i.test(ended));
  check("and the game is marked over",
        vm.runInContext("api.over", sandbox) === true);
  check("and the polling stops",
        vm.runInContext("pollTimer === null", sandbox) === true);

  // ...but not on the very first tick, before it has appeared
  heard();
  vm.runInContext("api.over = false; pollSeen = false;", sandbox);
  vm.runInContext("pollOnce();", sandbox);
  await sleep(80);
  check("but a game not seen yet is not declared over",
        vm.runInContext("api.over", sandbox) === false &&
        !/game over/i.test(heard().join(" | ")));

  // A DESYNC RELOADS ONCE, NOT EVERY TICK.
  vm.runInContext(`
    api.over = false; api.gameId = "PG"; api.myColor = "w";
    api.pos = new RULES.Position(); api.moves = []; pollSeen = true;
    armedUci = "STALEARM";
  `, sandbox);
  // a lastMove that cannot be applied to the start position
  pollWith([{ gameId: "PG", color: "white",
              fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR",
              lastMove: "h7h6", isMyTurn: true, secondsLeft: 60 }]);
  vm.runInContext("pollOnce();", sandbox);
  await sleep(80);
  const firstReload = vm.runInContext(
    "LOG.filter(function (l) { return l.indexOf('reloading from fen') >= 0; }).length",
    sandbox);
  vm.runInContext("pollOnce();", sandbox);
  await sleep(80);
  const secondReload = vm.runInContext(
    "LOG.filter(function (l) { return l.indexOf('reloading from fen') >= 0; }).length",
    sandbox);
  check("a desync reloads (" + firstReload + ")", firstReload === 1);
  check("and does NOT reload again on the next tick (" + secondReload + ")",
        secondReload === 1);
  check("and the stale arm is dropped",
        !vm.runInContext("armedUci", sandbox));

  // A REFUSED TOKEN IS SAID ONCE AND STOPS THE RETRYING.
  heard();
  const authOut = vm.runInContext(`
    (function () {
      authGone = false; streamFails = 0; reconnectTimer = null;
      api.gameId = "G"; api.over = false; dryRun = false;
      var first = noteAuthFailure(new Error("stream HTTP 401"));
      var second = noteAuthFailure(new Error("stream HTTP 401"));
      scheduleReconnect();
      var scheduled = reconnectTimer !== null;
      clearTimeout(reconnectTimer); reconnectTimer = null;
      authGone = false;
      return { first: first, second: second, scheduled: scheduled };
    })()
  `, sandbox);
  await sleep(40);
  const authSaid = heard().join(" | ");
  check("a refused token is recognised", authOut.first === true);
  check("and said out loud, not just logged (" + authSaid + ")",
        /signed you out|sign in again/i.test(authSaid));
  check("and it does not keep retrying what cannot work",
        authOut.scheduled === false);

  // AND THE RECONNECT LADDER BACKS OFF.
  const ladder = vm.runInContext(`
    (function () {
      var real = startStream, waits = [];
      startStream = function () {};
      var realSet = setTimeout;
      authGone = false; streamFails = 0;
      api.gameId = "G"; api.over = false; dryRun = false;
      setTimeout = function (fn, ms) { waits.push(ms); return realSet(function(){}, 0); };
      scheduleReconnect(); scheduleReconnect(); scheduleReconnect();
      scheduleReconnect(); scheduleReconnect(); scheduleReconnect();
      setTimeout = realSet;
      startStream = real;
      streamFails = 0; reconnectTimer = null;
      return waits;
    })()
  `, sandbox);
  check("the reconnect ladder doubles (" + ladder.join(",") + ")",
        ladder[0] === 2000 && ladder[1] === 4000 && ladder[2] === 8000);
  check("and is capped, not unbounded (" + ladder[5] + ")",
        ladder[ladder.length - 1] === 30000);

  vm.runInContext("fetch = __realFetch3; api.gameId = null; api.over = false;",
                  sandbox);

  // ================= w51: THE GRAMMAR GATES ================
  // Four ways a sentence could be taken for a different
  // sentence. Each is a wrong-move or a lost-move.

  // A SALVAGE MAY NOT CONTRADICT A SPOKEN HALF. Origin e5 and
  // target d-file are BOTH said; the only capture that fits is
  // none, and the square-as-target reading used to answer dxe5
  // - mover and target swapped - with one candidate, so nothing
  // asked and it played.
  await setBoard("4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1");
  say("echo five takes delta");
  await sleep(120);
  const salvage = heard().join(" | ");
  // dxe5 is the move the old salvage produced, and it played
  // unasked. Nothing may offer or play it here.
  check("a spoken target is not overwritten by the salvage (" +
        salvage + ")", !/delta takes echo 5/i.test(salvage));
  check("and the refusal names both halves that were said",
        /echo 5/.test(salvage) && /delta file/i.test(salvage));
  check("no move was played",
        vm.runInContext("api.moves.length", sandbox) === 0);
  // the salvage still works when the target end is SILENT
  await onBoard("4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1", "echo five takes",
                /delta takes echo 5|takes echo 5/i,
                'the salvage still fires when only the square was said');

  // A MOVE IS NOT A QUESTION ABOUT A SQUARE.
  const qMove = vm.runInContext(
    'JSON.stringify(classifyQuery("which knight takes delta five"))', sandbox);
  check("a capture with a question word is not a square query (" +
        qMove + ")", qMove === "null");
  const qPiece = vm.runInContext(
    'JSON.stringify(classifyQuery("what knight delta five"))', sandbox);
  check("nor is a named piece with a square", qPiece === "null");
  const qReal = vm.runInContext(
    'JSON.stringify(classifyQuery("what is on delta five"))', sandbox);
  check("but the real question still asks (" + qReal + ")",
        /"kind":"square"/.test(qReal) && /"sq":"d5"/.test(qReal));

  // A PIECE ANSWER IS A WORD, NOT A SENTENCE. With a push
  // question open, an unrelated capture must not be eaten as
  // the answer "queen".
  await setBoard("4k3/8/8/8/8/8/4r3/3QK3 w - - 0 1");
  const askShape = vm.runInContext(`
    (function () {
      pieceAsk = { ply: api.moves.length, capture: false, sq: "e2",
                   moves: [] };
      var out = {};
      out.bareQueen  = pieceAskOpen(parseTranscript("queen"));
      out.queenTakes = pieceAskOpen(parseTranscript("queen takes rook"));
      out.takesRook  = pieceAskOpen(parseTranscript("takes rook"));
      pieceAsk = null;
      return out;
    })()
  `, sandbox);
  check("a bare piece still answers the question", askShape.bareQueen === true);
  check("a whole capture sentence does not", askShape.queenTakes === false);
  check("nor does a named victim", askShape.takesRook === false);

  // THE DEDUPE KEY FOLLOWS THE PARSER'S RULES, OR IT THROWS
  // AWAY A READING THAT MEANT SOMETHING ELSE.
  const keyA = vm.runInContext('semanticKey("a bravo four")', sandbox);
  const keyAlpha = vm.runInContext('semanticKey("alpha bravo four")', sandbox);
  check('bare "a" as an article keys apart from the a-file (' +
        keyA + " vs " + keyAlpha + ")", keyA !== keyAlpha);
  check('and "a takes" still keys as the a-file',
        vm.runInContext('semanticKey("a takes bravo five")', sandbox) ===
        vm.runInContext('semanticKey("alpha takes bravo five")', sandbox));
  check("a glued double square splits like the parser's",
        vm.runInContext('semanticKey("e2e4")', sandbox) ===
        vm.runInContext('semanticKey("echo two echo four")', sandbox));

  // A RE-SAID MOVE OBEYS confirmMyMove LIKE ANY OTHER.
  await setBoard("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
  vm.runInContext(`
    CFG.confirmMyMove = true;
    pending = { cands: [{ m: api.pos.legalMoves()[0], san: "Kd1" }], idx: 0 };
  `, sandbox);
  heard();
  say("echo four");
  await sleep(120);
  const resaid = heard().join(" | ");
  check("a move re-said over a question still asks when told to (" +
        resaid + ")", /did you mean/i.test(resaid));
  vm.runInContext("CFG.confirmMyMove = false; pending = null;", sandbox);

  // ================== w50: THE LIFECYCLE ==================
  // Every check below is a state that used to outlive the game
  // it belonged to, or a path that used to end in silence.

  // ---- castling is a move like any other when it checks ----
  check("castling that gives check says so",
        vm.runInContext('sanToSpeech("O-O+")', sandbox) ===
          "castles kingside, check");
  check("and castling that mates says that",
        vm.runInContext('sanToSpeech("O-O-O#")', sandbox) ===
          "castles queenside, checkmate");
  check("plain castling is unchanged",
        vm.runInContext('sanToSpeech("O-O")', sandbox) === "castles kingside");

  // ---- the clock strip knows every question, not three ----
  const qStates = vm.runInContext(`
    (function () {
      var out = {};
      clearDialogue(); out.none = questionOpen();
      clearDialogue(); pending = { cands: [], idx: 0 };  out.pending = questionOpen();
      clearDialogue(); confirmAction = "resign";         out.confirm = questionOpen();
      clearDialogue(); pieceAsk = { ply: 0, moves: [] }; out.piece = questionOpen();
      clearDialogue(); partialAsk = { ply: 0 };          out.partial = questionOpen();
      clearDialogue();
      return out;
    })()
  `, sandbox);
  check("nothing open reads as no question", qStates.none === false);
  check("the strip sees all FOUR dialogue states",
        qStates.pending && qStates.confirm && qStates.piece && qStates.partial);

  // ---- a question does not survive into the next game ----
  const survived = vm.runInContext(`
    (function () {
      dryRun = false;
      api.gameId = "OLDGAME"; api.over = false;
      confirmAction = "resign"; pending = { cands: [], idx: 0 };
      pieceAsk = { ply: 0, moves: [] }; partialAsk = { ply: 0 };
      armedUci = "e2e4";
      joinGame("NEWGAME");
      return { confirm: confirmAction, piece: pieceAsk, partial: partialAsk,
               pending: pending, armed: armedUci };
    })()
  `, sandbox);
  check("a new game clears every open question",
        !survived.confirm && !survived.piece && !survived.partial &&
        !survived.pending && !survived.armed);

  const afterOver = vm.runInContext(`
    (function () {
      api.gameId = "G"; api.over = false; api.myColor = "w";
      api.pos = new RULES.Position(); api.moves = [];
      confirmAction = "drawoffer"; pending = { cands: [], idx: 0 };
      handleGameState({ moves: "", status: "mate", winner: "black" }, false);
      return { confirm: confirmAction, pending: pending, over: api.over };
    })()
  `, sandbox);
  check("game over clears the open question too",
        afterOver.over === true && !afterOver.confirm && !afterOver.pending);

  // ---- an offer may take the slot, but must say it did ----
  heard();
  const stomp = vm.runInContext(`
    (function () {
      api.myColor = "w"; api.over = false;
      offerState = { draw: false, takeback: false };
      confirmAction = "resign";
      checkOffers({ bdraw: true });
      return confirmAction;
    })()
  `, sandbox);
  await sleep(40);
  const stompSaid = heard().join(" | ");
  check("an incoming offer takes the yes/no slot (" + stomp + ")",
        stomp === "drawoffer");
  check("and names the question it cancelled (" + stompSaid + ")",
        /cancels the resign question/i.test(stompSaid));

  heard();
  const withdrew = vm.runInContext(`
    (function () {
      api.myColor = "w"; api.over = false;
      offerState = { draw: true, takeback: false };
      confirmAction = "drawoffer";
      checkOffers({ bdraw: false });
      return confirmAction;
    })()
  `, sandbox);
  await sleep(40);
  check("a withdrawn offer takes its question with it", withdrew === null);
  check("and says so, since a yes was being held ready",
        /withdrew the draw offer/i.test(heard().join(" | ")));

  // ---- a confirmed action reports what really happened ----
  vm.runInContext("__realPostAction = postAction;", sandbox);
  heard();
  vm.runInContext(`
    dryRun = false; api.gameId = "G"; api.over = false;
    api.pos = new RULES.Position(); api.myColor = "w"; api.moves = [];
    __release = null;
    postAction = function () {
      return new Promise(function (res) { __release = res; });
    };
    confirmAction = "resign";
  `, sandbox);
  say("yes");
  await sleep(60);
  check("nothing is claimed while the action is still in flight",
        !/resigning/i.test(heard().join(" | ")));
  vm.runInContext('__release({ ok: true, status: 200, body: "" });', sandbox);
  await sleep(60);
  check("and it is claimed once the post lands",
        /resigning/i.test(heard().join(" | ")));

  heard();
  vm.runInContext(`
    postAction = function () { return Promise.reject(new Error("no network")); };
    confirmAction = "resign";
  `, sandbox);
  say("yes");
  await sleep(80);
  const failSaid = heard().join(" | ");
  check("an action that failed says it failed (" + failSaid + ")",
        /did not go through/i.test(failSaid) && !/^resigning/i.test(failSaid));
  vm.runInContext("postAction = __realPostAction;", sandbox);

  // ---- the move list is a prefix, or it is a rebuild ----
  const sync = vm.runInContext(`
    (function () {
      api.pos = new RULES.Position(); api.moves = []; api.myColor = "w";
      api.over = false; armedUci = null;
      syncMoves("e2e4 e7e5", false);
      // SAME LENGTH, different tail: a takeback and its
      // replacement arriving in one event
      syncMoves("e2e4 c7c5", false);
      return { moves: api.moves.join(" "), last: api.lastSan,
               turn: api.pos.turn };
    })()
  `, sandbox);
  check("a same-length different tail rebuilds (" + sync.moves + ")",
        sync.moves === "e2e4 c7c5");
  check("and the position really is the new one (last " + sync.last + ")",
        sync.last === "c5" && sync.turn === "w");

  const resync = vm.runInContext(`
    (function () {
      api.pos = new RULES.Position(); api.moves = []; api.myColor = "w";
      api.over = false; armedUci = "STALEARM";
      api.lastSan = "STALE"; api.lastSanW = "STALE"; api.lastSanB = "STALE";
      syncMoves("e2e4 e7e5 a1a8", false);      // a1a8 is not legal
      return { last: api.lastSan, w: api.lastSanW, b: api.lastSanB,
               armed: armedUci };
    })()
  `, sandbox);
  check("a resync refreshes the move rows (" + resync.w + "/" + resync.b + ")",
        resync.last !== "STALE" && resync.w !== "STALE" &&
        resync.b !== "STALE");
  check("and drops an arm that named the old position", !resync.armed);

  // ---- being connected is not the same as listening ----
  const recon = vm.runInContext(`
    (function () {
      var real = startStream, out = {};
      startStream = function () {};
      api.gameId = "G1"; api.over = false; dryRun = false;
      running = false;                       // voice OFF
      reconnectTimer = null; scheduleReconnect();
      out.voiceOff = reconnectTimer !== null;
      clearTimeout(reconnectTimer);
      dryRun = true;
      reconnectTimer = null; scheduleReconnect();
      out.practice = reconnectTimer !== null;
      clearTimeout(reconnectTimer);
      dryRun = false; api.over = true;
      reconnectTimer = null; scheduleReconnect();
      out.gameOver = reconnectTimer !== null;
      clearTimeout(reconnectTimer);
      reconnectTimer = null; api.over = false;
      startStream = real;
      return out;
    })()
  `, sandbox);
  check("a dropped stream reconnects even with voice off",
        recon.voiceOff === true);
  check("but not in practice", recon.practice === false);
  check("and not after the game is over", recon.gameOver === false);

  // ---- practice puts down everything that could deliver a game ----
  const teardown = vm.runInContext(`
    (function () {
      __evAborted = 0; __seekCancelled = 0;
      eventAbort = { abort: function () { __evAborted++; } };
      var realCancel = cancelSeek;
      cancelSeek = function () { __seekCancelled++; };
      confirmAction = "resign"; pending = { cands: [], idx: 0 };
      dryRun = true;
      dryStart();
      cancelSeek = realCancel;
      return { ev: __evAborted, seek: __seekCancelled,
               confirm: confirmAction, pending: pending };
    })()
  `, sandbox);
  await sleep(40); heard();
  check("practice closes the account event stream", teardown.ev === 1);
  check("practice cancels any outstanding seek", teardown.seek === 1);
  check("and clears the questions with it",
        !teardown.confirm && !teardown.pending);

  // ---- a real game beats practice, out loud ----
  heard();
  const takeover = vm.runInContext(`
    (function () {
      dryRun = true; api.gameId = "PRACTICE"; api.over = false;
      var realJoin = joinGame;
      __joined = null;
      joinGame = function (id) { __joined = id; };
      handleAccountEvent({ type: "gameStart", game: { id: "REAL1" } });
      joinGame = realJoin;
      return { joined: __joined, dry: dryRun };
    })()
  `, sandbox);
  await sleep(40);
  check("a real game starting in practice is joined", takeover.joined === "REAL1");
  check("and practice is left, not kept silently", takeover.dry === false);
  check("and the user is told (" + "spoken" + ")",
        /real game has started/i.test(heard().join(" | ")));

  const dryGuard = vm.runInContext(`
    (function () {
      dryRun = true; api.gameId = "REALGAME"; api.over = false;
      api.pos = new RULES.Position(); api.moves = [];
      dryOpponentReply();          // scheduled before practice ended
      return api.moves.length;
    })()
  `, sandbox);
  check("the practice opponent never moves in a real game", dryGuard === 0);

  // ---- a post that never answers must still answer ----
  heard();
  vm.runInContext(`
    __realFetch2 = fetch;
    MOVE_POST_TIMEOUT_MS = 60;       // the test's patience, not the user's
    dryRun = false; api.gameId = "G"; api.over = false; busy = false;
    api.pos = new RULES.Position(); api.myColor = "w"; api.moves = [];
    fetch = function () { return new Promise(function () {}); };   // hangs
    acceptMove({ m: api.pos.legalMoves()[0], san: "e4" });
  `, sandbox);
  await sleep(250);
  const stalled = heard().join(" | ");
  check("a post that never answers stops blocking the next move",
        vm.runInContext("busy", sandbox) === false);
  check("and says so rather than going quiet (" + stalled + ")",
        /could not reach/i.test(stalled));

  // and the busy refusal itself is audible
  heard();
  vm.runInContext(`
    fetch = __realFetch2; MOVE_POST_TIMEOUT_MS = 12000;
    busy = true;
    acceptMove({ m: api.pos.legalMoves()[0], san: "e4" });
  `, sandbox);
  await sleep(40);
  check("a move dictated while busy is answered, not swallowed",
        /still sending/i.test(heard().join(" | ")));
  vm.runInContext("busy = false; dryRun = true;", sandbox);

  // ---- HARD CONSTRAINT 4: NEVER EXPOSE OR LOG A TOKEN ----
  // header.js lists four constraints. This is the only one
  // whose consequence is measured in bans rather than bugs, and
  // until now it was the only one with no test at all - the
  // rule was a sentence in a comment and a habit in the author.
  // The log panel is MADE to be copied out and pasted into a
  // conversation, so anything that reaches LOG is published on
  // purpose; a token there is not a slip, it is a disclosure.
  //
  // A sentinel token goes in, every path that carries one is
  // driven, and the sentinel must appear in exactly one place:
  // the Authorization header. The fetch stub rejects with the
  // URL in the message, the way the harness's own stub does, so
  // a token that ever reached a query string would come back
  // through the error log and be caught here too.
  const TK = "lip_SENTINEL_never_log_me";
  const installed = vm.runInContext(`
    (function () {
      __sent = [];
      __realFetch = fetch;
      fetch = function (url, opts) {
        __sent.push({ url: String(url),
                      headers: JSON.stringify((opts && opts.headers) || {}),
                      body: String((opts && opts.body) || "") });
        return Promise.reject(new Error("no network in harness: " + url));
      };
      saveToken(${JSON.stringify(TK)});
      LOG.length = 0; __spoken.length = 0;
      return storedToken();
    })()
  `, sandbox);
  check("a sentinel token is installed", installed === TK);

  vm.runInContext(`
    api.gameId = "TESTGAME"; api.over = false;
    dryRun = false; running = true; seekAbort = null;
    // these reject, and several of them have no catch of their
    // own - postMove and postAction lean on their callers for
    // that. Swallowing here is the harness saying so out loud,
    // not tidying it away.
    var swallow = function (p) {
      if (p && typeof p.catch === "function") p.catch(function () {});
    };
    swallow(fetchMyId());
    swallow(postMove("e2e4"));
    swallow(postAction("resign"));
    swallow(startStream());
    swallow(watchEvents());
    swallow(pollOnce());
    // seek and challenge build their Authorization header by
    // hand instead of calling authHeaders(), which makes them
    // the two most worth watching. Both refuse while a game is
    // on, so the game has to be put down first.
    api.gameId = null; api.over = false; seekAbort = null;
    swallow(startSeek(5, 3, false));
    seekAbort = null;
    swallow(sendChallenge("maia1", 5, 3, false, "random"));
  `, sandbox);
  await sleep(120);

  const leak = vm.runInContext(`
    (function () {
      var tk = ${JSON.stringify(TK)};
      var has = function (s) { return String(s).indexOf(tk) >= 0; };
      var line = document.getElementById("lichessLine");
      return {
        calls: __sent.length,
        authed: __sent.filter(function (s) { return has(s.headers); }).length,
        inUrl: __sent.some(function (s) { return has(s.url); }),
        inBody: __sent.some(function (s) { return has(s.body); }),
        inLog: has(LOG.join(" ")),
        inSpeech: has(__spoken.join(" ")),
        inStatus: has(line ? line.textContent : "")
      };
    })()
  `, sandbox);
  // if nothing authenticated, the rest would pass for the wrong
  // reason - the same vacuous-pass shape rule 9 exists for
  check("every token path was actually driven (" + leak.calls +
        " requests, " + leak.authed + " authenticated)",
        leak.calls >= 8 && leak.authed >= 8);
  check("the token never reaches a URL", leak.inUrl === false);
  check("the token never reaches a request body", leak.inBody === false);
  check("the token never reaches the log", leak.inLog === false);
  check("the token is never spoken", leak.inSpeech === false);
  check("the token never reaches the status line", leak.inStatus === false);

  // THE EXCHANGE ITSELF, where a fresh token arrives in a
  // response body and is the one thing in the reply that must
  // not be repeated back.
  vm.runInContext(`
    clearToken(); LOG.length = 0; __spoken.length = 0;
    location.search = "?code=testcode";
    // PKCE: the verifier stored at sign-in is what the exchange
    // is refused without
    localStorage.setItem(VERIFIER_KEY, "test-verifier");
    fetch = function (url, opts) {
      __sent.push({ url: String(url), headers: "",
                    body: String((opts && opts.body) || "") });
      return Promise.resolve({
        ok: true, status: 200,
        json: function () {
          return Promise.resolve({ access_token: ${JSON.stringify(TK)} });
        },
        text: function () { return Promise.resolve(""); }
      });
    };
    finishSignIn();
  `, sandbox);
  await sleep(120);
  const after = vm.runInContext(`
    (function () {
      var tk = ${JSON.stringify(TK)};
      var line = document.getElementById("lichessLine");
      return { kept: storedToken() === tk,
               inLog: LOG.join(" ").indexOf(tk) >= 0,
               inSpeech: __spoken.join(" ").indexOf(tk) >= 0,
               inStatus: String(line ? line.textContent : "").indexOf(tk) >= 0,
               said: LOG.join(" ") };
    })()
  `, sandbox);
  check("the exchange really did bank the token", after.kept === true);
  check("and said nothing about it in the log", after.inLog === false);
  check("nor spoke it", after.inSpeech === false);
  check("nor put it on screen", after.inStatus === false);
  // it must still SAY it got one - silence is not an answer
  check("but it does record that a token arrived",
        /token/i.test(after.said));

  vm.runInContext(`
    clearToken(); location.search = ""; fetch = __realFetch;
    api.gameId = null; running = false;
  `, sandbox);

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
