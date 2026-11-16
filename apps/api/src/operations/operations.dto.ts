import { Transform } from 'class-transformer';
import { ValidateIf, IsDateString, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CareDto {
  @IsUUID() visitId!: string;
  @IsIn(['TRIAGE', 'CLINICAL', 'RECOVERY', 'CATERING']) department!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(4000) summary!: string;
  @IsObject() details!: Record<string, string | number>;
}
export class LabDto {
  @IsUUID() visitId!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(200) testName!: string;
}
export class ResultDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(10000) result!: string;
}
export class StockDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(100) batch!: string;
  @IsDateString() expiresAt!: string;
  @IsInt() @Min(0) @Max(1000000) quantity!: number;
  @IsInt() @Min(0) @Max(1000000) reorderLevel!: number;
}
export class MovementDto {
  @IsInt() @Min(-1000000) @Max(1000000) quantity!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export class PrescriptionDto {
  @IsUUID() visitId!: string;
  @IsUUID() stockItemId!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(2000) instructions!: string;
}
export class InvoiceDto {
  @IsUUID() visitId!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(500) description!: string;
  @IsInt() @Min(1) @Max(1000000000) amountCents!: number;
}
export class PaymentDto {
  @IsInt() @Min(1) @Max(1000000000) amountCents!: number;
  @IsIn(['CASH', 'MPESA_RECORDED', 'BANK_RECORDED']) method!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(100) reference!: string;
}
export class AppointmentDto {
  @IsUUID() patientId!: string;
  @IsDateString() scheduledAt!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
export class AppointmentStatusDto {
  @IsIn(['ATTENDED', 'CANCELLED']) status!: string;
}
export class StaffDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(14) @MaxLength(72) password!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
  @ValidateIf(o => o.role === 'PATIENT' || o.patientId !== undefined) @IsUUID() patientId?: string;
  @IsIn(['PATIENT','CLINIC_ADMIN','RECEPTIONIST','CASHIER','ATTENDANT','PHARMACIST','LAB_TECHNICIAN','CLINICIAN_1','CLINICIAN_2','CLINICIAN_3','RECOVERY_NURSE','CATERING_STAFF','ACCOUNTANT','PROCUREMENT_OFFICER']) role!: string;
}

export class ExpenseDto {
 @IsString() @MinLength(1) @MaxLength(500) description!: string;
 @IsIn(['SUPPLIES','SALARIES','UTILITIES','RENT','MAINTENANCE','OTHER']) category!: string;
 @IsInt() @Min(1) @Max(1000000000) amountCents!: number;
 @IsString() @MinLength(1) @MaxLength(100) reference!: string;
 @IsDateString() incurredAt!: string;
}

export class StaffRoleDto {
  @IsIn(['CLINIC_ADMIN','RECEPTIONIST','CASHIER','ATTENDANT','PHARMACIST','LAB_TECHNICIAN','CLINICIAN_1','CLINICIAN_2','CLINICIAN_3','RECOVERY_NURSE','CATERING_STAFF','ACCOUNTANT','PROCUREMENT_OFFICER'])
  role!: string;
}
