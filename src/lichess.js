  /*====================== LICHESS BOARD API =======================\
   *
   *  The page's Lichess layer. Built at w20 from the v134
   *  userscript's board-API section with exactly three
   *  transplants, all salvaged from the w19 site and proven
   *  in game 17:
   *    - the token block is PKCE sign-in (no pasted tokens;
   *      the token lives in THIS origin's localStorage, which
   *      is ours alone - the userscript's GM-storage reasoning
   *      does not apply off lichess.org)
   *    - the game id comes from the ACCOUNT EVENT STREAM, not
   *      the page URL (there is no lichess.org URL here); a
   *      gameStart event joins the game whether it began from
   *      this page's seek/challenge, the Lichess app, or a
   *      friend's challenge
   *    - seek and challenge, from BoardEye via w1
   *  Everything between the transplants - syncMoves, offers,
   *  clocks, results, gameFull/gameState, the stream and the
   *  polling fallback - CAME FROM the v134 userscript
   *  verbatim, and that is now history rather than a rule.
   *
   *  IT USED TO SAY "when the userscript moves, re-copy those
   *  parts". The userscript froze at v137 and will not move
   *  again, so there is nothing to re-copy from and no reason
   *  to keep these parts copy-shaped (w54). w50 and w52 both
   *  edited this region on their own merits - the AbortError
   *  filter, the reconnect ladder, the whole poll repair - and
   *  the old instruction would have argued against every one
   *  of them. Read the provenance above for WHY something
   *  looks the way it does; do not treat it as a constraint.
   *
   *  VERSION is assigned here rather than where it is
   *  declared: the w-series is the only version line, and
   *  keeping the number next to the note explaining the series
   *  is what stops it being set in two places again.
   *================================================================*/

  VERSION = "w57";

  var RULES = makeRules();

  var api = {
    gameId: null,
    myId: null,
    myName: null,        // shown on the sign-in button (web)
    myColor: null,
    pos: null,
    moves: [],            // uci list already applied
    lastSan: "", lastSanW: "", lastSanB: "",
    wtime: null, btime: null,
    over: false
  };

  var LICHESS_BASE = "https://lichess.org";
  // THE USER SEES THIS STRING. Lichess has no app
  // registry and no approval step: whatever goes here is
  // shown verbatim on the consent screen, and is the only
  // thing identifying this page to the person deciding
  // whether to trust it. So it is a NAME, not a
  // description — the reverse-domain shape it had at w1
  // was a convention borrowed without its reason (there
  // is no registry to namespace against, and no domain
  // here to reverse). Changing it later is safe: existing
  // tokens keep working, they just list under the old
  // name on lichess.org until re-granted.
  var LICHESS_CLIENT_ID = "audioplay";
  var LICHESS_SCOPES = "board:play challenge:write challenge:read";
  var VERIFIER_KEY = "audioplay.lichess.verifier";
  var VERIFIER_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
    "0123456789-._~";

  var cachedToken = null;

  function loadStoredToken() {
    try { cachedToken = localStorage.getItem(TOKEN_KEY) || null; }
    catch (e) { cachedToken = null; }
    log("API", cachedToken ? "token loaded from this browser"
                           : "no token stored yet");
    return cachedToken;
  }

  function storedToken() {
    return TOKEN || cachedToken || null;
  }

  function saveToken(t) {
    cachedToken = t;
    try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
    log("API", "token saved in this browser");
  }

  function clearToken() {
    cachedToken = null;
    api.myId = null;
    api.myName = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    log("API", "token cleared from this browser");
  }

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

  function redirectUri() {
    return window.location.origin + window.location.pathname;
  }

  // Leaves the page for lichess.org/oauth; Lichess sends
  // the user back to redirectUri() with ?code=..., which
  // finishSignIn picks up on the next load.
  function signIn() {
    var verifier = randomText(64);
    try { localStorage.setItem(VERIFIER_KEY, verifier); }
    catch (e) {
      log("ERR", "cannot store the sign-in secret");
      uiStatus("Cannot store the sign-in secret.");
      return;
    }
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

  // Returns true if this load was a sign-in return (with a
  // code or an error), whether or not it succeeded.
  function finishSignIn() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get("code");
    var failed = params.get("error");
    if (!code && !failed) return Promise.resolve(false);
    var verifier = null;
    try {
      verifier = localStorage.getItem(VERIFIER_KEY);
      localStorage.removeItem(VERIFIER_KEY);
    } catch (e) {}
    window.history.replaceState({}, "", redirectUri());
    if (failed) {
      log("ERR", "sign-in refused (" + failed + ")");
      uiStatus("Sign-in refused (" + failed + ").");
      return Promise.resolve(true);
    }
    if (!verifier) {
      log("ERR", "sign-in secret missing - try again");
      uiStatus("Sign-in secret missing - try again.");
      return Promise.resolve(true);
    }
    var body = "grant_type=authorization_code" +
      "&code=" + encodeURIComponent(code) +
      "&code_verifier=" + encodeURIComponent(verifier) +
      "&redirect_uri=" + encodeURIComponent(redirectUri()) +
      "&client_id=" + encodeURIComponent(LICHESS_CLIENT_ID);
    return fetch(LICHESS_BASE + "/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    }).then(function (r) {
      if (!r.ok) throw new Error("token exchange failed (HTTP " +
                                 r.status + ")");
      return r.json();
    }).then(function (granted) {
      if (!granted.access_token) throw new Error("no token in the reply");
      saveToken(granted.access_token);
      return true;
    }).catch(function (e) {
      log("ERR", e.message);
      uiStatus(e.message + ".");
      return true;
    });
  }

  function signOut() {
    stopEverything();
    clearToken();
    api.myId = null;
    api.myName = null;
    api.gameId = null;
    api.myColor = null;
    api.pos = null;
    api.moves = [];
    api.over = false;
    uiStatus("Signed out.");
    uiGameChanged();
  }

  function authHeaders() {
    return { Authorization: "Bearer " + (storedToken() || "") };
  }

  function apiGet(path) {
    return fetch("https://lichess.org" + path, { headers: authHeaders() })
      .then(function (r) {
        if (!r.ok) throw new Error(path + " -> HTTP " + r.status);
        return r.json();
      });
  }

  function fetchMyId() {
    return apiGet("/api/account").then(function (a) {
      api.myId = (a.id || "").toLowerCase();
      // the id is lowercased for comparing against
      // game.white.id; the username keeps its real
      // capitalisation and is what the user is shown
      api.myName = a.username || a.id || "";
      log("API", "account = " + api.myName);
      return api.myId;
    });
  }

  /* A POST THAT NEVER SETTLES MUST STILL SETTLE (w50). The
   * caller sets busy = true and clears it in this promise's
   * handlers, so a fetch that hangs - a dead cell, a captive
   * wifi portal, the radio asleep - leaves busy stuck true
   * forever, and from then on EVERY accepted move is dropped
   * with nothing said. That is a mode the user cannot see, and
   * the only way out is the button. Twelve seconds is long
   * enough that a slow-but-alive request still wins the race,
   * and short enough to be inside the time a person waits
   * before assuming they were not heard. */
  var MOVE_POST_TIMEOUT_MS = 12000;

  function postMove(uci) {
    var url = "https://lichess.org/api/board/game/" + api.gameId + "/move/" + uci;
    log("PST", "move " + uci);
    var timer = null;
    var live = fetch(url, { method: "POST", headers: authHeaders() })
      .then(function (r) {
        return r.json().catch(function () { return { ok: r.ok }; })
          .then(function (j) { return { status: r.status, body: j }; });
      });
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        reject(new Error("no reply from Lichess in " +
                         (MOVE_POST_TIMEOUT_MS / 1000) + " seconds"));
      }, MOVE_POST_TIMEOUT_MS);
    });
    // whichever wins, the timer is done with - otherwise every
    // move leaves one armed for the full timeout behind it
    function done(v) { clearTimeout(timer); return v; }
    return Promise.race([live, timeout])
      .then(done, function (e) { done(); throw e; });
  }

  function postAction(action) {
    var url = "https://lichess.org/api/board/game/" + api.gameId + "/" + action;
    log("PST", action);
    return fetch(url, { method: "POST", headers: authHeaders() })
      .then(function (r) { return r.text().then(function (t) {
        log("PST", action + " -> " + r.status + " " + t.slice(0, 120));
      }); });
  }

  /* rebuild position from a uci move list, announcing only the new
   * tail */
  function syncMoves(uciString, announce) {
    var list = (uciString || "").trim() ? uciString.trim().split(/\s+/) : [];
    /* A TAKEBACK IS NOT ALWAYS SHORTER (w50). This asked only
     * whether the list had got shorter, which misses the case
     * where a takeback and its replacement move arrive in one
     * event, or where a takeback lands while a reconnect is in
     * flight: same length, different tail. The loop then began
     * at api.moves.length, applied nothing, and left the local
     * position quietly describing a game that is no longer on
     * the board - with no illegal uci to trip the resync
     * below, because no uci was ever applied. What we hold has
     * to be a PREFIX of what the server sent; anything else is
     * a rebuild. The list is a few hundred entries at most and
     * this runs once per event. */
    var diverged = list.length < api.moves.length;
    for (var k = 0; !diverged && k < api.moves.length; k++) {
      if (list[k] !== api.moves[k]) diverged = true;
    }
    if (diverged) {
      /* takeback or new game: rebuild from scratch, silently */
      log("MOV", "move list diverged - rebuilding");
      api.pos = new RULES.Position();
      api.moves = [];
      api.lastSan = ""; api.lastSanW = ""; api.lastSanB = "";
      armedUci = null;      /* it named a move in the old list */
      announce = false;
    }
    for (var i = api.moves.length; i < list.length; i++) {
      var res = api.pos.applyUci(list[i]);
      if (!res) {
        log("ERR", "illegal uci from stream: " + list[i] + " (resyncing)");
        api.pos = new RULES.Position();
        api.moves = [];
        /* REPLAY, KEEPING WHAT THE REPLAY SAYS (w50). The old
         * version threw the sans away, so after a resync the
         * clock overlay's move rows kept showing whatever was
         * last announced before it - and the arm survived,
         * pointing at a move in a position that no longer
         * exists, ready to read back against the wrong one. */
        api.lastSan = ""; api.lastSanW = ""; api.lastSanB = "";
        armedUci = null;
        for (var j = 0; j < list.length; j++) {
          var rr = api.pos.applyUci(list[j]);
          if (!rr) { log("ERR", "resync failed at " + list[j]); break; }
          api.lastSan = rr.san;
          if (rr.move.color === "w") api.lastSanW = rr.san;
          else api.lastSanB = rr.san;
        }
        api.moves = list.slice();
        return;
      }
      api.moves.push(list[i]);
      var moverIsMine = (res.move.color === api.myColor);
      api.lastSan = res.san;
      if (res.move.color === "w") api.lastSanW = res.san;
      else api.lastSanB = res.san;
      log("MOV", colorWord(res.move.color) + " " + list[i] + " = " + res.san +
          (announce ? "" : " (catch-up)"));
      if (announce && !moverIsMine && speakOpponentNow()) {
        speak(sanToSpeech(res.san) + ".", colorWord(res.move.color));
      }
      // OUR OWN MOVE, CONFIRMED BY THE STREAM (v134). This
      // is the earlier of the two confirmations whenever
      // the stream wins the race with the 200, and it must
      // speak HERE: the opponent's reply can be in the very
      // same event batch, and the read-back has to be out
      // before it. readBackMine ignores anything we did not
      // post, and takes the arm so the 200 stays quiet.
      if (moverIsMine) readBackMine(res.san, list[i], announce);
    }
  }

  /* An opponent's draw or takeback offer is invisible if you are not
   * looking at the screen, so it has to be spoken and answerable. */
  var offerState = { draw: false, takeback: false };

  /* AN OFFER MAY NOT QUIETLY INHERIT SOMEBODY ELSE'S "YES"
   * (w50). This set confirmAction unconditionally, so an offer
   * arriving while a question was already open replaced it
   * without a word - ask "resign", hear "Resign the game? Yes
   * or no.", have the opponent offer a draw in the gap, say
   * "yes" meaning resign, and accept a draw instead. Both are
   * game-ending and they are not the same game-ending.
   *
   * The offer still has to be heard: it is invisible from
   * across the room and it expires. So it takes the slot and
   * SAYS it is doing so, naming what it displaced. The user
   * hears one sentence instead of two and answers the question
   * they were actually asked last.
   *
   * And an offer that goes away takes its question with it.
   * Nothing cleared confirmAction when the opponent withdrew,
   * so a "yes" arriving later posted an acceptance for an
   * offer that no longer existed and was told it had worked.
   */
  function checkOffers(s) {
    if (!api.myColor) return;
    var oppDraw = api.myColor === "w" ? !!s.bdraw : !!s.wdraw;
    var oppTake = api.myColor === "w" ? !!s.btakeback : !!s.wtakeback;
    var them = colorWord(api.myColor === "w" ? "b" : "w");

    function displaced() {
      // only a question the user is mid-way through needs
      // naming; an earlier offer being replaced by a later one
      // is the same kind of thing and needs no apology.
      if (confirmAction === "resign") return "that cancels the resign question. ";
      if (confirmAction === "offerdraw") return "that cancels your draw offer question. ";
      if (pending) return "that cancels the move question. ";
      return "";
    }

    if (oppDraw && !offerState.draw && !api.over) {
      var wasD = displaced();
      pending = null;
      confirmAction = "drawoffer";
      log("API", "opponent offers a draw" + (wasD ? " (displacing a question)" : ""));
      speak(them + " offers a draw. " + wasD +
            "Say yes to accept, no to decline.");
    }
    if (oppTake && !offerState.takeback && !api.over) {
      var wasT = displaced();
      pending = null;
      confirmAction = "takebackoffer";
      log("API", "opponent asks for a takeback" +
          (wasT ? " (displacing a question)" : ""));
      speak(them + " asks to take back a move. " + wasT +
            "Say yes to accept, no to decline.");
    }
    // WITHDRAWN: the question goes with the offer, and says so,
    // because the user may be holding a "yes" ready for it.
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

  // Extrapolates the running side's clock between server
  // events, for either color: clock mode paints both. The
  // clock is frozen once the game is over (v73 — before,
  // the side to move at mate kept counting down).
  function remainingMs(color) {
    var base = color === "w" ? api.wtime : api.btime;
    if (base == null) return null;
    if (api.pos && !api.over && api.pos.turn === color && api.clockAt) {
      return base - (Date.now() - api.clockAt);
    }
    return base;
  }

  function myRemainingMs() { return remainingMs(api.myColor); }

  /* stated in colors, never "you" or "they" */
  function resultSpoken(s2) {
    var status = (s2 && s2.status) || "over";
    // "white" | "black" | undefined
    var winner = s2 && s2.winner;
    var loser = winner === "white" ? "black" : "white";
    var how = { mate: "checkmate", resign: "resignation", outoftime: "time",
                timeout: "timeout", stalemate: "stalemate", draw: "agreement",
                aborted: "abort", cheat: "cheat detection",
                variantEnd: "variant end" }[status] || status;
    if (status === "aborted") return "game aborted.";
    if (status === "stalemate") return "stalemate. drawn.";
    if (!winner) return "drawn by " + how + ".";
    if (status === "mate") return "checkmate. " + winner + " wins.";
    if (status === "resign") return loser + " resigned. " + winner + " wins.";
    if (status === "outoftime") {
      return loser + " ran out of time. " + winner + " wins.";
    }
    return winner + " wins by " + how + ".";
  }

  // "connected" the first time, "reconnected" after that,
  // so a mid-game network drop that healed itself (game3,
  // 15:29:12) is announced as what it was: a resume, not a
  // fresh start.
  var everConnected = false;

  function handleGameFull(g) {
    api.pos = new RULES.Position(g.initialFen && g.initialFen !== "startpos"
                               ? g.initialFen : undefined);
    api.moves = [];
    var whiteId = ((g.white && g.white.id) || "").toLowerCase();
    api.myColor = (whiteId && whiteId === api.myId) ? "w" : "b";
    log("API", "game " + api.gameId + " you are " +
        (api.myColor === "w" ? "white" : "black"));
    syncMoves(g.state && g.state.moves, false);   // catch up silently
    var st = g.state && g.state.status;
    if (st && st !== "started" && st !== "created") {
      api.over = true;
      log("API", "joined a finished game: " + st);
      speak("This game is already finished. " + resultSpoken(g.state));
      return;
    }
    handleGameState(g.state, false);
    speakWhenAudioSettled((everConnected ? "reconnected" : "connected") +
          ". You are " + colorWord(api.myColor) + ". " +
          colorWord(api.pos.turn) + " to move.");
    everConnected = true;
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
        // every open question dies with the game (w50). A
        // "yes" held over from a finished game had nothing
        // good to do: post to a game Lichess has closed and
        // hear "draw accepted." for a draw that was not.
        clearDialogue();
        speak(resultSpoken(s));
      }
      return;
    }
  }

  /* ---- streaming ---- */

  var streamAbort = null;

  function startStream() {
    if (!api.gameId || dryRun || api.gameId === "PRACTICE") return;
    log("NET", "opening stream for " + api.gameId);
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    streamAbort = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var opts = { headers: authHeaders() };
    if (streamAbort) opts.signal = streamAbort.signal;

    fetch("https://lichess.org/api/board/game/stream/" + api.gameId, opts)
      .then(function (r) {
        if (!r.ok) throw new Error("stream HTTP " + r.status);
        if (!r.body || !r.body.getReader) throw new Error("no streaming body");
        streamFails = 0;          /* it opened: the ladder resets */
        var reader = r.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) { log("NET", "stream ended"); scheduleReconnect(); return; }
            buf += dec.decode(res.value, { stream: true });
            var lines = buf.split("\n");
            buf = lines.pop();
            lines.forEach(function (ln) {
              if (!ln.trim()) return;            // keep-alive
              var ev;
              try { ev = JSON.parse(ln); }
              catch (e) { log("ERR", "bad ndjson: " + ln.slice(0, 80)); return; }
              log("EVT", ev.type || "?");
              if (ev.type === "gameFull") handleGameFull(ev);
              else if (ev.type === "gameState") handleGameState(ev, true);
              else if (ev.type === "chatLine") { /* ignore */ }
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (e) {
        // AN ABORT IS OUR OWN DOING, NOT A DROPPED STREAM
        // (w50). watchEvents has filtered this since it was
        // written; this catch never did, and the omission
        // built a loop that fed itself. startStream aborts the
        // previous stream on its way in, that abort rejects
        // the old reader, the rejection landed HERE, and
        // scheduleReconnect opened another stream two seconds
        // later - which aborted the one just opened. Every
        // turn of it re-delivered gameFull, so the page said
        // "reconnected. you are white. white to move." every
        // two seconds, for as long as the game lasted.
        if (String(e.name) === "AbortError") return;
        log("ERR", "stream: " + e.message);
        if (String(e.message).indexOf("no streaming body") >= 0) startPolling();
        else if (!noteAuthFailure(e)) scheduleReconnect();
      });
  }

  /* A TOKEN THAT LICHESS NO LONGER ACCEPTS IS NOT A NETWORK
   * BLIP (w52). Every retry path here treated all failures the
   * same, so a revoked or expired token meant an HTTP 401 every
   * two seconds, forever, filling the log and telling the user
   * nothing - and the one thing they could actually DO about it
   * is the one thing nobody told them to do. Said once, and the
   * retrying stops, because retrying cannot fix it.
   */
  var authGone = false;
  function noteAuthFailure(e) {
    if (!/HTTP 40[13]/.test(String(e.message))) return false;
    if (authGone) return true;
    authGone = true;
    log("ERR", "lichess refused the token - signed out");
    uiStatus("Lichess refused the sign-in. Sign in again.");
    speak("lee chess signed you out. sign in again.");
    return true;
  }

  var reconnectTimer = null;
  var streamFails = 0;
  function scheduleReconnect() {
    // NOT GATED ON THE MIC (w50). This used to return unless
    // `running` - the voice loop's flag - was true, which tied
    // the game connection to the microphone. Turn voice off
    // (or let the mic give up after eight failures), have the
    // stream drop for any ordinary network reason, turn voice
    // back on: the mic restarts, nothing restarts the stream,
    // and the opponent's moves are never announced again.
    // Listening and being connected are different things. The
    // stream is cheap, every speaking path gates on its own
    // state, and being connected while silent costs nothing -
    // whereas being disconnected while listening is the
    // failure the keep-alive exists to prevent.
    if (api.over || dryRun || !api.gameId || api.gameId === "PRACTICE") return;
    if (authGone) return;
    // AND IT BACKS OFF (w52). A flat two seconds forever is
    // fine for the case this was written for - a stream that
    // drops once and comes straight back - and wrong for a
    // network that is simply gone, where it becomes a request
    // every two seconds for as long as the page is open,
    // draining a battery the owner is not looking at. Doubling
    // to a thirty-second ceiling keeps the first few retries
    // as quick as they ever were, which is the case that
    // actually matters.
    streamFails++;
    var wait = Math.min(2000 * Math.pow(2, streamFails - 1), 30000);
    log("NET", "reconnecting in " + (wait / 1000) + "s (try " + streamFails + ")");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(startStream, wait);
  }

  /* ---- polling fallback (if fetch streaming is unavailable) ----
   *
   * THIS PATH HAD NEVER SEEN A REAL GAME (w52). It exists for a
   * browser that cannot hold a streaming body open, which the
   * tested device can, so nothing here was ever exercised by
   * playing - and it showed. It reported the wrong player's
   * clock, it never noticed a game ending, and one bad move
   * put it in a reload loop until the next move arrived. The
   * review offered deleting it instead; the owner chose to
   * repair it, on the header's own rule that the page is
   * opened by whoever finds it, on whatever they own.
   *
   * WHAT THIS ENDPOINT CAN AND CANNOT SAY. /api/account/playing
   * is a list of the account's ONGOING games, so it carries
   * neither a status nor a result nor the opponent's clock, and
   * its `secondsLeft` is the account holder's. Everything below
   * is written to that limit rather than around it: what cannot
   * be known is left null and spoken as "unknown", and the end
   * of a game is inferred from the game leaving the list.
   */

  var pollTimer = null;
  var pollSeen = false;      // has this game ever appeared in the list?

  function startPolling() {
    log("NET", "falling back to polling /api/account/playing");
    clearInterval(pollTimer);
    pollSeen = false;
    pollTimer = setInterval(pollOnce, 1500);
    pollOnce();
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function pollOnce() {
    if (!running || api.over || dryRun) return;
    apiGet("/api/account/playing?nb=10").then(function (d) {
      var g = (d.nowPlaying || []).filter(function (x) {
        return x.gameId === api.gameId || (x.fullId || "").indexOf(api.gameId) === 0;
      })[0];
      if (!g) {
        /* THE GAME LEFT THE LIST OF ONGOING GAMES, so it is
         * over - and this used to `return` here, silently,
         * every 1.5 seconds, forever. In poll mode the game
         * simply ended and the page never said so: no result,
         * no "game over", no end to the polling. The account
         * event stream cannot rescue it either, because a
         * browser with no streaming body fails watchEvents for
         * exactly the same reason it fell back to polling.
         *
         * The endpoint gives no status, so the result cannot be
         * named and the sentence says so rather than guessing.
         * pollSeen guards the first tick, where the game may
         * not have appeared yet. */
        if (pollSeen && !api.over) {
          api.over = true;
          stopPolling();
          clearDialogue();
          log("API", "game gone from nowPlaying - treating it as over");
          speak("game over. check lichess for the result.");
          uiGameChanged();
        }
        return;
      }
      pollSeen = true;
      if (!api.myColor) {
        api.myColor = g.color === "white" ? "w" : "b";
        api.pos = new RULES.Position();
        speak((everConnected ? "reconnected" : "connected") +
              ". You are " + g.color + ".");
        everConnected = true;
      }
      /* poll gives fen + lastMove only; replay lastMove onto our
       * position */
      if (g.lastMove && api.moves[api.moves.length - 1] !== g.lastMove) {
        var res = api.pos.applyUci(g.lastMove);
        if (res) {
          api.moves.push(g.lastMove);
          api.lastSan = res.san;
          if (res.move.color === "w") api.lastSanW = res.san;
          else api.lastSanB = res.san;
          if (res.move.color !== api.myColor && speakOpponentNow()) {
            speak(sanToSpeech(res.san) + ".", colorWord(res.move.color));
          }
          /* the stream's rule, kept identical here (v134) */
          if (res.move.color === api.myColor)
            readBackMine(res.san, g.lastMove, true);
          log("MOV", "poll " + g.lastMove + " = " + res.san);
        } else {
          /* RELOAD, THEN REMEMBER THAT WE DID. The reload alone
           * left api.moves untouched, so the very next tick
           * compared the same stale tail against the same
           * lastMove, failed to apply it again - it is already
           * inside the fen we just loaded - and reloaded once
           * more, every 1.5 seconds until a new move arrived.
           * The uci is pushed so the comparison moves on and
           * the ply guards keep counting; the list is a
           * position marker in poll mode, not a game record.
           *
           * The castling field is a FABRICATION and is the one
           * thing here that cannot be got right: rights depend
           * on history this endpoint does not send. KQkq is the
           * permissive choice on purpose - if it grants a
           * castle that is no longer legal, the move is offered,
           * said, and REFUSED BY LICHESS out loud, which the
           * user hears and can act on. The strict choice would
           * silently refuse a castle that is perfectly legal,
           * with nothing to explain it. */
          log("ERR", "poll desync on " + g.lastMove +
              "; reloading from fen (castling rights are a guess)");
          api.pos.load(g.fen + " " + (g.isMyTurn
            ? (api.myColor === "w" ? "w" : "b")
            : (api.myColor === "w" ? "b" : "w")) + " KQkq - 0 1");
          api.moves.push(g.lastMove);
          armedUci = null;          /* it named the old position */
        }
      }
      /* secondsLeft IS THE ACCOUNT HOLDER'S CLOCK, not white's.
       * This assigned it to api.wtime whatever colour we were,
       * so playing black you were shown the opponent's time as
       * your own - and api.btime was never set at all, so the
       * other side read "--" on the overlay and "unknown" when
       * you asked. Half of that is unavoidable: the endpoint
       * does not carry the opponent's clock. Putting our own on
       * the right side is not. */
      if (g.secondsLeft != null) {
        if (api.myColor === "w") api.wtime = g.secondsLeft * 1000;
        else api.btime = g.secondsLeft * 1000;
        api.clockAt = Date.now();
      }
    }).catch(function (e) { log("ERR", "poll: " + e.message); });
  }

  // The userscript read the game id from the lichess.org
  // URL. There is no such URL here, so the account's event
  // stream is watched instead: a gameStart event joins the
  // game whether it began from this page's seek/challenge
  // buttons, the Lichess app, or a friend's challenge.
  var eventAbort = null;
  var eventTimer = null;

  function watchEvents() {
    if (!storedToken()) return;
    try { if (eventAbort) eventAbort.abort(); } catch (e) {}
    eventAbort = (typeof AbortController !== "undefined")
      ? new AbortController() : null;
    var opts = { headers: authHeaders() };
    if (eventAbort) opts.signal = eventAbort.signal;
    log("NET", "opening the account event stream");
    fetch(LICHESS_BASE + "/api/stream/event", opts)
      .then(function (r) {
        if (!r.ok) throw new Error("event stream HTTP " + r.status);
        eventFails = 0;           /* it opened: the ladder resets */
        if (!r.body || !r.body.getReader) {
          throw new Error("no streaming body");
        }
        var reader = r.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) {
              log("NET", "event stream ended");
              scheduleEventReconnect();
              return;
            }
            buf += dec.decode(res.value, { stream: true });
            var lines = buf.split("\n");
            buf = lines.pop();
            lines.forEach(function (ln) {
              if (!ln.trim()) return;
              var ev;
              try { ev = JSON.parse(ln); } catch (e) { return; }
              handleAccountEvent(ev);
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (e) {
        if (String(e.name) === "AbortError") return;
        log("ERR", "event stream: " + e.message);
        if (!noteAuthFailure(e)) scheduleEventReconnect();
      });
  }

  var eventFails = 0;
  function scheduleEventReconnect() {
    if (!storedToken() || authGone) return;
    /* same ladder as the game stream, same reason (w52) */
    eventFails++;
    var wait = Math.min(3000 * Math.pow(2, eventFails - 1), 30000);
    clearTimeout(eventTimer);
    eventTimer = setTimeout(watchEvents, wait);
  }

  function handleAccountEvent(ev) {
    if (ev.type === "gameStart" && ev.game && ev.game.id) {
      log("EVT", "gameStart " + ev.game.id);
      cancelSeek();
      // A REAL GAME OUTRANKS PRACTICE, AND SAYS SO (w50).
      // dryStart now closes this stream and cancels any seek,
      // so reaching here in practice means an event that was
      // already in flight, or an account reconnect after
      // practice began. Rare - and the old behaviour was to
      // join anyway with dryRun still true, which suppressed
      // every announcement the join would have made. A live
      // clock and no voice is the worst state this program
      // has, so practice loses, out loud. The mic is left as
      // it was: the user was speaking moves a moment ago and
      // is about to need to again.
      if (dryRun) {
        log("DRY", "real game " + ev.game.id + " started - leaving practice");
        dryRun = false;
        speak("a real game has started. leaving practice.");
        renderButton();
      }
      joinGame(ev.game.id);
    } else if (ev.type === "gameFinish") {
      log("EVT", "gameFinish");
      uiGameChanged();
    } else if (ev.type === "challengeDeclined" && ev.challenge) {
      var why = ev.challenge.declineReason || "declined";
      log("EVT", "challenge declined: " + why);
      uiStatus("Challenge declined - " + why);
      speak("challenge declined.");
    } else if (ev.type === "challengeCanceled") {
      log("EVT", "challenge cancelled");
      uiStatus("Challenge cancelled.");
    } else if (ev.type === "challenge" && ev.challenge &&
               ev.challenge.challenger &&
               (ev.challenge.challenger.id || "").toLowerCase()
                 !== (api.myId || "")) {
      log("EVT", "incoming challenge from " +
          (ev.challenge.challenger.name || "?"));
      uiStatus("Challenge from " +
          (ev.challenge.challenger.name || "someone") +
          " - accept it on Lichess or with the app.");
    }
  }

  function joinGame(gameId) {
    if (api.gameId === gameId && !api.over) return;
    api.gameId = gameId;
    api.myColor = null;
    api.pos = null;
    api.moves = [];
    api.over = false;
    offerState = { draw: false, takeback: false };
    // and the questions from whatever game came before this
    // one. api.moves going empty makes every ply guard read
    // "current" again, so the two ply-guarded asks would
    // survive into the new game rather than expire; the two
    // yes/no states never expired at all. See clearDialogue.
    clearDialogue();
    (api.myId ? Promise.resolve(api.myId) : fetchMyId())
      .then(startStream)
      .catch(function (e) {
        log("ERR", "join: " + e.message);
        speak("could not connect. check the log.");
      });
  }

  // Sign-in complete: learn who we are, watch for games,
  // and pick up a game already in progress if there is one.
  function connectAccount() {
    if (!storedToken()) return;
    fetchMyId().then(function () {
      // the account button carries the name (w10); this
      // line says only what is happening
      uiStatus("Waiting for a game.");
      // the account row shows the username and switches
      // the sign-in button's label, so it must repaint
      // once the name is known — without this the panel
      // still read "Sign in with Lichess" while connected
      renderAccount();
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
    });
  }

  /* ---- seek and challenge (from BoardEye) ---- */

  var seekAbort = null;

  function startSeek(minutes, increment, rated) {
    if (!storedToken() || seekAbort) return;
    minutes = Math.max(1, Number(minutes) || 15);
    increment = Math.max(0, Number(increment) || 0);
    var body = "rated=" + (rated ? "true" : "false") +
      "&time=" + minutes + "&increment=" + increment +
      "&variant=standard";
    // GUARDED LIKE EVERY OTHER AbortController HERE (w52).
    // startStream and watchEvents both test for it; this one
    // assumed it, which would throw on the very browsers the
    // polling fallback exists for - and the throw landed in
    // the catch below as "Seek failed", blaming the seek for a
    // missing browser feature.
    seekAbort = (typeof AbortController !== "undefined")
      ? new AbortController() : null;
    uiStatus("Seeking " + minutes + "+" + increment +
      (rated ? " rated" : " casual") + "...");
    log("API", "seek " + body);
    var seekOpts = {
      method: "POST",
      headers: {
        Authorization: "Bearer " + storedToken(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body
    };
    if (seekAbort) seekOpts.signal = seekAbort.signal;
    fetch(LICHESS_BASE + "/api/board/seek", seekOpts).then(function (r) {
      if (!r.ok) {
        seekAbort = null;
        log("ERR", "seek refused (HTTP " + r.status + ")");
        uiStatus("Seek refused (HTTP " + r.status + ").");
        return;
      }
      // The seek lives as long as this request streams - where
      // there IS a stream. Without one the seek is still
      // LODGED (Lichess has the POST); we simply cannot hold it
      // open or watch it, so say what is true rather than
      // throwing on r.body and reporting "Seek failed" for a
      // seek that is sitting in the pool right now. The game
      // arrives on the event stream either way.
      if (!r.body || !r.body.getReader) {
        seekAbort = null;
        log("NET", "seek posted, but this browser cannot hold it open");
        uiStatus("Seek sent. Waiting for a game.");
        uiGameChanged();
        return;
      }
      var reader = r.body.getReader();
      function drain() {
        return reader.read().then(function (c) {
          if (!c.done) return drain();
        });
      }
      return drain().then(function () {
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
    try { seekAbort.abort(); } catch (e) {}
    seekAbort = null;
    uiStatus("Seek cancelled.");
  }

  function sendChallenge(who, minutes, increment, rated, color) {
    if (!storedToken() || api.gameId && !api.over) return;
    who = (who || "").trim();
    if (!who) { uiStatus("Name an opponent."); return; }
    minutes = Math.max(1, Number(minutes) || 15);
    increment = Math.max(0, Number(increment) || 0);
    var body = "rated=" + (rated ? "true" : "false") +
      "&clock.limit=" + (minutes * 60) +
      "&clock.increment=" + increment +
      "&color=" + (color || "random") +
      "&variant=standard";
    uiStatus("Challenging " + who + "...");
    log("API", "challenge " + who + " " + body);
    fetch(LICHESS_BASE + "/api/challenge/" + encodeURIComponent(who), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + storedToken(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; })
          .then(function (j) {
            log("ERR", "challenge refused (HTTP " + r.status +
                (j.error ? ": " + j.error : "") + ")");
            uiStatus("Challenge refused" +
                (j.error ? " - " + j.error : "") + ".");
          });
      }
      uiStatus("Challenge sent to " + who + " - waiting.");
    }).catch(function (e) {
      log("ERR", "challenge: " + e.message);
      uiStatus("Challenge failed (" + e.message + ").");
    });
  }

  // Everything that holds a connection, stopped in one place.
  // ONLY signOut CALLS THIS, and that is deliberate: voice off
  // deliberately tears down no network (web delta 2 in ui.js -
  // sign-in owns the connection, the button owns the voice),
  // and w50 leaned on that when it stopped gating the
  // reconnect on the mic. The comment here used to claim the
  // voice-off path used it too, which would have made those
  // two decisions contradict each other; it never did (w54).
  function stopEverything() {
    try { if (eventAbort) eventAbort.abort(); } catch (e) {}
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    cancelSeek();
    clearTimeout(eventTimer);
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
  }


  // Leaving practice mode: the account stream only announces
  // NEW games, so a game that was already running when
  // practice took over the api state is picked up again the
  // same way connectAccount does at sign-in.
  function rejoinCurrent() {
    if (!storedToken()) return;
    apiGet("/api/account/playing?nb=1").then(function (d) {
      var g = (d.nowPlaying || [])[0];
      if (g && g.gameId) {
        log("API", "rejoining " + g.gameId);
        joinGame(g.gameId);
      } else {
        uiStatus("Waiting for a game.");
      }
    }).catch(function (e) { log("ERR", "rejoin: " + e.message); });
  }

