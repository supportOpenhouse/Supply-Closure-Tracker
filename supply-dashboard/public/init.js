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
    h += (d.statusOverride||"") + (d.offerPrice||"") + (d.closureTeamComments||"").length + (d.rahoolComments||"").length + (d.prashantComments||"").length + (d.demandTeamComments||"").length + "|";
  }
  return h;
}

async function silentRefresh() {
  // Don't refresh if user is actively typing
  const active = document.activeElement;
  if (active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type === "text"))) return;

  // Don't refresh if admin panel or bug form is open
  if (showAdminPanel || showBugForm) return;

  // Don't refresh if tab is hidden
  if (document.hidden) return;

  try {
    const res = await fetch("/api/properties");
    if (res.status === 401) { window.location.href = "/login.html"; return; }
    if (!res.ok) return;
    const newData = await res.json();
    newData.forEach(p => {
      p.balconyDetails = ensureArray(p.balconyDetails);
      p.documentsAvailable = ensureArray(p.documentsAvailable);
      p.furnishingDetails = ensureArray(p.furnishingDetails);
    });

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
