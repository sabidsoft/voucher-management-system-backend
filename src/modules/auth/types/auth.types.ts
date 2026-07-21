
import type { Request } from 'express';
import { Role } from 'src/generated/prisma/enums';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface RefreshUser {
  userId: string;
  sessionId: string;
  refreshToken: string;
}

export interface RequestWithAuthUser extends Request {
  user: AuthUser;
}

export interface RequestWithRefreshUser extends Request {
  user: RefreshUser;
}