import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody:true preserves the exact bytes of incoming requests so we can
  // verify webhook HMAC signatures against the original payload later.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Allow the admin dashboard (served from the marketing site) and local dev to
  // call the API from the browser. The mobile app isn't a browser, so it isn't
  // subject to CORS — this list is only for web origins.
  const allowedOrigins = [
    'https://www.shifaalayn.com.ng',
    'https://shifaalayn.com.ng',
    'https://scanpay-site.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  app.enableCors({
    origin: (origin, cb) => {
      // Non-browser clients (mobile app, curl) send no Origin — always allow.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });

  // Security HTTP headers (defence in depth).
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not in the DTO
      forbidNonWhitelisted: true, // and reject requests that send unexpected ones
      transform: true,
    }),
  );

  // Ensure DB pool + Redis close cleanly on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  // Loud, impossible-to-miss reminder whenever a risky testing flag is left on
  // — especially easy to forget once real money is flowing.
  const bootLogger = new Logger('Bootstrap');
  if (process.env.DEV_OTP === 'true') {
    bootLogger.warn('⚠️  DEV_OTP=true — OTP codes are being returned in API responses. Turn off before public launch.');
  }
  if (process.env.ALLOW_WEBHOOK_SIMULATOR === 'true') {
    bootLogger.warn('⚠️  ALLOW_WEBHOOK_SIMULATOR=true — /webhooks/simulate is open with NO signature check. Turn off before public launch.');
  }
  if (process.env.PAYOUT_MODE === 'simulate') {
    bootLogger.warn('⚠️  PAYOUT_MODE=simulate — payouts are FAKED (no real transfer sent). Do not combine with real card charges.');
  }

const port = process.env.PORT ?? 3000;
await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`ScanPay backend listening on http://localhost:${port}`);
}
bootstrap();