import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { CreateIncomeVoucherDto } from './dto/create-income-voucher.dto';
import { UpdateIncomeVoucherDto } from './dto/update-income-voucher.dto';
import { GetIncomeVouchersDto } from './dto/get-income-vouchers.dto';
import { GetIncomeVoucherSummaryDto } from './dto/get-income-voucher-summary.dto';
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

const incomeVoucherSelect = {
  id: true,
  voucherNumber: true,
  date: true,
  amount: true,
  incomeSource: true,
  description: true,
  reference: true,
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

  async create(dto: CreateIncomeVoucherDto, userId: string) {
    assertVoucherDateNotFuture(dto.date);

    // Since `date` is a @db.Date column (no time/timezone component),
    // new Date(dto.date) maps unambiguously onto it — no Dhaka-offset
    // math needed.
    //
    // The voucher's own effective date decides which year's sequence
    // it belongs to — not today's date — so a backdated entry still
    // lands in the correct year's numbering.
    const voucherDate = new Date(dto.date);

    const voucher = await this.prisma.$transaction(async (tx) => {
      const voucherNumber = await generateVoucherNumber(tx, voucherDate, VoucherType.INC);

      return tx.incomeVoucher.create({
        data: {
          voucherNumber,
          date: voucherDate,
          amount: dto.amount,
          incomeSource: dto.incomeSource,
          description: dto.description,
          reference: dto.reference,
          createdById: userId,
        },
        select: incomeVoucherSelect,
      });
    });

    return { voucher: serializeAmount(voucher) };
  }

  async findAll(query: GetIncomeVouchersDto, requestingUser: RequestingUser) {
    const { page, limit, search, dateFrom, dateTo, createdById } = query;

    const where: Prisma.IncomeVoucherWhereInput = {};

    if (requestingUser.role === Role.OPERATOR) {
      // Operators can only ever see their own vouchers — enforced here
      // regardless of any createdById the client attempts to send.
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

    const skip = (page - 1) * limit;

    const [vouchers, aggregateResult] = await this.prisma.$transaction([
      this.prisma.incomeVoucher.findMany({
        where,
        skip,
        take: limit,
        // Sorted by the voucher's own transaction date first — matches
        // the page's date-centric mental model. voucherNumber is a
        // secondary tie-breaker: without it, rows sharing the same
        // `date` have no guaranteed stable order, which can cause a
        // row to be skipped or duplicated across pages when paginating.
        orderBy: [{ date: 'desc' }, { voucherNumber: 'desc' }],
        select: incomeVoucherSelect,
      }),
      // aggregate() gives us both the filtered count and the filtered
      // sum(amount) in a single query — no extra round trip compared
      // to the plain count() this replaces. totalAmount here reflects
      // whatever the current search/date-filter/role-scope narrows
      // down to, not the whole table — this feeds the page's own
      // "Total Vouchers"/"Total Amount" stat cards, which are meant to
      // be filter-aware (unlike the separate /stats endpoint, which
      // stays global/unfiltered for the Dashboard and this page's
      // "Today" cards).
      this.prisma.incomeVoucher.aggregate({
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

  // ADMIN-only at the controller/guard level — no ownership check
  // needed here since only admins can reach this method at all.
  async update(id: string, dto: UpdateIncomeVoucherDto) {
    await this.findVoucherOrThrow(id);

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
      },
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
    const where: Prisma.IncomeVoucherWhereInput =
      requestingUser.role === Role.OPERATOR
        ? { createdById: requestingUser.id }
        : {};

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

    // PDF content is always rendered in Bengali regardless of the
    // requesting user's UI language — this is an official Bangladeshi
    // financial document, not a UI element, so it stays fixed.
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
    query: GetIncomeVoucherSummaryDto,
    requestingUser: RequestingUser,
  ): Promise<Buffer> {
    const { search, dateFrom, dateTo, createdById } = query;

    const where: Prisma.IncomeVoucherWhereInput = {};

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

    const aggregateResult = await this.prisma.incomeVoucher.aggregate({
      where,
      _count: true,
      _sum: { amount: true },
    });

    const html = buildSummaryPdfHtml({
      voucherTypeLabel: 'আয়ের ভাউচারের সারসংক্ষেপ',
      accentColor: '#007A43',
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

  // Formats the applied date range for display on the summary PDF —
  // deliberately never includes the raw search term (see SummaryPdfData
  // comment: search is an exploratory UI filter, not a formal
  // reporting criterion).
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

  // Shared by findOne/update/remove — fetches the full record (with
  // createdBy, needed by findOne's ownership check) or throws a
  // consistent NotFoundException.
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