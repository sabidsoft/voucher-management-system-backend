import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ErrorCode } from 'src/common/constants/error-codes';

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.refresh_token as string,
        (req: Request) => (req?.body as { refreshToken?: string })?.refreshToken as string,
      ]),
      secretOrKey: config.getOrThrow('REFRESH_TOKEN_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: { sub: string; sessionId: string; type: string }) {
    if (payload.type !== 'refresh')
      throw new UnauthorizedException({
        message: 'Invalid token type',
        errorCode: ErrorCode.INVALID_TOKEN_TYPE,
      });

    const refreshToken =
      (req.cookies?.refresh_token as string) ||
      (req?.body as { refreshToken?: string })?.refreshToken;

    if (!refreshToken)
      throw new UnauthorizedException({
        message: 'Refresh token not found',
        errorCode: ErrorCode.REFRESH_TOKEN_NOT_FOUND,
      });

    return {
      userId: payload.sub,
      sessionId: payload.sessionId,
      refreshToken,
    };
  }
}