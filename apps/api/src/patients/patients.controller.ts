import { rolesFor } from '@cms/access';
import { Controller, Patch, Delete, Get, Param, ParseUUIDPipe, Post, Query, Body } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @Roles(...(rolesFor('patients.read') as UserRole[]))
  list(
    @Query('search') search: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
  ) {
    return this.patients.list(search, page, pageSize);
  }

  @Get(':id')
  @Roles(...(rolesFor('patients.read') as UserRole[]))
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.patients.get(id,user.sub);
  }

  @Post()
  @Roles(...(rolesFor('patients.create') as UserRole[]))
  create(@Body() body: CreatePatientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.patients.create(body, user.sub);
  }
  @Patch(':id')
  @Roles(...(rolesFor('patients.update') as UserRole[]))
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePatientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.patients.update(id, body, user.sub);
  }

  @Delete(':id')
  @Roles(...(rolesFor('patients.delete') as UserRole[]))
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.patients.remove(id, user.sub);
  }

}
