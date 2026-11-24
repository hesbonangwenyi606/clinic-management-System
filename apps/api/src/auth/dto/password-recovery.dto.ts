import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RequestRecoveryDto {
  @IsEmail() @MaxLength(254) email!: string;
}

export class ResetRecoveryDto extends RequestRecoveryDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
  @IsString() @MinLength(6) @MaxLength(72) password!: string;
}
