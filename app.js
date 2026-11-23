/*
 * UP Tracking — public tracking page.
 *
 * Data source: if a Supabase client is configured (window.upClient), parcels
 * are looked up live through the track() function. Otherwise the page falls
 * back to the built-in sample parcels below so it still works when opened
 * locally without a backend.
 */

const { isValidTracking } = window.UPTracking;

/* ---- Local fallback samples (used only when no backend is configured) ---- */
const DEMO_SHIPMENTS = {
  UP0000000018: {
    service: "Standard", origin: "Lagos, NG", destination: "Abuja, NG",
    events: [
      { status: "Delivered", kind: "delivered", place: "Abuja, NG", ts: "2026-11-18T14:12:00" },
      { status: "Out for delivery", kind: "out", place: "Abuja Hub, NG", ts: "2026-11-18T08:03:00" },
      { status: "In transit", kind: "transit", place: "Lokoja sorting centre, NG", ts: "2026-11-17T19:40:00" },
      { status: "Accepted", kind: "accepted", place: "Lagos drop-off, NG", ts: "2026-11-16T15:10:00" },
    ],
  },
  UP0000000026: {
    service: "Express", origin: "Port Harcourt, NG", destination: "Kano, NG",
    events: [
      { status: "Out for delivery", kind: "out", place: "Kano Hub, NG", ts: "2026-11-20T07:48:00" },
      { status: "In transit", kind: "transit", place: "Kaduna sorting centre, NG", ts: "2026-11-19T21:15:00" },
      { status: "Accepted", kind: "accepted", place: "Port Harcourt depot, NG", ts: "2026-11-18T17:05:00" },
    ],
  },
};

/* ---- Data layer (the one seam between UI and where parcels come from) ---- */
async function getShipment(code) {
  const key = (code || "").trim().toUpperCase();
  if (window.upClient) {
    const { data, error } = await window.upClient.rpc("track", { p_number: key });
    if (error) {
      console.error("Lookup failed:", error);
      return null;
    }
    return data; // the track() function returns the shipment shape, or null
  }
  return DEMO_SHIPMENTS[key] || null;
}

// Sample chips only make sense in local mode; with a real backend there are
// no fixed samples to advertise.
function listSamples() {
  return window.upClient ? [] : Object.keys(DEMO_SHIPMENTS);
}

/* ---- Stages (a real sequence, derived from the latest scan) -------------- */
const STAGES = ["Accepted", "In transit", "Out for delivery", "Delivered"];
const STAGE_INDEX = { accepted: 0, transit: 1, out: 2, delivered: 3 };
const pillClass = { accepted: "transit", transit: "transit", out: "out", delivered: "delivered" };

function reachedStage(latestKind) {
  return STAGE_INDEX[latestKind] ?? 0;
}

/* ---- Planned route ------------------------------------------------------
 * The ordered cities a parcel will travel through. A stop is only shown as
 * "passed" or "currently here" when a real scan has actually reached it;
 * every stop ahead is marked "Scheduled" and never shown as already visited.
 */
function routeProgress(route, events) {
  const places = (events || []).map((e) => (e.place || "").toLowerCase());
  const cityOf = (s) => String(s).split(",")[0].trim().toLowerCase();
  let current = -1;
  route.forEach((stop, i) => {
    const c = cityOf(stop);
    if (c && places.some((p) => p.includes(c))) current = Math.max(current, i);
  });
  return current; // index of the furthest stop actually reached (-1 = none yet)
}

function renderRoute(route, events) {
  if (!Array.isArray(route) || route.length === 0) return "";
  const current = routeProgress(route, events);
  const rows = route.map((stop, i) => {
    const state = i < current ? "passed" : i === current ? "here" : "ahead";
    const tag = state === "passed" ? "Passed" : state === "here" ? "Currently here" : "Scheduled";
    return `<li class="rt rt-${state}">
        <span class="rt-dot" aria-hidden="true"></span>
        <span class="rt-city">${escapeHtml(stop)}</span>
        <span class="rt-tag">${tag}</span>
      </li>`;
  }).join("");
  return `<div class="timeline-h">Route</div>
      <ul class="route" aria-label="Planned route">${rows}</ul>`;
}

function renderStages(currentIndex) {
  return `
    <div class="stages" role="list" aria-label="Delivery progress">
      ${STAGES.map((name, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "done active" : "";
        return `<div class="stage ${state}" role="listitem">
            <span class="dot" aria-hidden="true"></span>
            <span class="stage-label">${escapeHtml(name)}</span>
          </div>`;
      }).join("")}
    </div>`;
}

/* ---- Rendering ----------------------------------------------------------- */
function fmtDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderResult(code, shipment) {
  const results = document.getElementById("results");
  results.hidden = false;

  if (!shipment || !shipment.events || !shipment.events.length) {
    const valid = isValidTracking(code);
    results.innerHTML = `
      <div class="not-found">
        <p><strong>No parcel found</strong> for <code>${escapeHtml(code)}</code>.</p>
        <p>${valid
          ? "That's a valid number, but there's no parcel with it yet."
          : "That doesn't look like a UP Tracking number (UP + 9 digits + a check digit)."}</p>
      </div>`;
    results.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  const latest = shipment.events[0];
  const events = shipment.events.map((e) => `
      <li>
        <div class="ev-head">
          <span class="ev-status">${escapeHtml(e.status)}</span>
          <span class="ev-time">${escapeHtml(fmtDateTime(e.ts))}</span>
        </div>
        <div class="ev-place">${escapeHtml(e.place || "")}</div>
      </li>`).join("");

  results.innerHTML = `
    <div class="result-card">
      <div class="result-top">
        <span class="result-code">${escapeHtml(code)}</span>
        <span class="status-pill ${pillClass[latest.kind] || "transit"}">${escapeHtml(latest.status)}</span>
      </div>
      ${renderStages(reachedStage(latest.kind))}
      <div class="result-meta">
        <div><div class="label">From</div><div class="value">${escapeHtml(shipment.origin || "—")}</div></div>
        <div><div class="label">To</div><div class="value">${escapeHtml(shipment.destination || "—")}</div></div>
        ${shipment.recipient ? `<div><div class="label">Recipient</div><div class="value">${escapeHtml(shipment.recipient)}</div></div>` : ""}
        <div><div class="label">Service</div><div class="value">${escapeHtml(shipment.service || "—")}</div></div>
        <div><div class="label">Last update</div><div class="value">${escapeHtml(fmtDateTime(latest.ts))}</div></div>
      </div>
      ${renderRoute(shipment.route, shipment.events)}
      <div class="timeline-h">Tracking history</div>
      <ul class="timeline">${events}</ul>
    </div>`;
  results.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* ---- Wiring -------------------------------------------------------------- */
async function doTrack(code) {
  const shipment = await getShipment(code);
  renderResult((code || "").trim().toUpperCase(), shipment);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("track-form");
  const input = document.getElementById("track-input");
  const samples = document.getElementById("samples");

  listSamples().forEach((code) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = code;
    chip.addEventListener("click", () => { input.value = code; doTrack(code); });
    samples.appendChild(chip);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = input.value;
    if (!code.trim()) { input.focus(); return; }
    doTrack(code);
  });

  // Allow a shareable link like  ?t=UP0000000042  to open straight to a parcel.
  const q = new URLSearchParams(location.search).get("t");
  if (q) { input.value = q; doTrack(q); }
});
