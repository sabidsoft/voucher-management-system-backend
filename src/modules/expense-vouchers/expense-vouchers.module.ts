import { Module } from '@nestjs/common';
import { ExpenseVouchersService } from './expense-vouchers.service';
import { ExpenseVouchersController } from './expense-vouchers.controller';
import { PdfModule } from 'src/infrastructure/pdf/pdf.module';

@Module({
  imports: [PdfModule],
  controllers: [ExpenseVouchersController],
  providers: [ExpenseVouchersService],
})
export class ExpenseVouchersModule {}