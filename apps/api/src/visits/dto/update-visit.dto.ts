import { VisitType } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateVisitDto {
  @IsEnum(VisitType)
  type!: VisitType;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;
}
