ALTER TABLE "MpesaAttempt" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "MpesaAttempt" ADD COLUMN "pendingPatient" JSONB;
