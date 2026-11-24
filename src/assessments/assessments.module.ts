import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ScoringModule } from '../scoring/scoring.module';
import {
  AssessmentsController,
  AssignmentsController,
  AttemptsController,
  QuestionsOptionsController,
  UserAttemptsController,
} from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  imports: [PrismaModule, ScoringModule],
  controllers: [
    AssessmentsController,
    QuestionsOptionsController,
    AssignmentsController,
    AttemptsController,
    UserAttemptsController,
  ],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
