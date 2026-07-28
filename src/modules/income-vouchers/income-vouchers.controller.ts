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
    return this.incomeVouchersService.create(dto, req.user.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Income vouchers fetched successfully')
  findAll(@Query() query: GetIncomeVouchersDto, @Req() req: RequestWithAuthUser) {
    return this.incomeVouchersService.findAll(query, req.user);
  }

  // Must come BEFORE @Get(':id') — otherwise "stats" gets matched as
  // the :id param and this route becomes unreachable.
  @Get('stats')
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Income voucher statistics fetched successfully')
  getStats(@Req() req: RequestWithAuthUser) {
    return this.incomeVouchersService.getStats(req.user);
  }

  // Must come BEFORE @Get(':id') — otherwise "summary-pdf" gets matched
  // as the :id param (findOne("summary-pdf")) and this route becomes
  // unreachable. Same reasoning as 'stats' above.
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

  // Returns raw PDF bytes, not the usual { success, message, data }
  // envelope — uses bare @Res() so this handler fully owns the
  // response, bypassing the global ResponseInterceptor's JSON wrapping
  // (which only applies to values returned normally from a handler).
  //
  // ?download=true sets Content-Disposition: attachment (forces a
  // download); omitting it (or any other value) sets `inline`, letting
  // the browser's built-in PDF viewer render it in a new tab instead.
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

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ResponseMessage('Income voucher updated successfully')
  update(@Param('id') id: string, @Body() dto: UpdateIncomeVoucherDto) {
    return this.incomeVouchersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ResponseMessage('Income voucher deleted successfully')
  remove(@Param('id') id: string) {
    return this.incomeVouchersService.remove(id);
  }
}