const pool = require('../config/db');

// GET /api/reports/occupancy  -> reads from the occupancy_report VIEW
async function occupancyReport(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM occupancy_report WHERE owner_id = $1 ORDER BY property_name',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch occupancy report' });
  }
}

// GET /api/reports/revenue -> reads from monthly_revenue_report VIEW
async function revenueReport(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM monthly_revenue_report
       WHERE owner_id = $1
       ORDER BY month DESC`,
      [req.user.id]
    );
    res.json(result.rows);
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
    const result = await pool.query(
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
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch running total' });
  }
}

module.exports = { occupancyReport, revenueReport, topUnitsReport, runningRevenueTotal };
