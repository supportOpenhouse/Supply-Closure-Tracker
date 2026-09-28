"""Split free-text comments into dated notes.

  "29 Sep.. meeting done ... 26 sep.. unit is good ..."
    -> [("2026-09-29", "meeting done ..."), ("2026-09-26", "unit is good ...")]

Usage (from supply-dashboard/):
  python3 scripts/extract_comment_notes.py --test     # self-check, no DB
  python3 scripts/extract_comment_notes.py            # reads DB, prints table, writes CSV
  python3 scripts/extract_comment_notes.py --import   # ...and loads the notes into property_notes

DATABASE_URL comes from the environment or supply-dashboard/.env. Queries run
through the `psql` CLI, so no Python DB driver is needed.

Every "<day> <month>" token starts a new note ("meme24 sept KYC" splits at
"24 sept"). Notes have no year: it's taken from the comment's last-edit
timestamp, and a date later than that is assumed to be last year.
"""
import csv
import io
import json
import os
import re
import subprocess
import urllib.request
import sys
from datetime import date, datetime, timedelta, timezone

# pricing_comments deliberately excluded — not wanted in the notes output.
COMMENT_FIELDS = ["poc_comments", "rahool_comments", "prashant_comments", "manager_comments"]
MONTHS = dict(jan=1, feb=2, mar=3, apr=4, may=5, jun=6, jul=7, aug=8, sep=9, oct=10, nov=11, dec=12)

# (?<!\d) instead of \b so "meme24 sept" matches; month must be a real spelling
# followed by a non-letter so "5 market" isn't read as March.
DATE_RE = re.compile(
    r"(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s*[-/ ]?\s*"
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
    r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])\.?"
    r"(?:\s*,?\s*(20\d{2}))?",
    re.IGNORECASE,
)
# Compact "DDMM-" prefix the POC team uses: "1304- awaiting docs" = 13 Apr.
# The trailing dash is required so prices like "1470 sqft" aren't dates.
DDMM_RE = re.compile(r"(?<!\d)(\d{2})(\d{2})\s*[-–]")
STRIP = " \t\r\n.,:;|-–—"


def _date_tokens(text):
    """(start, end, day, month, explicit_year) for every date token, in order."""
    toks = [(m.start(), m.end(), int(m.group(1)), MONTHS[m.group(2)[:3].lower()],
             int(m.group(3)) if m.group(3) else None) for m in DATE_RE.finditer(text)]
    toks += [(m.start(), m.end(), int(m.group(1)), int(m.group(2)), None) for m in DDMM_RE.finditer(text)
             if 1 <= int(m.group(2)) <= 12]
    return sorted(t for t in toks if 1 <= t[2] <= 31)


def extract_notes(text, ref=None):
    text = text or ""
    ref = (ref or datetime.now()).date() if isinstance(ref, datetime) else (ref or date.today())
    toks = []
    for t in _date_tokens(text):
        try:
            date(t[4] or ref.year, t[3], t[2])
        except ValueError:  # e.g. "31 Sep" / "3002-" — not a real date, leave it as note text
            continue
        if not toks or t[0] >= toks[-1][1]:
            toks.append(t)
    notes = []

    lead = text[: toks[0][0] if toks else len(text)].strip(STRIP)
    if lead:
        notes.append((None, lead))

    for i, (start, end, day, month, year) in enumerate(toks):
        d = date(year or ref.year, month, day)
        if not year and d > ref + timedelta(days=1):
            d = d.replace(year=d.year - 1)
        stop = toks[i + 1][0] if i + 1 < len(toks) else len(text)
        notes.append((d.isoformat(), text[end:stop].strip(STRIP)))
    return notes


def database_url():
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = os.path.join(os.path.dirname(__file__), "..", ".env")
    with open(env) as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DATABASE_URL not set and not found in supply-dashboard/.env")


def query(sql):
    out = subprocess.run(["psql", database_url(), "--csv", "-v", "ON_ERROR_STOP=1", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return list(csv.DictReader(io.StringIO(out)))


def parse_ts(v):
    return datetime.fromisoformat(v.replace(" ", "T")[:19]) if v else None


FIXED_LABELS = {"rahool_comments": "Rahool", "prashant_comments": "Prashant"}


def author_lookups():
    """Who wrote a POC / manager comment, from three sources:
    1. last actor in activity_logs for that uid+field (exact; logs start 2026-06-30)
    2. POC comments  -> the property's POC (assigned_by) — matches the logged editor 94% of the time
    3. manager comments -> the manager whose managed_team contains that POC,
       or the POC themselves when the lead is owned by a manager
    """
    last_actor = {(r["uid"], r["field"]): r["actor_name"] for r in query(
        "SELECT DISTINCT ON (uid, details::jsonb->>'field') uid, details::jsonb->>'field' AS field, actor_name "
        "FROM activity_logs WHERE action = 'comment_changed' AND COALESCE(btrim(actor_name), '') <> '' "
        "ORDER BY uid, details::jsonb->>'field', created_at DESC")}

    managers_of = {}
    for r in query("SELECT name, managed_team::text AS team FROM users WHERE managed_team IS NOT NULL"):
        for emp in json.loads(r["team"] or "[]"):
            managers_of.setdefault(emp.strip().lower(), []).append(r["name"].strip())
    # A manager-owned lead's manager comments are the manager's own.
    for r in query("SELECT name FROM dashboard_users WHERE role = 'manager' AND COALESCE(btrim(name), '') <> '' "
                   "UNION SELECT name FROM users WHERE managed_team IS NOT NULL AND managed_team::text <> '[]'"):
        managers_of.setdefault(r["name"].strip().lower(), []).append(r["name"].strip())
    return last_actor, managers_of


def resolve_author(uid, field, poc, last_actor, managers_of):
    if field in FIXED_LABELS:
        return FIXED_LABELS[field], "fixed"
    if last_actor.get((uid, field)):
        return last_actor[(uid, field)], "activity_log"
    if field == "poc_comments":
        return (poc, "assigned_by") if poc else ("", "unknown")
    mgrs = managers_of.get(poc.lower(), []) if poc else []
    return (" / ".join(sorted(set(mgrs))), "managed_team") if mgrs else ("", "unknown")


# Legacy sheet keys for each comment box (older sheet exports used the old names).
SHEET_KEYS = {
    "poc_comments": ("pocComments", "closureTeamComments"),
    "manager_comments": ("managerComments", "demandTeamComments"),
    "rahool_comments": ("rahoolComments",),
    "prashant_comments": ("prashantComments",),
}


def legacy_sheet():
    """Legacy leads (LEGACY-xxx) come from the Google Sheet the dashboard reads via
    LEGACY_SHEET_URL. Returns [] when the URL isn't set (report-only runs)."""
    url = os.environ.get("LEGACY_SHEET_URL")
    if not url:
        if "--import" in sys.argv:
            raise SystemExit("--import needs LEGACY_SHEET_URL: without it, legacy comments that live only "
                             "in the sheet would be missing from the notes table.")
        print("LEGACY_SHEET_URL not set — legacy comments stored only in the sheet are not included.", file=sys.stderr)
        return []
    with urllib.request.urlopen(url) as res:
        return json.load(res)


def run():
    cols = ", ".join(f"{f}, {f}_at" for f in COMMENT_FIELDS)
    rows = []  # (uid, field, at, text, poc, ref) — ref = date used to infer note years
    for r in query(f"SELECT uid, assigned_by, {cols} FROM properties"):
        for f in COMMENT_FIELDS:
            if (r[f] or "").strip():
                rows.append((r["uid"], f, r[f + "_at"], r[f], (r["assigned_by"] or "").strip(), r[f + "_at"]))

    # Legacy: dashboard edits (legacy_edits) override the sheet, exactly as the app merges them.
    sheet = legacy_sheet()
    sheet_poc = {r["uid"]: (r.get("assignedBy") or "").strip() for r in sheet if r.get("uid")}
    legacy_poc = dict(sheet_poc)
    legacy_poc.update({r["uid"]: r["value"].strip() for r in query(
        "SELECT uid, value FROM legacy_edits WHERE field = 'assigned_by' AND COALESCE(btrim(value), '') <> ''")})
    in_list = ",".join(f"'{f}'" for f in COMMENT_FIELDS)
    edited = set()
    for r in query(f"SELECT uid, field, updated_at, value FROM legacy_edits "
                   f"WHERE field IN ({in_list}) AND COALESCE(btrim(value), '') <> ''"):
        edited.add((r["uid"], r["field"]))
        rows.append((r["uid"], r["field"], r["updated_at"], r["value"], legacy_poc.get(r["uid"], ""), r["updated_at"]))
    for r in sheet:
        for f, keys in SHEET_KEYS.items():
            text = next((r.get(k) for k in keys if (r.get(k) or "").strip()), "")
            if text and (r["uid"], f) not in edited:
                # Sheet comments have no edit time: years are inferred from today, and
                # undated notes are placed at the lead's date added.
                rows.append((r["uid"], f, r.get("scheduleSubmittedAt") or None, text, legacy_poc.get(r["uid"], ""), None))

    last_actor, managers_of = author_lookups()
    out, to_import = [], []
    for uid, field, at, text, poc, ref in rows:
        author, source = resolve_author(uid, field, poc, last_actor, managers_of)
        if source == "unknown":  # no author resolvable (legacy leads with no POC or logs) — dropped by request
            continue
        notes = extract_notes(text, parse_ts(ref))
        for i, (note_date, note) in enumerate(notes):
            if note.strip():
                to_import.append(import_row(uid, field, author, source, note_date, note, at, len(notes) - i))
        for note_date, note in notes:
            out.append({"uid": uid, "by": author,
                        "field": field.replace("_comments", ""), "author_source": source,
                        "note_date": note_date or "", "note": note, "comment_updated_at": (at or "")[:16]})
    out.sort(key=lambda o: (o["uid"], o["field"], o["note_date"] or "0000"))

    path = os.path.join(os.path.dirname(__file__), "..", "comment_notes.csv")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()) if out else ["uid"])
        w.writeheader()
        w.writerows(out)

    print("| uid | by | note_date | note |")
    print("|---|---|---|---|")
    for o in out:
        print(f"| {o['uid']} | {o['by']} | {o['note_date'] or '—'} | {' '.join(o['note'].split()).replace('|', '/')} |")
    undated = sum(1 for o in out if not o["note_date"])
    print(f"\n{len(rows)} comments -> {len(out)} notes ({undated} undated). CSV: {os.path.abspath(path)}", file=sys.stderr)

    if "--import" in sys.argv:
        import_into_db(to_import)


IMPORT_COLS = ["uid", "kind", "note_date", "note", "author_name", "source", "author_source", "created_at"]


def import_row(uid, field, author, source, note_date, note, at, order):
    """One property_notes row. Comments are written newest-first, so a note's
    position gives its order: `order` seconds are added so notes sharing a date
    (or an undated comment's single timestamp) keep their original sequence."""
    if note_date:
        base = datetime.fromisoformat(note_date + "T12:00:00+05:30")
    elif at:
        base = pg_timestamp(at)
    else:
        base = IMPORT_TIME
    return {"uid": uid, "kind": field.replace("_comments", ""), "note_date": note_date or "", "note": note.strip(),
            "author_name": author, "source": "imported", "author_source": source,
            "created_at": (base + timedelta(seconds=order)).isoformat()}


IMPORT_TIME = datetime.now().astimezone()
PG_TS_RE = re.compile(r"(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$")


def pg_timestamp(v):
    """Timestamp text (Postgres or ISO, date-only allowed) -> aware datetime.
    No offset = UTC: plain TIMESTAMP columns are written with NOW() in the
    server's UTC session."""
    m = PG_TS_RE.match(v.strip())
    if not m:
        raise ValueError("unrecognised timestamp: " + v)
    tz = timezone.utc
    off = m.group(3)
    if off and off != "Z":
        mins = int(off[1:3]) * 60 + (int(off[-2:]) if len(off) > 3 else 0)
        tz = timezone(timedelta(minutes=mins if off[0] == "+" else -mins))
    return datetime.fromisoformat(m.group(1) + "T" + (m.group(2) or "00:00:00")).replace(tzinfo=tz)


def import_into_db(rows):
    """Replace all previously imported notes with this run's. Dashboard-sent
    notes (source='dashboard') are never touched."""
    path = os.path.join(os.path.dirname(__file__), "..", "property_notes_import.csv")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=IMPORT_COLS)
        w.writeheader()
        w.writerows(rows)
    sql = ("BEGIN;"
           "DELETE FROM property_notes WHERE source = 'imported';"
           f"\\copy property_notes ({', '.join(IMPORT_COLS)}) FROM '{os.path.abspath(path)}' WITH (FORMAT csv, HEADER true, NULL '')\n"
           "COMMIT;")
    subprocess.run(["psql", database_url(), "-v", "ON_ERROR_STOP=1"], input=sql.replace(";", ";\n"),
                   text=True, check=True)
    print(f"imported {len(rows)} notes into property_notes", file=sys.stderr)


def test():
    ref = date(2026, 9, 29)
    a = extract_notes("29 Sep.. meeting done, offered 121, deal was done in 120L. 26 sep.. unit is good, exit is also good.", ref)
    assert [d for d, _ in a] == ["2026-09-29", "2026-09-26"], a
    assert a[0][1] == "meeting done, offered 121, deal was done in 120L" and a[1][1].startswith("unit is good")

    b = extract_notes("28 Sept seller family member hopitalize, & seller is is 24 sept KYC awaited || 18 Sept Meeting done, offered 75 @1% || covered parking , 1182 sq ft", ref)
    assert [d for d, _ in b] == ["2026-09-28", "2026-09-24", "2026-09-18"], b
    assert b[1][1] == "KYC awaited" and b[2][1].endswith("1182 sq ft")

    assert [d for d, _ in extract_notes("meme24 sept KYC", ref)] == [None, "2026-09-24"]
    assert len(extract_notes("5 market price check", ref)) == 1          # "market" is not March
    assert extract_notes("15 Dec follow up", ref)[0][0] == "2025-12-15"   # future -> last year
    assert extract_notes("no dates here", ref) == [(None, "no dates here")]
    assert pg_timestamp("2026-08-10 09:30:02.29893").isoformat() == "2026-08-10T09:30:02+00:00"
    assert pg_timestamp("2026-09-28 15:29:23.1+05:30").isoformat() == "2026-09-28T15:29:23+05:30"
    assert pg_timestamp("2026-09-28 09:59:23+00").isoformat() == "2026-09-28T09:59:23+00:00"
    assert pg_timestamp("2025-04-11T06:30:00.000Z").isoformat() == "2025-04-11T06:30:00+00:00"
    assert pg_timestamp("2025-04-11").isoformat() == "2025-04-11T00:00:00+00:00"
    c = extract_notes("1304-offered 172 at 1%pg, 1711- dnp, 0703 - No response", ref)
    assert [d for d, _ in c] == ["2026-04-13", "2025-11-17", "2026-03-07"], c
    assert c[0][1] == "offered 172 at 1%pg" and c[1][1] == "dnp"
    assert len(extract_notes("HZ selling 1470 sqft 136", ref)) == 1     # price, not DDMM
    assert len(extract_notes("floor 3002- east", ref)) == 1             # 30 Feb is not a date
    print("extract_comment_notes: all checks pass")


if __name__ == "__main__":
    test() if "--test" in sys.argv else run()
