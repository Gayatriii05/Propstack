jest.mock('../src/services/ai');
const {
  request,
  app,
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

function pdfBuffer(res) {
  return Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
}

function pdfText(buffer) {
  const s = buffer.toString('latin1');
  const hexes = [...s.matchAll(/<([0-9a-fA-F]{2,})>/g)].map((m) => m[1]);
  return hexes.map((h) => Buffer.from(h, 'hex').toString('latin1')).join('');
}

describe('GET /api/reports/monthly-pdf', () => {
  test('returns a valid PDF with the AI-written summary', async () => {
    const { owner } = await createLeaseFixture();
    ai.generateMonthlySummary.mockResolvedValue('Two properties, steady occupancy, revenue on track.');

    const res = await request(app)
      .get('/api/reports/monthly-pdf')
      .set('Authorization', `Bearer ${tokenFor(owner)}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(pdfBuffer(res).slice(0, 4).toString()).toBe('%PDF');
    expect(pdfText(pdfBuffer(res))).toContain('Two properties, steady occupancy, revenue on track.');
  });

  test('falls back to a generated summary when the AI call fails', async () => {
    const { owner } = await createLeaseFixture();
    ai.generateMonthlySummary.mockRejectedValue(new Error('credit balance too low'));

    const res = await request(app)
      .get('/api/reports/monthly-pdf')
      .set('Authorization', `Bearer ${tokenFor(owner)}`);

    expect(res.status).toBe(200);
    expect(pdfBuffer(res).slice(0, 4).toString()).toBe('%PDF');
    expect(pdfText(pdfBuffer(res))).toContain('automatically generated fallback summary');
  });

  test('tenant is forbidden (403)', async () => {
    const { tenant } = await createLeaseFixture();

    const res = await request(app)
      .get('/api/reports/monthly-pdf')
      .set('Authorization', `Bearer ${tokenFor(tenant)}`);

    expect(res.status).toBe(403);
  });
});