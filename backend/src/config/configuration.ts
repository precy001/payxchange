// Central, typed configuration. Every env var is read in ONE place and
// validated at boot, so the app fails fast with a clear error instead of
// blowing up mid-transaction with an undefined credential.

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
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
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    nomba: {
      baseUrl: process.env.NOMBA_BASE_URL ?? 'https://api.nomba.com/v1',
      clientId: required('NOMBA_CLIENT_ID'),
      clientSecret: required('NOMBA_CLIENT_SECRET'),
      accountId: required('NOMBA_ACCOUNT_ID'),
      webhookSignatureKey: required('NOMBA_WEBHOOK_SIGNATURE_KEY'),
      webhookSigAlgo: process.env.NOMBA_WEBHOOK_SIG_ALGO ?? 'sha256',
    },
  };
}