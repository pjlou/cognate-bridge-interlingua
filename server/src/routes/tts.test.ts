import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { generateToken } from '../middleware/auth.js';
import * as tts from '../services/tts.js';

const app = createApp();

describe('tts routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/tts/status', () => {
    it('reports cloud and local unavailable by default', async () => {
      vi.spyOn(tts, 'probeLocalTtsAvailable').mockResolvedValue(false);
      const response = await request(app).get('/api/tts/status');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ cloud: false, local: false, available: false });
    });
  });

  describe('POST /api/tts/synthesize', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/tts/synthesize')
        .send({ text: 'domo', bridgeCode: 'ia', ipa: 'ˈdɔmo' });
      expect(response.status).toBe(401);
    });

    it('returns 503 when cloud TTS is not configured', async () => {
      const token = generateToken(1, 'learner@example.com');
      const response = await request(app)
        .post('/api/tts/synthesize')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'domo', bridgeCode: 'ia', ipa: 'ˈdɔmo', engine: 'cloud' });

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ cloud: false });
    });

    it('returns 503 when local TTS is requested but not configured', async () => {
      vi.spyOn(tts, 'probeLocalTtsAvailable').mockResolvedValue(false);
      const token = generateToken(1, 'learner@example.com');
      const response = await request(app)
        .post('/api/tts/synthesize')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'täytyä', bridgeCode: 'fin', engine: 'local' });

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ local: false });
    });

    it('returns audio when cloud TTS is available', async () => {
      vi.spyOn(tts, 'isCloudTtsAvailable').mockReturnValue(true);
      vi.spyOn(tts, 'synthesizeWithCloud').mockResolvedValue(Buffer.from('fake-mp3'));

      const token = generateToken(1, 'learner@example.com');
      const response = await request(app)
        .post('/api/tts/synthesize')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'domo', bridgeCode: 'ia', ipa: 'ˈdɔmo', preferredLang: 'fr' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/audio\/mpeg/);
      expect(response.body).toEqual(Buffer.from('fake-mp3'));
      expect(tts.synthesizeWithCloud).toHaveBeenCalledWith({
        text: 'domo',
        ipa: 'ˈdɔmo',
        bridgeCode: 'ia',
        preferredLang: 'fr',
      });
    });

    it('returns wav audio when local TTS is available', async () => {
      vi.spyOn(tts, 'probeLocalTtsAvailable').mockResolvedValue(true);
      vi.spyOn(tts, 'synthesizeWithLocal').mockResolvedValue(Buffer.from('fake-wav'));

      const token = generateToken(1, 'learner@example.com');
      const response = await request(app)
        .post('/api/tts/synthesize')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'kukka', bridgeCode: 'fin', engine: 'local', preferredLang: 'fi' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/audio\/wav/);
      expect(response.body).toEqual(Buffer.from('fake-wav'));
    });
  });
});
