import {Transform} from 'class-transformer';
import {IsString,IsUUID,MinLength,MaxLength} from 'class-validator';

export class BedDto {
  @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(1) @MaxLength(80) ward!:string;
  @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(1) @MaxLength(80) name!:string;
}
export class AdmitDto {
  @IsUUID() visitId!:string;
  @IsUUID() bedId!:string;
  @IsUUID() clinicianId!:string;
  @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(1) @MaxLength(2000) reason!:string;
}
export class TransferDto {
  @IsUUID() bedId!:string;
  @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(1) @MaxLength(2000) reason!:string;
}
export class DischargeDto {
  @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(10) @MaxLength(10000) summary!:string;
}
export class ReasonDto {
  @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(5) @MaxLength(2000) reason!:string;
}
export class AmendmentDto extends ReasonDto {
  @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(1) @MaxLength(10000) text!:string;
}
