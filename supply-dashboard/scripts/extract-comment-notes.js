// Splits free-text comments like
//   "29 Sep.. meeting done, offered 121 ... 26 sep.. unit is good ..."
// into dated notes: [{ date: "2026-09-29", raw: "29 Sep", note: "meeting done, ..." }, ...]
//
// Usage (from supply-dashboard/):
//   node scripts/extract-comment-notes.js --test      # self-check, no DB
//   DATABASE_URL=... node scripts/extract-comment-notes.js > notes.json
//
// Every "<day> <month>" token starts a new note (e.g. "meme24 sept KYC" splits
// at "24 sept"). Notes carry no year, so the year is inferred from the
// comment's last-edit timestamp: a date later than that timestamp is assumed
// to be last year.

const COMMENT_FIELDS = ["poc_comments", "rahool_comments", "prashant_comments", "manager_comments", "pricing_comments"];

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// (?<!\d) instead of \b so "meme24 sept" still matches; the month must be a
// real spelling followed by a non-letter so "5 market" isn't read as March.
const DATE_RE = /(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s*[-/ ]?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])\.?(?:\s*,?\s*(20\d{2}))?/gi;

function clean(s) {
  return s.replace(/^[\s.,:;|\-–—]+/, "").replace(/[\s.,;|\-–—]+$/, "").trim();
}

function pad(n) { return (n < 10 ? "0" : "") + n; }

function extractNotes(text, refDate) {
  const ref = refDate ? new Date(refDate) : new Date();
  const matches = [...String(text || "").matchAll(DATE_RE)].filter(m => +m[1] >= 1 && +m[1] <= 31);
  const notes = [];

  const lead = clean(text.slice(0, matches.length ? matches[0].index : text.length));
  if (lead) notes.push({ date: null, raw: null, note: lead });

  matches.forEach((m, i) => {
    const day = +m[1];
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let year = m[3] ? +m[3] : ref.getFullYear();
    if (!m[3] && new Date(year, month, day) > new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1)) year -= 1;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    notes.push({
      date: year + "-" + pad(month + 1) + "-" + pad(day),
      raw: m[0].replace(/\.$/, "").trim(),
      note: clean(text.slice(m.index + m[0].length, end)),
    });
  });
  return notes;
}

async function run() {
  const { neon } = require("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);

  const live = await sql`
    SELECT uid, poc_comments, poc_comments_at, rahool_comments, rahool_comments_at,
           prashant_comments, prashant_comments_at, manager_comments, manager_comments_at,
           pricing_comments, pricing_comments_at
    FROM properties`;
  const legacy = await sql`
    SELECT uid, field, value, updated_at FROM legacy_edits
    WHERE field = ANY(${COMMENT_FIELDS}) AND COALESCE(btrim(value), '') <> ''`;

  const out = [];
  live.forEach(r => COMMENT_FIELDS.forEach(f => {
    if (!r[f] || !r[f].trim()) return;
    out.push({ uid: r.uid, field: f, updated_at: r[f + "_at"], notes: extractNotes(r[f], r[f + "_at"]) });
  }));
  legacy.forEach(r => out.push({ uid: r.uid, field: r.field, updated_at: r.updated_at, notes: extractNotes(r.value, r.updated_at) }));

  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  console.error(`${out.length} comments, ${out.reduce((n, c) => n + c.notes.length, 0)} notes, ` +
    `${out.filter(c => c.notes.some(n => !n.date)).length} with undated text`);
}

function test() {
  const assert = require("assert");
  const ref = "2026-09-29T12:00:00+05:30";

  const a = extractNotes("29 Sep.. meeting done, offered 121, his last ask is 125L, he knows the market price because the owner of B 1910 is his frnd and that deal was done in 120L. 26 sep.. unit is good, facing and sunlight desent, recently aquired same facing unit in 122.5L.", ref);
  assert.deepStrictEqual(a.map(n => n.date), ["2026-09-29", "2026-09-26"]);
  assert.ok(a[0].note.startsWith("meeting done") && a[0].note.endsWith("done in 120L"));
  assert.ok(a[1].note.startsWith("unit is good"));

  const b = extractNotes("28 Sept seller family member hopitalize, & seller is is 24 sept KYC awaited || 18 Sept Meeting done, AMA draft shared, offered 75 @1% || covered parking is allotted , 1182 sq ft", ref);
  assert.deepStrictEqual(b.map(n => n.date), ["2026-09-28", "2026-09-24", "2026-09-18"]);
  assert.strictEqual(b[1].note, "KYC awaited");
  assert.ok(b[2].note.startsWith("Meeting done") && b[2].note.endsWith("1182 sq ft"));

  assert.deepStrictEqual(extractNotes("meme24 sept KYC", ref).map(n => n.date), [null, "2026-09-24"]); // splits without a word boundary
  assert.strictEqual(extractNotes("5 market price check", ref).length, 1);                        // "market" is not March
  assert.strictEqual(extractNotes("15 Dec follow up", ref)[0].date, "2025-12-15");                // future date → last year
  assert.strictEqual(extractNotes("no dates here", ref)[0].date, null);                           // undated text kept
  console.log("extract-comment-notes: all checks pass");
}

module.exports = { extractNotes };
if (require.main === module) (process.argv.includes("--test") ? test() : run());
