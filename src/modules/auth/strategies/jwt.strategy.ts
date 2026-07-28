import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { AuthUser } from '../types/auth.types';
import { Status } from 'src/generated/prisma/enums';
import { ErrorCode } from 'src/common/constants/error-codes';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: { sub: string; type: string }) {
    if (payload.type !== 'access')
      throw new UnauthorizedException({
        message: 'Invalid token type',
        errorCode: ErrorCode.INVALID_TOKEN_TYPE,
      });

    const user = await this.usersService.findById(payload.sub);

    if (!user)
      throw new UnauthorizedException({
        message: 'User not found',
        errorCode: ErrorCode.USER_NOT_FOUND,
      });

    if (user.status !== Status.ACTIVE)
      throw new ForbiddenException({
        message: `Your account is currently ${user.status?.toLowerCase()}`,
        errorCode: ErrorCode.ACCOUNT_NOT_ACTIVE,
        data: { status: user.status },
      });

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };

    return authUser;
  }
}