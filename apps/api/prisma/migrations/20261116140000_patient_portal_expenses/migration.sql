-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PATIENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "patientId" UUID;

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reference_key" ON "Expense"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "User_patientId_key" ON "User"("patientId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_positive_amount" CHECK ("amountCents" > 0);
ALTER TABLE "User" ADD CONSTRAINT "User_patient_link" CHECK (("role"::text = 'PATIENT' AND "patientId" IS NOT NULL) OR ("role"::text <> 'PATIENT' AND "patientId" IS NULL));
