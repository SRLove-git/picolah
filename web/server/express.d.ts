import type { AccountUser } from './auth.ts';

declare global {
  namespace Express {
    interface Request {
      user?: AccountUser;
    }
  }
}

export {};
