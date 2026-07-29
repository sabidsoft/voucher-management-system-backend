import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { GetUsersDto } from './dto/get-users.dto';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { RequestWithAuthUser } from '../auth/types/auth.types';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  @Roles(Role.ADMIN)
  @ResponseMessage('User created successfully')
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ResponseMessage('Users fetched successfully')
  findAll(@Query() query: GetUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('stats')
  @Roles(Role.ADMIN)
  @ResponseMessage('User statistics fetched successfully')
  getStats() {
    return this.usersService.getStats();
  }

  // ---- Self-service — must come BEFORE @Get(':id')/@Patch(':id'),
  // otherwise "me" gets captured as the :id param and these routes
  // become unreachable (same issue we hit with voucher 'stats'/
  // 'summary-pdf' routes). No @Roles() here deliberately — every
  // authenticated user (ADMIN or OPERATOR) manages their own profile;
  // RolesGuard allows access when no roles are specified. ----

  @Patch('me')
  @ResponseMessage('Profile updated successfully')
  updateMyProfile(@Body() dto: UpdateMyProfileDto, @Req() req: RequestWithAuthUser) {
    return this.usersService.updateMyProfile(req.user.id, dto);
  }

  @Patch('me/password')
  @ResponseMessage('Password changed successfully')
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: RequestWithAuthUser) {
    return this.usersService.changePassword(req.user.id, dto);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ResponseMessage('User fetched successfully')
  findOne(@Param('id') id: string) {
    return this.usersService.findOneById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ResponseMessage('User updated successfully')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ResponseMessage('User status updated successfully')
  updateStatus(
    @Param('id') id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(id, updateUserStatusDto);
  }

  @Patch(':id/reset-password')
  @Roles(Role.ADMIN)
  @ResponseMessage('Password reset successfully')
  resetPassword(
    @Param('id') id: string,
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(id, resetPasswordDto);
  }
}