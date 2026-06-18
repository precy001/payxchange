import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { NombaClient } from './nomba/nomba.client';
import { NombaProvider } from './nomba/nomba.provider';
import { NombaTokenService } from './nomba/nomba-token.service';

// The rest of the app injects PAYMENT_PROVIDER and never sees "Nomba". To swap
// providers, bind a different class to PAYMENT_PROVIDER here — nothing else
// changes.

@Module({
  providers: [
    NombaTokenService,
    NombaClient,
    NombaProvider,
    { provide: PAYMENT_PROVIDER, useExisting: NombaProvider },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}