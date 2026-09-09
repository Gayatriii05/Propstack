const {
  request,
  app,
  pool,
  resetDb,
  createUser,
  tokenFor,
  closePool,
} = require('./helpers');

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closePool();
});

describe('Users API', () => {
  test('owner can list only tenant-role users via ?role=tenant', async () => {
    const owner = await createUser('Owner A', 'ownera@test.com', 'owner');
    await createUser('Tenant One', 'tenant1@test.com', 'tenant');
    await createUser('Tenant Two', 'tenant2@test.com', 'tenant');
    await createUser('Manager X', 'managerx@test.com', 'manager');

    const res = await request(app)
      .get('/api/users?role=tenant')
      .set('Authorization', `Bearer ${tokenFor(owner)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    for (const user of res.body.data) {
      expect(user.role).toBeUndefined();
      expect(user.password_hash).toBeUndefined();
      expect(Object.keys(user).sort()).toEqual(['email', 'id', 'name']);
    }
  });

  test('tenant cannot call the users list (403)', async () => {
    const tenant = await createUser('Tenant One', 'tenanta@test.com', 'tenant');

    const res = await request(app)
      .get('/api/users?role=tenant')
      .set('Authorization', `Bearer ${tokenFor(tenant)}`);

    expect(res.status).toBe(403);
  });

  test('unauthenticated request to users list is rejected (401)', async () => {
    const res = await request(app).get('/api/users?role=tenant');
    expect(res.status).toBe(401);
  });
});