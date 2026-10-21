# Credits and licenses

audioplay's own code is free software under the GNU General Public
License, version 3 or later (GPL-3.0-or-later; the full text is in
`LICENSE`). It uses other people's work, listed here with their
licenses. Wherever audioplay's files are published, keep this file
and `LICENSE` with them.

audioplay is not affiliated with or endorsed by Lichess
(lichess.org).

---

## audioplay's own code

Every file not listed below - the pages (`audioplay.html`,
`index.html`), their scripts and CSS, and the icon (`icon.png`) -
and `rules.js`, the rules of chess, which audioplay loads from the
"shared" folder next to its own.

Copyright (C) 2026 pawn7676

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at
your option) any later version.

This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
General Public License (`LICENSE`) for more details.

---

## Piece artwork - cburnett

The chess pieces in `pieces.js` (in the "shared" folder next to
audioplay's, one copy for every project; its top comment gives this
credit too): the cburnett set, by Colin M.L. Burnett
([Cburnett](https://commons.wikimedia.org/wiki/User:Cburnett) on
Wikimedia Commons) - the same set Lichess uses. He offers it under
four licenses, any one of which may be chosen: GFDL 1.2 or later,
CC BY-SA 3.0, BSD (3-clause) and GPL-2.0-or-later. It's used here
under GPL-2.0-or-later, as GPL-3.0 with the rest of audioplay
(`LICENSE`, and the copy of it in "shared", beside `pieces.js`).
Source:
[Wikimedia Commons, SVG chess pieces](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces);
Lichess lists the set the same way in
[lila's COPYING.md](https://github.com/lichess-org/lila/blob/master/COPYING.md).

---

## Lichess

- **The Lichess API.** Signing in, games, moves, offers, seeks and
  challenges all go through Lichess's public API
  ([lichess.org/api](https://lichess.org/api)). Players sign in on
  lichess.org with their own Lichess accounts; audioplay never sees
  their password. No Lichess code is included.
- **The look.** The board's colours, its last-move and selected
  tints, and the red glow on a king in check (`board.js`) follow
  Lichess's board, chessground. The check glow uses chessground's
  four colour stops as they are. chessground is under
  GPL-3.0-or-later, the same license as audioplay
  ([github.com/lichess-org/chessground](https://github.com/lichess-org/chessground)).
  The page's dark background, the clock colours and the BOT title
  colour (`audioplay.css`) follow lichess.org's own (lila, copyright
  (c) 2012-2026 the lila authors, AGPL-3.0-or-later); only colour
  values are used, no lila code.

---

## chess.js

`rules.js` (in the "shared" folder, next to audioplay's) records
each move with the same fields and flag letters as
[chess.js](https://github.com/jhlywa/chess.js) (Copyright (c) 2025,
Jeff Hlywa, BSD-2-Clause): `{from, to, piece, color, captured,
promotion, flags}`, with flags c, e, b, p, k and q. No chess.js code
is included: the board, the move generator and the notation are
written separately.

---

## python-chess

`rules.js` is written to give the same answers as
[python-chess](https://github.com/niklasf/python-chess) (Niklas
Fiekas and contributors, GPL-3.0-or-later) - the same rule for a draw
by insufficient material, and positions written as FENs the same
way. No python-chess code is included.
