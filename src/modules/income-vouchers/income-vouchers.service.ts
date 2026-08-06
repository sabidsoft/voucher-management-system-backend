import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { CreateIncomeVoucherDto } from './dto/create-income-voucher.dto';
import { UpdateIncomeVoucherDto } from './dto/update-income-voucher.dto';
import { GetIncomeVouchersDto } from './dto/get-income-vouchers.dto';
import { GetIncomeVoucherSummaryDto } from './dto/get-income-voucher-summary.dto';
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

const incomeVoucherSelect = {
  id: true,
  voucherNumber: true,
  date: true,
  amount: true,
  incomeSource: true,
  description: true,
  reference: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.IncomeVoucherSelect;

type IncomeVoucherWithCreatedBy = Prisma.IncomeVoucherGetPayload<{
  select: typeof incomeVoucherSelect;
}>;

type RequestingUser = { id: string; role: Role };

@Injectable()
export class IncomeVouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  async create(dto: CreateIncomeVoucherDto, requestingUser: RequestingUser) {
    assertVoucherDateNotFuture(dto.date);

    const voucherDate = new Date(dto.date);

    // Admins are trusted — their own vouchers skip the review queue.
    // Anything an Operator creates needs Admin sign-off first.
    const initialStatus =
      requestingUser.role === Role.ADMIN ? VoucherStatus.APPROVED : VoucherStatus.PENDING;

    const voucher = await this.prisma.$transaction(async (tx) => {
      const voucherNumber = await generateVoucherNumber(tx, voucherDate, VoucherType.INVO);

      return tx.incomeVoucher.create({
        data: {
          voucherNumber,
          date: voucherDate,
          amount: dto.amount,
          incomeSource: dto.incomeSource,
          description: dto.description,
          reference: dto.reference,
          status: initialStatus,
          createdById: requestingUser.id,
        },
        select: incomeVoucherSelect,
      });
    });

    return { voucher: serializeAmount(voucher) };
  }

  async findAll(query: GetIncomeVouchersDto, requestingUser: RequestingUser) {
    const { page, limit, search, dateFrom, dateTo, createdById, status } = query;

    const where: Prisma.IncomeVoucherWhereInput = {};

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
        { incomeSource: { contains: search, mode: 'insensitive' } },
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

    // The "Total Amount" stat must always reflect only APPROVED money,
    // regardless of whatever status the list itself is filtered to —
    // a PENDING/REJECTED voucher isn't real income yet, and including
    // it would overstate the office's actual finances. This is
    // intentionally a SEPARATE aggregate from the list's own `where`
    // (which respects the caller's status filter for what rows to
    // show), scoped to the same search/date/ownership filters but with
    // status forced to APPROVED.
    const approvedAmountWhere: Prisma.IncomeVoucherWhereInput = { ...where, status: VoucherStatus.APPROVED };

    const [vouchers, countResult, approvedSumResult] = await this.prisma.$transaction([
      this.prisma.incomeVoucher.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'desc' }, { voucherNumber: 'desc' }],
        select: incomeVoucherSelect,
      }),
      this.prisma.incomeVoucher.count({ where }),
      this.prisma.incomeVoucher.aggregate({
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

  // Lightweight — used by the notification-bell's polling. Deliberately
  // returns just a count, not the full pending list, so each poll stays
  // cheap. The bell's dropdown calls findAll({ status: PENDING }) for
  // the actual list only when opened.
  async getPendingCount(requestingUser: RequestingUser) {
    if (requestingUser.role !== Role.ADMIN) {
      return { count: 0 };
    }

    const count = await this.prisma.incomeVoucher.count({
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

  // Both ADMIN and OPERATOR can reach this now (see controller) — but
  // an Operator may only edit their OWN voucher, and only while it's
  // not yet APPROVED (an approved voucher is a finalized financial
  // record). Any edit by an Operator resets status back to PENDING —
  // even if it was already PENDING — since the figures just changed
  // and need a fresh review; this is also how a REJECTED voucher gets
  // resubmitted. Admin edits are trusted and don't force re-review.
  async update(id: string, dto: UpdateIncomeVoucherDto, requestingUser: RequestingUser) {
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

    const voucher = await this.prisma.incomeVoucher.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.incomeSource !== undefined && { incomeSource: dto.incomeSource }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.reference !== undefined && { reference: dto.reference }),
        ...(requestingUser.role === Role.OPERATOR && { status: VoucherStatus.PENDING }),
      },
      select: incomeVoucherSelect,
    });

    return { voucher: serializeAmount(voucher) };
  }

  // ADMIN-only at the controller/guard level.
  async approve(id: string) {
    const existing = await this.findVoucherOrThrow(id);

    if (existing.status !== VoucherStatus.PENDING) {
      throw new BadRequestException({
        message: 'Only a pending voucher can be approved',
        errorCode: ErrorCode.VOUCHER_ALREADY_PROCESSED,
      });
    }

    const voucher = await this.prisma.incomeVoucher.update({
      where: { id },
      data: { status: VoucherStatus.APPROVED },
      select: incomeVoucherSelect,
    });

    return { voucher: serializeAmount(voucher) };
  }

  // ADMIN-only at the controller/guard level. Soft — sets status to
  // REJECTED rather than deleting, so the Operator can see why their
  // submission wasn't accepted and edit-resubmit it (update() above
  // resets REJECTED back to PENDING on any Operator edit) instead of
  // re-typing the whole voucher from scratch.
  async reject(id: string) {
    const existing = await this.findVoucherOrThrow(id);

    if (existing.status !== VoucherStatus.PENDING) {
      throw new BadRequestException({
        message: 'Only a pending voucher can be rejected',
        errorCode: ErrorCode.VOUCHER_ALREADY_PROCESSED,
      });
    }

    const voucher = await this.prisma.incomeVoucher.update({
      where: { id },
      data: { status: VoucherStatus.REJECTED },
      select: incomeVoucherSelect,
    });

    return { voucher: serializeAmount(voucher) };
  }

  // ADMIN-only at the controller/guard level.
  async remove(id: string) {
    await this.findVoucherOrThrow(id);
    await this.prisma.incomeVoucher.delete({ where: { id } });
    return null;
  }

  async getStats(requestingUser: RequestingUser) {
    const baseWhere: Prisma.IncomeVoucherWhereInput =
      requestingUser.role === Role.OPERATOR
        ? { createdById: requestingUser.id }
        : {};

    // Same reasoning as findAll()'s approvedAmountWhere — dashboard
    // stats represent official finances, so only APPROVED vouchers
    // count toward totalVouchers/totalAmount here too.
    const where: Prisma.IncomeVoucherWhereInput = { ...baseWhere, status: VoucherStatus.APPROVED };

    const todayDate = getDhakaTodayDateOnly();

    const [totalAgg, todayAgg] = await this.prisma.$transaction([
      this.prisma.incomeVoucher.aggregate({
        where,
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.incomeVoucher.aggregate({
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
      voucherTypeLabel: 'আয়ের ভাউচার',
      accentColor: '#007A43',
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
      categoryLabel: 'আয়ের উৎস',
      categoryValue: voucher.incomeSource,
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
    query: GetIncomeVoucherSummaryDto,
    requestingUser: RequestingUser,
  ): Promise<Buffer> {
    const { search, dateFrom, dateTo, createdById } = query;

    const where: Prisma.IncomeVoucherWhereInput = {
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
        { incomeSource: { contains: search, mode: 'insensitive' } },
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
      this.prisma.incomeVoucher.aggregate({
        where,
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.incomeVoucher.findMany({
        where,
        orderBy: [{ date: 'desc' }, { voucherNumber: 'desc' }],
        select: { voucherNumber: true, date: true, amount: true },
      }),
    ]);

    const html = buildSummaryPdfHtml({
      voucherTypeLabel: 'আয়ের ভাউচারের সারসংক্ষেপ',
      accentColor: '#007A43',
      totalVouchers: aggregateResult._count,
      totalAmount: Number(aggregateResult._sum.amount ?? 0).toLocaleString('bn-BD', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
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

  private async findVoucherOrThrow(id: string): Promise<IncomeVoucherWithCreatedBy> {
    const voucher = await this.prisma.incomeVoucher.findUnique({
      where: { id },
      select: incomeVoucherSelect,
    });

    if (!voucher) {
      throw new NotFoundException({
        message: 'Income voucher not found',
        errorCode: ErrorCode.INCOME_VOUCHER_NOT_FOUND,
      });
    }

    return voucher;
  }
}