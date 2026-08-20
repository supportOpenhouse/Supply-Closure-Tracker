// ── Auth ──
async function logout() {
  await fetch("/api/auth/logout");
  window.location.href = "/login.html";
}

// ── Admin ──
function openAdmin() {
  showAdminPanel = true;
  adminTab = "users";
  renderOverlays();
  Promise.all([loadUsers(), loadRequests(), loadTeam(), loadBugs()]).then(() => renderOverlays());
}

function closeAdmin() { showAdminPanel = false; renderOverlays(); }

function switchAdminTab(tab) {
  adminTab = tab;
  renderOverlays();
  if (tab === "bugs") loadBugs().then(() => renderOverlays());
  else if (tab === "team") loadTeam().then(() => renderOverlays());
  else if (tab === "users") Promise.all([loadUsers(), loadRequests()]).then(() => renderOverlays());
}

async function loadUsers() {
  try {
    const res = await fetch("/api/admin/users");
    if (res.ok) adminUsers = await res.json();
  } catch {}
}

async function loadRequests() {
  try {
    const res = await fetch("/api/admin/requests");
    if (res.ok) adminRequests = await res.json();
  } catch {}
}

async function loadTeam() {
  try {
    const res = await fetch("/api/admin/team");
    if (res.ok) adminTeam = await res.json();
  } catch {}
}

// Team Directory editing. Pass indices (not names) so employee names with
// quotes never break the inline onclick — we look them up from adminTeam here.
async function addTeamMember(mgrIdx, selId) {
  var mgr = (adminTeam.managers || [])[mgrIdx];
  if (!mgr || !mgr.email) { alert("This manager has no email — cannot edit their team."); return; }
  var sel = document.getElementById(selId);
  var employee = sel ? sel.value : "";
  if (!employee) return;
  await patchTeam(mgr.email, employee, "add");
}

async function removeTeamMember(mgrIdx, empIdx) {
  var mgr = (adminTeam.managers || [])[mgrIdx];
  if (!mgr || !mgr.email) return;
  var employee = (mgr.employees || [])[empIdx];
  if (!employee) return;
  if (!confirm("Remove " + employee + " from " + mgr.name + "'s team?")) return;
  await patchTeam(mgr.email, employee, "remove");
}

async function patchTeam(managerEmail, employee, action) {
  try {
    const res = await fetch("/api/admin/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerEmail: managerEmail, employee: employee, action: action })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert("Failed: " + (e.error || res.status));
      return;
    }
    await loadTeam();
    renderOverlays();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

async function addUser() {
  const email = document.getElementById("addEmail").value.trim();
  const role = document.getElementById("addRole").value;
  if (!email) return;

  await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role })
  });
  document.getElementById("addEmail").value = "";
  await loadUsers();
  await loadRequests();
  renderOverlays();
}

async function removeUser(email) {
  if (!confirm("Remove " + email + "?")) return;
  await fetch("/api/admin/users", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  await loadUsers();
  renderOverlays();
}

async function handleRequest(id, action) {
  await fetch("/api/admin/requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action })
  });
  await Promise.all([loadUsers(), loadRequests()]);
  renderOverlays();
}

// ── One-time: bulk sync to Submissions DB ──
async function syncSubmissions() {
  if (!confirm("Push every valid CP lead's status to the Submissions DB? This bulk-updates the external table.")) return;
  const btn = document.getElementById("syncSubBtn");
  const out = document.getElementById("syncSubResult");
  if (btn) { btn.disabled = true; btn.textContent = "Syncing..."; }
  if (out) out.textContent = "";
  try {
    const res = await fetch("/api/admin/sync-submissions", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    if (out) out.textContent = "Eligible: " + data.eligible + " · Matched & updated: " + data.matched;
  } catch (e) {
    if (out) out.textContent = "Error: " + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Sync all to Submissions DB"; }
  }
}

// ── Bug Reporter ──
function openBugForm() { showBugForm = true; bugSubmitted = false; renderOverlays(); }
function closeBugForm() { showBugForm = false; bugSubmitted = false; renderOverlays(); }

async function submitBugReport() {
  const title = document.getElementById("bugTitle").value.trim();
  if (!title) { document.getElementById("bugTitle").style.borderColor = "#ef4444"; return; }

  const btn = document.getElementById("bugSubmitBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Submitting..."; }

  try {
    const res = await fetch("/api/admin/bugs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title,
        description: "",
        steps_to_reproduce: "",
        severity: "medium",
        page: window.location.pathname,
        screenshot_url: (document.getElementById("bugScreenshot").value || "").trim(),
        browser_info: navigator.userAgent.replace(/.*?(Chrome|Firefox|Safari|Edge)\/(\S+).*/, "$1 $2"),
        screen_size: window.innerWidth + "x" + window.innerHeight,
      })
    });

    if (res.ok) {
      bugSubmitted = true;
      renderOverlays();
    } else {
      const err = await res.json().catch(() => ({}));
      alert("Failed: " + (err.error || "Unknown error"));
      if (btn) { btn.disabled = false; btn.textContent = "Submit"; }
    }
  } catch(e) {
    alert("Failed to submit: " + e.message);
    if (btn) { btn.disabled = false; btn.textContent = "Submit"; }
  }
}

async function loadBugs() {
  try {
    const res = await fetch("/api/admin/bugs");
    if (res.ok) adminBugs = await res.json();
  } catch {}
}

async function updateBugStatus(id, status) {
  await fetch("/api/admin/bugs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status })
  });
  await loadBugs();
  renderOverlays();
}

const bugNoteTimers = {};
function debouncedBugNote(id, value) {
  clearTimeout(bugNoteTimers[id]);
  bugNoteTimers[id] = setTimeout(async () => {
    await fetch("/api/admin/bugs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, admin_notes: value })
    });
  }, 800);
}

