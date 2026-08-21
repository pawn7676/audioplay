/* build.js — dumb concatenation, nothing more.
 * Reads a manifest (one src/ filename per line, # = comment),
 * joins the files byte-for-byte in order, writes the output.
 * A manifest may name ONE "@template file" — then the output
 * is that template with its AUDIOPLAY_JS line replaced by the
 * concatenation (how the website becomes one index.html).
 *
 *   node build.js            -> index.html, the deployed page
 *
 * The default output is the ROOT index.html, which is the file
 * GitHub Pages serves. It used to default to dist/index.html,
 * which nothing serves: a bare "node build.js" then looked
 * like a deploy and changed nothing the world could see. A
 * default that quietly does the useless thing is a trap, and
 * this one caught the documentation itself.
 *
 * This is the project's whole build system. It began so the
 * userscript and website could share section files; the
 * userscript is maintained by hand at the repo root now
 * (lichess_audioplay.js, not built from src/ since w138),
 * and the one remaining job is turning per-section sources
 * into ONE deployable page. It must never grow transforms,
 * minification, or dependencies. */
"use strict";
const fs = require("fs");
const path = require("path");

const manifest = process.argv[2] || "manifest.txt";
const outFile  = process.argv[3] || "index.html";

/* IT WILL NOT WRITE OVER ANYTHING IT READ (w57). The
 * arguments are (manifest, output) and reversing them - easy,
 * since the manifest is the one you name more often - made
 * this truncate manifest.txt to nothing and report success.
 * That instance was recoverable from git; an uncommitted src
 * file would not have been.
 *
 * The check is "is the output one of the files I just read",
 * asked below where every input is known, rather than a guess
 * at which argument looks like a manifest. build.js is allowed
 * to be dumb; it is not allowed to eat its own sources. */
const readFiles = new Set([path.resolve(manifest)]);

let template = null;
const names = fs.readFileSync(manifest, "utf8").split("\n")
  .map(s => s.trim()).filter(s => s && !s.startsWith("#"))
  .filter(s => {
    if (s.startsWith("@template ")) {
      template = s.slice("@template ".length).trim();
      return false;
    }
    return true;
  });

let out = "";
for (const n of names) {
  const p = path.join("src", n);
  if (!fs.existsSync(p)) { console.error("MISSING: " + p); process.exit(1); }
  readFiles.add(path.resolve(p));
  let part = fs.readFileSync(p, "utf8");
  // A FILE MUST END ITS OWN LAST LINE (w54). The join is
  // byte-for-byte, so a source whose final line is a //
  // comment with no trailing newline would swallow the first
  // line of the next file into that comment - silently, with a
  // page that still builds and a program missing a line
  // nobody deleted. Every editor writes the newline; the one
  // that does not is exactly the case worth surviving. This
  // adds nothing when the file already ends properly.
  if (part.length && !part.endsWith("\n")) part += "\n";
  out += part;
}
if (out.includes("</scr" + "ipt>")) {
  console.error("refusing: the script contains </scr" + "ipt>, " +
    "which would end the inline tag early");
  process.exit(1);
}
if (template) {
  // the placeholder is a LINE that is exactly AUDIOPLAY_JS -
  // prose in comments may mention the word, so a bare
  // replace() once hit a comment and buried the whole
  // program inside it. Exactly one such line, or refuse.
  readFiles.add(path.resolve(path.join("src", template)));
  const t = fs.readFileSync(path.join("src", template), "utf8");
  const lines = t.split("\n");
  const hits = lines.filter(l => l.trim() === "AUDIOPLAY_JS").length;
  if (hits !== 1) {
    console.error("template must have exactly one bare " +
      "AUDIOPLAY_JS line (found " + hits + ")");
    process.exit(1);
  }
  out = lines.map(l => l.trim() === "AUDIOPLAY_JS" ? out : l).join("\n");
}
/* THREE WAYS THE OUTPUT CAN BE A SOURCE, and it took two
 * destroyed manifests to enumerate them (w57). Checking only
 * "is the output a file I read" is not enough: point the
 * manifest argument at a copy and the real manifest.txt is
 * not in the read set, so it looks like a perfectly good
 * place to write 350KB of HTML. What is being protected is
 * not this run's inputs, it is the SOURCES - so say that. */
if (readFiles.has(path.resolve(outFile))) {
  console.error("refusing: the output (" + outFile + ") is one of the " +
    "files this build just read. The arguments are (manifest, output), " +
    "in that order.");
  process.exit(1);
}
if (path.resolve(path.dirname(outFile)) === path.resolve("src")) {
  console.error("refusing: the output (" + outFile + ") would land in src/, " +
    "which is where the sources live");
  process.exit(1);
}
if (path.basename(outFile) === path.basename(manifest) ||
    /^manifest.*\.txt$/i.test(path.basename(outFile))) {
  console.error("refusing: the output (" + outFile + ") is named like a " +
    "manifest. The arguments are (manifest, output), in that order.");
  process.exit(1);
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
console.log(outFile + ": " + names.length + " parts, " +
  out.length + " chars, " + out.split("\n").length + " lines");
