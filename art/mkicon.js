/* THE ICON, AND HOW THE PAGE'S COPY OF IT WAS MADE (w130).
 *
 * knight-source.png beside this file is what the owner
 * generated: 1254x1254, a cream knight on a rounded near-black
 * card, floating on white. The page carries a 180x180 palette
 * PNG inlined as a data: URI in src/index.html. This is the
 * one turning the first into the second, and the harness runs
 * it on every commit to check they still agree - so the source
 * beside this file is the SOURCE, provably, and not just a
 * picture someone believes the icon came from.
 *
 *   node art/mkicon.js            # print the data: URI
 *   node art/mkicon.js icon.png   # or write the PNG, to look at
 *
 * WHY THE THREE STEPS ARE WHAT THEY ARE
 *
 * CROP PAST THE ARC. iOS applies its own rounded mask to an
 * apple-touch-icon, so art that arrives already rounded is
 * rounded twice and shows pale slivers in the corners. What
 * ships is the INSIDE of the generated card - inset until all
 * four corners are card rather than paper, then a little more
 * - which makes it full bleed and opaque, no alpha.
 *
 * FLATTEN. The art is two colours with an anti-aliased edge
 * between them, but it was RENDERED, so every flat area
 * carries a little noise, and noise is the one thing PNG
 * cannot compress. Snapping each pixel onto a ramp between the
 * two endpoint colours throws the noise away and keeps the
 * only thing the eye takes from it, the soft edge. The
 * deadzone is what makes the card actually flat: near-black is
 * card, near-white is piece, and only the band between them
 * stays a ramp. 1.2KB inlined, against 18KB for the same image
 * kept as noisy RGB.
 *
 * NODE BUILT-INS ONLY, because the repo does not take
 * dependencies - and this is not part of the build in any
 * case. build.js remains pure concatenation; nothing here runs
 * when the page is built.
 *
 * WHAT THE HARNESS COMPARES, and why it is not the file's
 * bytes: zlib's output is allowed to differ between versions,
 * so comparing compressed bytes would fail on a runner with a
 * different zlib and say nothing about the icon. It compares
 * what the icon IS - size, palette, and every pixel - decoded
 * from the page and rendered from the source.
 */
"use strict";
const fs = require("fs"), zlib = require("zlib"), path = require("path");

const SIZE = 180;         // what iOS asks an apple-touch-icon for
const LEVELS = 64;        // steps in the card-to-piece ramp
const DEADZONE = 0.10;    // below/above this, flat card / flat piece
const DARK = 90;          // luminance at or under this is "card"
const PAST_ARC = 12;      // extra inset once the corners are card
const SOURCE = path.join(__dirname, "knight-source.png");

function crc32(buf) {
  let t = crc32.t;
  if (!t) {
    t = crc32.t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* PNG in. Enough of the format for what this handles: 8 bit,
 * non-interlaced, grey/RGB/RGBA/palette - and it undoes the
 * per-scanline filters, which is the part that is easy to get
 * subtly wrong and would show up as a smeared icon. */
function decode(buf) {
  let p = 8, idat = [], ihdr = null, plte = null;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === "IHDR") ihdr = data;
    else if (type === "PLTE") plte = data;
    else if (type === "IDAT") idat.push(data);
    p += 12 + len;
  }
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  if (ihdr[8] !== 8 || ihdr[12] !== 0) throw new Error("8 bit, non-interlaced only");
  const ch = { 0: 1, 2: 3, 3: 1, 6: 4 }[ihdr[9]];
  if (!ch) throw new Error("colour type " + ihdr[9] + " not handled");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], at = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? px[y * stride + i - ch] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = (i >= ch && y > 0) ? px[(y - 1) * stride + i - ch] : 0;
      let v = raw[at + i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a),
              pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      px[y * stride + i] = v & 0xff;
    }
  }
  return { w, h, ch, px, palette: plte, colourType: ihdr[9] };
}

/* Palette PNG out: IHDR, PLTE, one IDAT, IEND. Filter 0 on
 * every scanline - the image is flat, so the filters have
 * nothing to predict. */
function encode(size, palette, indices) {
  const raw = Buffer.alloc(size * (size + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    indices.copy(raw, y * (size + 1) + 1, y * size, (y + 1) * size);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 3;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("PLTE", palette),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* source PNG -> { size, palette, indices }: the icon itself,
 * before anything compresses it. */
function render(file) {
  const img = decode(fs.readFileSync(file || SOURCE));
  const at = (x, y, c) => img.px[(y * img.w + x) * img.ch + c];
  const lum = (x, y) => 0.299 * at(x, y, 0) + 0.587 * at(x, y, 1) + 0.114 * at(x, y, 2);

  // the card's bounding box, then in past its rounded corners
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (lum(x, y) < DARK) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const cornersAreCard = d =>
    lum(x0 + d, y0 + d) < DARK && lum(x1 - d, y0 + d) < DARK &&
    lum(x0 + d, y1 - d) < DARK && lum(x1 - d, y1 - d) < DARK;
  let d = 0;
  while (d < (x1 - x0) / 3 && !cornersAreCard(d)) d++;
  d += PAST_ARC;
  const cx = x0 + d, cy = y0 + d, side = Math.min(x1 - d - cx, y1 - d - cy) + 1;

  // box-average down to icon size
  const rgb = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const sy = cy + Math.floor(y * side / SIZE), ey = cy + Math.floor((y + 1) * side / SIZE);
      const sx = cx + Math.floor(x * side / SIZE), ex = cx + Math.floor((x + 1) * side / SIZE);
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = sy; j < Math.max(ey, sy + 1); j++)
        for (let i = sx; i < Math.max(ex, sx + 1); i++) {
          r += at(i, j, 0); g += at(i, j, 1); b += at(i, j, 2); n++;
        }
      const o = (y * SIZE + x) * 3;
      rgb[o] = Math.round(r / n); rgb[o + 1] = Math.round(g / n); rgb[o + 2] = Math.round(b / n);
    }

  // onto the ramp between the art's own two colours
  const lumAt = i => 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
  let lo = 255, hi = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const L = lumAt(i);
    if (L < lo) lo = L;
    if (L > hi) hi = L;
  }
  const endpoint = keep => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < rgb.length; i += 3)
      if (keep((lumAt(i) - lo) / (hi - lo))) { r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; n++; }
    return [r / n, g / n, b / n];
  };
  const card = endpoint(t => t < 0.08), piece = endpoint(t => t > 0.92);
  const palette = Buffer.alloc(LEVELS * 3);
  for (let k = 0; k < LEVELS; k++)
    for (let c = 0; c < 3; c++)
      palette[k * 3 + c] = Math.round(card[c] + (piece[c] - card[c]) * (k / (LEVELS - 1)));
  const indices = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < indices.length; i++) {
    let t = (lumAt(i * 3) - lo) / (hi - lo);
    t = t < DEADZONE ? 0 : t > 1 - DEADZONE ? 1 : (t - DEADZONE) / (1 - 2 * DEADZONE);
    indices[i] = Math.max(0, Math.min(LEVELS - 1, Math.round(t * (LEVELS - 1))));
  }
  return { size: SIZE, palette, indices };
}

module.exports = { render, encode, decode, SIZE, LEVELS, SOURCE };

if (require.main === module) {
  const icon = render();
  const png = encode(icon.size, icon.palette, icon.indices);
  const out = process.argv[2];
  if (out) {
    fs.writeFileSync(out, png);
    console.log(out + ": " + icon.size + "x" + icon.size + ", " + png.length + " bytes");
  } else {
    console.log("data:image/png;base64," + png.toString("base64"));
  }
}
