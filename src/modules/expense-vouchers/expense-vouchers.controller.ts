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
import { ExpenseVouchersService } from './expense-vouchers.service';
import { CreateExpenseVoucherDto } from './dto/create-expense-voucher.dto';
import { UpdateExpenseVoucherDto } from './dto/update-expense-voucher.dto';
import { GetExpenseVouchersDto } from './dto/get-expense-vouchers.dto';
import { GetExpenseVoucherSummaryDto } from './dto/get-expense-voucher-summary.dto';
import type { RequestWithAuthUser } from '../auth/types/auth.types';

@Controller('expense-vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpenseVouchersController {
  constructor(private readonly expenseVouchersService: ExpenseVouchersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Expense voucher created successfully')
  create(@Body() dto: CreateExpenseVoucherDto, @Req() req: RequestWithAuthUser) {
    return this.expenseVouchersService.create(dto, req.user.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Expense vouchers fetched successfully')
  findAll(@Query() query: GetExpenseVouchersDto, @Req() req: RequestWithAuthUser) {
    return this.expenseVouchersService.findAll(query, req.user);
  }

  // Must come BEFORE @Get(':id') — otherwise "stats" gets matched as
  // the :id param and this route becomes unreachable.
  @Get('stats')
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Expense voucher statistics fetched successfully')
  getStats(@Req() req: RequestWithAuthUser) {
    return this.expenseVouchersService.getStats(req.user);
  }

  // Also placed before @Get(':id') for the same reason as 'stats' —
  // this exact bug bit the Income Voucher summary-pdf route earlier.
  @Get('summary-pdf')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async downloadSummaryPdf(
    @Query() query: GetExpenseVoucherSummaryDto,
    @Req() req: RequestWithAuthUser,
    @Res() res: Response,
  ) {
    const buffer = await this.expenseVouchersService.generateSummaryPdf(query, req.user);

    const disposition = query.download === 'true' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="expense-vouchers-summary.pdf"`,
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ResponseMessage('Expense voucher fetched successfully')
  findOne(@Param('id') id: string, @Req() req: RequestWithAuthUser) {
    return this.expenseVouchersService.findOne(id, req.user);
  }

  // Returns raw PDF bytes via bare @Res(), bypassing the global
  // ResponseInterceptor's JSON envelope — same pattern as Income
  // Voucher's PDF route.
  @Get(':id/pdf')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async downloadPdf(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Req() req: RequestWithAuthUser,
    @Res() res: Response,
  ) {
    const { buffer, voucherNumber } = await this.expenseVouchersService.generatePdf(
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
  @ResponseMessage('Expense voucher updated successfully')
  update(@Param('id') id: string, @Body() dto: UpdateExpenseVoucherDto) {
    return this.expenseVouchersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ResponseMessage('Expense voucher deleted successfully')
  remove(@Param('id') id: string) {
    return this.expenseVouchersService.remove(id);
  }
}