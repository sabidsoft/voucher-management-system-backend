import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { verify } from 'argon2';
import { AuthUser } from '../types/auth.types';
import { Status } from 'src/generated/prisma/enums';
import { ErrorCode } from 'src/common/constants/error-codes';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user)
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        errorCode: ErrorCode.INVALID_CREDENTIALS,
      });

    if (user.status !== Status.ACTIVE)
      throw new ForbiddenException({
        message: `Your account is currently ${user.status?.toLowerCase()}`,
        errorCode: ErrorCode.ACCOUNT_NOT_ACTIVE,
        data: { status: user.status },
      });

    const isPasswordMatched = await verify(user.password, password);

    if (!isPasswordMatched)
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        errorCode: ErrorCode.INVALID_CREDENTIALS,
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