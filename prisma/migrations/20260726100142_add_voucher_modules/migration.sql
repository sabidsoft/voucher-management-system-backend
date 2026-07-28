-- CreateTable
CREATE TABLE "ExpenseVoucher" (
    "id" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "expenseHead" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseVoucher_voucherNumber_key" ON "ExpenseVoucher"("voucherNumber");

-- CreateIndex
CREATE INDEX "ExpenseVoucher_date_idx" ON "ExpenseVoucher"("date");

-- CreateIndex
CREATE INDEX "ExpenseVoucher_createdById_idx" ON "ExpenseVoucher"("createdById");

-- CreateIndex
CREATE INDEX "ExpenseVoucher_createdById_date_idx" ON "ExpenseVoucher"("createdById", "date");

-- AddForeignKey
ALTER TABLE "ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
