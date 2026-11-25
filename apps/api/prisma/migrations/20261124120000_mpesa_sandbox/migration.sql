CREATE TABLE "MpesaAttempt" (
  "id" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "checkoutId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'INITIATING',
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MpesaAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MpesaAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MpesaAttempt_invoiceId_key" ON "MpesaAttempt"("invoiceId");
CREATE UNIQUE INDEX "MpesaAttempt_tokenHash_key" ON "MpesaAttempt"("tokenHash");
CREATE UNIQUE INDEX "MpesaAttempt_checkoutId_key" ON "MpesaAttempt"("checkoutId");
