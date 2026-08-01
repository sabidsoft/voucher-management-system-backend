import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import type {
  RequestWithAuthUser,
  RequestWithRefreshUser,
} from './types/auth.types';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import type { Response } from 'express';
import {
  COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
} from './constants/auth.constants';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ResponseMessage('Login successful')
  async login(
    @Req() req: RequestWithAuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = req.ip;
    const deviceInfo = req.headers['user-agent'];

    const { user, accessToken, refreshToken } =
      await this.authService.login(req.user, ipAddress, deviceInfo);

    const isMobile = req.headers['x-client-type'] === 'mobile';

    if (!isMobile) {
      res.cookie(
        REFRESH_TOKEN_COOKIE,
        refreshToken,
        COOKIE_OPTIONS,
      );

      return { user, accessToken };
    }

    return { user, accessToken, refreshToken };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshAuthGuard)
  @ResponseMessage('Token refreshed successfully')
  async refresh(
    @Req() req: RequestWithRefreshUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.refresh(
        req.user.userId,
        req.user.sessionId,
        req.user.refreshToken,
      );

    const isMobile = req.headers['x-client-type'] === 'mobile';

    if (!isMobile) {
      res.cookie(
        REFRESH_TOKEN_COOKIE,
        refreshToken,
        COOKIE_OPTIONS,
      );

      return { accessToken, user };
    }

    return { accessToken, refreshToken, user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshAuthGuard)
  @ResponseMessage('Logout successful')
  async logout(
    @Req() req: RequestWithRefreshUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(
      req.user.userId,
      req.user.sessionId,
    );

    res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);

    return null;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshAuthGuard)
  @ResponseMessage('Logged out from all devices')
  async logoutAll(
    @Req() req: RequestWithRefreshUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(req.user.userId);

    res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);

    return null;
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Devices fetched successfully')
  getMyDevices(@Req() req: RequestWithAuthUser) {
    return this.authService.getActiveSessions(req.user.id);
  }
}