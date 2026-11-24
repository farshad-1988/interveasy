/**
 * @file level-mapping.service.ts
 * @description Maps numerical assessment percentage scores to human-readable skill tiers.
 *
 * Skill tier thresholds:
 * - 0%  - 49% : BEGINNER      (Foundational understanding, needs guided practice)
 * - 50% - 74% : INTERMEDIATE  (Competent with core concepts, ready for mock interviews)
 * - 75% - 89% : ADVANCED      (Strong proficiency, capable of explaining tradeoffs)
 * - 90% - 100%: EXPERT        (Deep architectural mastery, ready for senior-level rounds)
 */

import { Injectable } from '@nestjs/common';

/** Definition for a skill level threshold range */
export type LevelThreshold = {
  name: string;
  min: number;
  max: number;
};

/** Default tier configuration */
export const DEFAULT_LEVEL_THRESHOLDS: LevelThreshold[] = [
  { name: 'BEGINNER', min: 0, max: 49 },
  { name: 'INTERMEDIATE', min: 50, max: 74 },
  { name: 'ADVANCED', min: 75, max: 89 },
  { name: 'EXPERT', min: 90, max: 100 },
];

@Injectable()
export class LevelMappingService {
  private readonly thresholds: LevelThreshold[];

  constructor() {
    this.thresholds = DEFAULT_LEVEL_THRESHOLDS;
  }

  /**
   * Maps a percentage score (0-100) to its corresponding skill level name.
   *
   * Handles edge cases:
   * - Clamps values below 0 to 0 and above 100 to 100
   * - Defaults NaN / non-finite values to BEGINNER
   *
   * @param percentage Number between 0 and 100
   * @returns String skill level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT'
   */
  scoreToLevel(percentage: number): string {
    const value = Number.isFinite(percentage) ? percentage : 0;
    const clamped = Math.min(100, Math.max(0, value));
    for (const t of this.thresholds) {
      if (clamped >= t.min && clamped <= t.max) {
        return t.name;
      }
    }
    return clamped >= 100 ? 'EXPERT' : 'BEGINNER';
  }

  /**
   * Returns a copy of the active threshold configuration.
   */
  getThresholds(): LevelThreshold[] {
    return [...this.thresholds];
  }
}
