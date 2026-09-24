/**
 * Dashboard statistics.
 *
 * Keeps the four original counters (total, verified, viaMesh, high) so nothing
 * that already reads this endpoint breaks, and adds the breakdowns the control
 * room console needs: severity mix, hazard mix, trust bands, and an hourly
 * arrival curve for the last 24 hours.
 */
import express from "express";
import { supabase, hasColumn } from "../lib/supabase.js";
import { trustBand } from "../lib/trust.js";

const router = express.Router();

function tally(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = row[key] ?? "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

router.get("/", async (req, res) => {
  try {
    const columns = ["created_at", "severity", "status", "source"];
    if (hasColumn("hazard_type")) columns.push("hazard_type");
    if (hasColumn("trust_score")) columns.push("trust_score");

    const { data, error } = await supabase
      .from("reports")
      .select(columns.join(","))
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) throw error;
    const rows = data || [];

    const now = Date.now();
    const hoursAgo = (iso) => (now - new Date(iso).getTime()) / 36e5;

    const last24 = rows.filter((r) => hoursAgo(r.created_at) <= 24);
    const lastHour = rows.filter((r) => hoursAgo(r.created_at) <= 1);

    // 24 buckets, oldest first, for the arrival sparkline.
    const timeline = Array.from({ length: 24 }, (_, i) => {
      const hoursBack = 23 - i;
      const inBucket = rows.filter((r) => {
        const h = hoursAgo(r.created_at);
        return h >= hoursBack && h < hoursBack + 1;
      });
      return {
        hoursAgo: hoursBack,
        total: inBucket.length,
        high: inBucket.filter((r) => r.severity === "high").length,
      };
    });

    const trust = { strong: 0, fair: 0, weak: 0, suspect: 0, unscored: 0 };
    for (const row of rows) {
      if (typeof row.trust_score === "number") trust[trustBand(row.trust_score)]++;
      else trust.unscored++;
    }

    const openHigh = rows.filter(
      (r) => r.severity === "high" && !["resolved", "dismissed"].includes(r.status)
    ).length;

    res.json({
      // Original four — kept for backwards compatibility.
      total: rows.length,
      verified: rows.filter((r) => r.status === "verified").length,
      viaMesh: rows.filter((r) => r.source === "mesh").length,
      high: rows.filter((r) => r.severity === "high").length,

      // Added.
      openHigh,
      last24h: last24.length,
      lastHour: lastHour.length,
      bySeverity: tally(rows, "severity"),
      byStatus: tally(rows, "status"),
      bySource: tally(rows, "source"),
      byHazard: hasColumn("hazard_type") ? tally(rows, "hazard_type") : null,
      trust,
      timeline,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[GET /stats]", err);
    res.status(500).json({ error: "Could not compute stats", detail: err.message });
  }
});

export default router;
