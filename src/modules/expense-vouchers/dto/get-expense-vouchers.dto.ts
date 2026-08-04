import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { VoucherStatus } from 'src/generated/prisma/enums';

export class GetExpenseVouchersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  // Matches against voucherNumber, expenseHead, or description.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // Only respected for ADMIN requests — the service layer forces this
  // to the requesting user's own id for OPERATOR, regardless of what's
  // passed here.
  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsEnum(VoucherStatus)
  status?: VoucherStatus;
}