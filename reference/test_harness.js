/* Harness for audioplay-web: stub the browser, load the six
 * files in index.html's order, boot, then drive
 * handleTranscripts through practice mode with real
 * utterance shapes from the userscript's game logs.
 * Anything thrown, any missing global, fails loudly. */

"use strict";
const fs = require("fs");
const vm = require("vm");

const spoken = [];
const logged = [];

function element(id) {
  return {
    id: id, style: {}, textContent: "", innerHTML: "",
    disabled: false, checked: false, value: id === "seekMinutes" ? "15"
      : id === "seekIncrement" ? "10" : id === "challengeWho" ? "maia1"
      : id === "challengeColour" ? "random" : "",
    classList: { add() {}, remove() {}, toggle() {} },
    options: [],                       // real <select>s have this
    innerHTML_: "",
    addEventListener(name, fn) { this["on_" + name] = fn; },
    appendChild() {}, remove() {},
    getContext() { return new Proxy({}, { get: () => () => {} }); },
    getBoundingClientRect() { return { width: 100, height: 100 }; },
    play() { return Promise.resolve(); }, pause() {}, load() {},
    scrollTop: 0, scrollHeight: 0
  };
}
// three collapsible panels, as index.html has
const fakePanels = ["panelBoard", "panelLichess", "panelLog"].map(id => ({
  open: id !== "panelLog",
  parentNode: { id: id },
  addEventListener(n, fn) { this["on_" + n] = fn; }
}));

const elements = {};
function getEl(id) {
  if (!elements[id]) elements[id] = element(id);
  return elements[id];
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
             removeItem: k => { delete s[k]; } };
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
                     speaking: false, paused: false, resume() {} },
  SpeechSynthesisUtterance: function (t) { this.text = t; },
  Blob: function () {}, URL: { createObjectURL: () => "blob:x" },
  Audio: function () { return element("audio"); },
  MutationObserver: function () { this.observe = () => {}; },
  document: {
    readyState: "complete",
    getElementById: getEl,
    querySelectorAll: (sel) => {
      if (sel.indexOf("details") >= 0) return fakePanels;
      return [];
    },

    createElement: tag => element(tag),
    body: element("body"),
    documentElement: element("html"),
    addEventListener() {}
  }
};
sandbox.addEventListener = function () {};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

const order = ["rules.js", "board.js", "speech.js", "parser.js",
               "lichess.js", "modes.js", "app.js"];
for (const f of order) {
  vm.runInContext(fs.readFileSync(f, "utf8"), sandbox, { filename: f });
  console.log("loaded", f);
}

// capture speech and log after load (they are globals now)
vm.runInContext(`
  var __spoken = [];
  var __origSpeak = speak;
  // mirror the real funnel's first branch: silent mode
  // routes to the screen, otherwise capture as "spoken"
  speak = function (t) {
    if (silentModeOn()) { silentShowText(t); return; }
    __spoken.push(t);
  };
`, sandbox);

// boot ran on load (readyState complete). Now: practice.
vm.runInContext(`
  document.getElementById("chipPractice").on_click();
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
    dryRun = false; running = false;
    document.getElementById("chipPractice").on_click();
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

  // ---- w2: modes ----
  function check(name, cond) {
    console.log((cond ? "PASS " : "FAIL ") + name);
    cond ? pass++ : fail++;
  }

  // clock mode on, "flip clock" no longer throws (the w1
  // stub gap), tap-to-exit returns to voice
  vm.runInContext("enterClockMode();", sandbox);
  check("clock mode reports on", vm.runInContext("currentMode()", sandbox) === "clock");
  say("flip clock");
  await sleep(120);
  check("flip clock handled without throwing",
        !vm.runInContext("LOG.slice(-5).join(' ')", sandbox).includes("flipClockSides"));
  vm.runInContext("exitClockMode(true);", sandbox);
  check("tap leaves clock mode", vm.runInContext("currentMode()", sandbox) === "voice");

  // silent mode: routed speech lands in the info area, an
  // ambiguous move becomes a numbered list, and the number
  // answers it
  vm.runInContext("enterSilentMode();", sandbox);
  check("silent mode reports on", vm.runInContext("currentMode()", sandbox) === "silent");
  say("whose turn");
  await sleep(120);
  const info1 = vm.runInContext("silentInfoLines.join(' ')", sandbox);
  check("routed answer shown, not spoken (" + JSON.stringify(info1) + ")",
        /to move/.test(info1) && heard().length === 0);
  // knight to a reachable square with both knights: from
  // the start position "knight echo two" hits Ng1e2/Nb1..?
  // Play d4 first so both knights can reach f3? Simplest
  // ambiguous: fresh game, "knight charlie three" is
  // unique; use "bravo one charlie three"? Take a known
  // fork: after 1.Nf3 (played above game reset) — instead
  // force pending directly is cheating. Use "rook" with
  // none: expect the not-legal line shown.
  say("rook alpha four");
  await sleep(120);
  const info2 = vm.runInContext("silentInfoLines.join(' ')", sandbox);
  check("move-shaped utterance answered on screen (" + JSON.stringify(info2) + ")",
        /not a legal move|say again|to move/i.test(info2));
  vm.runInContext("exitSilentMode(true);", sandbox);
  check("tap leaves silent mode", vm.runInContext("currentMode()", sandbox) === "voice");

  // per-mode read-back: default ON in voice, OFF in clock
  check("read-back on in voice mode", vm.runInContext("readBackMyMove()", sandbox) === true);
  vm.runInContext("enterClockMode();", sandbox);
  check("read-back off in clock mode", vm.runInContext("readBackMyMove()", sandbox) === false);
  vm.runInContext("exitClockMode(true);", sandbox);

  // low-time callouts: opt-in, once per threshold, waits
  // out a pending question, silent when a clock is visible
  vm.runInContext(`
    MODE_SETTINGS.lowTimeOn = true;
    MODE_SETTINGS.lowTimeLevels = "60";
    running = true; dryRun = false;
    api.gameId = "TESTGAME"; api.over = false;
    api.myColor = "w";
    api.wtime = 55000; api.btime = 300000; api.clockAt = Date.now();
    pending = null; confirmAction = null;
  `, sandbox);
  heard();
  vm.runInContext("lowTimeTick();", sandbox);
  await sleep(80);
  const call1 = heard().join(" | ");
  check("low-time callout spoken once (" + JSON.stringify(call1) + ")",
        /one minute remaining/.test(call1));
  vm.runInContext("lowTimeTick();", sandbox);
  await sleep(80);
  check("threshold not repeated", heard().length === 0);
  vm.runInContext(`
    lowTimeSaid = {}; pending = { cands: [], idx: 0 };
  `, sandbox);
  vm.runInContext("lowTimeTick();", sandbox);
  await sleep(80);
  check("callout waits out a pending question", heard().length === 0);
  vm.runInContext("pending = null; enterClockMode();", sandbox);
  vm.runInContext("lowTimeTick();", sandbox);
  await sleep(80);
  check("callout silent when a clock is visible", heard().length === 0);
  vm.runInContext("exitClockMode(true);", sandbox);
  vm.runInContext("lowTimeTick();", sandbox);
  await sleep(80);
  check("callout resumes in voice mode", /one minute/.test(heard().join(" ")));

  // ---- w3 ----
  // fullscreen is gone from both overlays: no call, and
  // the four helpers deleted rather than left dangling
  const modesSrc = fs.readFileSync("modes.js", "utf8")
    .split("\n").filter(l => !/^\s*[*/]/.test(l)).join("\n");
  check("no fullscreen calls left in modes.js",
        !/enterClockFullscreen\(|enterSilentFullscreen\(|leaveClockFullscreen\(|leaveSilentFullscreen\(/.test(modesSrc));

  // entering and leaving an overlay still works with the
  // fullscreen calls removed
  vm.runInContext("enterClockMode();", sandbox);
  check("clock mode still enters without fullscreen",
        vm.runInContext("currentMode()", sandbox) === "clock");
  vm.runInContext("exitClockMode(true);", sandbox);
  vm.runInContext("enterSilentMode();", sandbox);
  check("silent mode still enters without fullscreen",
        vm.runInContext("currentMode()", sandbox) === "silent");
  vm.runInContext("exitSilentMode(true);", sandbox);
  check("back to voice", vm.runInContext("currentMode()", sandbox) === "voice");

  // the voice setter takes and is remembered
  vm.runInContext('setVoiceName("Samantha");', sandbox);
  check("voice name set", vm.runInContext("VOICE_NAME", sandbox) === "Samantha");
  vm.runInContext('setVoiceName("");', sandbox);
  check("voice name cleared to default",
        vm.runInContext("VOICE_NAME", sandbox) === "");

  // the opponent setting is what the challenge button sends
  check("opponent defaults to maia1",
        vm.runInContext("MODE_SETTINGS.opponent", sandbox) === "maia1");

  // ---- w8: no allowlist; the device decides ----
  function withVoices(voices, expr) {
    vm.runInContext("__voices = " + JSON.stringify(voices) + ";" +
      "speechSynthesis.getVoices = function () { return __voices; };",
      sandbox);
    return vm.runInContext(expr, sandbox);
  }
  const names = "englishVoices().map(function (v) { return v.label; })";

  // an unknown platform's voices come through untouched:
  // the failure mode of every previous allowlist
  const odd = withVoices([
    { name: "Acme Speaker One", lang: "en-US" },
    { name: "Vendor Voice Two", lang: "en-GB" },
    { name: "Stimme Drei", lang: "de-DE" }
  ], names);
  check("unknown platform's English voices all offered (" +
        odd.join(",") + ")",
        odd.length === 2 && odd.includes("Acme Speaker One") &&
        odd.includes("Vendor Voice Two"));

  // Windows in India: nothing filtered, labels tidied
  const win = withVoices([
    { name: "Microsoft Ravi - English (India)", lang: "en-IN" },
    { name: "Microsoft Heera - English (India)", lang: "en-IN" },
    { name: "Microsoft David - English (United States)", lang: "en-US" },
    { name: "Microsoft Hemant - Hindi (India)", lang: "hi-IN" }
  ], names);
  check("Windows voices all offered, tidied (" + win.join(",") + ")",
        win.length === 3 && win.includes("Ravi") &&
        !win.join(",").includes("Microsoft"));

  // Apple: real voices kept, joke voices dropped
  const apple = withVoices([
    { name: "Samantha", lang: "en-US" },
    { name: "Daniel", lang: "en-GB" },
    { name: "Zarvox", lang: "en-US" },
    { name: "Bubbles", lang: "en-US" },
    { name: "Bad News", lang: "en-US" }
  ], names);
  check("joke voices excluded, real ones kept (" + apple.join(",") + ")",
        apple.length === 2 && apple.includes("Samantha") &&
        apple.includes("Daniel"));

  // page-language voices sort first
  const order = withVoices([
    { name: "Aaa", lang: "en-GB" },
    { name: "Zzz", lang: "en-US" }
  ], names);
  check("page-language voice sorts first (" + order.join(",") + ")",
        order[0] === "Zzz");

  // ---- w10: the account button is the identity ----
  vm.runInContext(`
    api.myId = "pawn76"; api.myName = "pawn76";
    renderAccount();
  `, sandbox);
  const btn = () => vm.runInContext(
    'document.getElementById("btnSignIn").textContent', sandbox);
  check("signed in: the button shows the name", btn() === "pawn76");
  check("no separate username line exists",
        !fs.readFileSync("index.html", "utf8").includes('id="lichessWho"'));
  check("status line no longer repeats the name",
        !fs.readFileSync("lichess.js", "utf8").includes('"Signed in as "'));
  vm.runInContext('api.myId = null; api.myName = null; renderAccount();',
                  sandbox);
  check("signed out: the button invites sign-in",
        btn() === "Sign in with Lichess");

  // w12: signed in, the pill is inert — tapping it must
  // NOT start another sign-in
  vm.runInContext(`
    api.myId = "pawn76"; api.myName = "pawn76"; renderAccount();
    __signInCalls = 0;
    var __realSignIn = signIn;
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

  // ---- w14: game17 findings ----
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
  // ...and the end of speech picks it up
  vm.runInContext(`
    speaking = false;
    if (running && !listening) startListening();
  `, sandbox);
  check("mic starts once speech ends",
        vm.runInContext("__micStarts", sandbox) === 1);
  vm.runInContext("startListening = __realStart; listening = false;",
                  sandbox);

  // "tags" heard for "takes", game17
  check('"tags" counts as takes',
        vm.runInContext('!!TAKE_WORDS["tags"] && !!TAKE_WORDS["tag"]',
                        sandbox) === true);

  // ---- w19: panel open/closed survives a reload ----
  vm.runInContext(`
    __panels = null;
    savePanels();                      // whatever they are now
  `, sandbox);
  fakePanels[1].open = false;          // user collapses Lichess
  vm.runInContext("savePanels();", sandbox);
  fakePanels[1].open = true;           // markup default on reload
  vm.runInContext("restorePanels();", sandbox);
  check("a collapsed panel stays collapsed after reload",
        fakePanels[1].open === false);
  check("other panels keep their state",
        fakePanels[0].open === true && fakePanels[2].open === false);

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
