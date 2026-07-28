import { Module } from '@nestjs/common';
import { IncomeVouchersService } from './income-vouchers.service';
import { IncomeVouchersController } from './income-vouchers.controller';
import { PdfModule } from 'src/infrastructure/pdf/pdf.module';

@Module({
  imports: [PdfModule],
  controllers: [IncomeVouchersController],
  providers: [IncomeVouchersService],
})
export class IncomeVouchersModule {}