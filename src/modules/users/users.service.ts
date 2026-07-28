import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { GetUsersDto } from './dto/get-users.dto';
import { Prisma } from 'src/generated/prisma/client';
import { Role, Status } from 'src/generated/prisma/enums';
import { hash } from 'argon2';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ErrorCode } from 'src/common/constants/error-codes';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findOneById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
    }

    return { user };
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(createUserDto: CreateUserDto) {
    if (createUserDto.role === Role.ADMIN) {
      throw new ForbiddenException({
        message: 'Admin accounts cannot be created through this endpoint',
        errorCode: ErrorCode.ADMIN_CREATION_FORBIDDEN,
      });
    }

    const existingUser = await this.findByEmail(createUserDto.email);

    if (existingUser) {
      throw new ConflictException({
        message: 'Email already exists',
        errorCode: ErrorCode.EMAIL_ALREADY_EXISTS,
      });
    }

    const hashedPassword = await hash(createUserDto.password);

    const createdUser = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
      select: userSelect,
    });

    return { user: createdUser };
  }

  async findAll(query: GetUsersDto) {
    const { page, limit, search, role, status } = query;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * limit;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: userSelect,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.findById(id);

    if (!user)
      throw new NotFoundException({
        message: 'User not found',
        errorCode: ErrorCode.USER_NOT_FOUND,
      });

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);

      if (existingUser)
        throw new ConflictException({
          message: 'Email already exists',
          errorCode: ErrorCode.EMAIL_ALREADY_EXISTS,
        });
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: userSelect,
    });

    return { user: updatedUser };
  }

  async updateStatus(id: string, updateUserStatusDto: UpdateUserStatusDto) {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status: updateUserStatusDto.status },
      select: userSelect,
    });

    return { user: updatedUser };
  }

  async resetPassword(id: string, resetPasswordDto: ResetPasswordDto) {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
    }

    const hashedPassword = await hash(resetPasswordDto.password);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { password: hashedPassword },
      }),
      this.prisma.session.deleteMany({ where: { userId: id } }),
    ]);

    return null;
  }

  async getStats() {
    const [totalOperators, activeOperators, inactiveOperators] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { role: Role.OPERATOR } }),
      this.prisma.user.count({ where: { role: Role.OPERATOR, status: Status.ACTIVE } }),
      this.prisma.user.count({ where: { role: Role.OPERATOR, status: Status.INACTIVE } }),
    ]);

    return {
      stats: {
        totalOperators,
        activeOperators,
        inactiveOperators,
      },
    };
  }
}