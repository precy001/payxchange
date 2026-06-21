import { SetMetadata } from '@nestjs/common';

// Mark a controller or route as open (no token needed) — e.g. login/register.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
