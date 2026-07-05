import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { NombaClient } from './nomba/nomba.client';
import { NombaProvider } from './nomba/nomba.provider';
import { NombaTokenService } from './nomba/nomba-token.service';
import { PaystackProvider } from './paystack/paystack.provider';
import { MockPaymentProvider } from './mock/mock.provider';

// The rest of the app injects PAYMENT_PROVIDER and never sees a specific
// provider. The factory picks the implementation from PAYMENTS_DRIVER, so
// switching between mock / nomba / paystack is a single env change.

@Module({
  providers: [
    NombaTokenService,
    NombaClient,
    NombaProvider,
    PaystackProvider,
    MockPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, NombaProvider, MockPaymentProvider, PaystackProvider],
      useFactory: (
        config: ConfigService,
        nomba: NombaProvider,
        mock: MockPaymentProvider,
        paystack: PaystackProvider,
      ) => {
        const driver = config.get('paymentsDriver');
        if (driver === 'nomba') return nomba;
        if (driver === 'paystack') return paystack;
        return mock;
      },
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}