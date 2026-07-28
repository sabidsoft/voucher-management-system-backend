import { Prisma } from 'src/generated/prisma/client';

// Prisma's Decimal fields serialize to strings by default (via
// decimal.js's toJSON) — converting to a plain number here keeps every
// voucher API response consistently numeric for the frontend. Shared
// by both Income and Expense voucher services since neither's amount
// field needs any type-specific handling beyond this conversion.
export function serializeAmount<T extends { amount: Prisma.Decimal }>(
  record: T,
): Omit<T, 'amount'> & { amount: number } {
  return { ...record, amount: Number(record.amount) };
}