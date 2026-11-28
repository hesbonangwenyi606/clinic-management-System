import { Gender } from '@prisma/client';
import { IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @Matches(/^\p{L}[\p{L}\p{M}]*$/u, { message: 'First name must contain letters only.' })
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @Matches(/^\p{L}[\p{L}\p{M}]*$/u, { message: 'Last name must contain letters only.' })
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  age?: number | null;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,13}$/, { message: 'Emergency contact must contain 7 to 13 digits, optionally starting with +.' })
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nextOfKin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  medicalAlerts?: string;
}
