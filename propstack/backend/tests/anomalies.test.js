const {
  request,
  app,
  pool,
  resetDb,
  tokenFor,
  createLeaseFixture,
  createUser,
  closePool,
} = require('./helpers');

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closePool();
});

// Insert a 'paid' payment a given number of days after its (relative) due date.
async function seedPayment(leaseId, amount, daysAgo, paidDaysAfterDue) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() - daysAgo);
  const paidDate = new Date(dueDate);
  paidDate.setDate(dueDate.getDate() + paidDaysAfterDue);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return pool.query(
    `INSERT INTO payments (lease_id, amount, due_date, paid_date, status)
     VALUES ($1, $2, $3, $4, 'paid') RETURNING id`,
    [leaseId, amount, fmt(dueDate), fmt(paidDate)]
  );
}

describe('Payment anomaly detection', () => {
  test('flags a tenant whose latest payment is 15 days late vs a 0-day history', async () => {
    const { owner, tenant, lease } = await createLeaseFixture();

    // 6 prior payments, each paid exactly on the due date (0 days late)
    for (let i = 1; i <= 6; i++) {
      await seedPayment(lease.id, 1000, 31 * i, 0);
    }
    // Most recent payment: due 15 days ago, paid today -> 15 days late
    await seedPayment(lease.id, 1000, 15, 15);

    const res = await request(app)
      .get('/api/reports/anomalies')
      .set('Authorization', `Bearer ${tokenFor(owner)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].tenant_name).toBe(tenant.name);
    expect(res.body.data[0].anomaly_score).toBeCloseTo(15, 1);
    expect(res.body.data[0].reason).toMatch(/15 days late this month vs 0-day average/);
  });

  test('does not flag a tenant who always pays on time', async () => {
    const { owner, lease } = await createLeaseFixture();
    for (let i = 1; i <= 7; i++) {
      await seedPayment(lease.id, 1000, 31 * i, 0);
    }

    const res = await request(app)
      .get('/api/reports/anomalies')
      .set('Authorization', `Bearer ${tokenFor(owner)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  test('anomalies are scoped to the requesting owner only', async () => {
    const { lease } = await createLeaseFixture();
    for (let i = 1; i <= 6; i++) await seedPayment(lease.id, 1000, 31 * i, 0);
    await seedPayment(lease.id, 1000, 15, 15); // provokes an anomaly for fixture owner

    const otherOwner = await createUser('Other Owner', 'other-owner@test.com', 'owner');
    const res = await request(app)
      .get('/api/reports/anomalies')
      .set('Authorization', `Bearer ${tokenFor(otherOwner)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });
});