const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

// The full, exact schema is fed to the model every request — the LLM only
// ever sees the real table definitions, so it can't invent columns.
const schemaText = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

const SYSTEM_PROMPT = `You are a senior PostgreSQL (14+) developer for a property & lease management app. You write exact, ready-to-run SQL.

EXACT DATABASE SCHEMA:
${schemaText}

STRICT RULES (each one is mandatory):
1. Emit exactly ONE read-only SELECT statement. Never use DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, COPY, MERGE, EXPLAIN, VACUUM, LOCK.
2. No comments (no -- or /* */), no multiple statements separated by semicolons, no CTEs that write.
3. MULTI-TENANCY: the caller must only ever see their own data. Every query MUST filter through the owner chain and include the placeholder owner id as the bound parameter $1, e.g. "WHERE p.owner_id = $1" (properties aliased "p"). Never inline a literal user id. If your query cannot be scoped to p.owner_id = $1 it is invalid.
4. Use only standard built-in functions. No pg_sleep, dblink, or extensions.
5. Return ONLY a JSON object, no markdown fences, no prose: {"sql": "<the single SELECT statement>"}`;

function extractSql(text) {
  const cleaned = text
    .replace(/```[a-z]*/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Assistant did not return a JSON payload');
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed.sql || typeof parsed.sql !== 'string') {
    throw new Error('Assistant response missing "sql" field');
  }
  return parsed.sql;
}

async function generateSql(question) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: question }],
  });
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return extractSql(text);
}

const SUMMARY_SYSTEM_PROMPT = `You write factual 2-3 sentence plain-English monthly summaries for a property owner.
Only use the numbers you are given. Never invent figures, never round misleadingly,
never mention anything not present in the input. Focus on occupancy, revenue, and trend direction.`;

async function generateMonthlySummary({ occupancy, revenue, runningTotal }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const payload = JSON.stringify({
    occupancy_report: occupancy,
    monthly_revenue: revenue,
    running_total_by_month: runningTotal,
  });
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Write the monthly summary from this data:\n${payload}` }],
  });
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

module.exports = { generateSql, generateMonthlySummary, MODEL };