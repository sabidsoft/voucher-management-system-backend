/*
  Warnings:

  - Made the column `description` on table `IncomeVoucher` required. This step will fail if there are existing NULL values in that column.
  - Made the column `reference` on table `IncomeVoucher` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "IncomeVoucher" ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "reference" SET NOT NULL;
