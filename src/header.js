/*  audioplay — eyes-free voice chess on Lichess
 *
 *  THE PAGE YOU ARE READING IS GENERATED. The source lives
 *  in src/, one file per job, joined in the order given by
 *  manifest.txt; "node build.js" reassembles this page and
 *  writes the root index.html that GitHub Pages serves.
 *  Never edit the generated file - the next build erases it.
 *
 *  The files were numbered 00..15 once - a habit from the
 *  userscript era, when this was one long scroll with
 *  numbered sections in it. Order is the manifest's job; a
 *  filename's job is to say what the file is FOR.
 */
(function () {
  "use strict";

  /*===================== THE PROJECT, FROZEN AND LIVING ===========
   *
   *  THE USERSCRIPT IS FROZEN AT v137 (owner's decision,
   *  Aug 5 2026). The website is the project now; the
   *  userscript stays installed as a working fallback and
   *  its sources stay in the tree, unmaintained.
   *
   *  us-header.js IS HISTORY NOW, NOT AUTHORITY. It
   *  used to be binding reading - its constraints, platform
   *  findings and closed cases did not freeze with the code
   *  they were learned in, so this file pointed at it and
   *  every new contributor had to read a frozen document to
   *  learn the live rules. That arrangement broke twice
   *  over, in ways that are worth recording because they
   *  are what a demotion is FOR:
   *
   *    - it describes a layout that no longer exists. Its
   *      seventeen "section N" references went stale the
   *      morning the numbered filenames went away, and
   *      nothing there can be corrected without making the
   *      frozen userscript's own header describe a file it
   *      never had.
   *    - one section was actively WRONG for this repo. Its
   *      testing note says "there is no stored test suite,
   *      each session rebuilds them and throws them away,
   *      do not ask the user to update tests". That was
   *      true of the userscript. Here it would talk a
   *      reader out of the harness, the property check and
   *      the perft that guard every push.
   *
   *  So everything still binding was moved into the live
   *  files - the constraints and the closed cases
   *  below, the platform findings below that, the spoken
   *  grammar into parsing.js beside the parser that
   *  implements it. What is left there is the v-series
   *  history and the userscript's own setup notes, which
   *  are true of the artifact and only of the artifact.
   *  READ IT FOR WHY SOMETHING HAPPENED, never for what to
   *  do now. THIS FILE is the header of record.
   *
   *  What the freeze changes day to day: the pipeline files
   *  in src/ serve ONLY the website and may evolve freely;
   *  the w-series is the only version line; the harness
   *  guards the frozen v137 ARTIFACT
   *  (userscript-frozen.sha256), not its buildability.
   *================================================================*/

  /*=================== HARD CONSTRAINTS ===========================
   *  Restated for the website, from us-header. Two
   *  of the five were userscript-only and are gone with it:
   *  @name/GM-storage identity, and "one file" - the answer
   *  to size here is one file per job and a manifest.
   *
   *  1. FAIR PLAY. rules.js is a legal-move generator and
   *     nothing else: no evaluation, no search, no opening
   *     book, no move recommendation. Lichess bans analysis
   *     assistance and would ban the owner for it. It is
   *     called RULES, and it may only answer which moves are
   *     LEGAL and what they are CALLED.
   *
   *     AND THE USUAL WORD FOR A PROGRAM THAT CHOOSES MOVES
   *     APPEARS NOWHERE IN THIS CODEBASE - not in the code,
   *     not in a comment, not in a log line. This rule is as
   *     old as the project and it DRIFTED (w67): it was
   *     restated here using the word, which made it
   *     unenforceable, and the word then reappeared in the
   *     speech layer, where it meant the iOS SYNTHESIZER and
   *     nothing else. Harmless in itself - and it printed,
   *     "resetting the ___", into the log this project asks
   *     users to paste when something goes wrong. The reader
   *     of a pasted log has no way to tell which sense was
   *     meant, and the one they would assume is the one that
   *     gets the owner banned. Say synthesizer, or speech
   *     synthesis, or the voice. The harness now greps
   *     everything that ships and fails on a single hit,
   *     which is why this paragraph does not name the word
   *     either.
   *
   *  2. NO DOM SCRAPING. Everything comes from the Lichess
   *     Board API. An earlier version scraped the move list
   *     from the page and broke every time Lichess changed
   *     its markup. The website has no lichess.org page to
   *     scrape at all, so even the userscript's one
   *     surviving DOM dependency - detecting a game page -
   *     is gone: the game arrives on the account event
   *     stream.
   *
   *  3. NO EXTERNAL LIBRARIES, and no build-time
   *     dependencies. The move generator is embedded, about
   *     350 lines. A CDN @require was tried and removed
   *     under Lichess's Content Security Policy; the reason
   *     is different here and the rule is the same, because
   *     a page that fetches nothing cannot be broken by
   *     something else changing.
   *
   *  4. NEVER EXPOSE OR LOG A TOKEN. There is a token even
   *     though nobody types one: PKCE sign-in gets it,
   *     localStorage on this origin keeps it, and every
   *     move carries it. The log lines say "token loaded
   *     from this browser" and never the value, because the
   *     log panel is made to be copied out. It lives inside
   *     the closure so nothing on the page can name it -
   *     which is why the program is one script and not
   *     eighteen.
   *================================================================*/

  /*==================== THE WEBSITE, AT w20 =======================
   *
   *  WHAT THIS IS. Eyes-free voice chess on Lichess, as a
   *  plain website: open the page, tap "Sign in with
   *  Lichess", approve once, play by speaking moves. Static
   *  files on GitHub Pages; OAuth PKCE runs in the browser;
   *  no server exists anywhere in this project.
   *
   *  WHERE THE CODE COMES FROM. w20 is a REBUILD. The first
   *  site (w1-w19) was ported from userscript v104 and then
   *  fell behind while the userscript ran on to v134. Rather
   *  than merge, w20 cuts the v134 userscript into one file
   *  per job — settings, log, vocabulary, parsing, matching,
   *  dialogue, speech-out, chimes, mic, keepalive (removed
   *  at w90 — see the closed cases), rules,
   *  clock — and wraps this page's own shell around them:
   *  lichess.js (PKCE sign-in and the account event
   *  stream), ui.js (the page), boot.js. The w19 site
   *  survives as reference/ — its PKCE
   *  flow, page furniture and remembered-panels code were
   *  salvaged into the web files, each block keeping its
   *  w-history. Its modes.js was NOT carried: silent mode
   *  was deleted from canon at v109, and clock mode now
   *  ships as its own file, clock.js.
   *
   *  REASONING LIVES NEXT TO THE CODE IT EXPLAINS: the
   *  constraints and closed cases in this file, the spoken
   *  grammar in parsing.js, everything else in the header
   *  of whatever file owns it. Read this one, then read the
   *  header of the file you are about to touch.
   *
   *  WHO THIS IS FOR. The owner plays without reading
   *  glasses at a real board, standing, iPad across the
   *  room - that is why anything that must be acted on is
   *  SPOKEN. But the page is opened by whoever finds it, on
   *  whatever they own: no code may assume an iPad, Safari,
   *  or a US English voice. Platform findings are handled
   *  as conditions to detect, never as the shape of the
   *  world.
   *
   *  VERSIONS. The website counts w1, w2, ... so no number
   *  ever collides with the userscript's v-series in a log
   *  dump. Bump for any behavioural change, revert freely.
   *  VERSION itself is assigned in lichess.js.
   *
   *  THE HISTORY IS IN HISTORY.md at the repo root - w1 to
   *  w39 and everything after it. It lived here until it
   *  was half this file, which left a reader scrolling
   *  past a changelog to reach the constraints above that
   *  they needed first. Read it before a bump: an entry
   *  says WHY, and several are a mistake and the rule it
   *  earned (w18, w28, w31, w37). Reasoning that belongs
   *  to a piece of code did NOT move - it stays in that
   *  file's own header, next to what it explains.
   *================================================================*/

  /*  THE THREE BLOCKS BELOW COME FROM us-header.js with
   *  their wording intact. They were written from real
   *  games and real losses, and paraphrasing them would
   *  quietly edit the record.
   *
   *  ONE THING WAS CHANGED: their "section N" pointers now
   *  name the files they mean. A lookup table further up
   *  the page was the first attempt and it is not good
   *  enough - leaving six dead references inside the LIVE
   *  header would reproduce, in the file that replaced it,
   *  exactly the hazard that made us-header stop being
   *  authority in the first place. A pointer that needs
   *  translating is a pointer nobody follows.
   *
   *  These are conditions to DETECT, never the shape of the
   *  world: the page is opened by whoever finds it, on
   *  whatever they own.
   */

  /*================ PLATFORM: iPad, Safari, iOS ===================
   * Findings from real games, each of which cost time to
   * discover. Stated as behaviour, then its consequence
   * here. Do not "fix" the code these produced without
   * reproducing the behaviour first.
   *
   * - iPadOS ECHO-CANCELS OUR OWN TTS out of the mic while
   *   speech recognition is active: at maximum speaker
   *   volume the recogniser delivers no transcript of
   *   anything we say, tested both gated and ungated
   *   (v132, two logged practice sessions). The whole
   *   self-hearing defense of v122-v123 guarded a failure
   *   AEC already prevents, and was deleted at v132. The
   *   signal that this finding has expired: a move playing
   *   unbidden immediately after a spoken question.
   *
   * - iOS SUSPENDS AudioContext with the screen off, and
   *   silently DISCARDS <audio> output while the mic is
   *   open. Chimes died to this over three versions (see
   *   the chimes.js tombstone). Only TTS speech is reliably
   *   audible, so any confirmation or alert MUST be spoken.
   *   (v80-v108 could also show it on screen in silent
   *   mode; that screen was deleted at v109.)
   *   (Amended w108: the finding's two halves aged apart.
   *   The <audio> half stands in full - re-proven at
   *   w88-w90, session declared and all. The AudioContext
   *   half lost its stage when w90 removed screen-off play,
   *   and one WebAudio chime is ON TRIAL in the narrowest
   *   spot - see the reopened sound case below and
   *   chimes.js.)
   * - A PLAYING media element keeps the tab alive. The
   *   silent looping WAV in keepalive.js holds the iOS audio
   *   session; without it the page suspends with the screen
   *   off. It is NOT a chime and must not be removed with
   *   them. (The finding stands; the WAV does not. iPadOS
   *   began evicting the element itself in Aug 2026 and the
   *   keep-alive was REMOVED at w90 — the closed case below
   *   is the story. The consequence written here is now
   *   simply accepted: the page suspends with the screen
   *   off.)
   * - A STOPPED RECOGNISER CANNOT RESTART with the screen
   *   off: it returns "not-allowed" and stays dead for the
   *   rest of the game. MIC_ALWAYS_ON = true is required,
   *   not a preference.
   * - STARTING/STOPPING THE RECOGNISER plays iOS dictation
   *   tones. Also solved by MIC_ALWAYS_ON.
   * - THE FIRST UTTERANCE after the audio route comes up is
   *   swallowed outright. A silent primer utterance absorbs
   *   it (primeAudioRoute, in speech-out.js).
   * - onend FIRES WHILE AUDIO IS STILL PLAYING, so speech
   *   gaps poll speechSynthesis.speaking before timing the
   *   pause (waitUntilQuiet).
   * - SAFARI CLIPS THE FIRST WORD of an utterance. Readings
   *   missing a leading piece name are demoted, never
   *   deleted (clippedIndexes, in matching.js). The same clipping
   *   sank bare "none" as a list answer in the deleted
   *   silent mode: clipped, it became "one". Any future
   *   answer vocabulary must be chosen by phonetic
   *   distance from what it can play.
   * - data: URIs WERE REJECTED for audio; Blob URLs work.
   * - FULLSCREEN EXIT CORRUPTS THE LAYOUT VIEWPORT until
   *   Safari is force-quit. Closed case, three failed
   *   repairs; see the guard comments in ui.js and
   *   clock.js.
   *================================================================*/


  /*================== BLUETOOTH IS A DIFFERENT ROUTE ==============
   * Measured, not theorised: the opening announcement lost
   * its first word and everything was painfully loud on
   * BLUETOOTH HEADPHONES, and both went away entirely on
   * the iPad's own speaker, same build, minutes apart. iOS
   * switches a Bluetooth device to its hands-free profile
   * when the microphone opens, and that switch costs both
   * a moment of audio and a level change the page has no
   * say in. Nothing here can fix it: output volume is the
   * system's, and utterance.volume is unreliable on iOS.
   *
   * What this means in practice: SPEAKER PLAY IS THE TESTED
   * CONFIGURATION. If headphones are used, expect the
   * first word of an announcement to suffer. Do not chase
   * a clipping report without asking what the audio was
   * coming out of first.
   *================================================================*/


  /*=================== CLOSED CASES / TOMBSTONES ==================
   * Things that were BUILT and REMOVED. They leave no code
   * to hang a comment on, which is exactly why they are
   * recorded here: each has been re-proposed at least once,
   * and each would cost days to re-disprove.
   *
   * SOUND IS SETTLED — do not propose it again. The whole
   * arc: WebAudio chimes (died with the screen off) ->
   * WAV-in-<audio> chimes (silently eaten by iOS with the
   * mic open; game4 logged SFX ok on all 39 moves with zero
   * errors while four were inaudible, and neither a delay
   * nor a doubled length helped) -> a spoken "ok." (never
   * lost, but forty a game was hated) -> driving Lichess's
   * OWN move sounds (built and reverted the same day: they
   * are WebAudio too) -> the full spoken read-back of each
   * accepted move, which is what READ_BACK_MY_MOVE does
   * today. Confirmation on this platform must be speech,
   * and flat repeated speech grates: it must carry
   * information to earn its airtime. chimes.js is the
   * detailed tombstone.
   *
   * REOPENED AT w108, ON ONE SQUARE INCH (owner's decision,
   * 9 Aug 2026), with the new evidence the tombstone
   * demanded. The arc above condemned three mechanisms, and
   * time treated them differently: the <audio> route is
   * deader than ever (w88-w90 watched iPadOS evict a media
   * element with the mic live and the session declared),
   * but the WebAudio route was condemned for dying with the
   * screen off - and w90 deleted screen-off play itself, so
   * that verdict lost its grounds. What returned is ONE
   * WebAudio chime in the one spot with an audibility
   * argument: confirming a move the user just heard read
   * aloud as a question and answered "yes" - the route
   * carried the question seconds earlier and the yes proves
   * it was heard, and the read-back there repeated what the
   * user had just approved, failing this arc's own airtime
   * rule. Everything else stands: media elements never
   * again, no chime on unconfirmed moves (that read-back
   * still carries real information), and a spoken "okay."
   * whenever the chime cannot be scheduled. (w108 also
   * shipped a chimeConfirmed panel toggle as a rollback;
   * w109 removed it on the owner's order - behaviour, not
   * a choice, and panel rows are not free.) What no
   * code can prove is audibility itself - that is game4's
   * permanent lesson - so the trial is judged by ear, and
   * an inaudible chime here degrades to the user re-saying
   * the move, which speaks either way: a loud failure, not
   * the silent kind that killed v67.
   *
   * FULLSCREEN-EXIT CORRUPTION — SOLVED AT v108 BY NOT
   * GOING FULLSCREEN. After any element fullscreen EXIT the
   * layout viewport stayed offset until Safari was
   * force-quit, and pull-down overscroll then left the button
   * row displaced. THREE in-page repairs were built and all
   * removed: v75 re-composited the row (no effect — the
   * layout viewport itself is what shifts), v76 pinned it
   * to visualViewport on every scroll (the buttons visibly
   * jumped during normal scrolling: worse than the bug),
   * and v79 tried scroll-home plus a forced root reflow at
   * the exit (no effect on device, deleted the same day).
   * This block then recorded a one-line out — stop calling
   * the enter-fullscreen helpers — and v108 took it, after
   * the same fix worked on the website build. The four
   * helpers are DELETED, not disabled.
   *
   * WHY IT WORKS: the corruption is caused by the EXIT, and
   * there is no longer an exit. The overlays run under
   * Safari's toolbar instead, which costs the toolbar's
   * strip of screen and nothing else. CLOCK_BARE_MAX_VH
   * dropped from 80 to 62 to suit; see its note.
   *
   * DO NOT REINSTATE fullscreen, and do not attempt another
   * in-page repair, without a fundamentally different
   * theory.
   *
   * THE KEEP-ALIVE IS GONE, AND SCREEN-OFF PLAY WITH IT
   * (w90, owner's decision, 8 Aug 2026). The paragraph that
   * stood here said the keep-alive stays as the fallback
   * layer, and for a year it was right. Then iPadOS started
   * EVICTING the silent holder element whenever the mic and
   * the synthesizer were live — pause, refused play, abort,
   * pause — and the page spent whole games inside the
   * refused state with taps and buttons lagging five to ten
   * seconds. Three rounds were spent on it and each is a
   * lesson against re-proposing its shape: w88 backed the
   * retry off (politeness did not stop the eviction), w89
   * played the holder only while the page was hidden AND
   * declared navigator.audioSession.type = "play-and-record"
   * (the holder was refused even its gesture-blessed prime,
   * and the lag continued with the element idle), and the
   * logs after w89 still showed session-holder churn. The
   * owner then called it: no more experiments, rip out
   * screen-off play, LAGGINESS WILL NOT BE TOLERATED.
   *
   * What removal costs, stated so nobody rediscovers it in a
   * lost game: with the screen off the page suspends
   * silently. A sleep during the opponent's think means
   * their move arrives unannounced, the user waits deaf at
   * the board, and the clock burns into Lichess's
   * claim-victory window. Screen-ON play is the mode of this
   * program now; the clock overlay's wake lock (which keeps
   * the screen awake) is the one guard left, and it is a
   * screen-on guard.
   *
   * IF SCREEN-OFF PLAY EVER RETURNS, it starts from a fresh
   * baseline, not from resurrecting keepalive.js: the owner
   * said exactly that at the removal. A future attempt has
   * to prove, on the device, that whatever holds the session
   * can coexist with the mic and the synthesizer under
   * then-current iPadOS — the Audio Session API maturing is
   * the most likely door. The removed file's whole history
   * is in git and in HISTORY.md w63/w88/w89/w90.
   *
   * NO SPOKEN LOW-TIME WARNING — asked for and DECLINED,
   * v92. Game11 was lost on the clock in voice mode with
   * the screen off, where the two overlays' red under-a-
   * minute color cannot be seen and "clock" is the only
   * way to know the time. A warning at thresholds was
   * proposed on exactly that evidence and refused as too
   * distracting, which settles it: an alert that fires
   * while the user is thinking, and that gates the mic
   * when it speaks, costs more than the flag it prevents.
   * "clock" answers on demand and stays the whole answer.
   * Do not add unprompted clock speech of any kind.
   *
   * THE SPOKEN "CLOCK MODE" IS GONE (v98), and with it
   * classifyClockMode. It could not go fullscreen — Safari
   * grants that only from a real gesture — so entering by
   * voice put the clock screen under the toolbar, which was
   * then the wrong thing to look at; tried once and never
   * used again. (v108 removed fullscreen altogether, so
   * that particular asymmetry no longer exists; the phrase
   * stays deleted on the separate ground below.) What
   * remains in the clock vocabulary is bare "clock", which
   * SPEAKS the times, and "flip clock", which swaps the
   * sides. Deleting the third phrase removed the only real
   * collision risk between them. Anything that changes the
   * SCREEN is now a tap, and anything spoken either answers
   * or rearranges — a cleaner line than the one it replaced.
   * SPOKEN "SILENT MODE" WENT THE SAME WAY one version
   * later, once it turned out the user had never known it
   * existed — which is why no log ever showed it used. It
   * had the same fullscreen defect and the same one-tap
   * button beside it. Both screens are now tap-only, in and
   * out, and the rule is worth keeping: A SPOKEN COMMAND
   * THAT NEEDS A GESTURE IT CANNOT MAKE SHOULD NOT EXIST.
   *
   * THE GRAMMAR'S REJECTED IDEAS. Greek letters are barred
   * on purpose: NATO and Greek share alpha and delta, which
   * tempts a slide into Greek, but "gamma" sounds like g
   * while meaning c — a wrong-but-legal move played
   * silently is worse than a clean failure. "note" was
   * renamed "memo" in v68 because Safari kept confusing it
   * with "no", the most loaded answer word in the grammar.
   * A list-only nine/ten digit table was considered for
   * silent mode and rejected as speculative vocabulary;
   * the cap stayed at 8 because NUMS stops at 8, as ranks
   * do. Moot since v109 deleted the list with silent mode.
   *================================================================*/

