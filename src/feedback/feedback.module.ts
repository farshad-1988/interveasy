import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  FeedbackAnalyticsController,
  FeedbackController,
  InterviewsFeedbackController,
  SessionsFeedbackController,
  UserFeedbackController,
} from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    FeedbackController,
    InterviewsFeedbackController,
    SessionsFeedbackController,
    UserFeedbackController,
    FeedbackAnalyticsController,
  ],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
