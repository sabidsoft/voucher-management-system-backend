import { Prisma } from 'src/generated/prisma/client';
import { VoucherType } from 'src/generated/prisma/enums';

const VOUCHER_PREFIX: Record<VoucherType, string> = {
  [VoucherType.INC]: 'INVO',
  [VoucherType.EXP]: 'EXVO',
};

export async function generateVoucherNumber(
  tx: Prisma.TransactionClient,
  voucherDate: Date,
  voucherType: VoucherType,
): Promise<string> {
  const year = voucherDate.getUTCFullYear();

  const { sequence } = await tx.voucherSequence.upsert({
    where: {
      voucherType_year: {
        voucherType,
        year,
      },
    },
    update: { sequence: { increment: 1 } },
    create: { voucherType, year, sequence: 1 },
  });

  return `${VOUCHER_PREFIX[voucherType]}-${year}${sequence.toString().padStart(5, '0')}`;
}