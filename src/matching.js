  /*=========================== MATCHING ===========================*/

  /* WHAT THIS FILE IS, since w118: the one step between "some
   * readings arrived" and "exactly one legal move, or nothing".
   * The old matching layer was the program's largest room -
   * constraint sets, scored candidates, rival-reading tiers,
   * the bare-pawn guard - because the old grammar let a
   * sentence UNDERDESCRIBE a move and legality had to finish
   * the job. The four-item grammar (parsing.js) says the whole
   * move or says nothing, so all that is left to do here is:
   * read every rival transcript, keep the readings that reduce
   * to a clean four-item move, check them against the legal
   * moves, and insist the survivors AGREE.
   *
   * RIVAL READINGS may still rescue a move - Safari's first
   * guess writes "echo four" as "go for" while its third gets
   * it right, and the third is as much the user's utterance as
   * the first (w49's rule was that a rival may only ASK, never
   * play; what made rivals dangerous then was inference, and
   * there is none left - a rival that yields a complete legal
   * four-item move heard the same mouth say the same squares).
   * But if two readings yield two DIFFERENT legal moves, the
   * mic is guessing, and the answer is the caller's "Say
   * again." - never a pick between them.
   */

  function dedupeTranscripts(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (t) {
      if (!String(t).trim()) return;
      // the dedupe key follows the parser's rules, so two
      // spellings of the same items count as one reading
      var r = readItems(t);
      var key = r.items.map(function (s) { return s.t + s.v; }).join("|") +
                "|" + (r.promo || "") + "|" + (r.unknown ? "?" : "");
      if (seen[key]) return;
      seen[key] = true;
      out.push(t);
    });
    return out;
  }

  /* Every distinct legal move the readings produce, as
   * {m, san, uci} - the caller plays a lone survivor and
   * refuses a crowd. The promotion default is applied here,
   * where legality is known: a four-item move that lands a
   * pawn on the last rank is a QUEEN promotion unless the
   * utterance named another piece (owner's rule, w118 -
   * "equals knight" is the one surviving piece phrase).
   */
  function collectMoves(pos, transcripts) {
    var legal = pos.legalMoves();
    var byUci = {};
    legal.forEach(function (m) { byUci[pos.uciOf(m)] = m; });
    var seen = {}, out = [];
    transcripts.forEach(function (raw, ti) {
      var pm = parseMove(raw);
      if (!pm) return;
      var uci = pm.uci;
      // a promoting move's UCI carries its piece letter; the
      // bare four items name the queen, a spoken piece names
      // itself. Nothing else is tried: e7e8 with "equals
      // knight" is e7e8n or it is nothing - and a promotion
      // word next to a move that does not promote is a
      // mishearing, not a move.
      if (byUci[uci + (pm.promo || "q")]) uci = uci + (pm.promo || "q");
      else if (pm.promo) return;
      var m = byUci[uci];
      if (!m) return;
      if (seen[uci]) return;
      seen[uci] = true;
      if (ti > 0) log("PRS", "move came from reading " + ti);
      out.push({ m: m, san: pos.sanOf(m, legal), uci: uci });
    });
    return out;
  }
