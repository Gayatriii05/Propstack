-- ============================================================
-- VIEW: occupancy_report
--
-- WHAT IT DOES: for each property, shows total units, occupied units,
-- and occupancy rate as a percentage. Joins properties -> units and
-- aggregates with a FILTER clause (Postgres-specific, cleaner than
-- a CASE-inside-SUM for conditional aggregation).
--
-- WHY A VIEW: the query is reused across the owner dashboard AND the
-- reports endpoint. A view keeps the logic in one place (DRY at the
-- SQL layer) and lets the app just SELECT * FROM occupancy_report.
-- ============================================================

CREATE OR REPLACE VIEW occupancy_report AS
SELECT
    p.id                                                AS property_id,
    p.name                                               AS property_name,
    p.owner_id,
    COUNT(u.id)                                          AS total_units,
    COUNT(u.id) FILTER (WHERE u.status = 'occupied')     AS occupied_units,
    ROUND(
        100.0 * COUNT(u.id) FILTER (WHERE u.status = 'occupied')
        / NULLIF(COUNT(u.id), 0),
        2
    )                                                     AS occupancy_rate_pct
FROM properties p
LEFT JOIN units u ON u.property_id = p.id
GROUP BY p.id, p.name, p.owner_id;

-- ============================================================
-- VIEW: monthly_revenue_report
-- Revenue actually collected (paid) per property per calendar month.
-- ============================================================

CREATE OR REPLACE VIEW monthly_revenue_report AS
SELECT
    p.id                                    AS property_id,
    p.name                                  AS property_name,
    p.owner_id,
    DATE_TRUNC('month', pay.paid_date)::DATE AS month,
    SUM(pay.amount)                         AS revenue_collected
FROM payments pay
JOIN leases l  ON l.id = pay.lease_id
JOIN units u   ON u.id = l.unit_id
JOIN properties p ON p.id = u.property_id
WHERE pay.status = 'paid'
GROUP BY p.id, p.name, p.owner_id, DATE_TRUNC('month', pay.paid_date);

-- ============================================================
-- WINDOW FUNCTION QUERY #1: rank units by total revenue within
-- each property (not a stored view — exposed via /api/reports endpoint
-- as a live query, since window functions are the headline feature
-- and I want to be able to write this from scratch in an interview)
--
-- PLAIN ENGLISH: for every unit, sum up all its paid payments, then
-- rank it against sibling units IN THE SAME PROPERTY ONLY — that's
-- what PARTITION BY does, it resets the ranking per group instead of
-- ranking globally across the whole table.
--
-- INTERVIEW QUESTIONS ON THIS PIECE:
--   1. "Difference between RANK(), DENSE_RANK(), ROW_NUMBER()?"
--      -> RANK leaves gaps after ties (1,1,3). DENSE_RANK doesn't
--         (1,1,2). ROW_NUMBER ignores ties entirely, always unique
--         sequential numbers even for equal values.
--   2. "Why PARTITION BY here instead of just GROUP BY property?"
--      -> GROUP BY would collapse rows into one per property, losing
--         per-unit detail. PARTITION BY keeps every unit row but
--         computes the ranking *within* its group — window functions
--         don't reduce row count, aggregates with GROUP BY do.
-- ============================================================

-- (kept here as reference SQL; also implemented in reportController.js)
-- SELECT
--     u.id AS unit_id,
--     u.unit_number,
--     p.name AS property_name,
--     COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'paid'), 0) AS total_revenue,
--     RANK() OVER (
--         PARTITION BY p.id
--         ORDER BY COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'paid'), 0) DESC
--     ) AS revenue_rank_in_property
-- FROM units u
-- JOIN properties p ON p.id = u.property_id
-- LEFT JOIN leases l ON l.unit_id = u.id
-- LEFT JOIN payments pay ON pay.lease_id = l.id
-- GROUP BY u.id, u.unit_number, p.id, p.name
-- ORDER BY p.id, revenue_rank_in_property;

-- ============================================================
-- WINDOW FUNCTION QUERY #2: running total of rent collected per month
-- (per owner, across all their properties)
--
-- PLAIN ENGLISH: shows revenue for each month AND a cumulative sum
-- up to that month, using SUM() ... OVER (ORDER BY month ROWS
-- UNBOUNDED PRECEDING) — a classic running-total pattern.
-- ============================================================

-- SELECT
--     month,
--     revenue_collected,
--     SUM(revenue_collected) OVER (
--         ORDER BY month
--         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
--     ) AS running_total
-- FROM (
--     SELECT DATE_TRUNC('month', pay.paid_date)::DATE AS month,
--            SUM(pay.amount) AS revenue_collected
--     FROM payments pay
--     JOIN leases l ON l.id = pay.lease_id
--     JOIN units u ON u.id = l.unit_id
--     JOIN properties p ON p.id = u.property_id
--     WHERE pay.status = 'paid' AND p.owner_id = $1
--     GROUP BY DATE_TRUNC('month', pay.paid_date)
-- ) monthly
-- ORDER BY month;
