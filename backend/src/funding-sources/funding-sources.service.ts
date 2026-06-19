import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { CreateFundingSourceDto } from './dto/create-funding-source.dto';
import { FundingSourceRow, FundingSourcesRepository } from './funding-sources.repository';

const FK_VIOLATION = '23503';

@Injectable()
export class FundingSourcesService {
  constructor(private readonly repo: FundingSourcesRepository) {}

  async create(dto: CreateFundingSourceDto) {
    // The payer's first card becomes their default automatically.
    const existing = await this.repo.countForUser(dto.userId);
    // A fake token standing in for what Nomba returns after real tokenization.
    const squadRef = `mock_tok_${crypto.randomBytes(8).toString('hex')}`;

    try {
      const row = await this.repo.create({
        userId: dto.userId,
        type: 'card',
        squadRef,
        brand: dto.brand ?? 'mockcard',
        last4: dto.last4 ?? '4242',
        isDefault: existing === 0,
      });
      return this.toPublic(row);
    } catch (err: any) {
      if (err?.code === FK_VIOLATION) {
        throw new BadRequestException('userId does not match an existing user');
      }
      throw err;
    }
  }

  async listByUser(userId: string) {
    const rows = await this.repo.listByUser(userId);
    return rows.map((r) => this.toPublic(r));
  }

  private toPublic(r: FundingSourceRow) {
    return {
      id: r.id,
      userId: r.user_id,
      type: r.type,
      brand: r.brand,
      last4: r.last4,
      status: r.status,
      isDefault: r.is_default,
      createdAt: r.created_at,
      // note: squad_ref (the token) is intentionally NOT returned to clients
    };
  }
}
