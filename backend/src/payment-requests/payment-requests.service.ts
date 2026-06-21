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

const QR_TTL_SECONDS = 600; // 10 minutes
const FK_VIOLATION = '23503';

@Injectable()
export class PaymentRequestsService {
  constructor(
    private readonly repo: PaymentRequestsRepository,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async create(payeeUserId: string, dto: CreatePaymentRequestDto) {
    const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);

    let row;
    try {
      row = await this.repo.create({
        payeeUserId,
        type: dto.type,
        amountKobo: dto.amountKobo,
        description: dto.description,
        expiresAt,
      });
    } catch (err: any) {
      if (err?.code === FK_VIOLATION) {
        throw new BadRequestException('payeeUserId does not match an existing user');
      }
      throw err;
    }

    const token = crypto.randomBytes(24).toString('base64url');
    await this.redis.set(`qr:${token}`, row.id, 'EX', QR_TTL_SECONDS);

    const deepLink = `payxchange://pay?ref=${token}`;
    const qrImage = await QRCode.toDataURL(deepLink);

    return {
      paymentRequestId: row.id,
      token,
      qr: deepLink,
      qrImage,
      amountKobo: Number(row.amount_kobo),
      currency: row.currency,
      description: row.description,
      expiresAt: row.expires_at,
    };
  }

  async resolve(token: string) {
    const requestId = await this.redis.get(`qr:${token}`);
    if (!requestId) {
      throw new GoneException('This code is invalid or has expired');
    }

    const detail = await this.repo.findDetailById(requestId);
    if (!detail) {
      throw new GoneException('This code is no longer valid');
    }
    if (detail.consumed_at) {
      throw new GoneException('This code has already been used');
    }

    return {
      paymentRequestId: detail.id,
      payeeName: detail.payee_name,
      type: detail.type,
      amountKobo: Number(detail.amount_kobo),
      currency: detail.currency,
      description: detail.description,
      expiresAt: detail.expires_at,
    };
  }
}