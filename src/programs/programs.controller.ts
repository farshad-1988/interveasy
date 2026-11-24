import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateProgramDto } from './dto/create-program.dto';
import { ProgramQueryDto } from './dto/program-query.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { ProgramsService } from './programs.service';

@ApiTags('LMS - Programs')
@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new training program (Admin only)' })
  @ApiResponse({ status: 201, description: 'Program created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 409, description: 'Program slug already exists' })
  create(@Body() dto: CreateProgramDto) {
    return this.programsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all training programs (Paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated programs' })
  findAll(@Query() query: ProgramQueryDto) {
    return this.programsService.findAll(query);
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get program details by UUID or unique slug' })
  @ApiResponse({
    status: 200,
    description: 'Program details with modules and tasks',
  })
  @ApiResponse({ status: 404, description: 'Program not found' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.programsService.findOne(idOrSlug);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update program by UUID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Program updated' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProgramDto,
  ) {
    return this.programsService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete program by UUID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Program deleted' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete program with active enrollments',
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.programsService.remove(id);
  }
}
