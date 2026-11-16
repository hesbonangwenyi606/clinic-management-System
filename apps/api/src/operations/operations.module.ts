import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { StaffRoleDto, ExpenseDto, AppointmentDto, AppointmentStatusDto, CareDto, InvoiceDto, LabDto, MovementDto, PaymentDto, PrescriptionDto, ResultDto, StaffDto, StockDto } from './operations.dto';
import { OperationsService } from './operations.service';
@Controller('operations')
class OperationsController {
  constructor(private readonly service: OperationsService) {}
  @Get('portal') portal(@CurrentUser() u: AuthenticatedUser) { return this.service.portal(u); }
  @Post('expenses') expense(@Body() d: ExpenseDto, @CurrentUser() u: AuthenticatedUser) { return this.service.expense(d,u); }
  @Get('reports') reports(@CurrentUser() u: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string, @Query('status') status?: string, @Query('department') department?: string, @Query('method') method?: string) { return this.service.reports(u,{from,to,status,department,method}); }
  @Get(':area') list(@Param('area') area: string, @CurrentUser() u: AuthenticatedUser) { return this.service.list(area,u); }
  @Post('care') care(@Body() d: CareDto, @CurrentUser() u: AuthenticatedUser) { return this.service.care(d,u); }
  @Post('labs') lab(@Body() d: LabDto, @CurrentUser() u: AuthenticatedUser) { return this.service.lab(d,u); }
  @Post('labs/:id/result') result(@Param('id',ParseUUIDPipe) id: string, @Body() d: ResultDto, @CurrentUser() u: AuthenticatedUser) { return this.service.result(id,d.result,u); }
  @Post('stock') stock(@Body() d: StockDto, @CurrentUser() u: AuthenticatedUser) { return this.service.stock(d,u); }
  @Post('stock/:id/movements') movement(@Param('id',ParseUUIDPipe) id: string, @Body() d: MovementDto, @CurrentUser() u: AuthenticatedUser) { return this.service.movement(id,d,u); }
  @Post('prescriptions') prescribe(@Body() d: PrescriptionDto, @CurrentUser() u: AuthenticatedUser) { return this.service.prescribe(d,u); }
  @Post('prescriptions/:id/dispense') dispense(@Param('id',ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) { return this.service.dispense(id,u); }
  @Post('invoices') invoice(@Body() d: InvoiceDto, @CurrentUser() u: AuthenticatedUser) { return this.service.invoice(d,u); }
  @Post('invoices/:id/payments') payment(@Param('id',ParseUUIDPipe) id: string, @Body() d: PaymentDto, @CurrentUser() u: AuthenticatedUser) { return this.service.payment(id,d,u); }
  @Post('appointments') appointment(@Body() d: AppointmentDto, @CurrentUser() u: AuthenticatedUser) { return this.service.appointment(d,u); }
  @Post('appointments/:id/status') appointmentStatus(@Param('id',ParseUUIDPipe) id: string, @Body() d: AppointmentStatusDto, @CurrentUser() u: AuthenticatedUser) { return this.service.appointmentStatus(id,d.status,u); }
  @Post('staff') staff(@Body() d: StaffDto, @CurrentUser() u: AuthenticatedUser) { return this.service.staff(d,u); }
  @Post('staff/:id/role') updateRole(@Param('id',ParseUUIDPipe) id: string, @Body() d: StaffRoleDto, @CurrentUser() u: AuthenticatedUser) { return this.service.updateRole(id,d.role,u); }
  @Post('staff/:id/deactivate') deactivate(@Param('id',ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) { return this.service.deactivate(id,u); }
}
@Module({ controllers:[OperationsController], providers:[OperationsService] })
export class OperationsModule {}
