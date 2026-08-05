/* build.js — dumb concatenation, nothing more.
 * Reads a manifest (one src/ filename per line, # = comment),
 * joins the files byte-for-byte in order, writes the output.
 * A manifest may name ONE "@template file" — then the output
 * is that template with its AUDIOPLAY_JS line replaced by the
 * concatenation (how the website becomes one index.html).
 *
 *   node build.js            -> dist/index.html, the whole site
 *
 * This is the project's whole build system. It began so the
 * userscript and website could share section files; the
 * userscript is frozen (see frozen-userscript/) and the one
 * remaining job is turning per-section sources into ONE
 * uploadable file. It must never grow transforms,
 * minification, or dependencies. */
"use strict";
const fs = require("fs");
const path = require("path");

const manifest = process.argv[2] || "manifest.txt";
const outFile  = process.argv[3] || "dist/index.html";

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
  out += fs.readFileSync(p, "utf8");
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
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
console.log(outFile + ": " + names.length + " parts, " +
  out.length + " chars, " + out.split("\n").length + " lines");
