// Builds the deployable data files so the page works from a double-click (file://) AND from a hosted link.
// Run: node prototype/build.mjs   (needs eval/node_modules for the vendored font: cd eval && npm ci)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const gen = require("./gen.js");
const core = require("./core.js");
// samples: one CRM export per family, seeds outside the eval sets
const mk = (fam, seed, title) => { const st = gen.makeStudy(fam, seed, 1); return { title, registry: st.registry, crm: st.crms[0] }; };
const samples = [
  mk("tuning", 71, "Spine and joint maker · 88 CRM rows · MA, NY, OH"),
  mk("heldout", 83, "Urology and cardiology maker · 92 CRM rows · TX, GA, AZ (held-out family)"),
];
for (const s of samples) {
  // pick a few tricky rows as starters for "try your own" (chosen by the agent's own verdicts, not the labels)
  const out = core.run(s.crm, s.registry);
  const pick = (pred, label) => { const r = out.results.find(pred); return r ? { label, row: { ...r.row } } : null; };
  s.examples = [
    pick((r) => r.verdict === "needs a person" && r.why.includes("pass the same checks"), "Two namesakes"),
    pick((r) => r.flags.includes("npi_checksum"), "Mistyped NPI"),
    pick((r) => r.flags.includes("moved"), "Moved site"),
    pick((r) => r.verdict === "needs a person" && r.why.includes("belongs to"), "Someone else's NPI"),
  ].filter(Boolean).map((e) => { delete e.row.truth; return e; });
  // the page never sees the planted labels
  for (const r of s.crm.rows) delete r.truth;
}
samples[0].short = `Spine & joint CRM · ${samples[0].crm.rows.length} rows`;
samples[1].short = `Urology & cardiology CRM · ${samples[1].crm.rows.length} rows`;
fs.writeFileSync(path.join(here, "sample-data.js"), "window.SAMPLES=" + JSON.stringify(samples) + ";\n");
const res = JSON.parse(fs.readFileSync(path.join(here, "../eval/results.json"), "utf8"));
const first = JSON.parse(fs.readFileSync(path.join(here, "../eval/results.first-run.json"), "utf8"));
const slim = (r) => { const o = {}; for (const k of ["rows", "with_truth", "linked", "linked_correct", "wrong_links", "auto_link_pct", "review_truth", "review_cand_hit", "moved", "moved_flagged", "false_moves", "dup", "dup_flagged", "deact", "deact_flagged", "typo_npi", "typo_npi_flagged", "failure_count"]) o[k] = r[k]; o.failures = (r.failures || []).slice(0, 6).map((f) => ({ row: f.row, arch: f.arch, why: f.why, reason: f.reason })); return o; };
fs.writeFileSync(path.join(here, "results-data.js"), "window.EVAL=" + JSON.stringify({ data: res.data, generated: res.generated, headline: res.headline_numbers,
  tuning: slim(res.tuning), heldout: slim(res.heldout), heldout2: slim(res.heldout2), stress: slim(res.stress), first: { tuning: slim(first.tuning), heldout: slim(first.heldout) } }) + ";\n");
const fd = path.join(here, "../eval/node_modules/@fontsource-variable/inter/files");
const face = (fam, f) => `@font-face{font-family:"${fam}";font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fd, f)).toString("base64")}) format("woff2")}`;
fs.writeFileSync(path.join(here, "fonts.css"), face("Inter", "inter-latin-wght-normal.woff2") + "\n");
console.log("built: sample-data.js, results-data.js, fonts.css", samples.map((s) => s.crm.rows.length + " rows, " + s.examples.length + " examples"));
