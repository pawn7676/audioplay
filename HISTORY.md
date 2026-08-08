# Audioplay — the w-series history

Why this file exists: this was the VERSIONS block inside
src/00-header.js, and at 39 entries it had grown to roughly half of that
file — pushing the constraints and the reasoning a reader needs BEFORE
touching anything down past a changelog nobody scrolls through. The
reasoning stays in the code, next to what it explains. This is the log,
and a log reads better on its own.

The website counts w1, w2, ... so no number ever collides with the
userscript's v-series in a log dump. Bump for any behavioural change,
revert freely. VERSION is assigned in src/11-lichess.js. It is never
displayed on screen — it appears in log lines, so a pasted log says
which build produced it.

An entry says WHY, not what: the diff already says what. Several of
these record a mistake and the rule it earned — w18, w28, w31 and w37
especially. Those are the valuable ones, and they are not to be tidied
away.

The userscript's own v-series history is not here. It lives in
frozen-userscript/us-header.js, which is still binding reading: its
platform findings and closed cases did not freeze with the code they
were learned in.

Oldest first — the entries refer back and forward to each other, and the
order is the story.

---

### w1

the port: userscript v104 voice pipeline + BoardEye's board, PKCE and
seek/challenge, on GitHub Pages.

### w2

the three viewing modes — voice only, clock, silent — as a per-game
choice, with sections 15 and 16 ported verbatim into modes.js. Per-mode
move read-back (voice ON, clock OFF by default: the turn flip on the
clocks is the free confirmation). Low-time callouts in voice-only mode:
a CLOSED CASE REOPENED BY THE OWNER, opt-in and default off; the amended
tombstone is in modes.js. Also fixes w1's missing flipClockSides stub.

### w3

FULLSCREEN RETIRED from both black screens — the v75/v76/v79 tombstone's
own stated one-line out, taken after the owner reported glitchy
transitions; the overlays now fill the visible viewport under Safari's
toolbar, and the exit that corrupted the layout viewport no longer
happens at all. A voice dropdown built from the voices the DEVICE
reports (never a hardcoded list of names that may not be installed),
with a test button. An opponent dropdown: maia1, maia5, maia9, or
someone else by name.

### w4

the voice dropdown cut to a SHORTLIST the owner chose by ear on his own
iPad — Samantha, Daniel, Karen, Moira, Rishi, Tessa — shown as bare
names. w3 offered every English voice the device reported, which on iOS
is dozens, most of them unusable. The list is in speech.js.

### w5

index.html stops carrying a version number. It held one in the heading
and in a ?v= on all seven script tags, so every bump forced an edit and
re-upload of a file whose layout had not changed — pure churn for
whoever is copying files into GitHub by hand. Both displays now read
VERSION from here. RULE: index.html changes only when the LAYOUT
changes.

### w6

the version comes off the screen entirely — the heading and the log-bar
label both go. VERSION stays in app.js and in the log lines, so a pasted
dump still identifies its build; that is the only reader who ever needed
it.

### w7

the voice list goes CROSS-PLATFORM, fixing a w4 bug: six Apple names
meant Windows and Android users saw an empty dropdown. Apple, Microsoft
and Google families are all matched, by prefix so version suffixes
cannot break it, labels tidied for display, and if nothing matches at
all every English voice is offered rather than none. WHO THIS IS FOR was
rewritten to say what w4 forgot: the site is not the userscript, and no
code here may assume an iPad.

### w8

THE ALLOWLIST GOES. w4 and w7 both hardcoded which voices to offer, and
both were claims about hardware nobody here owns — the failure is silent
and total when the claim is wrong. The dropdown now offers whatever
English voices the device reports. The one exclusion is Apple's joke
voices, and it is a BLOCKLIST: it can only subtract known junk, never
withhold a real voice from an unanticipated platform. THE LESSON, for
anything added later: prefer detecting what is there to declaring what
should be.

### w9

the signed-in username is SHOWN. It was fetched all along and only kept
lowercased for matching game.white.id, never displayed, so a connected
page could not tell you whose account it was on — which matters most on
a shared device. The same fix repairs a real bug: connectAccount set the
status text but never repainted the account row, so the button still
read "Sign in with Lichess" while signed in.

### w10

the username stops being said twice. w9 put it in a line of its own AND
in the status line under it. Now the account button IS the identity —
the name is its label and the green is its state (the same green the
round button uses for "on", because it means the same thing) — and the
status line is left to say only what is happening.

### w11

a churn fix, not a feature. w10 needed THREE files to change one button:
a CSS class in index.html, the toggle here, and a status string in
lichess.js. State appearance now lives in app.js as inline style, the
way the userscript always did it, so index.html is out of that loop
entirely. RULE: index.html holds the RESTING look; anything that changes
with what the program is doing is styled from here. Still outstanding,
and the next churn source to fix: 19 uiStatus() strings sit in
lichess.js, which should report STATE and let this file choose the
WORDS.

### w12

the account pill stops being a button. Showing the username on it made
it read as a label, but it still fired "sign in as someone else", so
tapping it sent an already-signed-in user back to the Lichess consent
screen. Signed in it is now inert: it says WHO, and Sign out beside it
is how you leave. The general rule it broke — let each element do
exactly one job.

### w13

two things a first real game exposed. The status line never updated once
a game began, so "Challenge sent to maia1 - waiting." stayed up for the
entire game; the game state now owns that line whenever a game exists.
And the page never said that VOICE MUST BE TURNED ON BY HAND — iOS opens
no microphone without a real tap, so a game with the mic off looks
broken and is not. The line now says so, in the one place the user is
already looking.

### w14

GAME 17, the first real game on the website, and it found a genuine bug.
THE MIC COULD BE DEAD WITH THE BUTTON LIT. startListening() refuses
while speech is in flight, and with MIC_ALWAYS_ON nothing restarted it
afterwards — safe in the userscript, where the button called connect()
and the announcement came back long after the mic was up. The website
moved the connection to SIGN-IN, so "connected. you are white." can be
mid-sentence at the first tap, which is exactly what happened at
23:17:24: no mic cycle was ever logged and voice had to be switched off
and on to recover. The end of speech now re-checks the mic, and a
refusal is logged instead of being silent — the failure hid precisely
because nothing said it. Also "tags"/"tag" join the takes words: heard
twice in game17, and only luck kept it from playing a non-capture.

### w15

a "speak the opponent's moves" checkbox, from measuring game17: opponent
move to first word heard, median 11s; that word to the POST, 0s. The
code is free; the wait is the program's own voice, which the mic sits
deaf through.

### w16

w15 REMOVED the same day. Hearing the opponent's move is not overhead,
it IS the program; a switch trading the ear for speed is a switch for a
different program, and fast chess already has lichess.org. The
measurements are kept as a tombstone in modes.js with the rule they
earned: do not propose muting announcements for speed again.

### w17

HOW TO GET A GOOD VOICE ON iOS, written down in speech.js and on the
page after the owner found it by hand: set a Premium/Enhanced voice as
the SYSTEM voice in Settings, then leave the page's dropdown on
"default". CORRECTS an old finding that downloaded voices could never
reach a web page — they cannot be selected by name, but Safari resolves
the page-language default to whatever the system voice is set to. Siri
voices really are unreachable; that stands.

### w18

the w15-w17 notes and the data-driven checkbox binding, which had never
actually landed in this file. An edit asserted on a LATER file and died
before writing this one, and the two version bumps after it then matched
nothing and failed SILENTLY. The site was fine — the old id-based
binding still worked — but VERSION read w14 in log dumps for three
versions. THE LESSON is the project's own rule about verifying rather
than asserting: confirm the file actually changed; do not trust that an
edit applied.

### w19

which panels are open survives a reload. They are <details> elements,
which always reset to their markup state, and a hard reload is how a new
build gets picked up here, so the reset was happening constantly. Keyed
by the panel id that index.html already carries, so the markup stays
untouched and its own state remains the default for a first visit. 

### w20

THE REBUILD on shared v134 sections, as above. VERSION is reassigned in
11-lichess (section 1 is shared and byte-frozen until a joint bump).
Gains over w19, inherited from v105-v134 in one step: the settings panel
(v124) with per-mode read-back and the message-channel invariant
(v129/v130), guarded pawn pushes, the tags and channel vocabulary, clock
mode as canon section 14, the v134 read-back race fix, and every parser
fix since v104. Losses, on purpose: silent mode (deleted from canon at
v109), the voice dropdown (the shared pipeline uses the SYSTEM voice -
see VOICE_NAME in section 1 - which is also what picks up downloaded
Premium voices), and the w2 low-time callouts (not in canon; reopen from
the tombstone in reference/modes.js if missed). Started on v133
sections; re-cut to v134 the day v134 landed, the first proof the
re-copy discipline works. UNPROVEN: no real game has been played on w20.

### w21

THE FIRST DEVICE FINDINGS, from the owner's first look at w20 on the
iPad. Three fixes: (1) the button row joins the page - floating
bottom-right was shaped for lichess.org and covered the page's own
content here; it now lives in a Voice panel at the top, and the settings
panel opens BELOW its button. buildUI stays verbatim; the re-parent is a
web delta. (2) the page's button CSS is SCOPED to .panel: bare selectors
were bleeding flex and padding into the shared UI's created buttons,
which no page CSS could ever reach on lichess.org - the on/off pills
came out different sizes. (3) the turn line's "- that is you" is gone at
the owner's word: the board is drawn from your side and the clocks say
you/them already. PROVEN the same day: the first real game on the
website (game w21-1, a win by Qxf7#, log in the project files). Sign-in,
PKCE, the account event stream, the game stream, mic, clock mode with a
HELD wake lock, live settings flips mid-game, and the v134 read-back
race fix all seen working on device. Zero retries in the entire game.

### w22

INSTRUCTIONS BECOME A PANEL. The four hint paragraphs leave the Lichess
panel for their own collapsible "Instructions" panel at the bottom of
the page - open by default so a first visitor still meets them,
remembered like every panel so the owner collapses them once and they
stay down. The sign-in paragraph is reworded to the owner's text ("allow
this site to do 3 things on your behalf...").

### w23

the "SET loaded:" boot line, inherited from v135 - the first shared-tree
change to flow into both targets from one edit. See v135 in us-header.js
for the reasoning.

### w24

the settings panel opens UNDER ITS BUTTON, both axes. The userscript's
right:10px pin was the button's own corner there; here it read as a
random spot on the right. Also the session's log proved two more things
in passing: the account event stream RECONNECTED after a real "Load
failed" drop (18:14:42-45), and the v129 message-channel invariant fired
live, forcing show-messages back on when both were switched off.

### w25

no double-tap zoom on the overlays: two quick taps on two settings pills
zoomed the page. The w21 CSS scoping that fixed the pill sizes also took
touch-action:manipulation away from the body-attached panels; restored
inline on both panels and their buttons. If the owner ever reports the
same zoom on lichess.org, this belongs in the shared section 12 as a
v-bump - the pills never carried touch-action there either, lichess's
own CSS just may have covered it.

### w26

cancel closes a repair question, from v136 in the shared section 6 - the
second shared-tree change to reach both targets from one edit. PROVEN
THE SAME SESSION: the website's second full game, 45 minutes against
maia5, won by underpromotion (c1=B#). Read the log for what the parser
now absorbs without a retry - "Fisher hotel five" for Bh5, "Bush golf
six" for g6, "Push Charlie to" for c2, and the first-word demotion
firing thirteen times.

### w27

the voice row is REVERSED: round button first, then settings, clock,
log, practice. Done with row-reverse, not by reordering buildUI - the
shared UI stays re-copyable. Note the settings panel still anchors to
its button (w24), which now sits further right; the clamp keeps it on
screen.

### w28

w27 DID NOTHING and shipped anyway. The flip went on wrapEl, whose only
child is the row that really holds the buttons - reversing a list of
one. It is on the inner row now. The test that passed had grepped the
SOURCE for "row-reverse" instead of asking the DOM what got styled; it
now walks the built tree and checks the element that contains the
buttons. A test that cannot fail when the feature is broken is worse
than no test: it spends the owner's trust to prove nothing.

### w29

the round button becomes a labelled pill: "start voice" in the page's
primary blue when off, "listening"/"voice on" in green when on. The
circle was the userscript's thumb target floating over lichess.org; in a
panel it only forced a 72px row with gaps around every button. It stays
visibly the must-press control, but by wearing the same blue as "Sign in
with Lichess" and saying so in words rather than by being three times
the size of its neighbours.

### w30

every button label capitalised - Practice, Log, Clock, Settings, Copy,
Clear, Close - matching the page's own buttons, which always were. The
voice button says "Start" alone: the panel heading above it already says
VOICE, so repeating the word was the label doing the panel's job.

### w31

Start goes first by MOVING THE NODE, not by reversing the row.
row-reverse (w27) looked right on the iPad and broke on an iPhone in
portrait: a reversed row wraps in reverse too, so Start fell to the
bottom line. The lesson is the one the whole website keeps relearning -
a layout trick that happens to look right at ONE width is not a layout.
Now the DOM order is the reading order at every width.

### w32

three things the owner asked for on seeing the page whole: the voice
buttons now match the page's own buttons (the shared UI's inline sizing
is CLEARED so the stylesheet decides, rather than a second set of
numbers to keep in step); the "Audioplay" title is gone, since the tab
already says it and the first screen is worth more; and Instructions
starts COLLAPSED, because it is the longest panel and it is reference,
not something to read past on the way to a game. Carries v137's rename -
they are buttons, not "chips". Dead w19 CSS for buttons this page never
builds went too.

### w33

TIME CONTROLS ARE PRESET BUTTONS - the pairs from Lichess's own
quick-pairing grid, minus bullet (a spoken move costs seconds a bullet
game does not have; the owner doubts blitz too, and it stays until a
real game settles it). 3+0 through 30+20 plus a Custom box that takes
the same #+# and selects itself when the text parses. The choice is
remembered; seek and challenge read selectedTimeControl(), never the
DOM. Also the session the FREEZE was decided - see the notice at the top
of this header.

### w34

no default time control, and no memory of the last one: the row is clean
on every load and picking is one deliberate tap. w33 had both a 15+10
default and a remembered choice, which are the same thing wearing two
hats - either one lights a button the owner did not press this session.
Seeking or challenging with nothing picked says "Pick a time control
first."; with a Custom box that does not parse it says that instead.
Neither sends anything.

### w35

the memory comes back, the default does not. The owner's distinction,
and w34 collapsed it: a FIRST visit picks nothing, because the page has
no business guessing; a LATER visit restores what was chosen, because
you already said. Null now means "not chosen yet" and nothing else. Junk
in storage reads as never chosen - a stale value should leave a clean
row, not a broken one.

### w36

the Custom box was UNREADABLE when picked: black browser-default text on
the picked green, because the box had no colour of its own and w33 set
only a background, inline. It is now styled like the presets beside it -
same surface, text, border - and "picked" is the same CSS class for all
ten controls instead of inline colours on one of them. The general rule
this keeps proving: state set inline from code cannot see what the
stylesheet already decided.

### w37

a custom time could not be chosen TWICE. The box only re-picked on
"input", which fires when the text changes - so tapping back into a box
that already said 40+30, after pressing a preset, gave a cursor and
stayed dark with no way back to green short of retyping. Focus is the
missing event. Found by the owner in thirty seconds of use; the w33
tests had only ever TYPED into the box, never returned to it. Worth
remembering when writing the next test: a feature used twice is a
different feature.

### w38

THE SHADOWS ARE GONE. src/ held two copies of sections 11, 12 and 15 -
the userscript's and the web-* files that actually built - which was the
sharing arrangement's last remnant and an invitation to edit the wrong
one. The userscript's four sources moved to frozen-userscript/ beside
its canon artifact and sha; the web-* files took the plain names. One
manifest, one target, one file per section. The template's own header
was rewritten too: it still pointed at us-header as the front door, and
it still carried the w11 rule that w36 deliberately broke - see the
amendment there for who owns state appearance now.

### w39

spelled for the ear, named for the board. Two of the owner's, from
listening and from reading: (1) every English voice says "LITCH-ess", so
the one SPOKEN mention is now "lee chess" - spoken text is spelled the
way it should sound, and the name stays correct everywhere it is read;
(2) the clocks and the turn line say White and Black, capitalised, White
first as on any score sheet, instead of "you" and "them" - the colours
are what the game is about, and you/them made the reader translate
twice. Which clock is YOURS is still marked by colour, so naming them
properly cost nothing.

### w40

A CAPTURE MAY NAME THE PAWN INSTEAD OF THE VICTIM. Four utterances in
forty seconds, all refused, all meaning the same obvious thing: with a
pawn on e5 and a knight on f6, "echo takes", "echo five takes", "pawn
echo five takes" and "echo five takes night" each got "Say again." or
"that's not a legal move" before the long form finally landed. The owner
was naming the pawn and leaving out what the board already made obvious,
which is what anyone standing at a board does; the grammar only ever
listened for the other half of the sentence.

The fix costs nothing because word order was already in the utterance and
we were throwing it away. Every capture form that works puts the
destination AFTER the take word - "foxtrot takes golf five", "takes echo
five" - so a square spoken BEFORE it cannot be the destination, and
reading it as the origin cannot change the meaning of anything that
already worked. The parser now remembers where the take word fell instead
of guessing from the position.

A unique fit plays unasked, on the v111 count: uniqueness is taken over
every legal capture from that origin, pieces as well as pawns, so a
misheard word can only turn one candidate into several, which asks. A
named origin square is the strongest evidence in the grammar - it pins
the mover to the one piece standing there, which "queen takes" never
did. Two victims from one origin still asks.

One thing was deliberately reordered rather than added: "pawn echo takes"
used to reach the half-square repair, which reads a dangling file as the
DESTINATION's. That rule was learned from "queen alpha check me", a move
with no capture in it; with a take word the file is the origin, as
findMoves has always read it. Only a file spoken before the take word is
diverted.

The rule this earned: the form the owner reaches for under time is the
SHORTEST one, and the shortest one is the least likely to have been
tested - every test written for this grammar had spelled the move out in
full. w37 said a feature used twice is a different feature. This is its
sibling: a feature used in a hurry is a different feature.

### w41

FILE TAKES FILE, AND WHO COUNTS AS BEING ON THE FILE. Two halves of the
same sentence, both from the owner reading w40 back.

"charlie takes delta" is a whole move to the ear and was nothing at all
to the parser: both dangling files landed in one slot, the second erased
the first, and the request arrived as "- x - d -" with nothing to say.
Now a half-square spoken PAST the take word is the target's, and only
when an origin was already spoken before it - with nothing behind it a
lone file after "takes" is still the destination-file guess the v117
repair has always made of "queen takes delta", untouched. Two halves
straddling the take word could not mean anything before this, so nothing
that worked can change. After 1.c4 d5 it plays cxd5 at once; after 1.c4
d5 2.Nc3 a6 the same words could be cxd5 or Nxd5 with the knight's name
lost to the mic, and it asks. The PRS line carries both halves now -
"- x - c>d -" - or a pasted log would not show which end was which.

The other half was already true and had nothing proving it: uniqueness
on a bare origin file is counted over every capture from that file,
pieces as well as pawns, precisely BECAUSE "echo takes" may be a piece
whose name was eaten. Only the pawn's own captures would have been the
w40 fix quietly reintroducing the game6 bug it was modelled on. There is
now a board in the harness where a rook and a pawn can both capture off
the e-file, and it must ask.

Both tests cost a FEN each and both were wrong on the first run - the
knight I put on f3 to be captured was checking the king on e1, so the
only legal move in the position was the capture I was trying not to be
unique. A test that passes because the position is forced proves the
opposite of what it claims. Check the move list, not the diagram.

### w42

"TAKES CHARLIE" NEEDED NO PIECE NAME, AND SAID SO TWICE. Game w41-1 at
16:32:18: the owner said it, got "Say again.", said it again, got the same,
added the word "rook" and played Rxc6 on the third try. The sentence was
complete both times. The v116 half-square repair - the one that reads a
dangling file as the destination's and would have answered it - was gated
on a piece being named, so it sat out the exact case it was built for. The
mic eats the first word more than any other; requiring it there made the
repair useless whenever it was needed most.

The gate is now a piece OR a take word. Safe on the count this file has
used since v111: the fits are drawn from every legal move landing there,
pawn and piece alike, so a mover lost off the front of the utterance can
only widen the list, never pick the wrong piece. In the logged position it
widens to exactly that - Qxc6 and Rxc6 both land on the c-file - so the
answer is the question, not the rook. That is game6's lesson still paying
out.

A take word is REQUIRED for the piece-less form, and that line is the whole
safety. Without one this would relax a bare dangling file into every
piece's moves to that file, which is the bare-square rule read backwards: a
square with no piece named is a pawn PUSH and must never become a piece
move. There is a test that a bare "charlie" is still not a move.

Also askPartial: every branch opened with the piece name, so the first
piece-less request to reach it would have said "I heard undefined charlie."
It now leads with whatever actually survived - the piece if one was named,
the take word if not. Found by writing the test, not by hearing it, which
is the only reason it is a footnote instead of an entry of its own.

The rule this earned, and it is w40's rule from the other side: w40 fixed
the sentences that named the pawn and left out the victim. This one names
the victim and leaves out the pawn. Both were refused for the same reason -
a repair gated on the word most likely to be missing. When a repair exists
BECAUSE the mic drops words, it must not require the word it drops.

### w43

ASK ABOUT THE HALF THAT ACTUALLY NARROWS. Game w42-1, 16:51:44: "takes
delta" with Nxd5 and cxd5 on the board was answered "I heard takes delta.
Say the rank." Both fits land on d5. The rank was never the missing half -
the question had exactly one possible answer and could not tell the two
moves apart. So "three" fit nothing, "four" fit nothing, "five" got back to
where it started, and "knight" - said in the middle of it, and the actual
answer - was ignored without a word. Four answers to a question that could
not be answered.

The missing half was the MOVER, and the question for that already existed:
askPiece offers pieces by name and pawns by their file ("knight, or
charlie") and takes either as the answer. It just was not reachable from
here. The repair now counts before it asks - if every fit lands on the same
square, it asks which piece; if the fits span squares, the rank still
narrows and it still asks for the rank. One line of counting, and the
question is the one with more than one answer.

It improves w42's own case on the way past. "takes charlie" there had Qxc6
and Rxc6, both on c6, and cost a rank, then a yes, then a no, then a yes.
It is now one question and one word. The w42 test that asserted the old
wording was rewritten rather than kept: the feature changed, so the test
changed with it.

Second hole from the same log, same incident: a bare piece name only
counted as an answer to "say the target", where it means the VICTIM.
Answering any other question with one fell out of partialAnswer as "not an
answer", and a bare piece name has no move in it, so it died silently. v116
settled this for the yes/no question and v117 for the target question; the
rank question never got the same treatment. It does now, carrying the half
already known so narrowing by mover does not throw away the file that was
asked about.

The rule this earned is about tests, not voice. Three of these tests failed
on the first run for a reason that had nothing to do with the fix: a move
played by an earlier test leaves practice's random reply on a 1600ms timer,
and installing a position before it fires lets it land in the NEW one,
bumping the ply and making every open question stale - both question types
are ply-guarded. The first attempt was to sleep it off, which is the wrong
shape: it makes every helper wait 1.7 seconds and still races. These tests
set their own position, so the random opponent has no part in them; it is
now switched off for the whole block. A test that shares mutable state with
a timer is not slow, it is wrong.

### w44

"I HEARD" HAS TO BE TRUE. Game w43-1: "takes delta" was answered "I heard
takes delta 5." The 5 came off the board, not out of the owner's mouth. The
move it went on to play was right, and the sentence was still a lie - and
"I heard" is the one sentence in this program that is a claim about the
USER rather than about the position. He is standing away from the screen
with it as his only evidence of what landed; if it can quietly include
things he did not say, it stops being evidence at all.

w42 wrote that rule down, in askPartial, after "I heard undefined charlie".
w43 then broke it in askPiece one commit later. Restating a rule in a
comment is not keeping it: there is now one heardSoFar() that renders what
was actually heard, and all four questions call it. Anything DEDUCED goes
in the options that follow - askPiece names the whole move in each one, so
"takes delta" now gets "I heard takes delta. say charlie takes delta 5, or
queen takes delta 5." The square still reaches the ear; it arrives as
something offered instead of something claimed.

The test that would have caught it asserts the property rather than the
wording: the lead contains no rank when no rank was spoken. The w43 test
asserted the exact sentence, which is why it passed while being wrong.

Also from the same log: "text" and "texts" are the take word with its k
gone. "Texts bravo" survived at 17:27:38 only because a rival transcript
got it right; "Text Delta" at 17:31:04 lost the move outright. Exact-only,
v114 style - three of these are ordinary English words and the fuzzy
matcher must never reach for them.

### w45

TWO MORE SENTENCES THAT WERE NOT TRUE, both from game w44-1, both found
by reading a log the owner thought was clean. w44 said "I heard" has to be
true. These are the same rule one step further out: a REFUSAL has to be
true as well, and it has to blame the right half of the sentence.

At 17:49:08 "golf takes night" was answered "No capture from the golf
file." There was no knight to take - but gxh6 and gxf6 were both sitting
there legal. The victim was named, filtered on, and then left out of the
sentence explaining the failure. The refusal now names it: the part that
ruled everything out is the part the owner most needs said back, which is
exactly what w44 concluded about the lead.

At 17:50:11 "pawn" was offered as an answer to "say queen takes delta 6,
charlie takes delta 6, or echo takes delta 6" and was told "no pawn can
take there" - while TWO of the three options were pawn captures. The
refusal came from a v92 line that read "a named PAWN is never a fit: the
question exists because no pawn can", which was true of the only question
askPiece asked when it was written. w43 gave askPiece a second job -
asking WHICH piece captures, where pawns are routine and are offered by
their file, because that is how a pawn capture is spoken. The old comment
went on being obeyed after the thing it described had changed underneath
it. A named pawn now narrows to the pawn moves on offer like any other
piece; a piece that genuinely cannot still hears so.

The rule this earned: when a function grows a second caller, its refusals
inherit the first caller's assumptions and nobody notices, because the
sentence still reads plausibly. w43 added the caller and did not re-read
what the answer path believed about the question. Both bugs were still
just sitting in the log; the owner read it as working, and it was working
- it was only LYING, which is harder to see and worth more.

### w46

A REFUSAL SAYS WHAT WAS HEARD. "That's not a legal move. Say again." was
the whole sentence, and it answers the wrong question. Standing at a board
across the room, the first thing the owner needs to know is whether the
MACHINE misheard him or whether HIS MOVE is wrong - and those want opposite
next actions: say it again more clearly, or look at the board. The old
sentence cannot be told apart in either case, so it was worth nothing on
the one occasion anyone heard it. Saying the reading back settles it in
three words: "I heard queen delta 4. That is not a legal move."

This is the third time the same rule has been learned. w44: a lead claiming
a rank nobody said. w45: a refusal blaming the file when the victim was
what was missing. Twice it was fixed where it happened; the third time it
is a function, refuse(), and every refusal goes through it.

heardSoFar had to grow up first, and how it was broken is the interesting
part. It rendered the piece, the take word and a dangling half - correct
for the only callers it had, the half-square questions, which cannot
contain a whole square. Point it at any other request and it silently
dropped one: "queen delta four" came back as "queen". Not a lie this time
but a SWALLOW, and it fails the same job from the other side - a read-back
missing half the sentence leaves the owner just as unable to tell a
mishearing from a bad move. It renders the whole utterance now, in spoken
order, using takeAt to put the halves back on the right sides of the take
word.

The victim clause moved to the front of its own sentence. w45 appended "of
a knight", which was true and read badly the moment the lead began
repeating it: "I heard golf takes knight. No capture from the golf file of
a knight." It is "No knight to take from the golf file" now - the missing
thing as the subject, not a qualifier trailing off the end.

ONE BARE "Say again." SURVIVES, and it is the exception that shows the
rule. When an utterance parses to nothing there is no reading to give back,
and we cannot tell whether the words were misheard or were simply never a
move. "No move in that" would claim the second. Saying only "Say again."
claims neither, which is the only true thing available.

The property that guards this was upgraded twice while being written, both
times because a mutant walked through it. It checked that no rank appears
unless one was spoken; it now checks that every file, rank and take word
spoken appears and nothing else does - the swallow direction is the one
that was missing, and it is the one that was live. And it only inspected
sentences that already said "I heard", so deleting that clause made the
property stop looking. It asks the parser whether a reading existed, and
requires one whenever it did. A rule that only inspects what already obeys
it is not a rule.

### w47

THREE THINGS GAME w46-1 TURNED UP, in a log the owner called "not perfect
but pretty darn good". He was right on both counts: everything asked for
worked - the read-back renders squares, a missing victim is named, "pawn"
answers a which-piece question, promotion, castling and "text" all landed -
and three real faults sat underneath.

PROMOTION VARIANTS NOW COLLAPSE EVERYWHERE, not only in findMoves. At
19:19:24 answering "pawn" offered bxa4 and then bxa8 four times over -
queen, rook, bishop, knight - so five questions stood between him and two
moves he could name. findMoves has collapsed promotions since long before
today; the six repair sites each built their own candidate list and not one
of them did. They share a builder now.

The trade is real and worth stating: underpromotion is no longer reachable
by saying "no" four times. It is reachable the way the grammar has always
offered it, by naming the piece, which he used fluently in the same game
("bravo takes alpha eight equals queen"). Four questions on every
promotion, to keep a path that duplicates a phrase that already works, is
the wrong side of it.

A BARE "Say again." WHEN SOMETHING PLAIN WAS HEARD. "Rook Delta" got it
twice at 19:12:51, and "Text Delta" at 19:22:19. w46 said a refusal repeats
the reading back unless there is no reading - and reqIsEmpty, which decided
that, asks only about castle, squares and victim. A piece and a file
counted as nothing heard at all. reqIsEmpty is left alone, because
collectCandidates uses it to decide what is a move in the first place and
widening it there would change which utterances become candidates; the
refusal asks its own question instead.

AND THE VERB. "Takes golf five" was refused with "No pawn can GO there".
He had said takes. Small, and the third fault in three days of the same
family: the sentence has to match the sentence it is answering.

Two findings from the same log are NOT here, deliberately. A named victim
that rules everything out still falls through to the generic refusal
("queen takes pawn" when no queen can take a pawn), and a rival
transcription that MIS-HEARS the first word - "Nate takes pawn" for "Night
takes pawn" - is not demoted the way one that DROPS it is, so it offered
three moves that were not knight moves. The owner spotted the second one
himself, mid-game, and recorded it as a memo. Both are ranking work and
want their own change.

### w48

THE PAWN WORD, AGAIN, AND THE QUESTION IT WAS ASKED. Game w47-1 was four
minutes of the owner failing to say "pawn". Safari gave back Plants,
Plant, Plantains, Fontes, Pontes and Po across six utterances, and three
of them lost a move outright. v120 already fought this fight and won it by
adding "push" - phonetically unlike every file, rank and piece word, one
syllable, and still the better word to say. But the table only ever grows
from real logs, and this log has these. "cakes" joins the take words on
the same evidence, three times in one game.

The harder half was the question. At 20:09:24 "pawn takes" with bxc6 and
dxc6 both available was answered "Say the target" - and both of them take
on c6. The owner filed a memo mid-game saying so: "both of my ponds are
attacking one single night on C6 so asking for the target didn't make any
sense." He is exactly right, and w43 had already established the rule -
ask about whichever half still has more than one value - after the
half-square repair asked for a rank that could not discriminate. It was
written INSIDE that repair. The capture repair next door, doing the same
job on the same shape of evidence, went on asking for the target
unconditionally for five days.

That is the third time this pattern has cost something in a week: w43's
lead, w45's refusal, and now this. A rule proved in one place and left
there is a rule that will be broken in the place next to it. askWhichever
is shared now.

WHAT IS NOT FIXED HERE, and it is the biggest thing the log showed. At
20:09:06 Safari returned six readings and the SECOND was "Pond takes" -
which parses cleanly and would have played. The move was lost anyway,
because handleTranscripts parses only transcripts[0] and every repair
works from that one request. collectCandidates has read all eight rival
readings since the v-series; the repair chain has never seen past the
first. A good reading sitting in slot 1 is invisible to it. That wants its
own change and its own thinking about what a noisy alternative is allowed
to trigger.

### w49

THE LAST THREE FROM GAME w47-1, and the list is empty.

A NAMED VICTIM NARROWS THE REFUSAL. "Queen takes pawn" with no
queen-takes-pawn on the board got the generic "That is not a legal move"
three times in that game. The capture repair's gate excluded a named
victim outright, so the request fell past every repair - and the VICTIM was
the thing that ruled it out. w45 settled that a refusal names the half that
did. The same widening answers "takes knight" with no knight to take,
whether or not a mover was named.

A MIS-HEARD FIRST WORD IS DEMOTED LIKE A DROPPED ONE. semanticKey passes a
word it does not know straight through, so "Nate takes pawn" keyed as
"nate x pp" while "Night takes pawn" keyed as "pn x pp" - not a suffix, so
the clipping rule never fired and the knight-less reading ranked level with
the real one. It contributed cxb7, Bxh6 and Qxd6 to a question about
"night takes pawn", and the owner noticed mid-game and left a memo saying
only Nxd6 was available. His second attempt is the proof: there Safari
returned "It takes pawn", the word VANISHED rather than mutated, and the
demotion worked perfectly. Dropping what is not vocabulary before comparing
makes the two cases one case. An unrecognised word is not evidence.

AND THE REPAIR CHAIN SEES EVERY READING. Safari returns up to eight rival
transcriptions. collectCandidates has read all of them since the v-series,
scored by which alternative they came from and demoted a tier for a lost
word. The repair chain never saw past the first: handleTranscripts parsed
transcripts[0] and every repair worked from that one request. At 20:09:06
six readings arrived, the SECOND was "Pond takes" - which parses cleanly
and would have played - and the move was lost to a primary of "Plants".

What a rival reading is ALLOWED to do is the whole question, and the answer
is v119's, one level out. There the line was that a request whose PIECE is
inferred rather than heard still confirms. Here the whole REQUEST is
inferred - it is not what the mic ranked first - so it may raise a question
and may not play a move. That keeps the change strictly additive: it can
only turn "Say again." into something answerable, which is the bar w40 set
for the origin repair and the bar every widening since has had to clear.

Two test positions in this entry were wrong before the code was: a queen on
d1 cannot reach c6, which is worth remembering the next time a FEN is
written by eye rather than by asking the move generator.

### w50

THE STATES THAT OUTLIVED THEIR GAME. A review of the whole tree, file by
file, and this is the first of what it found: a family of faults that all
have the same shape. Something is set while a game is running - a question,
an arm, a connection, a mode - and nothing puts it down when that game
ends. Every one of them was invisible to the harness because the harness
had never played two games in a row.

THE WORST OF THEM COULD RESIGN THE WRONG GAME. There are four dialogue
states and there was no single place that cleared them. The two ply-guarded
ones expire by themselves while a game runs, which is what the ply is for -
but joinGame resets api.moves to empty, so a question asked at ply 0 of one
game is still "current" at ply 0 of the next. The two yes/no states never
expired at all. So: ask "resign", hear "Resign the game? Yes or no.", get
mated or flagged before answering, let the next game auto-join off the event
stream, and the first "yes" of the new game resigns it. clearDialogue is one
function called from every place a game begins or ends, which is the answer
to a list of things to remember - the previous answer was to remember them,
in three of the five places.

PRACTICE LEFT THE FRONT DOOR OPEN. dryStart closed the game stream and the
timers and stopped there, leaving the ACCOUNT event stream open and any
outstanding seek live. Both of those exist precisely to start a game without
being asked, and dryRun then gagged the result: the join happened, the real
position replaced the practice one, every announcement was suppressed
because practice was still on. A real game, a running clock, and silence,
while the board in front of you says something else - the exact case the
keep-alive tombstone is about, reached from the other side. Practice is a
mode where nothing is sent to Lichess, so nothing may arrive from it either.
The one judgement call in this entry sits next to it: if a gameStart does
arrive during practice - an event already in flight, an account reconnect -
practice LOSES and says so. A live clock outranks a practice game, and being
told is the whole point.

AND THE RECONNECT LOOP THAT TALKED OVER ITSELF. watchEvents has filtered
AbortError since it was written; startStream's catch never did. startStream
aborts the previous stream on its way in, that abort rejected the old reader,
the rejection reached the catch, and scheduleReconnect opened another stream
two seconds later - which aborted the one just opened. Each turn re-delivered
gameFull, so the page said "reconnected. you are white. white to move." every
two seconds for as long as the game lasted. One line, and the line already
existed twenty lines away.

THE SAME FUNCTION WAS GATED ON THE MICROPHONE, which is a different thing
from being connected. Voice off (or a mic that gave up after eight failures),
then a stream that drops for any ordinary reason: nothing reschedules it, and
turning voice back on only restarted the mic. Mic alive, stream dead, the
opponent's moves never announced again. Listening and being connected are
not the same state and must not share a flag.

THE REST, EACH SMALL AND EACH ITS OWN WAY OF SAYING NOTHING OR SAYING THE
WRONG THING. A confirmed yes/no spoke "resigning." the instant the request
left, and postAction has no catch, so a failed send was an unhandled
rejection and the user was told a game-ending action had happened when it had
not - acceptMove has said "Could not reach Lichess." on that same failure
since the v-series, so the yes/no path was the only one that lied. postMove
had no timeout, and its caller sets busy = true, so a fetch that hung left
EVERY later move dropped in silence with no way out but the button. The busy
refusal itself was silent, which reads as not-heard and invites saying it
again. An incoming draw offer overwrote whatever question was already open
without a word, so a "yes" meaning resign accepted a draw; a withdrawn offer
left its question standing, so a "yes" was spent on an offer that no longer
existed and was told it worked. syncMoves detected a takeback by list LENGTH
only, so a takeback and its replacement arriving in one event left the local
position quietly describing a game that was no longer on the board - and with
no uci applied, the illegal-uci resync never fired either. The resync path
threw the sans away, leaving the clock overlay's move rows stale and an arm
pointing into a position that no longer existed. questionOpen in clock.js
listed three dialogue states and partialAsk was added at v117, so "say the
rank" and "say the target" - the two questions that ask for the least - were
the two whose message expired off the strip while they waited. And castling
returned before the check suffix, so O-O+ was announced as a bare "castles
kingside": the one move that could give check without saying so, and the
opponent's castling is exactly the move being listened to rather than seen.

WHAT THIS ENTRY IS REALLY ABOUT, and the rule worth keeping: none of these
were hard, and none were found by the tests. They were found by reading two
files side by side and asking what happens when the game changes underneath
them. The harness now plays a second game - joins one, ends one, starts a
real one during practice - because that transition is where all of this
lived. Ten of the fixes were mutation-tested: the fix was reverted, the test
was confirmed to fail, the fix was put back.


### w51

FOUR WAYS A SENTENCE COULD BE TAKEN FOR A DIFFERENT SENTENCE, from the same
review as w50. Where w50 was about state outliving its game, this is about
the grammar quietly disagreeing with itself. Every one is a wrong move or a
lost move, and every fix is a gate of one or two lines.

A SALVAGE MAY NOT CONTRADICT A HALF THAT WAS SPOKEN. readingsOf offers the
literal reading first and salvages after it, and the rule that makes that
safe is that a salvage can only turn nothing into something. The lone-square
salvage broke it: it rebuilt the constraint and then overwrote the target end
WHOLE, which is a rehearing only while the target is silent. "Echo five takes
delta" says both ends out loud - origin e5, target the d-file - and
constraintOf gets it exactly right; the salvage then threw the d away and
went looking for anything that could capture ON e5. On a board with a white
pawn on d4 and a black pawn on e5 that is dxe5: ONE candidate, so nothing
asks, so it plays - with the mover and the target roughly swapped round from
the words. Verified by reverting the gate: the harness plays "delta takes
echo 5" for those words. This is the game6 shape, which is the most expensive
class this program has, and it had been sitting in the salvage since w40.

A MOVE IS NOT A QUESTION ABOUT A SQUARE. The square branch of classifyQuery
had no content gate, and "which" and "what" are FILLER precisely because
Safari sprays them into ordinary utterances. So "which knight takes delta
five" - complete, legal, unambiguous - was answered "d5 has a white pawn" and
the move was never looked for at all, because classifyQuery is consulted
before moves. The turn branch directly above learned this at v65 and grew a
content-word test; this branch is the same lesson one block down, five
versions later. A capture word, a named piece or a second square all say the
sentence is a move.

AN ANSWER IS A WORD, NOT A SENTENCE. pieceAskOpen's own comment says the
answer must be "a piece and nothing else" and the code excluded only squares
and castling, so a capture word, a named victim and a trailing promotion
piece all sailed through. With a push question open - "no pawn can go there,
say queen, king or bishop" - an unrelated "queen takes rook" that finds no
move of its own reached the answer path FIRST and was swallowed as the answer
"queen", offering, or with confirm off playing, a queen move nobody said.

THE DEDUPE KEY HAS TO FOLLOW THE PARSER, and twice it did not. semanticKey
exists to reduce a reading to what it MEANS so two spellings of one sentence
collapse; its header says "same rules as parsing". Bare "a" is an article
unless a rank or a take word follows it - the parser's rule since the capture
case was added - and semanticKey never had it, so "a bravo four" and "alpha
bravo four" keyed identically while parsing differently. dedupeTranscripts
keeps the first of a matching pair, so one of two genuinely different
readings was binned before collectCandidates ever saw it, and which one
survived came down to the order Safari happened to return them in. The glued
double square was missing the same way: "e2e4" never collapsed with "e2 e4",
and evidenceKey could not see it as a move at all.

AND confirmMyMove WAS OFF FOR EVERY MOVE SAID OVER A QUESTION. The re-said
branch played a unique move outright, ignoring the setting whose entire job
is "ask me even when you are sure" - and it was off in exactly the situation
where the user is already being misheard, which is the situation the setting
is for. Worse, a re-said AMBIGUOUS move was discarded in favour of "Say yes
or no." and a re-ask about the OLD list, so the new reading went in the bin
while the stale question stood. Both now go where the main path sends them.

THE RULE THIS EARNS, and it is the same one w48 wrote down: a rule proved in
one place and left there is a rule that will be broken in the place next to
it. The parser's "a" rule, the turn branch's content gate, and the main
path's confirmMyMove were each correct where they were written and absent one
function away. Five of the six fixes were mutation-tested.


### w52

THE POLL FALLBACK, WHICH HAD NEVER SEEN A REAL GAME. It exists for a browser
that cannot hold a streaming body open. The tested device can, so nothing in
it was ever reached by playing - and it showed: three faults, none subtle,
all sitting in about forty lines. The review offered deleting it instead and
the owner chose repair, on the header's own rule that the page is opened by
whoever finds it, on whatever they own. A fallback that is wrong is worse
than no fallback, because it is trusted in exactly the situation where
nothing else is left.

IT REPORTED THE WRONG PLAYER'S CLOCK. /api/account/playing sends
`secondsLeft`, which is the ACCOUNT HOLDER'S remaining time, and this
assigned it to api.wtime whatever colour we were. Playing black you were
shown your opponent's clock as your own, and api.btime was never set at all,
so the other side read "--" on the overlay and "unknown" when you asked.
Half of that is unavoidable - the endpoint does not carry the opponent's
clock - and half of it was a one-line mistake. What cannot be known is now
left unset and speakClocks says "unknown", which it already knew how to do.

IT NEVER NOTICED A GAME ENDING. The list is of ONGOING games, so a finished
game simply leaves it - and the code said `if (!g) return;` and went round
again, silently, every 1.5 seconds, forever. No result, no "game over", no
end to the polling. The event stream cannot rescue it either: a browser with
no streaming body fails watchEvents for precisely the reason it fell back to
polling in the first place. So in the fallback mode the game ended and the
page said NOTHING, which is the rule-5 failure in its purest form. The
endpoint carries no status, so the sentence does not guess one: "game over.
check lichess for the result."

AND A DESYNC LOOPED. On a lastMove that would not apply, it reloaded the
position from the fen and left api.moves untouched - so the next tick
compared the same stale tail to the same lastMove, failed to apply it again
because it was already inside the fen just loaded, and reloaded once more.
Every 1.5 seconds until a new move arrived. The uci is pushed now so the
comparison moves on.

THE CASTLING RIGHTS IN THAT RELOAD ARE A FABRICATION and cannot be anything
else: rights depend on history the endpoint does not send. KQkq is kept, and
it is the permissive choice ON PURPOSE. Granting a castle that is no longer
legal means the move is offered, said, and REFUSED BY LICHESS out loud -
audible, and recoverable. The strict choice would silently refuse a castle
that is perfectly legal, with nothing said to explain it, which is the worse
failure for someone who cannot see the board state we are guessing at.

TWO THINGS THAT ARE NOT ABOUT POLLING came with it, because they are the
same shape: a retry that cannot work. Every reconnect path retried flat
forever, so a network that is simply gone meant a request every two seconds
for as long as the page stayed open, draining a battery nobody is watching;
the ladder now doubles to a thirty-second ceiling, leaving the first few
retries as quick as they ever were, which is the case that actually happens.
And a REVOKED OR EXPIRED TOKEN was retried identically - an HTTP 401 every
two seconds, forever, telling the user nothing, when the one thing they
could actually do about it is the one thing nobody told them to do. It is
said once now, and the retrying stops, because retrying cannot fix it.

startSeek also assumed AbortController exists, which would throw on exactly
the browsers this fallback is for, and reported it as "Seek failed" - the
seek blamed for a missing browser feature. It is guarded like every other
one here, and a seek that cannot be held open now says the true thing: it
was sent, and the game will arrive on the event stream anyway.

WHAT MAKES THIS ENTRY WORTH READING LATER: none of this was hard, and all of
it survived the whole v-series and half the w-series, because the one device
it would have shown up on cannot reach the code. Untested does not mean
low-risk; it means the bugs are still there. The harness now drives this
path directly with a stubbed endpoint - the first tests it has ever had -
and five of the fixes were mutation-tested.


### w53

THE SAME ANSWER, FASTER. Every change here is meant to be invisible: not one
of them may alter which moves are found or what they are called. That is
also what makes the batch worth being careful about, because the failure
mode is silent. The efficiency items from the review, in one pass, with
perft and the property check as the gate on either side.

THE HOTTEST FUNCTION IN THE PROGRAM WAS PARSING A FEN. clone() is called
once per pseudo-move by legalMoves, to test whether the king is left in
check - about thirty-five times per position, and a million times in a
single perft - and every one of those went through new Position(START),
which fills a 128-slot array and then splits and regexes the starting FEN
character by character, before the next six lines overwrite every field it
had just set. Object.create skips the constructor; every field is assigned
anyway. Perft went from 7.0 seconds to 1.6.

AND attacked() DECLARED A FUNCTION INSIDE ITSELF. The slider scan was a
closure written in the body of the most-called predicate in the file, so a
function object was allocated on every call, and two array literals with it.
Lifted out, given parameters instead of closed-over variables - which is
also the first time it can be read on its own terms.

THE LEGAL MOVE LIST WAS GENERATED OVER AND OVER FOR A POSITION THAT COULD
NOT CHANGE. findMoves regenerated it per reading, per transcript - up to
eight of those - plus the fuzzy retry; sanOf regenerates it whenever it is
not handed one, because it needs it for disambiguation, so any map or filter
naming N moves generated it N times; and applyUci made the list in findUci,
threw it away, and made it again inside sanOf. All of these now pass the one
they already have. Nothing changed about what they compute, and the harness
proves it move by move: the same position named with the list and without it
must produce identical SAN, disambiguation included. That test earns its
keep - reverting sanOf to ignore the list leaves every check green EXCEPT
the disambiguation count, which is exactly the shape of the bug this could
have introduced.

collectCandidates ALSO DID WORK IT ALWAYS THREW AWAY. The reqIsEmpty test
sat below findMoves, so every request the repair chain owns - "queen takes
delta", "rook delta", anything with a constraint but no square, victim or
castle - ran the full search, both readings and the fuzzy retry, and then
had the results discarded by the next line. Hoisting it is safe for a reason
worth writing down: fuzzy parsing only ever ADDS symbols, so an empty fuzzy
request implies an empty plain one, and the retry could never have rescued
it either.

THE REST ARE SMALL AND WERE FREE. fuzzyToken re-enumerated all three word
tables and re-applied the same two filters on every unknown word, several
times per utterance; the tables are constants, so the eligible spellings are
flattened once at load. log() joined up to three thousand lines and
reassigned textContent on EVERY line whether or not the panel was open -
several hundred kilobytes built and discarded per move, on a device also
running recognition and synthesis - and now paints only when the panel can
be seen, which is a thing the toggle already knew. The keep-alive assembled
a 22KB base64 string on every start and threw it away unused on every
browser that has Blob. And bakePieces redrew the whole board once per piece
image, twelve times at boot, each guaranteed to be replaced by the next.

WHAT THIS DOES NOT DO: nothing here changes rules.js's answers, and nothing
here evaluates anything. The perft numbers are the proof of the first, and
they are unchanged across all four positions - which is also why w50's
perft work had to come first. A speed change to a move generator with no
promotion coverage would have been a gamble.


### w54

WHERE THE LOOK IS DECIDED, WHAT THE COMMENTS CLAIM, AND WHAT NOBODY WAS
USING. Three review phases in one pass, because none of them changes what the
program does and separating them would have cost more merges than it saved.

RULE 6 WAS BEING BROKEN BY THE TWO CONTROLS THAT MATTER MOST. The stylesheet
owns what a state LOOKS like and the code owns which state IS current - the
rule w21, w24 and w36 each paid for - and paintVoiceButton was writing
#91bddf and #3a5a2a into the element by hand, the same two values --accent
and --button-on already hold. renderAccount was worse: it set the signed-in
green inline AND toggled a class on the same button, so which idiom decided
the look depended on which branch ran last. Both are classes now, sharing
one .panel button.on rule with the picked time controls, because "this is
running" means the same thing in all four places. The inline properties are
CLEARED rather than overwritten, which is the move adoptPageButtonLook was
already making next door and for the same reason.

The comment above it claimed the exception: "only what a stylesheet cannot
know is set from here - the state colour". The stylesheet knew it perfectly
well. A comment that names an exception keeps the exception alive long after
it has stopped being one, which is the general form of most of this entry.

clock.js STILL PAINTS FROM CODE AND NOW SAYS SO. It was reported as the same
fault and it is not: the overlay is a second renderer, built whole from
cssText, sharing no markup with the page and no cascade to be the source of
anything - and it is the screen the owner READS across a room, tuned by eye
on the device. Moving it to classes cannot be verified by the harness. It is
left alone, with the reason written in its header, because an undocumented
exception is indistinguishable from an oversight - which is exactly how it
came to be reported.

THE COMMENTS THAT HAD STOPPED BEING TRUE. settings.js declared VERSION =
"v137" and lichess.js reassigned it, so the value was right only because one
file loads after the other: reordering the manifest would have shipped logs
naming a version this project stopped using, and a pasted log naming the
wrong build is worse than one naming none. It is declared empty and set in
one place now, and the harness asserts at RUNTIME that VERSION is a
w-number. lichess.js told every reader "when the userscript moves, re-copy
those parts" - the userscript froze at v137 and will not move, and that
instruction would have argued against every fix in w50 and w52. settings.js
described a "token" button in the log panel that this page deliberately does
not have. vocabulary.js justified a real rule with a slicing mechanism that
stopped existing when the numbered filenames did. dialogue.js pointed at the
wrong file for memoTranscript. stopEverything claimed the voice-off path
called it, which would have contradicted web delta 2 and the w50 reconnect
work; only signOut ever called it. speakWhenAudioSettled promised "a further
gap for the route to settle" and the setTimeout after the primer has no
delay - the primer IS the settling, and the comment would have sent anyone
debugging a clipped first word hunting a timing bug. rules.js advertised
".san", which has never been the name, and ".isGameOver", which has no
caller. And the page told the user to "tap the round button", which has been
a pill labelled Start since w29.

dialogue.js GOT A HEADER. It is the only file of its size that had none: the
reasoning was all there, as fifty local comments with no map over them, so
the shape had to be reconstructed by reading it end to end. The header names
the four dialogue states, says the order of handleTranscripts is
load-bearing, and records that the file has grown three jobs and that
splitting it is deliberately NOT done yet - pure motion belongs on its own,
after the behaviour has settled.

AND WHAT NOBODY WAS USING. api.mode was assigned in three places and read in
none; the log lines already say "opening stream" and "falling back to
polling", which is the same fact somewhere better. A noSpeech counter was
incremented and never read. rules.js had a `var self` its function stopped
needing. The template carried four selectors matching nothing - #logBody
(the live log body has no id), #modeRow, input.numin, and .stats .ok/.bad -
while input.whoin, #clockLine .mine and .low, which look equally suspicious,
are all live and stayed. The log panel reserved a 110px strip along the
bottom for a floating button row that moved into the page at w21, so the
blank strip was costing the log a tenth of the screen. Four FUZZY_NEVER
entries - does, then, have, note - are consumed as FILLER or PIECES before
the fuzzy matcher can ever see them, and "note" being listed as never-guess
while ALSO being a live knight spelling reads as a contradiction in a table
whose whole job is to be read. A cross-check over all the word maps found
those four and no others, and no collisions between the maps at all.

TWO SMALLER THINGS. build.js joins byte-for-byte, so a source file whose
last line is a // comment without a trailing newline would have swallowed
the next file's first line into that comment - silently, with a page that
still builds. It now ends every part's last line. And the viewport dropped
maximum-scale/user-scalable: iOS has ignored them since iOS 10 (the w25
note), so they never did the job they were added for, and everywhere else
they take pinch-zoom away from someone who may need it.

WHAT IS DELIBERATELY LEFT. pieceAskNamed's `return "that"` is unreachable
given the gate above it and stays: removing a defensive default so a
dead-code audit comes out clean would leave the function returning undefined
in the case nobody predicted. That is the trade this whole entry is about,
pointing the other way, and it is worth having both directions on record.


### w55

THE TESTS, AND THE LAST OF THE STRAGGLERS. Mostly work on the things that
check the program rather than the program itself - which is where this whole
review started, and a fitting place for it to end up again.

THE VOCABULARY NOW REFUSES TO START IF IT CONTRADICTS ITSELF. expand() has
always thrown when one word is given two values inside a single map; nothing
checked a word appearing in two DIFFERENT maps, where it is just as wrong and
much quieter - parseTranscript tries NATO, then NUMS, then PIECES, then the
take words, so the collision is resolved by that order, silently, and the
loser's meaning simply never happens. These tables only ever grow, one real
game log at a time - "cakes" at w48, "text" at w44, the whole plant family -
and a homophone landing in two of them is exactly what two sessions reading
two different logs would do. Checked at load and thrown, like expand() does,
because a grammar that is wrong should refuse to start rather than quietly
mean something else. Current data is clean; adding "rook" to the NATO g-line
now fails with the two map names.

THE PROPERTY GENERATOR NEVER SAID "CASTLES", NEVER PROMOTED A PAWN, AND
NEVER USED A BARE LETTER. Three whole branches of the grammar with no
generated coverage at all - and the letter forms are two lines in parsing.js
that the harness itself notes could be refactored away with every test still
green, and they are the owner's natural English under time. Added, along with
piece+file, "pawn takes" and "piece takes".

IT FOUND SOMETHING IMMEDIATELY, and the finding was that the PROPERTY was
wrong. "pawn hotel" - a piece and a lone file - failed rule 3 five times on
clean source. matching.js applies the strict no-capture-without-a-take-word
filter only when a WHOLE destination square was named and the origin was not,
and says so in its own comment: a lone file pins no destination, so the
bare-square reading is not on the table to be confused with. Rule 3 was
written against req.squares and could not see that distinction. Restated in
the same terms the code uses, it holds - and the game6 mutants (delete the
pawn-capture filter, delete the piece filter) are still caught, by rule 2 and
by rule 3 both, which was checked rather than assumed. That is now the SECOND
time this file's own comment has been right: the first thing a property test
finds is usually the author's misunderstanding of the invariant.

The seed is an argument too. The position count has been tunable since this
file was written and the seed was not, so every soak run re-tested the same
games, only more of them.

THE HARNESS RUNS IN A THIRD OF THE TIME: 19.5 seconds to 6.5. Two causes,
and the interesting one is a product bug. acceptMove scheduled the practice
opponent as setTimeout(dryOpponentReply, 1600), which captures the function
REFERENCE - so the harness stubbing dryOpponentReply out only affected
replies scheduled afterwards, and the one already in flight ran the original
regardless. That is why a 1.7-second sleep sat in the middle of the suite
absorbing it, with a comment admitting it "still races". Scheduling a call by
name instead is late binding, costs nothing, and means the current definition
is the one that runs - the wait and the race both go. The other cause was
plain margin: the TTS stub fires onend after ONE millisecond and the waits
were 120, so they are scaled, with HARNESS_SLEEP=1 to put them back if
anything ever looks flaky. Five consecutive runs, all 250 passing.

AND THE LAST BEHAVIOUR-BY-GREP TESTS ARE GONE. "Voice off tears down no
network" read an 800-character window of ui.js ending at a string and
asserted three identifiers were absent from it - a test whose result changes
if someone adds a paragraph of comment above the function, and which says
nothing about what happens when the button is pressed. It presses the button
now and watches what gets called; adding an abort to that path fails it.
Same for leaving practice, the re-parented button row, and the overlay
touch-action, where the old grep would have matched the assignment inside the
comment explaining why the viewport meta cannot do that job.

TWO SMALL THINGS FROM THE REVIEW'S TAIL. "flip clock" repainted and said
nothing, which is fine while you are looking at the overlay and is silence
everywhere else - and it is a VOICE command, reachable with the overlay down,
where the repaint is invisible and nothing else happens at all. It answers
with the new state rather than "flipped", because a confirmation has to carry
information to earn its airtime. And loadSettings read and parsed the same
localStorage key twice, with two catch blocks disagreeing about what to say
when it failed.

WHAT IS DELIBERATELY DOCUMENTED RATHER THAN CHANGED. "Yes", "no" and "cancel"
with nothing open stay silent: CANCEL_WORDS contains "stop" and "forget",
which land in ordinary speech at the board more often than as commands, and
answering every one with "nothing to cancel" is the flat repeated speech the
sound arc ended by deleting. Commands are still read from the primary
transcript only: a missed command costs one repetition, while a command
invented from a reading the mic ranked second could resign a game. And
partialAsk's "both halves came from the user" is not literally true since w49
- a rival reading may raise the question - but the question is the safeguard,
because nothing plays until the user has answered.


### w56

THE DOCTYPE, WHICH THIS PAGE HAS NEVER HAD. One line, and without it every
browser has parsed the page in QUIRKS MODE - the compatibility mode for pages
written before the standards existed - since w1. It works, which is exactly
why nobody noticed: quirks mode is not broken, it is DIFFERENT, and the
differences are almost all about size.

That is the whole risk here, and it is worth stating plainly rather than
burying: percentage heights resolve differently in standards mode, and line
height and font inheritance behave properly. Everything on this page was
tuned BY EYE ON THE DEVICE while the page was in quirks mode - the clock
digits, the panel heights, CLOCK_BARE_MAX_VH and the rest of the vh budgets
in settings.js. So of every change in this review, this is the one that can
move what the owner actually sees.

It is its own version and its own commit for that reason. If anything reads
wrong at arm's length, revert THIS and nothing else, and everything from w50
to w55 stays. And do not retune the sizes in the same change: measure on the
device first, then decide whether anything needs moving at all. A number
adjusted to compensate for a mode that has already been fixed is a number
nobody will be able to explain later.

THE TEST ASKS THE TEMPLATE, NOT THE BUILT PAGE, and the reason is worth
recording because the first version of it was wrong. Reading the built
index.html passes locally and fails on every clean checkout: checks.yml runs
the harness BEFORE build.js, and the root index.html is gitignored, so there
is nothing there to read. build.js maps the template line by line and
replaces only the AUDIOPLAY_JS line, so line one of the template is line one
of the page. The position is asserted, not just the presence - a doctype
anywhere but first does nothing at all, which is a thing that would otherwise
look fixed and not be.


### w57

PURE MOTION, ON ITS OWN, AFTER THE BEHAVIOUR SETTLED - which is what w54's
new dialogue.js header said would happen and why it said not to do it yet.
Nothing here changes what the program does. The four structural items from
the review, and one footgun found by falling into it.

dialogue.js WAS THREE FILES. It ran to 1,692 lines and did three jobs: decide
what a sentence means and what to say back, simulate a practice opponent, and
repair an utterance that almost worked. Now 1,217, plus practice.js at 94 and
repairs.js at 461.

PRACTICE IS NOT DIALOGUE. It shares exactly one flag with the rest of the
program - dryRun - and that flag is declared with it now, because this is
what owns it: everything else only ever asks. It is the most separable thing
that was in there and it had been sitting in the middle of the ambiguity
code since the v-series.

THE REPAIR CHAIN HAD GROWN ITS OWN DOCTRINE, which is the real argument for
its own file: order is data (REPAIRS is a list you can read, and reordering
it changes the grammar), a repair fired by a rival reading may only ASK
(w49), and ask about whichever half still narrows (w43, w48 - the rule that
was proved in one repair, left there, and broken in the repair next door for
five days). Three rules that are about repairing, and were previously
scattered through a file that is mostly about something else. refuse and
heardSoFar stayed behind: the repairs lean on them, but so does
handleTranscripts, and they are how the program says what it HEARD rather
than part of repairing it.

THE TWO CLASSIFIERS MOVED to parsing.js beside classifyCommand, which is the
same kind of thing they are. They had been in the word-table file, and that
had already misled once - dialogue.js's own comment pointed a reader at
"memoTranscript in parsing.js", which is where it belonged and was not.
Both true now.

AND CHECK/MATE NARROWING IS ONE FUNCTION. There were two copies, ten lines
each: one over candidates, which carry their san, and one inside
partialAnswer over raw moves, which have to be named first. Check and mate
are the two words in this grammar that describe the position AFTER a move
rather than the move itself, so they are exactly the handling that should
not fork. Both callers keep their own idea of WHETHER check was said -
partialAnswer also honours one from the earlier half of the utterance - and
share the filtering.

NOTHING WAS LOST IN THE MOVE, and that was checked rather than trusted: the
set of top-level declarations across the old three files and the new five is
identical but for narrowByCheck, the de-duplication above. 255 pass,
properties and perft green.

AND build.js WILL NO LONGER EAT ITS OWN SOURCES. Its arguments are (manifest,
output), and reversing them - easy, since the manifest is the one you name
more often - truncated manifest.txt to nothing and reported success. Twice,
in one session: the second time while TESTING the guard written after the
first, because that guard only asked "is the output a file I read" and
pointing the manifest argument at a copy leaves the real manifest.txt outside
that set. The rule is about the SOURCES, not this run's inputs, so it says
so now: not a file just read, not anything in src/, not anything named like a
manifest. Recorded because the near-miss is the interesting part - a build
step allowed to be dumb is not allowed to be destructive, and the second
failure came from fixing the first too narrowly.

THE MANIFEST IS ALSO CHECKED NOW. A new file in src/ that nobody adds to the
manifest is simply not in the page - it builds, it passes, it runs, until
something calls a function that was never shipped. Splitting one file into
three is exactly when that happens, so the harness compares the two lists.
The other direction kills the harness at startup with ENOENT and build.js
with MISSING, which is loud enough already.


### w58

"QUEEN CHECK", FROM A REAL GAME. The first finding that came from playing
rather than from reading, and it is the kind only playing finds: an
asymmetry nobody would predict, in a place both halves of which look
finished.

MATE HAD A REPAIR AND CHECK DID NOT. Game w56-1, 16:50:47: "queen check",
refused with "that is not a legal move". Said again twelve seconds later,
refused again. Qa4+ was on the board the whole time, and the owner played it
seventeen seconds after that by naming the square instead. A piece plus a
check word constrains nothing the constraint set can hold - check is a fact
about the position AFTER the move - so it parses to an empty request, finds
no candidates, walks the entire repair chain and falls out of the bottom.
Which is exactly the shape v117's mate repair exists to catch, and it was
written for the RARER of the two words.

The new repair is the mate repair's twin and deliberately so: same gate, same
"one plays, several ask", the mating moves swapped for the checking ones
(/[+#]$/, not /\+$/ - if the only check available is mate, "queen check"
still means it).

MATE UTTERANCES ARE EXCLUDED FROM IT TWICE OVER, because MATE_WORDS is a
SUBSET of CHECK_WORDS and "checkmate" satisfies both. The check repair tests
for mate words itself AND sits after the mate repair in the list, so neither
depends on the ordering to be right - the ordering is there so the more
specific one is reached first, not so it is the only one that can be.

WHAT IS WORTH REVISITING IF IT EVER MISFIRES: this plays on a unique fit, and
"queen check" is thin evidence - a piece and a fact about the resulting
position, with no square at all. What makes it acceptable is the rule the
whole grammar rests on and nothing here weakens: uniqueness is counted over
EVERY legal move of that piece, so a word lost off the front can only ever
turn one candidate into several, which asks. It cannot turn one candidate
into a different one.

AND THE READ-BACK WAS SWALLOWING THE WORD. "Queen check" came back as "I
heard queen" - the w44 fault from the other side, and visible twice in that
same log while the owner was trying to work out what the machine had heard.
Check words were consumed by nothing at all: they fell through every branch
of the token loop and off the end, and only saysCheck, reading the raw text,
ever knew they were there. The parser notes them now - saidCheck, saidMate,
constraining nothing - and heardSoFar says them last, where they are spoken.

A TEST NOTE WORTH KEEPING. The first version of the "checkmate still goes to
the mate repair" test asserted on the move that came back, and PASSED with
the guard deliberately removed: the board it used had only one checking rook
move, which was the mate, so both repairs gave the same answer. The claim is
about WHICH REPAIR ANSWERED, so that is what it asserts now - the log names
it. A test that cannot tell the two branches apart is not testing the branch.


### w59

"CLEAN" IS A QUEEN. Game w58-1: "queen check" came back from Safari as "Clean
check", twice running. The move was recovered anyway - the second time a rival
reading had it right, and w49's rule let that raise a question - so the log
shows the safety net working rather than a move lost. But the net should not
have been needed.

THE FUZZY MATCHER COULD NEVER HAVE SAVED IT, which is the part worth knowing:
"clean" is THREE edits from "queen" and two from "quean", and a five-letter
word is allowed one. No amount of near-miss tolerance reaches it. Only a named
spelling does, which is what this table is for and why it only ever grows from
real logs.

AND IT IS EXACT-ONLY, because it is the first queen spelling that is an
everyday English word, and it is badly shaped: clear, clan, lean, glean,
cleans and cleat all sit ONE edit away, and "clear" and "lean" are both things
a person says at a board. As a fuzzy target it would turn all six into queens.
Named as a spelling it matches when spoken and seeds nothing - the v121 and
v134 treatment, for the same reason both of those got it.

WHAT THE LOG ALSO SHOWS, and it is the reason this entry is short: everything
else in that game worked. The check repair from w58 played Nc6+ from "Night
check" and Qa4+ from "Queen check" the moment the word landed cleanly. A rival
reading raised a question rather than playing, as w49 requires. A half-heard
"97 | Night seven" recovered through the rank question. The only fault in
twenty minutes of play was a word the microphone did not deliver, and the only
fix available for that is the table.


### w60

WHAT THE PAGE SAYS MUST BE TRUE. A targeted review of the four thin spots
the big review left behind - request construction against the Lichess spec,
the three untested device-bound files, the poll fallback, and clock.js -
produced thirty-nine more findings (91-129 on the running checklist). This
is the first batch: the five where something SPOKEN or SHOWN could be false.
For an eyes-free player the spoken answer is not a report about the state,
it IS the state; each of these was a place the two could disagree.

A REFUSED ACTION WAS ANNOUNCED AS DONE. postAction logged the HTTP status
and resolved with nothing, so confirmedAction could only tell "network
worked" from "network failed" - and spoke "resigning." over a 400. The
Board API 400s these paths in ordinary play: resign during the abortable
first moves, a takeback accepted after the opponent withdrew it, a draw
accepted after the offer expired. Each was announced as having happened.
w50 made the answer wait for the POST, and waited for the wrong half - the
catch, not the status. It now speaks Lichess's own reason ("lee chess
refused that. Cannot resign, game is aborting"), and a dead token routes
through noteAuthFailure's sentence instead of pretending, on actions and
moves both - with the repeat case answered by a short "still signed out"
rather than swallowed, because noteAuthFailure speaks only once and a
silent true would have traded one rule-5 violation for another.

PRACTICE INHERITED A REAL GAME'S CLOCK. dryStart set both clocks to ten
minutes but never touched api.clockAt - which every real-game clock event
sets and nothing cleared. remainingMs extrapolates whenever clockAt is set,
so practice AFTER a real game showed the user's half at a red 0:00 - a
flagged clock in a mode that has no clock - while practice on a fresh page
showed the frozen "10 / 10" the owner knows. The difference between the two
is one stale timestamp. clockAt is nulled in dryStart, cleared in signOut,
and declared in the api initializer so its lifecycle is visible - it had
been born dynamically, which is how it escaped every reset.

THE SPOKEN "CLOCK" OVERSTATED THE OPPONENT'S TIME. speakClocks extrapolated
the user's clock through remainingMs and read the opponent's RAW base - so
asking during their think, which is when you ask, reported their time as of
the last server event, overstating it by their whole think so far. The
overlay has always extrapolated both sides through the same function; the
spoken path now does too. Two reviewers found this independently, which is
what a fault sitting on a seam deserves.

THE GLANCE BOARD SHOWED WHITE AT THE BOTTOM AFTER SAYING "YOU ARE BLACK".
repaintTick's fingerprint carried neither api.myColor nor api.pos, and
handleGameFull triggers no repaint - so joining as black, the tick that
consumed the gameId change painted an unflipped start position, and nothing
repainted until the first move bumped moves.length. The board's whole job
is confirming the pipeline and Lichess agree; orientation is part of what
it confirms. Both fields are in the fingerprint now.

AND ONE IGNORED QUESTION MADE EVERY LATER MESSAGE STICKY. questionOpen
tested the raw pieceAsk/partialAsk variables, but those are deliberately
left set when overtaken - dialogue.js makes them inert with a ply check
rather than nulling them. So after one repair question the user answered by
just saying a different move, the strip held every subsequent passing
message forever, against its own stated contract. questionOpen now applies
the same ply test dialogue.js does, so the strip and the dialogue agree
about what "open" means - w54 fixed this function's LIST of states, and
this fixes their LIVENESS, which is the second half of the same lesson.

All five mutation-tested. The checklist for the remaining batches (92-123,
128-129) lives with the review; next is the humans batch - challenge
keep-alive, blitz seek presets, opponent-gone.


### w61

THE OTHER PLAYER IS A HUMAN. Second batch from the targeted review
(92-94, 96-98 on the checklist), and every item is the same discovery
from a different angle: this page has only ever played maia, and maia
is a flattering opponent - it accepts a challenge within a second,
never disconnects, never starts a bullet game from its phone, and
never plays chess960. Each of those kindnesses was hiding a hole.

A CHALLENGE QUIETLY DIED AT TWENTY SECONDS. The spec is verbatim about
it: realtime challenges "expire after 20s if not accepted. To prevent
that, use the keepAliveStream flag." The page never sent the flag,
said "waiting.", and a human who took half a minute to notice was
accepting a challenge that no longer existed while the eyes-free user
waited on it. The flaw was exactly the size of the gap between a bot
opponent and a human one. The challenge now streams and lives as long
as the connection is held, the seek's own lifecycle handled the seek's
own way - and aborting the stream CANCELS the challenge, which is what
sign-out and practice should do to one anyway, and now do. The final
"done" line is logged, not spoken: decline arrives as challengeDeclined
and accept as gameStart, and both already speak.

AN OPPONENT WHO LEAVES IS NOW HEARD ABOUT. The stream has always sent
opponentGone with the claim-victory countdown; the page logged the
event type and did nothing - in an app whose own header worries about
that window from the other side. A sighted player watches the banner;
an eyes-free one heard silence while their clock was the only one
moving. Spoken once per departure, and when the window opens it becomes
"you can claim the win. say yes to claim it, no to keep waiting" -
through the same CONFIRMS machinery as resign and the draw, so the
answer paths, the displacement rules and w60's status handling all
apply for free. Declining is declining, not snoozing: the question only
re-arms on a fresh departure.

A REFUSED SEEK NOW SAYS WHY, AND BLITZ IS TOLD THE WAY OUT. The
challenge path has parsed Lichess's {error} body since w1; the seek
path said "HTTP 400" and left the user to guess a rule they could not
guess: the Board API accepts only RAPID AND SLOWER for public seeks,
while blitz is fine for direct challenges. So half the preset row -
3+0, 3+2, 5+0, 5+3 - was refusable at one button and fine at the one
beside it. A blitz 400 now ends "Blitz seeks are not allowed -
challenge someone instead." The presets themselves stay: they are
legitimate for challenges, and the board API remains the only truth
about what a seek may be.

AND A GAME THIS APP CANNOT PLAY IS NAMED, NOT MANGLED. gameStart
carries compat.board for games the Board API will not accept moves
for - a bullet game started from the phone app used to auto-join and
then 400 every single move, which reads as the grammar breaking, not
as the game being out of scope. It is refused out loud now, before the
join. Variants the same: chess960 castling arriving as king-takes-rook
would have hit the illegal-uci resync on every event, a loop of ERR
lines over a board that cannot be trusted. "This app plays standard
chess only. play it on lichess." fromPosition stays playable - it is
standard chess from a custom start, and initialFen already handles it.
The gameStart handler also reads gameId before the legacy id field,
per spec.

All five mutation-tested. Still unreachable by the harness: a real
human taking real seconds to accept - the twenty-second expiry can
only truly be confirmed by challenging one.


### w62

THE POLL BECOMES A WHOLE FALLBACK, AND w52 GETS ITS CORRECTIONS. Third
batch from the targeted review (111-123), all one subsystem. w52 repaired
this path's arithmetic and never asked whether the path could be REACHED -
and it could not, not for the case that matters. gameStart arrives on the
account event stream, which needs the same streaming body these browsers
lack. So the fallback could FOLLOW a game that existed at sign-in and could
never START one: the seek was lodged, the opponent's clock ran, and
startSeek's own comment promised "the game arrives on the event stream
either way" - false in exactly the browsers the sentence was written for.

POLLING NOW DISCOVERS AS WELL AS FOLLOWS. With no live game, the most
urgent entry in nowPlaying becomes a join; watchEvents hands over to the
poll when it has no streaming body, the way startStream always has; the
seek's no-body path starts the watcher instead of promising one. And the
poll no longer stops when a game ends - in a poll-only browser that made
the first game the last, with nothing left to notice the next one.

THE MID-GAME JOIN WAS SILENTLY WRONG. First sighting built the START
position and replayed one move, so joining a game in progress - the COMMON
poll case, a reload mid-game - with a lastMove that happened to be legal
from the start position left the page holding a one-ply board against a
thirty-move game, refusing and matching against squares that held nothing.
The endpoint's fen is full; it is loaded, and the join says whose move it
is, exactly as the stream join does.

w50'S MIC-GATE LESSON, APPLIED A THIRD TIME. pollOnce still gated on
`running`, four functions below the long comment explaining why
scheduleReconnect must not - so voice off froze moves, clocks, and the
game-over inference, and a game that ended during voice-off was missed
forever once startPolling's pollSeen reset met ui's voice-on reconnect.
The gate is gone and pollSeen is per-game state now, reset in joinGame
beside everything else per-game.

AND THE REST OF THE CLUSTER: a revoked token in poll mode 401'd every 1.5
seconds forever, telling the user nothing - the exact disease w52 cured
for the streams, untouched in the one transport with no stream; it now
speaks the same sentence and halts. The game-over inference takes TWO
consecutive missing ticks instead of one irreversible reading. A response
landing after practice was tapped could join its stale game INTO practice
through the new discovery branch - the mutation test for this one is worth
reading, because the first version of the test used an empty response and
proved nothing. nb=50, the endpoint's maximum, so a correspondence
account's live game cannot rank off the page and read as nonexistent. Four
straight failures stretch the cadence eightfold; one success restores it.
eventFails resets after the body check, not before. A stream that opens
takes the poll down with it, so one transient body-less response cannot
leave two transports racing forever. And a fresh token re-arms authGone,
which until now relied - undocumented - on sign-in navigating away.

THE w52 CORRECTION, owed by convention: that entry says the desync
reload's castling rights "depend on history this endpoint does not send"
and defends KQkq as the permissive fabrication. Both halves are wrong. The
endpoint sends a FULL fen - rights, ep, turn, the lot (doc-verified) - and
Position.load reads fields from the front, so the fabricated tokens
appended after a full fen were IGNORED and the real rights were in use all
along. The code was accidentally better than its comment, purely because
load() tolerates trailing junk. The reload now loads the fen whole and the
reasoning is gone. w52's entry stays as written - the mistakes are the
record - and this one is the correction beside it.

Eight fixes mutation-tested, including the sharpened race test above. The
whole cluster remains provable only down to the harness's stubs: no real
browser without a streaming body has ever run this page, and until one
does, this is the best that reading and simulation can do.


### w63

RESILIENCE, AND THE END OF THE SECOND CHECKLIST. Fourth and last batch from
the targeted review: the failures that arrive from OUTSIDE - an OS
interruption, a rate limit, a promise resolving after its moment has passed -
plus the nitpick sweep. With this, everything actionable from findings 91-129
is done or explicitly declined below.

A WEDGED SYNTHESIZER IS RESET, NOT WALKED PAST. An iOS audio-session
interruption mid-utterance - Siri, a call, an alarm - can leave
speechSynthesis stuck, with new utterances queued inside it and never
started. Every item then died the same way: onstart never fired, the guard
advanced past it, and the page went PERMANENTLY SILENT while looking, to
every test it has, like it was speaking - the worst rule-5 failure this
program could have, because it defeats the very watchdog meant to prevent
it. The detection signal was already computed for the debug log and used for
nothing: the guard firing with tStart still 0 means the utterance NEVER
STARTED. That branch now cancels and resumes speech synthesis - our own queue is
untouched, items being handed over one at a time - and says so in the log.

THE KEEP-ALIVE FIGHTS BACK. The OS can pause the session-holder audio too -
same interruptions - and nothing observed it: the layer whose whole job is
keeping the audio session alive was silently dead until the next tap, and
Control Center could not resume it because the media-session pause key is
mapped to repeatLast. A pause listener now distinguishes OUR pause from the
OS's by a one-flag handshake and asks to play again. Writing its test found
a harness hole worth recording: the element stub had no setAttribute, so
startKeepAlive has been THROWING mid-setup in every harness run since w20 -
caught, logged, invisible - and the keep-alive tests were exercising a
half-built element. The stub carries attributes now.

A WAKE LOCK GRANTED AFTER EXIT IS RELEASED. Enter clock mode, tap straight
out, and the lock request resolved with the overlay already down: release()
had found null and done nothing, the lock landed in the sentinel anyway, and
the screen never slept again - with the next enter overwriting and orphaning
it besides. The grant now checks the mode is still on, releases itself if
not, and releases any predecessor before taking the slot.

A 429 ASKS FOR PATIENCE. Lichess's rate limit asks for a minute's grace, and
this page answered it with the two worst possible responses: "Lichess
rejected that move" - which invites saying the move again immediately - and
reconnect ladders whose early rungs are exactly the eager retrying being
objected to. A rate-limited move or action now says "lee chess asks us to
slow down", and all three retry paths - both streams and the poll - jump
their ladders straight to the cap.

THE SWEEP: the inter-chunk speech gap can no longer be skipped by a
concurrently arriving sentence (speaking stays held across the gap); a
browser with no speechSynthesis at all now says so in the log it tells
users to paste; the piece art logs which glyph failed to load; board.js's
header pointed at a file that has never existed ("app.js"); startPieceAt's
orientation-blindness is documented with the coupling that makes it safe;
the keep-alive header said "1 second" over half-second code; the clock
teardown nulls all three of its references, not one; and the four remaining
hardcoded origins spell LICHESS_BASE.

DECLINED, WITH REASONS, so the next reader does not re-open them: the OAuth
state parameter and sessionStorage verifier (finding 99) - doc-recommended,
but sign-in is the one flow the harness cannot test at all, and churning it
to add login-CSRF protection to an app whose server-side state is one
Lichess token was judged a bad trade; revisit if sign-in is ever touched for
its own reasons. Two tabs fighting over the event stream (101) - real,
spec-documented, and inherent to one token per stream; a comment marks it.
And the strip-on-entry and portrait-width observations (129) stay
observations: both are device-look questions, and w56's rule stands - do
not retune what you have not measured on the machine that matters.

Four mutation tests. The second checklist closes at thirty-nine findings:
thirty-two fixed, four documented as deliberate, three declined with the
reasoning above.


### w64

THE BLITZ PRESETS ARE GONE. w61 discovered the asymmetry - the Board
API refuses blitz for public seeks and permits it for direct
challenges - and answered with a spoken explanation, keeping the
buttons because they were legitimate one button over. The owner, on
learning what the message actually meant, drew the simpler line:
almost every game here starts from the pool, so 3+0 through 5+3 were
four buttons whose main use could only answer "refused". SIMPLIFY.
The row is now 10+0 to 30+20, all seekable; the rare blitz challenge
to a named opponent goes through Custom, which takes any #+# it always
took, and the w61 hint stays for exactly that path. This also settles
the doubt recorded in w33's template comment ("the owner doubts blitz
too; it stays until a real game settles it") - settled by the API's
rulebook rather than a game.

One trap in the removal: the picked time is REMEMBERED by value, so a
device that had 5+3 saved would restore an invisible pick - no button
lit, selectedTimeControl() quietly blitz, the seek refusing for a
reason nothing on screen shows. A saved preset now restores only if
its button still exists; a retired one reads as never chosen, the same
as junk in storage. The harness proves that path with a 5+3 planted in
storage, and the preset-count test now derives blitz from Lichess's
own formula (60*min + 40*inc < 480) instead of counting to nine.

### w65

"ROOK B8" CAME BACK AS "RUGBY". Game w64-1, 21:14:58, and the shape is
one this project already knows: Safari runs a piece name into the file
that follows it, which is why COMPOUND exists and why "rookie" is in
it. What was new is not that it produced a real English word - the
first draft of this entry said "every previous fusion produced a
non-word", and the owner corrected it on sight: "rookie" is one of
these, "politics" is another, and both are as ordinary as "rugby".
The table has always been full of real words.

WHAT WAS NEW IS THAT BOTH READINGS FUSED. Safari returned "Rugby" and
"Rugby eight" - the same damage twice, no undamaged rival. Every other
mishearing in that game had one: "Rug B8" was rescued by "Rock B8",
"Rug D2" by "Rock D2", four times over. That is the difference between
a mishearing that costs nothing and the one utterance in the game that
died outright ("Say again."), and it is not a property of the word at
all - it is a property of the LIST. A fix that assumes the rival
readings disagree has nothing to work with when they agree.

Also the first fusion onto a file other than e. The pattern behind all
of them is audible once named: the fusion happens where the spoken
letter ENDS IN THE "EE" SOUND - b, c, d, e, g - because that is what
runs into the tail of the piece word. "Rook e" makes "rookie", "rook
b" makes "rugby". Which is a prediction, not just a description, and
the holes it points at are written up under w66.

"RUG" IS A ROOK. The same game returned it four times - "Rug B8", "Rug
takes Echo for", "Rug D2", "Rug takes foxtrot five" - and all four
survived on luck, because a rival reading happened to spell the same
move "Rock". The demotion heuristic even reported them as the complete
reading minus its first word, which is exactly right: with "rug"
unknown, "Rug B8" carried no rook evidence at all. Alone, any of them
would have been a lost move. Three letters, so both ends of fuzzyToken
refuse it - it can neither be reached by a near-miss nor seed one.
"Rue" and "Route" appeared once each and are NOT added: single
sightings, both rescued, and "route" is long enough to be a fuzzy
target with a bad halo around it.

COMPOUND IS NOW CROSS-CHECKED against the other four tables, which w54
built the guard for and did not cover. It is consumed FIRST in
parseTranscript - before NATO, NUMS, PIECES and the take words - so a
word in both wins there and the other meaning silently never happens.
That mattered little while the table held only non-words; "rugby" is
the first entry anyone could plausibly reach for twice.

Three mutation tests, and the second one earned its keep. The first
version of the "rug" board put a lone rook on b1, where "bravo eight"
named exactly one move whoever was said to be moving - so the test
passed with "rug" deleted. The board now has a rook AND a queen able
to reach b8, so the piece word is load-bearing and the bare square
asks. Same lesson as w28 and the w63 mate-repair test: a test that
passes with the fix removed was never testing the fix.

### w66

THE OWNER READ w65 AND SAID: "rookie" and "nighty" are not non-words.
Correct, and the entry has been fixed where it stood - "politics" is in
that same table. The claim was not just wrong, it was pointing at the
wrong thing entirely, and correcting it produced the actual lesson:
what killed "Rugby" was that BOTH readings fused identically, so the
rival-reading machinery that rescued "Rug B8" four times over had
nothing to offer. Never a property of the word.

Their next question - what other examples await us - turned out to be
answerable rather than something to wait for. The fusion happens where
the spoken letter ends in the "ee" sound, because that is what has
nothing to separate it from the tail of the piece word: e is "ee", b is
"bee". Probing the family against the loaded vocabulary found the hole
immediately, and it was not in some untested corner - it was in an
entry that has been there since the userscript.

"KNIGHTIE" IS THE ONE SPELLING SAFARI WILL NOT WRITE. The knight+e
fusion has always been accepted, spelled with the silent k. But PIECES,
three tables up in the same file, records what Safari actually does
with the word - it writes NIGHT, k gone, and has done in every log this
project has. So the fused form arrives as "nightie" or "nighty" and hit
neither. Both are now entries. This is not a new fusion; it is the same
one, finally spelled the way it turns up. "knightie" stays - one line,
and something may yet produce it.

AND IT DOES NOT FAIL LOUDLY, IT DRIFTS. Without the entry, the fuzzy
matcher rescues "nightie" as "nights" and hands back a knight with no
file, leaving the "4" to be re-read as a FROM-rank: "I heard knight
rank 4. Say the file." The piece survives, the destination evaporates.
Worth naming because it sets what a test here has to assert - the
destination square, not the piece. A test that only asked "is it a
knight" would pass on the broken parse.

Two mutation tests, and the second board needed rebuilding for exactly
the reason the first did in w65: with ONE knight, the drifted parse
still landed on Ne4 and the test passed with the entry deleted. A
second knight reaching a4 makes "the knight move to rank 4" ambiguous,
so only the real split can answer. That is twice in two versions, which
is the argument for running the mutation every time rather than when it
feels warranted.

NOT ADDED, AND DELIBERATELY: queen+e ("queenie" - which probes exactly
as "nightie" did, piece rescued and file gone), king+e, pawn+e, and the
c/d/g half of the family. Every one is a guess. This table has grown
one real log at a time since v114, and the difference between "nightie"
and "queenie" is that the knight+e fusion is ALREADY accepted here and
merely misspelled, where queen+e has never been seen at all. Left for
the owner to call, with the probe method written down so the next
sighting is cheap to confirm.

### w67

THE OWNER READ A LOG LINE AND SAW WHAT IT WOULD LOOK LIKE TO SOMEONE
ELSE. "utterance never started - resetting the ___" meant the iOS
speech synthesizer and nothing else. It is also, word for word, what a
cheating client would print. This project asks users to paste that log
when something goes wrong, and the reader of a pasted log has no way to
tell which sense was meant - the one they would assume is the one that
gets the owner banned.

CONSTRAINT 1 ALREADY BANNED THE WORD. It has since the userscript. What
it did not do was survive being restated: header.js carried the rule by
NAMING the word ("... is deliberately absent"), which reads as
authoritative and is unenforceable, because the file stating the ban is
itself a hit. Nothing could grep for it without finding the rule. So the
word came back in the speech layer, in a sense nobody would object to,
and printed.

THE RULE NOW HOLDS ITSELF. It is stated without using the word, in
header.js and CLAUDE.md both, and the harness greps the WHOLE REPO and
fails on a single hit - naming file and line. The needle is spelled in
two halves so the harness can scan itself; cute, but exempting the
harness is the shape of the thing that went wrong the first time. This
is the one place grepping is right, and the exception is worth stating
next to w27's rule rather than looking like a violation of it: w27 is
about testing BEHAVIOUR, where finding a string proves nothing. Here the
text IS the claim.

The scan found two more than the first pass did, both in Markdown, both
missed for the same silly reason - the hand grep was case-sensitive and
they were capitalised. Which is the argument for the test over the
habit.

ONE EXCEPTION, AND IT IS FORCED: the frozen v137 artifact carries the
word in four comments and is sha-locked. The lock is the point of
freezing it; re-stamping the sha to edit a comment would throw away the
guarantee to fix cosmetics. It never LOGS the word, so nothing it
produces can reach a pasted log. The rest - HISTORY, reference/,
us-header - is clean.

Wording, for the next person: SYNTHESIZER, SPEECH SYNTHESIS, or THE
VOICE. Not "voice" where a voice PICK is meant, though; settings already
log voice=system and the two would read as one thing.

### w68

THE OPPONENT HAD NO NAME. Not hidden, not truncated - never captured.
gameFull has carried both players since w1, and handleGameFull read
exactly one field of it, white.id, to decide which colour you are, and
dropped the rest on the floor. Nothing on the page or in the log ever
said who you were playing. The owner noticed the only way anyone could:
they only ever play maia, maia's name is already sitting in the
opponent dropdown, and so the absence had no way to announce itself.

Both players now render under the board - name, rating, and title,
because BOT is worth knowing - in the clock line's own white-then-black
order (w39) with the same brass marking your side, so the two lines
stack into one block. The log line names the opponent too: a pasted log
should say who was on the other side.

BEHIND A SETTING, because that is how it was asked for and it is the
right shape. This page is for playing at a real board without looking
at the screen, so anything permanent has to earn its room. "show
players" is the Zen-mode choice with the sense reversed - a setting
reads better as the thing it turns ON - and off leaves the row out
rather than blanking it, so nothing shifts. It repaints on the flip:
its whole effect is something already on screen, and a switch that did
nothing until the opponent moved would read as broken.

TWO SHAPES OF PLAYER, and the second one has no name at all: a Lichess
AI slot is {aiLevel} and nothing else, which would have rendered
"undefined" next to your own name. Normalised at the edge, so nothing
downstream knows there were two shapes.

AND w60'S LESSON, ONE FIELD OVER. Practice mode clears the players for
exactly the reason it nulls clockAt: play a real game, then practice,
and the panel would name the opponent you just finished with, beside a
board they are not on. The repaint fingerprint gained them for the
mirror-image reason - they arrive with gameFull, which on a REJOIN can
land with gameId and moves.length both already settled, so nothing else
in the list would move and the names would sit blank under a board that
is otherwise right. Three mutation tests, one per hazard.

NOT A FAIR-PLAY QUESTION, and the settings comment says so where the
next reader will look. Constraint 1 is about MOVE CHOICE. A rating is a
fact about a person, not about the position, and no rating ever
suggested a move. The move list is the thing that would start to look
like analysis surface, and it stays absent - the owner ruled it out in
the same breath as asking for this, which is the right instinct.

DECLINED FOR NOW: emulating the Lichess layout - board offset left,
clocks in a right-hand rail. Reasons in the reply that asked for it,
but briefly: the clocks already sit directly under the board, which is
a shorter eye path from across a room than a side rail, and the whole
page is one column on purpose. Reopen it on the device, not here - w56's
rule, do not retune what you have not measured on the machine that
matters.

### w69

FOUR THINGS FROM ONE EVENING ON THE DEVICE, two of them bugs the owner
hit and two of them answers to w68's open questions.

THE SETTINGS PANEL COULD NOT BE CLOSED. Open it, scroll down, and it
sits over the board with no way out but scrolling back up. The cause is
a mismatch neither half of which is wrong on its own: the panel is
position:fixed, so it rides the viewport - and its BUTTON is not,
because buildWebUI moves the whole button row off the fixed wrapper and
into the Voice panel at the top of the page, where it scrolls away like
any other content. The panel outlived the only control that could shut
it. That has been true since w21 and took a scroll to find.

A PANEL MUST CARRY ITS OWN EXIT. Anchoring it to the scrolling button
was the obvious alternative and it is worse - the panel would then
scroll off the top too, fixing the trap by hiding the settings. So: a
Done button at the head of the panel, always in reach because it is IN
the thing that needs closing, plus tap-outside, which is what everyone
tries first. Both go through one closeSettings.

The tap-outside guard is on the panel AND the button: a tap on the
button is already a toggle, and closing here as well would fight it,
with the outcome depending on which listener happened to run first.

THE HARNESS STUB GREW REAL PARENT LINKS to test that. appendChild set
the child and never the parent, so anything walking UP the tree saw
every node as a root - and "is this tap inside the panel" is exactly
that walk. The case that matters, a tap on a PILL inside the panel,
could not have been tested at all: flipping a setting must not shut the
panel you are flipping it in. document.addEventListener became real in
the same breath, having been a no-op that dropped handlers on the
floor.

THE GAME ID IS FOR THE LOG, NOT THE PANEL. "Game TAhPmwYI cannot be
played here" - eight characters of noise in the one line the page uses
to explain itself, naming a game the reader cannot act on and would
never type. The panel now says what happened and what to do instead;
the log keeps the id, which is where an id earns its place, since a
pasted log has to say WHICH game.

EITHER CLOCK REDDENS UNDER A MINUTE, not just yours. The red was
mine-only because it doubled as a marker for which clock was yours -
but the brass "mine" colour does that job by itself and survives here.
The owner's reason is the better one and it is about the GAME rather
than the panel: an opponent about to flag is something you want to
know.

RATINGS ARE THEIR OWN SWITCH, split off from showPlayers because the
owner wanted the two decisions separately and they ARE two decisions. A
name tells you who is across the board; a rating tells you what to
expect from them. Nested: with players off there is nothing for a
rating to sit beside, so the row is absent and the switch does nothing,
rather than a second empty row.

Five mutation tests. One of them crashed the harness rather than
failing - an unwired Done button threw out of a test that called
on_click unguarded, which names the wrong thing and takes the other 350
tests with it. Guarded, so it fails where the fault is.

STILL OPEN: the clocks beside the board. The owner overruled w68's
"leave it stacked" with a reason w68 did not have - it is not about
reading them from across the room, which is what clock mode is for, but
about the page LOOKING like the thing it talks to. That is a good
reason and it changes the answer. Its own version, because it moves the
one thing on the page a game is actually watched through.

### w70

THE CLOCKS MOVED BESIDE THE BOARD. w68 declined this and w68 was
reasoning from the wrong premise - that the small clocks are meant to
be read from across the room, which they are not: clock mode is what
that is for. The owner's reason is different and it is a good one. The
small clocks are for when you ARE looking at the page, and there the
job is that the page should look like the thing it talks to. Somebody
arriving from lichess.org should not have to relearn where a clock
lives. That is worth a layout.

One correction to the premise on the way past: the clocks were already
in the board panel, not the Lichess one. They rendered under the board
rather than beside it, so this is a reflow, not a move.

Board left, rail right: far player's clock and name at the top, yours
at the bottom, with the gap between them doing the pushing so no fixed
heights are needed and the rail matches whatever the board's
aspect-ratio works out to. It wraps under the board on a narrow screen
rather than squeezing it. The turn line stays full width below both,
being a sentence rather than part of the rail.

ORDERED BY THE BOARD, NOT BY COLOUR, which reverses w39 and is worth
saying why rather than looking like a lapse. w39 chose white-then-black
for a HORIZONTAL line, where left and right mean nothing and "you and
them" made the reader translate twice. A rail beside the board is
different in kind: top and bottom DO mean something there, because the
board next to it is drawn from your side and flips with your colour. A
rail that ignored that would put your clock level with their pieces.
Colour is still named on every clock, so what w39 was protecting is
not lost.

The test for it checks BOTH orientations, and that is not padding: a
rail simply frozen white-on-top passes as black and fails as white,
which is exactly the mutation that was run. The other mutation takes
the flex row away - the renderers would still fill the rail correctly
while it stacked under the board looking just like w69, so the shape
is asserted from the template separately from its contents.

### w71

THE FIRST REAL GAME AGAINST THE w70 RAIL, and the owner sent five
findings back the same morning. All five are here.

TOO-FAST GAMES ARE REFUSED BEFORE THE POST. The 2+1 against maia laid
the trap bare: the spec's line is "Rapid, Classical and Correspondence
only. For direct challenges, games vs AI, and bulk pairing, Blitz is
also possible" - so seeks need an estimated 480s (limit + 40 x
increment) and challenges 180s, and a bullet CHALLENGE is the nasty
case because Lichess ACCEPTS it. The restriction is on this API, not
the opponent: the game was created, compat.board:false arrived, and
this page walked away from a live game. (It auto-aborted after maia's
single move, because a game where one side never moves is aborted by
Lichess - the owner watched that happen - but that is luck-shaped:
refusing before the POST means no game ever exists to abandon.) Both
gates name the speed and the way out, and the w61 server-side hint
stays for whatever still gets through.

A WAITING CHALLENGE CAN BE TAKEN BACK. A human opponent, unlike maia,
can take minutes to accept, and all that time the page offered no way
out - the Challenge button answered "Still waiting on the last
challenge." It IS the way out now: while a challenge waits it reads
"Cancel challenge" and cancels it, which aborting the keep-alive
stream does for real on Lichess's side (w61). The repaint fingerprint
gained challengeAbort so the label follows the OTHER side's answer
too, not only our own actions.

THE CLOCK BOX IS THE TURN INDICATOR, as on the site this page talks
to: white digits always, box colour carrying the state - green for
the side to move, red for the side to move under a minute, dark grey
dimmed for the side waiting, plain grey for a finished game. The
White/Black captions went (the board is right there, and the rail is
ordered by it), the stretched gap went with the vacant middle the
owner disliked (the cluster sits together at the rail's centre), and
w69's red is now tied to the RUNNING clock: a low clock that is not
ticking is not an emergency. The turn line under the board went too -
the green box says it without a sentence, and "Game over." was
printed twice on one screen, once in each panel. The Lichess panel
keeps it.

THE w69 SETTINGS HEADER LASTED ONE DAY. Title and Done button both
deleted by the owner: tap-outside already closes the panel, and the
header spent a row restating the tap that opened it. Tap-outside is
the whole exit now, which makes the button-guard in the document
listener load-bearing rather than belt-and-braces.

RATINGS STAND ALONE. w69 nested showRatings under showPlayers and the
owner called it half-baked, rightly: players off + ratings on showed
nothing at all. Each switch now owns its fragment - the row is the
sum of what is on, and a rating with names off sits alone under its
clock, which says whose it is; that is what the rail ordering is for.

Five mutation tests: the challenge gate (the abandoned-game trap),
the seek floor, the re-nested ratings, red-without-turn, and the
cancel branch. The gate test counts FETCHES - the claim is that no
request leaves the page, so the proof is the counter staying at zero
while three refusals land, then reading exactly one when a rapid
control passes through to the stubbed server.

### w72

THREE CORRECTIONS FROM THE OWNER, all on w71's work, and two of them
are the same lesson: when in doubt, do what Lichess does, because that
is the thing the player already knows.

THE RATING NEVER RENDERS WITHOUT ITS NAME. Third landing for this
pair. w69 nested ratings under players and off/on showed nothing -
"half-baked". w71 read the switches independently and a bare number
floated beside the clock - "sucks", and it did. The owner's ruling is
that the configuration itself should be impossible, so the pair is now
DEPENDENT, the same shape as the message channels: players off drags
ratings off (repainting the pill), ratings tapped on while players are
off snaps straight back with the reason logged, and loadSettings
repairs a stored pair that disagrees - a save made under w71 could
legally hold one. The render guard stays as the last line, not the
rule. The test drives the panel's own pills, as a finger would,
because a test that poked CFG directly would pass with the panel
coupling deleted - and the loadSettings repair got its own test after
mutation M83 deleted it and nothing failed.

A LOW CLOCK STAYS RED. w71 reasoned that a low clock that is not
ticking is not an emergency and turned it grey between moves. The
owner disagreed, and Lichess agrees with the owner: below the
threshold the box turns red and stays red. What w71 got right survives
in the fix - DIMMING IS ORTHOGONAL TO COLOUR. The waiting side dims
whatever colour its box is, so a waiting low clock is a noticeably
darker red, not a grey one, and whose turn it is stays legible without
the colour lying about the emergency. A flagged game keeps its red at
full brightness, as Lichess leaves the loser's.

THE DIGITS ARE SIZED AND SET LIKE THE LICHESS CLOCK: big plain sans
at regular weight (2.4rem) instead of small bold monospace, with
tabular-nums holding the columns steady as the digits count - the
job the monospace face was doing, done without it. No webfont, rule
3: the system sans stands in for theirs.

### w73

PORTRAIT SPLITS THE CLOCKS AROUND THE BOARD. The owner put an iPhone
in portrait next to Lichess's portrait layout and the difference
argued for itself: Lichess gives each player a bar nearest their own
pieces - the far player's clock and name above the board, yours below
- where this page's rail simply wrapped, dumping both clocks
underneath. The wide layout keeps the w70 rail; below 600px (where
the wrap was happening anyway) the rail dissolves - display:contents,
so its two blocks become items of the board column - and order sends
the far block above the canvas. Each bar goes horizontal, name left
and clock right, which is Lichess's own arrangement.

The markup grew one wrapper per side to make that possible: clock and
name were five loose siblings in the rail, and a block that can be
MOVED as a unit has to BE a unit. The renderers are untouched - they
only ever knew the four inner ids.

sideTop's bar is row-reversed to put the name left (its DOM order is
clock-first, which is what the wide rail wants). w31's rule is that
reversing a flex row is wrong the moment it wraps; two items that
cannot wrap is the case it does not reach, and the comment says so
where the next reader will hit the rule.

The shape tests read the media query's OWN text, not the stylesheet
as one string - a rule drifting outside the query would otherwise
still match. Two mutations: order:-1 deleted (the far bar quietly
stays below, exactly the bug being fixed) and the whole query deleted.

CLOSED AT w74 - BOTH OF THEM. Left here as written because the
first one's answer came from the owner reading it and asking the
obvious question nobody had asked:

STILL OPEN AFTER w73, written down here because both were found in
conversation and neither is in the code's own comments:

1. A TOO-FAST GAME THAT ARRIVES FROM ELSEWHERE IS STILL ABANDONED.
   w71 stopped this page CREATING one, which was the trap the owner
   hit. It did nothing for a compat.board:false game that starts
   somewhere else - the Lichess app, a friend's bullet challenge.
   handleAccountEvent still says it out loud and returns, leaving a
   live game running with nobody moving. Lichess aborts a game where
   one side never moves, which is why the owner's 2+1 cost nothing,
   but that is luck, not handling: the page could abort or resign it
   deliberately. Not done because it is the one path here that ENDS
   a game the user did not ask to end, and that is the owner's call
   to make, not a cleanup to slip in.

2. THE w61 SEEK HINT IS NOW UNREACHABLE. It fires on a 400 when the
   estimated seconds are under 480 - and w71's gate refuses exactly
   that before the POST, from the same clamped values and the same
   formula. So "Blitz seeks are not allowed - challenge someone
   instead." can no longer be printed. w71's entry says the hint
   "stays for whatever still gets through", which is wrong: nothing
   does. Left in place rather than deleted, since it is one branch
   and it is the correct behaviour if the gate is ever loosened -
   but it is dead today, and a reader should not spend time working
   out when it fires. If it is ever deleted, delete the test with it.

Also unverified on the device at the time of writing: w73's portrait
split (iPhone), and whether w72's 2.4rem clock digits read right at
arm's length. w56's rule applies to the second - measure before
retuning. BOTH VERIFIED GOOD by the owner the same evening: the
portrait clocks separate correctly, and the digits read at the right
size. Neither needs retuning.

### w74

BOTH OPEN ITEMS CLOSED, and the first one closed better than the note
proposing it did, because the owner asked the question the note had
not: "if someone sends in a challenge for a bullet game, it should
just simply not be accepted, right?"

DECLINE IT BEFORE IT IS A GAME. The w73 note framed this as cleanup -
abort or resign the unplayable game that arrives - and flagged it as
the owner's call because ending a game is not a thing to slip in.
That framing was working one step too late. This page NEVER accepts a
challenge itself; it says "accept it on Lichess or with the app". So
the sequence is: challenge arrives, you accept it elsewhere, gameStart
lands with compat.board:false, and a live game with a running clock is
now something this page can only walk away from. THE CHALLENGE is
where it can still be stopped, and Lichess has a decline reason called
tooFast, so the challenger is told exactly why instead of being left
to time out. No game is created, so there is nothing to abort and no
judgement call to make.

The other route to an unplayable game - starting one yourself in the
Lichess app - is left exactly as it was, and now on purpose rather
than by omission: that was a choice made in another app, and aborting
a game someone deliberately started is not this page's business. It
still says so out loud.

The floor is PLAY_FLOOR_S, not the seek floor: a blitz challenge is
legal for the Board API and must survive. A clockless challenge has no
speed to be wrong about. Both have tests, because "declines the wrong
thing" is the failure that would cost a real game the owner wanted.

THE DEAD w61 HINT IS DELETED. It became unreachable at w71 and its
existence was defended as "correct if the gate is ever loosened" -
which is precisely the reasoning that leaves two copies of a constant
to disagree. The floors are now named once, SEEK_FLOOR_S and
PLAY_FLOOR_S, and used in all three places that need them. The test
that asserted the hint was ABSENT went with it: deleting a branch
makes any check for its absence trivially true, which is a test that
passes for the wrong reason.

Four mutation tests: the decline branch removed (the w71 hole
reopens), the floor raised so legal blitz would be declined, clockless
challenges no longer exempt, and the wrong decline reason.

Verified on the device: w73's portrait split and w72's digit size,
both good, neither needing a retune.

### w75

SHOWPLAYERS IS DELETED, and the reasoning it was added on is the
reasoning that killed it. w68 put it behind a switch because "the
owner plays at a real board and looks at the iPad rarely, so anything
permanent on screen has to earn the room". A name earns it every time.
A week of it on the device turned up no occasion to turn it off:
Lichess hides names behind Zen mode because Zen hides the whole
interface, which is not a thing this page has. Names always show.

THE RATING BECOMES FREE, which is the shape this pair was reaching for
across four versions and kept missing. w69 split it off but nested it,
so players-off/ratings-on showed nothing - half-baked. w71 read the
two independently and a bare number floated beside a clock - sucks,
and it did. w72 chained them, which was right given both existed.
w75 deletes the thing it was chained to, and the chain goes with it:
the panel coupling, the loadSettings repair, and the render guard are
all gone, because there is no longer a state they could be protecting
against. One switch, answering to nobody.

That is three of the four landings undone by the fourth, and the
lesson is not "we churned" - it is that a setting nobody turns off is
not a setting, and the way to find that out was to ship it and use it.
The rating IS turned off, so it stays.

A STORED SETTING WHOSE SWITCH IS GONE MUST BE IGNORED, NOT OBEYED. A
device that had saved showPlayers:false would otherwise hide the names
forever with no control left to bring them back - the settings panel
is the only way in, and its row no longer exists. loadSettings copies
only keys present in SETTING_DEFAULTS, so a deleted key is dropped by
construction; that property is now asserted rather than assumed,
because the whole deletion rests on it. Same shape as the headphones
setting deleted at v132.

Three mutation tests: the render ignoring showRatings, the pill losing
its repaint, and showPlayers resurrected as a default.

### w76

THE ACCOUNT IS ONE BUTTON, AND IT LIVES WITH THE OTHER BUTTONS. w12
ruled that tapping a signed-in name should do nothing, and that held
as long as Sign out stood beside it doing the leaving. On the device
it read differently: the biggest control in the panel could be
pressed and nothing happened, which is not a label, it is a dead
button. The two are now one control that always answers - signed out
it is "Sign in with Lichess", signed in it is the name with "Sign
out" written on it, so the tap is never a surprise. No confirmation
step: a stray tap costs two taps on lichess.org to undo (PKCE
remembers), which is cheaper than asking every deliberate one.

With the account row gone the Lichess panel held only ways to start
a game, so it is named GAMES for what it holds - the id stays
panelLichess, because the open/closed memory (w19) is keyed by id
and renaming it would silently forget every device's saved choice.
The button itself joined the top row at the far end, by the w31
reasoning that placed Practice: the risky taps sit furthest from
the button pressed every game.

That row's panel lost its VOICE heading - with the account in it,
the name no longer covered the contents. Which pulled the thread
w30 left: the button said only "Start" BECAUSE the heading above
said VOICE. The noun moved into the label, "Voice Mode" behind the
triangle that already carries "start" - the owner's wording. The
on-states stay "Listening" and "On", for w30's reason: they are
states, and the useful fact is whether the mic is live. Clock was
weighed for "Full-screen Clock" in the same conversation and stays
Clock: a fact learned permanently on the first press does not earn
the row's widest label.

### w77

THE SIGN-OUT IS A QUESTION FIRST. w76's merged button wrote the
action into the resting label - "name - Sign out" - and the owner
felt both costs the same day: a stray tap signed you out on the
spot, and the label said two things at once, neither quite right.
Moving the button to the panel's far edge was weighed and dropped -
it defends only the wide layout (the phone wraps the row anyway),
and only against taps aimed at the neighbours, not at the button.
So the defence is in time, not space: at rest the button is the
NAME alone - w12's label, made honest - and the first tap only
asks. "Sign out?" stands in the warn colour for four seconds; the
second tap answers, and any other tap or the timer cancels,
because a question that can be asked must be cancellable (rule 5).
The Copy button's timed revert, the challenge button doubling as
its own cancel (w71) and the settings panel's tap-outside exit
(w69) were the precedents, one apiece. The armed flag is consulted
BY renderAccount rather than painted over it, so the repaint tick
cannot un-ask the question - the w37 shape, guarded against
before it shipped this time.

### w78

THE COMPOUND TABLE STOPPED WAITING FOR THE LOG. Until now every
fused word was paid for with a lost move in a real game: rugby
cost one outright in game w64-1, and knight+e sat misspelled for
sixty-odd versions because the entry was written the one way
Safari would never write it (w66). But w65 had already written
down the rule that generates the family - the fusion follows the
vowel - and a rule that can name its own untested members can be
searched for instead of waited for. The owner asked for exactly
that, so an English word list was run against every piece+file
fusion and the snug fits added ahead of any log: knife for
knight+f ("knight f three" is Nf3, the commonest move in chess,
one swallowed t from coming back as "knife three"), roxy for
rook+c, quincy for queen+c, ponzi, pony and pontiff for the pawn
family, kinsey and clingy for the king's. A different accent
should not have to lose the move rugby cost before the table
learns a word a search could already know.

What the search REJECTED matters more than what it kept, and the
bar now stands written next to the table: a tight fit for the
fusion, and never a word said near numbers at a board. "nice" is
exactly the sound of knight+c and stayed out, because compounds
are consumed first, exact, no questions asked - and "nice one"
must never become a knight to c1. This entry exists partly to
hold that line for the next session that finds a tempting common
word: the table remains exact-only, it still cannot seed the
fuzzy matcher, and a speculative entry has to clear a HIGHER bar
than a logged one, since it arrives with no game behind it.

### w79

THE BOARD BORROWS LICHESS'S EYES. The mini board's square browns
were already lichess.org's own pair, but the last-move tint was a
leftover BoardEye blue and a king in check looked like any other
king - the two states the site paints loudest. The owner plays on
Lichess; a glance at this board should not need translating from
a second colour language. So the last-move pair is now the flat
colour Lichess's green overlay (rgba 155,199,0 at .41) composites
to over each brown - the owner sampled ccd069 and a8a23b off the
real site, and the arithmetic agrees - and a checked king sits on
the site's red radial halo, stop for stop from its stylesheet.
Constraint 6 wants the stylesheet to own what states look like,
but CSS stops at the canvas edge; the colours live in board.js
with the rest of the painting, and the harness stopped taking the
canvas on faith to hold them there: the context stub now records
its paints, so the tests ask which fill actually landed on d8, on
h4, on the checked e1 - flipped and unflipped, because the halo
goes through the same grid arithmetic that orientation bends.

### w80

THE COORDINATES MOVED INTO LICHESS'S CORNERS. w79 matched the
site's colours and the owner immediately saw the one thing left
unmatched: BoardEye had parked the letters in the bottom rank's
lower-right and the numbers down the LEFT edge, where Lichess
writes letters lower-left and numbers up the RIGHT edge, upper
corner. Same reason as w79 - one colour language, one geography,
no translating between this board and the site's. The subtlety
worth a test: each label is inked in its square's opposite
colour, and the number column's contrast was keyed to the left
edge's squares. Moved without re-keying, every number would sit
on its square's OWN colour and vanish - so the harness asks the
recorded paints where each glyph landed and what ink it wore.

### w81

TWO FINDINGS FROM THE GAME OF 7 AUG, both reported from the
device. First: the names and ratings were dimming with the
clocks. w72 made dimming the clock's turn signal and the idle
class was mirrored onto the name row, where it compounded - .55
on the row, .65 on the rating inside it - into a grey the owner
could not read across the room. A name is not a state: whose
turn it is says nothing about who is playing, so the names never
dim now and the clock box carries the turn alone. The rating
also lost its own fade, which at .65 read as a different
typeface beside the name rather than a quieter one.

Second: the game opened on "connected. you are white."
immediately followed by "reconnected. you are white." w50 made
voice-on restart the stream so a death while voice was off could
not go unnoticed, and its comment reasoned that startStream
"cannot double up" because it aborts its own predecessor - true
of the streams, false of the announcements. Restarting a healthy
stream re-delivers gameFull, and a game joined seconds before
the tap announced itself twice. The button now goes through
ensureStream, which leaves a stream alone while bytes have
arrived inside Lichess's keep-alive cadence and restarts only
one that has actually gone quiet - which is the case w50 was
written for, and it still works.

### w82

THE BOARD SAT LEFT OF WHERE IT LOOKED CENTRED. The owner
noticed it from a screenshot: the board nearly touching the
Board panel's left edge, a wide blank to the right of the
clocks. #boardRow centres its contents, and had since w70 - but
the rail was allowed to GROW to its 260px cap while the clocks
inside it hug its left edge, so the row centred a block whose
right third was invisible. What the eye takes for the thing
being centred is the board through the clock boxes; what the
browser was centring was that plus the rail's empty growth. The
rail now takes only its content's width and the two agree: the
board's left edge and the clocks' right edge sit about the same
distance in from the panel's sides, which is the shape the owner
asked for in as many words. The cap stays against marathon
usernames; the min-width keeps the wrap threshold where the
portrait media query expects it.
