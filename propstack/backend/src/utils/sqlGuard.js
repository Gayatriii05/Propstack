// Defense-in-depth for the natural-language SQL assistant.
// The LLM is instructed to emit a single read-only SELECT scoped to
// owner_id = $1, but we NEVER trust that — this validator is a hard gate
// in front of the database. Any failure here means the query is refused.

const FORBIDDEN_KEYWORDS =
  /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|MERGE|REPLACE|EXPLAIN|VACUUM|REINDEX|LOCK|EXECUTE|CALL|DO|IMPORT|TRIGGER|FUNCTION|PROCEDURE|SEQUENCE|UNION|INTERSECT|EXCEPT)\b/i;

function validateGeneratedSql(sql) {
  if (typeof sql !== 'string' || sql.trim() === '') {
    return { ok: false, error: 'SQL must be a non-empty string' };
  }

  // Strip a single trailing semicolon, then reject any other `;` (multi-statement).
  let cleaned = sql.trim().replace(/;+\s*$/, '');
  if (!/^SELECT\b/i.test(cleaned)) {
    return { ok: false, error: 'Only a single read-only SELECT statement is allowed' };
  }
  if (FORBIDDEN_KEYWORDS.test(cleaned)) {
    return { ok: false, error: 'Generated SQL contains a forbidden keyword' };
  }
  if (cleaned.includes(';')) {
    return { ok: false, error: 'Multiple statements are not allowed' };
  }
  if (cleaned.includes('--') || cleaned.includes('/*')) {
    return { ok: false, error: 'SQL comments are not allowed' };
  }

  // Multi-tenancy: the query must be scoped to the requesting owner via the
  // bound parameter $1. A query that can't see who's asking must not run.
  if (!/owner_id\s*=\s*\$1/i.test(cleaned)) {
    return { ok: false, error: 'Query must be scoped to owner_id = $1' };
  }

  return { ok: true, sql: cleaned };
}

module.exports = { validateGeneratedSql, FORBIDDEN_KEYWORDS };