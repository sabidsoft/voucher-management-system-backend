import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { IncomeVouchersService } from './income-vouchers.service';
import { CreateIncomeVoucherDto } from './dto/create-income-voucher.dto';
import { UpdateIncomeVoucherDto } from './dto/update-income-voucher.dto';
import { GetIncomeVouchersDto } from './dto/get-income-vouchers.dto';
import { GetIncomeVoucherSummaryDto } from './dto/get-income-voucher-summary.dto';
import type { RequestWithAuthUser } from '../auth/types/auth.types';

@Controller('income-vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncomeVouchersController {
  constructor(private readonly incomeVouchersService: IncomeVouchersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Income voucher created successfully')
  create(@Body() dto: CreateIncomeVoucherDto, @Req() req: RequestWithAuthUser) {
    return this.incomeVouchersService.create(dto, req.user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Income vouchers fetched successfully')
  findAll(@Query() query: GetIncomeVouchersDto, @Req() req: RequestWithAuthUser) {
    return this.incomeVouchersService.findAll(query, req.user);
  }

  // Must come BEFORE @Get(':id') — same reasoning as 'stats'/'summary-pdf'
  // below: a literal path segment has to be registered before a
  // :id-catching route, otherwise "pending-count" gets swallowed as
  // the :id param and this route becomes unreachable.
  @Get('pending-count')
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Pending count fetched successfully')
  getPendingCount(@Req() req: RequestWithAuthUser) {
    return this.incomeVouchersService.getPendingCount(req.user);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Income voucher statistics fetched successfully')
  getStats(@Req() req: RequestWithAuthUser) {
    return this.incomeVouchersService.getStats(req.user);
  }

  @Get('summary-pdf')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async downloadSummaryPdf(
    @Query() query: GetIncomeVoucherSummaryDto,
    @Req() req: RequestWithAuthUser,
    @Res() res: Response,
  ) {
    const buffer = await this.incomeVouchersService.generateSummaryPdf(query, req.user);

    const disposition = query.download === 'true' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="income-vouchers-summary.pdf"`,
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Income voucher fetched successfully')
  findOne(@Param('id') id: string, @Req() req: RequestWithAuthUser) {
    return this.incomeVouchersService.findOne(id, req.user);
  }

  @Get(':id/pdf')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async downloadPdf(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Req() req: RequestWithAuthUser,
    @Res() res: Response,
  ) {
    const { buffer, voucherNumber } = await this.incomeVouchersService.generatePdf(
      id,
      req.user,
    );

    const disposition = download === 'true' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${voucherNumber}.pdf"`,
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  }

  // Now reachable by OPERATOR too (previously ADMIN-only) — the
  // service layer enforces ownership + "not-yet-APPROVED" for
  // Operators, and resets status back to PENDING on their edits (see
  // IncomeVouchersService.update's comment).
  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Income voucher updated successfully')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIncomeVoucherDto,
    @Req() req: RequestWithAuthUser,
  ) {
    return this.incomeVouchersService.update(id, dto, req.user);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN)
  @ResponseMessage('Income voucher approved successfully')
  approve(@Param('id') id: string) {
    return this.incomeVouchersService.approve(id);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN)
  @ResponseMessage('Income voucher rejected successfully')
  reject(@Param('id') id: string) {
    return this.incomeVouchersService.reject(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ResponseMessage('Income voucher deleted successfully')
  remove(@Param('id') id: string) {
    return this.incomeVouchersService.remove(id);
  }
}