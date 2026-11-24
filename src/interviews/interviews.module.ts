import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InterviewAvailabilityController } from './interview-availability.controller';
import {
  InterviewersController,
  InterviewsController,
  UserInterviewsController,
} from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    InterviewsController,
    UserInterviewsController,
    InterviewersController,
    InterviewAvailabilityController,
  ],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
