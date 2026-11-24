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
import {
  CreateModuleDto,
  ModuleQueryDto,
  UpdateModuleDto,
} from './dto/module.dto';
import { ModulesService } from './modules.service';

@ApiTags('LMS - Modules')
@Controller('modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a module in a program (Admin only)' })
  @ApiResponse({ status: 201, description: 'Module created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  create(@Body() dto: CreateModuleDto) {
    return this.modulesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all modules across programs' })
  @ApiResponse({ status: 200, description: 'Paginated modules' })
  findAll(@Query() query: ModuleQueryDto) {
    return this.modulesService.findAll(query);
  }

  @Get('by-program/:programId')
  @ApiOperation({ summary: 'Get ordered modules for a specific program' })
  @ApiResponse({ status: 200, description: 'List of modules with tasks' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  findByProgram(@Param('programId', new ParseUUIDPipe()) programId: string) {
    return this.modulesService.findByProgram(programId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get module details by ID' })
  @ApiResponse({ status: 200, description: 'Module details with tasks' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.modulesService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update module (Admin only)' })
  @ApiResponse({ status: 200, description: 'Module updated' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateModuleDto,
  ) {
    return this.modulesService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete module (Admin only)' })
  @ApiResponse({ status: 200, description: 'Module deleted' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete module with user progress',
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.modulesService.remove(id);
  }
}
