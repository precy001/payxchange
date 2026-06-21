// Central, typed configuration. Every env var is read in ONE place and
// validated at boot, so the app fails fast with a clear error instead of
// blowing up mid-transaction with an undefined credential.

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  // 'mock' = deterministic fake provider (build & test with no Nomba calls).
  // 'nomba' = the real adapter using your test/live keys.
  paymentsDriver: 'mock' | 'nomba';
  jwt: {
    secret: string;
  };
  nomba: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    accountId: string;
    webhookSignatureKey: string;
    webhookSigAlgo: string;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const paymentsDriver = (process.env.PAYMENTS_DRIVER ?? 'mock') as 'mock' | 'nomba';
  // Only demand Nomba credentials when we're actually using Nomba. In mock mode
  // you can run the whole app with no Nomba keys at all.
  const need = paymentsDriver === 'nomba' ? required : (n: string) => process.env[n] ?? '';

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    paymentsDriver,
    jwt: {
      // Signs every access/setup token. Must be long and random in production.
      secret: required('JWT_SECRET'),
    },
    nomba: {
      baseUrl: process.env.NOMBA_BASE_URL ?? 'https://api.nomba.com/v1',
      clientId: need('NOMBA_CLIENT_ID'),
      clientSecret: need('NOMBA_CLIENT_SECRET'),
      accountId: need('NOMBA_ACCOUNT_ID'),
      webhookSignatureKey: need('NOMBA_WEBHOOK_SIGNATURE_KEY'),
      webhookSigAlgo: process.env.NOMBA_WEBHOOK_SIG_ALGO ?? 'sha256',
    },
  };
}