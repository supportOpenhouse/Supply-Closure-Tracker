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
  state.followupDateFilter = [];
  state.sortCol = null;
  state.sortDir = "asc";
  state.page = 1;
  state.msOpen = null;
  render();
}

async function togglePriority(uid, event) {
  if (event) event.stopPropagation();
  const prop = DATA.find(p => p.uid === uid);
  if (!prop) return;
  const newVal = !prop.isHighPriority;
  prop.isHighPriority = newVal; // optimistic
  markFieldDirty(uid, "isHighPriority");
  render();

  try {
    const res = await fetch("/api/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, field: "is_high_priority", value: newVal })
    });
    if (!res.ok) {
      prop.isHighPriority = !newVal; // rollback
      markFieldClean(uid, "is_high_priority");
      const err = await res.json().catch(() => ({}));
      alert("Failed: " + (err.error || res.status));
      render();
    } else {
      markFieldClean(uid, "is_high_priority");
    }
  } catch (e) {
    prop.isHighPriority = !newVal;
    markFieldClean(uid, "is_high_priority");
    alert("Error: " + e.message);
    render();
  }
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
function showModal(target) {
  // Accept either an <img> element (preferred, enables arrow navigation
  // across siblings in the same .img-strip) or a plain URL string.
  let url = "", list = [], idx = 0;
  if (target && typeof target === "object" && target.tagName === "IMG") {
    url = target.dataset.modal || target.src;
    const strip = target.closest(".img-strip") || target.closest(".expand-content");
    if (strip) {
      const imgs = Array.from(strip.querySelectorAll("img[data-modal]"));
      list = imgs.map(i => i.dataset.modal);
      idx = imgs.indexOf(target);
      if (idx < 0) idx = 0;
    }
  } else {
    url = target;
  }
  state.modalImg = url;
  state.modalList = list;
  state.modalIndex = idx;
  renderOverlays();
}
function closeModal() {
  state.modalImg = null;
  state.modalList = [];
  state.modalIndex = 0;
  renderOverlays();
}
function modalStep(dir) {
  const list = state.modalList || [];
  if (list.length < 2) return;
  state.modalIndex = (state.modalIndex + dir + list.length) % list.length;
  state.modalImg = list[state.modalIndex];
  renderOverlays();
}

function changeStatus(uid, newStatus) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.statusOverride = newStatus;
  markFieldDirty(uid, "statusOverride");
  render();
  saveField(uid, "status_override", newStatus);
}

function changeComment(uid, dbField, jsField, value) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop[jsField] = value;
  markFieldDirty(uid, jsField);
  debouncedSave(uid, dbField, value);
}

function changeOffer(uid, value) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.offerPrice = value;
  markFieldDirty(uid, "offerPrice");
  debouncedSave(uid, "offer_price", value);
}

function changeBrokerage(uid, value) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.supplyDashBrokerage = value;
  markFieldDirty(uid, "supplyDashBrokerage");
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
  markFieldDirty(uid, "followupDates");

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
  markFieldDirty(uid, "assignedBy");

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
      markFieldClean(uid, "assigned_by");
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

