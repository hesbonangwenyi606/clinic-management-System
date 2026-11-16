import { rolesFor } from '@cms/access';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitStatusDto } from './dto/update-visit-status.dto';
import { VisitsService } from './visits.service';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  @Roles(...(rolesFor('visits.read') as UserRole[]))
  list(@Query('status') status?: string) {
    return this.visits.list(status);
  }

  @Post()
  @Roles(...(rolesFor('visits.create') as UserRole[]))
  create(@Body() body: CreateVisitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visits.create(body, user.sub);
  }

  @Get(':id/history')
  @Roles(...(rolesFor('visits.history') as UserRole[]))
  history(@Param('id', ParseUUIDPipe) id: string) { return this.visits.history(id); }

  @Post(':id/status')
  @Roles(...(rolesFor('visits.status') as UserRole[]))
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateVisitStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visits.updateStatus(id, body, user.sub);
  }
}
