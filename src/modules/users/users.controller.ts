import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
