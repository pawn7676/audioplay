/*  lichess.js - everything that talks to Lichess.
 *
 *  - Sign-in: OAuth PKCE in the browser. The token is kept
 *    in this browser's storage and never logged or shown.
 *  - The account event stream: a game started anywhere
 *    (this page, or the Lichess app) arrives here and is
 *    joined.
 *  - The game stream: moves, clocks, offers and results
 *    for the current game.
 *  - The connection watch: a stream gone silent is opened
 *    again.
 *  - Sending moves and actions; seeks and challenges.
 *
 *  Nothing is sent while practice mode (dryRun) is on.
 */

"use strict";

var RULES = makeRules();   // rules.js must load before this file

// The account and the current game, shared by the whole
// page. clearGame() lists the game's fields.
var api = { myId: null, myName: null };

// Forgets the current game: no game, no position, no
// clocks. The account stays.
function clearGame() {
  api.gameId = null;
  api.myColor = null;
  api.players = { w: null, b: null };   // {name, rating, title}
  api.pos = null;
  api.moves = [];        // UCI moves applied so far
  api.lastSan = "";
  api.lastUci = "";
  api.wtime = null;
  api.btime = null;
  api.clockAt = null;    // when wtime/btime were last exact
  api.over = false;
  api.overText = "";     // the spoken result, also shown
}
clearGame();

var LICHESS_BASE = "https://lichess.org";

// Shown to the user on Lichess's sign-in screen. The page
// plays games and sends challenges, and asks for nothing
// more. (A sign-in from before this change still holds an
// extra, unused permission until the next sign-in.)
var LICHESS_CLIENT_ID = "audioplay";
var LICHESS_SCOPES = "board:play challenge:write";

var VERIFIER_KEY = "audioplay.verifier";
var VERIFIER_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
  "0123456789-._~";

// ---- the token ----

// The token lives inside this closure, so no global
// variable ever holds it. Other files can only ask whether
// there is one (hasToken) or get request headers
// (authHeaders).
var tokenStore = (function () {
  // Leave empty: sign-in provides the token. A token put
  // here is used instead, for testing.
  var TOKEN = "";
  var cachedToken = null;

  function current() {
    return TOKEN || cachedToken || null;
  }

  function load() {
    cachedToken = stored(TOKEN_KEY) || null;
    log("API", cachedToken ? "token loaded from this browser"
                           : "no token stored yet");
  }

  function save(t) {
    cachedToken = t;
    store(TOKEN_KEY, t);
    log("API", "token saved in this browser");
  }

  function clear() {
    cachedToken = null;
    store(TOKEN_KEY, null);
    log("API", "token cleared from this browser");
  }

  // The Authorization header, plus any extra headers.
  function headers(extra) {
    var h = { Authorization: "Bearer " + (current() || "") };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  return {
    load: load, save: save, clear: clear, headers: headers,
    has: function () { return !!current(); }
  };
})();

function loadStoredToken() { tokenStore.load(); }
function hasToken() { return tokenStore.has(); }
function saveToken(t) { tokenStore.save(t); }
function clearToken() { tokenStore.clear(); }
function authHeaders(extra) { return tokenStore.headers(extra); }

// ---- sign-in ----

function randomText(size) {
  var raw = new Uint8Array(size);
  crypto.getRandomValues(raw);
  var out = "";
  for (var i = 0; i < raw.length; i++) {
    out += VERIFIER_ALPHABET[raw[i] % VERIFIER_ALPHABET.length];
  }
  return out;
}

function base64Url(buffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Where Lichess sends the user back to: this page.
function redirectUri() {
  return window.location.origin + window.location.pathname;
}

// Leaves for lichess.org. Lichess sends the user back with
// ?code=..., which finishSignIn picks up on the next load.
//
// The secret is saved directly rather than with store(),
// because sign-in can't go ahead if saving fails.
function signIn() {
  var verifier = randomText(64);
  try { localStorage.setItem(VERIFIER_KEY, verifier); }
  catch (e) {
    log("ERR", "cannot store the sign-in secret");
    uiStatus("Cannot store the sign-in secret.");
    return;
  }

  // The address must be the same when the code comes back,
  // so the log says which one was used.
  log("API", "signing in - back to " + redirectUri());
  crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(verifier)).then(function (digest) {
      var query = "response_type=code" +
        "&client_id=" + encodeURIComponent(LICHESS_CLIENT_ID) +
        "&redirect_uri=" + encodeURIComponent(redirectUri()) +
        "&scope=" + encodeURIComponent(LICHESS_SCOPES) +
        "&code_challenge_method=S256" +
        "&code_challenge=" + base64Url(digest);
      window.location.href = LICHESS_BASE + "/oauth?" + query;
    });
}

// Trades the returned code for a token. Resolves with what
// this load was:
//   "none"    not a return from sign-in
//   "ok"      a return, and the token is saved
//   "failed"  a return that didn't work; the status line
//             already says why, and boot.js leaves it
function finishSignIn() {
  var params = new URLSearchParams(window.location.search);
  var code = params.get("code");
  var failed = params.get("error");
  if (!code && !failed) return Promise.resolve("none");
  log("API", "back from Lichess" + (code ? " with a code" : ""));
  var verifier = stored(VERIFIER_KEY);
  store(VERIFIER_KEY, null);
  window.history.replaceState({}, "", redirectUri());
  if (failed) {
    log("ERR", "sign-in refused (" + failed + ")");
    uiStatus("Sign-in refused (" + failed + ").");
    return Promise.resolve("failed");
  }
  if (!verifier) {
    log("ERR", "sign-in secret missing - try again");
    uiStatus("Sign-in secret missing - try again.");
    return Promise.resolve("failed");
  }
  var body = "grant_type=authorization_code" +
    "&code=" + encodeURIComponent(code) +
    "&code_verifier=" + encodeURIComponent(verifier) +
    "&redirect_uri=" + encodeURIComponent(redirectUri()) +
    "&client_id=" + encodeURIComponent(LICHESS_CLIENT_ID);
  return exchangeCode(body, 1).then(function (granted) {
    if (!granted.access_token) throw new Error("no token in the reply");
    saveToken(granted.access_token);
    authGone = false;   // a new token restarts reconnecting
    return "ok";
  }).catch(function (e) {
    if (e.refused) {
      uiStatus(e.message + ". Tap Sign in to try again.");
    } else {
      log("ERR", "sign-in not finished: " + e.message);
      uiStatus("Could not reach Lichess to finish signing in " +
               "(" + e.message + "). Tap Sign in to try again.");
      checkLichessReachable();
    }
    return "failed";
  });
}

// A token request that gets no answer at all (Safari says
// "Load failed") is tried again, TOKEN_TRIES times in all,
// TOKEN_RETRY_MS apart: the code stays good for a short
// while. A refusal (an HTTP error) isn't tried again: the
// error is marked refused, and Lichess's reason is logged.
var TOKEN_TRIES = 3;
var TOKEN_RETRY_MS = 1500;

function exchangeCode(body, attempt) {
  return fetch(LICHESS_BASE + "/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body
  }).then(function (r) {
    if (r.ok) return r.json();
    return r.text().catch(function () { return ""; })
      .then(function (t) {
        log("ERR", "token request refused: HTTP " + r.status +
            (t ? " " + t.slice(0, 160) : ""));
        var e = new Error("Lichess refused the sign-in (HTTP " +
                          r.status + ")");
        e.refused = true;
        throw e;
      });
  }, function (e) {
    log("ERR", "token request try " + attempt + " of " +
        TOKEN_TRIES + " got no answer: " + e.name + ": " +
        e.message + (navigator.onLine === false ? " (offline)" : ""));
    if (attempt >= TOKEN_TRIES) throw e;
    return new Promise(function (done) {
      setTimeout(done, TOKEN_RETRY_MS);
    }).then(function () { return exchangeCode(body, attempt + 1); });
  });
}

// After the token request got no answer: can this page
// reach Lichess at all? A public page that needs no
// sign-in is asked for. If that fails too, something
// between the page and Lichess (a content blocker, the
// network) stops every request; if it works, only the
// token request is stopped. The answer is a NET line.
function checkLichessReachable() {
  fetch(LICHESS_BASE + "/api/user/maia1").then(function (r) {
    log("NET", "lichess.org reachable from this page (HTTP " +
        r.status + ") - only the token request failed");
  }, function (e) {
    log("NET", "lichess.org not reachable from this page either: " +
        e.message);
  });
}

// Asks Lichess to cancel the token, so the site's access
// really ends, then forgets it here. If Lichess can't be
// reached, it is still forgotten here.
function signOut() {
  if (hasToken()) {
    fetch(LICHESS_BASE + "/api/token",
          { method: "DELETE", headers: authHeaders() })
      .then(function (r) {
        log("API", "token revoked on Lichess -> " + r.status);
      })
      .catch(function (e) {
        log("ERR", "could not revoke the token: " + e.message);
      });
  }
  stopEverything();
  clearToken();
  api.myId = null;
  api.myName = null;
  clearGame();
  uiStatus("Signed out.");
  uiGameChanged();
}

// ---- requests ----

function apiGet(path) {
  return fetch(LICHESS_BASE + path, { headers: authHeaders() })
    .then(function (r) {
      if (!r.ok) throw new Error(path + " -> HTTP " + r.status);
      return r.json();
    });
}

// A form POST (seeks, challenges, declines). signal, if
// given, lets the request be cancelled.
function postForm(path, body, signal) {
  return fetch(LICHESS_BASE + path, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": "application/x-www-form-urlencoded"
    }),
    body: body,
    signal: signal
  });
}

// Reads a streamed reply to its end. Lichess sends one
// JSON object per line, plus blank lines now and then to
// keep the connection open. onEvent gets each object;
// onChunk, if given, hears every arrival, blank lines
// included.
function readLines(r, onEvent, onChunk) {
  var reader = r.body.getReader();
  var dec = new TextDecoder();
  var buf = "";
  function pump() {
    return reader.read().then(function (c) {
      if (c.done) return;
      if (onChunk) onChunk();
      buf += dec.decode(c.value, { stream: true });
      var lines = buf.split("\n");
      buf = lines.pop();
      lines.forEach(function (ln) {
        if (!ln.trim()) return;
        var ev;
        try { ev = JSON.parse(ln); }
        catch (e) { log("ERR", "bad line: " + ln.slice(0, 80)); return; }
        onEvent(ev);
      });
      return pump();
    });
  }
  return pump();
}

function fetchMyId() {
  return apiGet("/api/account").then(function (a) {
    api.myId = (a.id || "").toLowerCase();

    // the id is lower case for comparing; the name keeps
    // its capitals for display
    api.myName = a.username || a.id || "";
    log("API", "account = " + api.myName);
    return api.myId;
  });
}

// A move request that never answers would leave every
// later move refused as "still sending", so it gives up
// after this long.
var MOVE_POST_TIMEOUT_MS = 12000;

// Resolves with {status, body}. Giving up rejects with an
// error marked noReply: the move may still have reached
// Lichess, unlike a request that failed outright.
function postMove(uci) {
  var url = LICHESS_BASE + "/api/board/game/" + api.gameId + "/move/" + uci;
  log("PST", "move " + uci);
  var timer = null;
  var live = fetch(url, { method: "POST", headers: authHeaders() })
    .then(function (r) {
      return r.json().catch(function () { return { ok: r.ok }; })
        .then(function (j) { return { status: r.status, body: j }; });
    });
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      var e = new Error("no reply from Lichess in " +
                        (MOVE_POST_TIMEOUT_MS / 1000) + " seconds");
      e.noReply = true;
      reject(e);
    }, MOVE_POST_TIMEOUT_MS);
  });

  function done(v) { clearTimeout(timer); return v; }
  return Promise.race([live, timeout])
    .then(done, function (e) { done(); throw e; });
}

// Resign, draw, takeback, claim. Resolves with {ok, status,
// body}, so the caller can say what really happened -
// Lichess refuses these in ordinary play (resigning in the
// first moves, an offer already withdrawn).
function postAction(action) {
  var url = LICHESS_BASE + "/api/board/game/" + api.gameId + "/" + action;
  log("PST", action);
  return fetch(url, { method: "POST", headers: authHeaders() })
    .then(function (r) { return r.text().then(function (t) {
      log("PST", action + " -> " + r.status + " " + t.slice(0, 120));
      return { ok: r.ok, status: r.status, body: t };
    }); });
}

// ---- the game ----

// Brings the board up to date with the server's move list,
// announcing the opponent's new moves if announce is true.
function syncMoves(uciString, announce) {
  var list = (uciString || "").trim() ? uciString.trim().split(/\s+/) : [];

  // Our list must be the start of the server's. If not (a
  // takeback, possibly with a new move in the same event),
  // rebuild from the start, silently.
  var diverged = list.length < api.moves.length;
  for (var k = 0; !diverged && k < api.moves.length; k++) {
    if (list[k] !== api.moves[k]) diverged = true;
  }
  if (diverged) {
    log("MOV", "move list diverged - rebuilding");
    api.pos = new RULES.Position();
    api.moves = [];
    api.lastSan = "";
    api.lastUci = "";
    armedUci = null;
    announce = false;
  }
  for (var i = api.moves.length; i < list.length; i++) {
    var res = api.pos.applyUci(list[i]);
    if (!res) {
      log("ERR", "illegal uci from stream: " + list[i] + " (resyncing)");
      api.pos = new RULES.Position();
      api.moves = [];

      api.lastSan = "";
      api.lastUci = "";
      armedUci = null;
      for (var j = 0; j < list.length; j++) {
        var rr = api.pos.applyUci(list[j]);
        if (!rr) { log("ERR", "resync failed at " + list[j]); break; }
        api.lastSan = rr.san;
        api.lastUci = list[j];
      }
      api.moves = list.slice();
      return;
    }
    api.moves.push(list[i]);
    var moverIsMine = (res.move.color === api.myColor);
    api.lastSan = res.san;
    api.lastUci = list[i];
    log("MOV", colorWord(res.move.color) + " " + list[i] + " = " + res.san +
        (announce ? "" : " (catch-up)"));
    if (announce && !moverIsMine) {
      speak(moveToSpeech(res.san, list[i]) + ".");
    }

    // our own move coming back: confirm it, if this beat
    // the reply to our request
    if (moverIsMine) readBackMine(res.san, list[i], announce);
  }
}

// The opponent leaving is said once. When Lichess allows
// claiming the win, it becomes a yes/no question.
var oppGone = false, claimAsked = false;

function handleOpponentGone(ev) {
  if (api.over || dryRun) return;
  if (ev.gone) {
    if (!oppGone) {
      oppGone = true;
      log("EVT", "opponent gone" + (ev.claimWinInSeconds != null
          ? ", claim in " + ev.claimWinInSeconds + "s" : ""));
      speak("your opponent has left the game.");
    }
    if (ev.claimWinInSeconds != null && ev.claimWinInSeconds <= 0 &&
        !claimAsked) {
      claimAsked = true;
      confirmAction = "claimvictory";
      speak("you can claim the win. " +
            answerHint("claim it", "keep waiting"));
    }
  } else if (oppGone) {
    oppGone = false;
    claimAsked = false;
    if (confirmAction === "claimvictory") confirmAction = null;
    log("EVT", "opponent back");
    speak("your opponent is back.");
  }
}

// The opponent's draw and takeback offers, spoken and
// answered by yes or no (1 or 0 when typing).
var offerState = { draw: false, takeback: false };

// A new offer takes over any open question, and says which
// one it replaced, so a "yes" meant for "resign" can't
// accept a draw. A withdrawn offer takes its question with
// it.
function checkOffers(s) {
  if (!api.myColor) return;
  var oppDraw = api.myColor === "w" ? !!s.bdraw : !!s.wdraw;
  var oppTake = api.myColor === "w" ? !!s.btakeback : !!s.wtakeback;
  var them = colorWord(api.myColor === "w" ? "b" : "w");

  function displaced() {
    if (confirmAction === "resign") return "that cancels the resign question. ";
    if (confirmAction === "offerdraw") return "that cancels your draw offer question. ";
    if (confirmAction === "claimvictory") return "that cancels the claim question. ";
    return "";
  }

  if (oppDraw && !offerState.draw && !api.over) {
    var wasD = displaced();
    confirmAction = "drawoffer";
    log("API", "opponent offers a draw" + (wasD ? " (displacing a question)" : ""));
    speak(them + " offers a draw. " + wasD +
          answerHint("accept", "decline"));
  }
  if (oppTake && !offerState.takeback && !api.over) {
    var wasT = displaced();
    confirmAction = "takebackoffer";
    log("API", "opponent asks for a takeback" +
        (wasT ? " (displacing a question)" : ""));
    speak(them + " asks to take back a move. " + wasT +
          answerHint("accept", "decline"));
  }

  if (!oppDraw && offerState.draw && confirmAction === "drawoffer") {
    confirmAction = null;
    log("API", "draw offer withdrawn");
    speak(them + " withdrew the draw offer.");
  }
  if (!oppTake && offerState.takeback && confirmAction === "takebackoffer") {
    confirmAction = null;
    log("API", "takeback request withdrawn");
    speak(them + " withdrew the takeback request.");
  }
  offerState.draw = oppDraw;
  offerState.takeback = oppTake;
}

// A side's remaining time, counting down between server
// updates for the side to move. Frozen once the game is
// over, and until both sides have moved (Lichess doesn't
// start the clocks before that).
function remainingMs(color) {
  var base = color === "w" ? api.wtime : api.btime;
  if (base == null) return null;
  if (api.pos && !api.over && api.pos.turn === color && api.clockAt &&
      api.moves.length >= 2) {
    return base - (Date.now() - api.clockAt);
  }
  return base;
}

// The result in words, by colour ("checkmate. white
// wins.").
//
// Lichess's "draw" status covers agreement, repetition,
// the fifty-move rule and insufficient material alike, so
// a draw is just "drawn." rather than a guess at why. Any
// other status gets a plain sentence, never its raw name
// ("noStart").
function resultSpoken(s2) {
  var status = (s2 && s2.status) || "over";

  var winner = s2 && s2.winner;   // "white", "black" or none
  var loser = winner === "white" ? "black" : "white";
  if (status === "aborted") return "game aborted.";
  if (status === "noStart") {
    return winner ? loser + " didn't move. " + winner + " wins."
                  : "game aborted.";
  }
  if (!winner) {
    if (status === "stalemate") return "stalemate. drawn.";

    // a flag against a side that can't mate
    if (status === "outoftime") return "time ran out. drawn.";
    return "drawn.";
  }
  if (status === "mate") return "checkmate. " + winner + " wins.";
  if (status === "resign") return loser + " resigned. " + winner + " wins.";
  if (status === "outoftime") {
    return loser + " ran out of time. " + winner + " wins.";
  }

  // timeout: the opponent left and the win was claimed
  if (status === "timeout") {
    return loser + " left the game. " + winner + " wins.";
  }
  return winner + " wins.";
}

// Speaks the result and keeps it for the status line.
function sayResult(sentence) {
  api.overText = sentence;
  speak(sentence);
}

// A gameFull arrives each time the game stream opens. The
// first for a game says "connected"; a later one, with the
// game already on the board, is a reconnect, and if the
// opponent moved while the stream was down, that move is
// said too ("reconnected. black played echo 7, echo 5."),
// since the catch-up itself is silent.
function handleGameFull(g) {
  // Standard chess only (a custom start position is fine).
  // A variant game would trip the rules on every move.
  var vkey = (g.variant && (g.variant.key || g.variant.name)) || "standard";
  if (vkey !== "standard" && vkey !== "fromPosition") {
    api.over = true;
    log("API", "variant game (" + vkey + ") - not playable here");
    sayResult("this is a " + ((g.variant && g.variant.name) || vkey) +
          " game. this app plays standard chess only. play it on lichess.");
    if (streamAbort) streamAbort.abort();
    return;
  }
  var rejoin = !!api.pos, hadMoves = api.moves.length;
  api.pos = new RULES.Position(g.initialFen && g.initialFen !== "startpos"
                             ? g.initialFen : undefined);
  api.moves = [];

  var whiteId = ((g.white && g.white.id) || "").toLowerCase();
  api.myColor = (whiteId && whiteId === api.myId) ? "w" : "b";
  api.players.w = playerOf(g.white);
  api.players.b = playerOf(g.black);
  log("API", "game " + api.gameId + " you are " +
      (api.myColor === "w" ? "white" : "black") + ", " +
      playerLabel(api.players[api.myColor === "w" ? "b" : "w"]) +
      " on the other side");
  syncMoves(g.state && g.state.moves, false);   // catch up silently
  var st = g.state && g.state.status;
  if (st && st !== "started" && st !== "created") {
    api.over = true;
    log("API", "joined a finished game: " + st);
    sayResult("This game is already finished. " + resultSpoken(g.state));
    return;
  }
  handleGameState(g.state, false);

  // the last move is the opponent's when you are to move
  var missed = "";
  if (rejoin && api.moves.length > hadMoves && api.lastUci &&
      api.pos.turn === api.myColor) {
    missed = colorWord(api.myColor === "w" ? "b" : "w") + " played " +
             moveToSpeech(api.lastSan, api.lastUci) + ". ";
  }
  speakWhenAudioSettled((rejoin ? "reconnected. " : "connected. ") +
        missed + "You are " + colorWord(api.myColor) + ". " +
        colorWord(api.pos.turn) + " to move.");
}

// A player from gameFull, as {name, rating, title}. Lichess's
// own computer opponent has a level and no name.
function playerOf(p) {
  if (!p) return null;
  if (p.aiLevel != null) {
    return { name: "computer level " + p.aiLevel, rating: null, title: null };
  }
  var name = p.name || p.id;
  if (!name) return null;
  return { name: name,
           rating: (typeof p.rating === "number") ? p.rating : null,
           title: p.title || null };
}

// For the log only.
function playerLabel(pl) {
  if (!pl) return "unknown opponent";
  return (pl.title ? pl.title + " " : "") + pl.name +
         (pl.rating != null ? " (" + pl.rating + ")" : "");
}

function handleGameState(s, announce) {
  if (!s) return;
  syncMoves(s.moves, announce !== false);
  api.wtime = s.wtime; api.btime = s.btime; api.clockAt = Date.now();
  checkOffers(s);
  if (s.status && s.status !== "started" && s.status !== "created") {
    if (!api.over) {
      api.over = true;
      log("API", "game over: " + s.status + " " + (s.winner || ""));

      clearDialogue();   // open questions end with the game
      sayResult(resultSpoken(s));
    }
  }
}

// ---- the game stream ----

var streamAbort = null;

// When the game stream last showed a sign of life: opened,
// or sent anything at all, keep-alive lines included. Also
// set as each try starts, so a try that hangs is noticed
// too. See the connection watch, below.
var streamHeardAt = 0;
var streamGameId = null;

// Restarts the stream only if it has gone quiet. (A healthy
// stream restarted would announce "reconnected".)
function ensureStream() {
  if (streamGameId === api.gameId &&
      Date.now() - streamHeardAt < CONNECTION_QUIET_MS) {
    log("NET", "stream is live - leaving it alone");
    return;
  }
  startStream();
}

function startStream() {
  if (!api.gameId || dryRun || api.gameId === "PRACTICE") return;
  log("NET", "opening stream for " + api.gameId);
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  streamGameId = api.gameId;
  streamHeardAt = Date.now();
  if (streamAbort) streamAbort.abort();
  streamAbort = new AbortController();

  fetch(LICHESS_BASE + "/api/board/game/stream/" + api.gameId,
        { headers: authHeaders(), signal: streamAbort.signal })
    .then(function (r) {
      if (!r.ok) throw new Error("stream HTTP " + r.status);
      streamHeardAt = Date.now();
      streamFails = 0;
      return readLines(r, function (ev) {
        log("EVT", ev.type || "?");
        if (ev.type === "gameFull") handleGameFull(ev);
        else if (ev.type === "gameState") handleGameState(ev, true);
        else if (ev.type === "opponentGone") handleOpponentGone(ev);
        // chat lines are ignored
      }, function () {
        streamHeardAt = Date.now();
      }).then(function () {
        log("NET", "stream ended");
        scheduleReconnect();
      });
    })
    .catch(function (e) {
      // our own abort (opening a new stream closes the old
      // one) is not a dropped stream
      if (String(e.name) === "AbortError") return;
      log("ERR", "stream: " + e.message);

      // asked to slow down: wait the longest
      if (/HTTP 429/.test(String(e.message))) {
        streamFails = Math.max(streamFails, 5);
      }
      if (!noteAuthFailure(e)) scheduleReconnect();
    });
}

// A refused token (401/403) is said once and stops all
// retrying, since retrying can't fix it.
var authGone = false;
function noteAuthFailure(e) {
  if (!/HTTP 40[13]/.test(String(e.message))) return false;
  if (authGone) return true;
  authGone = true;
  log("ERR", "lichess refused the token - signed out");
  uiStatus("Lichess refused the sign-in. Sign in again.");
  speak("Lichess signed you out. sign in again.");
  return true;
}

// Reconnects the game stream, waiting longer after each
// failure (2s, 4s, 8s... up to 30s). Not tied to the mic:
// being connected and listening are separate. The timer is
// null unless a reconnect is waiting, which the connection
// watch reads.
var reconnectTimer = null;
var streamFails = 0;
function scheduleReconnect() {
  if (api.over || dryRun || !api.gameId || api.gameId === "PRACTICE") return;
  if (authGone) return;

  streamFails++;
  var wait = Math.min(2000 * Math.pow(2, streamFails - 1), 30000);
  log("NET", "reconnecting in " + (wait / 1000) + "s (try " + streamFails + ")");
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    startStream();
  }, wait);
}

// ---- the account event stream ----

var eventAbort = null;

// null unless a reconnect is waiting, which the connection
// watch reads
var eventTimer = null;

// When the event stream last showed a sign of life, like
// streamHeardAt for the game stream.
var eventHeardAt = 0;

function watchEvents() {
  if (!hasToken()) return;
  clearTimeout(eventTimer);
  eventTimer = null;
  eventHeardAt = Date.now();
  if (eventAbort) eventAbort.abort();
  eventAbort = new AbortController();
  log("NET", "opening the account event stream");
  fetch(LICHESS_BASE + "/api/stream/event",
        { headers: authHeaders(), signal: eventAbort.signal })
    .then(function (r) {
      if (!r.ok) throw new Error("event stream HTTP " + r.status);
      eventHeardAt = Date.now();
      eventFails = 0;
      return readLines(r, handleAccountEvent, function () {
        eventHeardAt = Date.now();
      }).then(function () {
        log("NET", "event stream ended");
        scheduleEventReconnect();
      });
    })
    .catch(function (e) {
      if (String(e.name) === "AbortError") return;
      log("ERR", "event stream: " + e.message);

      if (/HTTP 429/.test(String(e.message))) {
        eventFails = Math.max(eventFails, 4);
      }
      if (!noteAuthFailure(e)) scheduleEventReconnect();
    });
}

// Waits longer after each failure, like the game stream
// (3s, 6s, 12s... up to 30s).
var eventFails = 0;
function scheduleEventReconnect() {
  if (!hasToken() || authGone) return;

  eventFails++;
  var wait = Math.min(3000 * Math.pow(2, eventFails - 1), 30000);
  clearTimeout(eventTimer);
  eventTimer = setTimeout(function () {
    eventTimer = null;
    watchEvents();
  }, wait);
}

// Games starting and ending. Everything else is ignored:
// challenges from other players, and answers to our own
// challenges, which arrive on the challenge's own request
// (see sendChallenge).
function handleAccountEvent(ev) {
  if (ev.type === "gameStart" && ev.game &&
      (ev.game.gameId || ev.game.id)) {
    var gid = ev.game.gameId || ev.game.id;
    log("EVT", "gameStart " + gid);
    cancelSeek();

    // Too fast for the Board API (bullet, or blitz from the
    // app): every move would be refused, so say so instead.
    if (ev.game.compat && ev.game.compat.board === false) {
      log("EVT", "game " + gid + " is not Board-API compatible");
      speak("a game has started that this app cannot play. " +
            "it is too fast. play it on lichess.");

      uiStatus("That game is too fast to play here. Play it on Lichess.");
      return;
    }
    joinGame(gid);
  } else if (ev.type === "gameFinish") {
    log("EVT", "gameFinish");
    uiGameChanged();
  }
}

function joinGame(gameId) {
  if (api.gameId === gameId && !api.over) return;
  clearGame();
  api.gameId = gameId;
  offerState = { draw: false, takeback: false };
  oppGone = false; claimAsked = false;

  clearDialogue();   // no question carries into a new game
  (api.myId ? Promise.resolve(api.myId) : fetchMyId())
    .then(startStream)
    .catch(function (e) {
      log("ERR", "join: " + e.message);
      speak("could not connect. check the log.");
    });
}

// After sign-in, and after practice (which closes every
// connection): learn who we are, watch for new games, and
// join a game already in progress if there is one. If it
// fails (the iPad was offline, say), the connection watch
// tries again.
var accountConnecting = false;

function connectAccount() {
  if (!hasToken()) return;
  accountConnecting = true;
  eventHeardAt = Date.now();
  fetchMyId().then(function () {
    uiStatus("Waiting for a game.");

    renderAccount();   // show the name on the account button
    watchEvents();
    return apiGet("/api/account/playing?nb=1");
  }).then(function (d) {
    var g = (d.nowPlaying || [])[0];
    if (g && g.gameId) {
      log("API", "already playing " + g.gameId);
      joinGame(g.gameId);
    }
  }).catch(function (e) {
    log("ERR", "connect: " + e.message);
    uiStatus("Could not connect - check the log.");
  }).then(function () {
    accountConnecting = false;
  });
}

// ---- the connection watch ----

// A connection can die without a word: the Wi-Fi drops for
// a moment, or the iPad dozes, and the request just hangs,
// with no end and no error, so nothing above notices.
// Lichess sends a sign of life (a blank line) every few
// seconds on both streams, so one that has sent nothing
// for CONNECTION_QUIET_MS is taken for dead and opened
// again. The same goes for a try that hangs, and for an
// account that never connected (the iPad was offline when
// the page loaded).
//
// Checked every CONNECTION_WATCH_MS, and at once when the
// page comes back into view. boot.js starts it. NET lines
// in the log say when it acts.
var CONNECTION_QUIET_MS = 20000;
var CONNECTION_WATCH_MS = 5000;

function checkConnections(when) {
  var now = Date.now();
  var gameWanted = !!api.gameId && api.gameId !== "PRACTICE" &&
      !api.over && !dryRun && hasToken() && !authGone && !!api.myId;
  if (gameWanted && !reconnectTimer &&
      now - streamHeardAt > CONNECTION_QUIET_MS) {
    log("NET", "game stream silent for " +
        Math.round((now - streamHeardAt) / 1000) + "s" + when +
        " - opening it again");
    startStream();
  }

  var eventsWanted = hasToken() && !authGone && !dryRun;
  if (eventsWanted && !eventTimer && !accountConnecting &&
      now - eventHeardAt > CONNECTION_QUIET_MS) {
    if (api.myId) {
      log("NET", "event stream silent for " +
          Math.round((now - eventHeardAt) / 1000) + "s" + when +
          " - opening it again");
      watchEvents();
    } else {
      log("NET", "account not connected" + when + " - trying again");
      connectAccount();
    }
  }
}

function startConnectionWatch() {
  setInterval(function () { checkConnections(""); },
              CONNECTION_WATCH_MS);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      checkConnections(", page back in view");
    }
  });
}

// ---- seek and challenge ----

var seekAbort = null;

// Lichess sizes a game as minutes * 60 + 40 * increment
// seconds. The Board API needs at least rapid (480s) for a
// public seek, and at least blitz (180s) for anything.
// Refused here, before a game exists that we'd have to
// walk away from.
var SEEK_FLOOR_S = 480;
var PLAY_FLOOR_S = 180;

// null if the time control is allowed, otherwise a sentence
// saying why not.
function speedGate(minutes, increment, seeking) {
  var est = minutes * 60 + 40 * increment;
  var floor = seeking ? SEEK_FLOOR_S : PLAY_FLOOR_S;
  if (est >= floor) return null;
  var name = est < PLAY_FLOOR_S ? "bullet" : "blitz";
  var out = minutes + "+" + increment + " is " + name + " - ";
  if (est < PLAY_FLOOR_S) {
    out += "too fast for this app. Blitz or slower for challenges, " +
           "rapid or slower to find an opponent.";
  } else {
    out += "seeks need rapid or slower. Challenge someone instead.";
  }
  return out;
}

// The seek lasts as long as its request stays open; the
// game itself arrives on the event stream.
function startSeek(minutes, increment, rated) {
  if (!hasToken() || seekAbort || dryRun) return;
  var slow = speedGate(minutes, increment, true);
  if (slow) {
    log("API", "seek refused before posting: " + slow);
    uiStatus(slow);
    return;
  }
  var body = "rated=" + rated + "&time=" + minutes +
    "&increment=" + increment + "&variant=standard";
  seekAbort = new AbortController();
  uiStatus("Seeking " + minutes + "+" + increment +
    (rated ? " rated" : " casual") + "...");
  log("API", "seek " + body);
  postForm("/api/board/seek", body, seekAbort.signal)
    .then(function (r) {
      if (!r.ok) {
        seekAbort = null;
        return r.json().catch(function () { return {}; })
          .then(function (j) {
            var why = j.error ? " - " + j.error : " (HTTP " + r.status + ")";
            log("ERR", "seek refused" + why);
            uiStatus("Seek refused" + why + ".");
            uiGameChanged();
          });
      }
      return readLines(r, function () {}).then(function () {
        seekAbort = null;
        uiGameChanged();
      });
    }).catch(function (e) {
      seekAbort = null;
      if (e.name !== "AbortError") {
        log("ERR", "seek: " + e.message);
        uiStatus("Seek failed (" + e.message + ").");
      }
      uiGameChanged();
    });
}

function cancelSeek() {
  if (!seekAbort) return;
  seekAbort.abort();
  seekAbort = null;
  uiStatus("Seek cancelled.");
}

// A challenge expires after 20 seconds unless kept alive,
// so it is sent with keepAliveStream and lives as long as
// its request stays open. Aborting the request cancels the
// challenge. When the opponent answers, Lichess sends
// {"done": "accepted"} (or "declined", "canceled") on that
// same request and closes it. An accepted game itself
// arrives as gameStart on the event stream.
var challengeAbort = null;

function sendChallenge(who, minutes, increment, rated, color) {
  if (!hasToken() || dryRun) return;
  if (challengeAbort) { uiStatus("Still waiting on the last challenge."); return; }
  who = (who || "").trim();
  if (!who) { uiStatus("Name an opponent."); return; }
  var slow = speedGate(minutes, increment, false);
  if (slow) {
    log("API", "challenge refused before posting: " + slow);
    uiStatus(slow);
    return;
  }
  var body = "rated=" + rated +
    "&clock.limit=" + (minutes * 60) +
    "&clock.increment=" + increment +
    "&color=" + (color || "random") +
    "&variant=standard" +
    "&keepAliveStream=true";
  challengeAbort = new AbortController();
  uiStatus("Challenging " + who + "...");
  log("API", "challenge " + who + " " + body);
  postForm("/api/challenge/" + encodeURIComponent(who), body,
           challengeAbort.signal)
    .then(function (r) {
      if (!r.ok) {
        challengeAbort = null;
        return r.json().catch(function () { return {}; })
          .then(function (j) {
            log("ERR", "challenge refused (HTTP " + r.status +
                (j.error ? ": " + j.error : "") + ")");
            uiStatus("Challenge refused" +
                (j.error ? " - " + j.error : "") + ".");
          });
      }
      uiStatus("Challenge sent to " + who + " - waiting.");
      var outcome = "";
      return readLines(r, function (ev) {
        if (ev.done) outcome = ev.done;
      }).then(function () {
        challengeAbort = null;
        log("EVT", "challenge " + (outcome || "ended with no answer"));
        challengeAnswered(who, outcome);
      });
    }).catch(function (e) {
      challengeAbort = null;
      if (e.name !== "AbortError") {
        log("ERR", "challenge: " + e.message);
        uiStatus("Challenge failed (" + e.message + ").");
      }
    });
}

// Says how a challenge ended. Accepted needs no words:
// the game starting says "connected".
function challengeAnswered(who, outcome) {
  if (outcome === "accepted") return;
  if (outcome === "declined") {
    uiStatus(who + " declined the challenge.");
    speak("challenge declined.");
  } else if (outcome === "canceled") {
    uiStatus("Challenge cancelled.");
  } else {
    uiStatus("The challenge to " + who + " ended with no answer.");
    speak("challenge ended with no answer.");
  }
}

function cancelChallenge() {
  if (!challengeAbort) return;
  challengeAbort.abort();
  challengeAbort = null;
  log("API", "challenge cancelled");
}

// Closes every connection: on sign-out, and when practice
// starts. Voice off leaves the connection alone.
function stopEverything() {
  if (eventAbort) eventAbort.abort();
  if (streamAbort) streamAbort.abort();
  cancelSeek();
  cancelChallenge();
  clearTimeout(eventTimer);
  clearTimeout(reconnectTimer);
  eventTimer = null;
  reconnectTimer = null;
}
