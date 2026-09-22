const { request, app, pool, resetDb, tokenFor, createUser, createLeaseFixture, createPayment, closePool } = require('./helpers');

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closePool();
});

describe('Payments API', () => {
  test('tenant can mark an unpaid payment as paid', async () => {
    const { tenant, lease } = await createLeaseFixture();
    const payment = await createPayment(lease.id, 1000, '2026-05-01');

    const res = await request(app)
      .patch(`/api/payments/${payment.id}/mark-paid`)
      .set('Authorization', `Bearer ${tokenFor(tenant)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(res.body.paid_date).not.toBeNull();

    const { rows } = await pool.query('SELECT status, paid_date FROM payments WHERE id = $1', [payment.id]);
    expect(rows[0].status).toBe('paid');
  });

  test('tenant cannot view payments on a lease that is not theirs (403)', async () => {
    const { lease } = await createLeaseFixture();
    const otherTenant = await createUser('Other Tenant', 'other@test.com', 'tenant');
    await createPayment(lease.id, 1000, '2026-05-01');

    const res = await request(app)
      .get(`/api/payments/${lease.id}`)
      .set('Authorization', `Bearer ${tokenFor(otherTenant)}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not authorized for this lease');
  });

  test('tenant cannot mark another tenant\'s payment as paid (403)', async () => {
    const { lease } = await createLeaseFixture();
    const payment = await createPayment(lease.id, 1000, '2026-05-01');
    const otherTenant = await createUser('Other Tenant 2', 'other2@test.com', 'tenant');

    const res = await request(app)
      .patch(`/api/payments/${payment.id}/mark-paid`)
      .set('Authorization', `Bearer ${tokenFor(otherTenant)}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not authorized for this lease');

    // no write happened
    const { rows } = await pool.query('SELECT status FROM payments WHERE id = $1', [payment.id]);
    expect(rows[0].status).not.toBe('paid');
  });

  test('manager cannot create a payment on a lease outside their properties (403)', async () => {
    const { lease } = await createLeaseFixture();
    const manager = await createUser('Rogue Manager', 'rogue@test.com', 'manager');

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${tokenFor(manager)}`)
      .send({ lease_id: lease.id, amount: 1000, due_date: '2026-06-01' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not authorized for this lease');

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM payments WHERE lease_id = $1', [lease.id]);
    expect(rows[0].n).toBe(0);
  });

  test('payments list is paginated with page/limit and returns totals', async () => {
    const { tenant, lease } = await createLeaseFixture();
    for (let i = 1; i <= 5; i++) {
      await createPayment(lease.id, 1000, `2026-0${i}-01`);
    }

    const res = await request(app)
      .get(`/api/payments/${lease.id}?page=1&limit=2`)
      .set('Authorization', `Bearer ${tokenFor(tenant)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(2);
    expect(res.body.total).toBe(5);
    expect(res.body.totalPages).toBe(3);
  });

  test('late-fee trigger auto-marks a payment overdue and applies a 5% fee on an overdue update', async () => {
    const { lease } = await createLeaseFixture();
    const payment = await createPayment(lease.id, 1000, '2099-01-01'); // future -> stays pending

    const before = await pool.query('SELECT status, late_fee_applied FROM payments WHERE id = $1', [payment.id]);
    expect(before.rows[0].status).toBe('pending');
    expect(Number(before.rows[0].late_fee_applied)).toBe(0);

    // Simulate the payment becoming overdue (e.g. time passes) — triggers apply_late_fee()
    await pool.query('UPDATE payments SET due_date = $1 WHERE id = $2', ['2020-01-01', payment.id]);

    const after = await pool.query('SELECT status, late_fee_applied FROM payments WHERE id = $1', [payment.id]);
    expect(after.rows[0].status).toBe('overdue');
    expect(Number(after.rows[0].late_fee_applied)).toBeCloseTo(1000 * 0.05, 2); // 50.00

    // A second update must NOT double-apply the fee (guard: late_fee_applied != 0)
    await pool.query('UPDATE payments SET amount = 500 WHERE id = $1', [payment.id]);
    const again = await pool.query('SELECT status, late_fee_applied, amount FROM payments WHERE id = $1', [payment.id]);
    expect(again.rows[0].status).toBe('overdue');
    expect(Number(again.rows[0].late_fee_applied)).toBeCloseTo(50, 2);
  });

  test('late-fee trigger never applies a fee to a paid payment', async () => {
    const { lease } = await createLeaseFixture();
    const payment = await createPayment(lease.id, 1000, '2020-01-01', '2020-01-01'); // paid on time-ish

    const { rows } = await pool.query('SELECT status, late_fee_applied FROM payments WHERE id = $1', [payment.id]);
    expect(rows[0].status).toBe('paid');
    expect(Number(rows[0].late_fee_applied)).toBe(0);
  });

  test('marking an already-paid payment returns it unchanged and does not re-stamp paid_date', async () => {
    const { tenant, lease } = await createLeaseFixture();
    const payment = await createPayment(lease.id, 1000, '2026-05-01', '2026-05-02'); // already paid
    const before = (
      await pool.query('SELECT paid_date FROM payments WHERE id = $1', [payment.id])
    ).rows[0].paid_date.toISOString();

    const res = await request(app)
      .patch(`/api/payments/${payment.id}/mark-paid`)
      .set('Authorization', `Bearer ${tokenFor(tenant)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    // the returned row keeps its original paid_date — no re-stamp to today
    expect(String(res.body.paid_date)).toBe(before);

    const { rows } = await pool.query('SELECT status, paid_date FROM payments WHERE id = $1', [payment.id]);
    expect(rows[0].status).toBe('paid');
    expect(rows[0].paid_date.toISOString()).toBe(before);
  });
});