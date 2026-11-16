CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST', 'CASHIER', 'ATTENDANT', 'PHARMACIST', 'LAB_TECHNICIAN', 'CLINICIAN_1', 'CLINICIAN_2', 'CLINICIAN_3', 'RECOVERY_NURSE', 'CATERING_STAFF', 'ACCOUNTANT', 'PROCUREMENT_OFFICER');
CREATE TYPE "VisitType" AS ENUM ('OUTPATIENT', 'INPATIENT');
CREATE TYPE "VisitStatus" AS ENUM ('REGISTERED', 'WAITING', 'IN_PROGRESS', 'REFERRED', 'ADMITTED', 'UNDER_OBSERVATION', 'COMPLETED', 'DISCHARGED', 'CANCELLED');
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'NOT_SPECIFIED');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Patient" (
  "id" UUID NOT NULL,
  "patientNumber" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "dateOfBirth" TIMESTAMP(3),
  "gender" "Gender" NOT NULL DEFAULT 'NOT_SPECIFIED',
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "emergencyContact" TEXT,
  "nextOfKin" TEXT,
  "allergies" TEXT,
  "medicalAlerts" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Visit" (
  "id" UUID NOT NULL,
  "visitNumber" TEXT NOT NULL,
  "patientId" UUID NOT NULL,
  "type" "VisitType" NOT NULL,
  "status" "VisitStatus" NOT NULL DEFAULT 'REGISTERED',
  "reason" TEXT NOT NULL,
  "currentDepartment" TEXT,
  "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" UUID NOT NULL,
  CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowEvent" (
  "id" UUID NOT NULL,
  "visitId" UUID NOT NULL,
  "fromStatus" "VisitStatus",
  "toStatus" "VisitStatus" NOT NULL,
  "note" TEXT,
  "changedById" UUID NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Patient_patientNumber_key" ON "Patient"("patientNumber");
CREATE UNIQUE INDEX "Visit_visitNumber_key" ON "Visit"("visitNumber");
CREATE INDEX "Visit_patientId_createdAt_idx" ON "Visit"("patientId", "createdAt");
CREATE INDEX "Visit_status_arrivedAt_idx" ON "Visit"("status", "arrivedAt");
CREATE INDEX "WorkflowEvent_visitId_changedAt_idx" ON "WorkflowEvent"("visitId", "changedAt");
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

ALTER TABLE "Visit" ADD CONSTRAINT "Visit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
