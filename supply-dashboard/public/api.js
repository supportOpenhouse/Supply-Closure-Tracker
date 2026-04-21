// ── API Calls ──
async function fetchProperties() {
  let attempts = 0;
  while (attempts < 2) {
    try {
      const res = await fetch("/api/properties");
      if (res.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Server error " + res.status);
      }
      DATA = await res.json();
      DATA.forEach(p => {
        p.balconyDetails = ensureArray(p.balconyDetails);
        p.documentsAvailable = ensureArray(p.documentsAvailable);
        p.furnishingDetails = ensureArray(p.furnishingDetails);
      });
      normalizePocNames();
      const now = new Date();
      lastRefreshed = now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
      return;
    } catch(e) {
      attempts++;
      if (attempts >= 2) throw e;
      await new Promise(r => setTimeout(r, 1000)); // wait 1s before retry
    }
  }
}

function downloadCSV() {
  var filtered = getFiltered();
  var cols = [
    {hdr:"UID",key:"uid"},{hdr:"Date Added",key:"scheduleSubmittedAt"},{hdr:"Society",key:"society"},{hdr:"City",key:"city"},
    {hdr:"Location",key:"locality"},{hdr:"Tower",key:"towerNo"},{hdr:"Unit No.",key:"unitNo"},
    {hdr:"Config",key:"configuration"},{hdr:"Ask (Lakhs)",key:"demandPrice"},
    {hdr:"Area (Sqft)",key:"areaSqft"},{hdr:"Floor",key:"floor"},{hdr:"Source",key:"source"},
    {hdr:"Name",key:"ownerName"},{hdr:"Phone",key:"contactNo"},
    {hdr:"Status",fn:function(p){return (p.statusOverride||"New")}},
    {hdr:"Exit Facing",key:"exitFacing"},{hdr:"Balcony View",fn:function(p){return getBalconyView(p)||p.balconyView||""}},
    {hdr:"POC",key:"assignedBy"},{hdr:"Offer Price",key:"offerPrice"},{hdr:"Brokerage",key:"supplyDashBrokerage"},
    {hdr:"Key Handover Date",key:"keysHandoverDate"},
    {hdr:"Internal Remarks",key:"tokenRemarks"},
    {hdr:"Closure Team Comments",key:"closureTeamComments"},
    {hdr:"Rahool Comments",key:"rahoolComments"},
    {hdr:"Prashant Comments",key:"prashantComments"},
    {hdr:"Demand Team Comments",key:"demandTeamComments"}
  ];

  function csvVal(v) {
    var s = String(v==null?"":v).replace(/\r?\n/g," ").replace(/"/g,'""');
    return '"'+s+'"';
  }

  var rows = [cols.map(function(c){return csvVal(c.hdr)}).join(",")];
  filtered.forEach(function(p) {
    rows.push(cols.map(function(c){
      return csvVal(c.fn ? c.fn(p) : (p[c.key]||""));
    }).join(","));
  });

  var blob = new Blob([rows.join("\n")], {type:"text/csv;charset=utf-8;"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "supply-closure-tracker-"+new Date().toISOString().slice(0,10)+".csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function refreshData() {
  const btn = document.querySelector('[onclick="refreshData()"]');
  if (btn) { btn.textContent = "Refreshing..."; btn.disabled = true; }
  try {
    await fetchProperties();

    render();
  } catch (err) {
    alert("Refresh failed: " + err.message);
  }
  if (btn) { btn.innerHTML = "&#x21bb; Refresh"; btn.disabled = false; }
}

async function saveField(uid, dbField, value) {
  const key = uid + "_" + dbField;
  saveStatus[key] = "saving";
  renderSaveDot(key);

  try {
    const res = await fetch("/api/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, field: dbField, value })
    });
    if (!res.ok) throw new Error("Save failed");
    saveStatus[key] = "saved";
    renderSaveDot(key);
    setTimeout(() => { saveStatus[key] = ""; renderSaveDot(key); }, 2000);
  } catch (e) {
    saveStatus[key] = "error";
    renderSaveDot(key);
  }
}

function renderSaveDot(key) {
  const el = document.getElementById("dot_" + key);
  if (!el) return;
  el.className = "save-dot " + (saveStatus[key] || "");
}

function debouncedSave(uid, dbField, value) {
  const key = uid + "_" + dbField;
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => saveField(uid, dbField, value), 800);
}