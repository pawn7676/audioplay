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
