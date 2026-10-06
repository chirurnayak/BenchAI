/* ===================================================================
   Bench — application logic
=================================================================== */

const state = loadState();
let lastParsed = null;
let lastResults = [];
let activeBookingResource = null;

// ---------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------
const views = document.querySelectorAll(".view");
const navItems = document.querySelectorAll(".nav-item");

function showView(name) {
  views.forEach(v => v.classList.toggle("is-active", v.id === `view-${name}`));
  navItems.forEach(n => n.classList.toggle("is-active", n.dataset.view === name));
  if (name === "bookings") renderBookings();
  if (name === "approvals") renderApprovals();
  if (name === "peers") renderPeers();
  closeNotifDrawer();
}
navItems.forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
document.getElementById("goToResults").addEventListener("click", () => showView("discover"));

// ---------------------------------------------------------------
// 2. Intent Parser
// A light rule-based parser: no external NLP service needed for the
// demo, but structured exactly like a real one would be swapped in.
// ---------------------------------------------------------------
const TYPE_KEYWORDS = {
  equipment: ["oscilloscope", "scope", "multimeter", "printer", "3d printer", "drill", "camera", "kit", "soldering iron"],
  space: ["room", "space", "pod", "studio", "booth", "lab bench", "bench", "quiet"],
  skill: ["mentor", "help", "teach", "someone who", "person who", "tutor", "guidance"],
};

const URGENCY_KEYWORDS = {
  urgent: ["urgent", "asap", "right now", "immediately", "emergency"],
  today: ["today", "tonight", "this evening", "this afternoon"],
  tomorrow: ["tomorrow"],
  thisWeek: ["this week", "by friday", "by monday", "by thursday", "next few days"],
};

function parseIntent(text) {
  const t = text.toLowerCase();

  // resource type: whichever category has a matching keyword hit first
  let category = "equipment";
  let matchedTypeWord = null;
  for (const [cat, words] of Object.entries(TYPE_KEYWORDS)) {
    const hit = words.find(w => t.includes(w));
    if (hit) { category = cat; matchedTypeWord = hit; break; }
  }
  // "someone who knows X" / "need a mentor for X" pattern → skill
  if (/someone who|person who|mentor|knows\s/.test(t)) category = "skill";

  // time window
  let time = "Unspecified";
  if (URGENCY_KEYWORDS.today.some(w => t.includes(w))) time = "Today";
  else if (URGENCY_KEYWORDS.tomorrow.some(w => t.includes(w))) time = "Tomorrow";
  else if (URGENCY_KEYWORDS.thisWeek.some(w => t.includes(w))) time = "This week";

  // urgency
  let urgency = "Standard";
  if (URGENCY_KEYWORDS.urgent.some(w => t.includes(w))) urgency = "Urgent";
  else if (time === "Today") urgency = "High";
  else if (time === "Tomorrow") urgency = "Medium";

  // resource type label — best-guess noun from the sentence
  const allTypeWords = Object.values(TYPE_KEYWORDS).flat();
  const foundWord = allTypeWords.find(w => t.includes(w)) || matchedTypeWord;
  const resourceType = foundWord ? foundWord.replace(/\b\w/g, c => c.toUpperCase()) : "General resource";

  return { raw: text, resourceType, category, time, urgency, tokens: t.split(/[^a-z0-9]+/).filter(Boolean) };
}

document.getElementById("requestForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = document.getElementById("requestInput").value.trim();
  if (!text) return;
  runParse(text);
});

document.querySelectorAll("#exampleChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.getElementById("requestInput").value = chip.dataset.example;
    runParse(chip.dataset.example);
  });
});

function runParse(text) {
  lastParsed = parseIntent(text);
  document.getElementById("p-type").textContent = lastParsed.resourceType;
  document.getElementById("p-category").textContent = lastParsed.category;
  document.getElementById("p-time").textContent = lastParsed.time;
  document.getElementById("p-urgency").textContent = lastParsed.urgency;
  document.getElementById("parsedPanel").hidden = false;
  document.getElementById("discoverSub").textContent =
    `Matching "${text}" — ranked by relevance, availability, and distance from ${STUDENT_BUILDING}.`;
  runMatch(lastParsed);
}

// ---------------------------------------------------------------
// 3–5 & 7. Discovery & Matching Engine, Availability Filter,
// Location-Aware Ranking, Eligibility & Access Rules
// ---------------------------------------------------------------
function scoreResource(res, intent) {
  let score = 0;
  const tokens = intent.tokens;
  const hay = res.keywords.join(" ");
  tokens.forEach(tok => { if (tok.length > 2 && hay.includes(tok)) score += 8; });
  if (res.category === intent.category) score += 15;
  if (res.freeNow) score += 10;
  const dist = distanceFrom(res.location);
  score += Math.max(0, 10 - dist * 3); // closer buildings score higher
  if (intent.urgency === "Urgent" || intent.urgency === "High") {
    score += res.freeNow ? 8 : -6;
  }
  return { score, dist };
}

function runMatch(intent) {
  const scored = RESOURCE_REGISTRY.map(res => {
    const { score, dist } = scoreResource(res, intent);
    return { ...res, score, dist };
  }).filter(r => r.score > 5);

  scored.sort((a, b) => b.score - a.score);
  lastResults = scored;
  renderResults();
  showView("discover");
}

function renderResults() {
  const grid = document.getElementById("resultGrid");
  const availOnly = document.getElementById("availOnly").checked;
  const nearbyFirst = document.getElementById("nearbyFirst").checked;
  const catFilter = document.getElementById("categoryFilter").value;

  let list = lastResults.length ? [...lastResults] : RESOURCE_REGISTRY.map(r => ({ ...r, score: 50, dist: distanceFrom(r.location) }));
  if (availOnly) list = list.filter(r => r.freeNow);
  if (catFilter !== "all") list = list.filter(r => r.category === catFilter);
  if (nearbyFirst) list.sort((a, b) => (b.score - a.dist * 2) - (a.score - b.dist * 2));

  grid.innerHTML = "";
  if (!list.length) {
    grid.innerHTML = `<p class="empty-note">Nothing matches right now. Try widening your filters, or check back later — availability updates in real time.</p>`;
    return;
  }
  list.forEach(res => grid.appendChild(renderResourceCard(res)));
}

function eligibilityBadge(elig) {
  const map = {
    open: ["Open access", "badge-open"],
    booking: ["Booking required", "badge-booking"],
    approval: ["Needs approval", "badge-approval"],
  };
  const [label, cls] = map[elig] || ["Contact owner", "badge-blocked"];
  return `<span class="badge ${cls}">${label}</span>`;
}

function renderResourceCard(res) {
  const card = document.createElement("div");
  card.className = "res-card";
  const alt = !res.freeNow
    ? `<div class="alt-note">Booked right now — next opening: ${res.slots[0]}. Alternative: try “${suggestAlternative(res)}”.</div>`
    : "";
  card.innerHTML = `
    <div class="res-card-top">
      <div>
        <h3>${res.name}</h3>
        <div class="res-meta">${res.owner} &middot; ${res.location} &middot; ${res.dist === 0 ? "in your building" : res.dist + " building" + (res.dist > 1 ? "s" : "") + " away"}</div>
      </div>
      <div class="res-score">match<b>${Math.min(99, Math.round(res.score))}</b></div>
    </div>
    <div class="tag-row">
      ${eligibilityBadge(res.eligibility)}
      <span class="tag">${res.category}</span>
    </div>
    <div class="res-card-foot">
      <span class="res-avail ${res.freeNow ? "is-free" : "is-busy"}">${res.freeNow ? "Available now" : "Currently in use"}</span>
      <button class="btn btn-secondary btn-sm" data-action="request" data-id="${res.id}">${res.eligibility === "open" ? "Reserve" : "Request"}</button>
    </div>
    ${alt}
  `;
  card.querySelector("[data-action=request]").addEventListener("click", () => openBookingModal(res));
  return card;
}

function suggestAlternative(res) {
  const sibling = RESOURCE_REGISTRY.find(r => r.id !== res.id && r.category === res.category && r.freeNow);
  return sibling ? sibling.name : "checking back at the next free slot";
}

["availOnly", "nearbyFirst", "categoryFilter"].forEach(id => {
  document.getElementById(id).addEventListener("change", renderResults);
});
renderResults(); // initial, unfiltered browse before any request is parsed

// ---------------------------------------------------------------
// 6. Skill / Peer Matching
// ---------------------------------------------------------------
function renderPeers() {
  const chipsWrap = document.getElementById("skillChips");
  chipsWrap.innerHTML = SKILL_CHIPS.map(s => `<button class="chip" data-skill="${s}">${s}</button>`).join("");
  chipsWrap.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => filterPeers(chip.dataset.skill));
  });
  paintPeers(PEOPLE_REGISTRY);
}

function filterPeers(skill) {
  const filtered = PEOPLE_REGISTRY.filter(p => p.keywords.some(k => k.includes(skill.split(" ")[0].toLowerCase())));
  paintPeers(filtered.length ? filtered : PEOPLE_REGISTRY);
}

function paintPeers(list) {
  const grid = document.getElementById("peerGrid");
  grid.innerHTML = "";
  list.forEach(p => {
    const card = document.createElement("div");
    card.className = "res-card";
    card.innerHTML = `
      <div class="res-card-top">
        <div>
          <h3>${p.name}</h3>
          <div class="res-meta">${p.role} &middot; ${p.location}</div>
        </div>
      </div>
      <div class="tag-row">${eligibilityBadge(p.eligibility)}<span class="tag">peer / mentor</span></div>
      <div class="res-card-foot">
        <span class="res-avail ${p.freeNow ? "is-free" : "is-busy"}">${p.slots[0]}</span>
        <button class="btn btn-secondary btn-sm" data-action="request">Reach out</button>
      </div>`;
    card.querySelector("[data-action=request]").addEventListener("click", () => openBookingModal(p));
    grid.appendChild(card);
  });
}

// ---------------------------------------------------------------
// 9. Booking / Request Flow
// ---------------------------------------------------------------
const bookingModal = document.getElementById("bookingModal");
document.getElementById("closeBooking").addEventListener("click", () => bookingModal.hidden = true);

function openBookingModal(res) {
  activeBookingResource = res;
  document.getElementById("bm-title").textContent = res.name;
  document.getElementById("bm-owner").textContent = `Owner: ${res.owner}`;
  const slotSel = document.getElementById("bm-slot");
  slotSel.innerHTML = res.slots.map(s => `<option>${s}</option>`).join("");
  document.getElementById("bm-reason").value = "";
  bookingModal.hidden = false;
}

document.getElementById("bm-confirm").addEventListener("click", () => {
  const slot = document.getElementById("bm-slot").value;
  const reason = document.getElementById("bm-reason").value.trim() || "No reason given";
  const req = createRequest(activeBookingResource, slot, reason);
  bookingModal.hidden = true;
  openQrModal(req, "Request sent", `Your request for ${req.name} is pending approval from ${req.owner}.`);
  pushNotification(`Request sent for ${req.name}`, "pending");
});

function createRequest(res, slot, reason) {
  const req = {
    id: "BR-" + Math.floor(1000 + Math.random() * 9000),
    resourceId: res.id,
    name: res.name,
    owner: res.owner,
    slot, reason,
    status: res.eligibility === "open" ? "approved" : "pending",
    createdAt: new Date().toISOString(),
  };
  state.requests.unshift(req);
  saveState(state);
  return req;
}

// ---------------------------------------------------------------
// QR generation (shared by bookings & hackathon registration)
// ---------------------------------------------------------------
function paintQrCode(containerEl, payloadString) {
  containerEl.innerHTML = "";
  const canvas = document.createElement("canvas");
  containerEl.appendChild(canvas);
  if (window.QRCode && QRCode.toCanvas) {
    QRCode.toCanvas(canvas, payloadString, { width: 148, margin: 1, color: { dark: "#0a100e", light: "#ffffff" } }, (err) => {
      if (err) containerEl.textContent = payloadString;
    });
  } else {
    containerEl.textContent = payloadString;
  }
}

const qrModal = document.getElementById("qrModal");
document.getElementById("closeQr").addEventListener("click", () => qrModal.hidden = true);

function openQrModal(req, label, sub) {
  document.getElementById("qrModalLabel").textContent = label;
  document.getElementById("qr-title").textContent = `${req.id}`;
  document.getElementById("qr-sub").textContent = sub;
  paintQrCode(document.getElementById("qr-box"), JSON.stringify({ id: req.id, kind: "booking" }));
  qrModal.hidden = false;
}

// ---------------------------------------------------------------
// 4 (student side) — My requests / status tracker
// ---------------------------------------------------------------
function statusLabel(s) {
  return { pending: "Pending", approved: "Approved", denied: "Denied", alternative: "Alternative suggested" }[s] || s;
}

function renderBookings() {
  const wrap = document.getElementById("bookingList");
  wrap.innerHTML = "";
  if (!state.requests.length) {
    wrap.innerHTML = `<p class="empty-note">You haven't requested anything yet. Head to <strong>Discover</strong> to find something.</p>`;
    return;
  }
  state.requests.forEach(req => {
    const row = document.createElement("div");
    row.className = "booking-row";
    row.innerHTML = `
      <div class="booking-row-main">
        <strong>${req.name}</strong>
        <span>${req.owner} &middot; ${req.slot}</span>
      </div>
      <div class="row-actions">
        <span class="status-dot status-${req.status}">${statusLabel(req.status)}</span>
        <button class="btn btn-ghost btn-sm" data-qr="${req.id}">View QR</button>
      </div>`;
    row.querySelector("[data-qr]").addEventListener("click", () => openQrModal(req, "Booking code", `Show this at pickup or ask ${req.owner} to scan it.`));
    wrap.appendChild(row);
  });
}

// ---------------------------------------------------------------
// 10. Owner Approval Dashboard
// ---------------------------------------------------------------
function renderApprovals() {
  const wrap = document.getElementById("approvalList");
  wrap.innerHTML = "";
  const pending = state.requests.filter(r => r.status === "pending");
  updateApprovalCount();
  if (!pending.length) {
    wrap.innerHTML = `<p class="empty-note">No pending requests right now. Approved and denied requests move to the requester's own tracker.</p>`;
    return;
  }
  pending.forEach(req => {
    const row = document.createElement("div");
    row.className = "approval-row";
    row.innerHTML = `
      <div class="approval-row-main">
        <strong>${req.name}</strong>
        <span>Requested for ${req.slot} &middot; “${req.reason}”</span>
      </div>
      <div class="row-actions">
        <button class="btn btn-secondary btn-sm" data-act="approve">Approve</button>
        <button class="btn btn-ghost btn-sm" data-act="deny">Deny</button>
        <button class="btn btn-ghost btn-sm" data-act="alt">Suggest alternative</button>
      </div>`;
    row.querySelector("[data-act=approve]").addEventListener("click", () => resolveRequest(req.id, "approved"));
    row.querySelector("[data-act=deny]").addEventListener("click", () => resolveRequest(req.id, "denied"));
    row.querySelector("[data-act=alt]").addEventListener("click", () => resolveRequest(req.id, "alternative"));
    wrap.appendChild(row);
  });
}

function resolveRequest(id, status) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;
  req.status = status;
  saveState(state);
  renderApprovals();
  const verb = { approved: "approved", denied: "denied", alternative: "suggested an alternative for" }[status];
  pushNotification(`${req.owner} ${verb} your request for ${req.name}`, status);
  showToast(`Request ${req.id} marked ${statusLabel(status).toLowerCase()}.`);
}

function updateApprovalCount() {
  const n = state.requests.filter(r => r.status === "pending").length;
  const pill = document.getElementById("approvalCount");
  pill.hidden = n === 0;
  pill.textContent = n;
}

// ---------------------------------------------------------------
// 11. Notifications & Status Tracker (bell drawer + toast)
// ---------------------------------------------------------------
function pushNotification(text, status) {
  state.notifications.unshift({ text, status, at: new Date().toISOString() });
  saveState(state);
  renderNotifications();
  showToast(text);
  updateApprovalCount();
}

function renderNotifications() {
  const list = document.getElementById("notifList");
  list.innerHTML = state.notifications.length
    ? state.notifications.map(n => `<div class="notif-row">${n.text}<time>${new Date(n.at).toLocaleString()}</time></div>`).join("")
    : `<div class="notif-row">No updates yet.</div>`;
  const pill = document.getElementById("notifCount");
  pill.hidden = state.notifications.length === 0;
  pill.textContent = state.notifications.length;
}

const notifDrawer = document.getElementById("notifDrawer");
document.getElementById("bellBtn").addEventListener("click", () => {
  notifDrawer.hidden = !notifDrawer.hidden;
});
document.getElementById("notifClear").addEventListener("click", () => {
  state.notifications = [];
  saveState(state);
  renderNotifications();
});
function closeNotifDrawer() { notifDrawer.hidden = true; }

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.hidden = true, 3200);
}

// ---------------------------------------------------------------
// Hackathon registration → permission requirements + QR
// ---------------------------------------------------------------
const PERMISSION_RULES = {
  "3dprinter": "3D printer certification — complete the 15-minute Maker Lab safety module before check-in.",
  "overnight": "Overnight access pass — requires a faculty sponsor's signature, arranged with Campus Security.",
  "robotics": "Robotics lab approval — a lab supervisor must be listed as on-call for your session.",
  "highvoltage": "High-voltage safety briefing — mandatory in-person briefing with the Electrical Safety Officer.",
  "chemsupplies": "Biotech/chemical handling clearance — Environmental Health & Safety sign-off required.",
  "externalguest": "Visitor pass — register your non-student teammate with campus security 24 hours ahead.",
};

document.getElementById("hackForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const team = document.getElementById("h-team").value.trim();
  const track = document.getElementById("h-track").value;
  const members = document.getElementById("h-members").value.trim();
  const checked = [...document.querySelectorAll("#hackForm .check input:checked")].map(c => c.value);

  const permList = document.getElementById("permList");
  const permPanel = document.getElementById("permPanel");
  if (checked.length) {
    permList.innerHTML = checked.map(v => `<li><strong>${v in PERMISSION_RULES ? PERMISSION_RULES[v].split(" — ")[0] : v}</strong> — ${PERMISSION_RULES[v].split(" — ")[1]}</li>`).join("");
    permPanel.hidden = false;
  } else {
    permList.innerHTML = `<li>No special access needed — standard participant badge only.</li>`;
    permPanel.hidden = false;
  }

  const regId = "HK-" + Math.floor(1000 + Math.random() * 9000);
  const reg = { id: regId, team, track, members, needs: checked, at: new Date().toISOString() };
  state.registrations.unshift(reg);
  saveState(state);

  document.getElementById("regId").textContent = regId;
  document.getElementById("regTeamLine").textContent = `${team} &middot; ${track} track`.replace("&middot;", "·");
  document.getElementById("regTeamLine").innerHTML = `${escapeHtml(team)} · ${track} track · ${escapeHtml(members)}`;
  paintQrCode(document.getElementById("regQr"), JSON.stringify({ id: regId, kind: "hackathon" }));
  document.getElementById("regCard").hidden = false;

  pushNotification(`Registered "${team}" for HackNorth (${regId})`, "approved");
});

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------------------------------------------------------------
// 12 (a). Scan & Verify — faculty scans a booking or hackathon QR
// ---------------------------------------------------------------
let qrScanner = null;
const scanToggle = document.getElementById("scanToggle");

scanToggle.addEventListener("click", async () => {
  if (qrScanner) {
    await qrScanner.stop().catch(() => {});
    qrScanner.clear();
    qrScanner = null;
    scanToggle.textContent = "Start camera";
    return;
  }
  if (!window.Html5Qrcode) {
    showToast("Camera library failed to load — use manual verify instead.");
    return;
  }
  qrScanner = new Html5Qrcode("qrReader");
  try {
    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 200 },
      (decodedText) => handleScan(decodedText),
    );
    scanToggle.textContent = "Stop camera";
  } catch (err) {
    showToast("Couldn't access camera — try manual verify below.");
    qrScanner = null;
  }
});

document.getElementById("manualCheckBtn").addEventListener("click", () => {
  const code = document.getElementById("manualCode").value.trim();
  if (!code) return;
  handleScan(JSON.stringify({ id: code }));
});

function handleScan(decodedText) {
  let id;
  try { id = JSON.parse(decodedText).id; } catch (e) { id = decodedText.trim(); }
  const resultBox = document.getElementById("scanResult");

  const req = state.requests.find(r => r.id === id);
  const reg = state.registrations.find(r => r.id === id);

  if (req) {
    resultBox.innerHTML = `
      <div class="scan-hit">
        <div class="panel-label">Booking found</div>
        <h3>${req.name}</h3>
        <p>${req.owner} &middot; ${req.slot}</p>
        <span class="status-dot status-${req.status}">${statusLabel(req.status)}</span>
        ${req.status === "pending" ? `<button class="btn btn-secondary btn-sm" id="scanApprove">Approve now</button>` : ""}
      </div>`;
    if (req.status === "pending") {
      document.getElementById("scanApprove").addEventListener("click", () => {
        resolveRequest(req.id, "approved");
        handleScan(decodedText);
      });
    }
  } else if (reg) {
    resultBox.innerHTML = `
      <div class="scan-hit">
        <div class="panel-label">Hackathon registration found</div>
        <h3>${escapeHtml(reg.team)}</h3>
        <p>${reg.track} track &middot; ${escapeHtml(reg.members)}</p>
        <span class="badge badge-open">Checked in</span>
        ${reg.needs.length ? `<p style="color:var(--text-mid);font-size:.8rem;">Cleared for: ${reg.needs.map(n => PERMISSION_RULES[n].split(" — ")[0]).join(", ")}</p>` : ""}
      </div>`;
  } else {
    resultBox.innerHTML = `<p class="scan-placeholder">No record found for code “${escapeHtml(id)}”. Check the ID and try again.</p>`;
  }
}

// ---------------------------------------------------------------
// 12 (b). End-to-End Guided Demo — oscilloscope walkthrough
// ---------------------------------------------------------------
const demoSteps = [
  { label: "Request Interface", text: `Priya types: "I need an oscilloscope tomorrow morning, urgent."` },
  { label: "Intent Parser", text: `Parsed to → resource: Oscilloscope · category: equipment · time: Tomorrow · urgency: Medium.` },
  { label: "Discovery & Matching Engine", text: `Two oscilloscopes found. The ECE Block unit outranks the Physics Annex one — closer, and open now.` },
  { label: "Availability Filter", text: `Physics Annex's scope is filtered lower — it's mid-use until this afternoon.` },
  { label: "Location-Aware Ranking", text: `ECE Block is 1 building from Sinha Hall vs. 3 for Physics Annex — proximity boosts its score.` },
  { label: "Eligibility & Access Rules", text: `ECE Block's scope needs a booking, not open pickup — Bench shows that up front, no dead ends.` },
  { label: "Booking / Request Flow", text: `Priya requests the 9:00–11:00 AM slot with a one-line reason for the owner.` },
  { label: "Owner Approval Dashboard", text: `ECE Equipment Room sees the request appear in their queue with Priya's reason attached.` },
  { label: "QR Code Generated", text: `Bench generates a unique code (BR-####) tying the request to Priya, the scope, and the slot.` },
  { label: "Notifications & Status Tracker", text: `The moment it's approved, Priya's tracker flips to “Approved” and she's notified.` },
  { label: "Scan & Verify", text: `At pickup, the ECE Equipment Room scans Priya's QR code and hands over the oscilloscope.` },
];

document.getElementById("runDemo").addEventListener("click", () => {
  const log = document.getElementById("demoLog");
  log.innerHTML = "";
  const demoRes = RESOURCE_REGISTRY.find(r => r.id === "eq-scope-01");
  let demoReq = null;

  demoSteps.forEach((step, i) => {
    setTimeout(() => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${step.label}.</strong> ${step.text}`;
      log.appendChild(li);
      requestAnimationFrame(() => li.classList.add("is-shown"));
      li.scrollIntoView({ block: "nearest", behavior: "smooth" });

      if (i === 6) demoReq = createRequest(demoRes, "Tomorrow 9:00–11:00 AM", "Lab report due Thursday");
      if (i === 8 && demoReq) pushNotification(`Request sent for ${demoReq.name}`, "pending");
      if (i === 9 && demoReq) resolveRequest(demoReq.id, "approved");
    }, i * 950);
  });
});

// ---------------------------------------------------------------
// Trace strip — one orchestrated decorative animation, on load only
// ---------------------------------------------------------------
(function animateTrace() {
  const poly = document.getElementById("tracePoly");
  let frame = 0;
  const points = 80;
  function draw() {
    let pts = [];
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * 800;
      const y = 30 + Math.sin(i * 0.35 + frame * 0.08) * 14 * Math.exp(-Math.pow((i - points * 0.5 - frame % points), 2) / 4000) + Math.sin(i * 0.12 + frame * 0.04) * 6;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    poly.setAttribute("points", pts.join(" "));
    frame++;
    if (frame < 260) requestAnimationFrame(draw);
  }
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) draw();
  else poly.setAttribute("points", "0,30 800,30");
})();

// ---------------------------------------------------------------
// Initial paint
// ---------------------------------------------------------------
renderNotifications();
updateApprovalCount();
