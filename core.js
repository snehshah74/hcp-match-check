// HCP match check agent. Rules only, no model. Shared by the Node eval and the page.
// For each CRM physician row: check the NPI, find registry candidates, score separate evidence,
// link only when evidence agrees and no namesake competes, then flag moves, duplicates, deactivations
// and draft the CRM changes. Everything else goes to a person.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CORE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- fixed tables (rules, shown on the page)
  const NICK = {
    mike: "michael", bob: "robert", rob: "robert", bill: "william", will: "william", jim: "james", jimmy: "james", rick: "richard", dick: "richard",
    tom: "thomas", chris: "christopher", dan: "daniel", matt: "matthew", tony: "anthony", joe: "joseph", steve: "steven", andy: "andrew", drew: "andrew",
    jon: "jonathan", ben: "benjamin", sam: "samuel", nick: "nicholas", ed: "edward", ted: "edward", alex: "alexander", greg: "gregory", tim: "timothy",
    pat: "patrick", ken: "kenneth", liz: "elizabeth", beth: "elizabeth", kate: "katherine", kathy: "katherine", jen: "jennifer", maggie: "margaret",
    peggy: "margaret", trish: "patricia", patty: "patricia", becky: "rebecca", sue: "susan", deb: "deborah", vicky: "victoria", tina: "christina",
    jess: "jessica", abby: "abigail",
  };
  const SITE_TOKENS = { st: "saint", "st.": "saint", med: "medical", ctr: "center", mc: "medical center", asc: "surgery center", surg: "surgery",
    surgical: "surgery", hosp: "hospital", reg: "regional", assoc: "associates", "&": "and" };
  const SPECIALTY = { // CRM text -> registry specialties it is compatible with
    "orthopedic surgery": ["Orthopedic Surgery"], "orthopaedic surgery": ["Orthopedic Surgery"], orthopedics: ["Orthopedic Surgery"],
    orthopaedics: ["Orthopedic Surgery"], ortho: ["Orthopedic Surgery"], "ortho surgery": ["Orthopedic Surgery"],
    neurosurgery: ["Neurosurgery"], "neurological surgery": ["Neurosurgery"], spine: ["Neurosurgery", "Orthopedic Surgery"],
    "pm&r": ["Physical Medicine and Rehabilitation"], physiatry: ["Physical Medicine and Rehabilitation"], "physical medicine": ["Physical Medicine and Rehabilitation"],
    "physical medicine and rehabilitation": ["Physical Medicine and Rehabilitation"],
    urology: ["Urology"], urologist: ["Urology"], uro: ["Urology"], "urologic surgery": ["Urology"],
    "interventional cardiology": ["Interventional Cardiology"], "cardiology - interventional": ["Interventional Cardiology"], ic: ["Interventional Cardiology"],
    cardiology: ["Cardiology", "Interventional Cardiology"], cardiologist: ["Cardiology", "Interventional Cardiology"], cardio: ["Cardiology", "Interventional Cardiology"],
    "cardiovascular disease": ["Cardiology", "Interventional Cardiology"],
    "family medicine": ["Family Medicine"], "internal medicine": ["Internal Medicine"], radiology: ["Radiology"], "emergency medicine": ["Emergency Medicine"],
  };
  const CREDS = new Set(["md", "do", "pa", "pa-c", "np", "facs", "phd", "dr", "mbbs", "jr", "sr", "ii", "iii"]);

  // ---------- helpers
  function npiCheck(npi) {
    const s = String(npi || "").replace(/\D/g, "");
    if (!npi) return { given: false };
    if (s.length !== 10) return { given: true, ok: false, why: `${s.length} digits, an NPI has 10` };
    if (s[0] !== "1" && s[0] !== "2") return { given: true, ok: false, why: "an NPI starts with 1 or 2" };
    const base = "80840" + s.slice(0, 9); let sum = 0;
    for (let i = base.length - 1, dbl = true; i >= 0; i--, dbl = !dbl) { let d = +base[i]; if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; }
    const want = String((10 - (sum % 10)) % 10);
    return want === s[9] ? { given: true, ok: true, npi: s } : { given: true, ok: false, npi: s, why: `check digit is ${s[9]}, Luhn with 80840 gives ${want}` };
  }
  function osa(a, b) { // optimal string alignment distance, capped use
    const m = a.length, n = b.length; const d = [];
    for (let i = 0; i <= m; i++) { d[i] = [i]; }
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  const low = (s) => String(s || "").toLowerCase().replace(/[^a-z\s,&.'-]/g, " ").replace(/'/g, "");
  function parseName(raw) {
    let s = low(raw).replace(/\bdr\.?\s+/g, " ");
    let first, last, middle = "", comma = false;
    const parts = s.split(",");
    const clean = (t) => t.split(/\s+/).map((w) => w.replace(/\.$/, "").replace(/-$/, "")).filter((w) => w && !CREDS.has(w));
    if (parts.length >= 2 && clean(parts[1]).length) { // "Last, First M" (trailing ", MD" handled by CREDS)
      const L = clean(parts[0]), R = clean(parts.slice(1).join(" "));
      if (R.length && L.length) { comma = true; last = L.join(" "); first = R[0]; middle = R[1] || ""; }
    }
    if (!comma) {
      const t = clean(parts.join(" "));
      first = t[0] || ""; last = t[t.length - 1] || ""; middle = t.length > 2 ? t[1] : "";
    }
    return { first, middle: middle.slice(0, 1), last, initialOnly: first.length === 1, comma };
  }
  const formal = (f) => NICK[f] || f;
  function normSite(s) {
    return low(s).replace(/[.,]/g, " ").split(/\s+/).filter(Boolean).map((w) => SITE_TOKENS[w] || w).join(" ").replace(/\s+/g, " ").trim();
  }
  function specSet(text) { const k = low(text).replace(/\s+/g, " ").trim(); return k ? SPECIALTY[k] || null : null; }

  function lastMatch(crmLast, pLast) {
    const a = crmLast.replace(/[^a-z]/g, ""), b = pLast.toLowerCase().replace(/[^a-z]/g, "");
    if (!a) return "none";
    if (a === b) return "exact";
    if (b.length >= 5 && osa(a, b) === 1) return "typo";
    return "none";
  }
  function firstMatch(crmFirst, pFirst) {
    const a = crmFirst.replace(/[^a-z]/g, ""), b = pFirst.toLowerCase();
    if (!a) return "none";
    if (a === b) return "exact";
    if (a.length === 1) return a === b[0] ? "initial" : "none";
    if (formal(a) === b || formal(a) === formal(b)) return "nickname";
    if (b.length >= 5 && osa(a, b) === 1) return "typo";
    return "none";
  }

  // ---------- registry index
  function indexRegistry(reg) {
    const byNpi = new Map(), byState = new Map(), siteById = new Map(), siteByNorm = new Map();
    for (const s of reg.sites) { siteById.set(s.id, s); siteByNorm.set(normSite(s.name), s); }
    for (const p of reg.providers) { byNpi.set(p.npi, p); if (!byState.has(p.state)) byState.set(p.state, []); byState.get(p.state).push(p); }
    return { reg, byNpi, byState, siteById, siteByNorm };
  }
  const pname = (p) => `${p.first}${p.middle ? " " + p.middle + "." : ""} ${p.last}, ${p.credential}`;

  // ---------- the agent, one row
  function checkRow(row, ix) {
    const steps = [], flags = [], drafts = [], decisions = [];
    const step = (tool, args, out, ok) => steps.push({ tool, args, out, ok });
    // 1. read
    const nm = parseName(row.name);
    const site = row.account ? ix.siteByNorm.get(normSite(row.account)) || null : null;
    const spec = specSet(row.specialty);
    step("read_row", `"${row.name}" · ${row.specialty || "no specialty"} · ${row.account || "no account"} · ${row.city || "?"}, ${row.state}`,
      `name → first "${nm.first}"${nm.middle ? `, middle "${nm.middle}"` : ""}, last "${nm.last}"${nm.first && NICK[nm.first] ? ` (nickname of ${NICK[nm.first]})` : ""}; ` +
      `account → ${site ? `${site.name} (${site.id})` : row.account ? "not in the site alias table" : "none"}; specialty → ${spec ? spec.join(" / ") : row.specialty ? "not in the specialty table" : "none"}`, true);
    // 2. NPI
    const nc = npiCheck(row.npi);
    let npiOwner = null;
    if (!nc.given) step("check_npi", "(blank)", "no NPI in the CRM row", null);
    else if (!nc.ok) { step("check_npi", row.npi, `fails: ${nc.why}. Treated as a typo; matching continues on name and site.`, false); flags.push("npi_checksum"); }
    else {
      npiOwner = ix.byNpi.get(nc.npi) || null;
      step("check_npi", row.npi, npiOwner ? `valid checksum; registry: ${pname(npiOwner)}, ${npiOwner.specialty}, ${npiOwner.city}` : "valid checksum, but not in the registry", npiOwner ? true : null);
    }
    // 3. candidates
    const pool = ix.byState.get(row.state) || [];
    const cands = new Map();
    for (const p of pool) {
      const direct = lastMatch(nm.last, p.last) !== "none";
      const swapped = !nm.comma && lastMatch(nm.first, p.last) === "exact" && firstMatch(nm.last, p.first) !== "none";
      if (direct || swapped) cands.set(p.npi, { p, swapped: !direct && swapped });
    }
    if (npiOwner && !cands.has(npiOwner.npi)) cands.set(npiOwner.npi, { p: npiOwner, swapped: false, viaNpi: true });
    step("search_registry", `last ≈ "${nm.last}" (exact or 1 edit), or first/last swapped, state = ${row.state}${npiOwner ? `, plus NPI ${npiOwner.npi}` : ""}`,
      `${cands.size} candidate${cands.size === 1 ? "" : "s"}`, cands.size ? true : null);
    // 4. evidence per candidate
    const scored = [];
    for (const { p, swapped } of cands.values()) {
      const lm = swapped ? lastMatch(nm.first, p.last) : lastMatch(nm.last, p.last);
      const fm = swapped ? firstMatch(nm.last, p.first) : firstMatch(nm.first, p.first);
      const ev = [], contra = []; let npiContra = false;
      let name = "none";
      if (lm === "exact" && ["exact", "nickname", "typo"].includes(fm)) name = "full";
      else if (lm === "typo" && ["exact", "nickname"].includes(fm)) name = "full";
      else if (lm !== "none" && fm === "initial") name = "initial";
      if (name !== "none") ev.push({ k: "name", s: `name ${swapped ? "(swapped) " : ""}last ${lm}, first ${fm}` });
      else contra.push(`name differs (last ${lm}, first ${fm})`);
      if (nm.middle && p.middle && nm.middle !== p.middle.toLowerCase()) contra.push(`middle initial ${nm.middle.toUpperCase()} vs ${p.middle}`);
      let strength = 0;
      if (nc.ok && npiOwner) {
        if (npiOwner.npi === p.npi) { ev.push({ k: "npi", s: "NPI matches" }); strength = Math.max(strength, 3); }
        else { contra.push(`CRM NPI belongs to ${pname(npiOwner)}`); npiContra = true; }
      }
      if (site && p.sites.includes(site.id)) { ev.push({ k: "site", s: `works at ${site.name}` }); strength = Math.max(strength, 2); }
      else if (site && p.pastSites.includes(site.id)) { ev.push({ k: "site_past", s: `worked at ${site.name} before` }); strength = Math.max(strength, 1.5); }
      const cityOk = row.city && row.city.toLowerCase() === p.city.toLowerCase();
      const specOk = spec && spec.includes(p.specialty);
      if (cityOk) ev.push({ k: "city", s: `city ${p.city}` });
      if (specOk) ev.push({ k: "spec", s: `specialty ${p.specialty}` });
      if (spec && !specOk) contra.push(`specialty ${p.specialty} vs CRM "${row.specialty}"`);
      if (cityOk && specOk) strength = Math.max(strength, 1);
      let passes, passesButNpi = false;
      if (name === "full") { passes = !contra.length && strength >= 1; passesButNpi = npiContra && contra.length === 1 && strength >= 1; }
      else if (name === "initial") passes = !contra.length && (strength >= 3 || (site && p.sites.includes(site.id) && specOk));
      else passes = false;
      scored.push({ npi: p.npi, label: pname(p), specialty: p.specialty, city: p.city, status: p.status, name, ev, contra, strength, passes, passesButNpi });
    }
    scored.sort((a, b) => (b.passes - a.passes) || (b.strength - a.strength) || ((b.name !== "none") - (a.name !== "none")));
    for (const c of scored.slice(0, 6)) step("compare", `${c.label} · ${c.npi}`, [...c.ev.map((e) => "✓ " + e.s), ...c.contra.map((x) => "✗ " + x)].join(" · ") || "no shared facts", c.passes);
    // 5. decide
    let verdict, linked = null, why;
    const passing = scored.filter((c) => c.passes);
    const npiConflict = nc.ok && npiOwner && !scored.find((c) => c.npi === npiOwner.npi && c.passes);
    const named = scored.filter((c) => c.name !== "none");
    if (npiConflict && npiOwner) {
      verdict = "needs a person";
      const alt = scored.filter((c) => c.passesButNpi);
      why = `the CRM NPI ${npiOwner.npi} belongs to ${pname(npiOwner)}, whose name does not match this row.` + (alt.length ? ` Without the NPI, the name and other facts point to ${alt.slice(0, 2).map((c) => `${c.label} (${c.npi})`).join(" or ")}.` : "");
      decisions.push({ q: `Row ${row.id}: the typed NPI and the name point to different people.`, opts: [...alt.slice(0, 2).map((c) => `Link to ${c.label} (${c.npi})`), "Ask the rep", "Leave unlinked"] });
      if (alt.length === 1) drafts.push({ kind: "update", text: `If confirmed, update CRM row ${row.id}: NPI ${row.npi} → ${alt[0].npi} (${alt[0].label}).` });
    } else if (passing.length === 1) {
      verdict = "linked"; linked = passing[0];
      const rivals = named.filter((c) => c.npi !== linked.npi);
      why = `name agrees and ${linked.ev.filter((e) => e.k !== "name").map((e) => e.s).join(", ")}; nothing contradicts.` + (rivals.length ? ` ${rivals.length} namesake${rivals.length > 1 ? "s" : ""} ruled out: ${rivals.slice(0, 2).map((c) => c.contra[0] || "no corroborating fact").join("; ")}.` : "");
    } else if (passing.length > 1) {
      const top = passing[0], second = passing[1];
      // Break a namesake tie only if no rival has any site or NPI evidence. A rival with a past or current
      // site in common is a real ambiguity (people move), so a person decides. (Fix after the first eval run.)
      if (top.strength >= 2 && passing.slice(1).every((c) => c.strength < 1.5)) {
        verdict = "linked"; linked = top;
        why = `${passing.length} namesakes pass, but only ${top.label} has ${top.strength >= 3 ? "the NPI" : "the CRM site"} as evidence; the others match only on city and specialty.`;
      } else {
        verdict = "needs a person";
        why = `${passing.length} providers with this name pass the same checks (${passing.slice(0, 3).map((c) => c.label).join("; ")}). The row has nothing that tells them apart.`;
        decisions.push({ q: `Row ${row.id}: which ${nm.first} ${nm.last}?`, opts: [...passing.slice(0, 3).map((c) => `Link to ${c.label} (${c.npi})`), "Ask the rep"] });
      }
    } else if (named.length) {
      verdict = "needs a person";
      const c = named[0];
      why = `closest is ${c.label}, but ${c.contra.length ? c.contra.join("; ") : "no second fact (NPI, site, or city plus specialty) confirms it"}.`;
      decisions.push({ q: `Row ${row.id}: is this ${c.label}?`, opts: [`Link to ${c.label} (${c.npi})`, "Not the same person", "Ask the rep"] });
    } else {
      verdict = "not found";
      why = scored.length ? `no candidate's name agrees (closest: ${scored[0].label}, ${scored[0].contra[0]}).` : "no provider with this name in the state.";
      drafts.push({ kind: "ask", text: `Ask the rep to confirm ${row.name}'s NPI or practice site; no registry provider matches.` });
    }
    step("decide", verdict, why, verdict === "linked" ? true : verdict === "not found" ? null : false);
    // 6. checks on the linked provider
    if (linked) {
      const p = ix.byNpi.get(linked.npi);
      const upd = {};
      if (!nc.ok || nc.npi !== p.npi) upd.NPI = `${row.npi || "(blank)"} → ${p.npi}`;
      if (p.status === "deactivated") {
        flags.push("deactivated");
        step("check_status", p.npi, "NPI is deactivated in the registry", false);
        drafts.push({ kind: "status", text: `Mark ${pname(p)} inactive in the CRM, or confirm a new NPI with the rep: ${p.npi} is deactivated.` });
      } else step("check_status", p.npi, "active", true);
      if (site && !p.sites.includes(site.id)) {
        const cur = p.sites.map((id) => ix.siteById.get(id).name);
        flags.push("moved");
        step("check_site", `${site.name} vs recent sites`, `CRM account is not among recent sites (${cur.join(", ")})${p.pastSites.includes(site.id) ? "; it is a past site" : ""}`, false);
        upd["Primary site"] = `${row.account} → ${cur[0]}`;
        decisions.push({ q: `Row ${row.id}: ${pname(p)} now works at ${cur.join(" / ")}. Update the CRM account?`, opts: [`Update to ${cur[0]}`, "Keep the current account", "Ask the rep"] });
      } else if (site) step("check_site", site.name, "CRM account is a recent site", true);
      else if (row.account) step("check_site", row.account, "account name not in the alias table: site not checked", null);
      if (Object.keys(upd).length) drafts.push({ kind: "update", text: `Update CRM row ${row.id}: ` + Object.entries(upd).map(([k, v]) => `${k} ${v}`).join("; "), fields: upd });
    }
    return { id: row.id, row, verdict, linked: linked ? linked.npi : null, linkedLabel: linked ? linked.label : null, candidates: scored.slice(0, 6).map((c) => ({ npi: c.npi, label: c.label, passes: c.passes, ev: c.ev.map((e) => e.s), contra: c.contra })), steps, flags, drafts, decisions, why };
  }

  // ---------- the agent, one CRM export
  function run(crm, registry) {
    const ix = indexRegistry(registry);
    const results = crm.rows.map((row) => checkRow(row, ix));
    // duplicates: two rows linked to one NPI
    const by = new Map();
    for (const r of results) if (r.linked) { if (!by.has(r.linked)) by.set(r.linked, []); by.get(r.linked).push(r); }
    for (const [npi, rs] of by) if (rs.length > 1) {
      for (const r of rs) {
        r.flags.push("duplicate");
        r.steps.push({ tool: "check_duplicates", args: npi, out: `also linked: ${rs.filter((x) => x !== r).map((x) => x.id).join(", ")}`, ok: false });
      }
      rs[0].drafts.push({ kind: "merge", text: `Merge CRM rows ${rs.map((x) => x.id).join(" + ")} into one contact for ${rs[0].linkedLabel} (${npi}).` });
      rs[0].decisions.push({ q: `Rows ${rs.map((x) => x.id).join(" + ")} are the same person. Merge?`, opts: ["Merge, keep the first", "Merge, keep the newest", "Keep both"] });
    }
    const s = { rows: results.length, linked: 0, person: 0, notfound: 0, moved: 0, duplicate: 0, deactivated: 0, npi_checksum: 0, compared: 0, drafts: 0, decisions: 0 };
    for (const r of results) {
      if (r.verdict === "linked") s.linked++; else if (r.verdict === "not found") s.notfound++; else s.person++;
      for (const f of r.flags) s[f]++;
      s.compared += r.candidates.length; s.drafts += r.drafts.length; s.decisions += r.decisions.length;
    }
    return { results, summary: s };
  }

  return { run, checkRow, indexRegistry, npiCheck, parseName, normSite, specSet, NICK, SITE_TOKENS, SPECIALTY };
});
