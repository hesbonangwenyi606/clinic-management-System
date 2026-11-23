import {Body,Controller,Get,Module,Param,ParseUUIDPipe,Post,Query} from '@nestjs/common';
import {UserRole} from '@prisma/client';
import {ADMIN_ROLES,CLINICIAN_ROLES,rolesFor} from '@cms/access';
import {CurrentUser} from '../auth/current-user.decorator';
import {AuthenticatedUser} from '../auth/auth.types';
import {Roles} from '../auth/roles.decorator';
import {OperationsModule} from '../operations/operations.module';
import {ListQuery} from '../common/pagination';
import {AdmitDto,AmendmentDto,BedDto,DischargeDto,ReasonDto,TransferDto} from './workflows.dto';
import {WorkflowsService} from './workflows.service';
const clinical=[...ADMIN_ROLES,...CLINICIAN_ROLES] as UserRole[];
const nursing=[...clinical,'RECOVERY_NURSE'] as UserRole[];
@Controller('workflows')
class WorkflowsController {
  constructor(private readonly service:WorkflowsService){}
  @Get('beds') @Roles(...nursing) beds(){return this.service.beds();}
  @Post('beds') @Roles(...ADMIN_ROLES as UserRole[]) bed(@Body() data:BedDto,@CurrentUser() user:AuthenticatedUser){return this.service.bed(data,user);}
  @Get('clinicians') @Roles(...nursing) clinicians(){return this.service.clinicians();}
  @Get('admissions') @Roles(...nursing) admissions(@Query() query:ListQuery){return this.service.admissions(query);}
  @Post('admissions') @Roles(...clinical) admit(@Body() data:AdmitDto,@CurrentUser() user:AuthenticatedUser){return this.service.admit(data,user);}
  @Post('admissions/:id/transfer') @Roles(...nursing) transfer(@Param('id',ParseUUIDPipe) id:string,@Body() data:TransferDto,@CurrentUser() user:AuthenticatedUser){return this.service.transfer(id,data,user);}
  @Post('admissions/:id/discharge') @Roles(...clinical) discharge(@Param('id',ParseUUIDPipe) id:string,@Body() data:DischargeDto,@CurrentUser() user:AuthenticatedUser){return this.service.discharge(id,data,user);}
  @Post('care/:id/amendments') @Roles(...rolesFor('care.read') as UserRole[]) care(@Param('id',ParseUUIDPipe) id:string,@Body() data:AmendmentDto,@CurrentUser() user:AuthenticatedUser){return this.service.amend('care',id,data,user);}
  @Post('labs/:id/amendments') @Roles(...rolesFor('labs.result') as UserRole[]) lab(@Param('id',ParseUUIDPipe) id:string,@Body() data:AmendmentDto,@CurrentUser() user:AuthenticatedUser){return this.service.amend('labs',id,data,user);}
  @Post('payments/:id/reverse') @Roles(...[...ADMIN_ROLES,'ACCOUNTANT'] as UserRole[]) reverse(@Param('id',ParseUUIDPipe) id:string,@Body() data:ReasonDto,@CurrentUser() user:AuthenticatedUser){return this.service.reverse(id,data.reason,user);}
  @Get('chart/:id') @Roles(...rolesFor('patients.read') as UserRole[]) chart(@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthenticatedUser){return this.service.chart(id,user);}
}
@Module({imports:[OperationsModule],controllers:[WorkflowsController],providers:[WorkflowsService]})
export class WorkflowsModule {}
