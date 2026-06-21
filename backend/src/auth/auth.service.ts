import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { UsersService } from '../users/users.service';
import { UsersRepository } from '../users/users.repository';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { AuthRepository } from './auth.repository';
import { LoginDto, RefreshDto, RegisterDto, SetPinDto, VerifyOtpDto } from './dto/auth.dto';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly usersRepo: UsersRepository,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly authRepo: AuthRepository,
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

    const setupToken = await this.tokens.issueSetupToken(user.id);
    return { message: 'Phone verified', setupToken, nextStep: 'set-pin' };
  }

  async setPin(dto: SetPinDto) {
    const userId = await this.tokens.verifySetupToken(dto.setupToken);
    const pinHash = await argonHash(dto.pin);
    await this.authRepo.upsertPin(userId, pinHash);
    const tokens = await this.tokens.issueAuthTokens(userId);
    return { message: 'PIN set', userId, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findByPhone(dto.phone);
    // Generic failure that never reveals whether the phone is registered.
    const invalid = new UnauthorizedException('Invalid phone or PIN');
    if (!user) throw invalid;

    if (user.deactivated_at) {
      throw new ForbiddenException('This account has been closed');
    }

    try {
      await this.verifyPinOrThrow(user.id, dto.pin);
    } catch (err) {
      // A lockout is fine to surface; everything else is normalized.
      if (err instanceof HttpException && err.getStatus() === 423) throw err;
      throw invalid;
    }

    const tokens = await this.tokens.issueAuthTokens(user.id);
    return { userId: user.id, ...tokens };
  }

  // Change PIN: prove you know the current one, then set a new one. upsertPin
  // also clears any lockout.
  async changePin(userId: string, currentPin: string, newPin: string) {
    await this.verifyPinOrThrow(userId, currentPin);
    if (currentPin === newPin) {
      throw new BadRequestException('New PIN must be different from the current one');
    }
    const pinHash = await argonHash(newPin);
    await this.authRepo.upsertPin(userId, pinHash);
    return { message: 'PIN changed' };
  }

  async refresh(dto: RefreshDto) {
    return this.tokens.rotateRefresh(dto.refreshToken);
  }

  // Verifies a user's PIN with lockout. Used by login AND by payment confirm
  // (step-up authorization). Throws on failure; returns void on success.
  async verifyPinOrThrow(userId: string, pin: string): Promise<void> {
    const creds = await this.authRepo.getCredentials(userId);
    if (!creds) throw new UnauthorizedException('No PIN set for this account');

    if (creds.locked_until && new Date(creds.locked_until) > new Date()) {
      throw new HttpException('Account temporarily locked. Try again later.', 423);
    }

    const ok = await argonVerify(creds.pin_hash, pin);
    if (!ok) {
      const attempts = creds.failed_attempts + 1;
      const lockedUntil =
        attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await this.authRepo.recordFailedAttempt(userId, attempts, lockedUntil);
      throw new UnauthorizedException('Incorrect PIN');
    }

    await this.authRepo.resetAttempts(userId);
  }
}