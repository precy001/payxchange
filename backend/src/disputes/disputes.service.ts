import { ConflictException, Injectable } from '@nestjs/common';
import { DisputesRepository, DisputeRow } from './disputes.repository';
import { TransactionsService } from '../transactions/transactions.service';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class DisputesService {
  constructor(
    private readonly repo: DisputesRepository,
    private readonly txns: TransactionsService,
  ) {}

  private toPublic(d: DisputeRow) {
    return {
      id: d.id,
      transactionId: d.transaction_id,
      reason: d.reason,
      details: d.details,
      status: d.status,
      resolution: d.resolution,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    };
  }

  async create(userId: string, input: { transactionId: string; reason: string; details?: string }) {
    // Ownership check: getById throws if the txn isn't the user's (payer/payee).
    await this.txns.getById(input.transactionId, userId);

    try {
      const row = await this.repo.create({
        userId,
        transactionId: input.transactionId,
        reason: input.reason,
        details: input.details,
      });
      return this.toPublic(row);
    } catch (err: any) {
      if (err?.code === UNIQUE_VIOLATION) {
        throw new ConflictException('You already have an open report for this transaction');
      }
      throw err;
    }
  }

  async getForTransaction(userId: string, transactionId: string) {
    const row = await this.repo.findForTransaction(userId, transactionId);
    return row ? this.toPublic(row) : null;
  }

  async listMine(userId: string) {
    const rows = await this.repo.listByUser(userId);
    return rows.map((r) => this.toPublic(r));
  }

  async updateStatus(id: string, status: string, resolution?: string) {
    const row = await this.repo.updateStatus(id, status, resolution);
    return row ? this.toPublic(row) : null;
  }
}
