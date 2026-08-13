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

// the preset buttons the template carries, as real stub
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
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    addEventListener(name, fn) {
      var list = this._listeners[name] || (this._listeners[name] = []);
      list.push(fn);
      var el = this;
      this["on_" + name] = function (ev) {
        list.slice().forEach(function (f) { f.call(el, ev); });
      };
    },
    // real parent/child, so a test can ask which element
    // actually got styled instead of grepping the source.
    // THE LINK POINTS BOTH WAYS since w69: appendChild set the
    // child but never the parent, so any code walking UP the
    // tree - the settings panel's tap-outside test, which is
    // exactly "is this tap inside the panel" - saw every node
    // as a root and could not be tested at all on the case
    // that matters, a tap on a pill INSIDE the panel.
    children: [],
    parentNode: null,
    appendChild(c) {
      if (!c) return c;
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);   // a real move
      this.children.push(c);
      c.parentNode = this;
      return c;
    },
    insertBefore(c, ref) {
      if (!c) return c;
      const had = this.children.indexOf(c);
      if (had >= 0) this.children.splice(had, 1);
      const at = ref ? this.children.indexOf(ref) : -1;
      if (at >= 0) this.children.splice(at, 0, c);
      else this.children.push(c);
      c.parentNode = this;
      return c;
    },
    get firstChild() { return this.children[0] || null; },
    remove() {},
    // the context RECORDS its paints — op, args, and the
    // fillStyle in force — so a test can ask what the board
    // actually drew. Same law as the DOM stubs: ask the built
    // thing, never grep the source. Gradients come back as
    // objects carrying their stops, for the same reason.
    getContext() {
      const el = this;
      if (el._ctx) return el._ctx;
      el._paints = [];
      const state = {};
      el._ctx = new Proxy(state, {
        get(t, k) {
          if (k in t) return t[k];
          if (k === "createRadialGradient")
            return (...a) => {
              const g = { radial: a, stops: [] };
              g.addColorStop = (off, col) => g.stops.push([off, col]);
              return g;
            };
          return (...a) => {
            el._paints.push({ op: k, args: a, fillStyle: t.fillStyle });
          };
        },
        set(t, k, v) { t[k] = v; return true; }
      });
      return el._ctx;
    },
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
// ONE collapsible panel since w120: the owner's redesign made
// the board and the merged controls panel always-open, so
// Instructions is the only <details> left on the page (the
// log panel is the shared UI's floating one, not a page
// panel). Its markup default is CLOSED (w32).
const fakePanels = ["panelInstructions"].map(id => ({
  open: false,
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
    // w69: the document's own listeners are REAL now. The
    // settings panel closes on a tap anywhere outside it, and
    // that handler lives here - dropped on the floor by the
    // old no-op stub, so the fix would have been untestable.
    _listeners: {},
    addEventListener(name, fn) {
      (this._listeners[name] || (this._listeners[name] = [])).push(fn);
    },
    __fireClick(ev) {
      (this._listeners.click || []).slice()
        .forEach(function (f) { f(ev); });
    },
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

// capture speech after load (they are globals now) - keeping
// a handle on the real speak first, because the SAY log line
// is its work and w119's claim about that line can only be
// asked of the real function
vm.runInContext(`
  var __spoken = [];
  var __realSpeak = speak;
  speak = function (t) { __spoken.push(t); };
  speakWhenAudioSettled = function (t) { __spoken.push(t); };
`, sandbox);

// boot ran on load (readyState complete). Now: practice. The
// practice button is created by createElement so the harness
// cannot find it by id; enter the mode the way the button does.
vm.runInContext(`
  dryRun = true; running = true;
  confirmAction = null;
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

  // w118: a whole four-item move plays at once, "okay." (no
  // WebAudio here) is the one bit spoken, and the practice
  // opponent replies
  await expect("golf one foxtrot three", /okay/i);
  await sleep(150); heard();     // the practice random reply
  await expect("repeat", /./);
  await expect("memo testing the port", /memo recorded/i);

  // ---- w119: a SAY line quotes the sentence bare ----
  // w113 bracketed a color onto move announcements ("[black]
  // knight charlie 6.") so a recapture's read-back and
  // announcement - the same sentence twice - could be told
  // apart; w118 ended the spoken read-back and w119 removed
  // the annotation. Asked of the REAL speak, captured before
  // the stub above, because the SAY line is its work: the log
  // carries exactly what the voice said and nothing else.
  // read only the lines this call adds - the boot lines
  // already in LOG are another test's evidence (line 706)
  const sayLine = vm.runInContext(`
    (function () {
      var n = LOG.length;
      __realSpeak("knight charlie 6.");
      return LOG.slice(n).filter(function (l) {
        return l.indexOf("SAY") >= 0;
      }).join("|");
    })()
  `, sandbox);
  check("a SAY line is the spoken sentence, unannotated (" +
        sayLine + ")",
        /SAY {2}knight charlie 6\.$/.test(sayLine) &&
        sayLine.indexOf("[") < 0);
  await sleep(1400);        // the real speech chain settles (450ms gap)

  // the four-item property, spot-checked on a fresh practice
  // game: less than the whole move never plays
  vm.runInContext(`
    dryRun = true; running = true;
    confirmAction = null;
    dryStart();
  `, sandbox);
  await sleep(150); heard();
  say("delta four");
  await sleep(120);
  const d4 = heard().join(" | ");
  if (vm.runInContext("api.moves.length", sandbox) !== 0) {
    console.log("FAIL bare d4 played something:", d4); fail++;
  } else {
    console.log("PASS a bare square plays nothing:", d4); pass++;
  }
  say("delta two delta four");
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

  // w110: the clock overlay is NUMBERS AND NOTHING ELSE.
  // Asked of the built DOM: two halves, each holding one
  // element (the time), no move row, no message strip.
  vm.runInContext("enterClockMode();", sandbox);
  const overlayShape = vm.runInContext(`
    [clockOverlay.children.length,
     clockOverlay.children.map(function (h) {
       return h.children.length; }).join(",")]
  `, sandbox);
  check("the clock overlay is two halves of one number each (" +
        overlayShape + ")",
        overlayShape[0] === 2 && overlayShape[1] === "1,1");
  vm.runInContext("exitClockMode(true);", sandbox);

  // w117: THE SETTINGS PERSISTENCE LAYER IS GONE WHOLE.
  // loadSettings, saveSettings, CFG and the stored blob all
  // died with the panel - settings are code constants now -
  // so the w111 "dead blob keys move nothing" and w75
  // "deleted setting is dropped" properties hold vacuously:
  // NOTHING reads the blob any more, and the blob itself is
  // a dead key the scrub removes. Asserted directly.
  check("the settings persistence layer is gone whole",
        vm.runInContext(
          'typeof loadSettings === "undefined" && ' +
          'typeof saveSettings === "undefined" && ' +
          'typeof CFG === "undefined"', sandbox));

  // w111: the storage scrub. Every name a previous era
  // wrote on this origin is removed on boot - including
  // the two old token keys, whose stranded credentials are
  // the point, and (since w117) the settings blob - and
  // current keys are untouched.
  const scrubbed = vm.runInContext(`
    localStorage.setItem("audioplay.token", "CURRENT");
    localStorage.setItem("audioplay.ratings", "on");
    localStorage.setItem("audioplay.movespeech", "squares");
    localStorage.setItem("audioplay_lichess_token", "OLD");
    localStorage.setItem("audioplay.lichess.token", "OLDER");
    localStorage.setItem("audioplay.lichess.verifier", "x");
    localStorage.setItem("audioplay.web.opponent", "x");
    localStorage.setItem("audioplay.web.rated", "x");
    localStorage.setItem("audioplay.web.timecontrol", "x");
    localStorage.setItem("audioplay.settings", '{"showRatings":true}');
    scrubDeadStorage();
    var left = ["audioplay_lichess_token", "audioplay.lichess.token",
                "audioplay.lichess.verifier", "audioplay.web.opponent",
                "audioplay.web.rated", "audioplay.web.timecontrol",
                "audioplay.settings"]
      .filter(function (k) { return localStorage.getItem(k) !== null; });
    var kept = [localStorage.getItem("audioplay.token"),
                localStorage.getItem("audioplay.ratings"),
                localStorage.getItem("audioplay.movespeech")];
    localStorage.removeItem("audioplay.token");
    localStorage.removeItem("audioplay.ratings");
    localStorage.removeItem("audioplay.movespeech");
    [left.length].concat(kept);
  `, sandbox);
  check("the scrub removes every dead key and keeps the live " +
        "ones - w120's two flat keys included (" + scrubbed + ")",
        scrubbed[0] === 0 && scrubbed[1] === "CURRENT" &&
        scrubbed[2] === "on" && scrubbed[3] === "squares");

  // ---- w10/w12/w76/w77: one account button; the sign-out ----
  // is a question first. At rest the signed-in button is the
  // NAME alone; the first tap asks, the second answers, and
  // the question cancels on a tap elsewhere or on its timer
  // (rule 5: a question must be cancellable). Every leg is
  // driven through the built button - a feature used twice
  // is a different feature (w37).
  vm.runInContext(`
    api.myId = "pawn76"; api.myName = "pawn76";
    renderAccount();
  `, sandbox);
  const btn = () => vm.runInContext(
    'document.getElementById("btnSignIn").textContent', sandbox);
  const btnCls = (n) => vm.runInContext(
    'document.getElementById("btnSignIn").classList.contains("' +
    n + '")', sandbox);
  check("signed in, at rest: the button is just the name (" + btn() + ")",
        btn() === "pawn76" && btnCls("on") && !btnCls("confirm"));
  vm.runInContext('api.myId = null; api.myName = null; renderAccount();',
                  sandbox);
  check("signed out: the button invites sign-in",
        btn() === "Sign in with Lichess");
  // count both real functions through stubs, and RESTORE them
  // after - a stub that outlives its test silently disarms
  // every later one that touches the same name (see the
  // startSeek lesson further down).
  vm.runInContext(`
    __realSignIn = signIn; __realSignOut = signOut;
    __signInCalls = 0; __signOutCalls = 0;
    signIn = function () { __signInCalls++; };
    signOut = function () { __signOutCalls++; };
    document.getElementById("btnSignIn").on_click();
  `, sandbox);
  check("signed out: tapping it signs in, not out",
        vm.runInContext("__signInCalls", sandbox) === 1 &&
        vm.runInContext("__signOutCalls", sandbox) === 0);
  vm.runInContext(`
    api.myId = "pawn76"; api.myName = "pawn76"; renderAccount();
    document.getElementById("btnSignIn").on_click();
  `, sandbox);
  check("signed in, first tap: asks, signs nothing out (" + btn() + ")",
        btn() === "Sign out?" && btnCls("confirm") && !btnCls("on") &&
        vm.runInContext("__signOutCalls", sandbox) === 0);
  // the twice-a-second repaint tick redraws through
  // renderAccount; it must not un-ask the standing question
  vm.runInContext("renderAccount();", sandbox);
  check("the question survives a repaint (" + btn() + ")",
        btn() === "Sign out?" && btnCls("confirm"));
  // a tap ANYWHERE ELSE is one cancel - the w69 tap-outside
  // pattern, fired through the document's real listener
  vm.runInContext(
    'document.__fireClick({ target: document.body });', sandbox);
  check("a tap elsewhere cancels back to the name (" + btn() + ")",
        btn() === "pawn76" && btnCls("on") &&
        vm.runInContext("__signOutCalls", sandbox) === 0);
  // and a tap on the BUTTON while armed must not self-cancel
  // through that same document listener
  vm.runInContext(`
    document.getElementById("btnSignIn").on_click();
    document.__fireClick({
      target: document.getElementById("btnSignIn") });
  `, sandbox);
  check("the document handler leaves the button's own tap alone",
        btn() === "Sign out?");
  // asked and answered: the second tap on the question acts
  vm.runInContext('document.getElementById("btnSignIn").on_click();',
                  sandbox);
  check("second tap on the question signs out",
        vm.runInContext("__signOutCalls", sandbox) === 1 &&
        vm.runInContext("__signInCalls", sandbox) === 1 &&
        btn() === "pawn76");
  // the timer is the other cancel; shrink it rather than wait
  const timedOut = await vm.runInContext(`
    (function () {
      SIGNOUT_ARM_MS = 20;
      document.getElementById("btnSignIn").on_click();
      return new Promise(function (res) {
        setTimeout(function () {
          res(document.getElementById("btnSignIn").textContent);
        }, 120);
      });
    })()
  `, sandbox);
  check("unanswered, the question times out to the name (" + timedOut + ")",
        timedOut === "pawn76" &&
        vm.runInContext("__signOutCalls", sandbox) === 1);
  vm.runInContext(`
    SIGNOUT_ARM_MS = 4000;
    api.myId = null; api.myName = null; renderAccount();
    signIn = __realSignIn; signOut = __realSignOut;
  `, sandbox);
  check("the separate sign-out button is gone from the page",
        vm.runInContext('document.getElementById("btnSignOut")',
                        sandbox) === null);

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
        /Tap the Voice Mode button/.test(status()));
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
  // w91: the mic's lifecycle is visible in the log, so a
  // wedged recognizer (started, then silent forever) can be
  // told apart from a quiet room in a pasted log - and told
  // apart from audio that arrives but is never recognised.
  // no LOG reset here: the boot "loaded:" line is still in
  // LOG and a later test reads it. These lines cannot
  // pre-exist, so counting works on the full log.
  vm.runInContext(`
    recognition.onaudiostart();
    recognition.onsoundstart(); recognition.onsoundstart();
    recognition.onspeechstart(); recognition.onspeechstart();
  `, sandbox);
  check("the mic says when its audio route opens",
        vm.runInContext(
          "LOG.some(function (l) { return /audio route open/.test(l); })",
          sandbox));
  check("and when sound and speech reach it, once per cycle each",
        vm.runInContext(
          "LOG.filter(function (l) { return /sound reaching/.test(l); })" +
          ".length", sandbox) === 1 &&
        vm.runInContext(
          "LOG.filter(function (l) { return /speech detected/.test(l); })" +
          ".length", sandbox) === 1);
  vm.runInContext("startListening();", sandbox);
  check("a second start while listening is refused",
        vm.runInContext("__recBuilt", sandbox) === 1);
  vm.runInContext("running = false; listening = false; startListening();",
                  sandbox);
  check("and it will not start with the voice loop off",
        vm.runInContext("__recBuilt", sandbox) === 1);
  // w91: the audio session is DECLARED where the API exists
  // (restored - it left in w90 only because it lived in the
  // deleted keep-alive file), and detected-absent elsewhere
  const audDecl = vm.runInContext(`
    (function () {
      navigator.audioSession = { type: "auto" };
      declareAudioSession();
      var declared = navigator.audioSession.type;
      delete navigator.audioSession;
      declareAudioSession();        /* absent: a log line, no throw */
      return declared;
    })()
  `, sandbox);
  check("the audio session is declared play-and-record where supported",
        audDecl === "play-and-record");
  // put the sandbox back to no-recogniser, which is what every
  // other test in this file has run under
  vm.runInContext(`
    clearTimeout(restartTimer);
    recognition = null; listening = false; Rec = null;
  `, sandbox);

  // ---- v134: the read-back race (game24) ----
  // whichever of the stream and the 200 arrives first
  // speaks; the loser finds the arm gone and says nothing.
  // Since w116 what the winner delivers is confirmFeedback -
  // the chime, or "okay." where WebAudio is absent, as it is
  // here - never the move again: the question already said it.
  vm.runInContext(`
    api.myColor = "w"; api.over = false;
    armedUci = "e2e4";
  `, sandbox);
  heard();
  vm.runInContext('readBackMine("e4", "e2e4", true);', sandbox);
  await sleep(50);
  const raceWon = heard().join(" ");
  check("armed move confirmed once, one bit, not re-read (" +
        raceWon + ")",
        /okay/i.test(raceWon) && !/echo 4/.test(raceWon));
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

  // (the "tags"/"text" take-word checks died at w118 with
  // TAKE_WORDS itself: there is no take word to mishear)

  // ---- v135/w23: the starting switches are logged ----
  // Since w117 the switches are code constants (the panel and
  // its blob are gone), but the boot line's job is unchanged:
  // a pasted log names its configuration.
  const bootLine = vm.runInContext(
    'LOG.filter(function (l) { return l.indexOf("loaded:") >= 0; })[0] || ""',
    sandbox);
  check("boot logs the configuration (" +
        bootLine.slice(bootLine.indexOf("loaded:")).slice(0, 40) + "...)",
        /loaded:/.test(bootLine) &&
        /ratings=(on|off)/.test(bootLine) &&
        // w120: the announcement style is a stored choice, so
        // a pasted log must say which one the device speaks
        /moves=(pieces|squares)/.test(bootLine) &&
        // the dead switch names must NOT be in the boot line:
        // a name reappearing here means a setting crept back
        !/confirmMine|guardPawnPushes/.test(bootLine) &&
        /voice=(system|\S+)/.test(bootLine));
  check("and ratings default off (w117, owner's order)",
        /ratings=off/.test(bootLine) &&
        vm.runInContext("SHOW_RATINGS", sandbox) === false);
  check("and moves default pieces - what every game before " +
        "w120 spoke",
        /moves=pieces/.test(bootLine) &&
        vm.runInContext("MOVE_SPEECH", sandbox) === "pieces");

  // ---- w70/w71: the rail follows the board; the CLOCK BOX
  // is the turn indicator ----
  // w70 put the clocks in a rail beside the board, far side on
  // top, yours at the bottom. w71 removed the White/Black
  // captions (the board next to them says it) and made the box
  // colour carry the turn, as on Lichess: green = to move,
  // red = to move AND low, grey+dim = waiting. Both
  // orientations are checked - a rail frozen white-on-top
  // would pass the first and fail the second.
  const rail = () => vm.runInContext(`
    (function () {
      renderPageClocks();
      return { top: document.getElementById("clockTop").innerHTML,
               bottom: document.getElementById("clockBottom").innerHTML };
    })()
  `, sandbox);
  vm.runInContext(`
    api.myColor = "b"; api.over = false; api.clockAt = null;
    api.wtime = 65000; api.btime = 30000;
    api.pos = { turn: "w" };
  `, sandbox);
  const asBlack = rail();
  check("bare digits, no colour captions, no you-and-them (" +
        (asBlack.top + " / " + asBlack.bottom).replace(/<[^>]+>/g, "") + ")",
        /1:05/.test(asBlack.top) && /0:30/.test(asBlack.bottom) &&
        !/White|Black|you|them/i.test(asBlack.top + asBlack.bottom));
  // MY clock is LOW while THEIR side moves. w71 turned the red
  // off here and the owner overruled it with Lichess as the
  // precedent: below the threshold the box turns red and STAYS
  // red - dimming is what says whose turn it is, and it is
  // orthogonal, so the waiting box is a darker red, not grey.
  check("white to move: the far box is green at full brightness",
        /cbox turn/.test(asBlack.top) && !/idle/.test(asBlack.top));
  check("my low waiting clock stays red - dimmed, not grey (" +
        asBlack.bottom + ")",
        /cbox low idle/.test(asBlack.bottom));
  vm.runInContext('api.pos = { turn: "b" };', sandbox);
  const myMove = rail();
  check("black to move: my low running clock is bright red, theirs dims",
        /cbox low"/.test(myMove.bottom) && /cbox idle/.test(myMove.top) &&
        !/idle/.test(myMove.bottom));
  // the same board from the other side: the rail turns over
  vm.runInContext('api.myColor = "w"; api.pos = { turn: "w" };', sandbox);
  const asWhite = rail();
  check("playing white, the rail turns over (" +
        (asWhite.top + " / " + asWhite.bottom).replace(/<[^>]+>/g, "") + ")",
        /0:30/.test(asWhite.top) && /1:05/.test(asWhite.bottom));
  check("and the green follows the turn to the bottom",
        /cbox turn/.test(asWhite.bottom) && /low idle/.test(asWhite.top));
  // a finished game: full brightness, nobody waiting - but a
  // flagged clock keeps its red, as Lichess leaves the loser's
  vm.runInContext('api.over = true;', sandbox);
  const overRail = rail();
  check("game over: no green, no dimming, red survives on the low side",
        !/turn|idle/.test(overRail.top + overRail.bottom) &&
        /cbox low/.test(overRail.top) && /cbox"/.test(overRail.bottom));
  vm.runInContext('api.over = false; api.myColor = "b";', sandbox);

  // ---- w83: the clocks do not run until both sides have
  // moved ----
  // Lichess's rule: each player's FIRST move is untimed. The
  // page extrapolated from the moment the challenge was
  // accepted, so the owner watched five minutes drain while
  // the board waited for e4, then snap back to 5:00 on the
  // first server event. Asked of the built rail with the
  // anchor set 15 seconds stale - the state the bug lived in.
  vm.runInContext(`
    api.myColor = "w"; api.over = false;
    api.pos = new RULES.Position();
    api.moves = []; api.movesBefore = 0;
    api.wtime = 300000; api.btime = 300000;
    api.clockAt = Date.now() - 15000;
  `, sandbox);
  const untimed0 = rail();
  check("before anyone moves, a stale anchor drains nothing (" +
        (untimed0.top + " / " + untimed0.bottom)
          .replace(/<[^>]+>/g, "") + ")",
        /5:00/.test(untimed0.top) && /5:00/.test(untimed0.bottom));
  vm.runInContext(`
    api.pos.applyUci("e2e4"); api.moves = ["e2e4"];  // black to move
    api.clockAt = Date.now() - 15000;
  `, sandbox);
  const untimed1 = rail();
  check("black's first move is untimed too",
        /5:00/.test(untimed1.top) && /5:00/.test(untimed1.bottom));
  vm.runInContext(`
    api.pos.applyUci("e7e5"); api.moves = ["e2e4", "e7e5"];
    api.clockAt = Date.now() - 15000;    // white thinking, move 2
  `, sandbox);
  const timed2 = rail();
  check("once both have moved the running side drains (" +
        (timed2.top + " / " + timed2.bottom)
          .replace(/<[^>]+>/g, "") + ")",
        /4:4[0-9]/.test(timed2.bottom) && /5:00/.test(timed2.top));
  // a mid-game poll join has an empty move list against a game
  // long underway; movesBefore carries the fen's ply count so
  // the clocks are known to be running already
  vm.runInContext(`
    api.moves = []; api.movesBefore = 24;
    api.clockAt = Date.now() - 15000;
  `, sandbox);
  const midJoin = rail();
  check("a mid-game join knows the clocks already run (" +
        (midJoin.top + " / " + midJoin.bottom)
          .replace(/<[^>]+>/g, "") + ")",
        /4:4[0-9]/.test(midJoin.bottom));
  vm.runInContext(
    'api.clockAt = null; api.movesBefore = 0; api.moves = [];' +
    'api.myColor = "b"; api.pos = null;', sandbox);

  // w70: the rail is BESIDE the board, not under it. The
  // renderers above prove the contents; this proves the shape
  // they render into actually exists, since a rail whose CSS
  // never arrived would still pass every check above while
  // stacking under the board exactly as before. Read from the
  // template, which is the thing build.js inlines - the claim
  // is about markup, so markup is what is read (the same
  // exception w67 states).
  const tmplBoard = fs.readFileSync("src/index.html", "utf8");
  check("the board and its rail share one flex row",
        /id="boardRow"/.test(tmplBoard) &&
        /#boardRow\s*\{[^}]*display:\s*flex/.test(tmplBoard));
  check("the rail carries a clock and a name at each end",
        /id="clockTop"/.test(tmplBoard) && /id="nameTop"/.test(tmplBoard) &&
        /id="nameBottom"/.test(tmplBoard) && /id="clockBottom"/.test(tmplBoard));
  // w81: the renderer no longer writes idle onto the names
  // (checked above, of the built DOM); this holds the CSS half
  // of the same claim, read from the rule's own text like the
  // w73 media-query checks - the idle dim belongs to the clock
  // box alone, and the rating wears the name's own face rather
  // than a faded one.
  check("the stylesheet dims the clock box only, never a name",
        /\.sideClock \.cbox\.idle/.test(tmplBoard) &&
        !/\.sideName [^{]*\.idle/.test(tmplBoard));
  check("and the rating has no fade of its own",
        !/\.sideName \.rating/.test(tmplBoard));
  // w103: and neither name is tinted to mark it as yours -
  // the rail's ORDER says that, since it follows the board.
  // Both halves again: no rule for it in the template, and no
  // class for it on the built markup either.
  check("the stylesheet gives both names one colour",
        /\.sideName \{[^}]*color:\s*var\(--bright\)/.test(tmplBoard) &&
        !/\.sideName \.mine/.test(tmplBoard));
  // w119: the two boxes share one width and the colons stack.
  // The boxes hugged their digits, so "15:49" outgrew "0:23"
  // and a box resized crossing 9:59. A CSS claim, so read from
  // the rule's own text like the w81/w103 checks beside it:
  // min-width holds the box still, right-alignment pins the
  // constant-width ":SS" tail (tabular-nums) to one column.
  check("the clock boxes hold one width, digits right-aligned",
        /\.sideClock \.cbox \{[^}]*min-width/.test(tmplBoard) &&
        /\.sideClock \.cbox \{[^}]*text-align:\s*right/.test(tmplBoard));
  // w104: and the title is a different KIND of fact, not a
  // lesser one - coloured and bold at full strength, the way
  // lichess.org shows IM/GM/BOT, rather than the .65 fade it
  // wore since w68.
  check("the title is amber and bold, with no fade left on it",
        /\.sideName \.title \{[^}]*color:\s*var\(--amber\)/.test(tmplBoard) &&
        /\.sideName \.title \{[^}]*font-weight:\s*700/.test(tmplBoard) &&
        !/\.sideName \.title \{[^}]*opacity/.test(tmplBoard));
  // w105: except BOT, which lichess.org marks in fuchsia - a
  // bot is not a rank, it is a different sort of opponent.
  check("and BOT has a colour of its own",
        /\.sideName \.title\.bot \{[^}]*color:\s*var\(--fuchsia\)/
          .test(tmplBoard));
  // w107: PROSE IN SANS, MACHINE OUTPUT IN MONO. The names
  // and the status line wore Menlo by inheritance - the names
  // to match a clock that has been sans since w72, the status
  // line through reference/'s .stats class, whose two NUMERIC
  // members (a clock and a turn readout) are long gone. Both
  // are body-sans now; the log stays monospace, where column
  // alignment is the point. Read from the rules' own text,
  // like the w73/w81 checks beside it.
  check("the names and the status line are not monospace",
        !/\.sideName \{[^}]*Menlo/.test(tmplBoard) &&
        !/#lichessLine \{[^}]*Menlo/.test(tmplBoard) &&
        // the RULE, not the word: the comment above the folded
        // rule names .stats to say where it went
        !/\.stats\s*\{/.test(tmplBoard));
  check("the log panel keeps its monospace",
        /font-family:ui-monospace,Menlo,monospace/.test(
          fs.readFileSync("src/ui.js", "utf8")));
  // and the status line keeps what the folded class gave it:
  // pre-wrap is what lets a message hold its own line breaks
  check("and the status line keeps its pre-wrap",
        /#lichessLine \{[^}]*white-space:\s*pre-wrap/.test(tmplBoard));

  // w82: the centred row must centre what the eye sees. The
  // rail grew once (flex 1 1) and its empty growth counted in
  // the centring, shoving the visible board-and-clocks cluster
  // left of centre. Read from the rules' own text, as w73's
  // checks are: the row centres, and the rail takes only its
  // content's width.
  check("the row centres a rail no wider than its content",
        /#boardRow\s*\{[^}]*justify-content:\s*center/.test(tmplBoard) &&
        /#boardSide\s*\{[^}]*flex:\s*0 1 auto/.test(tmplBoard));
  check("and it wraps under the board rather than squeezing it",
        /#boardRow\s*\{[^}]*flex-wrap:\s*wrap/.test(tmplBoard));
  // w73: on a narrow screen the clocks SPLIT around the board,
  // Lichess's portrait shape - the far player's bar above,
  // yours below - instead of both wrapping underneath. Three
  // load-bearing pieces: a media query, the rail dissolved so
  // its blocks join the column (display:contents), and the far
  // block ordered above the canvas. Checked in the query's own
  // text so a rule drifting outside it cannot pass.
  const narrowCss = (tmplBoard.match(/@media[^{]*\{([\s\S]*?)\n  \}/) ||
                     [,""])[1];
  check("a narrow screen has its own board layout (@media found)",
        narrowCss.length > 0);
  check("the rail dissolves into the column there",
        /#boardSide\s*\{[^}]*display:\s*contents/.test(narrowCss));
  check("and the far player's block moves above the board",
        /#sideTop\s*\{[^}]*order:\s*-1/.test(narrowCss));
  check("each bar goes horizontal, name and clock on one line",
        /\.sideBlock\s*\{[^}]*flex-direction:\s*row/.test(narrowCss));
  // press the voice button with no token and listen, rather
  // than grepping the source for the string
  vm.runInContext(`
    running = false; dryRun = false;
    localStorage.removeItem("audioplay.token");
    TOKEN = "";
    // the voice button has no id - it is the first control
    // in the voice row, which is exactly how a finger finds
    // it too (w31 put it there)
    wrapEl.firstChild.children[0].on_click();
  `, sandbox);
  const startSaid = heard().join(" | ");
  // w121 flipped w39's mechanism: the sentence (and so the
  // SAY line) carries the site's real name, and the phonetic
  // form exists only in the synthesizer's mouth (forTheEar)
  check("signed out, the voice button names the site for the " +
        "EYE (" + startSaid + ")",
        /Lichess/.test(startSaid) && !/lee chess/.test(startSaid));
  vm.runInContext("running = false; renderButton();", sandbox);

  // ---- w39/w121: spoken for the ear, logged for the eye ----
  // Driven through the REAL pipeline: the utterance handed to
  // the synthesizer wears the phonetic forms, the SAY line
  // written beside it does not.
  const earSplit = vm.runInContext(`
    (function () {
      var got = [];
      var real = speechSynthesis.speak;
      speechSynthesis.speak = function (u) {
        got.push(u.text);
        if (u.onend) setTimeout(u.onend, 1);
      };
      speaking = false; speakQueue = [];
      var n = LOG.length;
      __realSpeak("sign in with Lichess first.");
      speechSynthesis.speak = real;
      return { utt: got.join("|"),
               say: LOG.slice(n).filter(function (l) {
                 return l.indexOf("SAY") >= 0; }).join("|") };
    })()
  `, sandbox);
  check("the synthesizer hears lee chess (" + earSplit.utt + ")",
        /lee chess/.test(earSplit.utt) && !/Lichess/.test(earSplit.utt));
  check("while the SAY line reads Lichess (" + earSplit.say + ")",
        /Lichess/.test(earSplit.say) && !/lee chess/.test(earSplit.say));
  // the rest of the table, asked of the built function.
  // brawvo took two tries: "brahvo" came back BRE-vo, and
  // aw is English's stable spelling of the vowel the owner
  // specified (the o of octopus). The letter rows are GONE
  // (w126, with the chess style whose letters they served) -
  // asserted with the style's own machinery further down.
  check("bravo is respelled for the voice only",
        vm.runInContext('forTheEar("bravo 4.")', sandbox) === "brawvo 4." &&
        vm.runInContext('forTheEar("bravo 7, bravo 5.")', sandbox) ===
          "brawvo 7, brawvo 5.");
  check("and the other NATO words pass through untouched",
        vm.runInContext('forTheEar("delta 7, delta 5.")', sandbox) ===
          "delta 7, delta 5.");
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
  // ---- w120: the owner's layout ----
  // The board panel opens the page, bare - then ONE merged
  // panel of everything that acts (the button row and the
  // seek/challenge controls, the old GAMES), then
  // Instructions. Order is asked of the template by position.
  const atBoard = tmpl.indexOf('id="panelBoard"');
  const atLichess = tmpl.indexOf('id="panelLichess"');
  const atControls = tmpl.indexOf('id="panelControls"');
  const atInstructions = tmpl.indexOf('id="panelInstructions"');
  check("the board panel is first, above the merged panel",
        atBoard >= 0 && atBoard < atLichess &&
        atLichess < atInstructions);
  check("the controls host sits INSIDE the merged panel",
        atLichess < atControls && atControls < atInstructions);
  // No BOARD caption, no GAMES caption: section labels were
  // spending screen the board needs. Instructions keeps its
  // summary - a fold needs a name to tap on.
  check("no Board or Games caption survives",
        !/<summary>Board<\/summary>/.test(tmpl) &&
        !/<summary>Games<\/summary>/.test(tmpl) &&
        !/<h2>/.test(tmpl));
  // counted by <summary> - a fold needs its tappable name, and
  // the word <details> also appears in the comments explaining
  // why the other panels lost theirs
  check("Instructions is the only collapsible section",
        (tmpl.match(/<summary>/g) || []).length === 1 &&
        tmpl.slice(atInstructions).indexOf("<summary>Instructions") >= 0);
  // the merged panel keeps its OLD id: the harness and the
  // panel memory knew it by name, and renaming buys nothing
  check("the merged panel keeps the panelLichess id",
        tmpl.includes('id="panelLichess"'));
  // w121: the first panel drops its top margin, which stacked
  // on the body padding as 24px of dead space above the board
  check("the board panel sits flush under the body padding",
        /#panelBoard \{ margin-top: 0; \}/.test(tmpl));
  check("and the template carries no separate sign-out button",
        !tmpl.includes("btnSignOut"));
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
  // One panel left to remember since w120 (Instructions),
  // and the memory is driven in the direction its markup
  // does NOT default to: opened by the user, closed by a
  // reload, restored open.
  fakePanels[0].open = true;           // user opens Instructions
  vm.runInContext("savePanels();", sandbox);
  fakePanels[0].open = false;          // markup default on reload
  vm.runInContext("restorePanels();", sandbox);
  check("an opened Instructions panel stays open after reload",
        fakePanels[0].open === true);
  fakePanels[0].open = false;
  vm.runInContext("savePanels();", sandbox);

  // ---- w25: no double-tap zoom on the overlays ----
  // The built panel, not the source (w54). The old grep
  // matched the assignment wherever it appeared - including
  // inside the comment above it explaining why the viewport
  // meta cannot do this job. (The settings panel was the
  // other overlay here until it died at w117.)
  check("the log overlay gets touch-action",
        vm.runInContext(
          'logPanel && logPanel.style.touchAction === "manipulation"',
          sandbox) === true);

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
  check("off: names the mode behind the start triangle (" +
        offBtn.text + ")",
        /^\u25B6 Voice Mode$/.test(offBtn.text));
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
        /\.panel button\.primary[^}]*var\(--blue\)/.test(tmpl) &&
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
        sized.min === "140px");
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
  // six again since w120: Settings is back (it made six until
  // w117, five from w117 to w119)
  check("the row holding the buttons has all six " +
        "(" + styled.innerKids + " children)", styled.innerKids === 6);
  // w31: order is DOM order, so it survives wrapping
  const rowOrder = vm.runInContext(`
    wrapEl.firstChild.children.map(function (c) { return c.textContent; })
  `, sandbox);
  check("the voice button is first in the DOM (" + rowOrder.join(", ") + ")",
        /Voice Mode/.test(rowOrder[0]));
  // ask the built row, NOT the source: the first draft of
  // this check grepped ui.js for "row-reverse" and failed
  // on its own explanatory comment
  check("no row-reverse trick left - it wraps wrong on a phone",
        styled.innerDir !== "row-reverse");
  // w76: the two riskiest taps sit at the far end - Practice
  // swallows moves, and the account button signs out once
  // signed in. Sign-out takes the very end.
  check("the account button sits furthest from the voice button (" +
        rowOrder[rowOrder.length - 1] + ")",
        /Sign in/.test(rowOrder[rowOrder.length - 1]));
  check("with Practice beside it (" +
        rowOrder[rowOrder.length - 2] + ")",
        /Practice/.test(rowOrder[rowOrder.length - 2]));
  // w120: Settings back in its historical second place,
  // right of the voice button
  check("Settings sits second, beside the voice button (" +
        rowOrder[1] + ")", /Settings/.test(rowOrder[1]));

  // ---- w117/w120: the settings button died and returned ----
  // (owner's order both times). What died stays dead: the
  // floating panel, its anchor, the outside-tap closer and
  // the stored blob - the persistence check above and the
  // scrub test keep those graves closed. What returned is a
  // row IN the page that the button shows and hides, so the
  // button is its own exit (the w69 lesson) and lit while
  // open, like the log button. Driven through the built
  // button, twice - a feature used twice is a different
  // feature (w37).
  const setRowOpen = () => vm.runInContext(
    'settingsRowOpen()', sandbox);
  const setBtnClick = () => vm.runInContext(
    'settingsBtn.on_click(); 0', sandbox);
  check("the settings row starts closed", setRowOpen() === false);
  setBtnClick();
  check("the Settings button opens it", setRowOpen() === true);
  check("and wears the lit green while it is open",
        vm.runInContext(
          'settingsBtn.style.background === BUTTON_ON', sandbox));
  setBtnClick();
  check("a second tap is the exit (w69)", setRowOpen() === false &&
        vm.runInContext(
          'settingsBtn.style.background === BUTTON_OFF', sandbox));

  // the row carries the two choices, showing the loaded
  // values - pieces and off are the shipped defaults
  check("the row holds the two selects at their defaults (" +
        vm.runInContext('document.getElementById("setSpeech").value',
                        sandbox) + ")",
        vm.runInContext('document.getElementById("setRatings").value',
                        sandbox) === "off" &&
        vm.runInContext('document.getElementById("setSpeech").value',
                        sandbox) === "pieces");
  // w126: the ratings label says what it toggles - beside a
  // Rated/Casual control, bare "Ratings" read as being about
  // the game - and the instructions read in the body's own
  // colour, not the furniture dim (owner's report: whole
  // paragraphs at --dim were hard to read)
  check("the ratings label says Show ratings",
        /<label>Show ratings <select id="setRatings">/.test(tmpl));
  check("the instructions text is body-coloured",
        /\.hint \{ color: var\(--text\)/.test(tmpl));

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

  // w64: blitz went too - the Board API refuses blitz for
  // public seeks, so every preset must be rapid or slower
  // (estimated seconds = 60*min + 40*inc, blitz < 480)
  const tcs = tcButtons.map(b => b.getAttribute("data-tc"));
  check("five presets, none bullet or blitz (" + tcs.join(" ") + ")",
        tcs.length === 5 && tcs.every(tc => {
          const [m, i] = tc.split("+").map(Number);
          return m * 60 + 40 * i >= 480;
        }));
  // picking one is remembered and read back as numbers
  const pick = tc => {
    tcButtons.find(b => b.getAttribute("data-tc") === tc).on_click();
  };
  pick("10+5");
  check("picked preset becomes the selected control",
        JSON.stringify(vm.runInContext("selectedTimeControl()", sandbox))
          === JSON.stringify({ minutes: 10, increment: 5 }));
  check("the picked one wears the green",
        tcButtons.find(b => b.getAttribute("data-tc") === "10+5")
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
  vm.runInContext('pickTime("15+10");', sandbox);
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
    pickTime("15+10");
    document.getElementById("timeCustom").value = "";
    document.getElementById("timeCustom").on_focus();
  `, sandbox);
  check("focusing an empty box leaves the preset alone",
        vm.runInContext("pickedTime", sandbox) === "15+10");

  // w35: a LATER visit restores what was chosen. A reload is
  // modelled as the two things a reload really does: fresh
  // page state (pickedTime back to null, box empty) with
  // storage surviving - then wireTimeRow, which is what boot
  // calls. Storage is inspected directly so the test cannot
  // pass on in-memory state alone.
  vm.runInContext('pickTime("30+20");', sandbox);
  check("picking writes it to storage",
        vm.runInContext('localStorage.getItem("audioplay.timecontrol")',
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
    localStorage.setItem("audioplay.timecontrol", "banana");
  `, sandbox);
  check("unreadable storage reads as never chosen",
        reload().picked === null);
  // w64: a preset saved by an earlier build whose button is
  // gone (the blitz row) must ALSO read as never chosen. The
  // value still parses as a time, which is exactly the trap:
  // without the button check it restores an invisible pick -
  // nothing lit, selectedTimeControl() quietly 5+3, and the
  // seek refusing for a reason nothing on screen shows.
  vm.runInContext(`
    localStorage.setItem("audioplay.timecontrol", "5+3");
  `, sandbox);
  const retired = reload();
  check("a retired preset restores as never chosen",
        retired.picked === null && retired.tc === "null");
  vm.runInContext('localStorage.removeItem("audioplay.timecontrol");',
                  sandbox);

  // ---- w99: rated is a dropdown, in Lichess's own words,
  // and it comes back. The RESTORE is the second use (w37),
  // and junk or absence must read Casual - a stored value
  // must never quietly rate a game.
  const ratedBack = () => vm.runInContext(`
    (function () {
      document.getElementById("seekRated").value = "";
      wireRated();
      return document.getElementById("seekRated").value;
    })()
  `, sandbox);
  vm.runInContext(
    'localStorage.removeItem("audioplay.rated");', sandbox);
  check("a fresh browser seeks Casual", ratedBack() === "casual");
  vm.runInContext(`
    document.getElementById("seekRated").value = "rated";
    document.getElementById("seekRated").on_change();
  `, sandbox);
  check("choosing Rated survives a reload", ratedBack() === "rated");
  vm.runInContext(
    'localStorage.setItem("audioplay.rated", "banana");', sandbox);
  check("junk in storage reads as Casual", ratedBack() === "casual");
  vm.runInContext(
    'localStorage.removeItem("audioplay.rated");', sandbox);
  // and the dropdown's word reaches the real seek handler
  vm.runInContext(`
    __seekGot = null; __realSeekW99 = startSeek;
    startSeek = function (m, i, r) { __seekGot = [m, i, r]; };
    document.getElementById("seekRated").value = "rated";
  `, sandbox);
  tcButtons.find(b => b.getAttribute("data-tc") === "15+10").on_click();
  vm.runInContext('document.getElementById("btnSeek").on_click();', sandbox);
  check("Rated reaches the seek as rated=true",
        vm.runInContext("JSON.stringify(__seekGot)", sandbox) ===
        "[15,10,true]");
  vm.runInContext(`
    startSeek = __realSeekW99;
    document.getElementById("seekRated").value = "casual";
    localStorage.removeItem("audioplay.timecontrol");
    pickedTime = null; wireTimeRow();
  `, sandbox);

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

  async function setBoard(fen) {
    heard();
    vm.runInContext(`
      dryRun = true; running = true;
      confirmAction = null;
      api.pos = new RULES.Position(${JSON.stringify(fen)});
      api.moves = []; api.myColor = "w"; api.over = false;
    `, sandbox);
    heard();
  }

  // ========= w118: THE FOUR-ITEM GRAMMAR =========
  // A move is from-file, from-rank, to-file, to-rank - sixteen
  // words of vocabulary, no piece names, no take word, no
  // castle word. A clean legal four-item move plays AT ONCE
  // and the chime (or its "okay." fallback, as here, with no
  // WebAudio) is the whole confirmation. EVERYTHING else that
  // contains a square is "Say again." - verbatim, with no
  // read-back and no explanation (owner's decision), and
  // nothing is ever completed from what is legal, however
  // unique the completion.

  // the whole move, plainly: plays at once, one bit spoken
  await setBoard("k7/8/8/8/8/8/4P3/K5N1 w - - 0 1");
  say("echo two echo four");
  await sleep(120);
  const w118play = heard().join(" | ");
  check("a whole move plays at once (" + w118play + ")",
        /okay/i.test(w118play) && !/echo/i.test(w118play) &&
        vm.runInContext("api.lastSan", sandbox) === "e4");

  // a piece move needs no piece name
  await setBoard("k7/8/8/8/8/8/4P3/K5N1 w - - 0 1");
  say("golf one foxtrot three");
  await sleep(120); heard();
  check("a knight moves by its squares alone",
        vm.runInContext("api.lastSan", sandbox) === "Nf3");

  // a capture is nothing special: the board knows what is
  // standing on the to-square
  await setBoard("k7/8/8/3p4/4P3/8/8/K7 w - - 0 1");
  say("echo four delta five");
  await sleep(120); heard();
  check("a capture is just the four items",
        vm.runInContext("api.lastSan", sandbox) === "exd5");

  // castling is the king's own two-square move
  await setBoard("k7/8/8/8/8/8/8/4K2R w K - 0 1");
  say("echo one golf one");
  await sleep(120); heard();
  check('"echo one golf one" castles kingside',
        vm.runInContext("api.lastSan", sandbox) === "O-O");

  // bare letters and glued squares still work
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("e2 e4");
  await sleep(120); heard();
  check("glued letter squares play",
        vm.runInContext("api.lastSan", sandbox) === "e4");
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("e2e4");
  await sleep(120); heard();
  check("one glued token plays",
        vm.runInContext("api.lastSan", sandbox) === "e4");

  // ---- everything less is "Say again.", verbatim ----
  // THREE items - even when exactly one legal move could
  // complete them. This is the owner's own example (a lone
  // "bravo five" early on, Bb5 the only fit) and his rule:
  // "if we get too fancy with using logic to fix mishears,
  // we're going down the wrong path." The system never
  // guesses.
  await setBoard(
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
  say("bravo five");
  await sleep(120);
  const lone = heard().join(" | ");
  check('a lone square is "Say again." even with one unique fit (' +
        lone + ")",
        lone === "Say again." &&
        vm.runInContext("api.moves.length", sandbox) === 0);
  say("foxtrot one bravo five");
  await sleep(120); heard();
  check("the whole move then plays the bishop",
        vm.runInContext("api.lastSan", sandbox) === "Bb5");

  // a dropped item
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("echo echo four");
  await sleep(120);
  check('a dropped item is "Say again."',
        heard().join(" | ") === "Say again." &&
        vm.runInContext("api.moves.length", sandbox) === 0);
  // a fifth item
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("echo two echo four five");
  await sleep(120);
  check('a fifth item is "Say again."',
        heard().join(" | ") === "Say again.");
  // an unknown word beside the whole move: the hearing is
  // damaged (w115's lesson) and the log still names the word
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("patient echo two echo four");
  await sleep(120);
  check('an unknown word damns the reading ("Say again.")',
        heard().join(" | ") === "Say again." &&
        vm.runInContext("api.moves.length", sandbox) === 0);
  check("and the log names the word it could not place",
        vm.runInContext(`
          LOG.some(function (l) {
            return l.indexOf('"patient" not understood') >= 0;
          })
        `, sandbox));
  // an illegal four-item move: same three words, no lecture
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("echo two golf four");
  await sleep(120);
  check('an illegal move is the same "Say again."',
        heard().join(" | ") === "Say again.");
  // the OLD grammar's sentences are foreign now: piece words
  // are unknown words
  await setBoard("k7/8/8/3p4/4P3/8/8/K7 w - - 0 1");
  say("queen takes delta five");
  await sleep(120);
  check('the old grammar gets "Say again." too',
        heard().join(" | ") === "Say again." &&
        vm.runInContext("api.moves.length", sandbox) === 0);

  // ---- rival readings ----
  // a rival can rescue a mangled primary: same move, one of
  // Safari's guesses clean
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  vm.runInContext(
    'handleTranscripts(["I go to a floor", "echo two echo four"]);',
    sandbox);
  await sleep(120); heard();
  check("a clean rival reading rescues the move",
        vm.runInContext("api.lastSan", sandbox) === "e4");
  // but two readings naming two DIFFERENT legal moves is a
  // mishearing by definition: refuse, never pick
  await setBoard("k7/8/8/8/8/8/3PP3/K7 w - - 0 1");
  vm.runInContext(
    'handleTranscripts(["echo two echo four", "delta two delta four"]);',
    sandbox);
  await sleep(120);
  check('disagreeing rivals are "Say again."',
        heard().join(" | ") === "Say again." &&
        vm.runInContext("api.moves.length", sandbox) === 0);

  // ---- stray talk and mistimed moves ----
  // no square anywhere: silence, logged
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("what a lovely evening");
  await sleep(120);
  check("stray talk with no square stays silent",
        heard().length === 0);
  // a square in the room but not our turn: the true answer
  vm.runInContext('api.myColor = "b";', sandbox);
  say("echo two echo four");
  await sleep(120);
  check("a mistimed move is answered, not swallowed",
        /white to move/i.test(heard().join(" | ")));
  vm.runInContext('api.myColor = "w";', sandbox);

  // ---- promotion ----
  // the bare four items promote to a QUEEN (black king kept
  // clear so no check suffix muddies the SAN)
  await setBoard("8/4P3/k7/8/8/8/8/K7 w - - 0 1");
  say("echo seven echo eight");
  await sleep(120); heard();
  check("a bare promotion is a queen",
        vm.runInContext("api.lastSan", sandbox) === "e8=Q");
  // "equals knight" is the one surviving piece phrase
  await setBoard("8/4P3/k7/8/8/8/8/K7 w - - 0 1");
  say("echo seven echo eight equals knight");
  await sleep(120); heard();
  check('"equals knight" underpromotes',
        vm.runInContext("api.lastSan", sandbox) === "e8=N");
  // a promotion word on a move that does not promote is a
  // mishearing, not a move
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("echo two echo four equals knight");
  await sleep(120);
  check('a stray promotion word is "Say again."',
        heard().join(" | ") === "Say again.");

  // ====== w120/w126: HOW A MOVE IS SPOKEN IS A SETTING ======
  // Two-way since w126, named for WHAT is announced (both
  // styles speak NATO): pieces "bishop charlie 4" (the old
  // voice, the default), squares "foxtrot 1, charlie 4" -
  // the move's own squares, the same four items the user
  // speaks IN. Asked of the built moveToSpeech, and the
  // style flipped through the built select, whose handler
  // owns the variable and the storage. (The third style,
  // chess, lived w120-w125 and died with its unhearable
  // bare letters - the tombstones are at forTheEar and in
  // settings.js. Its EAR_LETTER table must stay gone.)
  const speakStyle = (v) => vm.runInContext(`
    var sel = document.getElementById("setSpeech");
    sel.value = ${JSON.stringify(v)}; sel.on_change();
    MOVE_SPEECH;
  `, sandbox);
  const spoken = (san, uci) => vm.runInContext(
    "moveToSpeech(" + JSON.stringify(san) + ", " +
    JSON.stringify(uci) + ")", sandbox);
  check("pieces is the shipped voice, untouched (" +
        spoken("Bc4", "f1c4") + ")",
        spoken("Bc4", "f1c4") === "bishop charlie 4" &&
        spoken("Nbd2", "b1d2") === "knight bravo delta 2" &&
        spoken("Bxa3", "c1a3") === "bishop takes alpha 3");
  check("the chess style is gone whole - letters, gap " +
        "machinery and all",
        vm.runInContext(
          'typeof EAR_LETTER === "undefined" && ' +
          'typeof fileWord === "undefined" && ' +
          'typeof GAP_ITEM_MS === "undefined" && ' +
          'typeof moveGapMs === "undefined"', sandbox) &&
        vm.runInContext(`
          document.getElementById("setSpeech")._listeners.change &&
          (function () {
            var sel = document.getElementById("setSpeech");
            sel.value = "chess"; sel.on_change();
            return MOVE_SPEECH;
          })()
        `, sandbox) === "pieces");
  // the comma is the w121 breath between from and to - it
  // buys GAP_CLAUSE_MS through splitForSpeech, because the
  // flat pair ran on ("delta 7 delta 5", owner's report)
  check("squares speaks the move's own two, with a breath " +
        "between (" + speakStyle("squares") + ": " +
        spoken("Bc4", "f1c4") + ")",
        spoken("Bc4", "f1c4") === "foxtrot 1, charlie 4");
  check("squares castling is the king's own move, as it is " +
        "spoken in (" + spoken("O-O", "e1g1") + ")",
        spoken("O-O", "e1g1") === "echo 1, golf 1");
  check("squares keeps promotion and check, off the san (" +
        spoken("e8=Q+", "e7e8q") + ")",
        spoken("e8=Q+", "e7e8q") ===
          "echo 7, echo 8, promotes to queen, check");
  check("a takes says nothing extra in squares - they are " +
        "the whole sentence",
        spoken("Bxc4", "f1c4") === "foxtrot 1, charlie 4");
  check("and the choice is remembered under its flat key",
        sandbox.localStorage.getItem("audioplay.movespeech") ===
          "squares");
  // through the page, not the unit: "repeat" re-speaks the
  // last move - still the e8=N underpromotion played above,
  // which also proves lastUci rode along the dry path
  say("repeat");
  await sleep(120);
  const repeated = heard().join(" | ");
  check('"repeat" re-speaks the last move in the picked ' +
        "style (" + repeated + ")",
        /echo 7, echo 8, promotes to knight/.test(repeated));
  // junk in storage reads as the default (the w99 rule) -
  // and the RETIRED values are junk now, which is the whole
  // migration story: a device that had nato or hybrid saved
  // re-picks once (the w111 way, no shim)
  vm.runInContext(`
    localStorage.setItem("audioplay.movespeech", "nato");
    loadStoredSettings();
  `, sandbox);
  check("a retired stored value reads as the default",
        vm.runInContext("MOVE_SPEECH", sandbox) === "pieces");
  vm.runInContext(`
    localStorage.setItem("audioplay.movespeech", "squares");
    loadStoredSettings();
  `, sandbox);
  check("a later visit restores the stored style",
        vm.runInContext("MOVE_SPEECH", sandbox) === "squares");
  vm.runInContext(`
    localStorage.removeItem("audioplay.movespeech");
    loadStoredSettings();
  `, sandbox);
  check("back to pieces with the key gone",
        speakStyle("pieces") === "pieces" &&
        vm.runInContext("MOVE_SPEECH", sandbox) === "pieces");

  // ====== w118: THE CHIME CONFIRMS THE MOVE ======
  // (w108's trial, w116's post-yes answer, and now the whole
  // own-move channel: the user spoke all four items, so the
  // one bit owed is "heard exactly, legal, played". With
  // WebAudio present and running, the chime and NOTHING
  // spoken; suspended or absent, "okay." - rule 5 never
  // trusts a chime that could not even be scheduled.)
  vm.runInContext(`
    __chimeStarts = 0;
    AudioContext = function () {
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
      this.resume = function () {};
      this.createOscillator = function () {
        return { type: "", frequency: { value: 0 },
                 connect: function () {},
                 start: function () { __chimeStarts++; },
                 stop: function () {} };
      };
      this.createGain = function () {
        return { gain: { setValueAtTime: function () {},
                         linearRampToValueAtTime: function () {} },
                 connect: function () {} };
      };
    };
    primeChimes();
  `, sandbox);
  check("the gesture prime creates a running chime context",
        vm.runInContext('!!chimeCtx && chimeCtx.state === "running"',
                        sandbox));
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("echo two echo four");
  await sleep(120);
  const chimed = heard().join(" | ");
  check("a played move chimes and speaks NOTHING (" +
        (chimed || "silence") + ")",
        chimed === "" &&
        vm.runInContext("__chimeStarts", sandbox) === 2 &&
        vm.runInContext("api.lastSan", sandbox) === "e4");
  // a suspended context is detected and the fallback speaks
  vm.runInContext('chimeCtx.state = "suspended";', sandbox);
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("echo two echo four");
  await sleep(120);
  const suspendedSaid = heard().join(" | ");
  check("a suspended chime context falls back to spoken okay (" +
        suspendedSaid + ")",
        /okay/i.test(suspendedSaid) &&
        vm.runInContext("__chimeStarts", sandbox) === 2);
  vm.runInContext('chimeCtx.state = "running";', sandbox);
  // "Say again." is SPOKEN, never chimed: a refusal must
  // carry its word
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("echo two golf four");
  await sleep(120);
  check('"Say again." is spoken even with the chime available',
        /say again/i.test(heard().join(" | ")) &&
        vm.runInContext("__chimeStarts", sandbox) === 2);
  // leave the sandbox as WebAudio-less as it started
  vm.runInContext("AudioContext = undefined; chimeCtx = null;", sandbox);

  // ---- a TAPPED move stays instant and unconfirmed ----
  await setBoard("k7/8/8/8/8/8/8/K5N1 w - - 0 1");
  vm.runInContext(`
    (function () {
      var legal = api.pos.legalMoves();
      var m = legal.filter(function (x) {
        return RULES.sqName(x.to) === "f3"; })[0];
      acceptMove({ m: m, san: api.pos.sanOf(m, legal) }, true);
    })()
  `, sandbox);
  await sleep(120);
  check("a tapped move still plays without any of this",
        vm.runInContext("api.lastSan", sandbox) === "Nf3" &&
        heard().length === 0);

  // ---- the queries are gone (owner: never used them) ----
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("whose turn is it");
  await sleep(120);
  check("the turn query is dead: no square, silence",
        heard().length === 0);
  say("what is on foxtrot three");
  await sleep(120);
  check('a dead query with a square in it gets "Say again."',
        heard().join(" | ") === "Say again.");

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

  // ---- w67: the fair-play word appears nowhere that ships ----
  // Constraint 1 has banned it since the userscript, and it
  // drifted anyway: restated in header.js USING the word, which
  // made it unenforceable, and it then turned up in the speech
  // layer meaning the iOS synthesizer - including in a LOG LINE,
  // in the log this project asks users to paste. The reader of a
  // pasted log cannot tell which sense was meant.
  //
  // GREPPING IS RIGHT HERE, and it is the one place it is. The
  // usual rule - ask the built DOM, never grep the source (w27)
  // - is about testing BEHAVIOUR, where a string's presence
  // proves nothing about whether the feature works. This claim
  // IS about the text: the property is "this word does not
  // appear", and reading the text is the only way to check it.
  //
  // THE WHOLE REPO, not just what ships. Comments reach the
  // page anyway (build.js concatenates and strips nothing), but
  // HISTORY.md and reference/ are just as readable to anyone who
  // opens the repository, and the rule was asked for as a rule
  // about the project, not about the bundle.
  //
  // The needle is spelled in two halves so this file can be
  // scanned along with everything else. Cute, but the
  // alternative is exempting the harness, and an exemption is
  // how the rule drifted the first time.
  const NEEDLE = new RegExp("eng" + "ine", "i");
  // The ONE exception, and it is forced: the frozen v137
  // artifact is sha-locked a few hundred lines above this. The
  // lock is the point of freezing it, editing it breaks that
  // check, and re-stamping the sha to allow an edit would throw
  // away the guarantee to fix a comment. It carries the word in
  // four comments and never LOGS it, so nothing it can produce
  // reaches a pasted log.
  const SHA_LOCKED = "frozen-userscript/lichess_audioplay.js";
  const TEXTY = /\.(js|html|md|txt|yml|yaml|json)$/;
  const banned = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(ent => {
      const p = (dir === "." ? "" : dir + "/") + ent.name;
      if (ent.name === ".git" || ent.name === "node_modules") return;
      if (ent.isDirectory()) return walk(p);
      if (!TEXTY.test(ent.name)) return;
      if (p === SHA_LOCKED) return;
      if (p === "index.html") return;      // gitignored build output
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        // substring, not word-boundary: a reader scanning for
        // this does not stop to check whether it is part of a
        // longer word, and a rule needing a careful reader is
        // the rule that drifted
        if (NEEDLE.test(line)) banned.push(p + ":" + (i + 1));
      });
    });
  })(".");
  check("the fair-play word appears nowhere in the repo (" +
        (banned.join(", ") || "clean, one sha-locked exception") + ")",
        banned.length === 0);

  // ================= w63: RESILIENCE =================

  // 102: a wedged synthesizer is reset, not walked past.
  // The guard firing with tStart still 0 means the utterance
  // NEVER STARTED - the one uncovered permanent-silence path.
  vm.runInContext(`
    __ttsCancels = 0; __ttsResumes = 0;
    __realSynth = speechSynthesis;
    speechSynthesis = {
      getVoices: function () { return []; },
      speak: function (u) { /* wedged: no onstart, no onend */ },
      cancel: function () { __ttsCancels++; },
      resume: function () { __ttsResumes++; },
      speaking: false, paused: false, pending: false
    };
    // the harness stubs speak() itself, so drive the REAL
    // queue underneath it
    speakQueue.push({ text: "hi", gap: 0 });
    pumpSpeech();
  `, sandbox);
  await sleep(4300);            // the real 1.4s guard, unscaled
  check("a never-started utterance resets speech synthesis (" +
        vm.runInContext("__ttsCancels", sandbox) + " cancel, " +
        vm.runInContext("__ttsResumes", sandbox) + " resume)",
        vm.runInContext("__ttsCancels", sandbox) === 1 &&
        vm.runInContext("__ttsResumes", sandbox) === 1);
  check("and the queue is free to carry on",
        vm.runInContext("speaking", sandbox) === false);
  vm.runInContext("speechSynthesis = __realSynth;", sandbox);
  heard();

  // w90: the stall watch turns "it felt laggy" into a log
  // line with a duration on it. A deliberate synchronous
  // block of the loop must be noticed and measured...
  vm.runInContext(
    'document.visibilityState = "visible"; LOG.length = 0;', sandbox);
  await sleep(900);           // a clean beat lands first
  vm.runInContext(
    "var __t0 = Date.now(); while (Date.now() - __t0 < 1200) {}",
    sandbox);
  await sleep(900);           // the beat after the stall measures it
  check("a main-thread stall is noticed and measured",
        vm.runInContext(
          "LOG.some(function (l) { return /LAG.*stalled/.test(l); })",
          sandbox));
  // ...and a HIDDEN page's timer nap must not be: iOS
  // throttles background timers on purpose, and screen-off
  // (when it existed) would have filled the log with stalls
  // that were really naps.
  vm.runInContext(
    'document.visibilityState = "hidden"; LOG.length = 0;', sandbox);
  vm.runInContext(
    "var __t1 = Date.now(); while (Date.now() - __t1 < 1200) {}",
    sandbox);
  await sleep(900);
  check("a hidden page's timer nap is not logged as a stall",
        vm.runInContext(
          "!LOG.some(function (l) { return /LAG/.test(l); })",
          sandbox));
  vm.runInContext('document.visibilityState = "visible";', sandbox);

  // 125: a wake lock that resolves after exit is released, not
  // kept forever
  const lockOut = await vm.runInContext(`
    (function () {
      var released = 0, grant = null;
      var realNav = navigator.wakeLock;
      navigator.wakeLock = { request: function () {
        return new Promise(function (res) {
          grant = function () {
            res({ release: function () { released++;
                                         return Promise.resolve(); } });
          };
        });
      } };
      clockLock = null;
      enterClockMode();
      exitClockMode(true);           // tapped out before the grant
      grant();                       // the lock arrives late
      return new Promise(function (res) {
        setTimeout(function () {
          navigator.wakeLock = realNav;
          res({ released: released, held: clockLock !== null });
        }, 60);
      });
    })()
  `, sandbox);
  check("a wake lock granted after exit is released at once",
        lockOut.released === 1);
  check("and nothing is left holding the screen", lockOut.held === false);

  // 95: a 429 asks for patience instead of inviting a retry
  heard();
  vm.runInContext(`
    dryRun = false; api.gameId = "G"; api.over = false; busy = false;
    api.pos = new RULES.Position(); api.myColor = "w"; api.moves = [];
    __realFetch6 = fetch;
    fetch = function () {
      return Promise.resolve({ ok: false, status: 429,
        json: function () { return Promise.resolve({}); },
        text: function () { return Promise.resolve(""); } });
    };
    acceptMove({ m: api.pos.legalMoves()[0], san: "e4" });
  `, sandbox);
  await sleep(80);
  const rl = heard().join(" | ");
  check("a rate-limited move asks for patience (" + rl + ")",
        /slow down/i.test(rl) && !/rejected/i.test(rl));
  vm.runInContext(
    "fetch = __realFetch6; busy = false; dryRun = true; api.gameId = null;",
    sandbox);
  heard();

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

  // w71: THE CHALLENGE BUTTON IS ITS OWN CANCEL. A human can
  // take minutes to accept, and while the challenge waited the
  // page offered no way to take it back - this button answered
  // "Still waiting on the last challenge." Driven as a finger
  // would: the label while waiting, the click, the aftermath.
  vm.runInContext(`
    __chAborted = 0;
    challengeAbort = { abort: function () { __chAborted++; } };
    renderAccount();
  `, sandbox);
  check("while a challenge waits, the button says so",
        vm.runInContext('challengeBtn.textContent', sandbox) ===
          "Cancel challenge");
  vm.runInContext("challengeBtn.on_click();", sandbox);
  check("and clicking it cancels the challenge",
        vm.runInContext("__chAborted", sandbox) === 1 &&
        vm.runInContext("challengeAbort", sandbox) === null &&
        /cancelled/i.test(vm.runInContext(
          'document.getElementById("lichessLine").textContent', sandbox)));
  check("after which it is a Challenge button again",
        vm.runInContext('challengeBtn.textContent', sandbox) === "Challenge");
  vm.runInContext("fetch = __realFetch4;", sandbox);

  // ---- w106: the result is SHOWN as well as spoken ----
  // The status line said "Game over." - true of every ending
  // and descriptive of none - while the sentence naming what
  // happened was spoken once and dropped. With voice off (the
  // owner's whole touch-mode game) nothing said it at all.
  // Driven through the real stream handler, and asked of the
  // built DOM: the same sentence, sentence-cased.
  const statusNow = () => vm.runInContext(
    'document.getElementById("lichessLine").textContent', sandbox);
  const endWith = (state) => {
    vm.runInContext(`
      dryRun = false; running = true; api.gameId = "OVR";
      api.over = false; api.overText = ""; api.myColor = "w";
      api.pos = new RULES.Position(); api.moves = []; api.movesBefore = 0;
      handleGameState(${JSON.stringify(state)}, false);
      renderStatus();
    `, sandbox);
    return { said: heard().join(" | "), shown: statusNow() };
  };
  const mated = endWith({ moves: "", status: "mate", winner: "white",
                          wtime: 60000, btime: 60000 });
  check("checkmate reaches the screen, not only the ear (" +
        mated.shown + ")",
        mated.shown === "Checkmate. White wins." &&
        /checkmate\. white wins\./.test(mated.said));
  const flagged = endWith({ moves: "", status: "outoftime", winner: "black",
                            wtime: 0, btime: 60000 });
  check("and a flag says whose, in its own words (" + flagged.shown + ")",
        flagged.shown === "White ran out of time. Black wins.");
  const drawn = endWith({ moves: "", status: "stalemate",
                          wtime: 60000, btime: 60000 });
  check("and a draw does not claim a winner (" + drawn.shown + ")",
        drawn.shown === "Stalemate. Drawn." &&
        !/wins/i.test(drawn.shown));
  // the result must not outlive its game: the next one starts
  // with the line clear, or the board would say "Checkmate"
  // over a game in progress
  vm.runInContext(`
    api.gameId = "NEW"; api.over = false; api.overText = "";
    api.pos = new RULES.Position(); api.moves = [];
    renderStatus();
  `, sandbox);
  check("and it does not outlive its game",
        !/checkmate|wins/i.test(statusNow()));
  vm.runInContext('api.gameId = null; api.over = false; api.overText = "";',
                  sandbox);
  heard();

  // 93: a refused seek says why, and blitz gets the way out
  const seekLine = () => vm.runInContext(
    'document.getElementById("lichessLine").textContent', sandbox);
  // w71: TOO-FAST IS REFUSED BEFORE THE POST, because the
  // trap was never the error message - it was the bullet
  // CHALLENGE, which Lichess accepts (the restriction is on
  // our API, not the opponent's), creating a real game this
  // page then walks away from. The owner hit it with 2+1
  // against maia. The gate means no request leaves the page,
  // which is what the fetch counter proves.
  vm.runInContext(`
    __realFetch5 = fetch; __gateFetches = 0;
    fetch = function (url, opts) {
      __gateFetches++;
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
  check("a blitz seek is refused with the way out (" + blitzMsg + ")",
        /blitz/.test(blitzMsg) && /challenge someone instead/i.test(blitzMsg));
  vm.runInContext("seekAbort = null; startSeek(2, 1, false);", sandbox);
  await sleep(60);
  check("a bullet seek is named bullet, not blitz (" + seekLine() + ")",
        /bullet/.test(seekLine()));
  vm.runInContext(
    'sendChallenge("maia1", 2, 1, false, "random");', sandbox);
  await sleep(60);
  check("a bullet CHALLENGE is refused too - no game to abandon (" +
        seekLine() + ")",
        /bullet/.test(seekLine()) && /too fast/i.test(seekLine()));
  check("and none of the three ever reached the network",
        vm.runInContext("__gateFetches", sandbox) === 0);
  // a rapid control passes the gate; a server-side refusal
  // still carries Lichess's reason, without the blitz hint
  vm.runInContext("seekAbort = null; startSeek(15, 10, false);", sandbox);
  await sleep(60);
  // w74: the "and no blitz hint" half of this check went with
  // the hint itself. Deleting a branch makes any assertion that
  // it is ABSENT trivially true, which is a test that passes
  // for the wrong reason - so what is left is the claim that
  // still means something: a refusal Lichess DID send carries
  // Lichess's own words.
  check("a rapid refusal carries the server's own reason (" +
        seekLine() + ")",
        /Invalid time control/.test(seekLine()));
  check("which did reach the network",
        vm.runInContext("__gateFetches", sandbox) === 1);
  vm.runInContext("fetch = __realFetch5; seekAbort = null;", sandbox);

  // ---- w74: an incoming too-fast challenge is DECLINED ----
  // The hole w71 left. This page never accepts a challenge
  // itself, so by the time gameStart lands with
  // compat.board:false there is a live game it can only walk
  // away from. Declining is the last point it can be stopped.
  vm.runInContext(`
    __realFetch6 = fetch; __declines = [];
    fetch = function (url, opts) {
      __declines.push({ url: String(url),
                        body: String((opts && opts.body) || "") });
      return Promise.resolve({ ok: true, status: 200,
        text: function () { return Promise.resolve("{}"); },
        json: function () { return Promise.resolve({}); } });
    };
    dryRun = false; api.myId = "me"; api.gameId = null;
    handleAccountEvent({ type: "challenge", challenge: {
      id: "BULLET1", challenger: { id: "someone", name: "someone" },
      timeControl: { type: "clock", limit: 120, increment: 1,
                     show: "2+1" } } });
  `, sandbox);
  await sleep(60);
  const declined = vm.runInContext("__declines", sandbox);
  check("a 2+1 challenge is declined, not just announced (" +
        (declined.length ? declined[0].url : "no request") + ")",
        declined.length === 1 &&
        /\/api\/challenge\/BULLET1\/decline/.test(declined[0].url));
  check("with Lichess's own tooFast reason, so they are told why",
        /reason=tooFast/.test(declined[0].body));
  check("and it is SAID, not only shown (" + heard().join(" | ") + ")",
        /too fast/i.test(vm.runInContext(
          'document.getElementById("lichessLine").textContent', sandbox)));

  // a BLITZ challenge is legal for the Board API and must
  // survive - this is the line the decline must not cross
  vm.runInContext(`
    __declines = [];
    handleAccountEvent({ type: "challenge", challenge: {
      id: "BLITZ1", challenger: { id: "someone", name: "someone" },
      timeControl: { type: "clock", limit: 300, increment: 0,
                     show: "5+0" } } });
  `, sandbox);
  await sleep(60);
  check("a 5+0 challenge is left alone - blitz is playable here",
        vm.runInContext("__declines.length", sandbox) === 0 &&
        /accept it on lichess/i.test(vm.runInContext(
          'document.getElementById("lichessLine").textContent', sandbox)));
  // and a clockless challenge has no speed to be wrong about
  vm.runInContext(`
    __declines = [];
    handleAccountEvent({ type: "challenge", challenge: {
      id: "CORR1", challenger: { id: "someone", name: "someone" },
      timeControl: { type: "correspondence", daysPerTurn: 2 } } });
  `, sandbox);
  await sleep(60);
  check("a correspondence challenge is left alone too",
        vm.runInContext("__declines.length", sandbox) === 0);
  vm.runInContext("fetch = __realFetch6;", sandbox);
  heard();

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
  // ---- w68: the opponent has a name, and it is on screen ----
  // gameFull has carried both players since w1 and the page
  // read one field of it. Asked of the built DOM, not of the
  // api object: the whole complaint was that nothing was
  // VISIBLE, and a test that checked api.players would have
  // passed while the panel stayed empty (w27/w28).
  const playersHtml = () => vm.runInContext(
    'document.getElementById("nameTop").innerHTML +\n' +
    ' document.getElementById("nameBottom").innerHTML', sandbox);
  vm.runInContext(`
    api.gameId = "P1"; api.over = false; api.myId = "me"; dryRun = false;
    SHOW_RATINGS = true;   /* a code constant since w117; set for the test */
    handleGameFull({
      white: { id: "me", name: "pawn76", rating: 1500 },
      black: { id: "maia1", name: "maia1", title: "BOT", rating: 1900 },
      state: { moves: "" } });
    uiGameChanged();
  `, sandbox);
  await sleep(40);
  const shown = playersHtml();
  check("both players are named under the board (" + shown + ")",
        /pawn76/.test(shown) && /maia1/.test(shown));
  check("with their ratings", /1500/.test(shown) && /1900/.test(shown));
  check("and the title, since a BOT is worth knowing about",
        /BOT/.test(shown));
  // w105: the renderer says WHICH kind of title it is; the
  // stylesheet (checked above) owns what each looks like.
  // Asked of the built markup - maia1 arrives titled BOT.
  check("a BOT title is marked as one", /class="title bot">BOT</.test(shown));
  // and a HUMAN rank is not - the other half of the same
  // feature, driven with a real IM rather than asserted about
  // markup that never contained one
  const humanTitle = vm.runInContext(`
    (function () {
      var was = api.players.b;
      api.players.b = { name: "someIM", title: "IM", rating: 2400 };
      renderPlayers();
      var html = document.getElementById("nameTop").innerHTML;
      api.players.b = was; renderPlayers();
      return html;
    })()
  `, sandbox);
  check("a human rank is not (" + humanTitle.replace(/<[^>]+>/g, "") + ")",
        /class="title">IM</.test(humanTitle) &&
        !/bot/.test(humanTitle));
  // w103: NO name is tinted to mark it as yours. What answers
  // "which of these two is me" is the rail's ORDER - it
  // follows the board, so your name sits at the bottom beside
  // your own clock, and moves when your colour does. Both
  // orientations, because a rail frozen white-at-the-bottom
  // would pass the first and fail the second.
  const names = () => vm.runInContext(
    '(function () { renderPlayers(); return {' +
    ' top: document.getElementById("nameTop").innerHTML,' +
    ' bottom: document.getElementById("nameBottom").innerHTML }; })()',
    sandbox);
  check("neither name is tinted to mark it as yours",
        !/class="mine"/.test(shown));
  const namesAsWhite = names();
  check("the rail's ORDER says it instead: yours at the bottom (" +
        namesAsWhite.bottom.replace(/<[^>]+>/g, "") + ")",
        /pawn76/.test(namesAsWhite.bottom) &&
        /maia1/.test(namesAsWhite.top));
  vm.runInContext('api.myColor = "b";', sandbox);
  const asBlackNames = names();
  check("and it follows the board when your colour flips",
        /maia1/.test(asBlackNames.bottom) && /pawn76/.test(asBlackNames.top));
  vm.runInContext('api.myColor = "w";', sandbox);
  // w81: the name row never dims. w72's idle class was mirrored
  // onto the names beside the clocks, and on the device the
  // waiting side's name and rating sank below readable (.55 on
  // the row, .65 on the rating inside it). Here white is to
  // move and black is waiting - the state that used to dim.
  check("and neither name dims while its side waits (" + shown + ")",
        !/idle/.test(shown));
  // the log line says it too - a pasted log should name the
  // opponent, which until now it never did
  check("the log names the opponent",
        vm.runInContext(
          'LOG.filter(function (l) { return /on the other side/.test(l); })' +
          '.length', sandbox) >= 1);

  // OFF LEAVES THE ROW OUT, not blank-but-present, and the
  // flip repaints on the spot - the setting's whole effect is
  // something already on screen. (Ratings off too here, so the
  // row is genuinely empty; their independence has its own
  // tests below.)
  // w75: names are unconditional now, so the row can never be
  // empty while a game is on - only the rating comes and goes.
  vm.runInContext("SHOW_RATINGS = false; renderPlayers();", sandbox);
  check("ratings off still leaves the names (" + playersHtml() + ")",
        /pawn76/.test(playersHtml()) && !/1500/.test(playersHtml()));
  vm.runInContext("SHOW_RATINGS = true; renderPlayers();", sandbox);
  check("and back on restores the numbers", /1500/.test(playersHtml()));

  // A Lichess AI opponent has aiLevel and NO name at all - the
  // shape that would otherwise render "undefined".
  vm.runInContext(`
    api.gameId = "P2"; api.over = false;
    handleGameFull({ white: { id: "me", name: "pawn76", rating: 1500 },
                     black: { aiLevel: 3 }, state: { moves: "" } });
    uiGameChanged();
  `, sandbox);
  await sleep(40);
  const aiShown = playersHtml();
  check("a nameless AI opponent is described, not left undefined (" +
        aiShown + ")",
        /computer level 3/.test(aiShown) && !/undefined/.test(aiShown));

  // w60's lesson, one field over: practice must not inherit
  // the opponent you just finished playing.
  vm.runInContext("dryStart(); uiGameChanged();", sandbox);
  await sleep(40);
  check("practice mode shows no opponent (" +
        (playersHtml() || "empty") + ")", playersHtml() === "");
  vm.runInContext("dryRun = false;", sandbox);

  // ---- w69/w75/w117/w120: the rating's long walk ----
  // w69 split ratings off but nested, w71 freed them, w72
  // chained them to showPlayers, w75 deleted the chain, w117
  // deleted the panel around the one switch left, and w120
  // made it a stored choice again on the Settings row -
  // owner's default still OFF. The render is driven both
  // ways, and the shipped default is left in force at the
  // end.
  vm.runInContext(`
    api.gameId = "P3"; api.over = false;
    SHOW_RATINGS = false;
    handleGameFull({
      white: { id: "me", name: "pawn76", rating: 1500 },
      black: { id: "maia1", name: "maia1", title: "BOT", rating: 1900 },
      state: { moves: "" } });
    uiGameChanged();
  `, sandbox);
  await sleep(40);
  const noRatings = playersHtml();
  check("off (the shipped default) keeps names, drops numbers (" +
        noRatings + ")",
        /pawn76/.test(noRatings) && /maia1/.test(noRatings) &&
        !/1500/.test(noRatings) && !/1900/.test(noRatings));
  check("but not the title - a BOT is not a rating",
        /BOT/.test(noRatings));
  // THE FLIP IS THE SELECT'S NOW (w120), driven through the
  // built control: the change handler owns the variable, the
  // storage write, and the repaint - so the numbers appear
  // with no render call from here.
  vm.runInContext(`
    var sel = document.getElementById("setRatings");
    sel.value = "on"; sel.on_change();
  `, sandbox);
  check("flipping the Ratings select brings the numbers back",
        /1500/.test(playersHtml()) && /1900/.test(playersHtml()));
  check("and remembers the choice under its flat key",
        sandbox.localStorage.getItem("audioplay.ratings") === "on");
  vm.runInContext(`
    var sel = document.getElementById("setRatings");
    sel.value = "off"; sel.on_change();
  `, sandbox);
  check("and off again, off the same select",
        !/1500/.test(playersHtml()) &&
        sandbox.localStorage.getItem("audioplay.ratings") === "off");
  // a return visit reads the stored choice; junk reads as
  // the default (the rated dropdown's rule, w99)
  vm.runInContext(`
    localStorage.setItem("audioplay.ratings", "on");
    loadStoredSettings();
  `, sandbox);
  check("a later visit restores ratings from storage",
        vm.runInContext("SHOW_RATINGS", sandbox) === true);
  vm.runInContext(`
    localStorage.setItem("audioplay.ratings", "junk");
    loadStoredSettings();
  `, sandbox);
  check("junk in storage reads as ratings off",
        vm.runInContext("SHOW_RATINGS", sandbox) === false);
  vm.runInContext(`
    localStorage.removeItem("audioplay.ratings");
    loadStoredSettings(); renderPlayers();
  `, sandbox);

  // ---- w69: the game id is for the log, not the panel ----
  heard();
  vm.runInContext(`
    api.gameId = null; dryRun = false;
    handleAccountEvent({ type: "gameStart",
      game: { gameId: "TAhPmwYI", compat: { board: false } } });
  `, sandbox);
  await sleep(40);
  const tooFast = vm.runInContext(
    'document.getElementById("lichessLine").textContent', sandbox);
  check("a too-fast game says what to do (" + tooFast + ")",
        /too fast/i.test(tooFast) && /lichess/i.test(tooFast));
  check("and does not put the game id on the panel",
        !/TAhPmwYI/.test(tooFast));
  check("but the LOG still carries it, for a pasted log",
        vm.runInContext(
          'LOG.filter(function (l) { return /TAhPmwYI/.test(l); }).length',
          sandbox) >= 1);

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

  // 127: the opponent's spoken clock is extrapolated too.
  // (Three plies in since w83, because one ply is a state
  // where the clocks are not yet running at all - the old
  // one-ply fixture only ever passed because the page shared
  // the bug it was checking against.)
  heard();
  vm.runInContext(`
    dryRun = false; api.myColor = "w"; api.over = false;
    api.pos = new RULES.Position();
    api.pos.applyUci("e2e4"); api.pos.applyUci("e7e5");
    api.pos.applyUci("g1f3");            // black to move
    api.moves = ["e2e4", "e7e5", "g1f3"];
    api.movesBefore = 0;
    api.wtime = 600000; api.btime = 60000;
    api.clockAt = Date.now() - 15000;    // black thinking 15s
  `, sandbox);
  // w100 retired the spoken clock query - the overlay's large
  // digits are the across-the-room answer - so bare "clock"
  // must now land as STRAY TALK: no answer, and no move played
  // out of it either. "flip clock" keeps working and has its
  // own test above.
  say("clock");
  await sleep(80);
  const clkSaid = heard().join(" | ");
  check("bare clock is stray talk now, not a command (" +
        (clkSaid || "silence") + ")", clkSaid === "");
  check("and it moved nothing",
        vm.runInContext("api.moves.length", sandbox) === 3);
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

  // (the "stale ply-guarded ask no longer holds the strip"
  // test stood here from v126: questionOpen and the strip it
  // held both left at w110 with the clock-mode text)

  // ==== w118: THE SURVIVING HOMOPHONES AND FUSIONS ====
  // The piece-word tables died with the piece grammar, but the
  // FILE and RANK spellings are as load-bearing as ever, and
  // the square fusions with them. Each of these was paid for
  // with a real game's log.
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("echo two aquaphor");        // w84: "echo four" as one word
  await sleep(120); heard();
  check('"aquaphor" is still the square e4',
        vm.runInContext("api.lastSan", sandbox) === "e4");
  await setBoard("k7/8/8/8/8/8/2P5/K7 w - - 0 1");
  say("chili two chili four");     // w114: "charlie" as "chili"
  await sleep(120); heard();
  check('"chili" is still the c-file',
        vm.runInContext("api.lastSan", sandbox) === "c4");
  await setBoard("k7/8/8/8/8/8/4P3/K7 w - - 0 1");
  say("echo to echo four");        // v116: Safari writes "two" as "to"
  await sleep(120); heard();
  check('"to" after a file is still the rank 2',
        vm.runInContext("api.lastSan", sandbox) === "e4");
  // w84: "delta" as "down to", directly before a rank
  await setBoard("k7/8/8/8/8/8/3P4/K7 w - - 0 1");
  say("down to two down to four");
  await sleep(120); heard();
  check('"down to" is still the d-file',
        vm.runInContext("api.lastSan", sandbox) === "d4");

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
  // honest value is null - the overlay shows a blank, never a
  // wrong number (the spoken query that once said "unknown"
  // retired at w100)
  check("and the clock it cannot know stays unset, not wrong",
        vm.runInContext("api.wtime", sandbox) === null);

  // THE GAME LEAVING THE LIST IS THE GAME ENDING, and it must
  // be said and it must stop the polling.
  heard();
  vm.runInContext(`
    api.over = false; pollSeen = true; pollMisses = 0; api.gameId = "PG";
    pollTimer = setInterval(function () {}, 100000);
  `, sandbox);
  pollWith([]);                       // the game is gone
  vm.runInContext("pollOnce();", sandbox);
  await sleep(80);
  // ONE missing tick is a hiccup, not a result (w62): the old
  // one-shot inference was irreversible, so a single anomalous
  // empty response permanently ended a live game.
  const ended1 = heard().join(" | ");
  check("one missing tick does not end the game (" +
        (ended1 || "silence") + ")",
        vm.runInContext("api.over", sandbox) === false);
  vm.runInContext("pollOnce();", sandbox);
  await sleep(80);
  const ended = heard().join(" | ");
  check("two missing ticks are announced (" + ended + ")",
        /game over/i.test(ended));
  check("and the game is marked over",
        vm.runInContext("api.over", sandbox) === true);
  // POLLING CONTINUES (w62): it used to stop here, which in a
  // poll-only browser made the first game the last - nothing
  // was left to notice the next one. The interval now lives on
  // as the discovery watcher.
  check("and the polling keeps watching for the next game",
        vm.runInContext("pollTimer !== null", sandbox) === true);
  vm.runInContext("stopPolling();", sandbox);

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
              // a FULL fen, as the real endpoint sends (w62): the old
              // board-only stub baked the wrong model of the endpoint
              // into this path's only test
              fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
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

  // ============== w62 ADDITIONS TO THE POLL ==============

  // 112: FIRST SIGHTING LOADS THE REAL POSITION. Mid-game join
  // used to build the start position and replay one move - a
  // coincidentally-legal lastMove then left a silent one-ply
  // board against a thirty-move game.
  heard();
  vm.runInContext(`
    dryRun = false; running = true;
    api.gameId = "MID1"; api.myColor = null; api.over = false;
    api.pos = null; api.moves = []; pollSeen = false; pollMisses = 0;
    pollFails = 0;
  `, sandbox);
  pollWith([{ gameId: "MID1", color: "black",
              fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
              lastMove: "f1c4", isMyTurn: true, secondsLeft: 500 }]);
  vm.runInContext("pollOnce();", sandbox);
  await sleep(80);
  const midSaid = heard().join(" | ");
  check("a mid-game join loads the real position, not the start (" +
        midSaid + ")",
        vm.runInContext('api.pos && api.pos.board[RULES.nameSq("c4")]',
                        sandbox) === "B");
  check("and says whose move it is, like the stream join does",
        /black to move/i.test(midSaid));

  // 111: DISCOVERY. With no live game, the most urgent entry in
  // nowPlaying becomes a join - this is how a poll-only browser
  // ever starts a game at all.
  pollWith([{ gameId: "NEW77", color: "white", fen: "", lastMove: "",
              isMyTurn: true, secondsLeft: 600 }]);
  const discoveredId = await vm.runInContext(`
    (function () {
      var realJoin = joinGame, joined = null;
      joinGame = function (id) { joined = id; };
      api.gameId = null; api.over = false; dryRun = false;
      pollFails = 0;
      pollOnce();
      return new Promise(function (res) {
        setTimeout(function () { joinGame = realJoin; res(joined); }, 60);
      });
    })()
  `, sandbox);
  check("with no live game, polling discovers and joins one (" +
        discoveredId + ")", discoveredId === "NEW77");

  // 113: the mic gate is gone - voice off must not freeze the poll
  heard();
  vm.runInContext(`
    running = false;              // voice OFF
    api.gameId = "PG2"; api.myColor = "w"; api.over = false;
    api.pos = new RULES.Position(); api.moves = [];
    pollSeen = true; pollMisses = 0; pollFails = 0;
  `, sandbox);
  pollWith([{ gameId: "PG2", color: "white",
              fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
              lastMove: "e2e4", isMyTurn: false, secondsLeft: 600 }]);
  vm.runInContext("pollOnce();", sandbox);
  await sleep(80);
  check("voice off no longer freezes the poll (the move landed)",
        vm.runInContext("api.moves.join(' ')", sandbox) === "e2e4");
  vm.runInContext("running = true;", sandbox);

  // 117: an in-flight response must not act on a changed
  // world. The sharp case is a STALE response that still
  // carries a game row landing after practice was tapped:
  // without the guard, the discovery branch would join that
  // game mid-practice - the exact silent-real-game state w50
  // closed the front door on, reopened through the back.
  heard();
  const raceOut = await vm.runInContext(`
    (function () {
      var realJoin = joinGame, joined = null;
      joinGame = function (id) { joined = id; };
      var release = null;
      fetch = function () {
        return new Promise(function (res) {
          release = function () {
            res({ ok: true, status: 200,
                  json: function () {
                    return Promise.resolve({ nowPlaying: [
                      { gameId: "STALE9", color: "white", fen: "",
                        lastMove: "", secondsLeft: 60 } ] });
                  } });
          };
        });
      };
      api.gameId = null; api.over = false; api.myColor = null;
      pollSeen = false; pollMisses = 0; pollFails = 0; dryRun = false;
      pollOnce();                    // request now in flight
      dryRun = true; api.gameId = "PRACTICE";   // practice tapped
      release();                     // the old response lands
      return new Promise(function (res) {
        setTimeout(function () {
          joinGame = realJoin;
          res({ joined: joined, over: api.over });
        }, 60);
      });
    })()
  `, sandbox);
  check("a stale response cannot join a game into practice (" +
        (raceOut.joined || "nothing joined") + ")",
        raceOut.joined === null && raceOut.over === false);
  vm.runInContext("dryRun = false; api.gameId = null;", sandbox);

  // 116: the request asks for the endpoint's maximum
  vm.runInContext(`
    __pollUrl = null;
    fetch = function (url) {
      __pollUrl = String(url);
      return Promise.resolve({ ok: true, status: 200,
        json: function () { return Promise.resolve({ nowPlaying: [] }); } });
    };
    api.gameId = null; api.over = false; pollFails = 0;
    pollOnce();
  `, sandbox);
  await sleep(40);
  check("the poll asks for all 50 games, not the default page",
        /nb=50/.test(vm.runInContext("__pollUrl", sandbox) || ""));

  // 122: four straight failures stretch the cadence; one
  // success restores it
  const backoff = await vm.runInContext(`
    (function () {
      var calls = 0;
      fetch = function () {
        calls++;
        return Promise.reject(new Error("network gone"));
      };
      api.gameId = "PG4"; api.over = false; dryRun = false;
      authGone = false; pollFails = 0; pollSkip = 0;
      var chain = Promise.resolve();
      for (var i = 0; i < 4; i++) {
        chain = chain.then(function () {
          pollOnce();
          return new Promise(function (r) { setTimeout(r, 10); });
        });
      }
      return chain.then(function () {
        var afterFailures = calls;
        for (var j = 0; j < 7; j++) pollOnce();   // all skipped
        var afterSkips = calls;
        pollOnce();                                // 8th: goes out
        return new Promise(function (r) {
          setTimeout(function () {
            r({ f: afterFailures, s: afterSkips, t: calls });
          }, 10);
        });
      });
    })()
  `, sandbox);
  check("after four failures the poll backs off (" +
        backoff.f + "," + backoff.s + "," + backoff.t + ")",
        backoff.f === 4 && backoff.s === 4 && backoff.t === 5);
  vm.runInContext("pollFails = 0; pollSkip = 0;", sandbox);

  // 114: a dead token in poll mode is said, and the poll halts
  heard();
  vm.runInContext(`
    fetch = function () {
      return Promise.reject(new Error("/api/account/playing -> HTTP 401"));
    };
    authGone = false; pollFails = 0; pollSkip = 0;
    api.gameId = "PG5"; api.over = false; dryRun = false;
    pollTimer = setInterval(function () {}, 100000);
    pollOnce();
  `, sandbox);
  await sleep(60);
  check("a dead token in poll mode speaks the sign-out sentence (" +
        heard().join(" | ") + ")",
        vm.runInContext("authGone", sandbox) === true);
  check("and the polling halts rather than 401ing forever",
        vm.runInContext("pollTimer === null", sandbox) === true);
  vm.runInContext("authGone = false;", sandbox);

  // 111b/115: watchEvents with no streaming body hands the
  // account watch to the poll instead of retrying at 3s forever
  vm.runInContext(`
    fetch = function () {
      return Promise.resolve({ ok: true, status: 200 });  // no body
    };
    saveToken("lip_w62_watch");
    eventFails = 7; stopPolling(); dryRun = false;
    api.gameId = null; api.over = false;
    watchEvents();
  `, sandbox);
  await sleep(60);
  check("a body-less event stream hands over to the poll",
        vm.runInContext("pollTimer !== null", sandbox) === true);
  check("and does not reset the event ladder on the way",
        vm.runInContext("eventFails", sandbox) === 7);
  vm.runInContext("stopPolling(); clearTimeout(eventTimer); clearToken();",
                  sandbox);

  // 121: a fresh token un-sticks the auth latch
  vm.runInContext("authGone = true; saveToken('lip_new');", sandbox);
  check("a new token re-arms the reconnects",
        vm.runInContext("authGone", sandbox) === false);
  vm.runInContext("clearToken();", sandbox);

  // 118: a stream that opens successfully stops the poll
  vm.runInContext(`
    pollTimer = setInterval(function () {}, 100000);
    fetch = function () {
      return Promise.resolve({
        ok: true, status: 200,
        body: { getReader: function () {
          return { read: function () {
            return Promise.resolve({ done: true });
          } };
        } }
      });
    };
    api.gameId = "PG6"; api.over = false; dryRun = false;
    startStream();
  `, sandbox);
  await sleep(60);
  check("a stream that opens takes over from the poll",
        vm.runInContext("pollTimer === null", sandbox) === true);
  vm.runInContext(
    "fetch = __realFetch3; api.gameId = null; clearTimeout(reconnectTimer);",
    sandbox);

  // w81: voice-on leaves a LIVE stream alone. The button called
  // startStream unconditionally (w50's safety net), which on a
  // healthy stream re-delivered gameFull and spoke "connected.
  // you are white." and "reconnected. you are white." back to
  // back - the game of 7 Aug heard both, three seconds in. The
  // stream that just delivered an event is fresh and stays;
  // one quiet past the keep-alive window is dead and reopens.
  const ensureOut = await vm.runInContext(`
    (function () {
      var opens = 0;
      fetch = function () {
        opens++;
        return Promise.resolve({
          ok: true, status: 200,
          body: { getReader: function () {
            var sent = false;
            return { read: function () {
              if (sent) return new Promise(function () {});  // held open
              sent = true;
              return Promise.resolve({ done: false,
                value: new TextEncoder().encode(JSON.stringify({
                  type: "gameFull",
                  white: { id: "me", name: "pawn76" },
                  black: { id: "maia5", name: "maia5", title: "BOT" },
                  state: { moves: "" } }) + "\\n") });
            } };
          } }
        });
      };
      api.gameId = "PG7"; api.over = false; api.myId = "me";
      dryRun = false; authGone = false; streamFails = 0;
      startStream();
      return new Promise(function (res) {
        setTimeout(function () {
          var opened = opens;
          ensureStream();                       // fresh: no reopen
          setTimeout(function () {
            var afterFresh = opens;
            streamBeatAt = Date.now() - 60000;  // long quiet: dead
            ensureStream();
            setTimeout(function () {
              res({ opened: opened, afterFresh: afterFresh,
                    afterDead: opens });
            }, 30);
          }, 30);
        }, 30);
      });
    })()
  `, sandbox);
  check("voice-on does not reopen a live stream (" +
        ensureOut.opened + "," + ensureOut.afterFresh + "," +
        ensureOut.afterDead + ")",
        ensureOut.opened === 1 && ensureOut.afterFresh === 1 &&
        ensureOut.afterDead === 2);
  vm.runInContext(
    "fetch = __realFetch3; api.gameId = null; api.over = false;" +
    "streamBeatAt = 0; streamGameId = null; clearTimeout(reconnectTimer);",
    sandbox);

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

  // (the "strip knows every question" test stood here from
  // v117: questionOpen left at w110 with the strip)

  // ---- a question does not survive into the next game ----
  // (the move questions died at w118; the yes/no and the
  // armed confirmation are the state left to clear)
  const survived = vm.runInContext(`
    (function () {
      dryRun = false;
      api.gameId = "OLDGAME"; api.over = false;
      confirmAction = "resign";
      armedUci = "e2e4";
      joinGame("NEWGAME");
      return { confirm: confirmAction, armed: armedUci };
    })()
  `, sandbox);
  check("a new game clears every open question",
        !survived.confirm && !survived.armed);

  const afterOver = vm.runInContext(`
    (function () {
      api.gameId = "G"; api.over = false; api.myColor = "w";
      api.pos = new RULES.Position(); api.moves = [];
      confirmAction = "drawoffer";
      handleGameState({ moves: "", status: "mate", winner: "black" }, false);
      return { confirm: confirmAction, over: api.over };
    })()
  `, sandbox);
  check("game over clears the open question too",
        afterOver.over === true && !afterOver.confirm);

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
      confirmAction = "resign";
      dryRun = true;
      dryStart();
      cancelSeek = realCancel;
      return { ev: __evAborted, seek: __seekCancelled,
               confirm: confirmAction };
    })()
  `, sandbox);
  await sleep(40); heard();
  check("practice closes the account event stream", teardown.ev === 1);
  check("practice cancels any outstanding seek", teardown.seek === 1);
  check("and clears the questions with it",
        !teardown.confirm);

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

  // ---- w79: the board paints Lichess's colours ----
  // The mini board mimics lichess.org so a glance carries
  // over: the last-move pair in the site's green tint, a
  // checked king under its red radial halo. Asked of the
  // recorded canvas paints, not grepped from board.js — a
  // colour in the source proves nothing about the square it
  // lands on, and the square arithmetic (grid, flip) is
  // exactly where this could quietly be wrong.
  // coordinates derive from MINI_CELL (w96): the cell grew
  // when the displayed board did, and pixel literals would
  // have silently pinned the tests to the old resolution
  const CELL = vm.runInContext("MINI_CELL", sandbox);
  const CPX = CELL * 8;
  function paintsAt(x, y) {
    return getEl("mini")._paints.filter(p =>
      p.op === "fillRect" && p.args[0] === x && p.args[1] === y);
  }
  function fillsOf(x, y) {
    return paintsAt(x, y).map(p => p.fillStyle);
  }
  vm.runInContext("initBoard();", sandbox);   // binds miniCtx if boot did not
  // fool's mate: 1.f3 e5 2.g4 Qh4# — last move d8h4, white
  // king on e1 in check (mate, in fact; the halo must not
  // care which).
  getEl("mini")._paints.length = 0;
  vm.runInContext(`
    api.pos = new RULES.Position(
      "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
    api.moves = ["f2f3", "e7e5", "g2g4", "d8h4"];
    api.myColor = "w"; api.over = false;
    renderMiniBoard();
  `, sandbox);
  // d8 and h4 are both dark squares: the dark-square tint
  check("the moved-from square wears the dark last-move green",
        fillsOf(3 * CELL, 0).includes("#a8a23b"));
  check("so does the moved-to square",
        fillsOf(7 * CELL, 4 * CELL).includes("#a8a23b"));
  const e1fills = fillsOf(4 * CELL, 7 * CELL);
  const isHalo = f => f && typeof f === "object" && f.stops &&
        f.stops.length === 4 && f.stops[0][1] === "rgb(255,0,0)" &&
        /rgba\(158,0,0,0\)/.test(f.stops[3][1]);
  check("the checked king's square is painted with the red halo",
        e1fills.some(isHalo));
  check("over its normal square colour (e1 is dark), not instead of it",
        e1fills.includes("#b58863"));
  check("and the halo lands on exactly one square",
        getEl("mini")._paints.filter(p =>
          p.op === "fillRect" && isHalo(p.fillStyle)).length === 1);

  // the same position seen from black's side: the board flips,
  // and the halo must flip WITH it — e1 drawn top-left-ish at
  // grid (0,3). A feature used twice is a different feature.
  getEl("mini")._paints.length = 0;
  vm.runInContext('api.myColor = "b"; renderMiniBoard();', sandbox);
  check("flipped, the halo follows the king to its flipped square",
        fillsOf(3 * CELL, 0).some(isHalo));
  // and a light-square last move, for the other tint: 1.e4
  getEl("mini")._paints.length = 0;
  vm.runInContext(`
    api.pos = new RULES.Position(
      "rnbqkbnr/pppppppp/8/8/4P3/8/8/RNBQKBNR b KQkq e3 0 1");
    api.moves = ["e2e4"]; api.myColor = "w";
    renderMiniBoard();
  `, sandbox);
  check("a light-square last move wears the light green",
        fillsOf(4 * CELL, 6 * CELL).includes("#ccd069") &&
        fillsOf(4 * CELL, 4 * CELL).includes("#ccd069"));
  check("and no halo when nobody is in check",
        !getEl("mini")._paints.some(p => isHalo(p.fillStyle)));

  // ---- w80: the coordinates sit where Lichess sits them ----
  // letters in the lower LEFT of the bottom rank, numbers in
  // the upper RIGHT of the rightmost file — asked of the same
  // recorded paints (still the unflipped 1.e4 render), because
  // the labels' contrast colour keys off the squares they sit
  // on, and moving the numbers across the board is exactly the
  // kind of change that could leave that keyed to the old edge.
  const texts = getEl("mini")._paints.filter(p => p.op === "fillText");
  const at = (s, x, y) => texts.some(p =>
    p.args[0] === s && p.args[1] === x && p.args[2] === y);
  const padX = Math.round(CELL * 0.0625), padY = Math.round(CELL * 0.052);
  const letterY = CPX - Math.round(CELL * 0.26), numberX = CPX - Math.round(CELL * 0.177);
  check("the a-file letter sits in a1's lower left", at("a", padX, letterY));
  check("the rank numbers sit in the right file's upper right",
        at("8", numberX, padY) && at("1", numberX, 7 * CELL + padY));
  const ink = s => (texts.find(p => p.args[0] === s) || {}).fillStyle;
  check("each label is inked in its square's opposite colour",
        ink("a") === "#f0d9b5" && ink("b") === "#b58863" &&
        ink("8") === "#f0d9b5" && ink("7") === "#b58863");
  vm.runInContext(
    "api.pos = new RULES.Position(); api.moves = [];", sandbox);

  // ---- w86: touch to move ----
  // Two taps on the glance board play the move. Driven as
  // synthesized clicks at pixel coordinates against the stub
  // rect (100x100 at left 40, top 500), asked of the built
  // DOM and the recorded paints - the rect scaling, the grid,
  // and the flip are exactly where a tap could quietly land
  // on the wrong square.
  const tapCell = 100 / 8;
  const tap = (s, flipped) => {
    let f = s.charCodeAt(0) - 97, r = s.charCodeAt(1) - 49;
    let gr = 7 - r, gf = f;
    if (flipped) { gr = 7 - gr; gf = 7 - gf; }
    getEl("mini").on_click({ clientX: 40 + (gf + 0.5) * tapCell,
                             clientY: 500 + (gr + 0.5) * tapCell });
  };
  const selTinted = () => getEl("mini")._paints.some(p =>
    p.fillStyle === "#809668" || p.fillStyle === "#636e40");
  vm.runInContext(`
    dryRun = true; busy = false; armedUci = null;
    dryOpponentReply = function () {};
    api.gameId = "PRACTICE"; api.over = false; api.myColor = "w";
    api.pos = new RULES.Position(); api.moves = [];
    initTouch();
  `, sandbox);
  heard();
  getEl("mini")._paints.length = 0;
  tap("e2");
  // e2 is a light square at grid (4,6) -> pixels (384,576)
  check("tapping your own piece paints the chosen-square tint",
        fillsOf(4 * CELL, 6 * CELL).includes("#809668"));
  check("and plays nothing yet",
        vm.runInContext("api.moves.length", sandbox) === 0);
  getEl("mini")._paints.length = 0;
  tap("e4");
  check("tapping its destination plays the move",
        vm.runInContext("api.moves.join()", sandbox) === "e2e4");
  check("the pawn stands on its new square",
        vm.runInContext('api.pos.board[RULES.nameSq("e4")]',
                        sandbox) === "P");
  check("the tint leaves with the selection", !selTinted());
  check("and a tapped move is NOT read back - the eye is on the screen",
        heard().length === 0);

  // the same feature from black's side: a feature used twice
  // is a different feature, and the flip is the second use.
  vm.runInContext(`
    api.myColor = "b";
    api.pos = new RULES.Position(
      "rnbqkbnr/pppppppp/8/8/4P3/8/8/RNBQKBNR b KQkq e3 0 1");
    api.moves = ["e2e4"];
  `, sandbox);
  tap("e7", true); tap("e5", true);
  check("flipped, the taps land on the flipped squares",
        vm.runInContext("api.moves.join()", sandbox) === "e2e4,e7e5");

  // a tapped promotion queens without asking; the underdogs
  // stay spoken moves
  vm.runInContext(`
    api.myColor = "w";
    api.pos = new RULES.Position("3k4/4P3/8/8/8/8/8/4K3 w - - 0 1");
    api.moves = [];
  `, sandbox);
  tap("e7"); tap("e8");
  check("a tapped promotion queens without asking",
        vm.runInContext("api.moves.join()", sandbox) === "e7e8q");

  // the guards: not our turn, and not our piece
  vm.runInContext(`
    api.pos = new RULES.Position(
      "rnbqkbnr/pppppppp/8/8/4P3/8/8/RNBQKBNR b KQkq e3 0 1");
    api.moves = []; api.myColor = "w";
  `, sandbox);
  getEl("mini")._paints.length = 0;
  tap("e7");
  check("a tap while the opponent thinks selects nothing",
        !getEl("mini")._paints.length);
  vm.runInContext(
    "api.pos = new RULES.Position(); api.moves = [];", sandbox);
  getEl("mini")._paints.length = 0;
  tap("e7");
  check("the opponent's piece cannot be picked up", !selTinted());

  // in a REAL game the tapped move posts, but never arms the
  // read-back: quiet all the way to the 200, loud on error
  // paths only (those are shared with voice and tested above).
  vm.runInContext(`
    __tchPostMove = postMove;
    postMove = function () {
      return Promise.resolve({ status: 200, body: { ok: true } });
    };
    dryRun = false; api.gameId = "TCHGAME";
    api.pos = new RULES.Position(); api.moves = [];
    api.myColor = "w"; armedUci = null;
  `, sandbox);
  heard();
  tap("e2"); tap("e4");
  await sleep(20);
  check("a real tapped move posts without arming the read-back",
        vm.runInContext("armedUci === null && busy === false", sandbox));
  check("and stays unspoken when the 200 lands",
        heard().length === 0);
  vm.runInContext(`
    postMove = __tchPostMove; dryRun = true; api.gameId = "PRACTICE";
    api.pos = new RULES.Position(); api.moves = [];
  `, sandbox);

  // ---- w90: the voice button no longer half-ends practice ----
  // dryRun was flipped false by BOTH directions of the voice
  // button, leaving the practice board and gameId standing
  // with the flag down. Unreachable while voice was the only
  // way to move; from w86 a board TAP in that half-state
  // would have POSTed a move to a "game" called PRACTICE on
  // the real Lichess API. Driven through the real button, and
  // the network is watched the whole way.
  vm.runInContext(`
    dryRun = true; running = true; busy = false;
    dryOpponentReply = function () {};
    api.gameId = "PRACTICE"; api.over = false; api.myColor = "w";
    api.pos = new RULES.Position(); api.moves = [];
    __fetches = 0; __realFetchW90 = fetch;
    fetch = function () {
      __fetches++;
      return Promise.resolve({ ok: true, status: 200,
        json: function () { return Promise.resolve({}); },
        text: function () { return Promise.resolve(""); } });
    };
    bigBtn.on_click();               /* voice OFF */
  `, sandbox);
  check("voice off leaves practice standing",
        vm.runInContext("dryRun === true && running === false", sandbox));
  tap("e2"); tap("e4");
  check("a tap with the mic closed is still a practice move, not a POST",
        vm.runInContext("api.moves.join()", sandbox) === "e2e4" &&
        vm.runInContext("__fetches", sandbox) === 0);
  heard();
  vm.runInContext("bigBtn.on_click();", sandbox);   /* voice back ON */
  check("voice back on leaves practice standing too",
        vm.runInContext("dryRun === true && running === true", sandbox));
  // w92: mid-practice, voice-on says "voice on" - not the
  // sign-in ask, which assumes a real game is coming and is a
  // non-sequitur beside a practice board that needs no token
  const backOn = heard().join(" | ");
  check("and says voice on, not the sign-in ask (" + backOn + ")",
        /voice on/i.test(backOn) && !/sign in/i.test(backOn));
  vm.runInContext("fetch = __realFetchW90;", sandbox);
  heard();

  // ---- w93/w102: the shared UI's paint pots match :root ----
  // buildUI() styles its buttons inline - it was written to
  // float over lichess.org, where no CSS of ours could reach
  // them - so every colour it uses is a second copy of a value
  // the stylesheet already holds. At w92 they drifted exactly
  // as the w54 note warned: --button-on moved to the clock
  // green, ui.js's copy did not, and the settings pills wore
  // last week's colour until a screenshot caught it. w102
  // named the remaining literals (six blues, six borders,
  // three ambers), so the whole block can be compared at once.
  // A source-text comparison ON PURPOSE: the stub DOM computes
  // no styles, and the invariant IS that two files hold one
  // value each.
  const cssSrc = fs.readFileSync("src/index.html", "utf8");
  [["BUTTON_OFF", "btn-bg"], ["BUTTON_ON", "button-on"],
   ["BUTTON_TEXT_ON", "bright"], ["BLUE", "blue"],
   ["BORDER", "border"], ["AMBER", "amber"]].forEach(pair => {
    const want = (cssSrc.match(
      new RegExp("--" + pair[1] + ":\\s*(#[0-9a-fA-F]{3,6})")) || [])[1];
    check("JS " + pair[0] + " matches the stylesheet's --" +
          pair[1] + " (" + want + ")",
          !!want && vm.runInContext(pair[0], sandbox) === want);
  });
  // and the one that reaches an element rather than a string:
  // the text painted ON the green, asked of a painted button.
  const cssOnText = (cssSrc.match(
    /--bright:\s*(#[0-9a-fA-F]{3,6})/) || [])[1];
  const paintedText = vm.runInContext(`
    (function () {
      var el = document.createElement("button");
      paintButton(el, true, "#000");
      return el.style.color;
    })()
  `, sandbox);
  check("and the painted ON text matches the stylesheet's (" +
        cssOnText + ")",
        !!cssOnText && paintedText === cssOnText);
  // w102: the chevron drawn into the select's data: URI cannot
  // read a variable, so it carries the blue percent-encoded.
  // Nothing else can catch that one drifting.
  check("the select chevron's stroke is the same blue",
        cssSrc.indexOf("stroke='%23" +
          vm.runInContext("BLUE", sandbox).slice(1) + "'") >= 0);

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
    swallow(startSeek(15, 10, false));      /* w71: gate allows rapid */
    seekAbort = null;
    /* 5+3 is blitz: the challenge gate must let it through -
       this doubles as the proof blitz challenges still post */
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
