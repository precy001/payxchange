import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RegisterUserDto } from './dto/register-user.dto';
import { UserRow, UsersRepository } from './users.repository';

// What we expose to the outside — note we never leak internal columns we don't
// want clients to see (here it's all safe, but the mapping habit matters once
// rows contain sensitive fields).
export interface PublicUser {
  id: string;
  phone: string;
  email: string | null;
  fullName: string | null;
  kyc: string;
  avatar: string | null;
  frozen: boolean;
  createdAt: string;
}

const UNIQUE_VIOLATION = '23505'; // Postgres error code for a duplicate key

@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  async register(dto: RegisterUserDto): Promise<PublicUser> {
    try {
      const user = await this.repo.createWithAudit({
        phone: dto.phone,
        email: dto.email,
        fullName: dto.fullName,
      });
      return this.toPublic(user);
    } catch (err: any) {
      // The DB's UNIQUE constraint on phone is the real guard against duplicate
      // accounts. We translate its raw error into a clean 409 for the client.
      if (err?.code === UNIQUE_VIOLATION) {
        throw new ConflictException('A user with this phone or email already exists');
      }
      throw err;
    }
  }

  async getById(id: string): Promise<PublicUser> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return this.toPublic(user);
  }

  private toPublic(u: UserRow): PublicUser {
    return {
      id: u.id,
      phone: u.phone,
      email: u.email,
      fullName: u.full_name,
      kyc: u.kyc,
      avatar: u.avatar,
      frozen: u.frozen_at !== null,
      createdAt: u.created_at,
    };
  }
}