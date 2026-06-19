import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { NombaClient } from './nomba/nomba.client';
import { NombaProvider } from './nomba/nomba.provider';
import { NombaTokenService } from './nomba/nomba-token.service';
import { MockPaymentProvider } from './mock/mock.provider';

// The rest of the app injects PAYMENT_PROVIDER and never sees "Nomba" or "mock".
// The factory below picks the implementation from config (PAYMENTS_DRIVER), so
// switching between the deterministic mock and the real Nomba adapter is a
// single env change — no code edits anywhere else.

@Module({
  providers: [
    NombaTokenService,
    NombaClient,
    NombaProvider,
    MockPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, NombaProvider, MockPaymentProvider],
      useFactory: (
        config: ConfigService,
        nomba: NombaProvider,
        mock: MockPaymentProvider,
      ) => (config.get('paymentsDriver') === 'nomba' ? nomba : mock),
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}