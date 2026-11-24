import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AssessmentsModule } from './assessments/assessments.module';
import { AuthModule } from './auth/auth.module';
import { validate } from './config/env.validation';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { FeedbackModule } from './feedback/feedback.module';
import { InterviewsModule } from './interviews/interviews.module';
import { LeadsModule } from './leads/leads.module';
import { ModulesModule } from './modules/modules.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgramsModule } from './programs/programs.module';
import { ProgressModule } from './progress/progress.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ThrottlerModule.forRoot({
      skipIf: () => process.env.DISABLE_AUTH_THROTTLE === 'true',
      throttlers: [
        {
          name: 'default',
          ttl: 60000,
          limit: 100,
        },
      ],
    }),
    UsersModule,
    PrismaModule,
    AuthModule,
    ProgramsModule,
    ModulesModule,
    TasksModule,
    EnrollmentsModule,
    ProgressModule,
    InterviewsModule,
    FeedbackModule,
    LeadsModule,
    AssessmentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
