import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { CreateExpenseVoucherDto } from './dto/create-expense-voucher.dto';
import { UpdateExpenseVoucherDto } from './dto/update-expense-voucher.dto';
import { GetExpenseVouchersDto } from './dto/get-expense-vouchers.dto';
import { GetExpenseVoucherSummaryDto } from './dto/get-expense-voucher-summary.dto';
import { Prisma } from 'src/generated/prisma/client';
import { Role, VoucherType } from 'src/generated/prisma/enums';
import { ErrorCode } from 'src/common/constants/error-codes';
import { getDhakaTodayDateOnly } from 'src/common/utils/date-range.util';
import { serializeAmount } from 'src/common/utils/serialize-decimal.util';
import { generateVoucherNumber } from 'src/common/utils/voucher-number.util';
import { assertVoucherDateNotFuture } from 'src/common/utils/voucher-date.util';
import { PdfService } from 'src/infrastructure/pdf/pdf.service';
import { buildVoucherPdfHtml } from 'src/infrastructure/pdf/templates/voucher-pdf.template';
import { buildSummaryPdfHtml } from 'src/infrastructure/pdf/templates/summary-pdf.template';
import { LOGO_DATA_URI } from 'src/infrastructure/pdf/assets/logo';

const expenseVoucherSelect = {
  id: true,
  voucherNumber: true,
  date: true,
  amount: true,
  expenseHead: true,
  description: true,
  reference: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.ExpenseVoucherSelect;

type ExpenseVoucherWithCreatedBy = Prisma.ExpenseVoucherGetPayload<{
  select: typeof expenseVoucherSelect;
}>;

type RequestingUser = { id: string; role: Role };

// Same green accent color used by Income Voucher's PDF (sampled from
// the national seal logo) — both voucher types share this color in
// their PDF documents.
const EXPENSE_ACCENT_COLOR = '#007A43';

@Injectable()
export class ExpenseVouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  async create(dto: CreateExpenseVoucherDto, userId: string) {
    assertVoucherDateNotFuture(dto.date);

    // Since `date` is a @db.Date column (no time/timezone component),
    // new Date(dto.date) maps unambiguously onto it — no Dhaka-offset
    // math needed.
    const voucherDate = new Date(dto.date);

    const voucher = await this.prisma.$transaction(async (tx) => {
      const voucherNumber = await generateVoucherNumber(tx, voucherDate, VoucherType.EXP);

      return tx.expenseVoucher.create({
        data: {
          voucherNumber,
          date: voucherDate,
          amount: dto.amount,
          expenseHead: dto.expenseHead,
          description: dto.description,
          reference: dto.reference,
          createdById: userId,
        },
        select: expenseVoucherSelect,
      });
    });

    return { voucher: serializeAmount(voucher) };
  }

  async findAll(query: GetExpenseVouchersDto, requestingUser: RequestingUser) {
    const { page, limit, search, dateFrom, dateTo, createdById } = query;

    const where: Prisma.ExpenseVoucherWhereInput = {};

    if (requestingUser.role === Role.OPERATOR) {
      where.createdById = requestingUser.id;
    } else if (createdById) {
      where.createdById = createdById;
    }

    if (search) {
      where.OR = [
        { voucherNumber: { contains: search, mode: 'insensitive' } },
        { expenseHead: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }

    const skip = (page - 1) * limit;

    const [vouchers, aggregateResult] = await this.prisma.$transaction([
      this.prisma.expenseVoucher.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'desc' }, { voucherNumber: 'desc' }],
        select: expenseVoucherSelect,
      }),
      this.prisma.expenseVoucher.aggregate({
        where,
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    const total = aggregateResult._count;

    return {
      vouchers: vouchers.map((v) => serializeAmount(v)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        totalAmount: Number(aggregateResult._sum.amount ?? 0),
      },
    };
  }

  async findOne(id: string, requestingUser: RequestingUser) {
    const voucher = await this.findVoucherOrThrow(id);

    if (
      requestingUser.role === Role.OPERATOR &&
      voucher.createdBy.id !== requestingUser.id
    ) {
      throw new ForbiddenException({
        message: 'You do not have access to this voucher',
        errorCode: ErrorCode.FORBIDDEN,
      });
    }

    return { voucher: serializeAmount(voucher) };
  }

  // ADMIN-only at the controller/guard level.
  async update(id: string, dto: UpdateExpenseVoucherDto) {
    await this.findVoucherOrThrow(id);

    if (dto.date !== undefined) {
      assertVoucherDateNotFuture(dto.date);
    }

    const voucher = await this.prisma.expenseVoucher.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.expenseHead !== undefined && { expenseHead: dto.expenseHead }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.reference !== undefined && { reference: dto.reference }),
      },
      select: expenseVoucherSelect,
    });

    return { voucher: serializeAmount(voucher) };
  }

  // ADMIN-only at the controller/guard level.
  async remove(id: string) {
    await this.findVoucherOrThrow(id);
    await this.prisma.expenseVoucher.delete({ where: { id } });
    return null;
  }

  async getStats(requestingUser: RequestingUser) {
    const where: Prisma.ExpenseVoucherWhereInput =
      requestingUser.role === Role.OPERATOR
        ? { createdById: requestingUser.id }
        : {};

    const todayDate = getDhakaTodayDateOnly();

    const [totalAgg, todayAgg] = await this.prisma.$transaction([
      this.prisma.expenseVoucher.aggregate({
        where,
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.expenseVoucher.aggregate({
        where: { ...where, date: todayDate },
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    return {
      stats: {
        totalVouchers: totalAgg._count,
        totalAmount: Number(totalAgg._sum.amount ?? 0),
        todayVouchers: todayAgg._count,
        todayAmount: Number(todayAgg._sum.amount ?? 0),
      },
    };
  }

  async generatePdf(
    id: string,
    requestingUser: RequestingUser,
  ): Promise<{ buffer: Buffer; voucherNumber: string }> {
    const voucher = await this.findVoucherOrThrow(id);

    if (
      requestingUser.role === Role.OPERATOR &&
      voucher.createdBy.id !== requestingUser.id
    ) {
      throw new ForbiddenException({
        message: 'You do not have access to this voucher',
        errorCode: ErrorCode.FORBIDDEN,
      });
    }

    const html = buildVoucherPdfHtml({
      voucherTypeLabel: 'ব্যয়ের ভাউচার',
      accentColor: EXPENSE_ACCENT_COLOR,
      voucherNumber: voucher.voucherNumber,
      date: voucher.date.toLocaleDateString('bn-BD', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      amount: Number(voucher.amount).toLocaleString('bn-BD', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      categoryLabel: 'ব্যয়ের খাত',
      categoryValue: voucher.expenseHead,
      description: voucher.description,
      reference: voucher.reference,
      operatorName: voucher.createdBy.name,
      officeName: 'মাননীয় সংসদ সদস্য-এর কার্যালয়',
      constituencyLabel: '১৭ লালমনিরহাট-২',
      signatoryName: 'আহমেদ কবির আদনান',
      signatoryTitle: 'মাননীয় সংসদ সদস্য-এর ব্যক্তিগত সহকারী',
      signatoryOrganization: 'বাংলাদেশ জাতীয় সংসদ সচিবালয়',
      logoDataUri: LOGO_DATA_URI,
    });

    const buffer = await this.pdfService.generatePdfFromHtml(html);
    return { buffer, voucherNumber: voucher.voucherNumber };
  }

  async generateSummaryPdf(
    query: GetExpenseVoucherSummaryDto,
    requestingUser: RequestingUser,
  ): Promise<Buffer> {
    const { search, dateFrom, dateTo, createdById } = query;

    const where: Prisma.ExpenseVoucherWhereInput = {};

    if (requestingUser.role === Role.OPERATOR) {
      where.createdById = requestingUser.id;
    } else if (createdById) {
      where.createdById = createdById;
    }

    if (search) {
      where.OR = [
        { voucherNumber: { contains: search, mode: 'insensitive' } },
        { expenseHead: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }

    const aggregateResult = await this.prisma.expenseVoucher.aggregate({
      where,
      _count: true,
      _sum: { amount: true },
    });

    const html = buildSummaryPdfHtml({
      voucherTypeLabel: 'ব্যয়ের ভাউচারের সারসংক্ষেপ',
      accentColor: EXPENSE_ACCENT_COLOR,
      totalVouchers: aggregateResult._count,
      totalAmount: Number(aggregateResult._sum.amount ?? 0).toLocaleString('bn-BD', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      dateRangeLabel: this.formatDateRangeLabel(dateFrom, dateTo),
      officeName: 'মাননীয় সংসদ সদস্য-এর কার্যালয়',
      constituencyLabel: '১৭ লালমনিরহাট-২',
      signatoryName: 'আহমেদ কবির আদনান',
      signatoryTitle: 'মাননীয় সংসদ সদস্য-এর ব্যক্তিগত সহকারী',
      signatoryOrganization: 'বাংলাদেশ জাতীয় সংসদ সচিবালয়',
      logoDataUri: LOGO_DATA_URI,
    });

    return this.pdfService.generatePdfFromHtml(html);
  }

  private formatDateRangeLabel(dateFrom?: string, dateTo?: string): string | undefined {
    if (!dateFrom && !dateTo) return undefined;

    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('bn-BD', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });

    if (dateFrom && dateTo) return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
    if (dateFrom) return `${fmt(dateFrom)} থেকে`;
    return `${fmt(dateTo as string)} পর্যন্ত`;
  }

  private async findVoucherOrThrow(id: string): Promise<ExpenseVoucherWithCreatedBy> {
    const voucher = await this.prisma.expenseVoucher.findUnique({
      where: { id },
      select: expenseVoucherSelect,
    });

    if (!voucher) {
      throw new NotFoundException({
        message: 'Expense voucher not found',
        errorCode: ErrorCode.EXPENSE_VOUCHER_NOT_FOUND,
      });
    }

    return voucher;
  }
}