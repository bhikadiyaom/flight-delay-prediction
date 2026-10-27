import 'dotenv/config';
import { z } from 'zod';

const bool = (def) => z.enum(['true', 'false']).default(def).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(14).default(12),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  ML_INTERNAL_KEY: z.string().min(16, 'ML_INTERNAL_KEY must be at least 16 characters'),
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  AVIATIONSTACK_KEY: z.string().default(''),
  AVIATIONSTACK_MONTHLY_LIMIT: z.coerce.number().int().positive().default(100),
  AVIATIONSTACK_BASE_URL: z.string().url().default('http://api.aviationstack.com/v1'),
  OPEN_METEO_BASE_URL: z.string().url().default('https://api.open-meteo.com/v1'),
  OPEN_METEO_ARCHIVE_URL: z.string().url().default('https://archive-api.open-meteo.com/v1'),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  ADMIN_EMAILS: z.string().default(''),

  RATE_LIMIT_ANON: z.coerce.number().int().positive().default(30), // predictions / 15 min, anonymous
  RATE_LIMIT_USER: z.coerce.number().int().positive().default(120), // predictions / 15 min, logged in
  RATE_LIMIT_GLOBAL: z.coerce.number().int().positive().default(600), // any request / 15 min / client
  RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(20), // login+register / 15 min / ip

  ALERTS_ENABLED: bool('true'),
  ALERTS_CRON: z.string().default('*/30 * * * *'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('Flight Delay Predictor <no-reply@localhost>'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Missing or invalid env:\n${lines.join('\n')}\nCopy server/.env.example to server/.env and fill it in.`);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  adminEmails: parsed.data.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  clientOrigins: parsed.data.CLIENT_URL.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
};
