-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('INC', 'EXP');

-- CreateTable
CREATE TABLE "IncomeVoucher" (
    "id" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "incomeSource" TEXT NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherSequence" (
    "id" TEXT NOT NULL,
    "voucherType" "VoucherType" NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomeVoucher_voucherNumber_key" ON "IncomeVoucher"("voucherNumber");

-- CreateIndex
CREATE INDEX "IncomeVoucher_date_idx" ON "IncomeVoucher"("date");

-- CreateIndex
CREATE INDEX "IncomeVoucher_createdById_idx" ON "IncomeVoucher"("createdById");

-- CreateIndex
CREATE INDEX "IncomeVoucher_createdById_date_idx" ON "IncomeVoucher"("createdById", "date");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherSequence_voucherType_year_key" ON "VoucherSequence"("voucherType", "year");

-- AddForeignKey
ALTER TABLE "IncomeVoucher" ADD CONSTRAINT "IncomeVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
