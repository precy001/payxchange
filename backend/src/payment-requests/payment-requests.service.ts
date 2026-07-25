import {
  BadRequestException,
  GoneException,
  Inject,
  Injectable,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import Redis from 'ioredis';
import { REDIS } from '../infra/redis.module';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { PaymentRequestsRepository } from './payment-requests.repository';
import { PayoutDestinationsRepository } from '../payout-destinations/payout-destinations.repository';

// How long a QR stays valid. Short on purpose: a checkout code shouldn't work
// an hour later. Tune per use case (merchant vs p2p) when we add auth.
const QR_TTL_SECONDS = 600; // 10 minutes (dynamic codes: short on purpose)
// A static code is the payee's permanent "pay me" code (printed, on a counter).
// It carries no amount, is reusable, and shouldn't expire in any practical sense.
const STATIC_TTL_SECONDS = 60 * 60 * 24 * 365 * 5; // 5 years
const FK_VIOLATION = '23503'; // Postgres foreign-key error (e.g., unknown payee)

@Injectable()
export class PaymentRequestsService {
  constructor(
    private readonly repo: PaymentRequestsRepository,
    private readonly payoutDestinations: PayoutDestinationsRepository,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async create(payeeUserId: string, dto: CreatePaymentRequestDto) {
    // You can't receive money without somewhere to send it. Require a saved
    // payout account before generating a QR.
    const dest = await this.payoutDestinations.getDefault(payeeUserId);
    if (!dest) {
      throw new BadRequestException('ADD_PAYOUT_ACCOUNT');
    }

    const isStatic = dto.isStatic === true;
    // A dynamic code must name its amount; a static one must NOT (the payer picks).
    if (!isStatic && (dto.amountKobo == null || dto.amountKobo <= 0)) {
      throw new BadRequestException('amountKobo is required for a dynamic code');
    }

    const ttl = isStatic ? STATIC_TTL_SECONDS : QR_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    let row;
    try {
      row = await this.repo.create({
        payeeUserId,
        type: dto.type,
        amountKobo: isStatic ? null : dto.amountKobo!,
        description: dto.description?.trim() || null,
        expiresAt,
        isStatic,
      });
    } catch (err: any) {
      if (err?.code === FK_VIOLATION) {
        throw new BadRequestException('payeeUserId does not match an existing user');
      }
      throw err;
    }

    // The token is what the QR actually carries: 32 bytes of randomness, so it
    // cannot be guessed. Redis maps it to the request id with a TTL, which is
    // what makes the code single-use-window and auto-expiring.
    const token = crypto.randomBytes(24).toString('base64url');
    await this.redis.set(`qr:${token}`, row.id, 'EX', ttl);

    // What a scanner reads. The mobile app will register this URL scheme; for
    // now you can treat the token itself as the scannable payload.
    const deepLink = `payxchange://pay?ref=${token}`;
    // High error correction (~30% recoverable) so the centered PX logo the app
    // overlays doesn't stop it scanning. Brand-ink modules on white look sleeker
    // than pure black while staying high-contrast.
    const qrImage = await QRCode.toDataURL(deepLink, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 512,
      color: { dark: '#0B1020', light: '#FFFFFF' },
    });

    return {
      paymentRequestId: row.id,
      token,
      qr: deepLink,
      qrImage, // a data:image/png URL — paste it into a browser to see the code
      isStatic,
      amountKobo: row.amount_kobo == null ? null : Number(row.amount_kobo),
      currency: row.currency,
      description: row.description,
      expiresAt: row.expires_at,
    };
  }

  // The payer's app calls this after scanning, to show the amount + payee
  // BEFORE the payer confirms. Read-only: it does NOT consume the token — that
  // happens atomically at charge time, later.
  async resolve(token: string) {
    const requestId = await this.redis.get(`qr:${token}`);
    if (!requestId) {
      throw new GoneException('This code is invalid or has expired');
    }

    const detail = await this.repo.findDetailById(requestId);
    if (!detail) {
      throw new GoneException('This code is no longer valid');
    }
    // A static code is reusable by design, so it's never "already used".
    if (!detail.is_static && detail.consumed_at) {
      throw new GoneException('This code has already been used');
    }

    return {
      paymentRequestId: detail.id,
      payeeName: detail.payee_name,
      type: detail.type,
      isStatic: detail.is_static,
      // NULL for a static code — the payer enters the amount.
      amountKobo: detail.amount_kobo == null ? null : Number(detail.amount_kobo),
      currency: detail.currency,
      description: detail.description,
      expiresAt: detail.expires_at,
    };
  }
}