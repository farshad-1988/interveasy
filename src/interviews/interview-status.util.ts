import { InterviewStatus } from '../generated/prisma/enums';

const ALLOWED: Record<InterviewStatus, InterviewStatus[]> = {
  [InterviewStatus.PENDING]: [
    InterviewStatus.CONFIRMED,
    InterviewStatus.REJECTED,
    InterviewStatus.CANCELLED,
  ],
  [InterviewStatus.CONFIRMED]: [
    InterviewStatus.CANCELLED,
    InterviewStatus.COMPLETED,
    InterviewStatus.NO_SHOW,
  ],
  [InterviewStatus.REJECTED]: [],
  [InterviewStatus.CANCELLED]: [],
  [InterviewStatus.COMPLETED]: [],
  [InterviewStatus.NO_SHOW]: [],
};

export function canTransition(
  from: InterviewStatus,
  to: InterviewStatus,
): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
export function getAllowedTransitions(
  from: InterviewStatus,
): InterviewStatus[] {
  return [...(ALLOWED[from] ?? [])];
}
