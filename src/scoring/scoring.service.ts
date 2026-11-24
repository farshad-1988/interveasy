/**
 * @file scoring.service.ts
 * @description Pure scoring engine for evaluating candidate assessment answers.
 *
 * Design principles:
 * 1. Pure & Deterministic: Same answers + same questions always produce the exact same score.
 * 2. Order-Insensitive: In multiple-choice questions, option selection order does not affect correctness.
 * 3. Server-Side Verification: Answer correctness is evaluated purely on the backend. Correct answers
 *    are never sent to the client during assessment taking.
 */

import { Injectable } from '@nestjs/common';
import { QuestionType } from '../generated/prisma/enums';

/** Result of scoring an individual question attempt */
export type ScoreResult = {
  /** Whether the user's selected answers matched the correct option(s) */
  isCorrect: boolean;
  /** Points awarded (either full points or 0) */
  earnedPoints: number;
};

@Injectable()
export class ScoringService {
  /**
   * Deterministic, pure scoring for a single question attempt.
   *
   * Handles:
   * - SINGLE_CHOICE / TRUE_FALSE: exactly one selection that must match the single correct option
   * - MULTIPLE_CHOICE: user selections must match the exact set of correct options (no missing, no extra)
   *
   * @param questionType Type of question (SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE)
   * @param selectedOptionIds Array of option UUIDs selected by the candidate
   * @param correctOptionIds Array of option UUIDs that are marked correct in the database
   * @param points Maximum point value assigned to this question
   */
  calculateQuestionScore(
    questionType: QuestionType,
    selectedOptionIds: string[],
    correctOptionIds: string[],
    points: number,
  ): ScoreResult {
    // Guard against non-numeric or negative points
    const safePoints = Number.isFinite(points) && points > 0 ? points : 0;
    const selected = this.normalizeIds(selectedOptionIds);
    const correct = this.normalizeIds(correctOptionIds);

    let isCorrect = false;

    switch (questionType) {
      case QuestionType.SINGLE_CHOICE:
      case QuestionType.TRUE_FALSE:
        // Single choice requires exactly 1 selection matching exactly 1 correct answer
        isCorrect =
          selected.length === 1 &&
          correct.length === 1 &&
          selected[0] === correct[0];
        break;
      case QuestionType.MULTIPLE_CHOICE:
        // Multiple choice requires matching the complete set of correct answers
        isCorrect = this.sameSet(selected, correct) && correct.length > 0;
        break;
      default:
        isCorrect = false;
    }

    return {
      isCorrect,
      earnedPoints: isCorrect ? safePoints : 0,
    };
  }

  /**
   * Calculates overall percentage score rounded to two decimal places.
   *
   * @param earnedPoints Total points earned across all questions
   * @param totalPossiblePoints Total points available across all questions
   */
  calculatePercentage(
    earnedPoints: number,
    totalPossiblePoints: number,
  ): number {
    if (!Number.isFinite(totalPossiblePoints) || totalPossiblePoints <= 0) {
      return 0;
    }
    const safeEarned =
      Number.isFinite(earnedPoints) && earnedPoints > 0 ? earnedPoints : 0;
    const raw = (safeEarned / totalPossiblePoints) * 100;
    return this.round(raw, 2);
  }

  /**
   * Normalizes an array of ID strings by deduplicating and sorting.
   * Deduplication prevents inflated counts if the client sends duplicate IDs.
   * Sorting ensures canonical order for set comparison.
   */
  private normalizeIds(ids: string[] | undefined | null): string[] {
    if (!Array.isArray(ids)) return [];
    const unique = Array.from(
      new Set(ids.filter((id) => typeof id === 'string')),
    );
    unique.sort();
    return unique;
  }

  /**
   * Compares two sorted arrays to verify they contain identical elements.
   */
  private sameSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Rounds a number to a fixed number of decimal places avoiding floating-point precision errors.
   */
  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }
}
