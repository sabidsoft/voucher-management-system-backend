import { ConflictException, ForbiddenException, Injectable, UnauthorizedException, } from '@nestjs/common';
import { hash, verify } from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { AuthUser } from './types/auth.types';
import { AccessTokenPayload, RefreshTokenPayload } from './types/token.types';
import { createId } from '@paralleldrive/cuid2';
import { Role } from 'src/generated/prisma/enums';
import { Prisma } from 'src/generated/prisma/client';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Grace period: a token that was rotated away from recently is still
// accepted for this long, and up to this many recent generations are
// remembered — tolerates a burst of rapid page reloads firing overlapping
// /auth/refresh calls without treating any of them as theft.
const REFRESH_GRACE_PERIOD_MS = 30000; // 30 seconds per entry
const REFRESH_HISTORY_MAX_ENTRIES = 10;

interface PreviousHashEntry {
  hash: string;
  expiresAt: string; // ISO string (Json fields can't store Date directly)
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) { }

  async register(createUserDto: CreateUserDto) {
    if (createUserDto.role === Role.ADMIN)
      throw new ForbiddenException('Admin accounts cannot be created through this endpoint');

    const existingUser = await this.usersService.findByEmail(createUserDto.email);
    if (existingUser) throw new ConflictException('Email already exists');

    const hashedPassword = await hash(createUserDto.password);

    const createdUser = await this.usersService.create({
      ...createUserDto,
      password: hashedPassword,
    });

    const { password: _, ...safeUser } = createdUser;
    return safeUser;
  }

  async login(user: AuthUser, ipAddress?: string, deviceInfo?: string) {
    // Pre-generate a single unique ID to map both tokens and the DB record
    const sessionId = createId();

    const accessPayload: AccessTokenPayload = { sub: user.id, role: user.role, sessionId, type: 'access' };
    const refreshPayload: RefreshTokenPayload = { sub: user.id, sessionId, type: 'refresh' };

    // Issue access and refresh tokens concurrently
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

    // Persist session inside a single database round-trip
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        ipAddress,
        deviceInfo,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { user, accessToken, refreshToken };
  }

  async refresh(userId: string, sessionId: string, refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new UnauthorizedException('Session not found');
    if (session.userId !== userId) throw new UnauthorizedException('Invalid session');

    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: sessionId } });
      throw new UnauthorizedException('Session expired');
    }

    const now = new Date();
    const history = (session.previousHashes as unknown as PreviousHashEntry[] | null) ?? [];
    // Drop expired entries up front — keeps the array from growing stale.
    const validHistory = history.filter((entry) => new Date(entry.expiresAt) > now);

    let isRefreshTokenMatched = await verify(session.refreshTokenHash, refreshToken);

    if (!isRefreshTokenMatched) {
      // Doesn't match the CURRENT hash — check whether it matches any
      // recent-enough previous generation before treating this as theft.
      // This tolerates benign races (e.g. rapid page reloads firing
      // overlapping /auth/refresh calls) without wiping every session.
      for (const entry of validHistory) {
        if (await verify(entry.hash, refreshToken)) {
          isRefreshTokenMatched = true;
          break;
        }
      }

      if (!isRefreshTokenMatched) {
        // Doesn't match the current hash OR any recent history entry —
        // this is a genuinely stale/foreign token. Reuse of an
        // already-rotated token signals possible theft, so every
        // active session for this user is revoked, not just this one.
        await this.prisma.session.deleteMany({ where: { userId } });
        throw new UnauthorizedException('Refresh token reuse detected');
      }
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    const accessPayload: AccessTokenPayload = { sub: user.id, role: user.role, sessionId: session.id, type: 'access' };
    const refreshPayload: RefreshTokenPayload = { sub: user.id, sessionId: session.id, type: 'refresh' };

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

    // Push the hash being rotated away from into history, cap the list
    // size so it can't grow unbounded under a long burst of reloads.
    const newHistory: PreviousHashEntry[] = [
      ...validHistory,
      {
        hash: session.refreshTokenHash,
        expiresAt: new Date(Date.now() + REFRESH_GRACE_PERIOD_MS).toISOString(),
      },
    ].slice(-REFRESH_HISTORY_MAX_ENTRIES);

    // Optimistic concurrency control: only update the session if the
    // stored hash still matches the one we just verified. Prevents
    // concurrent refresh calls (e.g. network retries) from silently
    // overwriting each other's token. If lost, the caller (an in-flight
    // request from an already-reloaded-away page) is simply told to
    // retry — harmless, since only the page the user is actually
    // looking at needs its own refresh call to succeed.
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

    if (updateResult.count === 0) {
      throw new UnauthorizedException(
        'Session was refreshed concurrently, please try again',
      );
    }

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  async logout(userId: string, sessionId: string) {
    try {
      await this.prisma.session.delete({
        where: { id: sessionId, userId },
      });
    } catch {
      throw new UnauthorizedException('Session not found or already deleted');
    }
  }

  async logoutAll(userId: string) {
    // Idempotent operation: wipes all sessions and always returns success state safely
    await this.prisma.session.deleteMany({
      where: { userId },
    });
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