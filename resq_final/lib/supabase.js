/**
 * Supabase connection + schema compatibility.
 *
 * Why the "schema compatibility" part exists:
 * this upgrade adds new columns (hazard_type, trust_score, photo_hash, ...).
 * If you haven't run sql/001_upgrade.sql in the Supabase SQL editor yet, those
 * columns don't exist and every insert would fail with a confusing error.
 * So on boot we look at the table once, remember which columns are really
 * there, and quietly drop any field the table can't store. The server keeps
 * working either way — you just get fewer features until you run the SQL.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error(
    "\n[config] SUPABASE_URL and SUPABASE_ANON_KEY are missing.\n" +
      "         Copy .env.example to .env and fill them in (Supabase dashboard\n" +
      "         -> Project Settings -> API).\n"
  );
}

export const supabase = createClient(url || "http://localhost", key || "missing-key", {
  auth: { persistSession: false },
});

/** Columns the original table shipped with. Always assumed present. */
const BASE_COLUMNS = [
  "id",
  "created_at",
  "description",
  "photo_url",
  "latitude",
  "longitude",
  "severity",
  "status",
  "source",
];

/** Columns added by sql/001_upgrade.sql. Optional. */
const UPGRADE_COLUMNS = [
  "client_id",
  "photo_hash",
  "hazard_type",
  "language",
  "trust_score",
  "flags",
  "ai_confidence",
  "ai_model",
  "reporter_hash",
  "verified_at",
];

let known = new Set(BASE_COLUMNS);
let upgraded = false;
let checked = false;

/**
 * Ask the table what it actually looks like. Runs once at startup.
 * Reading one row is enough — Supabase returns every column as a key.
 */
export async function detectSchema() {
  if (checked) return { known, upgraded };
  checked = true;

  const { data, error } = await supabase.from("reports").select("*").limit(1);

  if (error) {
    console.warn(
      `[schema] Could not read the reports table (${error.message}). ` +
        `Running in basic mode.`
    );
    return { known, upgraded };
  }

  if (data && data.length > 0) {
    known = new Set(Object.keys(data[0]));
  } else {
    // Empty table: we can't infer columns from a row, so assume base only.
    console.warn("[schema] reports table is empty — assuming base columns only.");
  }

  const missing = UPGRADE_COLUMNS.filter((c) => !known.has(c));
  upgraded = missing.length === 0;

  if (upgraded) {
    console.log("[schema] Upgraded schema detected. All features on.");
  } else {
    console.log(
      `[schema] Basic schema. Missing: ${missing.join(", ")}\n` +
        `         Run sql/001_upgrade.sql in the Supabase SQL editor to enable\n` +
        `         hazard types, trust scores and duplicate-photo detection.`
    );
  }

  return { known, upgraded };
}

/** True if the upgrade SQL has been applied. */
export function isUpgraded() {
  return upgraded;
}

export function hasColumn(name) {
  return known.has(name);
}

/** Remove any key the table can't store, so inserts never fail on schema drift. */
export function pickStorable(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (known.has(k)) out[k] = v;
  }
  return out;
}
