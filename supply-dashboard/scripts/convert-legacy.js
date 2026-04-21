/**
 * Converts your Supply Closure CSV(s) to legacy.json
 * 
 * Usage:
 *   node scripts/convert-legacy.js path/to/file1.csv path/to/file2.csv
 * 
 * Output: api/_legacy.json
 * 
 * Supports any number of CSV files (Gurgaon, Noida, Ghaziabad etc.)
 * Pass city as second arg if CSV doesn't have a City column:
 *   node scripts/convert-legacy.js gurgaon.csv --city=Gurgaon noida.csv --city=Noida
 */

const fs = require("fs");
const path = require("path");

function parseCSV(text) {
  const lines = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current.replace(/\r$/, ""));
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current.replace(/\r$/, ""));

  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = splitCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (vals[idx] || "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseRooms(r) {
  const rooms = [];
  for (let i = 1; i <= 5; i++) {
    const name = r["Room" + i + " Name"];
    const viewImage = r["Room" + i + " View Image"];
    if (!name && !viewImage) continue;
    rooms.push({
      index: i,
      attached_to: name || "",
      facing: r["Room" + i + " Facing"] || "",
      view: r["Room" + i + " View"] || "",
      view_image: viewImage || "",
      compass_image: r["Room" + i + " Compass Image"] || "",
    });
  }
  return rooms;
}

const STATUS_MAP = {
  "OH_Rejected": "OH Rejected",
  "Oh Rejected": "OH Rejected",
  "Duplicate_Entry": "Duplicacy",
  "Dead": "Dead - Not Interested",
  "Followup_ fixed brkrg": "Followup",
  "High Price": "Price High",
  "Oh_hold": "Hold",
  "Token Done": "Token Transferred",
  "Sold": "Dead - Sold",
};

function normalizeStatus(raw) {
  const trimmed = (raw || "").trim();
  return STATUS_MAP[trimmed] || trimmed;
}

function transformRow(r, index, defaultCity) {
  return {
    uid: "LEGACY-" + String(index + 1).padStart(4, "0"),
    isLegacy: true,
    source: r["Source"] || "",
    demandPrice: r["Ask"] || "",
    ownerName: r["Name"] || "",
    contactNo: r["Mob No."] || "",
    city: r["City"] || defaultCity || "",
    locality: r["Location"] || "",
    society: r["Society"] || "",
    unitNo: r["Unit No."] || "",
    floor: r["Floor"] || "",
    towerNo: "",
    configuration: r["Config"] || "",
    areaSqft: r["Area"] || "",
    bathrooms: r["# Toilets"] || "",
    balconies: r["#Balcony"] || "",
    gasPipeline: "",
    parking: "",
    furnishing: "",
    furnishingDetails: [],
    exitFacing: r["Exit facing"] || "",
    videoLink: r["Video/Photos Link"] || "",
    registryStatus: "",
    occupancyStatus: r["Occupancy Status"] || "",
    guaranteedSalePrice: r["Final Closure Price"] || "",
    performanceGuarantee: r["Performace Guarantee"] || "",
    initialPeriod: r["Contract Period"] || "",
    gracePeriod: r["Grace Period"] || "",
    outstandingLoan: "",
    bankNameLoan: "",
    fieldExec: "",
    assignedBy: r["POC"] || "",
    tokenRequestedBy: "",
    scheduleDate: "",
    visitSubmittedAt: r["Visit Status"] === "Yes" ? "Yes" : "",
    tokenSubmittedAt: "",
    tokenDealSubmittedAt: "",
    finalSubmittedAt: "",
    listingSubmittedAt: "",
    tokenAmountRequested: "",
    dealTokenAmount: "",
    remainingAmount: "",
    balconyDetails: parseRooms(r),
    exitCompassImage: r["Exit Compass Image"] || "",
    documentsAvailable: [],
    // Status from the sheet directly
    statusOverride: normalizeStatus(r["Status"]),
    offerPrice: r["Offer Price"] || "",
    closureTeamComments: r["Closure Team  Comments"] || r["Closure Team Comments"] || "",
    rahoolComments: r["Rahool Comments"] || "",
    prashantComments: r["Prashant Comments"] || "",
    demandTeamComments: r["Demand Team Comment"] || r["Demand Team Comments"] || "",
    // Extra fields from old sheet
    balconyView: r["Balcony View"] || "",
    priority: r["Priority"] || "",
    lastAsk: r["Last ask"] || "",
    offer: r["Offer"] || "",
    leadId: r["LEAD ID"] || "",
    listingPrice: r["Listing Price"] || "",
    tokenPaidIntimation: r["Token Paid Intimation"] || "",
    amaStatus: r["AMA Status"] || "",
  };
}

// ── Main ──
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: node scripts/convert-legacy.js <csv-file> [--city=CityName] [csv-file2] ...");
  console.log("Example: node scripts/convert-legacy.js data/gurgaon.csv --city=Gurgaon data/noida.csv --city=Noida");
  process.exit(1);
}

let allRows = [];
let currentCity = "";

for (const arg of args) {
  if (arg.startsWith("--city=")) {
    currentCity = arg.replace("--city=", "");
    continue;
  }

  const filePath = path.resolve(arg);
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    continue;
  }

  console.log(`Reading: ${filePath} (city: ${currentCity || "from CSV"})`);
  const text = fs.readFileSync(filePath, "utf-8");
  const rows = parseCSV(text);
  console.log(`  → ${rows.length} rows`);

  const startIndex = allRows.length;
  rows.forEach((r, i) => {
    allRows.push(transformRow(r, startIndex + i, currentCity));
  });
}

// Filter out empty/garbage rows
allRows = allRows.filter(r => r.society && r.society.trim());

const outPath = path.join(__dirname, "..", "api", "_legacy.json");
fs.writeFileSync(outPath, JSON.stringify(allRows, null, 2));
console.log(`\n✅ Wrote ${allRows.length} rows to ${outPath}`);
