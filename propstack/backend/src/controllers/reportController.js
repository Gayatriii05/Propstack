const pool = require('../config/db');
const { generateSql, generateMonthlySummary } = require('../services/ai');
const { fallbackSqlForQuestion } = require('../services/localSqlFallback');
const { validateGeneratedSql } = require('../utils/sqlGuard');
const { runReadOnlySelect } = require('../utils/readOnlyQuery');
const { buildMonthlyReportPdf } = require('../services/pdfService');

// Row fetchers shared by the JSON endpoints and the PDF export.
async function occupancyRows(ownerId) {
  return (
    await pool.query(
      'SELECT * FROM occupancy_report WHERE owner_id = $1 ORDER BY property_name',
      [ownerId]
    )
  ).rows;
}

async function revenueRows(ownerId) {
  return (
    await pool.query(
      `SELECT * FROM monthly_revenue_report WHERE owner_id = $1 ORDER BY month DESC`,
      [ownerId]
    )
  ).rows;
}

async function runningTotalRows(ownerId) {
  return (
    await pool.query(
      `SELECT
          month,
          revenue_collected,
          SUM(revenue_collected) OVER (
              ORDER BY month
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS running_total
       FROM monthly_revenue_report
       WHERE owner_id = $1
       ORDER BY month`,
      [ownerId]
    )
  ).rows;
}

// GET /api/reports/occupancy  -> reads from the occupancy_report VIEW
async function occupancyReport(req, res) {
  try {
    res.json(await occupancyRows(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch occupancy report' });
  }
}

// GET /api/reports/revenue -> reads from monthly_revenue_report VIEW
async function revenueReport(req, res) {
  try {
    res.json(await revenueRows(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch revenue report' });
  }
}

// GET /api/reports/top-units -> WINDOW FUNCTION: RANK() within each property
async function topUnitsReport(req, res) {
  try {
    const result = await pool.query(
      `SELECT
          u.id AS unit_id,
          u.unit_number,
          p.id AS property_id,
          p.name AS property_name,
          COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'paid'), 0) AS total_revenue,
          RANK() OVER (
              PARTITION BY p.id
              ORDER BY COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'paid'), 0) DESC
          ) AS revenue_rank_in_property
       FROM units u
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN leases l ON l.unit_id = u.id
       LEFT JOIN payments pay ON pay.lease_id = l.id
       WHERE p.owner_id = $1
       GROUP BY u.id, u.unit_number, p.id, p.name
       ORDER BY p.id, revenue_rank_in_property`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch top units report' });
  }
}

// GET /api/reports/running-total -> WINDOW FUNCTION: running SUM over months
async function runningRevenueTotal(req, res) {
  try {
    res.json(await runningTotalRows(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch running total' });
  }
}

// POST /api/reports/ask  (owner/manager)
// Natural-language SQL assistant: an LLM turns a plain-English question into
// a read-only SELECT, the validator hard-gates it (denylist + owner_id=$1
// scoping), and it executes on a READ ONLY / always-rolled-back connection.
// If the LLM is unavailable (missing key, billing, network) we degrade to a
// deterministic local SQL router so the assistant still answers. The local
// path runs through the exact same guard + read-only connection.
async function askReport(req, res) {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    let sql;
    let mode = 'llm';

    try {
      sql = await generateSql(question);
    } catch (err) {
      // Any provider failure (billing, network, rate limit, missing key) must
      // never leak its raw message to the client. We log it server-side, then
      // either degrade to the deterministic local router or fail cleanly.
      console.error('AI generation failed, trying local fallback:', err.message);
      const local = fallbackSqlForQuestion(question);
      if (!local) {
        return res.status(500).json({ error: 'Assistant unavailable (provider error)' });
      }
      sql = local.sql;
      mode = 'fallback';
    }

    const check = validateGeneratedSql(sql);
    if (!check.ok) {
      return res.status(400).json({ error: `Generated SQL rejected: ${check.error}`, sql });
    }

    const data = await runReadOnlySelect(check.sql, [req.user.id]);
    res.json({ question, sql: check.sql, mode, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report query' });
  }
}

// GET /api/reports/anomalies  (owner/manager)
// Flags tenants whose MOST RECENT payment was >= 7 days later than their
// own rolling 6-payment average days-late. Window functions:
//   LAG()    -> day-count of the immediately previous payment (per tenant)
//   AVG() OVER (ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING)
//            -> that tenant's average days-late over their last 6 payments
async function paymentAnomalies(req, res) {
  try {
    const result = await pool.query(
      `WITH payment_lateness AS (
          SELECT
            usr.id                                                AS tenant_id,
            usr.name                                              AS tenant_name,
            pay.id                                                AS payment_id,
            pay.due_date,
            pay.paid_date,
            CASE
              WHEN pay.status = 'paid' THEN (pay.paid_date - pay.due_date)
              ELSE (CURRENT_DATE - pay.due_date)
            END                                                   AS days_late,
            ROW_NUMBER() OVER (
              PARTITION BY usr.id ORDER BY pay.due_date DESC
            )                                                     AS rn_recent
          FROM payments pay
          JOIN leases l      ON l.id = pay.lease_id
          JOIN units u       ON u.id = l.unit_id
          JOIN properties p  ON p.id = u.property_id
          JOIN users usr     ON usr.id = l.tenant_id
          WHERE p.owner_id = $1
        ),
        scored AS (
          SELECT
            pl.*,
            LAG(pl.days_late) OVER w AS prev_days_late,
            AVG(pl.days_late) OVER (
              PARTITION BY pl.tenant_id
              ORDER BY pl.due_date
              ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING
            )                     AS avg_days_late_last6
          FROM payment_lateness pl
          WINDOW w AS (PARTITION BY pl.tenant_id ORDER BY pl.due_date)
        )
        SELECT
          tenant_id,
          tenant_name,
          days_late                          AS latest_days_late,
          COALESCE(ROUND(avg_days_late_last6, 1), 0) AS avg_days_late_last6,
          ROUND(days_late - COALESCE(avg_days_late_last6, 0), 1) AS anomaly_score,
          prev_days_late
        FROM scored
        WHERE rn_recent = 1
          AND avg_days_late_last6 IS NOT NULL
          AND (days_late - avg_days_late_last6) >= 7
        ORDER BY anomaly_score DESC`,
      [req.user.id]
    );

    const data = result.rows.map((r) => {
      const avg = Number(r.avg_days_late_last6);
      const avgFmt = `${avg % 1 === 0 ? avg : avg.toFixed(1)}-day`;
      return {
        ...r,
        anomaly_score: Number(r.anomaly_score),
        latest_days_late: Number(r.latest_days_late),
        avg_days_late_last6: avg,
        reason: `${r.tenant_name}: ${Number(r.latest_days_late)} days late this month vs ${avgFmt} average`,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute payment anomalies' });
  }
}

// GET /api/reports/monthly-pdf (owner/manager)
// PDF with occupancy + revenue tables, a running-total bar chart, and a
// short report summary. The summary is written by the LLM; if the AI call
// fails (e.g. billing/network) we fall back to a deterministic one so the
// export still works.
async function monthlyPdf(req, res) {
  try {
    const [occupancy, revenue, runningTotal] = await Promise.all([
      occupancyRows(req.user.id),
      revenueRows(req.user.id),
      runningTotalRows(req.user.id),
    ]);

    let summary;
    try {
      summary = await generateMonthlySummary({ occupancy, revenue, runningTotal });
    } catch (err) {
      console.error('AI summary failed, using generated fallback:', err.message);
      summary = fallbackSummary(occupancy, revenue, runningTotal);
    }

    const pdf = await buildMonthlyReportPdf({ occupancy, revenue, runningTotal, summary });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="propstack-monthly-report.pdf"');
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate monthly PDF' });
  }
}

// Deterministic fallback when the AI summary is unavailable — factual,
// derived only from the numbers in hand, never invented.
function fallbackSummary(occupancy, revenue, runningTotal) {
  const totalUnits = occupancy.reduce((s, r) => s + Number(r.total_units || 0), 0);
  const occupied = occupancy.reduce((s, r) => s + Number(r.occupied_units || 0), 0);
  const revenueTotal = revenue.reduce((s, r) => s + Number(r.revenue_collected || 0), 0);
  const cumulative = runningTotal.length
    ? Number(runningTotal[runningTotal.length - 1].running_total || 0)
    : 0;
  const rate = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0;
  return (
    `You have ${occupancy.length} properties with ${occupied} of ${totalUnits} units occupied (${rate}% occupancy). ` +
    `Collected revenue totals ₹${revenueTotal.toLocaleString('en-IN')} (₹${cumulative.toLocaleString('en-IN')} cumulative across ${revenue.length} month rows). ` +
    'This is an automatically generated fallback summary.'
  );
}

module.exports = {
  occupancyReport,
  revenueReport,
  topUnitsReport,
  runningRevenueTotal,
  askReport,
  paymentAnomalies,
  monthlyPdf,
};
