import { Module } from '@nestjs/common';
import { LevelMappingService } from './level-mapping.service';
import { ScoringService } from './scoring.service';

@Module({
  providers: [ScoringService, LevelMappingService],
  exports: [ScoringService, LevelMappingService],
})
export class ScoringModule {}
