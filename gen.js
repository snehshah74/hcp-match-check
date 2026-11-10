// Seeded synthetic data: a provider registry (NPPES-shaped, plus recent and past sites of care)
// and device-company CRM exports with planted problems and known answers.
// Synthetic NPIs start with 2: a valid format that has not been issued yet, so none is a real person's.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GEN = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function rng(seed) {
    let a = seed >>> 0;
    const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.int = (n) => Math.floor(r() * n);
    r.pick = (xs) => xs[Math.floor(r() * xs.length)];
    r.chance = (p) => r() < p;
    r.shuffle = (xs) => { const o = xs.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
    return r;
  }

  function luhnNpi(nine) { // check digit for a 9-digit base, computed with the 80840 prefix
    const s = "80840" + nine; let sum = 0;
    for (let i = s.length - 1, dbl = true; i >= 0; i--, dbl = !dbl) { let d = +s[i]; if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; }
    return String((10 - (sum % 10)) % 10);
  }

  // formal first name -> nicknames used in CRMs
  const FIRSTS = {
    Michael: ["Mike"], Robert: ["Bob", "Rob"], William: ["Bill", "Will"], James: ["Jim", "Jimmy"], Richard: ["Rick", "Dick"],
    Thomas: ["Tom"], Christopher: ["Chris"], Daniel: ["Dan"], Matthew: ["Matt"], Anthony: ["Tony"], Joseph: ["Joe"],
    Steven: ["Steve"], Andrew: ["Andy", "Drew"], Jonathan: ["Jon"], Benjamin: ["Ben"], Samuel: ["Sam"], Nicholas: ["Nick"],
    Edward: ["Ed", "Ted"], Alexander: ["Alex"], Gregory: ["Greg"], Timothy: ["Tim"], Patrick: ["Pat"], Kenneth: ["Ken"],
    Elizabeth: ["Liz", "Beth"], Katherine: ["Kate", "Kathy"], Jennifer: ["Jen"], Margaret: ["Maggie", "Peggy"], Patricia: ["Trish", "Patty"],
    Rebecca: ["Becky"], Susan: ["Sue"], Deborah: ["Deb"], Victoria: ["Vicky"], Christina: ["Tina"], Jessica: ["Jess"], Abigail: ["Abby"],
    Priya: [], Wei: [], Arjun: [], Olumide: [], Mei: [], Rahul: [], Ana: [], Carlos: [], Fatima: [], Hiroshi: [], Laura: [], Rachel: [],
    Sarah: [], David: [], Mark: [], Paul: [], Kevin: [], Brian: [], Emily: [], Hannah: [], Grace: [], Nadia: [], Omar: [], Yusuf: [],
  };
  const FIRST_LIST = Object.keys(FIRSTS);
  const LASTS = ("Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson Thomas Taylor Moore " +
    "Jackson Martin Lee Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Nguyen Hill Flores " +
    "Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Patel Shah Okafor Adeyemi Kowalski Novak Lindqvist Haddad Nakamura Tanaka " +
    "Chen Wang Zhang Kim Park Choi Gupta Iyer Reddy Kapoor Mehta Fischer Weber Schmidt Becker Moreau Laurent Rossi Bianchi Ferrari Costa Silva " +
    "Oliveira Santos Murphy Kelly Sullivan Byrne Walsh OBrien Donnelly Gallagher Brennan Quinn Fitzgerald Hughes Morgan Price Bennett Ward Foster " +
    "Hayes Bryant Russell Griffin Diaz Myers Ford Hamilton Graham Sims Wallace Woods Cole West Jordan Owens Reynolds Ellis Harrison Gibson McDonald " +
    "Cruz Marshall Ortiz Gomez Murray Freeman Wells Webb Simpson Stevens Tucker Porter Hunter Hicks Crawford Henry Boyd Mason Kennedy Warren Dixon " +
    "Burns Gordon Shaw Holmes Rice Robertson Black Daniels Palmer Mills Nichols Grant Knight Ferguson Rose Stone Hawkins Dunn Perkins Hudson Spencer " +
    "Gardner Stephens Payne Pierce Berry Matthews Arnold Wagner Willis Ray Watkins Olson Carroll Duncan Snyder Hart Cunningham Bradley Lane Andrews Ruiz").split(" ");

  const SITE_PREFIX = ["Riverside", "Lakeview", "Northgate", "Saint Anne", "Saint Luke", "Mercy", "Valley", "Summit", "Harbor", "Pinecrest", "Cedar Ridge",
    "Westfield", "Eastbrook", "Grandview", "Saint Joseph", "Highland", "Fairmont", "Brookside", "Oak Hill", "Meadowbrook", "Stonebridge", "Bayview",
    "Saint Mary", "Clearwater", "Ironwood", "Maple Grove", "Silver Lake", "Hillcrest", "Kingsbridge", "Redwood", "Saint Francis", "Elmwood", "Fox Run",
    "Granite Falls", "Willow Creek", "Prairie View", "Saint Vincent", "Copper Hill", "Ashford", "Beacon"];

  const FAMILIES = {
    tuning: {
      label: "Spine and joint device maker",
      states: { MA: ["Boston", "Worcester", "Springfield"], NY: ["Albany", "Buffalo", "Rochester"], OH: ["Columbus", "Cleveland", "Dayton"] },
      specialties: ["Orthopedic Surgery", "Orthopedic Surgery", "Neurosurgery", "Physical Medicine and Rehabilitation"],
      bait: ["Family Medicine", "Internal Medicine", "Radiology"],
      clinic: "Orthopedic Associates",
      specText: {
        "Orthopedic Surgery": ["Orthopedic Surgery", "Ortho", "Orthopaedics", "Orthopaedic Surgery", "Ortho Surgery"],
        Neurosurgery: ["Neurosurgery", "Neurological Surgery", "Spine"],
        "Physical Medicine and Rehabilitation": ["PM&R", "Physiatry", "Physical Medicine"],
      },
      mix: { clean: 14, no_npi: 12, nickname: 8, typo_name: 5, swapped: 4, npi_typo: 5, wrong_npi: 3, moved: 7, namesake_city: 4, namesake_site: 3, namesake_ambiguous: 3, duplicate: 4, deactivated: 3, not_found: 4, not_found_trap: 2, initial: 3 },
    },
    heldout: {
      label: "Urology and cardiology device maker",
      states: { TX: ["Houston", "Austin", "Dallas"], GA: ["Atlanta", "Savannah", "Macon"], AZ: ["Phoenix", "Tucson", "Mesa"] },
      specialties: ["Urology", "Urology", "Interventional Cardiology", "Cardiology"],
      bait: ["Family Medicine", "Internal Medicine", "Emergency Medicine"],
      clinic: "Heart and Vascular Institute",
      specText: {
        Urology: ["Urology", "Urologist", "Uro", "Urologic Surgery"],
        "Interventional Cardiology": ["Interventional Cardiology", "IC", "Cardiology - Interventional", "Cardiology"],
        Cardiology: ["Cardiology", "Cardiologist", "Cardiovascular Disease", "Cardio"],
      },
      mix: { clean: 10, no_npi: 10, nickname: 12, typo_name: 6, swapped: 7, npi_typo: 4, wrong_npi: 4, moved: 8, namesake_city: 4, namesake_site: 4, namesake_ambiguous: 3, duplicate: 4, deactivated: 2, not_found: 4, not_found_trap: 3, initial: 3 },
    },
    stress: {
      label: "Stress: dense namesakes, double typos, unknown aliases",
      states: { FL: ["Miami", "Tampa", "Orlando"], IL: ["Chicago", "Peoria", "Naperville"] },
      specialties: ["Orthopedic Surgery", "Urology", "Interventional Cardiology", "Neurosurgery"],
      bait: ["Family Medicine", "Internal Medicine"],
      clinic: "Specialty Group",
      specText: {
        "Orthopedic Surgery": ["Ortho", "Orthopedics", "Bone and Joint"], Urology: ["Urology", "GU"],
        "Interventional Cardiology": ["Interventional Cardiology", "Cath Lab"], Neurosurgery: ["Neurosurgery", "Spine"],
      },
      mix: { clean: 6, no_npi: 8, nickname: 8, typo_name: 4, typo2: 6, swapped: 5, npi_typo: 4, wrong_npi: 4, moved: 6, namesake_city: 6, namesake_site: 6, namesake_ambiguous: 6, duplicate: 4, deactivated: 2, not_found: 3, not_found_trap: 4, initial: 4, odd_alias: 4 },
      namesakeRate: 0.25,
    },
  };

  function abbreviateSite(name, r) {
    let s = name;
    if (r.chance(0.6)) s = s.replace(/^Saint /, r.pick(["St. ", "St "]));
    s = s.replace(/Regional Medical Center$/, () => r.pick(["Regional Med Ctr", "Reg. Medical Center", "Regional MC"]))
      .replace(/Medical Center$/, () => r.pick(["Med Ctr", "Medical Ctr", "MC", "Medical Center"]))
      .replace(/Surgery Center$/, () => r.pick(["ASC", "Surg Ctr", "Surgery Ctr", "Surgical Center"]))
      .replace(/Hospital$/, () => r.pick(["Hosp", "Hospital", "Hosp."]));
    if (r.chance(0.3)) s = s.toUpperCase();
    return s;
  }
  function oddAlias(name) { // acronyms no fixed table can know
    return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase() + " campus";
  }

  function oneTypo(s, r) {
    const i = 1 + r.int(Math.max(1, s.length - 2));
    const k = r.int(3);
    if (k === 0) return s.slice(0, i) + s.slice(i + 1); // deletion
    if (k === 1) return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2); // transposition
    const letters = "aeiourstnl"; let c = r.pick(letters.split("")); if (c === s[i]) c = "y";
    return s.slice(0, i) + c + s.slice(i + 1);
  }

  function makeFamily(familyKey, seed) {
    const F = FAMILIES[familyKey], r = rng(seed);
    const usedNpi = new Set(), usedSite = new Set();
    const newNpi = () => { for (;;) { const nine = "2" + String(10000000 + r.int(89999999)); if (usedNpi.has(nine)) continue; usedNpi.add(nine); return nine + luhnNpi(nine); } };
    // sites
    const sites = []; let sid = 0;
    const prefixes = r.shuffle(SITE_PREFIX);
    let pi = 0;
    for (const [st, cities] of Object.entries(F.states)) for (const city of cities) {
      const kinds = ["Medical Center", r.pick(["Hospital", "Regional Medical Center"]), "Surgery Center", F.clinic];
      for (const kind of kinds) {
        let name; do { name = prefixes[pi++ % prefixes.length] + " " + kind + (pi > prefixes.length ? " " + city : ""); } while (usedSite.has(name));
        usedSite.add(name);
        sites.push({ id: "S" + (++sid), name, city, state: st, type: kind === "Surgery Center" ? "ASC" : kind === F.clinic ? "Clinic" : "Hospital" });
      }
    }
    const sitesIn = (city) => sites.filter((s) => s.city === city);
    const providers = [];
    const cityOf = (st) => r.pick(F.states[st]);
    function makeProvider(opts) {
      opts = opts || {};
      const st = opts.state || r.pick(Object.keys(F.states));
      const city = opts.city || cityOf(st);
      const local = sitesIn(city);
      const cur = opts.sites || r.shuffle(local).slice(0, 1 + r.int(2));
      const others = sites.filter((s) => !cur.includes(s) && s.state === st);
      const past = opts.past || (r.chance(0.25) ? [r.pick(others)] : []);
      const p = {
        npi: newNpi(), first: opts.first || r.pick(FIRST_LIST), last: opts.last || r.pick(LASTS),
        middle: opts.middle !== undefined ? opts.middle : (r.chance(0.6) ? String.fromCharCode(65 + r.int(26)) : ""),
        credential: r.chance(0.85) ? "MD" : "DO", specialty: opts.specialty || (r.chance(0.85) ? r.pick(F.specialties) : r.pick(F.bait)),
        city, state: st, status: "active", sites: cur.map((s) => s.id), pastSites: past.map((s) => s.id),
      };
      providers.push(p); return p;
    }
    for (let i = 0; i < 420; i++) makeProvider();
    // background namesakes: same first+last somewhere in the same state
    const rate = F.namesakeRate || 0.08;
    for (const p of providers.slice(0, Math.round(420 * rate))) makeProvider({ first: p.first, last: p.last, state: p.state });
    // a few background deactivations
    for (const p of r.shuffle(providers).slice(0, 8)) p.status = "deactivated";
    return { key: familyKey, label: F.label, F, r, sites, providers, makeProvider, newNpi };
  }

  const NAME_FORMATS = [
    (p, f) => `${f} ${p.last}`,
    (p, f) => `Dr. ${f} ${p.last}`,
    (p, f) => `${p.last}, ${f}${p.middle ? " " + p.middle + "." : ""}`,
    (p, f) => `${f.toUpperCase()} ${p.middle ? p.middle + " " : ""}${p.last.toUpperCase()} ${p.credential}`,
    (p, f) => `${f} ${p.middle ? p.middle + ". " : ""}${p.last}, ${p.credential}`,
  ];

  // Build one customer's CRM export from a family registry. Each row carries its planted truth.
  function makeCustomer(fam, seed, nameTag) {
    const r = rng(seed), F = fam.F, sites = fam.sites;
    const siteById = Object.fromEntries(sites.map((s) => [s.id, s]));
    const target = fam.providers.filter((p) => F.specialties.includes(p.specialty) && p.status === "active");
    const used = new Set();
    const pickP = (pred) => { const pool = r.shuffle(target).filter((p) => !used.has(p.npi) && (!pred || pred(p))); const p = pool[0]; if (p) used.add(p.npi); return p; };
    const specText = (p) => (F.specText[p.specialty] ? r.pick(F.specText[p.specialty]) : p.specialty);
    const fmt = (p, first) => r.pick(NAME_FORMATS)(p, first || p.first);
    const acct = (id, odd) => (odd ? oddAlias(siteById[id].name) : abbreviateSite(siteById[id].name, r));
    const rows = []; let n = 0;
    const row = (p, o, truth) => {
      const base = { id: `${nameTag}-${String(++n).padStart(3, "0")}`, name: fmt(p, o.first), credential: p.credential, specialty: o.spec !== undefined ? o.spec : specText(p),
        account: o.account !== undefined ? o.account : acct(r.pick(p.sites)), city: o.city !== undefined ? o.city : p.city, state: p.state, npi: o.npi !== undefined ? o.npi : "" };
      if (o.name) base.name = o.name;
      rows.push({ ...base, truth: { npi: null, expect: "link", flags: [], ...truth } });
      return rows[rows.length - 1];
    };
    const plan = [];
    for (const [k, c] of Object.entries(F.mix)) for (let i = 0; i < c; i++) plan.push(k);
    for (const arch of r.shuffle(plan)) {
      let p;
      switch (arch) {
        case "clean": p = pickP(); row(p, { npi: p.npi }, { npi: p.npi, arch }); break;
        case "no_npi": p = pickP(); row(p, {}, { npi: p.npi, arch }); break;
        case "nickname": p = pickP((q) => FIRSTS[q.first].length); row(p, { first: r.pick(FIRSTS[p.first]) }, { npi: p.npi, arch }); break;
        case "typo_name": p = pickP((q) => q.last.length >= 5); row(p, { name: `${p.first} ${oneTypo(p.last, r)}` }, { npi: p.npi, arch }); break;
        case "typo2": p = pickP((q) => q.last.length >= 6); row(p, { name: `${oneTypo(p.first, r)} ${oneTypo(p.last, r)}` }, { npi: p.npi, arch, expect: "review-or-notfound" }); break;
        case "swapped": p = pickP(); row(p, { name: `${p.last} ${p.first}` }, { npi: p.npi, arch }); break;
        case "npi_typo": {
          p = pickP(); const d = p.npi.split(""); const i = 1 + r.int(8); d[i] = String((+d[i] + 1 + r.int(8)) % 10);
          row(p, { npi: d.join("") }, { npi: p.npi, arch, flags: ["npi_checksum"] }); break;
        }
        case "wrong_npi": { // a valid NPI from someone else (copied from the row above in the CRM)
          p = pickP(); const other = r.pick(fam.providers.filter((q) => q.npi !== p.npi && q.last !== p.last));
          row(p, { npi: other.npi }, { npi: p.npi, arch, expect: "review" }); break;
        }
        case "moved": {
          p = pickP((q) => q.sites.length >= 1);
          const old = r.pick(sites.filter((s) => s.state === p.state && !p.sites.includes(s.id)));
          p.pastSites = [old.id];
          const withNpi = r.chance(0.5);
          row(p, { account: acct(old.id), npi: withNpi ? p.npi : "" }, { npi: p.npi, arch, flags: ["moved"] }); break;
        }
        case "namesake_city": { // same name, same state, other city
          p = pickP(); const otherCity = r.pick(F.states[p.state].filter((c) => c !== p.city));
          fam.makeProvider({ first: p.first, last: p.last, state: p.state, city: otherCity, specialty: p.specialty });
          row(p, {}, { npi: p.npi, arch }); break;
        }
        case "namesake_site": { // same name, same city and specialty, different sites: the account decides
          p = pickP((q) => q.sites.length === 1);
          const others = sites.filter((s) => s.city === p.city && !p.sites.includes(s.id));
          fam.makeProvider({ first: p.first, last: p.last, state: p.state, city: p.city, specialty: p.specialty, middle: p.middle ? "" : "J", sites: [r.pick(others)], past: [] });
          row(p, { account: acct(p.sites[0]) }, { npi: p.npi, arch }); break;
        }
        case "namesake_ambiguous": { // same name, city, specialty and a shared site; no NPI, no middle initial typed
          p = pickP();
          const twin = fam.makeProvider({ first: p.first, last: p.last, state: p.state, city: p.city, specialty: p.specialty, sites: [siteById[p.sites[0]]], past: [] });
          row(p, { name: `${p.first} ${p.last}`, account: acct(p.sites[0]) }, { npi: p.npi, arch, expect: "review", twin: twin.npi }); break;
        }
        case "duplicate": {
          p = pickP((q) => FIRSTS[q.first].length);
          row(p, { npi: r.chance(0.5) ? p.npi : "" }, { npi: p.npi, arch, flags: ["duplicate"] });
          row(p, { first: r.pick(FIRSTS[p.first]) }, { npi: p.npi, arch, flags: ["duplicate"] }); break;
        }
        case "deactivated": p = pickP(); p.status = "deactivated"; row(p, { npi: p.npi }, { npi: p.npi, arch, flags: ["deactivated"] }); break;
        case "not_found": { // a person the registry does not have (e.g. new to the state)
          const ghost = { first: r.pick(FIRST_LIST), last: r.pick(LASTS) + r.pick(["-Reyes", "-Olsen", "berg", "ski"]), middle: "", credential: "MD", specialty: r.pick(F.specialties), city: r.pick(Object.values(F.states)[0]), state: Object.keys(F.states)[0], sites: [r.pick(sites).id] };
          row(ghost, {}, { npi: null, arch, expect: "not_found" }); break;
        }
        case "not_found_trap": { // same surname at the same site, different first name
          const host = pickP(); used.delete(host.npi);
          let first; do { first = r.pick(FIRST_LIST); } while (first === host.first || (FIRSTS[first] || []).includes(host.first));
          const ghost = { ...host, first, middle: "" };
          row(ghost, { account: acct(host.sites[0]) }, { npi: null, arch, expect: "not_found" }); break;
        }
        case "initial": p = pickP(); row(p, { name: `${p.first[0]}. ${p.last}`, npi: r.chance(0.5) ? p.npi : "" }, { npi: p.npi, arch }); break;
        case "odd_alias": p = pickP(); row(p, { account: acct(p.sites[0], true) }, { npi: p.npi, arch }); break;
      }
    }
    // the reference copy the agent sees has no truth, but the registry is shared and mutable above: snapshot it now
    return { id: nameTag, label: fam.label, rows };
  }

  function snapshotRegistry(fam) {
    return { sites: fam.sites.map((s) => ({ ...s })), providers: fam.providers.map((p) => ({ npi: p.npi, first: p.first, middle: p.middle, last: p.last, credential: p.credential, specialty: p.specialty, city: p.city, state: p.state, status: p.status, sites: p.sites.slice(), pastSites: p.pastSites.slice() })) };
  }

  // A study = one family registry + several customers' CRM exports built against it.
  function makeStudy(familyKey, seed, customers) {
    const fam = makeFamily(familyKey, seed);
    const crms = [];
    for (let i = 0; i < customers; i++) crms.push(makeCustomer(fam, seed * 31 + i + 1, `${familyKey.slice(0, 2).toUpperCase()}${seed}-${i + 1}`));
    return { family: familyKey, label: fam.label, registry: snapshotRegistry(fam), crms };
  }

  function makeSet() {
    return {
      tuning: [makeStudy("tuning", 11, 3)],
      heldout: [makeStudy("heldout", 23, 2)],
      // fresh held-out seed added AFTER the first run's fix, run once, never used to change rules
      heldout2: [makeStudy("heldout", 59, 2)],
      stress: [makeStudy("stress", 37, 2)],
    };
  }

  return { rng, luhnNpi, FIRSTS, makeStudy, makeSet, FAMILIES };
});
