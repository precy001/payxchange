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
  paymentsDriver: 'mock' | 'nomba' | 'paystack';
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
  paystack: {
    baseUrl: string;
    secretKey: string;
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
  const paymentsDriver = (process.env.PAYMENTS_DRIVER ?? 'mock') as 'mock' | 'nomba' | 'paystack';
  const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  // Demand Nomba credentials only in PRODUCTION with the nomba driver. In dev we
  // run against the no-signup sandbox (https://sandbox.nomba.com), which needs
  // no keys at all — so missing creds are fine and the client runs no-auth.
  const need = paymentsDriver === 'nomba' && isProd ? required : (n: string) => process.env[n] ?? '';

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
      baseUrl: process.env.NOMBA_BASE_URL ?? 'https://sandbox.nomba.com',
      clientId: need('NOMBA_CLIENT_ID'),
      clientSecret: need('NOMBA_CLIENT_SECRET'),
      accountId: need('NOMBA_ACCOUNT_ID'),
      webhookSignatureKey: need('NOMBA_WEBHOOK_SIGNATURE_KEY'),
      webhookSigAlgo: process.env.NOMBA_WEBHOOK_SIG_ALGO ?? 'sha256',
    },
    paystack: {
      baseUrl: process.env.PAYSTACK_BASE_URL ?? 'https://api.paystack.co',
      // Paystack always needs the secret key (no no-auth mode). Require it when
      // the paystack driver is selected. It's also the webhook signing key.
      secretKey:
        paymentsDriver === 'paystack'
          ? required('PAYSTACK_SECRET_KEY')
          : process.env.PAYSTACK_SECRET_KEY ?? '',
    },
  };
}