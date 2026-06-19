import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UsersRepository } from '../users/users.repository';
import { OtpService } from './otp.service';
import { RegisterDto, VerifyOtpDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly usersRepo: UsersRepository,
    private readonly otp: OtpService,
  ) {}

  async register(dto: RegisterDto) {
    try {
      const user = await this.users.register({
        phone: dto.phone,
        email: dto.email,
        fullName: dto.fullName,
      });
      await this.otp.sendCode(dto.phone);
      return { message: 'Verification code sent', userId: user.id };
    } catch (err) {
      // Phone already registered. If they never verified, just resend the code
      // so they can finish. If already verified, tell them to log in.
      if (err instanceof ConflictException) {
        const existing = await this.usersRepo.findByPhone(dto.phone);
        if (existing && !existing.phone_verified) {
          await this.otp.sendCode(dto.phone);
          return { message: 'Verification code sent', userId: existing.id };
        }
        throw new ConflictException('Account already exists — please log in');
      }
      throw err;
    }
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const result = await this.otp.verifyCode(dto.phone, dto.code);
    if (result === 'expired') {
      throw new BadRequestException('Code expired or not found — request a new one');
    }
    if (result === 'too_many') {
      throw new BadRequestException('Too many attempts — request a new code');
    }
    if (result === 'mismatch') {
      throw new BadRequestException('Incorrect code');
    }

    const user = await this.usersRepo.findByPhone(dto.phone);
    if (!user) throw new BadRequestException('No account found for this phone');

    await this.usersRepo.markPhoneVerified(user.id);
    return { message: 'Phone verified', userId: user.id, nextStep: 'set-pin' };
  }
}
