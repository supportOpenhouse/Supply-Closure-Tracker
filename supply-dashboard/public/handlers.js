// ── Event Handlers ──
function toggleTab(s) {
  var idx = state.statusFilter.indexOf(s);
  if (idx >= 0) { state.statusFilter.splice(idx, 1); }
  else { state.statusFilter.push(s); }
  state.page = 1; render();
}

function toggleMs(which) {
  state.msOpen = state.msOpen === which ? null : which;
  render();
}

function toggleMsItem(key, val) {
  var arr = state[key];
  var idx = arr.indexOf(val);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(val);
  state.page = 1;
  render();
}

function clearMs(key) {
  state[key] = [];
  state.page = 1;
  render();
}

function clearAllFilters() {
  state.search = "";
  state.cityFilter = "All";
  state.statusFilter = [];
  state.pocFilter = [];
  state.sourceFilter = "All";
  state.dateFilter = "all";
  state.dateFrom = "";
  state.dateTo = "";
  state.sortCol = null;
  state.sortDir = "asc";
  state.page = 1;
  state.msOpen = null;
  render();
}

function setDateFilter(mode) {
  state.dateFilter = mode;
  if (mode !== 'custom') { state.dateFrom = ""; state.dateTo = ""; }
  state.page = 1;
  render();
}

function setCustomDate(which, val) {
  if (which === 'from') state.dateFrom = val;
  else state.dateTo = val;
  state.page = 1;
  render();
}

function toggleSort(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortCol = col;
    state.sortDir = "asc";
  }
  state.page = 1;
  render();
}

async function changeUserRole(email, newRole) {
  await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email, role: newRole })
  });
  await loadUsers();
  renderOverlays();
}

async function forceLogoutAll() {
  if (!confirm("This will log out ALL users (including you). Everyone must log in again. Continue?")) return;
  try {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "force_logout_all" })
    });
    if (res.ok) {
      alert("All sessions invalidated. You will be redirected to login.");
      window.location.href = "/login.html";
    } else {
      alert("Failed to force logout");
    }
  } catch(e) {
    alert("Error: " + e.message);
  }
}
let searchTimer = null;
function updateSearch(v) {
  state.search = v;
  state.page = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() {
    const el = document.getElementById("searchBox");
    const pos = el ? el.selectionStart : 0;
    render();
    const el2 = document.getElementById("searchBox");
    if (el2) { el2.focus(); el2.selectionStart = el2.selectionEnd = pos; }
  }, 200);
}
function updateFilter(key, v) {
  state[key] = v;
  state.page = 1;
  try { render(); } catch(e) { console.error("Render error on filter:", e); }
}

function goPage(n) { state.page = n; render(); var tw = document.getElementById("tableWrap"); if (tw) tw.scrollTop = 0; }
function toggleExpand(uid) {
  state.expandedId = state.expandedId === uid ? null : uid;
  try { render(); } catch(e) { console.error("Render crash:", e); alert("Render error: " + e.message); }
}
function showModal(src) { state.modalImg = src; renderOverlays(); }
function closeModal() { state.modalImg = null; renderOverlays(); }

function changeStatus(uid, newStatus) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.statusOverride = newStatus;
  render();
  saveField(uid, "status_override", newStatus);
}

function changeComment(uid, dbField, jsField, value) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop[jsField] = value;
  debouncedSave(uid, dbField, value);
}

function changeOffer(uid, value) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.offerPrice = value;
  debouncedSave(uid, "offer_price", value);
}

function changeBrokerage(uid, value) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.supplyDashBrokerage = value;
  debouncedSave(uid, "supply_dash_brokerage", value);
}

// Followup Date uses 8s debounce so mis-clicks within 8s only save the final value
function changeFollowupDate(uid, value) {
  const prop = DATA.find(p => p.uid === uid);
  if (!prop) return;

  // Optimistic UI: tentatively show the new date as latest
  if (!Array.isArray(prop.followupDates)) prop.followupDates = [];
  const now = Date.now();
  const newEntry = { date: value, set_by: (currentUser && currentUser.email) || "", set_at: new Date().toISOString(), pending: true };
  if (prop.followupDates.length > 0 && prop.followupDates[prop.followupDates.length - 1].pending) {
    // Replace existing pending entry
    prop.followupDates[prop.followupDates.length - 1] = newEntry;
  } else {
    prop.followupDates.push(newEntry);
  }

  const key = uid + "_followup_date";
  saveStatus[key] = "saving";
  renderSaveDot(key);

  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => saveField(uid, "followup_date", value), 8000);
}

async function changePoc(uid, value) {
  if (!value) return;
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.assignedBy = value;

  const key = uid + "_assigned_by";
  saveStatus[key] = "saving";
  renderSaveDot(key);

  try {
    const res = await fetch("/api/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, field: "assigned_by", value })
    });
    if (res.ok) {
      saveStatus[key] = "saved";
      renderSaveDot(key);
      setTimeout(function(){ saveStatus[key] = ""; renderSaveDot(key); }, 2000);
      // Re-render to update POC in main table
      render();
    } else {
      saveStatus[key] = "error";
      renderSaveDot(key);
    }
  } catch {
    saveStatus[key] = "error";
    renderSaveDot(key);
  }
}

