import { IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { BaseUserDto } from './base-user.dto';
import { Role } from 'src/generated/prisma/enums';

export class CreateUserDto extends BaseUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @IsEnum(Role)
  @IsNotEmpty()
  role!: Role;
}