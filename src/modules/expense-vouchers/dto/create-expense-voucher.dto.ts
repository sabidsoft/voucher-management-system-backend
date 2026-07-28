import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { trim } from 'src/common/transformers/string.transformer';

export class CreateExpenseVoucherDto {
  @IsDateString()
  date!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trim)
  expenseHead!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(trim)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trim)
  reference!: string;
}