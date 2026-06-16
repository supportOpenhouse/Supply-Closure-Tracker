// ── Helpers ──

// Pipeline hierarchy — higher number = further along
const STAGE_RANK = {
  "\u2014":                 0,
  "Visit Scheduled":     1,
  "Visit Completed":     2,
  "Followup":            3,
  "Future Prospect":     3,
  "Price High":          3,
  "Negotiation":         4,
  "Token Requested":     5,
  "Token Transferred":   6,
  "AMA Req":             7,
  "Hold":                8,
  "AMA Signed":          9,
  "Key Handover":       10,
  "Listed":             11,
};

// Terminal statuses — always win, no matter what
const TERMINAL_STATUSES = ["Dead - Legal","Dead - Sold","Dead - Not Interested","Cancelled Post Token","Duplicacy","OH Rejected","Seller Rejected"];

function getStage(p) {
  if (p.isTokenRefunded)              return 'Cancelled Post Token';
  if (p.listingSubmittedAt)           return 'Listed';
  if (p.finalSubmittedAt)             return 'Key Handover';
  if (p.cpBillSubmittedAt)            return 'AMA Signed';
  if (p.pendingRequestSubmittedAt)    return 'AMA Signed';
  if (p.amaSubmittedAt)               return 'AMA Req';
  if (p.tokenDealSubmittedAt)         return 'Token Transferred';
  if (p.tokenSubmittedAt)             return 'Token Requested';
  if (p.visitSubmittedAt)             return 'Visit Completed';
  if (p.scheduleSubmittedAt)          return 'Visit Scheduled';
  return '\u2014';
}

function getStatus(p) {
  var autoStage = getStage(p);
  var manual = p.statusOverride || "";

  // No manual override → use auto
  if (!manual) return autoStage;

  // Terminal statuses always win
  if (TERMINAL_STATUSES.indexOf(manual) >= 0) return manual;

  // Compare ranks — higher rank wins
  var autoRank = STAGE_RANK[autoStage] || 0;
  var manualRank = STAGE_RANK[manual] || 0;

  return manualRank >= autoRank ? manual : autoStage;
}

// Timestamp that drove the currently-displayed status.
// For manual overrides → statusOverrideAt. For auto-derived stages → the
// corresponding *_submitted_at column that triggered that stage.
function getStatusTimestamp(p, displayStatus) {
  if (displayStatus && p.statusOverride === displayStatus && p.statusOverrideAt) {
    return p.statusOverrideAt;
  }
  switch (displayStatus) {
    case 'Cancelled Post Token': return p.statusOverrideAt || '';
    case 'Listed':               return p.listingSubmittedAt || '';
    case 'Key Handover':         return p.finalSubmittedAt || '';
    case 'AMA Signed':           return p.cpBillSubmittedAt || p.pendingRequestSubmittedAt || '';
    case 'AMA Req':              return p.amaSubmittedAt || '';
    case 'Token Transferred':    return p.tokenDealSubmittedAt || '';
    case 'Token Requested':      return p.tokenSubmittedAt || '';
    case 'Visit Completed':      return p.visitSubmittedAt || '';
    case 'Visit Scheduled':      return p.scheduleSubmittedAt || '';
    default:                     return p.statusOverrideAt || '';
  }
}

function getBalconyView(p) {
  const bd = ensureArray(p.balconyDetails);
  if (bd.length === 0) return "";
  return [...new Set(bd.map(b => b.view))].join(", ");
}

// POC / field exec name handling: show values as stored. We only strip
// "OH Sold" sentinel values; no alias-based normalization.
const POC_REMOVE = ["oh sold", "oh_sold", ""];

function cleanPocName(name) {
  if (!name) return "";
  var trimmed = name.trim();
  if (POC_REMOVE.includes(trimmed.toLowerCase())) return "";
  return trimmed;
}

function normalizePocNames() {
  DATA.forEach(function(p) {
    if (p.assignedBy) p.assignedBy = cleanPocName(p.assignedBy);
    if (p.fieldExec) p.fieldExec = cleanPocName(p.fieldExec);
  });
}

// Safety: parse JSON strings that should be arrays
function ensureArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function getRatePerSqft(p) {
  if (!p.demandPrice || !p.areaSqft || p.areaSqft === "0") return "";
  const price = parseFloat(p.demandPrice) * 100000;
  const area = parseFloat(p.areaSqft);
  if (isNaN(price) || isNaN(area) || area === 0) return "";
  return Math.round(price / area).toLocaleString();
}

// Multiplier of Property Score × Price Score. Blank string until both
// are numeric. Stored values are free-form text, hence parseFloat.
function psMultiplier(p) {
  const a = parseFloat(p && p.propertyScore);
  const b = parseFloat(p && p.priceScore);
  if (!isFinite(a) || !isFinite(b)) return "";
  const r = a * b;
  return Number.isInteger(r) ? String(r) : (Math.round(r * 100) / 100).toString();
}

function esc(s) { return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function formatDateOnly(val) {
  if (!val) return "\u2014";
  var d = new Date(val);
  if (isNaN(d.getTime())) return esc(val);
  return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}

// Timestamp in ISO-style local format, e.g. "2026-05-14T17:16", so it reads
// unambiguously as a timestamp (vs the human-formatted visit dates).
function formatTimestamp(val) {
  if (!val) return "";
  var d = new Date(val);
  if (isNaN(d.getTime())) return esc(val);
  var p2 = function(n){ return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + "T" + p2(d.getHours()) + ":" + p2(d.getMinutes());
}

function timeAgo(ts) {
  if (!ts) return "";
  const now = new Date();
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "";
  const secs = Math.floor((now - date) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + (mins === 1 ? " min" : " mins") + " ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? " hr" : " hrs") + " ago";
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + (days === 1 ? " day" : " days") + " ago";
  const weeks = Math.floor(days / 7);
  return weeks + (weeks === 1 ? " week" : " weeks") + " ago";
}

function getLatestFollowupDate(p) {
  const arr = Array.isArray(p.followupDates) ? p.followupDates : [];
  if (arr.length === 0) return "";
  return arr[arr.length - 1].date || "";
}

// Builds the "Visit Schedule History" cell HTML from p.visitDateHistory:
//   { scheduled_date, reschedules:[{on, old_date, new_date}], cancelled_on }
// Renders a clearly-labelled header (current visit date + state) followed by a
// vertical timeline "thread": the original scheduled date, every reschedule
// (with the action timestamp and old → new dates) and the cancellation.
function visitHistoryCell(p) {
  var vh = p.visitDateHistory;
  if (!vh || typeof vh !== "object") return '<span style="color:#9ca3af">—</span>';

  var scheduled = vh.scheduled_date || "";
  var reschedules = Array.isArray(vh.reschedules)
    ? vh.reschedules.filter(function(r){ return r && (r.new_date || r.old_date || r.on); })
    : [];
  var cancelledOn = vh.cancelled_on || "";

  if (!scheduled && reschedules.length === 0 && !cancelledOn) {
    return '<span style="color:#9ca3af">—</span>';
  }

  // Actual final visit date: latest reschedule's new_date, else the original.
  var current = reschedules.length > 0 ? (reschedules[reschedules.length - 1].new_date || scheduled) : scheduled;
  // When the visit was first scheduled — the properties.schedule_submitted_at
  // column (TIMESTAMPTZ), exposed on the property as scheduleSubmittedAt.
  var scheduledAt = p.scheduleSubmittedAt || "";

  // ── Build chronological event list for the thread ──
  var events = [];
  if (scheduled || scheduledAt) {
    events.push({ color:"#3b82f6", label:"Scheduled", when: scheduledAt ? esc(formatTimestamp(scheduledAt)) : "", detail:"" });
  }
  reschedules.forEach(function(r){
    var when = r.on ? esc(formatTimestamp(r.on)) : "";
    if (r.old_date && r.new_date && r.old_date !== r.new_date) {
      events.push({ color:"#f59e0b", label:"Rescheduled", when:when,
        detail: esc(formatDateOnly(r.old_date)) + ' <span style="color:#9ca3af">→</span> <b style="color:#111827">' + esc(formatDateOnly(r.new_date)) + '</b>' });
    } else {
      events.push({ color:"#cbd5e1", label:"Reconfirmed", when:when,
        detail: esc(formatDateOnly(r.new_date || r.old_date)) + ' <span style="color:#9ca3af">(no change)</span>' });
    }
  });
  if (cancelledOn) {
    events.push({ color:"#ef4444", label:"Cancelled", when: esc(formatTimestamp(cancelledOn)), detail:"" });
  }

  // ── Header: current state, clearly labelled ──
  var html = '<div style="min-width:190px;font-size:11px;color:#374151">';
  html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
  html += '<span style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.3px;color:#9ca3af">Visit date</span>';
  if (cancelledOn) {
    if (current) html += '<span style="font-weight:600;color:#9ca3af;text-decoration:line-through">' + esc(formatDateOnly(current)) + '</span>';
    html += '<span style="padding:1px 7px;background:#fee2e2;color:#b91c1c;border-radius:3px;font-size:10px;font-weight:700">✕ CANCELLED</span>';
  } else {
    html += '<span style="font-weight:700;color:#111827;font-size:12px">' + esc(formatDateOnly(current)) + '</span>';
  }
  html += '</div>';

  // ── Timeline thread ──
  html += '<div style="margin-top:7px;border-left:2px solid #e2e8f0;padding-left:13px;margin-left:4px">';
  events.forEach(function(ev, i){
    var last = i === events.length - 1;
    html += '<div style="position:relative;' + (last ? '' : 'padding-bottom:9px') + '">';
    html += '<span style="position:absolute;left:-18px;top:2px;width:8px;height:8px;border-radius:50%;background:' + ev.color + ';box-shadow:0 0 0 2px #fff"></span>';
    html += '<div style="font-weight:600;color:#374151;font-size:10.5px">' + ev.label + '</div>';
    if (ev.when) html += '<div style="font-size:9.5px;color:#9ca3af;margin-top:1px">' + ev.when + '</div>';
    if (ev.detail) html += '<div style="font-size:11px;color:#4b5563;margin-top:1px">' + ev.detail + '</div>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

// Row is a pending follow-up (yellow) if the latest followup date is today
// or older (IST) AND the closure team has not caught up — meaning either no
// closure comment exists, or the last closure comment predates the follow-up.
// A closure comment on the same day as (or after) the follow-up clears the
// flag, even if both are several days old.
function isFollowupPending(p) {
  const latest = getLatestFollowupDate(p);
  if (!latest) return false;
  function istDateStr(val) {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)).toISOString().slice(0, 10);
  }
  const todayIST = istDateStr(new Date().toISOString());
  const latestIST = istDateStr(latest);
  if (!latestIST || latestIST > todayIST) return false; // future follow-up
  const closureIST = istDateStr(p.pocCommentsAt);
  if (closureIST && closureIST >= latestIST) return false; // closure caught up
  return true;
}

function getFiltered() {
  var result = DATA.filter(p => {
    // Date filter on scheduleSubmittedAt
    if (state.dateFilter !== "all") {
      var dateVal = p.scheduleSubmittedAt;
      if (!dateVal) return false;
      var d = new Date(dateVal);
      if (isNaN(d.getTime())) return false;
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (state.dateFilter === "yesterday") {
        var yest = new Date(today); yest.setDate(yest.getDate() - 1);
        if (d < yest || d >= today) return false;
      } else if (state.dateFilter === "week") {
        var weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        if (d < weekStart) return false;
      } else if (state.dateFilter === "month") {
        var monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        if (d < monthStart) return false;
      } else if (state.dateFilter === "custom") {
        if (state.dateFrom) { var from = new Date(state.dateFrom); if (d < from) return false; }
        if (state.dateTo) { var to = new Date(state.dateTo); to.setDate(to.getDate() + 1); if (d >= to) return false; }
      }
    }
    if (state.cityFilter !== "All" && p.city !== state.cityFilter) return false;
    // Status: array filter
    if (state.statusFilter.length > 0 && state.statusFilter.indexOf(getStatus(p)) === -1) return false;
    // POC: array filter with blank support
    if (state.pocFilter.length > 0) {
      var poc = (p.assignedBy || "").trim();
      if (state.pocFilter.indexOf("_blank_") >= 0 && poc === "") { /* matches blank */ }
      else if (state.pocFilter.indexOf(poc) === -1) return false;
    }
    if (state.sourceFilter !== "All") {
      const src = (p.source || "").toLowerCase();
      if (state.sourceFilter === "CP" && src !== "cp") return false;
      if (state.sourceFilter === "Direct" && src === "cp") return false;
    }
    if (state.affordableFilter !== "All") {
      if (state.affordableFilter === "Yes" && p.affordable !== true) return false;
      if (state.affordableFilter === "No" && p.affordable !== false) return false;
    }
    // Followup Date filter (multi-select on latest followup date)
    if (state.followupDateFilter.length > 0) {
      const latest = getLatestFollowupDate(p);
      const buckets = [];
      if (!latest) buckets.push("none");
      else {
        const d = new Date(latest);
        if (!isNaN(d.getTime())) {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
          const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2);
          const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
          if (d < today) buckets.push("past_due");
          else if (d >= today && d < tomorrow) buckets.push("today");
          else if (d >= tomorrow && d < dayAfter) buckets.push("tomorrow");
          else if (d >= today && d <= weekEnd) buckets.push("week");
          else buckets.push("future");
        }
      }
      if (!state.followupDateFilter.some(f => buckets.indexOf(f) >= 0)) return false;
    }
    if (state.search) {
      const s = state.search.toLowerCase();
      return [p.uid,p.society,p.city,p.ownerName,p.towerNo,p.unitNo,p.fieldExec,p.locality,p.contactNo].some(v => (v||"").toLowerCase().includes(s));
    }
    return true;
  });

  // Sort
  if (state.sortCol) {
    var col = state.sortCol;
    var dir = state.sortDir === "asc" ? 1 : -1;
    result.sort(function(a, b) {
      var va = (a[col] || "").toString().toLowerCase();
      var vb = (b[col] || "").toString().toLowerCase();
      // Ascending: empty first; Descending: empty last
      if (!va && vb) return -1 * dir;
      if (va && !vb) return 1 * dir;
      if (!va && !vb) return 0;
      // Try numeric comparison
      var na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
      return va.localeCompare(vb) * dir;
    });
  }
  return result;
}

function getCounts() {
  const c = {};
  DATA.forEach(p => { const s = getStatus(p); c[s] = (c[s]||0) + 1; });
  return c;
}