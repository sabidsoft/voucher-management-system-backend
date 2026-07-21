import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { CreateUserDto } from '../users/dto/create-user.dto';
import type {
  RequestWithAuthUser,
  RequestWithRefreshUser,
} from './types/auth.types';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import type { Response } from 'express';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';
import { COOKIE_OPTIONS, REFRESH_TOKEN_COOKIE } from './constants/auth.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ResponseMessage('Operator created')
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('login')
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

  @Post('refresh')
  @UseGuards(RefreshAuthGuard)
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
  async getMyDevices(@Req() req: RequestWithAuthUser) {
    return this.authService.getActiveSessions(req.user.id);
  }

  @Get('protected')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Protected route accessed')
  getProtected() {
    return { status: 'ok' };
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getAdminData() {
    return 'Admin only';
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  @Get('manage-orders')
  manageOrders() {
    return 'Admin and Operator';
  }
}