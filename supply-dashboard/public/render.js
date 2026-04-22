// ── Render ──
let isRendering = false;
function render() {
  if (isRendering) return;
  isRendering = true;
  try {
    _render();
  } catch(e) {
    console.error("Render error:", e);
  } finally {
    isRendering = false;
  }
}

function _render() {
  const filtered = getFiltered();
  const counts = getCounts();
  const cities = ["All", ...new Set(DATA.map(p => p.city))];
  const pocs = ["All", ...new Set(DATA.map(p => p.assignedBy).filter(Boolean))];
  const tabStatuses = ["Visit Scheduled","Visit Completed","Followup","Negotiation","Token Requested","Token Transferred","AMA Req","AMA Signed","Key Handover","Listed"];

  let h = "";

  // Header
  h += '<div class="header" style="flex-direction:column;align-items:stretch;gap:8px">';
  // Row 1: Logo left, user bar right
  h += '<div style="display:flex;align-items:center;justify-content:space-between">';
  h += '<div style="display:flex;align-items:center;gap:10px"><img src="/logo.png" class="logo" alt="OH"><div><div style="font-size:16px;font-weight:700">Supply Closure Tracker</div><div style="font-size:11px;color:#6b7280">All Cities &middot; '+DATA.length+' Properties</div></div></div>';
  if (currentUser) {
    const pendingCount = adminRequests.filter(r => r.status === 'pending').length;
    h += '<div class="user-bar">';
    h += '<span class="email">'+esc(currentUser.name || currentUser.email)+'</span>';
    if (currentUser.role === 'admin') {
      h += '<button onclick="window.open(\'/logs.html\',\'_blank\')" style="padding:4px 10px;font-size:11px;border:1px solid #e5e7eb;background:#fff;border-radius:5px;cursor:pointer">Logs</button>';
      h += '<button class="admin-btn" onclick="openAdmin()">Manage Users';
      if (pendingCount > 0) h += '<span class="pending-badge">'+pendingCount+'</span>';
      h += '</button>';
    }
    h += '<button onclick="logout()">Logout</button>';
    h += '</div>';
  }
  h += '</div>';
  // Row 2: Tab pills
  h += '<div class="tabs">';
  tabStatuses.forEach(s => {
    h += '<span class="tab'+(state.statusFilter.indexOf(s)>=0?' active':'')+'" onclick="toggleTab(\''+s+'\')">'+s+' <span style="font-weight:700;margin-left:2px">'+(counts[s]||0)+'</span></span>';
  });
  h += '</div>';
  h += '</div>';

  // Date filter bar
  h += '<div class="filters" style="gap:6px;padding:6px 20px;border-bottom:1px solid #f3f4f6">';
  h += '<span style="font-size:10px;color:#9ca3af;font-weight:600">DATE:</span>';
  var dBtns = [{k:"all",l:"All"},{k:"yesterday",l:"Yesterday"},{k:"week",l:"This Week"},{k:"month",l:"This Month"},{k:"custom",l:"Custom"}];
  dBtns.forEach(function(b){
    var active = state.dateFilter === b.k;
    h += '<button onclick="setDateFilter(\''+b.k+'\')" style="padding:2px 8px;font-size:10px;border-radius:4px;cursor:pointer;border:1px solid '+(active?'#111827':'#e5e7eb')+';background:'+(active?'#111827':'#fff')+';color:'+(active?'#fff':'#6b7280')+';font-weight:'+(active?'600':'400')+';transition:all 0.15s">'+b.l+'</button>';
  });
  if (state.dateFilter === 'custom') {
    h += '<input type="date" value="'+esc(state.dateFrom)+'" onchange="setCustomDate(\'from\',this.value)" style="padding:2px 6px;font-size:10px;border:1px solid #e5e7eb;border-radius:4px;color:#374151">';
    h += '<span style="font-size:10px;color:#9ca3af">to</span>';
    h += '<input type="date" value="'+esc(state.dateTo)+'" onchange="setCustomDate(\'to\',this.value)" style="padding:2px 6px;font-size:10px;border:1px solid #e5e7eb;border-radius:4px;color:#374151">';
  }
  h += '</div>';

  // Filters
  h += '<div class="filters">';
  h += '<input id="searchBox" value="'+esc(state.search)+'" placeholder="Search society, owner, UID..." oninput="updateSearch(this.value)">';
  h += '<select onchange="updateFilter(\'cityFilter\',this.value)"><option value="All">All Cities</option>';
  cities.filter(c=>c!=="All").sort().forEach(c => { h += '<option value="'+esc(c)+'"'+(state.cityFilter===c?' selected':'')+'>'+esc(c)+'</option>'; });
  h += '</select>';
  // Status multi-select
  h += '<div class="ms-wrap">';
  h += '<div class="ms-btn" onclick="event.stopPropagation();toggleMs(\'status\')">';
  h += state.statusFilter.length === 0 ? 'All Status' : 'Status';
  if (state.statusFilter.length > 0) h += ' <span class="ms-count">'+state.statusFilter.length+'</span>';
  h += ' &#9662;</div>';
  if (state.msOpen === 'status') {
    h += '<div class="ms-drop" onclick="event.stopPropagation()">';
    var noStageOn = state.statusFilter.indexOf("_nostage_") >= 0;
    h += '<div class="ms-item" onclick="toggleMsItem(\'statusFilter\',\'_nostage_\')">';
    h += '<div class="ms-check'+(noStageOn?' on':'')+'">'+(noStageOn?'&#10003;':'')+'</div>(No Stage / Other)</div>';
    ALL_STATUSES.forEach(function(s) {
      var on = state.statusFilter.indexOf(s) >= 0;
      h += '<div class="ms-item" onclick="toggleMsItem(\'statusFilter\',\''+esc(s)+'\')">';
      h += '<div class="ms-check'+(on?' on':'')+'">'+( on?'&#10003;':'')+'</div>'+esc(s)+'</div>';
    });
    if (state.statusFilter.length > 0) h += '<div class="ms-clear" onclick="clearMs(\'statusFilter\')">Clear all</div>';
    h += '</div>';
  }
  h += '</div>';

  // POC multi-select
  h += '<div class="ms-wrap">';
  h += '<div class="ms-btn" onclick="event.stopPropagation();toggleMs(\'poc\')">';
  h += state.pocFilter.length === 0 ? 'All POC' : 'POC';
  if (state.pocFilter.length > 0) h += ' <span class="ms-count">'+state.pocFilter.length+'</span>';
  h += ' &#9662;</div>';
  if (state.msOpen === 'poc') {
    h += '<div class="ms-drop" onclick="event.stopPropagation()">';
    h += '<div class="ms-item" onclick="toggleMsItem(\'pocFilter\',\'_blank_\')">';
    var blankOn = state.pocFilter.indexOf("_blank_") >= 0;
    h += '<div class="ms-check'+(blankOn?' on':'')+'">'+(blankOn?'&#10003;':'')+'</div>(Blank)</div>';
    pocs.filter(function(p){return p!=="All"}).sort(function(a,b){return a.localeCompare(b)}).forEach(function(p) {
      var on = state.pocFilter.indexOf(p) >= 0;
      h += '<div class="ms-item" onclick="toggleMsItem(\'pocFilter\',\''+esc(p)+'\')">';
      h += '<div class="ms-check'+(on?' on':'')+'">'+( on?'&#10003;':'')+'</div>'+esc(p)+'</div>';
    });
    if (state.pocFilter.length > 0) h += '<div class="ms-clear" onclick="clearMs(\'pocFilter\')">Clear all</div>';
    h += '</div>';
  }
  h += '</div>';
  h += '<select onchange="updateFilter(\'sourceFilter\',this.value)"><option value="All">All Sources</option><option value="CP"'+(state.sourceFilter==="CP"?' selected':'')+'>CP</option><option value="Direct"'+(state.sourceFilter==="Direct"?' selected':'')+'>Direct</option></select>';
  var hasFilters = state.search || state.cityFilter !== "All" || state.statusFilter.length > 0 || state.pocFilter.length > 0 || state.sourceFilter !== "All" || state.sortCol || state.dateFilter !== "all";
  if (hasFilters) {
    h += '<button onclick="clearAllFilters()" style="padding:3px 8px;border-radius:5px;font-size:10px;cursor:pointer;border:1px solid #fecaca;background:#fef2f2;color:#dc2626;transition:all 0.15s;font-weight:500">&times; Clear</button>';
  }
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (state.page > totalPages && totalPages > 0) state.page = totalPages;
  const pageStart = (state.page - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageEnd);

  h += '<span style="font-size:10px;color:#9ca3af;margin-left:auto">'+filtered.length+' results &middot; Page '+state.page+'/'+Math.max(totalPages,1)+'</span>';
  h += '<span id="lastUpdated" style="font-size:9px;color:#d1d5db">'+(lastRefreshed ? lastRefreshed : '')+'</span>';
  h += '<button onclick="refreshData()" style="padding:3px 8px;border-radius:5px;font-size:10px;cursor:pointer;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;transition:all 0.15s">&#x21bb;</button>';
  if (currentUser && currentUser.role === 'admin') {
    h += '<button onclick="downloadCSV()" style="padding:3px 8px;border-radius:5px;font-size:10px;cursor:pointer;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;transition:all 0.15s" title="Download CSV">&#x2913; CSV</button>';
  }
  h += '</div>';

  // Table
  h += '<div id="tableWrap" style="flex:1;overflow:auto"><table><thead><tr>';
  var isDemand = currentUser && currentUser.role === 'demand';
  var DEMAND_HIDE = ["Ask (in Lakhs)","Name","Phone","Followup Date","Offer Price","Brokerage","Internal Remarks","Closure Team Comments","Rahool Comments","Prashant Comments"];
  var COLS = [
    {hdr:"Date Added",key:"scheduleSubmittedAt"},{hdr:"ID / Lead ID",key:"uid"},{hdr:"Society",key:"society"},{hdr:"City",key:"city"},{hdr:"Location",key:"locality"},{hdr:"Tower",key:"towerNo"},{hdr:"Unit No.",key:"unitNo"},{hdr:"Config",key:"configuration"},{hdr:"Ask (in Lakhs)",key:"demandPrice"},{hdr:"Area (in Sqft)",key:"areaSqft"},{hdr:"Floor",key:"floor"},{hdr:"Source",key:"source"},{hdr:"Name",key:"ownerName"},{hdr:"Phone",key:"contactNo"},{hdr:"Status",key:null},{hdr:"Exit Facing",key:"exitFacing"},{hdr:"Balcony View",key:null},{hdr:"POC",key:"assignedBy"},{hdr:"Followup Date",key:null},{hdr:"Offer Price",key:null},{hdr:"Brokerage",key:"supplyDashBrokerage"},{hdr:"Key Handover",key:"keysHandoverDate"},{hdr:"Internal Remarks",key:null},{hdr:"Closure Team Comments",key:null},{hdr:"Rahool Comments",key:null},{hdr:"Prashant Comments",key:null},{hdr:"Demand Team Comments",key:null}
  ];
  if (isDemand) COLS = COLS.filter(function(c){ return DEMAND_HIDE.indexOf(c.hdr) === -1; });
  var colCount = COLS.length;
  COLS.forEach(function(col,i) {
    var sortable = col.key ? ' class="sortable" onclick="toggleSort(\''+col.key+'\')"' : '';
    var icon = '';
    if (col.key && state.sortCol === col.key) {
      icon = ' <span class="sort-icon active">'+(state.sortDir==='asc'?'\u25B2':'\u25BC')+'</span>';
    } else if (col.key) {
      icon = ' <span class="sort-icon">\u25B2</span>';
    }
    var isComment = col.hdr.indexOf('Comments') >= 0;
    h += '<th'+sortable+(isComment?' style="min-width:150px"':'')+'>'+col.hdr+icon+'</th>';
  });
  h += '</tr></thead><tbody>';

  pageRows.forEach(p => {
    // Ensure arrays are parsed (safety net for Neon JSON strings)
    p.balconyDetails = ensureArray(p.balconyDetails);
    p.documentsAvailable = ensureArray(p.documentsAvailable);

    const status = getStatus(p);
    const sc = STATUS_COLORS[status] || STATUS_COLORS["New"];
    const isExp = state.expandedId === p.uid;

    h += '<tr class="datarow'+(isExp?' expanded':'')+'" onclick="toggleExpand(\''+p.uid+'\')">';
    h += '<td style="font-size:11px;white-space:nowrap;color:#6b7280">'+formatDateOnly(p.scheduleSubmittedAt)+'</td>';
    h += '<td style="font-size:11px;white-space:nowrap;font-family:monospace">'+esc(p.uid||"")+(p.leadId?' <span style="color:#9ca3af">('+esc(p.leadId)+')</span>':'')+'</td>';
    h += '<td class="society-cell">'+esc(p.society)+'</td>';
    h += '<td>'+esc(p.city||"\u2014")+'</td>';
    h += '<td>'+esc(p.locality)+'</td>';
    h += '<td>'+(p.towerNo||"\u2014")+'</td>';
    h += '<td class="unit-cell">'+(p.unitNo||"\u2014")+'</td>';
    h += '<td>'+(p.configuration||"\u2014")+'</td>';
    if (!isDemand) h += '<td class="ask-cell">'+(p.demandPrice||"\u2014")+'</td>';
    h += '<td>'+(p.areaSqft||"\u2014")+'</td>';
    h += '<td style="text-align:center">'+(p.floor||"\u2014")+'</td>';
    h += '<td>'+esc(p.source)+'</td>';
    if (!isDemand) h += '<td>'+esc(p.ownerName)+'</td>';
    if (!isDemand) h += '<td style="font-size:11px;white-space:nowrap">'+(p.contactNo||"\u2014")+'</td>';

    // Status
    h += '<td onclick="event.stopPropagation()">';
    if (canEdit() && !isDemand) {
      h += '<select class="status-select" style="background:'+sc.bg+';color:'+sc.text+'" onchange="changeStatus(\''+p.uid+'\',this.value)">';
      ALL_STATUSES.forEach(s => { h += '<option value="'+esc(s)+'"'+(status===s?' selected':'')+' style="background:#fff;color:#111827">'+esc(s)+'</option>'; });
      h += '</select>';
      h += '<span id="dot_'+p.uid+'_status_override" class="save-dot '+(saveStatus[p.uid+'_status_override']||'')+'"></span>';
    } else {
      h += '<span class="status-select" style="background:'+sc.bg+';color:'+sc.text+';display:inline-block;padding:3px 8px;border-radius:4px">'+esc(status)+'</span>';
    }
    h += '</td>';

    h += '<td>'+(p.exitFacing||"\u2014")+'</td>';
    h += '<td class="balcony-cell">'+(getBalconyView(p)||p.balconyView||"\u2014")+'</td>';
    h += '<td class="small-cell">'+esc(p.assignedBy||"\u2014")+'</td>';

    // Followup Date
    if (isDemand) {
      // hidden for demand
    } else {
      var fDates = Array.isArray(p.followupDates) ? p.followupDates : [];
      var latestDate = fDates.length > 0 ? (fDates[fDates.length - 1].date || "") : "";
      var historyTitle = "";
      if (fDates.length > 1) {
        historyTitle = "History:\n" + fDates.map(function(e, i){
          var when = e.set_at ? new Date(e.set_at).toLocaleDateString("en-IN") : "";
          return (i+1) + ". " + (e.date || "—") + (when ? " (set " + when + ")" : "");
        }).join("\n");
      }
      if (canEdit()) {
        h += '<td onclick="event.stopPropagation()" title="'+esc(historyTitle)+'">';
        h += '<input type="date" value="'+esc(latestDate)+'" onchange="changeFollowupDate(\''+p.uid+'\',this.value)" style="padding:3px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:11px;color:#374151;outline:none;font-family:inherit">';
        h += '<span id="dot_'+p.uid+'_followup_date" class="save-dot '+(saveStatus[p.uid+'_followup_date']||'')+'"></span>';
        if (fDates.length > 1) h += '<div style="font-size:9px;color:#9ca3af;margin-top:1px">'+fDates.length+' changes</div>';
        h += '</td>';
      } else {
        h += '<td style="font-size:11px" title="'+esc(historyTitle)+'">'+(latestDate ? formatDateOnly(latestDate) : "\u2014")+'</td>';
      }
    }

    // Offer
    if (isDemand) {
      // demand role: hide offer price column entirely
    } else if (canEdit()) {
      h += '<td onclick="event.stopPropagation()"><input type="text" value="'+esc(p.offerPrice||'')+'" placeholder="\u2014" oninput="changeOffer(\''+p.uid+'\',this.value)" style="width:70px;padding:3px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px;font-weight:600;color:#047857;outline:none;font-family:inherit;text-align:right"><span id="dot_'+p.uid+'_offer_price" class="save-dot '+(saveStatus[p.uid+'_offer_price']||'')+'"></span></td>';
    } else {
      h += '<td style="font-weight:600;color:#047857">'+(p.offerPrice||"\u2014")+'</td>';
    }

    // Brokerage
    if (isDemand) {
      // hidden for demand
    } else if (canEdit()) {
      h += '<td onclick="event.stopPropagation()"><input type="text" value="'+esc(p.supplyDashBrokerage||'')+'" placeholder="\u2014" oninput="changeBrokerage(\''+p.uid+'\',this.value)" style="width:70px;padding:3px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px;font-weight:600;color:#7c3aed;outline:none;font-family:inherit;text-align:right"><span id="dot_'+p.uid+'_supply_dash_brokerage" class="save-dot '+(saveStatus[p.uid+'_supply_dash_brokerage']||'')+'"></span></td>';
    } else {
      h += '<td style="font-weight:600;color:#7c3aed">'+(p.supplyDashBrokerage||"\u2014")+'</td>';
    }

    // Key Handover Date
    h += '<td style="font-size:11px;white-space:nowrap">'+formatDateOnly(p.keysHandoverDate)+'</td>';

    // Internal Remarks
    if (!isDemand) h += '<td style="font-size:11px;max-width:180px;white-space:normal;word-wrap:break-word;color:#6b7280">'+esc(p.tokenRemarks||"\u2014")+'</td>';

    // Comments
    var commentFields = [
      {key:"closureTeamComments", db:"closure_team_comments", tsKey:"closureTeamCommentsAt"},
      {key:"rahoolComments", db:"rahool_comments", tsKey:"rahoolCommentsAt"},
      {key:"prashantComments", db:"prashant_comments", tsKey:"prashantCommentsAt"},
      {key:"demandTeamComments", db:"demand_team_comments", tsKey:"demandTeamCommentsAt"}
    ];
    if (isDemand) commentFields = commentFields.filter(function(cf){ return cf.key === "demandTeamComments"; });
    commentFields.forEach(cf => {
      const dotKey = p.uid + "_" + cf.db;
      const ts = timeAgo(p[cf.tsKey]);
      h += '<td onclick="event.stopPropagation()">';
      if (canEdit()) {
        h += '<textarea class="comment-input" placeholder="\u2014" oninput="changeComment(\''+p.uid+"','"+cf.db+"','"+cf.key+'\',this.value)">'+esc(p[cf.key]||"")+'</textarea>';
        h += '<div style="display:flex;align-items:center;gap:3px;margin-top:2px">';
        h += '<span id="dot_'+dotKey+'" class="save-dot '+(saveStatus[dotKey]||'')+'"></span>';
        if (ts) h += '<span style="font-size:9px;color:#9ca3af">'+ts+'</span>';
        h += '</div>';
      } else {
        h += '<div style="font-size:11px;color:#374151;max-width:160px">'+esc(p[cf.key]||"\u2014")+'</div>';
        if (ts) h += '<div style="font-size:9px;color:#9ca3af">'+ts+'</div>';
      }
      h += '</td>';
    });

    h += '</tr>';

    // Expanded row
    if (isExp) {
      try {
      h += '<tr class="expand-row"><td colspan="' + colCount + '"><div class="expand-content">';
      h += '<div class="detail-tags">';
      const rate = getRatePerSqft(p);
      if (rate && !isDemand) h += '<span>Rate/sqft: <b>\u20B9'+rate+'</b></span>';
      if (p.fieldExec && !isDemand) h += '<span>Field Exec: <b>'+esc(p.fieldExec)+'</b></span>';
      if (!isDemand) h += '<span>Visit: <b style="color:'+(p.visitSubmittedAt?'#059669':'#9ca3af')+'">'+(p.visitSubmittedAt?'Yes':'No')+'</b></span>';
      if (p.balconyDetails && p.balconyDetails.length > 0 && !isDemand) h += '<span>Photos: <b style="color:#2563eb">'+p.balconyDetails.length+'</b></span>';
      if (p.bathrooms) h += '<span>Toilets: <b>'+esc(p.bathrooms)+'</b></span>';
      if (p.balconies) h += '<span>Balconies: <b>'+esc(p.balconies)+'</b></span>';
      if (p.parking) h += '<span>Parking: <b>'+esc(p.parking)+'</b></span>';
      if (p.furnishing) h += '<span>Furnishing: <b>'+esc(p.furnishing)+'</b></span>';
      if (p.registryStatus) h += '<span>Registry: <b>'+esc(p.registryStatus)+'</b></span>';
      if (p.occupancyStatus) h += '<span>Occupancy: <b>'+esc(p.occupancyStatus)+'</b></span>';
      if (!isDemand) {
        if (p.guaranteedSalePrice) h += '<span>GSP: <b>\u20B9'+esc(p.guaranteedSalePrice)+'L</b></span>';
        if (p.initialPeriod) h += '<span>Contract: <b>'+esc(p.initialPeriod)+'d</b></span>';
        if (p.gracePeriod) h += '<span>Grace: <b>'+esc(p.gracePeriod)+'d</b></span>';
      }
      if (p.videoLink) h += '<a href="'+esc(p.videoLink)+'" target="_blank" style="color:#2563eb;text-decoration:none">\u25B6 Video/Photos</a>';
      h += '</div>';

      // POC edit (admin only)
      if (currentUser && currentUser.role === 'admin') {
        var pocFromData = DATA.map(function(d){return d.assignedBy}).filter(Boolean);
        var pocFromTeam = adminTeam.map(function(t){return t.display_name}).filter(Boolean);
        var pocNames = [...new Set([...pocFromData, ...pocFromTeam])].sort();
        h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px" onclick="event.stopPropagation()">';
        h += '<span style="font-size:12px;font-weight:600;color:#0369a1">Change POC:</span>';
        h += '<select onchange="changePoc(\''+p.uid+'\',this.value)" style="padding:4px 8px;font-size:12px;border:1px solid #93c5fd;border-radius:4px;outline:none">';
        h += '<option value="">'+esc(p.assignedBy || "— Select —")+'</option>';
        pocNames.forEach(function(n){ if(n!==p.assignedBy) h += '<option value="'+esc(n)+'">'+esc(n)+'</option>'; });
        h += '</select>';
        h += '<span id="dot_'+p.uid+'_assigned_by" class="save-dot '+(saveStatus[p.uid+'_assigned_by']||'')+'"></span>';
        h += '</div>';
      }

      if (!isDemand && p.documentsAvailable && p.documentsAvailable.length > 0) {
        h += '<div style="font-size:11px;color:#6b7280;margin-bottom:12px">Docs: '+p.documentsAvailable.map(function(d){return esc(d)}).join(' \u00B7 ')+'</div>';
      }

      if (p.balconyDetails && p.balconyDetails.length > 0) {
        h += '<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">Balcony Views & Compass</div>';
        h += '<div class="img-strip">';
        if (p.exitCompassImage) {
          h += '<div style="min-width:100px;text-align:center"><img src="'+esc(p.exitCompassImage)+'" width="100" height="70" data-modal="'+esc(p.exitCompassImage)+'" onclick="event.stopPropagation();showModal(this.dataset.modal)"><div style="font-size:10px;color:#6b7280;margin-top:3px">Exit Compass</div></div>';
        }
        p.balconyDetails.forEach(function(b) {
          if (!b || !b.view_image) return;
          h += '<div class="img-card"><div style="display:flex;gap:4px">';
          h += '<img src="'+esc(b.view_image)+'" width="80" height="70" data-modal="'+esc(b.view_image)+'" onclick="event.stopPropagation();showModal(this.dataset.modal)">';
          if (b.compass_image) h += '<img src="'+esc(b.compass_image)+'" width="50" height="70" data-modal="'+esc(b.compass_image)+'" onclick="event.stopPropagation();showModal(this.dataset.modal)">';
          h += '</div><div style="font-size:10px;color:#6b7280;margin-top:3px">'+esc(b.attached_to||"")+' \u00B7 '+esc(b.facing||"")+' \u00B7 '+esc(b.view||"")+'</div></div>';
        });
        h += '</div>';
      } else if (!isDemand) {
        h += '<div style="font-size:11px;color:#9ca3af;font-style:italic">Visit not completed \u2014 no images available</div>';
      }

      h += '</div></td></tr>';
      } catch(expandErr) {
        h += '<tr class="expand-row"><td colspan="' + colCount + '" style="padding:12px 20px;color:#ef4444;font-size:12px">Error loading details: '+esc(expandErr.message)+'</td></tr>';
        console.error("Expand error for "+p.uid+":", expandErr);
      }
    }
  });

  h += '</tbody></table>';
  if (filtered.length === 0) {
    if (DATA.length === 0 && currentUser && currentUser.role !== 'admin') {
      h += '<div style="text-align:center;padding:60px 20px;color:#6b7280"><div style="font-size:32px;margin-bottom:12px">&#128274;</div><div style="font-size:15px;font-weight:600;color:#374151;margin-bottom:6px">No records visible to you</div><div style="font-size:13px">You are not assigned to any properties yet. Contact your manager or admin for access.</div></div>';
    } else {
      h += '<div style="text-align:center;padding:40px 20px;color:#9ca3af;font-size:13px">No properties match the current filters</div>';
    }
  }

  // Pagination
  if (totalPages > 1) {
    h += '<div class="pgbar">';
    var dis1 = state.page===1;
    var disL = state.page===totalPages;
    h += '<button class="pgb'+(dis1?' pgd':'')+'" onclick="goPage(1)"'+(dis1?' disabled':'')+'>\u00AB</button>';
    h += '<button class="pgb'+(dis1?' pgd':'')+'" onclick="goPage('+(state.page-1)+')"'+(dis1?' disabled':'')+'>\u2039 Prev</button>';
    var sp = Math.max(1, state.page - 3), ep = Math.min(totalPages, state.page + 3);
    if (sp > 1) h += '<span class="pgdots">...</span>';
    for (var pg = sp; pg <= ep; pg++) {
      h += pg===state.page ? '<span class="pgcur">'+pg+'</span>' : '<button class="pgb" onclick="goPage('+pg+')">'+pg+'</button>';
    }
    if (ep < totalPages) h += '<span class="pgdots">...</span>';
    h += '<button class="pgb'+(disL?' pgd':'')+'" onclick="goPage('+(state.page+1)+')"'+(disL?' disabled':'')+'> Next \u203A</button>';
    h += '<button class="pgb'+(disL?' pgd':'')+'" onclick="goPage('+totalPages+')"'+(disL?' disabled':'')+'>\u00BB</button>';
    h += '<span class="pginfo">'+(pageStart+1)+'\u2013'+Math.min(pageEnd,filtered.length)+' of '+filtered.length+'</span>';
    h += '</div>';
  }

  h += '</div>';

  var tw = document.getElementById("tableWrap");
  var scrollTop = tw ? tw.scrollTop : 0;
  var scrollLeft = tw ? tw.scrollLeft : 0;
  document.getElementById("app").innerHTML = h;
  tw = document.getElementById("tableWrap");
  if (tw) { tw.scrollTop = scrollTop; tw.scrollLeft = scrollLeft; }
  renderOverlays();
}