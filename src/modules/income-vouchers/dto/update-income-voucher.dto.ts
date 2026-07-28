import { PartialType } from '@nestjs/mapped-types';
import { CreateIncomeVoucherDto } from './create-income-voucher.dto';

export class UpdateIncomeVoucherDto extends PartialType(CreateIncomeVoucherDto) {}