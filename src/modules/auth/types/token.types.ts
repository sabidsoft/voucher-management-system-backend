import { Role } from "src/generated/prisma/enums";

export type AccessTokenPayload = {
  sub: string;
  role: Role;
  sessionId: string;
  type: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  sessionId: string;
  type: 'refresh';
};