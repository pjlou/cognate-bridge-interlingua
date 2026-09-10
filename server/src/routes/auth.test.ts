import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { hasTestDatabase, migrateTestDatabase, teardown, truncateAll } from '../test/db.js';

const app = createApp();

describe.skipIf(!hasTestDatabase)('auth routes', () => {
  beforeAll(async () => {
    await migrateTestDatabase();
  }, 60_000);

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await teardown();
  });

  describe('GET /health', () => {
    it('reports a reachable database', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'ok', database: 'connected' });
    });
  });

  describe('POST /api/auth/register', () => {
    it('creates an account and returns a usable token', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', password: 'correcthorse' });

      expect(response.status).toBe(201);
      expect(response.body.user).toMatchObject({ email: 'ada@example.com' });
      expect(typeof response.body.token).toBe('string');

      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${response.body.token}`);
      expect(me.status).toBe(200);
      expect(me.body.email).toBe('ada@example.com');
    });

    it('never returns the password hash', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', password: 'correcthorse' });
      expect(JSON.stringify(response.body)).not.toContain('$2b$');
      expect(response.body.user.password_hash).toBeUndefined();
    });

    it('rejects a duplicate email regardless of casing', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', password: 'correcthorse' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ADA@example.com', password: 'correcthorse' });

      expect(response.status).toBe(409);
    });

    it('rejects a short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', password: 'short' });
      expect(response.status).toBe(400);
    });

    it('rejects a malformed email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'correcthorse' });
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', password: 'correcthorse' });
    });

    it('signs in with the right password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: 'correcthorse' });
      expect(response.status).toBe(200);
      expect(typeof response.body.token).toBe('string');
    });

    it('is case-insensitive on the email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ADA@example.com', password: 'correcthorse' });
      expect(response.status).toBe(200);
    });

    it('gives the same answer for a wrong password and an unknown account', async () => {
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: 'wrongpassword' });
      const unknownUser = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'correcthorse' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownUser.status).toBe(401);
      expect(wrongPassword.body.error).toBe(unknownUser.body.error);
    });
  });

  describe('GET /api/auth/me', () => {
    it('requires a token', async () => {
      expect((await request(app).get('/api/auth/me')).status).toBe(401);
    });

    it('rejects a malformed token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not-a-real-token');
      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/auth/me', () => {
    it('stores Germanic and Romance priority target languages', async () => {
      const registered = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', password: 'correcthorse' });
      const token = registered.body.token as string;

      const { query } = await import('../db.js');
      const germanic = await query<{ id: number }>(
        `INSERT INTO target_languages (code, name, family)
         VALUES ('de', 'German', 'Germanic')
         RETURNING id`,
      );
      const romance = await query<{ id: number }>(
        `INSERT INTO target_languages (code, name, family)
         VALUES ('fr', 'French', 'Romance')
         RETURNING id`,
      );

      const patched = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          priority_germanic_target_language_id: germanic[0]!.id,
          priority_romance_target_language_id: romance[0]!.id,
        });
      expect(patched.status).toBe(200);
      expect(patched.body.priority_germanic_target_language_id).toBe(germanic[0]!.id);
      expect(patched.body.priority_romance_target_language_id).toBe(romance[0]!.id);

      const cleared = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          priority_germanic_target_language_id: null,
          priority_romance_target_language_id: null,
        });
      expect(cleared.body.priority_germanic_target_language_id).toBeNull();
      expect(cleared.body.priority_romance_target_language_id).toBeNull();
    });

    it('rejects an empty patch body', async () => {
      const registered = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', password: 'correcthorse' });

      const response = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${registered.body.token}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/auth/me/data', () => {
    it('clears progress preferences and keeps the account', async () => {
      const registered = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', password: 'correcthorse' });
      const token = registered.body.token as string;

      const { query } = await import('../db.js');
      const germanic = await query<{ id: number }>(
        `INSERT INTO target_languages (code, name, family)
         VALUES ('de', 'German', 'Germanic')
         RETURNING id`,
      );

      await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ priority_germanic_target_language_id: germanic[0]!.id });

      const response = await request(app)
        .delete('/api/auth/me/data')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user.priority_germanic_target_language_id).toBeNull();
      expect(response.body.user.priority_romance_target_language_id).toBeNull();

      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(200);
      expect(me.body.email).toBe('ada@example.com');
    });
  });
});
