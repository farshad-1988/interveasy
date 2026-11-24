import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  AdminLeadsQueryDto,
  AssignLeadDto,
  CreateDemoRequestDto,
  CreateLeadDto,
  UpdateLeadDto,
  UpdateLeadStatusDto,
} from './dto/lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('Public - Demo Requests')
@Controller('demo-requests')
export class DemoRequestsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit a public demo request (lead generation)',
    description:
      'Allows prospective enterprise and team customers to request an Interveasy demo. Normalizes email and prevents concurrent duplicate submissions.',
  })
  @ApiResponse({
    status: 201,
    description: 'Demo request successfully received',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (e.g., invalid email format)',
  })
  @ApiResponse({
    status: 409,
    description:
      'An active demo request with this email is already being processed',
  })
  create(@Body() dto: CreateDemoRequestDto, @Ip() ipAddress: string) {
    return this.leadsService.submitDemoRequest(dto, ipAddress);
  }
}

@ApiTags('Admin - Leads & CRM')
@ApiBearerAuth()
@Controller('admin/leads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new CRM lead manually (Admin only)',
  })
  @ApiResponse({ status: 201, description: 'Lead created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Assignee user not found' })
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.createLead(dto);
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get CRM lead analytics and conversion statistics (Admin only)',
    description:
      'Provides status distributions, conversion rates, source acquisition breakdowns, and monthly creation trends.',
  })
  @ApiResponse({ status: 200, description: 'Aggregated CRM analytics' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  getAnalytics(@Query('from') from?: string, @Query('to') to?: string) {
    return this.leadsService.getLeadAnalytics({ from, to });
  }

  @Get()
  @ApiOperation({
    summary:
      'List leads with filtering, search, pagination, and sorting (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of leads' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  findAll(@Query() query: AdminLeadsQueryDto) {
    return this.leadsService.getLeads(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get lead details by UUID (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Lead details' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.leadsService.getLeadById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update lead details (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Updated lead' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Lead or assignee not found' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.updateLead(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Update lead lifecycle status and administrative notes (Admin only)',
    description:
      'Enforces strict status transition rules (e.g., NEW -> CONTACTED -> QUALIFIED -> CONVERTED).',
  })
  @ApiResponse({ status: 200, description: 'Updated lead' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.leadsService.updateLeadStatus(id, dto);
  }

  @Patch(':id/assign')
  @ApiOperation({
    summary: 'Assign or unassign a lead to a team member (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Lead assignment updated' })
  @ApiResponse({ status: 404, description: 'Lead or assignee not found' })
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignLeadDto,
  ) {
    return this.leadsService.assignLead(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Permanently delete a lead (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Lead deleted' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete a converted lead',
  })
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.leadsService.deleteLead(id);
  }
}
