import { z } from 'zod';

const bool = z.preprocess((v) => (typeof v === 'string' ? ['1', 'true', 'yes'].includes(v.toLowerCase()) : v), z.boolean());

const Env = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  PGLITE_MEMORY: z.string().optional(),
  DEMO_MODE: bool.default(false),
  SEED_ON_START: bool.default(false),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  SESSION_SECRET: z.string().min(16).default('dev-only-session-secret-change-me'),
  BRAND: z.string().default('[YOUR PAYROLL BRAND]'),
  HOLD_HOURS: z.coerce.number().int().positive().default(48),
  CHAIN: z.enum(['mock', 'sepolia', 'ethereum']).default('mock'),
  RPC_URL: z.string().optional(),
  PAYROLL_DISBURSER_ADDRESS: z.string().optional(),
  PAYSLIP_REGISTRY_ADDRESS: z.string().optional(),
  OPERATOR_SIGNER_PRIVATE_KEY: z.string().optional(),
  SWAP_PROVIDER: z.enum(['sample', 'sera']).default('sample'),
  SERA_API_BASE: z.string().default('https://api-testnet.sera.cx/api/v1'),
  SERA_API_KEY: z.string().optional(),
  SERA_API_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().default('payroll@example.com'),
  CHAINALYSIS_API_KEY: z.string().optional(),
  WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(1100),
  WEBHOOK_RETRIES: z.coerce.number().int().min(0).default(3),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Config> = {}): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error('Bad configuration: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return { ...parsed.data, ...overrides };
}
