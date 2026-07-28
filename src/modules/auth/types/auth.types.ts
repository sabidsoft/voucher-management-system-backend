import type { Request } from 'express';
import { Role, Status } from 'src/generated/prisma/enums';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
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