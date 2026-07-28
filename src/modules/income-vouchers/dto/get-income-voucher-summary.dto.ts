import { OmitType } from '@nestjs/mapped-types';
import { IsOptional, IsString } from 'class-validator';
import { GetIncomeVouchersDto } from './get-income-vouchers.dto';

export class GetIncomeVoucherSummaryDto extends OmitType(GetIncomeVouchersDto, [
  'page',
  'limit',
] as const) {
  // Controls Content-Disposition (inline vs attachment) on the
  // response — declared here (rather than read via a separate
  // @Query('download')) so it doesn't trip forbidNonWhitelisted
  // validation when bound together with the rest of this DTO.
  @IsOptional()
  @IsString()
  download?: string;
}