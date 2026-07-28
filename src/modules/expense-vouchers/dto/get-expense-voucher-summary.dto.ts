import { OmitType } from '@nestjs/mapped-types';
import { IsOptional, IsString } from 'class-validator';
import { GetExpenseVouchersDto } from './get-expense-vouchers.dto';

export class GetExpenseVoucherSummaryDto extends OmitType(GetExpenseVouchersDto, [
  'page',
  'limit',
] as const) {
  @IsOptional()
  @IsString()
  download?: string;
}