import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AdminLeadsController,
  DemoRequestsController,
} from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [PrismaModule],
  controllers: [DemoRequestsController, AdminLeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
