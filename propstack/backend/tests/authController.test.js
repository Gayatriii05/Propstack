const { request, app, pool, resetDb, createUser, closePool } = require('./helpers');

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closePool();
});

describe('Auth API', () => {
  test('successful login returns a user and a valid token', async () => {
    await createUser('Aditi Owner', 'owner@propstack.com', 'owner', 'password123');

    const res = await request(app).post('/api/auth/login').send({
      email: 'owner@propstack.com',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('owner@propstack.com');
    expect(res.body.user.role).toBe('owner');
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.token).toBeDefined();

    const payload = require('jsonwebtoken').decode(res.body.token);
    expect(payload.role).toBe('owner');
  });

  test('rejects invalid credentials with 401', async () => {
    await createUser('Aditi Owner', 'owner@propstack.com', 'owner', 'password123');

    const wrongPassword = await request(app).post('/api/auth/login').send({
      email: 'owner@propstack.com',
      password: 'wrong-password',
    });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error).toBe('Invalid credentials');

    const unknownEmail = await request(app).post('/api/auth/login').send({
      email: 'nobody@propstack.com',
      password: 'password123',
    });
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error).toBe('Invalid credentials');
  });

  test('validation rejects a malformed login body with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'not-an-email',
      password: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation failed/);
  });

  test('register creates a user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'New Tenant',
      email: 'new@propstack.com',
      password: 'password123',
      role: 'tenant',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new@propstack.com');
    expect(res.body.user.role).toBe('tenant');
    expect(res.body.token).toBeDefined();
  });

  test('register rejects a duplicate email with 409', async () => {
    await createUser('Aditi Owner', 'owner@propstack.com', 'owner');

    const res = await request(app).post('/api/auth/register').send({
      name: 'Aditi Again',
      email: 'owner@propstack.com',
      password: 'password123',
      role: 'tenant',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already registered');
  });
});