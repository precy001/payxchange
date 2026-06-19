import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody:true preserves the exact bytes of incoming requests so we can
  // verify webhook HMAC signatures against the original payload later.
  const app = await NestFactory.create(AppModule, { rawBody: true });

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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`ScanPay backend listening on http://localhost:${port}`);
}
bootstrap();