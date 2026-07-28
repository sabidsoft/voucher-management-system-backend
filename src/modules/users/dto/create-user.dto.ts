import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { trim, trimAndToLowerCase } from 'src/common/transformers/string.transformer';
import { Role } from 'src/generated/prisma/enums';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @Transform(trim)
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trimAndToLowerCase)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @IsEnum(Role)
  @IsNotEmpty()
  role!: Role;
}