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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  AdminFeedbackQueryDto,
  CreateFeedbackDto,
  FeedbackAnalyticsQueryDto,
  FeedbackQueryDto,
  UpdateFeedbackDto,
} from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('Interviews - Feedback')
@ApiBearerAuth()
@Controller('interviews')
@UseGuards(JwtAuthGuard)
export class InterviewsFeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post(':id/feedback')
  @ApiOperation({
    summary: 'Submit feedback for an interview participant',
    description:
      'Allows an interview participant to evaluate their peer across categories (TECHNICAL, COMMUNICATION, etc.). Enforces 1 feedback per category per interview.',
  })
  @ApiResponse({ status: 201, description: 'Feedback successfully submitted' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or self-feedback attempted',
  })
  @ApiResponse({
    status: 403,
    description: 'User was not a participant in this interview',
  })
  @ApiResponse({ status: 404, description: 'Interview not found' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate feedback already submitted for this category',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedbackService.createFeedback(user, id, dto);
  }

  @Get(':id/feedback')
  @ApiOperation({
    summary: 'List feedback for an interview session',
    description:
      'Returns all feedback submitted for this interview (participants or admin only).',
  })
  @ApiResponse({ status: 200, description: 'List of interview feedback' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Interview not found' })
  getInterviewFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.feedbackService.getInterviewFeedback(user, id);
  }
}

@ApiTags('Sessions - Feedback')
@ApiBearerAuth()
@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsFeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post(':id/feedback')
  @ApiOperation({
    summary:
      'Submit feedback for a session (alias for /interviews/:id/feedback)',
  })
  @ApiResponse({ status: 201, description: 'Feedback successfully submitted' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedbackService.createFeedback(user, id, dto);
  }
}

@ApiTags('Feedback')
@ApiBearerAuth()
@Controller('feedback')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List all feedback records across platform (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Paginated feedback records' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  findAll(@Query() query: AdminFeedbackQueryDto) {
    return this.feedbackService.getAllFeedback(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get feedback details by ID (Participant or Admin)',
  })
  @ApiResponse({ status: 200, description: 'Feedback details' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Feedback not found' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.feedbackService.getFeedbackById(user, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update feedback rating or commentary (Author or Admin)',
  })
  @ApiResponse({ status: 200, description: 'Feedback updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Feedback not found' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFeedbackDto,
  ) {
    return this.feedbackService.updateFeedback(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete feedback record (Author or Admin)' })
  @ApiResponse({ status: 200, description: 'Feedback deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Feedback not found' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.feedbackService.deleteFeedback(user, id);
  }
}

@ApiTags('User Profile & Performance')
@ApiBearerAuth()
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UserFeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get('feedback')
  @ApiOperation({
    summary: 'Get received feedback for the authenticated user',
    description:
      'Returns paginated list of feedback received by the logged-in candidate with author and interview details.',
  })
  @ApiResponse({ status: 200, description: 'Paginated feedback records' })
  getMyFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FeedbackQueryDto,
  ) {
    return this.feedbackService.getMyFeedback(user, query);
  }

  @Get('performance')
  @ApiOperation({
    summary: 'Get performance statistics for the authenticated user',
    description:
      'Calculates database-aggregated performance metrics: overall average score, min/max, and category-level breakdown.',
  })
  @ApiResponse({ status: 200, description: 'Performance report summary' })
  getMyPerformance(@CurrentUser() user: AuthenticatedUser) {
    return this.feedbackService.getMyPerformance(user);
  }
}

@ApiTags('Admin - Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class FeedbackAnalyticsController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get('feedback-by-category')
  @ApiOperation({
    summary: 'Get feedback aggregates grouped by category (Admin only)',
    description:
      'Performs SQL GROUP BY category aggregation across all interviews, with optional date filtering.',
  })
  @ApiResponse({ status: 200, description: 'Aggregated feedback by category' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  getFeedbackByCategory(@Query() query: FeedbackAnalyticsQueryDto) {
    return this.feedbackService.getFeedbackByCategory(query);
  }

  @Get('average-scores')
  @ApiOperation({
    summary: 'Get overall and category average score statistics (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Average scores and summary stats' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  getAverageScores(@Query() query: FeedbackAnalyticsQueryDto) {
    return this.feedbackService.getAverageScores(query);
  }

  @Get('trends')
  @ApiOperation({
    summary: 'Get monthly feedback scoring and volume trends (Admin only)',
    description:
      'Uses PostgreSQL DATE_TRUNC time-bucket grouping to surface historical performance trajectory.',
  })
  @ApiResponse({ status: 200, description: 'Trend time series data' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  getTrends(@Query() query: FeedbackAnalyticsQueryDto) {
    return this.feedbackService.getTrends(query);
  }
}
