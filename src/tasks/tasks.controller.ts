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
import { CreateTaskDto, TaskQueryDto, UpdateTaskDto } from './dto/task.dto';
import { TasksService } from './tasks.service';

@ApiTags('LMS - Tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a task in a module (Admin only)' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all tasks across modules' })
  @ApiResponse({ status: 200, description: 'Paginated tasks' })
  findAll(@Query() query: TaskQueryDto) {
    return this.tasksService.findAll(query);
  }

  @Get('by-module/:moduleId')
  @ApiOperation({ summary: 'Get tasks for a specific module' })
  @ApiResponse({ status: 200, description: 'Ordered list of module tasks' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  findByModule(@Param('moduleId', new ParseUUIDPipe()) moduleId: string) {
    return this.tasksService.findByModule(moduleId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details by ID' })
  @ApiResponse({ status: 200, description: 'Task details' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update task (Admin only)' })
  @ApiResponse({ status: 200, description: 'Task updated' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete task (Admin only)' })
  @ApiResponse({ status: 200, description: 'Task deleted' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete task with user progress',
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasksService.remove(id);
  }
}
