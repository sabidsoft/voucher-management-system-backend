import type { CookieOptions } from 'express';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

const isProd = process.env.NODE_ENV === 'production';

// Set COOKIE_SAME_SITE=none when the API and frontend live on different
// registrable domains (e.g. Vercel + Railway). Browsers require Secure with None.
const sameSite = (process.env.COOKIE_SAME_SITE ??
  (isProd ? 'lax' : 'strict')) as 'strict' | 'lax' | 'none';

export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProd || sameSite === 'none',
  sameSite,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};