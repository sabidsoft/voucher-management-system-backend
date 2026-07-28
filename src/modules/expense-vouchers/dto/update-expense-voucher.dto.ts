import { PartialType } from '@nestjs/mapped-types';
import { CreateExpenseVoucherDto } from './create-expense-voucher.dto';

export class UpdateExpenseVoucherDto extends PartialType(CreateExpenseVoucherDto) {}