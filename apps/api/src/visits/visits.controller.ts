import { rolesFor } from '@cms/access';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitStatusDto } from './dto/update-visit-status.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { ListQuery } from '../common/pagination';
import { VisitsService } from './visits.service';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  @Roles(...(rolesFor('visits.read') as UserRole[]))
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListQuery) {
    return this.visits.list(query.status,user.role,query);
  }
  @Get('summary')
  @Roles(...(rolesFor('visits.read') as UserRole[]))
  summary() { return this.visits.summary(); }

  @Post()
  @Roles(...(rolesFor('visits.create') as UserRole[]))
  create(@Body() body: CreateVisitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visits.create(body, user.sub);
  }

  @Get(':id/history')
  @Roles(...(rolesFor('visits.history') as UserRole[]))
  history(@Param('id', ParseUUIDPipe) id: string) { return this.visits.history(id); }

  @Delete(':id')
  @Roles(...(rolesFor('visits.delete') as UserRole[]))
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return this.visits.remove(id,user.sub); }

  @Patch(':id')
  @Roles(...(rolesFor('visits.update') as UserRole[]))
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateVisitDto, @CurrentUser() user: AuthenticatedUser) { return this.visits.update(id,body,user.sub); }

  @Post(':id/status')
  @Roles(...(rolesFor('visits.status') as UserRole[]))
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateVisitStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visits.updateStatus(id, body, user.sub, user.role);
  }
}
