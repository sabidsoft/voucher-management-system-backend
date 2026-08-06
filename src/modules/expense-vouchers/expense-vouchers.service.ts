import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { CreateExpenseVoucherDto } from './dto/create-expense-voucher.dto';
import { UpdateExpenseVoucherDto } from './dto/update-expense-voucher.dto';
import { GetExpenseVouchersDto } from './dto/get-expense-vouchers.dto';
import { GetExpenseVoucherSummaryDto } from './dto/get-expense-voucher-summary.dto';
import { Prisma } from 'src/generated/prisma/client';
import { Role, VoucherType, VoucherStatus } from 'src/generated/prisma/enums';
import { ErrorCode } from 'src/common/constants/error-codes';
import { getDhakaTodayDateOnly } from 'src/common/utils/date-range.util';
import { serializeAmount } from 'src/common/utils/serialize-decimal.util';
import { generateVoucherNumber } from 'src/common/utils/voucher-number.util';
import { assertVoucherDateNotFuture } from 'src/common/utils/voucher-date.util';
import { PdfService } from 'src/infrastructure/pdf/pdf.service';
import { buildVoucherPdfHtml } from 'src/infrastructure/pdf/templates/voucher-pdf.template';
import { buildSummaryPdfHtml } from 'src/infrastructure/pdf/templates/summary-pdf.template';
import { LOGO_DATA_URI } from 'src/infrastructure/pdf/assets/logo';
import { SIGNATURE_DATA_URI } from 'src/infrastructure/pdf/assets/signature';

const EXPENSE_ACCENT_COLOR = '#007A43';

const expenseVoucherSelect = {
  id: true,
  voucherNumber: true,
  date: true,
  amount: true,
  expenseHead: true,
  description: true,
  reference: true,
  status: true,
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

@Injectable()
export class ExpenseVouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  async create(dto: CreateExpenseVoucherDto, requestingUser: RequestingUser) {
    assertVoucherDateNotFuture(dto.date);

    const voucherDate = new Date(dto.date);

    const initialStatus =
      requestingUser.role === Role.ADMIN ? VoucherStatus.APPROVED : VoucherStatus.PENDING;

    const voucher = await this.prisma.$transaction(async (tx) => {
      const voucherNumber = await generateVoucherNumber(tx, voucherDate, VoucherType.EXVO);

      return tx.expenseVoucher.create({
        data: {
          voucherNumber,
          date: voucherDate,
          amount: dto.amount,
          expenseHead: dto.expenseHead,
          description: dto.description,
          reference: dto.reference,
          status: initialStatus,
          createdById: requestingUser.id,
        },
        select: expenseVoucherSelect,
      });
    });

    return { voucher: serializeAmount(voucher) };
  }

  async findAll(query: GetExpenseVouchersDto, requestingUser: RequestingUser) {
    const { page, limit, search, dateFrom, dateTo, createdById, status } = query;

    const where: Prisma.ExpenseVoucherWhereInput = {};

    if (requestingUser.role === Role.OPERATOR) {
      where.createdById = requestingUser.id;
    } else if (createdById) {
      where.createdById = createdById;
    }

    if (status) {
      where.status = status;
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

    const approvedAmountWhere: Prisma.ExpenseVoucherWhereInput = { ...where, status: VoucherStatus.APPROVED };

    const [vouchers, countResult, approvedSumResult] = await this.prisma.$transaction([
      this.prisma.expenseVoucher.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'desc' }, { voucherNumber: 'desc' }],
        select: expenseVoucherSelect,
      }),
      this.prisma.expenseVoucher.count({ where }),
      this.prisma.expenseVoucher.aggregate({
        where: approvedAmountWhere,
        _sum: { amount: true },
      }),
    ]);

    return {
      vouchers: vouchers.map((v) => serializeAmount(v)),
      meta: {
        page,
        limit,
        total: countResult,
        totalPages: Math.ceil(countResult / limit),
        totalAmount: Number(approvedSumResult._sum.amount ?? 0),
      },
    };
  }

  async getPendingCount(requestingUser: RequestingUser) {
    if (requestingUser.role !== Role.ADMIN) {
      return { count: 0 };
    }

    const count = await this.prisma.expenseVoucher.count({
      where: { status: VoucherStatus.PENDING },
    });

    return { count };
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

  async update(id: string, dto: UpdateExpenseVoucherDto, requestingUser: RequestingUser) {
    const existing = await this.findVoucherOrThrow(id);

    if (requestingUser.role === Role.OPERATOR) {
      if (existing.createdBy.id !== requestingUser.id) {
        throw new ForbiddenException({
          message: 'You do not have access to this voucher',
          errorCode: ErrorCode.FORBIDDEN,
        });
      }
      if (existing.status === VoucherStatus.APPROVED) {
        throw new ForbiddenException({
          message: 'An approved voucher cannot be edited',
          errorCode: ErrorCode.VOUCHER_LOCKED,
        });
      }
    }

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
        ...(requestingUser.role === Role.OPERATOR && { status: VoucherStatus.PENDING }),
      },
      select: expenseVoucherSelect,
    });

    return { voucher: serializeAmount(voucher) };
  }

  async approve(id: string) {
    const existing = await this.findVoucherOrThrow(id);

    if (existing.status !== VoucherStatus.PENDING) {
      throw new BadRequestException({
        message: 'Only a pending voucher can be approved',
        errorCode: ErrorCode.VOUCHER_ALREADY_PROCESSED,
      });
    }

    const voucher = await this.prisma.expenseVoucher.update({
      where: { id },
      data: { status: VoucherStatus.APPROVED },
      select: expenseVoucherSelect,
    });

    return { voucher: serializeAmount(voucher) };
  }

  async reject(id: string) {
    const existing = await this.findVoucherOrThrow(id);

    if (existing.status !== VoucherStatus.PENDING) {
      throw new BadRequestException({
        message: 'Only a pending voucher can be rejected',
        errorCode: ErrorCode.VOUCHER_ALREADY_PROCESSED,
      });
    }

    const voucher = await this.prisma.expenseVoucher.update({
      where: { id },
      data: { status: VoucherStatus.REJECTED },
      select: expenseVoucherSelect,
    });

    return { voucher: serializeAmount(voucher) };
  }

  async remove(id: string) {
    await this.findVoucherOrThrow(id);
    await this.prisma.expenseVoucher.delete({ where: { id } });
    return null;
  }

  async getStats(requestingUser: RequestingUser) {
    const baseWhere: Prisma.ExpenseVoucherWhereInput =
      requestingUser.role === Role.OPERATOR
        ? { createdById: requestingUser.id }
        : {};

    const where: Prisma.ExpenseVoucherWhereInput = { ...baseWhere, status: VoucherStatus.APPROVED };

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
      createdAt: voucher.createdAt.toLocaleString('bn-BD', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      operatorName: voucher.createdBy.name,
      officeName: 'মাননীয় সংসদ সদস্য-এর কার্যালয়',
      constituencyLabel: '১৭ লালমনিরহাট-২',
      signatoryName: 'আহমেদ কবির আদনান',
      signatoryTitle: 'মাননীয় সংসদ সদস্য-এর ব্যক্তিগত সহকারী',
      signatoryOrganization: 'বাংলাদেশ জাতীয় সংসদ সচিবালয়',
      secondarySignatoryName: 'মো: রোকন উদ্দীন বাবুল এম.পি',
      secondarySignatoryTitle: 'সংসদ সদস্য',
      secondarySignatoryOrganization: 'ত্রয়োদশ জাতীয় সংসদ',
      logoDataUri: LOGO_DATA_URI,
      signatureDataUri: SIGNATURE_DATA_URI,
    });

    const buffer = await this.pdfService.generatePdfFromHtml(html);
    return { buffer, voucherNumber: voucher.voucherNumber };
  }

  async generateSummaryPdf(
    query: GetExpenseVoucherSummaryDto,
    requestingUser: RequestingUser,
  ): Promise<Buffer> {
    const { search, dateFrom, dateTo, createdById } = query;

    const where: Prisma.ExpenseVoucherWhereInput = {
      status: VoucherStatus.APPROVED,
    };

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

    const [aggregateResult, vouchers] = await this.prisma.$transaction([
      this.prisma.expenseVoucher.aggregate({
        where,
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.expenseVoucher.findMany({
        where,
        orderBy: [{ date: 'desc' }, { voucherNumber: 'desc' }],
        select: { voucherNumber: true, date: true, amount: true },
      }),
    ]);

    const html = buildSummaryPdfHtml({
      voucherTypeLabel: 'ব্যয়ের ভাউচারের সারসংক্ষেপ',
      accentColor: EXPENSE_ACCENT_COLOR,
      totalVouchers: aggregateResult._count,
      vouchers: vouchers.map((v) => ({
        voucherNumber: v.voucherNumber,
        date: v.date.toLocaleDateString('bn-BD', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }),
        amount: Number(v.amount).toLocaleString('bn-BD', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      })),
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
      secondarySignatoryName: 'মো: রোকন উদ্দীন বাবুল এম.পি',
      secondarySignatoryTitle: 'সংসদ সদস্য',
      secondarySignatoryOrganization: 'ত্রয়োদশ জাতীয় সংসদ',
      logoDataUri: LOGO_DATA_URI,
      signatureDataUri: SIGNATURE_DATA_URI,
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