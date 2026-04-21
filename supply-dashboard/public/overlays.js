function renderOverlays() {
  let h = "";

  // Modal
  if (state.modalImg) {
    h += '<div class="modal-overlay" onclick="closeModal()"><img src="'+esc(state.modalImg)+'"></div>';
  }

  // Admin Panel
  if (showAdminPanel && currentUser && currentUser.role === 'admin') {
    const pending = adminRequests.filter(r => r.status === 'pending');
    h += '<div class="admin-overlay" onclick="if(event.target===this)closeAdmin()">';
    h += '<div class="admin-panel">';
    h += '<div class="admin-header"><h2>Admin Panel</h2><button class="admin-close" onclick="closeAdmin()">&times;</button></div>';

    // Tabs
    h += '<div style="display:flex;border-bottom:1px solid #e5e7eb;padding:0 20px">';
    h += '<span onclick="switchAdminTab(\'users\')" style="padding:8px 16px;font-size:13px;font-weight:'+(adminTab==='users'?'600':'400')+';cursor:pointer;border-bottom:2px solid '+(adminTab==='users'?'#111827':'transparent')+';color:'+(adminTab==='users'?'#111827':'#6b7280')+'">Users';
    if (pending.length > 0) h += ' <span class="pending-badge">'+pending.length+'</span>';
    h += '</span>';
    h += '<span onclick="switchAdminTab(\'team\')" style="padding:8px 16px;font-size:13px;font-weight:'+(adminTab==='team'?'600':'400')+';cursor:pointer;border-bottom:2px solid '+(adminTab==='team'?'#111827':'transparent')+';color:'+(adminTab==='team'?'#111827':'#6b7280')+'">Team Directory ('+adminTeam.length+')</span>';
    const openBugs = adminBugs.filter(b => b.status === 'open' || b.status === 'in_progress').length;
    h += '<span onclick="switchAdminTab(\'bugs\')" style="padding:8px 16px;font-size:13px;font-weight:'+(adminTab==='bugs'?'600':'400')+';cursor:pointer;border-bottom:2px solid '+(adminTab==='bugs'?'#111827':'transparent')+';color:'+(adminTab==='bugs'?'#111827':'#6b7280')+'">&#128027; Bugs';
    if (openBugs > 0) h += ' <span class="pending-badge">'+openBugs+'</span>';
    h += '</span>';
    h += '</div>';

    h += '<div class="admin-body">';

    if (adminTab === 'users') {
      h += '<div class="admin-section"><h3>Add User</h3>';
      h += '<div class="admin-add">';
      h += '<input id="addEmail" placeholder="email@openhouse.in">';
      h += '<select id="addRole"><option value="viewer">Viewer</option><option value="commenter">Commenter</option><option value="demand">Demand Team</option><option value="admin">Admin</option></select>';
      h += '<button onclick="addUser()">Add User</button>';
      h += '</div></div>';

      if (pending.length > 0) {
        h += '<div class="admin-section"><h3>Access Requests <span class="pending-badge">'+pending.length+'</span></h3>';
        h += '<div class="admin-list">';
        pending.forEach(r => {
          h += '<div class="admin-row">';
          h += '<div><span class="email">'+esc(r.email)+'</span>';
          if (r.name) h += '<span style="color:#6b7280;margin-left:6px">'+esc(r.name)+'</span>';
          h += '</div>';
          h += '<div class="req-actions">';
          h += '<button class="approve" onclick="handleRequest('+r.id+',\'approve\')">Approve</button>';
          h += '<button class="reject" onclick="handleRequest('+r.id+',\'reject\')">Reject</button>';
          h += '</div></div>';
        });
        h += '</div></div>';
      }

      h += '<div class="admin-section"><h3>Current Users ('+adminUsers.length+')</h3>';
      h += '<div style="font-size:10px;color:#6b7280;margin-bottom:6px">Viewer = read only &middot; Commenter = comments, status, offer &middot; Demand = all properties, demand comments only &middot; Admin = full access</div>';
      h += '<div class="admin-list">';
      adminUsers.forEach(u => {
        h += '<div class="admin-row">';
        h += '<div style="flex:1"><span class="email">'+esc(u.email)+'</span></div>';
        h += '<select class="role-select" onchange="changeUserRole(\''+esc(u.email)+'\',this.value)">';
        ["viewer","commenter","demand","admin"].forEach(r => {
          h += '<option value="'+r+'"'+(u.role===r?' selected':'')+'>'+r+'</option>';
        });
        h += '</select>';
        h += '<button onclick="removeUser(\''+esc(u.email)+'\')" style="margin-left:6px">Remove</button>';
        h += '</div>';
      });
      h += '</div></div>';

      // Force logout
      h += '<div class="admin-section" style="border-top:2px solid #fecaca;padding-top:12px">';
      h += '<h3 style="color:#dc2626">Security</h3>';
      h += '<button onclick="forceLogoutAll()" style="padding:6px 14px;font-size:11px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500">Force Logout All Users</button>';
      h += '<div style="font-size:10px;color:#9ca3af;margin-top:4px">Invalidates all sessions. Everyone (including you) must log in again.</div>';
      h += '</div>';

    } else if (adminTab === 'team') {
      h += '<div class="admin-section"><h3>Add Team Member</h3>';
      h += '<div style="font-size:11px;color:#6b7280;margin-bottom:8px">Display name must exactly match names in assigned_by / field_exec columns</div>';
      h += '<div class="admin-add">';
      h += '<input id="teamEmail" placeholder="email@openhouse.in" style="flex:1">';
      h += '<input id="teamName" placeholder="Display Name" style="flex:1">';
      h += '</div>';
      h += '<div class="admin-add" style="margin-top:4px">';
      h += '<select id="teamManager" style="flex:1"><option value="">No Manager</option>';
      adminTeam.forEach(t => {
        h += '<option value="'+esc(t.email)+'">'+esc(t.display_name)+' ('+esc(t.email)+')</option>';
      });
      h += '</select>';
      h += '<button onclick="addTeamMember()">Add</button>';
      h += '</div></div>';

      h += '<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#0369a1">';
      h += '<b>How visibility works:</b> Each person sees records where their Display Name appears in Assigned By, Field Exec, or Token By. They also see records of their direct reportees. Admins see everything.';
      h += '</div>';

      h += '<div class="admin-section"><h3>Team Directory</h3>';
      h += '<div class="admin-list">';
      if (adminTeam.length === 0) {
        h += '<div class="admin-row" style="color:#9ca3af;justify-content:center">No team members yet</div>';
      }
      adminTeam.forEach(t => {
        const mgr = adminTeam.find(m => m.email.toLowerCase() === (t.manager_email||'').toLowerCase());
        h += '<div class="admin-row" style="flex-wrap:wrap;gap:4px">';
        h += '<div style="flex:1;min-width:200px">';
        h += '<div><span class="email">'+esc(t.display_name)+'</span></div>';
        h += '<div style="font-size:11px;color:#6b7280">'+esc(t.email);
        if (mgr) h += ' &rarr; reports to <b>'+esc(mgr.display_name)+'</b>';
        h += '</div></div>';
        h += '<div style="display:flex;gap:4px">';
        h += '<button onclick="removeTeamMember('+t.id+')" style="border-color:#fecaca;color:#ef4444">Remove</button>';
        h += '</div></div>';
      });
      h += '</div></div>';
    }

    if (adminTab === 'bugs') {
      if (adminBugs.length === 0) {
        h += '<div style="text-align:center;padding:30px;color:#9ca3af;font-size:13px">No bug reports yet</div>';
      } else {
        const bugStats = {open:0, in_progress:0, resolved:0, closed:0};
        adminBugs.forEach(b => { bugStats[b.status] = (bugStats[b.status]||0) + 1; });
        h += '<div style="display:flex;gap:12px;margin-bottom:16px;font-size:12px">';
        h += '<span class="bug-status-badge bst-open">Open: '+bugStats.open+'</span>';
        h += '<span class="bug-status-badge bst-in_progress">In Progress: '+bugStats.in_progress+'</span>';
        h += '<span class="bug-status-badge bst-resolved">Resolved: '+bugStats.resolved+'</span>';
        h += '<span class="bug-status-badge bst-closed">Closed: '+bugStats.closed+'</span>';
        h += '</div>';

        adminBugs.forEach(b => {
          const sevClass = "sev-"+(b.severity||"medium");
          const stClass = "bst-"+(b.status||"open");
          const ago = timeAgo(b.created_at);
          h += '<div class="bug-card">';
          h += '<div class="bug-card-header"><div>';
          h += '<div class="bug-card-title">#'+b.id+' '+esc(b.title)+'</div>';
          h += '<div class="bug-card-meta">'+esc(b.reported_by)+' &middot; '+ago;
          if (b.page) h += ' &middot; '+esc(b.page);
          h += '</div></div>';
          h += '<div style="display:flex;gap:4px;flex-shrink:0">';
          h += '<span class="bug-severity '+sevClass+'">'+esc(b.severity)+'</span>';
          h += '<span class="bug-status-badge '+stClass+'">'+esc(b.status)+'</span>';
          h += '</div></div>';
          if (b.description) h += '<div class="bug-card-desc">'+esc(b.description)+'</div>';
          if (b.steps_to_reproduce) h += '<div style="font-size:11px;color:#6b7280;margin-bottom:8px;white-space:pre-wrap"><b>Steps:</b> '+esc(b.steps_to_reproduce)+'</div>';
          if (b.screenshot_url) h += '<div style="margin-bottom:8px"><a href="'+esc(b.screenshot_url)+'" target="_blank" style="font-size:11px;color:#2563eb">View Screenshot</a></div>';
          h += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:4px">';
          h += '<select onchange="updateBugStatus('+b.id+',this.value)" style="padding:3px 6px;font-size:11px;border:1px solid #d1d5db;border-radius:4px">';
          ["open","in_progress","resolved","closed"].forEach(s => {
            h += '<option value="'+s+'"'+(b.status===s?' selected':'')+'>'+s.replace("_"," ")+'</option>';
          });
          h += '</select>';
          h += '<input value="'+esc(b.admin_notes||"")+'" placeholder="Admin notes..." oninput="debouncedBugNote('+b.id+',this.value)" style="flex:1;padding:4px 8px;font-size:11px;border:1px solid #d1d5db;border-radius:4px;outline:none">';
          if (b.resolved_by) h += '<span style="font-size:10px;color:#059669">Resolved by '+esc(b.resolved_by)+'</span>';
          h += '</div></div>';
        });
      }
    }

    h += '</div></div></div>';
  }

  // Floating Bug Report Button
  if (currentUser) {
    h += '<button class="bug-btn" onclick="openBugForm()">&#128027; Report Bug</button>';
  }

  // Bug Report Form Modal
  if (showBugForm) {
    h += '<div class="bug-overlay" onclick="if(event.target===this)closeBugForm()">';
    h += '<div class="bug-modal" style="width:420px">';
    h += '<div class="bug-header"><h2>&#128027; Report a Bug</h2><button class="admin-close" onclick="closeBugForm()">&times;</button></div>';
    h += '<div class="bug-body">';
    if (bugSubmitted) {
      h += '<div class="bug-success" style="padding:40px 20px">&#9989; Bug reported!<br><br><span style="font-size:14px;color:#111827;font-weight:600">Your issue will be resolved in the next 48 hrs.</span><br><span style="font-size:12px;color:#6b7280;margin-top:8px;display:block">We\'ll notify you once it\'s fixed.</span></div>';
      h += '<div style="text-align:center;margin-top:16px;padding-bottom:8px"><button onclick="closeBugForm()" style="padding:8px 24px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer">Done</button></div>';
    } else {
      h += '<div class="bug-field"><label>Describe your issue *</label>';
      h += '<textarea id="bugTitle" placeholder="What went wrong? Be as specific as possible..." style="min-height:100px"></textarea></div>';
      h += '<div class="bug-field"><label>Attach screenshot (paste link)</label>';
      h += '<input id="bugScreenshot" placeholder="Google Drive / Imgur link"></div>';
      h += '<button class="bug-submit" id="bugSubmitBtn" onclick="submitBugReport()">Submit</button>';
    }
    h += '</div></div></div>';
  }

  document.getElementById("overlays").innerHTML = h;
}

