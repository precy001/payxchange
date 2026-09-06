import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Protects /admin/* data routes. Requires a Bearer token whose payload was
// issued by AdminService.login (typ === 'admin'). Separate from the user auth
// guard entirely — admins are not app users.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Admin authentication required');
    try {
      const payload = await this.jwt.verifyAsync(header.slice(7));
      if (payload?.typ !== 'admin') throw new Error('not an admin token');
      req.admin = { username: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired admin token');
    }
  }
}
