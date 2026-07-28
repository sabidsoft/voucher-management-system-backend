import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';
import { getDhakaTodayDateOnly } from './date-range.util';

// Shared by both Income and Expense voucher services (create + update)
// — a voucher's date must never be later than today's Dhaka calendar
// day. Since `dateStr` maps directly onto a @db.Date column value via
// new Date(dateStr), this is now a plain date comparison — no
// UTC-offset math needed.
export function assertVoucherDateNotFuture(dateStr: string): void {
  const parsed = new Date(dateStr);

  if (parsed.getTime() > getDhakaTodayDateOnly().getTime()) {
    throw new BadRequestException({
      message: 'Voucher date cannot be in the future',
      errorCode: ErrorCode.VOUCHER_DATE_IN_FUTURE,
    });
  }
}