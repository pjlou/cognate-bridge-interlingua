import 'dotenv/config';

const DEV_JWT_SECRET = 'cognate-bridge-development-secret';

function requiredInProduction(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be set in production`);
  }
  return fallback;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 3002),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: requiredInProduction('JWT_SECRET', DEV_JWT_SECRET),
  // `as const` matters: jsonwebtoken types expiresIn as a template-literal union, and a
  // widened `string` does not satisfy it.
  jwtExpiresIn: '7d' as const,
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** Google Cloud Text-to-Speech API key. Empty means cloud TTS is off. */
  googleTtsApiKey: process.env.GOOGLE_TTS_API_KEY?.trim() ?? '',
  /** Absolute path to the Piper binary (optional local TTS). */
  piperBin: process.env.PIPER_BIN?.trim() ?? '',
  /** Directory of Piper `.onnx` (+ `.onnx.json`) voice models. */
  piperVoicesDir: process.env.PIPER_VOICES_DIR?.trim() ?? '',
  /**
   * Comma-separated experimental bridge codes to expose in the API (e.g. `fin`).
   * Default empty: Finnish and its Estonian target stay hidden.
   */
  experimentalBridges: (process.env.ENABLE_EXPERIMENTAL_BRIDGES ?? '')
    .split(',')
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean),
};

export function isCloudTtsConfigured(): boolean {
  return Boolean(config.googleTtsApiKey);
}
