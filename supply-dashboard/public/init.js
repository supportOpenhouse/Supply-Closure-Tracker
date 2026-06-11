// ── Init ──
async function init() {
  try {
    // Check auth with retry for cold starts
    let authRes;
    for (let i = 0; i < 2; i++) {
      try {
        authRes = await fetch("/api/auth/me");
        if (authRes.ok) break;
      } catch(e) {
        if (i === 1) throw e;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!authRes || !authRes.ok) {
      window.location.href = "/login.html";
      return;
    }
    const authData = await authRes.json();
    currentUser = authData.user;

    // If admin, preload all admin panel data in background
    if (currentUser.role === "admin") {
      loadRequests();
      loadBugs();
      loadUsers();
      loadTeam();
    }

    await fetchProperties();
    lastDataHash = quickHash(DATA);

    render();

    // Start auto-polling every 30 seconds
    startAutoRefresh();
  } catch (err) {
    document.getElementById("app").innerHTML =
      '<div class="loading" style="color:#ef4444">Failed to load data. Check your API connection.<br><br><small>'+esc(err.message)+'</small></div>';
  }
}

// ── Auto Refresh (silent background polling) ──
let autoRefreshInterval = null;

function startAutoRefresh() {
  if (autoRefreshInterval) return;
  autoRefreshInterval = setInterval(silentRefresh, 30000); // every 30 seconds

  // Pause when tab is hidden, resume when visible
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    } else {
      silentRefresh(); // immediate refresh on tab return
      startAutoRefresh();
    }
  });
}

let lastDataHash = "";
function quickHash(data) {
  // Lightweight: just check count + last few editable fields
  let h = data.length + "|";
  const sample = data.slice(0, 50); // only check first 50 rows
  for (let i = 0; i < sample.length; i++) {
    const d = sample[i];
    h += (d.statusOverride||"") + (d.offerPrice||"") + (d.propertyScore||"") + (d.priceScore||"") + (d.pocComments||"").length + (d.rahoolComments||"").length + (d.prashantComments||"").length + (d.managerComments||"").length + "|";
  }
  return h;
}

async function silentRefresh() {
  // Belt-and-suspenders guards (also re-checked after the fetch below).
  if (isUserTyping() || hasPendingEdits()) return;
  if (showAdminPanel || showBugForm) return;
  if (document.hidden) return;

  try {
    const res = await fetch("/api/properties");
    if (res.status === 401) { window.location.href = "/login.html"; return; }
    if (!res.ok) return;
    const newData = await res.json();

    // Re-check after the async fetch — the user may have started typing
    // or queued a save while the request was in flight.
    if (isUserTyping() || hasPendingEdits()) return;

    newData.forEach(p => {
      p.balconyDetails = ensureArray(p.balconyDetails);
      p.documentsAvailable = ensureArray(p.documentsAvailable);
      p.furnishingDetails = ensureArray(p.furnishingDetails);
    });

    // Preserve any field the user has edited locally but whose save
    // has not yet succeeded — even if it has no in-flight request yet.
    // Without this, a poll lands the stale server value into the DOM and
    // the user's text disappears mid-typing (see save-dot stuck orange).
    if (dirtyFields.size > 0) {
      const byUid = {};
      DATA.forEach(p => { byUid[p.uid] = p; });
      newData.forEach(np => {
        const op = byUid[np.uid];
        if (!op) return;
        for (const jsField of Object.values(DB_TO_JS_FIELD)) {
          if (dirtyFields.has(np.uid + ":" + jsField)) np[jsField] = op[jsField];
        }
      });
    }

    const newHash = quickHash(newData);
    if (newHash !== lastDataHash) {
      lastDataHash = newHash;
      DATA = newData;
      normalizePocNames();
      const now = new Date();
      lastRefreshed = now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
      render();
    }
  } catch {}
}

init();

// Close multi-select dropdown on outside click
document.addEventListener("click", function() {
  if (state.msOpen) { state.msOpen = null; render(); }
});

// Keyboard navigation for the image modal: ← / → step through the
// current row's image strip, Esc closes.
document.addEventListener("keydown", function(e) {
  if (!state.modalImg) return;
  if (e.key === "ArrowRight") { e.preventDefault(); modalStep(1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); modalStep(-1); }
  else if (e.key === "Escape") { e.preventDefault(); closeModal(); }
});
