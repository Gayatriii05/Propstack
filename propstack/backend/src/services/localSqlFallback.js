// Deterministic, offline fallback for the natural-language SQL assistant.
//
// When the Anthropic call fails (billing, network, rate limit) or the API
// key is simply absent, this router answers common portfolio questions with
// hand-written, read-only SELECTs - every one scoped to `owner_id = $1`.
// The generated SQL still goes through sqlGuard and executes on the same
// READ ONLY / always-rolled-back connection as the LLM path, so the safety
// story doesn't change when we degrade to fallback mode.

function hasAny(q, words) {
  return words.some((w) => q.includes(w));
}

const OCCUPIED_COUNT_SQL = `SELECT COUNT(*) FILTER (WHERE u.status = 'occupied') AS occupied_units
  FROM units u
  JOIN properties p ON p.id = u.property_id
  WHERE p.owner_id = $1`;

const VACANT_COUNT_SQL = `SELECT COUNT(*) FILTER (WHERE u.status = 'vacant') AS vacant_units
  FROM units u
  JOIN properties p ON p.id = u.property_id
  WHERE p.owner_id = $1`;

const UNIT_STATUS_SUMMARY_SQL = `SELECT
    COUNT(*)                                             AS total_units,
    COUNT(*) FILTER (WHERE u.status = 'occupied')        AS occupied_units,
    COUNT(*) FILTER (WHERE u.status = 'vacant')          AS vacant_units
  FROM units u
  JOIN properties p ON p.id = u.property_id
  WHERE p.owner_id = $1`;

const STATUS_UNITS_SQL = (status) => `SELECT
    p.name AS property_name,
    u.unit_number,
    u.rent_amount,
    u.bedrooms
  FROM units u
  JOIN properties p ON p.id = u.property_id
  WHERE p.owner_id = $1 AND u.status = '${status}'
  ORDER BY p.name, u.unit_number`;

const OCCUPANCY_SQL = `SELECT
    p.id,
    p.name AS property_name,
    COUNT(u.id)                                      AS total_units,
    COUNT(u.id) FILTER (WHERE u.status = 'occupied') AS occupied_units,
    ROUND(100.0 * COUNT(u.id) FILTER (WHERE u.status = 'occupied') / NULLIF(COUNT(u.id), 0), 1)
                                                     AS occupancy_rate_pct
  FROM properties p
  LEFT JOIN units u ON u.property_id = p.id
  WHERE p.owner_id = $1
  GROUP BY p.id, p.name
  ORDER BY p.name`;

const TOTAL_REVENUE_SQL = `SELECT
    COALESCE(SUM(pay.amount), 0) AS total_collected
  FROM payments pay
  JOIN leases l   ON l.id = pay.lease_id
  JOIN units u    ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE p.owner_id = $1 AND pay.status = 'paid'`;

const MONTHLY_REVENUE_SQL = `SELECT
    p.name AS property_name,
    pay.due_date AS month,
    pay.amount   AS revenue_collected
  FROM payments pay
  JOIN leases l   ON l.id = pay.lease_id
  JOIN units u    ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE p.owner_id = $1 AND pay.status = 'paid'
  ORDER BY pay.due_date DESC`;

const OVERDUE_SQL = `SELECT
    usr.name    AS tenant_name,
    u.unit_number,
    pay.due_date,
    pay.amount,
    pay.late_fee_applied
  FROM payments pay
  JOIN leases l ON l.id = pay.lease_id
  JOIN units u  ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  JOIN users usr ON usr.id = l.tenant_id
  WHERE p.owner_id = $1 AND pay.status = 'overdue'
  ORDER BY pay.due_date`;

const TOP_UNITS_SQL = `SELECT
    p.name AS property_name,
    u.unit_number,
    COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'paid'), 0) AS total_revenue
  FROM units u
  JOIN properties p ON p.id = u.property_id
  LEFT JOIN leases l ON l.unit_id = u.id
  LEFT JOIN payments pay ON pay.lease_id = l.id
  WHERE p.owner_id = $1
  GROUP BY u.id, u.unit_number, p.id, p.name
  ORDER BY total_revenue DESC
  LIMIT 5`;

const RUNNING_TOTAL_SQL = `SELECT
    month,
    revenue_collected,
    SUM(revenue_collected) OVER (
      ORDER BY month
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_total
  FROM monthly_revenue_report
  WHERE owner_id = $1
  ORDER BY month`;

const MAINTENANCE_SQL = `SELECT
    u.unit_number,
    m.description,
    m.status,
    m.priority,
    m.created_at
  FROM maintenance_requests m
  JOIN units u ON u.id = m.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE p.owner_id = $1
  ORDER BY m.created_at DESC`;

const ACTIVE_LEASES_SQL = `SELECT
    u.unit_number,
    usr.name AS tenant_name,
    l.monthly_rent,
    l.start_date,
    l.end_date
  FROM leases l
  JOIN units u ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  JOIN users usr ON usr.id = l.tenant_id
  WHERE p.owner_id = $1 AND l.status = 'active'
  ORDER BY l.end_date`;

const TENANTS_SQL = `SELECT DISTINCT
    usr.id,
    usr.name,
    usr.email
  FROM users usr
  JOIN leases l ON l.tenant_id = usr.id
  JOIN units u  ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE p.owner_id = $1
  ORDER BY usr.name`;

const PROPERTIES_SQL = `SELECT id, name, address, city
  FROM properties p
  WHERE p.owner_id = $1
  ORDER BY name`;

const UNITS_SQL = `SELECT
    p.name AS property_name,
    u.unit_number,
    u.rent_amount,
    u.status,
    u.bedrooms
  FROM units u
  JOIN properties p ON p.id = u.property_id
  WHERE p.owner_id = $1
  ORDER BY p.name, u.unit_number`;

// Ordered rules - first match wins. `when` receives the lowercased question.
const RULES = [
  {
    id: 'count-occupied-units',
    when: (q) => hasAny(q, ['how many', 'count', 'total', 'number']) && q.includes('unit') && q.includes('occupied'),
    sql: OCCUPIED_COUNT_SQL,
  },
  {
    id: 'count-vacant-units',
    when: (q) => hasAny(q, ['how many', 'count', 'total', 'number']) && q.includes('unit') && q.includes('vacant'),
    sql: VACANT_COUNT_SQL,
  },
  {
    id: 'unit-status-summary',
    when: (q) => hasAny(q, ['how many', 'count', 'total', 'number']) && q.includes('unit'),
    sql: UNIT_STATUS_SUMMARY_SQL,
  },
  {
    id: 'vacant-units',
    when: (q) => q.includes('vacant') && q.includes('unit'),
    sql: STATUS_UNITS_SQL('vacant'),
  },
  {
    id: 'occupied-units',
    when: (q) => q.includes('occupied') && q.includes('unit'),
    sql: STATUS_UNITS_SQL('occupied'),
  },
  {
    id: 'occupancy',
    when: (q) => q.includes('occupancy') || (q.includes('occupied') && hasAny(q, ['rate', 'percent', '%'])),
    sql: OCCUPANCY_SQL,
  },
  {
    id: 'total-revenue',
    when: (q) => hasAny(q, ['revenue', 'collected', 'income', 'earned']) && hasAny(q, ['total', 'sum', 'much', 'all']),
    sql: TOTAL_REVENUE_SQL,
  },
  {
    id: 'monthly-revenue',
    when: (q) => hasAny(q, ['revenue', 'income']) && q.includes('month'),
    sql: MONTHLY_REVENUE_SQL,
  },
  {
    id: 'overdue',
    when: (q) => hasAny(q, ['overdue', 'late', 'unpaid']),
    sql: OVERDUE_SQL,
  },
  {
    id: 'top-units',
    when: (q) => hasAny(q, ['top', 'best', 'highest', 'rank', 'perform']) && q.includes('unit'),
    sql: TOP_UNITS_SQL,
  },
  {
    id: 'running-total',
    when: (q) => hasAny(q, ['running', 'cumulative']),
    sql: RUNNING_TOTAL_SQL,
  },
  {
    id: 'maintenance',
    when: (q) => hasAny(q, ['mainten', 'repair', 'ticket']),
    sql: MAINTENANCE_SQL,
  },
  {
    id: 'active-leases',
    when: (q) => q.includes('lease') && q.includes('active'),
    sql: ACTIVE_LEASES_SQL,
  },
  {
    id: 'leases',
    when: (q) => q.includes('lease'),
    sql: ACTIVE_LEASES_SQL,
  },
  {
    id: 'tenants',
    when: (q) => q.includes('tenant'),
    sql: TENANTS_SQL,
  },
  {
    id: 'properties',
    when: (q) => hasAny(q, ['propert', 'portfolio', 'building']),
    sql: PROPERTIES_SQL,
  },
  {
    id: 'units',
    when: (q) => q.includes('unit'),
    sql: UNITS_SQL,
  },
];

function fallbackSqlForQuestion(question) {
  if (typeof question !== 'string' || question.trim() === '') return null;
  const q = question.toLowerCase();
  for (const rule of RULES) {
    if (rule.when(q)) return { id: rule.id, sql: rule.sql };
  }
  return null;
}

module.exports = { fallbackSqlForQuestion };