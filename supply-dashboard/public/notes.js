// ── Notes thread (one per lead, shown in the expanded row) ──
// There is NO autosave: typing only updates a local draft; a note is written to
// the server only on the Send button or Enter (Shift+Enter = new line).
//
// Thread state lives here (not in the DOM), so the table's re-renders keep the
// loaded notes and any unsent draft.

const noteThreads = {}; // uid -> { notes: null|[], draft, sending, error, editingId, editDraft, savingEdit }

function noteThreadFor(uid) {
  return noteThreads[uid] || (noteThreads[uid] = { notes: null, draft: "", sending: false, error: "", editingId: null, editDraft: "", savingEdit: false });
}

async function loadNotes(uid) {
  const t = noteThreadFor(uid);
  const res = await fetch("/api/notes?uid=" + encodeURIComponent(uid));
  if (!res.ok) {
    t.error = "Couldn't load notes (" + res.status + ")";
    t.notes = t.notes || [];
  } else {
    t.notes = await res.json();
    t.error = "";
  }
  render();
}

function noteDraft(uid, el) { noteThreadFor(uid).draft = el.value; } // local only — never sent

function noteKey(e, uid) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendNote(uid); }
}

async function sendNote(uid) {
  const t = noteThreadFor(uid);
  const note = t.draft.trim();
  if (!note || t.sending) return;
  t.sending = true;
  t.error = "";
  render();

  const res = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: uid, note: note })
  });
  t.sending = false;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    t.error = "Not sent: " + (err.error || res.status) + " — your text is kept below.";
    render();
    focusNoteInput(uid);
    return;
  }
  const row = await res.json();
  (t.notes = t.notes || []).push(row);
  t.draft = "";

  const p = DATA.find(d => d.uid === uid);
  if (p) {
    p.notes = { count: (p.notes ? p.notes.count : 0) + 1, note: row.note, author: row.author_name, at: row.created_at };
    // Mirror the server: the lead's POC or a commenter clearing the follow-up highlight.
    if (currentUser.role === "commenter" || (p.assignedBy || "").trim().toLowerCase() === (row.author_name || "").trim().toLowerCase()) {
      p.pocCommentsAt = row.created_at;
    }
  }
  render();
  focusNoteInput(uid);
}

// ── Editing your own note ──
// Same rule as sending: nothing is saved until Save / Enter. Ownership = the note
// was posted under your login email (the server enforces it too).
function isOwnNote(n) {
  return !!(n.author_email && currentUser && n.author_email.toLowerCase() === (currentUser.email || "").toLowerCase());
}

function startEditNote(uid, id) {
  const t = noteThreadFor(uid);
  const n = (t.notes || []).find(x => x.id === id);
  if (!n || !isOwnNote(n)) return;
  t.editingId = id;
  t.editDraft = n.note;
  t.error = "";
  render();
  const el = document.getElementById("noteEdit_" + id);
  if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
}

function cancelEditNote(uid) {
  const t = noteThreadFor(uid);
  t.editingId = null;
  t.editDraft = "";
  render();
}

function editDraft(uid, el) { noteThreadFor(uid).editDraft = el.value; } // local only — never sent

function editKey(e, uid) {
  if (e.key === "Escape") { e.preventDefault(); cancelEditNote(uid); return; }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); saveEditNote(uid); }
}

async function saveEditNote(uid) {
  const t = noteThreadFor(uid);
  const id = t.editingId;
  const note = t.editDraft.trim();
  if (!id || !note || t.savingEdit) return;
  t.savingEdit = true;
  t.error = "";
  render();

  const res = await fetch("/api/notes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id, note: note })
  });
  t.savingEdit = false;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    t.error = "Not saved: " + (err.error || res.status) + " — your edit is kept above.";
    render();
    return;
  }
  const row = await res.json();
  const i = t.notes.findIndex(x => x.id === id);
  if (i >= 0) t.notes[i] = row;
  t.editingId = null;
  t.editDraft = "";

  // If it was the latest note, the row's preview/export summary changes too.
  const p = DATA.find(d => d.uid === uid);
  if (p && p.notes && i === t.notes.length - 1) p.notes.note = row.note;
  render();
}

function focusNoteInput(uid) {
  const el = document.getElementById("noteInput_" + uid);
  if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
}

function fmtNoteTime(n) {
  // Imported notes carry the date written in the old comment; sent notes show the exact time.
  if (n.source === "imported") return n.note_date ? formatDateOnly(n.note_date) : "undated";
  return new Date(n.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// HTML for the expanded row. Loads the thread the first time it's shown, and
// reloads it when the refreshed data shows a different note count (someone else posted).
function notesSection(p) {
  const t = noteThreadFor(p.uid);
  const serverCount = p.notes ? p.notes.count : 0;
  if (t.notes === null) { if (!t.loading) { t.loading = true; loadNotes(p.uid).then(() => { t.loading = false; }); } }
  else if (!t.sending && !t.loading && !t.error && t.notes.length !== serverCount) { t.loading = true; loadNotes(p.uid).then(() => { t.loading = false; }); }

  let h = '<div class="notes-section" onclick="event.stopPropagation()">';
  h += '<div class="notes-title">Notes' + (t.notes && t.notes.length ? ' <span>' + t.notes.length + '</span>' : '') + '</div>';
  h += '<div class="notes-list" id="notesList_' + p.uid + '">';
  if (t.notes === null) h += '<div class="notes-empty">Loading…</div>';
  else if (t.notes.length === 0) h += '<div class="notes-empty">No notes yet</div>';
  else t.notes.forEach(n => {
    const editing = t.editingId === n.id;
    h += '<div class="note-item"><div class="note-meta"><b>' + esc(n.author_name) + '</b> · ' + fmtNoteTime(n);
    if (n.source === "imported") h += ' <span class="note-tag" title="Split from the old ' + esc(n.kind || '') + ' comment box; author from ' + esc(n.author_source || '') + '">imported</span>';
    if (n.updated_at) h += ' <span class="note-edited" title="Edited ' + esc(new Date(n.updated_at).toLocaleString("en-IN")) + '">(edited)</span>';
    if (isOwnNote(n) && !editing && !t.editingId) h += ' <span class="note-edit-link" onclick="startEditNote(\'' + p.uid + '\',' + n.id + ')">Edit</span>';
    h += '</div>';
    if (editing) {
      h += '<textarea class="note-edit" id="noteEdit_' + n.id + '" rows="2" oninput="editDraft(\'' + p.uid + '\',this)" onkeydown="editKey(event,\'' + p.uid + '\')"' + (t.savingEdit ? ' disabled' : '') + '>' + esc(t.editDraft) + '</textarea>';
      h += '<div class="note-edit-actions"><button onclick="saveEditNote(\'' + p.uid + '\')"' + (t.savingEdit ? ' disabled' : '') + '>' + (t.savingEdit ? 'Saving…' : 'Save') + '</button>';
      h += '<button class="secondary" onclick="cancelEditNote(\'' + p.uid + '\')"' + (t.savingEdit ? ' disabled' : '') + '>Cancel</button>';
      h += '<span>Enter to save · Shift+Enter new line · Esc to cancel</span></div>';
    } else {
      h += '<div class="note-body">' + esc(n.note) + '</div>';
    }
    h += '</div>';
  });
  h += '</div>';
  if (t.error) h += '<div class="notes-error">' + esc(t.error) + '</div>';
  if (canEdit()) {
    h += '<div class="notes-compose"><textarea id="noteInput_' + p.uid + '" rows="2" placeholder="Write a note… (Enter to send, Shift+Enter for new line)"';
    h += ' oninput="noteDraft(\'' + p.uid + '\',this)" onkeydown="noteKey(event,\'' + p.uid + '\')"' + (t.sending ? ' disabled' : '') + '>' + esc(t.draft) + '</textarea>';
    h += '<button onclick="sendNote(\'' + p.uid + '\')"' + (t.sending ? ' disabled' : '') + '>' + (t.sending ? 'Sending…' : 'Send') + '</button></div>';
  }
  return h + '</div>';
}

// Keep each thread scrolled to its newest note after a render — except while a
// note in it is being edited, so the edit box doesn't scroll out of view.
function scrollNoteLists() {
  document.querySelectorAll(".notes-list").forEach(el => {
    if (!el.querySelector(".note-edit")) el.scrollTop = el.scrollHeight;
  });
}
