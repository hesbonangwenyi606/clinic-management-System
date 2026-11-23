import {IsDateString,IsOptional} from 'class-validator';
import {CreatePatientDto} from './create-patient.dto';

export class UpdatePatientDto extends CreatePatientDto {
  @IsOptional() declare firstName:string;
  @IsOptional() declare lastName:string;
  @IsOptional() @IsDateString() expectedUpdatedAt?:string;
}
