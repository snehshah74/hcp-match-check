// Page wiring. All matching happens in core.js (the same module the eval runs).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FLAG = { moved: "moved site", duplicate: "duplicate", deactivated: "NPI deactivated", npi_checksum: "NPI typo" };
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const st = { s: 0, run: null, shown: 0, tab: "all", open: null, pick: {}, mine: null, timer: null };

  // ---------- derived state
  const openDecisions = (r) => r.decisions.filter((d, j) => !(st.pick[r.id] || {})[j]);
  const needsYou = (r) => openDecisions(r).length > 0;
  const shortWhy = (r) => {
    if (r.verdict === "not found") return "Not in the registry: ask the rep";
    if (/belongs to/.test(r.why)) return "Typed NPI belongs to someone else";
    const m = r.why.match(/^(\d+) providers with this name/); if (m) return `${m[1]} namesakes, nothing tells them apart`;
    if (/^closest is/.test(r.why)) return "Closest match has no second fact";
    return r.why;
  };
  function counts() {
    const rs = st.run.results.slice(0, st.shown);
    const c = { rows: st.run.results.length, done: rs.length, linked: 0, you: 0, none: 0, flags: 0, compared: 0 };
    for (const r of rs) {
      if (r.verdict === "linked") c.linked++; else if (r.verdict === "not found") c.none++;
      if (needsYou(r)) c.you++;
      c.flags += r.flags.length; c.compared += r.candidates.length;
    }
    return c;
  }
  function changes() {
    const out = [];
    for (const r of st.run.results) {
      const p = st.pick[r.id] || {};
      if (r.verdict === "linked" && (r.row.npi || "") !== r.linked) out.push({ row: r.id, name: r.row.name, field: "NPI", from: r.row.npi || "(blank)", to: r.linked, by: "agent" });
      if (r.flags.includes("deactivated")) out.push({ row: r.id, name: r.row.name, field: "Status", from: "active", to: "review: NPI deactivated", by: "agent" });
      r.decisions.forEach((d, j) => {
        const o = p[j]; if (!o) return;
        const link = o.match(/^Link to (.+) \((\d{10})\)$/);
        const site = o.match(/^Update to (.+)$/);
        if (link) out.push({ row: r.id, name: r.row.name, field: "NPI", from: r.row.npi || "(blank)", to: link[2], by: "you" });
        else if (site) out.push({ row: r.id, name: r.row.name, field: "Account", from: r.row.account, to: site[1], by: "you" });
        else if (/^Merge/.test(o)) out.push({ row: r.id, name: r.row.name, field: "Merge", from: d.q.replace(/^Rows (.+) are.*$/, "$1"), to: o.toLowerCase(), by: "you" });
        else if (/rep/i.test(o)) out.push({ row: r.id, name: r.row.name, field: "Task", from: "", to: "ask the rep to confirm", by: "you" });
      });
    }
    return out;
  }

  // ---------- run
  function load(i) {
    clearInterval(st.timer);
    st.s = i; st.pick = {}; st.open = null; st.mine = null; st.tab = "all";
    const smp = window.SAMPLES[i];
    st.run = window.CORE.run(smp.crm, smp.registry);
    const instant = reduce || document.visibilityState === "hidden";
    st.shown = instant ? st.run.results.length : 0;
    renderSamples(); renderTry();
    if (instant) return finish();
    const step = Math.max(1, Math.ceil(st.run.results.length / 45));
    st.timer = setInterval(() => {
      st.shown = Math.min(st.run.results.length, st.shown + step);
      renderCounts(); renderTable();
      if (st.shown >= st.run.results.length) { clearInterval(st.timer); finish(); }
    }, 28);
    renderCounts(); renderTable();
  }
  function finish() {
    st.tab = "you";
    const first = st.run.results.find((r) => r.verdict === "needs a person");
    st.open = first ? first.id : null;
    renderAll();
  }
  const renderAll = () => { renderCounts(); renderTabs(); renderTable(); renderTray(); };

  function renderSamples() {
    $("samples").innerHTML = window.SAMPLES.map((x, i) => `<button type="button" aria-pressed="${i === st.s}" data-s="${i}">${esc(x.short)}</button>`).join("");
    $("samples").querySelectorAll("button").forEach((b) => (b.onclick = () => load(+b.dataset.s)));
  }
  function renderCounts() {
    const c = counts();
    $("prog").style.width = (100 * c.done / c.rows) + "%";
    $("counts").innerHTML = `<span><b>${c.done}</b>of ${c.rows} rows checked</span><span><b>${c.linked}</b>linked on evidence</span>
      <span class="you"><b>${c.you}</b>need you</span><span><b>${c.none}</b>not in registry</span><span><b>${c.flags}</b>flags</span><span><b>${c.compared}</b>candidates compared</span>`;
  }

  // ---------- table
  const TABS = [["you", "Needs you"], ["flags", "Flagged"], ["all", "All rows"], ["linked", "Linked"], ["none", "Not found"]];
  const inTab = (r, t) => t === "all" || (t === "you" && needsYou(r)) || (t === "flags" && r.flags.length) || (t === "linked" && r.verdict === "linked") || (t === "none" && r.verdict === "not found");
  function renderTabs() {
    const rs = st.run.results;
    $("tabs").innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.tab === k}" data-t="${k}">${l}<span class="n">${rs.filter((r) => inTab(r, k)).length}</span></button>`).join("");
    $("tabs").querySelectorAll("button").forEach((b) => (b.onclick = () => { st.tab = b.dataset.t; st.open = null; renderTabs(); renderTable(); }));
  }
  function dotClass(r) {
    if (needsYou(r)) return "you";
    if (st.pick[r.id] && Object.keys(st.pick[r.id]).length) return "done";
    return r.verdict === "linked" ? "linked" : r.verdict === "not found" ? "none" : "you";
  }
  function resultCell(r) {
    const tags = r.flags.map((f) => `<span class="tag">${esc(FLAG[f])}</span>`).join("");
    const p = st.pick[r.id] || {};
    const picked = Object.values(p);
    if (picked.length && r.verdict !== "linked") return `<span class="line"><b>You:</b> ${esc(picked[0])}</span>${tags}`;
    if (r.verdict === "linked") return `<span class="line">→ ${esc(r.linkedLabel)}</span>${tags}${needsYou(r) ? '<span class="tag">needs you</span>' : ""}`;
    return `<span class="line">${esc(shortWhy(r))}</span>${tags}`;
  }
  function rowHtml(r, pending, mine) {
    const row = r.row, open = st.open === r.id;
    return `<div class="tr ${pending ? "pending" : ""} ${open ? "open" : ""}" role="row" data-id="${esc(r.id)}" tabindex="${pending ? -1 : 0}" aria-expanded="${open}">
      <span class="dot ${pending ? "" : dotClass(r)}" aria-hidden="true"></span>
      <span class="who"><b>${esc(row.name)}</b><span class="sub">${mine ? "your row · " : ""}${esc(row.specialty || "no specialty")}</span></span>
      <span class="acct"><span class="sub" style="color:inherit">${esc(row.account || "no account")}</span><span class="sub">${esc(row.city || "?")}, ${esc(row.state)}</span></span>
      <span class="npi">${esc(row.npi || "no NPI")}</span>
      <span class="res">${pending ? '<span class="sub">checking…</span>' : resultCell(r)}</span>
    </div>${open && !pending ? detailHtml(r) : ""}`;
  }
  function detailHtml(r) {
    const p = st.pick[r.id] || {};
    const linkOpt = {}; // npi -> {j, text}
    r.decisions.forEach((d, j) => d.opts.forEach((o) => { const m = o.match(/\((\d{10})\)$/); if (m && /^Link to/.test(o)) linkOpt[m[1]] = { j, o }; }));
    const cards = r.candidates.slice(0, 4).map((c) => {
      const lo = linkOpt[c.npi], chosen = lo && p[lo.j] === lo.o, linked = r.linked === c.npi;
      return `<div class="card ${c.passes || linked ? "pass" : ""}"><h4>${esc(c.label)}</h4><span class="meta">NPI ${esc(c.npi)}</span>
        <ul>${c.ev.map((e) => `<li class="y">${esc(e)}</li>`).join("")}${c.contra.map((x) => `<li class="n">${esc(x)}</li>`).join("")}</ul>
        ${linked ? '<span class="tag ok">linked by the agent</span>' : lo ? `<button type="button" class="${chosen ? "cta" : "ghost dark"}" data-j="${lo.j}" data-o="${esc(lo.o)}">${chosen ? "✓ Picked" : "This is the one"}</button>` : ""}</div>`;
    }).join("");
    const other = r.decisions.map((d, j) => {
      const opts = d.opts.filter((o) => !(/^Link to/.test(o) && /\(\d{10}\)$/.test(o)));
      if (!opts.length) return "";
      return `<p class="why" style="margin-bottom:6px">${esc(((t) => t.charAt(0).toUpperCase() + t.slice(1))(d.q.replace(/^Rows? [^:]+?: /, "")))}</p><div class="actions">${opts.map((o) => `<button type="button" class="${p[j] === o ? "cta" : "ghost dark"}" data-j="${j}" data-o="${esc(o)}">${p[j] === o ? "✓ " : ""}${esc(o)}</button>`).join("")}</div>`;
    }).join("");
    const drafts = r.drafts.length ? `<ul class="drafts">${r.drafts.map((d) => `<li>${esc(d.text)}</li>`).join("")}</ul>` : "";
    const steps = r.steps.map((s) => `<li><code>${esc(s.tool)}</code> ${esc(s.args)}<br>→ ${esc(s.out)}</li>`).join("");
    return `<div class="detail" data-for="${esc(r.id)}">
      <p class="why"><b>${r.verdict === "linked" ? "Linked." : r.verdict === "not found" ? "Not found." : "Your call."}</b> ${esc(r.why.charAt(0).toUpperCase() + r.why.slice(1))}</p>
      ${cards ? `<div class="cards">${cards}</div>` : ""}${other}${drafts}
      <details class="trace"><summary>Show the ${r.steps.length} steps the agent ran</summary><ol>${steps}</ol></details></div>`;
  }
  function renderTable() {
    const rs = st.run.results;
    const done = st.shown >= rs.length;
    const list = done ? rs.filter((r) => inTab(r, st.tab)) : rs.slice(0, Math.min(rs.length, st.shown + 12));
    let html = `<div class="thead" role="row"><span></span><span>CRM row</span><span>Account</span><span>NPI in CRM</span><span>Result</span></div>`;
    if (st.mine) html += rowHtml(st.mine, false, true);
    html += list.map((r) => rowHtml(r, rs.indexOf(r) >= st.shown, false)).join("");
    if (done && !list.length) html += `<div class="empty">${st.tab === "you" ? "Nothing left for you. Download the changes below." : "No rows here."}</div>`;
    $("table").innerHTML = html;
    if (!done) return;
    $("table").querySelectorAll(".tr").forEach((el) => {
      const toggle = () => { st.open = st.open === el.dataset.id ? null : el.dataset.id; renderTable(); };
      el.onclick = toggle; el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
    });
    $("table").querySelectorAll(".detail [data-o]").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const id = b.closest(".detail").dataset.for; const j = +b.dataset.j;
      st.pick[id] = st.pick[id] || {};
      if (st.pick[id][j] === b.dataset.o) delete st.pick[id][j]; else st.pick[id][j] = b.dataset.o;
      renderCounts(); renderTabs(); renderTable(); renderTray();
    }));
  }

  // ---------- changes tray
  function csv() {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    return ["row_id,crm_name,field,from,to,decided_by"].concat(changes().map((c) => [c.row, c.name, c.field, c.from, c.to, c.by].map(q).join(","))).join("\n") + "\n";
  }
  function renderTray() {
    const ch = changes(); const you = ch.filter((c) => c.by === "you").length; const left = counts().you;
    $("tray").hidden = false;
    $("traytext").innerHTML = `<b>${ch.length}</b> CRM changes ready <span class="wide">(${ch.length - you} on evidence, ${you} from you)</span> · <b>${left}</b> left for you<span class="wide"> · nothing is written until you import it</span>`;
  }
  $("dlcsv").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv()], { type: "text/csv" }));
    a.download = "crm-changes.csv"; document.body.appendChild(a); a.click(); a.remove();
  };
  $("copycsv").onclick = () => { const b = $("copycsv"); const done = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1200); }; try { navigator.clipboard.writeText(csv()).then(done, done); } catch (e) { done(); } };

  // ---------- test a row
  $("addrow").onclick = () => { const f = $("tryform"); f.hidden = !f.hidden; if (!f.hidden) f.elements.name.focus(); };
  function renderTry() {
    const smp = window.SAMPLES[st.s];
    $("trystate").innerHTML = [...new Set(smp.registry.providers.map((p) => p.state))].map((s) => `<option>${s}</option>`).join("");
    const ex = smp.examples || [];
    $("tryhint").innerHTML = "Checked against this export's synthetic registry. Try: " + ex.map((e, i) => `<button type="button" data-ex="${i}">${esc(e.label)}</button>`).join("");
    $("tryhint").querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => {
      const e = ex[+b.dataset.ex], f = $("tryform");
      for (const k of ["name", "specialty", "account", "city", "state", "npi"]) f.elements[k].value = e.row[k] || "";
      check();
    }));
  }
  function check() {
    const f = $("tryform"), smp = window.SAMPLES[st.s];
    const row = { id: "YOUR-ROW", name: f.elements.name.value, specialty: f.elements.specialty.value, account: f.elements.account.value, city: f.elements.city.value, state: f.elements.state.value, npi: f.elements.npi.value.trim(), credential: "" };
    if (!row.name.trim()) return;
    st.mine = window.CORE.checkRow(row, window.CORE.indexRegistry(smp.registry));
    st.open = "YOUR-ROW"; renderTable();
  }
  $("tryform").addEventListener("submit", (e) => { e.preventDefault(); check(); });
  $("rerun").onclick = () => load(st.s);
  // a background tab throttles timers: never leave a half-run table behind
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && st.shown < st.run.results.length) { clearInterval(st.timer); st.shown = st.run.results.length; finish(); }
  });

  // ---------- eval
  function renderEval() {
    const E = window.EVAL; if (!E) return;
    const h = E.headline, f = E.first.heldout;
    $("evalsum").textContent = `· ${h.wrong_links} wrong links on ${h.crm_rows_checked} synthetic test rows, after one fix`;
    const row = (n, s) => `<tr><td>${n}</td><td>${s.rows}</td><td><b>${s.wrong_links}</b> of ${s.linked}</td><td>${s.linked_correct} of ${s.with_truth}</td><td>${s.moved_flagged} of ${s.moved}</td><td>${s.dup_flagged} of ${s.dup}</td></tr>`;
    $("evalbody").innerHTML = `
      <div class="evalgrid"><div><b>${esc(h.wrong_links)}</b>wrong links</div><div><b>${esc(h.rows_auto_linked)}</b>true matches linked without you</div><div><b>${esc(h.moves_flagged)}</b>planted moves flagged</div><div><b>${esc(h.duplicates_flagged)}</b>duplicate rows flagged</div></div>
      <div class="miss"><b>The first run got one wrong.</b> On the held-out set, a CRM account was one surgeon's past site and a same-named surgeon's current site, and the tie-break picked "current site". Fix: break a tie only when no rival shares any site; otherwise it's yours. Since I fixed it after seeing that set, I generated a fresh one and ran it once: 0 wrong links.</div>
      <div class="tablewrap"><table><thead><tr><th>Set</th><th>Rows</th><th>Wrong links</th><th>Linked without you</th><th>Moves flagged</th><th>Duplicates</th></tr></thead><tbody>
      ${row("First run, held-out", f)}${row("Tuning", E.tuning)}${row("Held-out, after fix", E.heldout)}${row("Fresh held-out, run once", E.heldout2)}${row("Stress, never tuned", E.stress)}</tbody></table></div>
      <p class="fine">Below target: held-out move recall ${E.heldout.moved_flagged} of ${E.heldout.moved} (goal 90%), because ambiguous rows come to you before a move can be flagged. On the stress set (dense namesakes, acronym site names) more rows come to you: ${E.stress.linked_correct} of ${E.stress.with_truth} linked without you. I wrote the generator and the rules, so this shows consistency, not real-world accuracy. ${esc(E.data)}</p>`;
  }

  renderEval();
  load(0);
})();
