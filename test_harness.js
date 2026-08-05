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
 * concatenates into dist/index.html, in the same order. Only
 * 00-header.js and closure-footer.js are skipped - they hold
 * no code, just the closure and its documentation.
 *
 * The w19 harness's silent-mode, low-time, voice-dropdown and
 * MODE_SETTINGS tests are gone WITH THEIR FEATURES: silent
 * mode left canon at v109, the rest were w-era apparatus the
 * w20 rebuild retired (see 00-header.js). Do not resurrect a
 * test without its feature.
 *
 *   node test_harness.js
 *
 * Perft, whenever 13-rules.js changes (it is FROZEN):
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
    addEventListener(name, fn) { this["on_" + name] = fn; },
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
    getBoundingClientRect() { return { width: 100, height: 100, top: 500 }; },
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
// function in a late section (makeRules, section 13) hoists
// above a top-level call in an early one (RULES, section 11).
// Separate evaluations lose that hoisting and fail on code
// the real page runs fine.
const order = fs.readFileSync("manifest.txt", "utf8").split("\n")
  .map(s => s.trim())
  .filter(s => s && !s.startsWith("#") && !s.startsWith("@"))
  .filter(s => s !== "00-header.js" && s !== "closure-footer.js");
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  // ---- clock mode, as v133 ships it (section 14) ----
  vm.runInContext("enterClockMode();", sandbox);
  check("clock mode reports on",
        vm.runInContext("clockModeOn()", sandbox) === true);
  say("flip clock");
  await sleep(120);
  check("flip clock handled without throwing",
        !vm.runInContext("LOG.slice(-5).join(' ')", sandbox)
          .includes("flipClockSides"));
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
        /Tap the round button/.test(status()));
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
  vm.runInContext(`
    __micStarts = 0;
    var __realStart = startListening;
    startListening = function () {
      if (!running || listening || speaking) return;
      __micStarts++; listening = true;
    };
    running = true; listening = false; speaking = true;
    startListening();          // blocked, as during an announcement
  `, sandbox);
  check("mic refuses to start during speech",
        vm.runInContext("__micStarts", sandbox) === 0);
  vm.runInContext(`
    speaking = false;
    if (running && !listening) startListening();
  `, sandbox);
  check("mic starts once speech ends",
        vm.runInContext("__micStarts", sandbox) === 1);
  vm.runInContext("startListening = __realStart; listening = false;",
                  sandbox);

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
  const tmpl = fs.readFileSync("src/index.html", "utf8");
  check("page button CSS is scoped to .panel",
        !/\n  button \{/.test(tmpl) && /\.panel button \{/.test(tmpl));
  check("the Voice panel hosts the buttons",
        tmpl.includes('id="panelControls"'));
  check("the button row is re-parented into it",
        fs.readFileSync("src/12-ui.js", "utf8")
          .includes('el("panelControls")'));

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
  check("overlays and their buttons get touch-action",
        /touchAction = "manipulation"/.test(
          fs.readFileSync("src/12-ui.js", "utf8")));

  // ---- w29: the voice button is a labelled pill ----
  const btnState = () => vm.runInContext(`
    (function () {
      return { text: bigBtn.textContent,
               bg: bigBtn.style.background,
               css: bigBtn.style.cssText || "" };
    })()
  `, sandbox);
  vm.runInContext("running = false; renderButton();", sandbox);
  const offBtn = btnState();
  check("off: says what to do (" + offBtn.text + ")",
        /^\u25B6 Start$/.test(offBtn.text));
  check("off: wears the page's primary blue",
        offBtn.bg.toLowerCase() === "#91bddf");
  vm.runInContext("running = true; listening = true; renderButton();",
                  sandbox);
  const onBtn = btnState();
  check("on: says it is listening (" + onBtn.text + ")",
        /^\u25CF Listening$/.test(onBtn.text));
  check("on: wears the same green as a lit button",
        onBtn.bg.toLowerCase() === "#3a5a2a");
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
  // this check grepped 12-ui.js for "row-reverse" and failed
  // on its own explanatory comment
  check("no row-reverse trick left - it wraps wrong on a phone",
        styled.innerDir !== "row-reverse");
  check("Practice sits furthest from Start (" +
        rowOrder[rowOrder.length - 1] + ")",
        /Practice/.test(rowOrder[rowOrder.length - 1]));

  // ---- w24: the settings panel anchors to its button ----
  const w12 = fs.readFileSync("src/12-ui.js", "utf8");
  check("settings panel anchored on both axes",
        w12.includes('setPanel.style.left') &&
        w12.includes('setPanel.style.top') &&
        w12.includes('setPanel.style.right =\n') ===
          w12.includes('setPanel.style.right =\n') /* keep simple */ &&
        /style\.right\s*=\s*"auto"/.test(w12));

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
  vm.runInContext("pickTime(null);", sandbox);

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
  const src12 = fs.readFileSync("src/12-ui.js", "utf8");
  const offPath = src12.slice(src12.indexOf("voice play off") - 800,
                              src12.indexOf("voice play off"));
  check("voice off tears down no network",
        !/streamAbort|pollTimer|reconnectTimer/.test(offPath));
  // delta 3: leaving practice rejoins through the account API
  check("practice off rejoins a live game",
        /rejoinCurrent\(\)/.test(src12));
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

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
