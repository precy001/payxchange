import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Pulls the authenticated user's id, which the guard placed on the request
// after verifying the token. This is the trusted identity — never the body.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    return req.user?.userId;
  },
);
