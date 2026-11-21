/*
 * UP Tracking — operator console.
 * Requires a configured Supabase backend (config.js). Lets a signed-in
 * operator create shipments and record real scans as a parcel moves.
 */
(function () {
  const { randomTrackingNumber } = window.UPTracking;
  const client = window.upClient;

  const el = (id) => document.getElementById(id);
  const show = (id, on = true) => { const n = el(id); if (n) n.hidden = !on; };

  // No backend configured -> explain and stop.
  if (!client) {
    show("not-configured", true);
    return;
  }

  async function refreshAuth() {
    const { data } = await client.auth.getSession();
    const session = data.session;
    if (session) {
      show("login-view", false);
      show("console-view", true);
      show("signout-link", true);
      el("who").textContent = session.user.email || "";
      await loadShipments();
    } else {
      show("console-view", false);
      show("signout-link", false);
      show("login-view", true);
    }
  }

  // ---- Sign in / out ----
  el("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    el("login-error").textContent = "";
    const { error } = await client.auth.signInWithPassword({
      email: el("login-email").value.trim(),
      password: el("login-password").value,
    });
    if (error) { el("login-error").textContent = error.message; return; }
    await refreshAuth();
  });

  el("signout-link").addEventListener("click", async (e) => {
    e.preventDefault();
    await client.auth.signOut();
    await refreshAuth();
  });

  // ---- Create shipment ----
  el("create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    el("create-msg").textContent = "";
    const row = {
      recipient: el("s-recipient").value.trim() || null,
      origin: el("s-origin").value.trim() || null,
      destination: el("s-destination").value.trim() || null,
      service: el("s-service").value,
    };

    // Generate a unique tracking number (retry on the rare collision).
    let saved = null;
    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
      const tracking_number = randomTrackingNumber();
      const { data, error } = await client
        .from("shipments")
        .insert({ ...row, tracking_number })
        .select()
        .single();
      if (!error) { saved = data; break; }
      if (error.code !== "23505") { el("create-msg").textContent = "Error: " + error.message; return; }
    }
    if (!saved) { el("create-msg").textContent = "Could not assign a unique number, try again."; return; }

    el("create-msg").textContent = "Created " + saved.tracking_number;
    el("create-form").reset();
    await loadShipments();
    el("scan-shipment").value = saved.id; // ready to add its first scan
  });

  // ---- Record a scan ----
  el("scan-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    el("scan-msg").textContent = "";
    const shipment_id = el("scan-shipment").value;
    if (!shipment_id) { el("scan-msg").textContent = "Pick a shipment first."; return; }

    const [kind, status] = el("scan-status").value.split("|");
    const timeVal = el("scan-time").value;
    const occurred_at = timeVal ? new Date(timeVal).toISOString() : new Date().toISOString();

    const { error } = await client.from("scans").insert({
      shipment_id, kind, status,
      place: el("scan-place").value.trim() || null,
      occurred_at,
    });
    if (error) { el("scan-msg").textContent = "Error: " + error.message; return; }

    el("scan-msg").textContent = status + " recorded.";
    el("scan-place").value = "";
    el("scan-time").value = "";
    await loadShipments();
  });

  // ---- Load shipments (newest first) with latest status ----
  async function loadShipments() {
    const { data: shipments, error } = await client
      .from("shipments")
      .select("id, tracking_number, recipient, destination, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    const list = el("shipments-list");
    const picker = el("scan-shipment");
    if (error) { list.textContent = "Could not load shipments: " + error.message; return; }

    // Rebuild the scan picker.
    picker.innerHTML = '<option value="">Select a shipment…</option>';
    shipments.forEach((s) => {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.tracking_number + (s.recipient ? " — " + s.recipient : "");
      picker.appendChild(o);
    });

    if (!shipments.length) { list.textContent = "No shipments yet. Create one above."; return; }

    // Latest scan per shipment for a quick status column.
    const ids = shipments.map((s) => s.id);
    const { data: scans } = await client
      .from("scans")
      .select("shipment_id, status, occurred_at")
      .in("shipment_id", ids)
      .order("occurred_at", { ascending: false });
    const latest = {};
    (scans || []).forEach((sc) => { if (!latest[sc.shipment_id]) latest[sc.shipment_id] = sc; });

    list.innerHTML = shipments.map((s) => {
      const st = latest[s.id];
      const link = location.origin + location.pathname.replace(/operator\.html$/, "") + "?t=" + encodeURIComponent(s.tracking_number);
      return `<div class="op-row">
        <div>
          <span class="op-code">${esc(s.tracking_number)}</span>
          ${s.recipient ? `<span class="op-dim"> · ${esc(s.recipient)}</span>` : ""}
          ${s.destination ? `<span class="op-dim"> → ${esc(s.destination)}</span>` : ""}
        </div>
        <div class="op-row-right">
          <span class="op-status">${st ? esc(st.status) : "No scans yet"}</span>
          <a class="op-link" href="${esc(link)}" target="_blank" rel="noopener">view</a>
        </div>
      </div>`;
    }).join("");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  refreshAuth();
})();
