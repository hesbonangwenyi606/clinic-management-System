-- CreateTable
CREATE TABLE "Bed" (
    "id" UUID NOT NULL,
    "ward" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "bedId" UUID NOT NULL,
    "clinicianId" UUID NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "dischargeSummary" TEXT,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionEvent" (
    "id" UUID NOT NULL,
    "admissionId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordAmendment" (
    "id" UUID NOT NULL,
    "careEntryId" UUID,
    "labOrderId" UUID,
    "text" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReversal" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bed_ward_name_key" ON "Bed"("ward", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_visitId_key" ON "Admission"("visitId");

-- CreateIndex
CREATE INDEX "Admission_bedId_dischargedAt_idx" ON "Admission"("bedId", "dischargedAt");

-- CreateIndex
CREATE INDEX "AdmissionEvent_admissionId_createdAt_idx" ON "AdmissionEvent"("admissionId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordAmendment_careEntryId_createdAt_idx" ON "RecordAmendment"("careEntryId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordAmendment_labOrderId_createdAt_idx" ON "RecordAmendment"("labOrderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReversal_paymentId_key" ON "PaymentReversal"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentReversal_createdAt_idx" ON "PaymentReversal"("createdAt");

-- CreateIndex
CREATE INDEX "Patient_archivedAt_createdAt_idx" ON "Patient"("archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "CareEntry_department_createdAt_idx" ON "CareEntry"("department", "createdAt");

-- CreateIndex
CREATE INDEX "LabOrder_visitId_createdAt_idx" ON "LabOrder"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "LabOrder_status_createdAt_idx" ON "LabOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_stockItemId_createdAt_idx" ON "StockMovement"("stockItemId", "createdAt");

-- CreateIndex
CREATE INDEX "Prescription_visitId_createdAt_idx" ON "Prescription"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "Prescription_stockItemId_idx" ON "Prescription"("stockItemId");

-- CreateIndex
CREATE INDEX "Prescription_dispensedAt_createdAt_idx" ON "Prescription"("dispensedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_visitId_createdAt_idx" ON "Invoice"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Expense_incurredAt_idx" ON "Expense"("incurredAt");

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionEvent" ADD CONSTRAINT "AdmissionEvent_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionEvent" ADD CONSTRAINT "AdmissionEvent_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAmendment" ADD CONSTRAINT "RecordAmendment_careEntryId_fkey" FOREIGN KEY ("careEntryId") REFERENCES "CareEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAmendment" ADD CONSTRAINT "RecordAmendment_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAmendment" ADD CONSTRAINT "RecordAmendment_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "Admission_active_bed" ON "Admission"("bedId") WHERE "dischargedAt" IS NULL;
ALTER TABLE "RecordAmendment" ADD CONSTRAINT "RecordAmendment_one_target" CHECK (("careEntryId" IS NOT NULL)::int + ("labOrderId" IS NOT NULL)::int = 1);

CREATE INDEX "CareEntry_recordedBy_idx" ON "CareEntry"("recordedBy");
ALTER TABLE "CareEntry" ADD CONSTRAINT "CareEntry_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "LabOrder_requestedBy_idx" ON "LabOrder"("requestedBy");
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "LabOrder_resultedBy_idx" ON "LabOrder"("resultedBy");
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_resultedBy_fkey" FOREIGN KEY ("resultedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "StockMovement_recordedBy_idx" ON "StockMovement"("recordedBy");
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Prescription_prescribedBy_idx" ON "Prescription"("prescribedBy");
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescribedBy_fkey" FOREIGN KEY ("prescribedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Prescription_dispensedBy_idx" ON "Prescription"("dispensedBy");
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_dispensedBy_fkey" FOREIGN KEY ("dispensedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Invoice_createdBy_idx" ON "Invoice"("createdBy");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Payment_recordedBy_idx" ON "Payment"("recordedBy");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Appointment_createdBy_idx" ON "Appointment"("createdBy");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Expense_recordedBy_idx" ON "Expense"("recordedBy");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CareEntry" ADD CONSTRAINT "CareEntry_department_values" CHECK ("department" IN ('TRIAGE','CLINICAL','RECOVERY','CATERING'));

ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_status_values" CHECK ("status" IN ('REQUESTED','RESULTED'));

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_status_values" CHECK ("status" IN ('BOOKED','ATTENDED','CANCELLED'));

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_method_values" CHECK ("method" IN ('CASH','MPESA_RECORDED','BANK_RECORDED'));
