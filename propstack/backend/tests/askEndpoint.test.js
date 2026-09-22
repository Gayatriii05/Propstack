// Mock the AI service BEFORE anything requires reportController.
// The mock replaces only the LLM call — the DB layer stays real so the
// endpoint-to-denylist-to-read-only-connection pipeline is tested honestly.
jest.mock('../src/services/ai');
const { validateGeneratedSql } = require('../src/utils/sqlGuard');
const {
  request,
  app,
  pool,
  resetDb,
  tokenFor,
  createLeaseFixture,
  closePool,
} = require('./helpers');
const ai = require('../src/services/ai');

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
});

afterAll(async () => {
  await closePool();
});

// -------------------------------------------------------------------
// Unit tests: the denylist / scope validator runs without hitting the
// Anthropic API or the database.
// -------------------------------------------------------------------
describe('validateGeneratedSql (unit)', () => {
  const validScoped = "SELECT u.unit_number FROM units u JOIN properties p ON p.id = u.property_id WHERE p.owner_id = $1";

  test('accepts a properly scoped read-only SELECT', () => {
    expect(validateGeneratedSql(validScoped).ok).toBe(true);
  });

  test('rejects a statement not starting with SELECT', () => {
    const r = validateGeneratedSql('  EXPLAIN SELECT 1 WHERE owner_id = $1');
    expect(r.ok).toBe(false);
  });

  test('rejects forbidden keywords wherever they appear', () => {
    for (const sql of [
      'DELETE FROM leases WHERE owner_id = $1',
      'UPDATE leases SET status = $2 WHERE owner_id = $1',
      'INSERT INTO leases (unit_id) VALUES (1)',
      'ALTER TABLE leases ADD COLUMN x int',
      'TRUNCATE leases',
      'SELECT * FROM leases; DROP TABLE leases',
      'SELECT 1 WHERE owner_id = $1 UNION SELECT * FROM users',
    ]) {
      expect(validateGeneratedSql(sql).ok).toBe(false);
    }
  });

  test('rejects multi-statement SQL', () => {
    expect(validateGeneratedSql('SELECT 1 WHERE owner_id = $1; SELECT 2').ok).toBe(false);
  });

  test('rejects comments in SQL', () => {
    expect(validateGeneratedSql('SELECT 1 -- owner_id = $1').ok).toBe(false);
    expect(validateGeneratedSql('SELECT 1 /* owner_id = $1 */').ok).toBe(false);
  });

  test('rejects queries not scoped to owner_id = $1', () => {
    expect(validateGeneratedSql('SELECT * FROM leases').ok).toBe(false);
    expect(validateGeneratedSql('SELECT * FROM properties WHERE name = $1').ok).toBe(false);
  });
});

// -------------------------------------------------------------------
// Endpoint tests: the mock replaces only the LLM; the denylist,
// read-only transaction, and DB are all exercised for real.
// -------------------------------------------------------------------
describe('POST /api/reports/ask', () => {
  test('returns 400 when question is missing', async () => {
    const { owner } = await createLeaseFixture();
    const res = await request(app)
      .post('/api/reports/ask')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('question is required');
  });

  test('LLM returning DELETE is refused before touching the DB', async () => {
    const { owner, lease } = await createLeaseFixture();
    ai.generateSql.mockResolvedValue('DELETE FROM leases WHERE 1 = 1');

    const res = await request(app)
      .post('/api/reports/ask')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ question: 'delete all my leases' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rejected/i);
    // the lease must still exist
    const { rows } = await pool.query('SELECT id FROM leases WHERE id = $1', [lease.id]);
    expect(rows).toHaveLength(1);
  });

  test('LLM returning unscoped SQL is refused', async () => {
    const { owner } = await createLeaseFixture();
    ai.generateSql.mockResolvedValue('SELECT * FROM leases');

    const res = await request(app)
      .post('/api/reports/ask')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ question: 'show me all leases' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scoped/i);
  });

  test('valid scoped SQL executes on the read-only connection and returns results', async () => {
    const { owner, property } = await createLeaseFixture();
    ai.generateSql.mockResolvedValue(
      "SELECT id, name FROM properties p WHERE p.owner_id = $1 ORDER BY name"
    );

    const res = await request(app)
      .post('/api/reports/ask')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ question: 'list my properties' });

    expect(res.status).toBe(200);
    expect(res.body.sql).toMatch(/^SELECT\b/i);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: property.name })])
    );
  });

  // -------------------------------------------------------------------
  // Offline degradation: when the LLM provider is unreachable (billing,
  // network, missing key), the deterministic local router answers instead.
  // -------------------------------------------------------------------
  describe('offline fallback (no AI provider)', () => {
    test('answers a known question with deterministic SQL when the AI fails', async () => {
      const { owner } = await createLeaseFixture();
      ai.generateSql.mockRejectedValue(
        new Error('Your credit balance is too low to access the Anthropic API.')
      );

      const res = await request(app)
        .post('/api/reports/ask')
        .set('Authorization', `Bearer ${tokenFor(owner)}`)
        .send({ question: 'how many units are occupied' });

      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('fallback');
      expect(res.body.sql).toMatch(/owner_id\s*=\s*\$1/i);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('returns a generic 500 (with no provider detail leak) for unknown questions', async () => {
      const { owner } = await createLeaseFixture();
      ai.generateSql.mockRejectedValue(
        new Error('Your credit balance is too low to access the Anthropic API.')
      );

      const res = await request(app)
        .post('/api/reports/ask')
        .set('Authorization', `Bearer ${tokenFor(owner)}`)
        .send({ question: 'tell me the meaning of life' });

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/could not answer/i);
      expect(res.body.detail).toBeUndefined();
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('credit balance');
    });
  });
});