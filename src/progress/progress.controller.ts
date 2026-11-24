import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CompleteTaskDto } from './dto/progress.dto';
import { ProgressService } from './progress.service';

@ApiTags('LMS - Progress')
@ApiBearerAuth()
@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Post('complete')
  @ApiOperation({ summary: 'Mark a task as completed' })
  @ApiResponse({ status: 200, description: 'Task marked as completed' })
  @ApiResponse({ status: 400, description: 'Enrollment cancelled' })
  @ApiResponse({ status: 403, description: 'Not enrolled in program' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.progressService.markCompleted(user, dto.taskId);
  }

  @Post('incomplete')
  @ApiOperation({ summary: 'Mark a task as incomplete' })
  @ApiResponse({ status: 200, description: 'Task marked as incomplete' })
  @ApiResponse({ status: 400, description: 'Enrollment cancelled' })
  @ApiResponse({ status: 403, description: 'Not enrolled in program' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  incomplete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.progressService.markIncomplete(user, dto.taskId);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get current user progress across all or specific program',
  })
  @ApiResponse({ status: 200, description: 'User progress reports' })
  getMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('programId') programId?: string,
  ) {
    return this.progressService.getMyProgress(user, { programId });
  }

  @Get('program/:programId')
  @ApiOperation({ summary: 'Get user progress for an entire program' })
  @ApiResponse({
    status: 200,
    description: 'Program progress with module and task breakdown',
  })
  @ApiResponse({ status: 403, description: 'Not enrolled in program' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  getProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Param('programId', new ParseUUIDPipe()) programId: string,
  ) {
    return this.progressService.getProgramProgress(user, programId);
  }

  @Get('module/:moduleId')
  @ApiOperation({ summary: 'Get user progress for a specific module' })
  @ApiResponse({ status: 200, description: 'Module progress' })
  @ApiResponse({ status: 403, description: 'Not enrolled in program' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  getModule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleId', new ParseUUIDPipe()) moduleId: string,
  ) {
    return this.progressService.getModuleProgress(user, moduleId);
  }

  @Delete('task/:taskId')
  @ApiOperation({ summary: 'Reset progress for a specific task' })
  @ApiResponse({ status: 200, description: 'Task progress reset' })
  @ApiResponse({ status: 403, description: 'Not enrolled' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  resetTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ) {
    return this.progressService.resetTaskProgress(user, taskId);
  }

  @Delete('program/:programId')
  @ApiOperation({ summary: 'Reset progress for all tasks in a program' })
  @ApiResponse({ status: 200, description: 'Program progress reset' })
  @ApiResponse({ status: 403, description: 'Not enrolled' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  resetProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Param('programId', new ParseUUIDPipe()) programId: string,
  ) {
    return this.progressService.resetProgramProgress(user, programId);
  }
}
