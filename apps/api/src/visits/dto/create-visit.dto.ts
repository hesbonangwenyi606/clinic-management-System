import { VisitType } from '@prisma/client';
import { IsEnum, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateVisitDto {
  @IsUUID()
  patientId!: string;

  @IsEnum(VisitType)
  type!: VisitType;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;
}
