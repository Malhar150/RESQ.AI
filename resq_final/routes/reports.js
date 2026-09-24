/**
 * Report routes — intake, listing, and control-room actions.
 */
import express from "express";
import { supabase, pickStorable, hasColumn } from "../lib/supabase.js";
import { classifyReport, SEVERITIES, HAZARD_TYPES } from "../lib/classify.js";
import { hashImage } from "../lib/imageHash.js";
import { scoreTrust, reporterHash, trustBand } from "../lib/trust.js";
import { requireAdmin } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

const STATUSES = ["pending", "verified", "dispatched", "resolved", "dismissed"];

/** How many recent reports to load as context for duplicate + corroboration checks. */
const CONTEXT_ROWS = 300;

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validate(body) {
  const errors = [];
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);

  if (!description) errors.push("description is required");
  else if (description.length > 4000) errors.push("description must be under 4000 characters");

  if (latitude === null) errors.push("latitude is required and must be a number");
  else if (latitude < -90 || latitude > 90) errors.push("latitude must be between -90 and 90");

  if (longitude === null) errors.push("longitude is required and must be a number");
  else if (longitude < -180 || longitude > 180) errors.push("longitude must be between -180 and 180");

  if (body.source && !["online", "mesh"].includes(body.source)) {
    errors.push("source must be 'online' or 'mesh'");
  }

  return { errors, description, latitude, longitude };
}

/** Pull recent reports once, to use as context for every check below. */
async function loadContext() {
  const columns = [
    "id",
    "created_at",
    "description",
    "latitude",
    "longitude",
    "severity",
    "status",
    "source",
  ];
  if (hasColumn("photo_hash")) columns.push("photo_hash");
  if (hasColumn("reporter_hash")) columns.push("reporter_hash");

  const { data, error } = await supabase
    .from("reports")
    .select(columns.join(","))
    .order("created_at", { ascending: false })
    .limit(CONTEXT_ROWS);

  if (error) {
    console.warn(`[context] could not load recent reports: ${error.message}`);
    return [];
  }
  return data || [];
}

/**
 * Turn a raw submission into a database row: classify it, hash the photo,
 * score its trustworthiness. Does not write anything.
 */
async function buildRow(body, req, context) {
  const { description, latitude, longitude } = validate(body);

  const photoSource = body.photo_url || body.photo_base64 || null;

  // Classification and image hashing are independent — run them together.
  const [ai, photo_hash] = await Promise.all([
    classifyReport(description),
    photoSource ? hashImage(photoSource) : Promise.resolve(null),
  ]);

  const who = reporterHash(req);

  const { trust_score, flags } = scoreTrust(
    {
      description,
      latitude,
      longitude,
      photo_hash,
      photo_url: photoSource,
      reporter_hash: who,
      source: body.source || "online",
    },
    context
  );

  return {
    row: {
      description,
      latitude,
      longitude,
      photo_url: typeof body.photo_url === "string" ? body.photo_url : null,
      severity: ai.severity,
      status: "pending",
      source: body.source === "mesh" ? "mesh" : "online",
      // Everything below only lands if sql/001_upgrade.sql has been run.
      client_id: body.client_id || null,
      photo_hash,
      hazard_type: ai.hazard_type,
      language: ai.language,
      trust_score,
      flags,
      ai_confidence: ai.confidence,
      ai_model: ai.model,
      reporter_hash: who,
    },
    analysis: { ...ai, trust_score, trust_band: trustBand(trust_score), flags },
  };
}

/** Attach derived fields the dashboard wants but the table doesn't store. */
function decorate(report) {
  if (!report) return report;
  const score = report.trust_score;
  return {
    ...report,
    trust_band: typeof score === "number" ? trustBand(score) : null,
  };
}

/* -------------------------------------------------------------------------
 * POST /reports — a citizen files a hazard report
 * ---------------------------------------------------------------------- */

router.post("/", rateLimit(), async (req, res) => {
  try {
    const { errors } = validate(req.body || {});
    if (errors.length) {
      return res.status(400).json({ error: "Invalid report", details: errors });
    }

    const context = await loadContext();

    // Idempotency: a mesh device retrying a queued report sends the same
    // client_id twice. Return the original instead of creating a duplicate.
    if (req.body.client_id && hasColumn("client_id")) {
      const { data: existing } = await supabase
        .from("reports")
        .select("*")
        .eq("client_id", req.body.client_id)
        .maybeSingle();
      if (existing) {
        return res.status(200).json({ report: decorate(existing), duplicate: true });
      }
    }

    const { row, analysis } = await buildRow(req.body, req, context);

    const { data, error } = await supabase
      .from("reports")
      .insert([pickStorable(row)])
      .select();

    if (error) throw error;

    res.status(201).json({ report: decorate(data[0]), analysis });
  } catch (err) {
    console.error("[POST /reports]", err);
    res.status(500).json({ error: "Could not save the report", detail: err.message });
  }
});

/* -------------------------------------------------------------------------
 * POST /reports/sync — a device uploads everything it queued while offline
 *
 * This is the endpoint the Bluetooth mesh relay talks to. A phone that has
 * been carrying reports hop-by-hop finally gets signal and pushes the whole
 * queue at once. Each entry carries a client_id generated on the originating
 * device, so replaying the same queue is harmless.
 * ---------------------------------------------------------------------- */

router.post("/sync", rateLimit(60), async (req, res) => {
  try {
    const items = Array.isArray(req.body?.reports) ? req.body.reports : null;
    if (!items) {
      return res.status(400).json({
        error: "Expected a 'reports' array",
        example: { reports: [{ client_id: "uuid", description: "...", latitude: 26.1, longitude: 91.7 }] },
      });
    }
    if (items.length > 100) {
      return res.status(413).json({ error: "Send at most 100 reports per sync" });
    }

    const context = await loadContext();
    const accepted = [];
    const skipped = [];
    const failed = [];

    // Ask once which client_ids we already hold, rather than per item.
    let seen = new Set();
    if (hasColumn("client_id")) {
      const ids = items.map((i) => i?.client_id).filter(Boolean);
      if (ids.length) {
        const { data } = await supabase.from("reports").select("client_id").in("client_id", ids);
        seen = new Set((data || []).map((r) => r.client_id));
      }
    }

    for (const item of items) {
      try {
        if (item?.client_id && seen.has(item.client_id)) {
          skipped.push({ client_id: item.client_id, reason: "already received" });
          continue;
        }

        const { errors } = validate(item || {});
        if (errors.length) {
          failed.push({ client_id: item?.client_id || null, errors });
          continue;
        }

        const { row } = await buildRow({ ...item, source: item.source || "mesh" }, req, context);
        const { data, error } = await supabase
          .from("reports")
          .insert([pickStorable(row)])
          .select();
        if (error) throw error;

        accepted.push(decorate(data[0]));
        context.unshift(data[0]); // later items in this batch see earlier ones
        if (item?.client_id) seen.add(item.client_id);
      } catch (err) {
        failed.push({ client_id: item?.client_id || null, errors: [err.message] });
      }
    }

    res.status(accepted.length ? 201 : 200).json({
      accepted: accepted.length,
      skipped: skipped.length,
      failed: failed.length,
      reports: accepted,
      details: { skipped, failed },
    });
  } catch (err) {
    console.error("[POST /reports/sync]", err);
    res.status(500).json({ error: "Sync failed", detail: err.message });
  }
});

/* -------------------------------------------------------------------------
 * GET /reports — the dashboard feed
 * ---------------------------------------------------------------------- */

router.get("/", async (req, res) => {
  try {
    const {
      severity,
      status,
      source,
      hazard_type,
      q,
      since,
      limit = 200,
      order = "desc",
    } = req.query;

    let query = supabase.from("reports").select("*");

    if (severity) query = query.in("severity", String(severity).split(","));
    if (status) query = query.in("status", String(status).split(","));
    if (source) query = query.in("source", String(source).split(","));
    if (hazard_type && hasColumn("hazard_type")) {
      query = query.in("hazard_type", String(hazard_type).split(","));
    }
    if (q) query = query.ilike("description", `%${String(q).replace(/[%_]/g, "")}%`);
    if (since) {
      const d = new Date(since);
      if (!Number.isNaN(d.getTime())) query = query.gte("created_at", d.toISOString());
    }

    query = query
      .order("created_at", { ascending: order === "asc" })
      .limit(Math.min(Number(limit) || 200, 1000));

    const { data, error } = await query;
    if (error) throw error;

    res.json({ reports: (data || []).map(decorate), count: data?.length || 0 });
  } catch (err) {
    console.error("[GET /reports]", err);
    res.status(500).json({ error: "Could not load reports", detail: err.message });
  }
});

/* -------------------------------------------------------------------------
 * GET /reports/:id
 * ---------------------------------------------------------------------- */

router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Report not found" });

    res.json({ report: decorate(data) });
  } catch (err) {
    console.error("[GET /reports/:id]", err);
    res.status(500).json({ error: "Could not load the report", detail: err.message });
  }
});

/* -------------------------------------------------------------------------
 * PATCH /reports/:id — verify, escalate, dismiss (control room only)
 * ---------------------------------------------------------------------- */

router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const { status, severity, hazard_type } = req.body || {};
    const updates = {};

    if (status !== undefined) {
      if (!STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}` });
      }
      updates.status = status;
      if (status === "verified" && hasColumn("verified_at")) {
        updates.verified_at = new Date().toISOString();
      }
    }

    if (severity !== undefined) {
      if (!SEVERITIES.includes(severity)) {
        return res.status(400).json({ error: `severity must be one of: ${SEVERITIES.join(", ")}` });
      }
      updates.severity = severity;
    }

    if (hazard_type !== undefined && hasColumn("hazard_type")) {
      if (!HAZARD_TYPES.includes(hazard_type)) {
        return res.status(400).json({ error: `hazard_type must be one of: ${HAZARD_TYPES.join(", ")}` });
      }
      updates.hazard_type = hazard_type;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "Nothing to update. Send status, severity or hazard_type." });
    }

    const { data, error } = await supabase
      .from("reports")
      .update(pickStorable(updates))
      .eq("id", req.params.id)
      .select();

    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Report not found" });

    res.json({ report: decorate(data[0]) });
  } catch (err) {
    console.error("[PATCH /reports/:id]", err);
    res.status(500).json({ error: "Could not update the report", detail: err.message });
  }
});

/* -------------------------------------------------------------------------
 * DELETE /reports/:id — remove a test or spam entry (control room only)
 * ---------------------------------------------------------------------- */

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("reports")
      .delete()
      .eq("id", req.params.id)
      .select();

    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Report not found" });

    res.json({ deleted: data[0].id });
  } catch (err) {
    console.error("[DELETE /reports/:id]", err);
    res.status(500).json({ error: "Could not delete the report", detail: err.message });
  }
});

export default router;
