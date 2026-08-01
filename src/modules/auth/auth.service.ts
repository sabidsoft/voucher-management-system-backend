import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { AuthUser } from './types/auth.types';
import { AccessTokenPayload, RefreshTokenPayload } from './types/token.types';
import { createId } from '@paralleldrive/cuid2';
import { Status } from 'src/generated/prisma/enums';
import { Prisma } from 'src/generated/prisma/client';
import { ErrorCode } from 'src/common/constants/error-codes';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_GRACE_PERIOD_MS = 30000;
const REFRESH_HISTORY_MAX_ENTRIES = 10;

interface PreviousHashEntry {
  hash: string;
  expiresAt: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) { }

  async login(user: AuthUser, ipAddress?: string, deviceInfo?: string) {
    const sessionId = createId();

    const accessPayload: AccessTokenPayload = { sub: user.id, role: user.role, sessionId, type: 'access' };
    const refreshPayload: RefreshTokenPayload = { sub: user.id, sessionId, type: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.getOrThrow('JWT_SECRET'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.getOrThrow('REFRESH_TOKEN_SECRET'),
        expiresIn: '7d',
      }),
    ]);

    const refreshTokenHash = await hash(refreshToken);
    const loginTime = new Date();

    await Promise.all([
      this.prisma.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          refreshTokenHash,
          ipAddress,
          deviceInfo,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: loginTime },
      }),
    ]);

    // `user` here still carries the OLD lastLoginAt (read by
    // LocalStrategy before this update ran) — override it with the
    // fresh timestamp we just wrote, so the response reflects this
    // login's actual moment rather than the previous one.
    return { user: { ...user, lastLoginAt: loginTime }, accessToken, refreshToken };
  }

  // async refresh(userId: string, sessionId: string, refreshToken: string) {
  //   const session = await this.prisma.session.findUnique({
  //     where: { id: sessionId },
  //   });

  //   if (!session)
  //     throw new UnauthorizedException({
  //       message: 'Session not found',
  //       errorCode: ErrorCode.SESSION_NOT_FOUND,
  //     });

  //   if (session.userId !== userId)
  //     throw new UnauthorizedException({
  //       message: 'Invalid session',
  //       errorCode: ErrorCode.INVALID_SESSION,
  //     });

  //   if (session.expiresAt < new Date()) {
  //     await this.prisma.session.delete({ where: { id: sessionId } });
  //     throw new UnauthorizedException({
  //       message: 'Session expired',
  //       errorCode: ErrorCode.SESSION_EXPIRED,
  //     });
  //   }

  //   const now = new Date();
  //   const history = (session.previousHashes as unknown as PreviousHashEntry[] | null) ?? [];
  //   const validHistory = history.filter((entry) => new Date(entry.expiresAt) > now);

  //   let isRefreshTokenMatched = await verify(session.refreshTokenHash, refreshToken);

  //   if (!isRefreshTokenMatched) {
  //     for (const entry of validHistory) {
  //       if (await verify(entry.hash, refreshToken)) {
  //         isRefreshTokenMatched = true;
  //         break;
  //       }
  //     }

  //     if (!isRefreshTokenMatched) {
  //       await this.prisma.session.deleteMany({ where: { userId } });
  //       throw new UnauthorizedException({
  //         message: 'Refresh token reuse detected',
  //         errorCode: ErrorCode.REFRESH_TOKEN_REUSE_DETECTED,
  //       });
  //     }
  //   }

  //   const user = await this.usersService.findById(userId);
  //   if (!user)
  //     throw new UnauthorizedException({
  //       message: 'User not found',
  //       errorCode: ErrorCode.USER_NOT_FOUND,
  //     });

  //   if (user.status !== Status.ACTIVE)
  //     throw new ForbiddenException({
  //       message: `Your account is currently ${user.status?.toLowerCase()}`,
  //       errorCode: ErrorCode.ACCOUNT_NOT_ACTIVE,
  //       data: { status: user.status },
  //     });

  //   const accessPayload: AccessTokenPayload = { sub: user.id, role: user.role, sessionId: session.id, type: 'access' };
  //   const refreshPayload: RefreshTokenPayload = { sub: user.id, sessionId: session.id, type: 'refresh' };

  //   const [accessToken, newRefreshToken] = await Promise.all([
  //     this.jwtService.signAsync(accessPayload, {
  //       secret: this.config.getOrThrow('JWT_SECRET'),
  //       expiresIn: '15m',
  //     }),
  //     this.jwtService.signAsync(refreshPayload, {
  //       secret: this.config.getOrThrow('REFRESH_TOKEN_SECRET'),
  //       expiresIn: '7d',
  //     }),
  //   ]);

  //   const refreshTokenHash = await hash(newRefreshToken);

  //   const newHistory: PreviousHashEntry[] = [
  //     ...validHistory,
  //     {
  //       hash: session.refreshTokenHash,
  //       expiresAt: new Date(Date.now() + REFRESH_GRACE_PERIOD_MS).toISOString(),
  //     },
  //   ].slice(-REFRESH_HISTORY_MAX_ENTRIES);

  //   const updateResult = await this.prisma.session.updateMany({
  //     where: {
  //       id: sessionId,
  //       refreshTokenHash: session.refreshTokenHash,
  //     },
  //     data: {
  //       refreshTokenHash,
  //       previousHashes: newHistory as unknown as Prisma.InputJsonValue,
  //       expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  //     },
  //   });

  //   if (updateResult.count === 0) {
  //     throw new UnauthorizedException({
  //       message: 'Session was refreshed concurrently, please try again',
  //       errorCode: ErrorCode.SESSION_REFRESH_CONFLICT,
  //     });
  //   }

  //   return {
  //     accessToken,
  //     refreshToken: newRefreshToken,
  //     user: {
  //       id: user.id,
  //       name: user.name,
  //       email: user.email,
  //       role: user.role,
  //       status: user.status,
  //       createdAt: user.createdAt,
  //       updatedAt: user.updatedAt,
  //       lastLoginAt: user.lastLoginAt,
  //     },
  //   };
  // }

  async refresh(userId: string, sessionId: string, refreshToken: string) {
  const session = await this.prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session)
    throw new UnauthorizedException({
      message: 'Session not found',
      errorCode: ErrorCode.SESSION_NOT_FOUND,
    });

  // The token carries its own userId, so make sure it actually belongs to
  // this session — otherwise a valid token could be used against another.
  if (session.userId !== userId)
    throw new UnauthorizedException({
      message: 'Invalid session',
      errorCode: ErrorCode.INVALID_SESSION,
    });

  if (session.expiresAt < new Date()) {
    await this.prisma.session.delete({ where: { id: sessionId } });
    throw new UnauthorizedException({
      message: 'Session expired',
      errorCode: ErrorCode.SESSION_EXPIRED,
    });
  }

  const now = new Date();

  // Recently rotated hashes are kept for a short grace period so that a
  // request already in flight when rotation happened is not rejected.
  const history =
    (session.previousHashes as unknown as PreviousHashEntry[] | null) ?? [];
  const validHistory = history.filter(
    (entry) => new Date(entry.expiresAt) > now,
  );

  let isRefreshTokenMatched = await verify(
    session.refreshTokenHash,
    refreshToken,
  );

  if (!isRefreshTokenMatched) {
    for (const entry of validHistory) {
      if (await verify(entry.hash, refreshToken)) {
        isRefreshTokenMatched = true;
        break;
      }
    }

    // Matching neither the current hash nor a recent one means the token is
    // stale or stolen. Drop every session for this user as a precaution.
    if (!isRefreshTokenMatched) {
      await this.prisma.session.deleteMany({ where: { userId } });
      throw new UnauthorizedException({
        message: 'Refresh token reuse detected',
        errorCode: ErrorCode.REFRESH_TOKEN_REUSE_DETECTED,
      });
    }
  }

  const user = await this.usersService.findById(userId);
  if (!user)
    throw new UnauthorizedException({
      message: 'User not found',
      errorCode: ErrorCode.USER_NOT_FOUND,
    });

  // Status is re-checked on every refresh so a deactivated account loses
  // access as soon as its current access token expires.
  if (user.status !== Status.ACTIVE)
    throw new ForbiddenException({
      message: `Your account is currently ${user.status?.toLowerCase()}`,
      errorCode: ErrorCode.ACCOUNT_NOT_ACTIVE,
      data: { status: user.status },
    });

  const accessPayload: AccessTokenPayload = {
    sub: user.id,
    role: user.role,
    sessionId: session.id,
    type: 'access',
  };
  const refreshPayload: RefreshTokenPayload = {
    sub: user.id,
    sessionId: session.id,
    type: 'refresh',
  };

  const [accessToken, newRefreshToken] = await Promise.all([
    this.jwtService.signAsync(accessPayload, {
      secret: this.config.getOrThrow('JWT_SECRET'),
      expiresIn: '15m',
    }),
    this.jwtService.signAsync(refreshPayload, {
      secret: this.config.getOrThrow('REFRESH_TOKEN_SECRET'),
      expiresIn: '7d',
    }),
  ]);

  const refreshTokenHash = await hash(newRefreshToken);

  const newHistory: PreviousHashEntry[] = [
    ...validHistory,
    {
      hash: session.refreshTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_GRACE_PERIOD_MS).toISOString(),
    },
  ].slice(-REFRESH_HISTORY_MAX_ENTRIES);

  // Matching on the hash we read earlier makes this a compare-and-swap:
  // if another request rotated the session in the meantime, count is 0
  // and this request must not overwrite the newer token.
  const updateResult = await this.prisma.session.updateMany({
    where: {
      id: sessionId,
      refreshTokenHash: session.refreshTokenHash,
    },
    data: {
      refreshTokenHash,
      previousHashes: newHistory as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  // A lost race is not an authentication failure — the session is still
  // valid, this particular request simply arrived second. 409 tells the
  // client to retry instead of logging the user out, which is what a 401
  // would trigger. The grace period above lets the retry succeed.
  if (updateResult.count === 0) {
    throw new ConflictException({
      message: 'Session was refreshed concurrently, please try again',
      errorCode: ErrorCode.SESSION_REFRESH_CONFLICT,
    });
  }

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
    },
  };
}

  async logout(userId: string, sessionId: string) {
    try {
      await this.prisma.session.delete({
        where: { id: sessionId, userId },
      });
    } catch {
      throw new UnauthorizedException({
        message: 'Session not found or already deleted',
        errorCode: ErrorCode.SESSION_NOT_FOUND,
      });
    }
  }

  async logoutAll(userId: string) {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async getActiveSessions(userId: string) {
    return this.prisma.session.findMany({
      where: {
        userId: userId,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}