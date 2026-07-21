import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trim, trimAndToLowerCase } from 'src/common/transformers/string.transformer';

export class BaseUserDto {
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
}
