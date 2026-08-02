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
    addEventListener(name, fn) { this["on_" + name] = fn; },
    appendChild() {}, remove() {},
    getContext() { return new Proxy({}, { get: () => () => {} }); },
    getBoundingClientRect() { return { width: 100, height: 100 }; },
    play() { return Promise.resolve(); }, pause() {}, load() {},
    scrollTop: 0, scrollHeight: 0
  };
}
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
               "lichess.js", "app.js"];
for (const f of order) {
  vm.runInContext(fs.readFileSync(f, "utf8"), sandbox, { filename: f });
  console.log("loaded", f);
}

// capture speech and log after load (they are globals now)
vm.runInContext(`
  var __spoken = [];
  var __origSpeak = speak;
  speak = function (t) { __spoken.push(t); };
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

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
