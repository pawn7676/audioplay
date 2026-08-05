  /*==================== 11. LICHESS BOARD API =====================*/

  var RULES = makeRules();

  var api = {
    gameId: null,
    myId: null,
    myColor: null,
    pos: null,
    moves: [],            // uci list already applied
    lastSan: "", lastSanW: "", lastSanB: "",
    wtime: null, btime: null,
    over: false,
    mode: "none"          // "stream" | "poll"
  };

  // The token is kept ONLY in the Userscripts app's own
  // storage. Not in localStorage, which belongs to the site
  // and can be read by anything running on lichess.org,
  // including other extensions.
  //
  // The Safari Userscripts app provides the PROMISE form,
  // GM.setValue, and deliberately never implemented the old
  // synchronous GM_setValue. So the stored value is read
  // once at startup and held in memory, which keeps the
  // rest of the script synchronous.
  var cachedToken = null;

  function gmAvailable() {
    return typeof GM !== "undefined" && GM &&
           typeof GM.setValue === "function" &&
           typeof GM.getValue === "function";
  }

  function loadStoredToken() {
    if (!gmAvailable()) {
      log("ERR", "no extension storage: GM.setValue missing");
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(GM.getValue(TOKEN_KEY, "")).then(function (v) {
        cachedToken = v || null;
        log("API", cachedToken
          ? "token loaded from extension storage"
          : "no token stored yet");
        return cachedToken;
      }).catch(function (e) {
        log("ERR", "could not read token: " + e);
        return null;
      });
    } catch (e) {
      log("ERR", "could not read token: " + e.message);
      return Promise.resolve(null);
    }
  }

  function storedToken() {
    return TOKEN || cachedToken || null;
  }

  function saveToken(t) {
    if (!gmAvailable()) return Promise.resolve(false);
    try {
      return Promise.resolve(GM.setValue(TOKEN_KEY, t)).then(function () {
        cachedToken = t;
        log("API", "token saved in extension storage");
        return true;
      }).catch(function (e) {
        log("ERR", "could not save token: " + e);
        return false;
      });
    } catch (e) {
      log("ERR", "could not save token: " + e.message);
      return Promise.resolve(false);
    }
  }

  function clearToken() {
    cachedToken = null;
    api.myId = null;
    if (!gmAvailable()) return Promise.resolve(false);
    try {
      var p = (typeof GM.deleteValue === "function")
        ? GM.deleteValue(TOKEN_KEY)
        : GM.setValue(TOKEN_KEY, "");
      return Promise.resolve(p).then(function () {
        log("API", "token cleared from this device");
        return true;
      }).catch(function (e) {
        log("ERR", "could not clear token: " + e);
        return false;
      });
    } catch (e) { return Promise.resolve(false); }
  }

  // Asked for once. Kept only by the Userscripts app on this
  // device. Never sent anywhere except to Lichess itself in
  // the Authorization header. Resolves with the token, or
  // null if there is nowhere to keep it or none was given.
  // A confirm box only has two buttons, so checking what was
  // stored meant either replacing it or deleting it, with no
  // way out. A prompt has three outcomes: type something to
  // replace, type CLEAR to delete, or Cancel to leave it be.
  function manageToken() {
    var have = storedToken();
    if (!have) { ensureToken(); return; }
    var tail = have.length > 4 ? have.slice(-4) : have;
    var t = null;
    try {
      t = window.prompt(
        "A token ending " + tail + " is saved.\n\n" +
        "Paste a new token to replace it,\n" +
        "type CLEAR to delete it,\n" +
        "or press Cancel to leave it alone.", "");
    } catch (e) { return; }
    if (t === null) { log("API", "token left unchanged"); return; }
    t = t.replace(/\s+/g, "");
    if (!t) { log("API", "token left unchanged"); return; }
    if (/^clear$/i.test(t)) { clearToken(); return; }
    saveToken(t);
  }

  function ensureToken() {
    var have = storedToken();
    if (have) return Promise.resolve(have);
    if (!gmAvailable()) {
      log("ERR", "not asking for a token: nowhere safe to put it");
      try {
        window.alert("This script cannot store your token.\n\n" +
          "The Userscripts app is not providing GM.setValue. " +
          "Check the @grant lines at the top of the file.");
      } catch (e) {}
      return Promise.resolve(null);
    }
    var t = null;
    try {
      t = window.prompt(
        "Lichess API token (needs the board:play scope).\n\n" +
        "Create one at lichess.org/account/oauth/token/create\n\n" +
        "It is stored on this iPad only.");
    } catch (e) {}
    if (!t) return Promise.resolve(null);
    t = t.replace(/\s+/g, "");
    if (!t) return Promise.resolve(null);
    return saveToken(t).then(function (ok) { return ok ? t : null; });
  }

  function authHeaders() {
    return { Authorization: "Bearer " + (storedToken() || "") };
  }

  function gameIdFromUrl() {
    var seg = location.pathname.split("/")[1] || "";
    if (/^[A-Za-z0-9]{8,12}$/.test(seg)) return seg.slice(0, 8);
    return null;
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
      log("API", "account = " + api.myId);
      return api.myId;
    });
  }

  function postMove(uci) {
    var url = "https://lichess.org/api/board/game/" + api.gameId + "/move/" + uci;
    log("PST", "move " + uci);
    return fetch(url, { method: "POST", headers: authHeaders() })
      .then(function (r) {
        return r.json().catch(function () { return { ok: r.ok }; })
          .then(function (j) { return { status: r.status, body: j }; });
      });
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
    if (list.length < api.moves.length) {
      /* takeback or new game: rebuild from scratch, silently */
      api.pos = new RULES.Position();
      api.moves = [];
      announce = false;
    }
    for (var i = api.moves.length; i < list.length; i++) {
      var res = api.pos.applyUci(list[i]);
      if (!res) {
        log("ERR", "illegal uci from stream: " + list[i] + " (resyncing)");
        api.pos = new RULES.Position();
        api.moves = [];
        for (var j = 0; j < list.length; j++) {
          if (!api.pos.applyUci(list[j])) { log("ERR", "resync failed at " + list[j]); break; }
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

  function checkOffers(s) {
    if (!api.myColor) return;
    var oppDraw = api.myColor === "w" ? !!s.bdraw : !!s.wdraw;
    var oppTake = api.myColor === "w" ? !!s.btakeback : !!s.wtakeback;
    if (oppDraw && !offerState.draw && !api.over) {
      confirmAction = "drawoffer";
      log("API", "opponent offers a draw");
      speak(colorWord(api.myColor === "w" ? "b" : "w") +
            " offers a draw. Say yes to accept, no to decline.");
    }
    if (oppTake && !offerState.takeback && !api.over) {
      confirmAction = "takebackoffer";
      log("API", "opponent asks for a takeback");
      speak(colorWord(api.myColor === "w" ? "b" : "w") +
            " asks to take back a move. Say yes to accept, no to decline.");
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
        speak(resultSpoken(s));
      }
      return;
    }
  }

  /* ---- streaming ---- */

  var streamAbort = null;

  function startStream() {
    if (!api.gameId || dryRun || api.gameId === "PRACTICE") return;
    api.mode = "stream";
    log("NET", "opening stream for " + api.gameId);
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    streamAbort = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var opts = { headers: authHeaders() };
    if (streamAbort) opts.signal = streamAbort.signal;

    fetch("https://lichess.org/api/board/game/stream/" + api.gameId, opts)
      .then(function (r) {
        if (!r.ok) throw new Error("stream HTTP " + r.status);
        if (!r.body || !r.body.getReader) throw new Error("no streaming body");
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
        log("ERR", "stream: " + e.message);
        if (String(e.message).indexOf("no streaming body") >= 0) startPolling();
        else scheduleReconnect();
      });
  }

  var reconnectTimer = null;
  function scheduleReconnect() {
    if (api.over || !running || dryRun) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(startStream, 2000);
  }

  /* ---- polling fallback (if fetch streaming is unavailable) ---- */

  var pollTimer = null;
  function startPolling() {
    api.mode = "poll";
    log("NET", "falling back to polling /api/account/playing");
    clearInterval(pollTimer);
    pollTimer = setInterval(pollOnce, 1500);
    pollOnce();
  }

  function pollOnce() {
    if (!running || api.over || dryRun) return;
    apiGet("/api/account/playing?nb=10").then(function (d) {
      var g = (d.nowPlaying || []).filter(function (x) {
        return x.gameId === api.gameId || (x.fullId || "").indexOf(api.gameId) === 0;
      })[0];
      if (!g) return;
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
          log("ERR", "poll desync on " + g.lastMove + "; reloading from fen");
          api.pos.load(g.fen + " " + (g.isMyTurn
            ? (api.myColor === "w" ? "w" : "b")
            : (api.myColor === "w" ? "b" : "w")) + " KQkq - 0 1");
        }
      }
      api.wtime = g.secondsLeft != null ? g.secondsLeft * 1000 : null;
    }).catch(function (e) { log("ERR", "poll: " + e.message); });
  }

  /* ---- connecting ---- */

  function connect() {
    api.gameId = gameIdFromUrl();
    api.over = false;
    if (!api.gameId) {
      speak("Open a game first.");
      log("ERR", "no game id in " + location.pathname);
      return;
    }
    ensureToken().then(function (tok) {
      if (!tok) {
        speak("No API token set.");
        log("ERR", "no token set");
        return;
      }
      connectWithToken();
    });
  }

  function connectWithToken() {
    offerState = { draw: false, takeback: false };
    (api.myId ? Promise.resolve(api.myId) : fetchMyId())
      .then(startStream)
      .catch(function (e) {
        log("ERR", "connect: " + e.message);
        speak("Could not connect. Check the log.");
      });
  }

