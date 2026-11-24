import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  AttemptStatus,
  Prisma,
  QuestionType,
  Role,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { LevelMappingService } from '../scoring/level-mapping.service';
import {
  buildPaginationMeta,
  getSkipTake,
  PaginatedResponse,
} from '../common/utils/pagination.util';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  AssessmentQueryDto,
  CreateAssessmentDto,
  CreateAssignmentDto,
  CreateOptionDto,
  CreateQuestionDto,
  SaveAnswerDto,
  UpdateAssessmentDto,
  UpdateAssignmentDto,
  UpdateOptionDto,
  UpdateQuestionDto,
} from './dto/assessment.dto';

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly levelMappingService: LevelMappingService,
  ) {}

  // ─── Assessment CRUD ────────────────────────────────────────────────────────

  async create(dto: CreateAssessmentDto) {
    return this.prisma.assessment.create({
      data: {
        title: dto.title,
        description: dto.description,
        instructions: dto.instructions,
        durationMinutes: dto.durationMinutes,
        passingScore: dto.passingScore,
        isPublished: false,
      },
    });
  }

  /**
   * Returns a paginated list of assessments.
   *
   * - Regular users only see PUBLISHED assessments (security: drafts are hidden)
   * - Admins can see all assessments and can filter by published status
   * - Supports search by title or description, and sorting
   * - Uses a Prisma $transaction to run the COUNT and SELECT in one round-trip,
   *   which is more efficient than two separate database calls
   */
  async findAll(
    query: AssessmentQueryDto,
    isAdmin: boolean,
  ): Promise<PaginatedResponse<unknown>> {
    const { page, limit, search, sortBy, sortOrder } = query;
    const where: Prisma.AssessmentWhereInput = {};

    // Non-admins always get only published assessments
    if (!isAdmin) {
      where.isPublished = true;
    } else if (query.isPublished !== undefined) {
      where.isPublished = query.isPublished === 'true';
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Whitelist allowed sort fields to prevent SQL injection via dynamic ordering
    const orderField =
      sortBy && ['createdAt', 'title', 'updatedAt'].includes(sortBy)
        ? sortBy
        : 'createdAt';

    const [total, data] = await this.prisma.$transaction([
      this.prisma.assessment.count({ where }),
      this.prisma.assessment.findMany({
        where,
        orderBy: { [orderField]: sortOrder },
        include: {
          // _count gives us totals without loading all related records into memory
          _count: {
            select: { questions: true, attempts: true, assignments: true },
          },
        },
        ...getSkipTake(page, limit),
      }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  /**
   * Fetches one assessment with all its questions and options.
   *
   * Key security behaviour: the `isCorrect` field on each option is only
   * included when the caller is an admin. Regular users receive all options
   * but cannot see which one is correct — they must answer honestly.
   *
   * Also, unpublished assessments are hidden from regular users. We throw
   * NotFoundException (not ForbiddenException) intentionally, so the existence
   * of a draft assessment is not revealed.
   */
  async findOne(id: string, isAdmin: boolean) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                questionId: true,
                text: true,
                order: true,
                isCorrect: isAdmin, // Only admins see correct answers
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!assessment) throw new NotFoundException('Assessment not found');
    // Hide unpublished assessments from regular users (use 404, not 403, to avoid leaking existence)
    if (!isAdmin && !assessment.isPublished) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment;
  }

  async update(id: string, dto: UpdateAssessmentDto) {
    await this.ensureAssessmentExists(id);
    return this.prisma.assessment.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Deletes an assessment, but only if it has no SUBMITTED attempts.
   *
   * Why this guard? Submitted attempts are historical exam records. Deleting
   * the parent assessment would orphan those records and lose important data
   * (what questions were asked, what the user scored, etc.). Admins must keep
   * the assessment if any user has completed it.
   */
  async remove(id: string) {
    await this.ensureAssessmentExists(id);

    const submittedCount = await this.prisma.attempt.count({
      where: { assessmentId: id, status: AttemptStatus.SUBMITTED },
    });
    if (submittedCount > 0) {
      throw new ConflictException(
        `Cannot delete assessment with ${submittedCount} submitted attempt(s). Historical exam records must be preserved.`,
      );
    }

    await this.prisma.assessment.delete({ where: { id } });
    return { deleted: true, id };
  }

  /**
   * Publishes an assessment, making it visible and startable by assigned users.
   *
   * Before publishing, we run a full validation pass on every question:
   *   - Each question must have the correct number of options
   *   - Each question must have the right number of correct answers
   * This prevents candidates from encountering a broken question mid-exam.
   *
   * Publishing is a one-way workflow gate: once published, the assessment
   * can be unpublished, but its content (questions/options) should not be
   * changed while users are actively taking it.
   */
  async publish(id: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        questions: {
          include: { options: true },
        },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    if (assessment.questions.length === 0) {
      throw new BadRequestException(
        'Cannot publish an assessment with no questions',
      );
    }

    // Validate every question before publishing to prevent broken exams
    for (const q of assessment.questions) {
      this.validateQuestionOptions(q.type, q.options, q.title);
    }

    return this.prisma.assessment.update({
      where: { id },
      data: { isPublished: true },
    });
  }

  async unpublish(id: string) {
    await this.ensureAssessmentExists(id);
    return this.prisma.assessment.update({
      where: { id },
      data: { isPublished: false },
    });
  }

  // ─── Question CRUD ──────────────────────────────────────────────────────────

  /**
   * Adds a new question to an assessment.
   * Questions default to `isPublished: true`, meaning they appear immediately.
   * The `order` field controls display sequence; lower values come first.
   * `points` determines how much this question contributes to the total score.
   */
  async addQuestion(assessmentId: string, dto: CreateQuestionDto) {
    await this.ensureAssessmentExists(assessmentId);
    return this.prisma.question.create({
      data: {
        assessmentId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        points: dto.points ?? 1,
        order: dto.order ?? 0,
        isPublished: dto.isPublished ?? true,
      },
      include: { options: true },
    });
  }

  /**
   * Lists all questions for an assessment, ordered by their `order` field.
   * The `isCorrect` field on options is conditionally included:
   *   - Admins see correct answers (for editing and reviewing)
   *   - Regular users never see correctness flags (security boundary)
   */
  async getQuestions(assessmentId: string, isAdmin: boolean) {
    await this.ensureAssessmentExists(assessmentId);
    return this.prisma.question.findMany({
      where: { assessmentId, ...(isAdmin ? {} : { isPublished: true }) },
      orderBy: { order: 'asc' },
      include: {
        options: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            questionId: true,
            text: true,
            order: true,
            isCorrect: isAdmin,
          },
        },
      },
    });
  }

  async getQuestion(id: string, isAdmin: boolean) {
    const q = await this.prisma.question.findUnique({
      where: { id },
      include: {
        options: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            questionId: true,
            text: true,
            order: true,
            isCorrect: isAdmin,
          },
        },
      },
    });
    if (!q) throw new NotFoundException('Question not found');
    return q;
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto) {
    await this.ensureQuestionExists(id);
    return this.prisma.question.update({
      where: { id },
      data: dto,
      include: { options: true },
    });
  }

  async removeQuestion(id: string) {
    await this.ensureQuestionExists(id);
    await this.prisma.question.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ─── Option CRUD ────────────────────────────────────────────────────────────

  /**
   * Adds a possible answer option to a question.
   * The `isCorrect` flag tells the scoring engine whether this option counts
   * as a correct answer. For SINGLE_CHOICE, exactly one option should be
   * isCorrect = true. For MULTIPLE_CHOICE, one or more can be correct.
   * The `order` field controls display sequence.
   */
  async addOption(questionId: string, dto: CreateOptionDto) {
    await this.ensureQuestionExists(questionId);
    return this.prisma.option.create({
      data: {
        questionId,
        text: dto.text,
        isCorrect: dto.isCorrect,
        order: dto.order ?? 0,
      },
    });
  }

  async updateOption(id: string, dto: UpdateOptionDto) {
    const option = await this.prisma.option.findUnique({ where: { id } });
    if (!option) throw new NotFoundException('Option not found');

    return this.prisma.option.update({
      where: { id },
      data: dto,
    });
  }

  async removeOption(id: string) {
    const option = await this.prisma.option.findUnique({ where: { id } });
    if (!option) throw new NotFoundException('Option not found');

    await this.prisma.option.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ─── Assignments CRUD ───────────────────────────────────────────────────────

  /**
   * Assigns a published assessment to a specific user.
   *
   * Business rules enforced here:
   *   1. Only PUBLISHED assessments can be assigned (drafts aren't ready)
   *   2. The target user must exist
   *   3. A user cannot have two ACTIVE assignments for the same assessment
   *      (they must complete or be re-assigned after the previous one is done)
   *
   * The optional `dueAt` date sets a deadline; if passed, the user cannot
   * start a new attempt after that date.
   */
  async createAssignment(assessmentId: string, dto: CreateAssignmentDto) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (!assessment.isPublished) {
      throw new BadRequestException('Cannot assign an unpublished assessment');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) throw new NotFoundException('User not found');

    // Prevent duplicate active assignments for the same user and assessment
    const existing = await this.prisma.assessmentAssignment.findFirst({
      where: {
        assessmentId,
        userId: dto.userId,
        status: AssignmentStatus.ASSIGNED,
      },
    });
    if (existing) {
      throw new ConflictException(
        'User already has an active assignment for this assessment',
      );
    }

    return this.prisma.assessmentAssignment.create({
      data: {
        assessmentId,
        userId: dto.userId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        status: AssignmentStatus.ASSIGNED,
      },
      include: {
        assessment: {
          select: { id: true, title: true, durationMinutes: true },
        },
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  /** Returns all assessment assignments for the currently logged-in user. */
  async getMyAssignments(user: AuthenticatedUser) {
    return this.prisma.assessmentAssignment.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            description: true,
            durationMinutes: true,
            passingScore: true,
            isPublished: true,
          },
        },
      },
    });
  }

  async getAssessmentAssignments(assessmentId: string) {
    await this.ensureAssessmentExists(assessmentId);
    return this.prisma.assessmentAssignment.findMany({
      where: { assessmentId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async updateAssignment(id: string, dto: UpdateAssignmentDto) {
    const assignment = await this.prisma.assessmentAssignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    return this.prisma.assessmentAssignment.update({
      where: { id },
      data: {
        ...(dto.dueAt !== undefined
          ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async removeAssignment(id: string) {
    const assignment = await this.prisma.assessmentAssignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.prisma.assessmentAssignment.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ─── Attempts & Examination Flow ───────────────────────────────────────────

  /**
   * Starts a new exam attempt for the user. This is the most complex operation
   * in the system because it creates IMMUTABLE SNAPSHOTS of the question content.
   *
   * WHY SNAPSHOTS?
   * Imagine a user is mid-exam and an admin edits a question or deletes an option.
   * Without snapshots, the user's answers would reference options that no longer
   * exist, making grading impossible. By copying question and option data into
   * AttemptQuestion and AttemptOption tables at the moment the attempt starts,
   * we freeze the exam content in time. Even if the original changes later,
   * grading always works correctly against the snapshot.
   *
   * What this method does step by step:
   *   1. Load the assessment with all published questions and options
   *   2. Validate the assessment is published and has questions
   *   3. Check the user has an active, non-expired assignment (unless admin)
   *   4. Calculate the total possible points from all questions
   *   5. Set the expiry time (now + durationMinutes)
   *   6. Inside a database TRANSACTION:
   *      a. Create the Attempt record (status = IN_PROGRESS)
   *      b. For each question, create an AttemptQuestion (snapshot of q data)
   *      c. For each option, create an AttemptOption (snapshot of opt data,
   *         INCLUDING isCorrectSnapshot — hidden from users but used for grading)
   *   7. Return the full attempt via getAttempt (which strips correctness for users)
   */
  async startAttempt(user: AuthenticatedUser, assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        questions: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!assessment) throw new NotFoundException('Assessment not found');
    if (!assessment.isPublished) {
      throw new BadRequestException('Cannot start an unpublished assessment');
    }
    if (assessment.questions.length === 0) {
      throw new BadRequestException('Assessment has no published questions');
    }

    // Authorization policy: User must have an active assignment or be ADMIN
    if (user.role !== Role.ADMIN) {
      const assignment = await this.prisma.assessmentAssignment.findFirst({
        where: {
          assessmentId,
          userId: user.userId,
          status: AssignmentStatus.ASSIGNED,
        },
      });
      if (!assignment) {
        throw new ForbiddenException(
          'You do not have an active assignment for this assessment',
        );
      }
      if (assignment.dueAt && assignment.dueAt < new Date()) {
        throw new BadRequestException(
          'Assignment deadline has expired for this assessment',
        );
      }
    }

    const totalQuestions = assessment.questions.length;
    // Sum up all question point values to know the maximum achievable score
    const totalPossiblePoints = assessment.questions.reduce(
      (sum, q) => sum + (q.points > 0 ? q.points : 1),
      0,
    );

    const now = new Date();
    // If the assessment has a time limit, calculate when it expires
    const expiresAt = assessment.durationMinutes
      ? new Date(now.getTime() + assessment.durationMinutes * 60000)
      : null;

    // Transactionally create Attempt and snapshot all Questions & Options
    const attempt = await this.prisma.$transaction(async (tx) => {
      const createdAttempt = await tx.attempt.create({
        data: {
          userId: user.userId,
          assessmentId,
          status: AttemptStatus.IN_PROGRESS,
          startedAt: now,
          expiresAt,
          totalQuestions,
          totalPossiblePoints,
          score: 0,
          percentage: 0,
        },
      });

      // Create a frozen copy (snapshot) of each question for this attempt
      for (let i = 0; i < assessment.questions.length; i++) {
        const q = assessment.questions[i];
        const attemptQ = await tx.attemptQuestion.create({
          data: {
            attemptId: createdAttempt.id,
            originalQuestionId: q.id, // Reference to original (for traceability)
            titleSnapshot: q.title, // Frozen copy of question text
            typeSnapshot: q.type, // Frozen copy of question type
            pointsSnapshot: q.points, // Frozen copy of point value
            orderSnapshot: i, // Position in this attempt's question order
          },
        });

        // Create a frozen copy of each option for this question
        for (let j = 0; j < q.options.length; j++) {
          const opt = q.options[j];
          await tx.attemptOption.create({
            data: {
              attemptQuestionId: attemptQ.id,
              originalOptionId: opt.id, // Reference to original option
              textSnapshot: opt.text, // Frozen option text
              orderSnapshot: j, // Position in this attempt
              isCorrectSnapshot: opt.isCorrect, // Frozen correctness (used at grading time)
            },
          });
        }
      }

      return createdAttempt;
    });

    // Return the attempt through getAttempt, which applies the correctness-hiding logic
    return this.getAttempt(user, attempt.id);
  }

  /**
   * Fetches an attempt with all its snapshot questions and options.
   *
   * Important access rules:
   *   - Only the owner of the attempt or an ADMIN can view it
   *   - Regular users never see `isCorrectSnapshot` on options (even after submission)
   *   - For IN_PROGRESS attempts, users also cannot see `isCorrect` or `earnedPoints`
   *     on their answers (they can only see these after SUBMITTED)
   *   - If the attempt has expired (time ran out), it is auto-marked EXPIRED here
   */
  async getAttempt(user: AuthenticatedUser, attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            durationMinutes: true,
            passingScore: true,
          },
        },
        attemptQuestions: {
          orderBy: { orderSnapshot: 'asc' },
          include: {
            options: {
              orderBy: { orderSnapshot: 'asc' },
              select: {
                id: true,
                attemptQuestionId: true,
                textSnapshot: true,
                orderSnapshot: true,
                isCorrectSnapshot: true,
              },
            },
            answer: {
              select: {
                id: true,
                selectedOptionIds: true,
                isCorrect: true,
                earnedPoints: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied to this attempt');
    }

    // Strip correctness information for non-admins to preserve exam integrity
    if (user.role !== Role.ADMIN) {
      for (const q of attempt.attemptQuestions) {
        for (const opt of q.options) {
          delete (opt as Record<string, unknown>).isCorrectSnapshot;
        }
        if (attempt.status !== AttemptStatus.SUBMITTED && q.answer) {
          delete (q.answer as Record<string, unknown>).isCorrect;
          delete (q.answer as Record<string, unknown>).earnedPoints;
        }
      }
    }

    // Check expiration and auto-update status if time ran out
    if (
      attempt.status === AttemptStatus.IN_PROGRESS &&
      attempt.expiresAt &&
      attempt.expiresAt < new Date()
    ) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { status: AttemptStatus.EXPIRED },
      });
      attempt.status = AttemptStatus.EXPIRED;
    }

    return attempt;
  }

  /**
   * Saves (or updates) a user's answer for one question in an in-progress attempt.
   *
   * Key behaviours:
   *   - Only IN_PROGRESS attempts can receive answers (not SUBMITTED or EXPIRED)
   *   - If the attempt has expired, we auto-mark it EXPIRED and refuse the save
   *   - The `attemptQuestionId` must belong to this specific attempt (security check)
   *   - All selected option IDs must belong to that question's snapshot options
   *   - Uses UPSERT: if the user already answered this question, it updates;
   *     otherwise it creates a new answer. This allows changing answers before submit.
   *   - Answers are NOT scored here — scoring happens only at submission time.
   */
  async saveAnswer(
    user: AuthenticatedUser,
    attemptId: string,
    dto: SaveAnswerDto,
  ) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { id: true, userId: true, status: true, expiresAt: true },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied to this attempt');
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException(
        `Cannot save answers on an attempt in ${attempt.status} status`,
      );
    }

    // Check if time has run out before accepting new answers
    if (attempt.expiresAt && attempt.expiresAt < new Date()) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { status: AttemptStatus.EXPIRED },
      });
      throw new ConflictException('Attempt has expired');
    }

    // Security: verify the question belongs to THIS attempt (prevent answer injection)
    const attemptQuestion = await this.prisma.attemptQuestion.findUnique({
      where: { id: dto.attemptQuestionId },
      include: { options: true },
    });
    if (!attemptQuestion || attemptQuestion.attemptId !== attemptId) {
      throw new BadRequestException('Question does not belong to this attempt');
    }

    // Security: verify all selected options belong to THIS question (prevent option injection)
    const validOptionIds = new Set(attemptQuestion.options.map((o) => o.id));
    for (const optId of dto.selectedOptionIds) {
      if (!validOptionIds.has(optId)) {
        throw new BadRequestException(
          `Option ${optId} does not belong to this question`,
        );
      }
    }

    // Upsert: create the answer if it doesn't exist, or update it if it does
    return this.prisma.answer.upsert({
      where: { attemptQuestionId: dto.attemptQuestionId },
      update: {
        selectedOptionIds: dto.selectedOptionIds,
        answeredAt: new Date(),
      },
      create: {
        attemptQuestionId: dto.attemptQuestionId,
        selectedOptionIds: dto.selectedOptionIds,
        answeredAt: new Date(),
      },
    });
  }

  /**
   * Submits and grades the attempt — the final, irreversible step.
   *
   * This method does all grading INSIDE a database transaction to ensure
   * consistency: if any step fails, everything rolls back and no partial
   * results are saved.
   *
   * Grading process:
   *   1. Load the attempt with all snapshot questions and answers
   *   2. For each question, call ScoringService to determine:
   *      - Was it answered correctly? (exact match for SINGLE_CHOICE/TRUE_FALSE,
   *        full set match for MULTIPLE_CHOICE)
   *      - How many points did the user earn?
   *   3. If a question has no answer (the user skipped it), create an empty
   *      answer record with isCorrect = false and earnedPoints = 0
   *   4. Calculate the total percentage score
   *   5. Map the percentage to a skill level (e.g. "INTERMEDIATE")
   *   6. Update the Attempt with final score, percentage, level, and SUBMITTED status
   *   7. Mark the user's assignment as COMPLETED
   *
   * An attempt that is NOT IN_PROGRESS (already SUBMITTED or EXPIRED) cannot
   * be submitted again — this ensures exam results are immutable.
   */
  async submitAttempt(user: AuthenticatedUser, attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        attemptQuestions: {
          include: {
            options: true,
            answer: true,
          },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied to this attempt');
    }

    // Prevent double-submission: once submitted, results are final
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException(
        `Attempt is already in ${attempt.status} status`,
      );
    }

    if (attempt.expiresAt && attempt.expiresAt < new Date()) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { status: AttemptStatus.EXPIRED },
      });
      throw new ConflictException(
        'Attempt has expired and cannot be submitted',
      );
    }

    // Deterministic grading of each question
    let earnedPointsTotal = 0;

    return await this.prisma.$transaction(async (tx) => {
      for (const q of attempt.attemptQuestions) {
        // If the user didn't answer this question, treat as an empty selection
        const selectedOptionIds = q.answer?.selectedOptionIds ?? [];
        // Find which options in this snapshot are marked as correct
        const correctOptionIds = q.options
          .filter((opt) => opt.isCorrectSnapshot)
          .map((opt) => opt.id);

        // Delegate scoring logic to ScoringService (keeps this method clean)
        const scoreResult = this.scoringService.calculateQuestionScore(
          q.typeSnapshot,
          selectedOptionIds,
          correctOptionIds,
          q.pointsSnapshot,
        );

        earnedPointsTotal += scoreResult.earnedPoints;

        if (q.answer) {
          // Update the existing answer with grading results
          await tx.answer.update({
            where: { id: q.answer.id },
            data: {
              isCorrect: scoreResult.isCorrect,
              earnedPoints: scoreResult.earnedPoints,
            },
          });
        } else {
          // Create a zero-score answer record for unanswered questions
          await tx.answer.create({
            data: {
              attemptQuestionId: q.id,
              selectedOptionIds: [],
              isCorrect: false,
              earnedPoints: 0,
            },
          });
        }
      }

      // Calculate overall percentage from earned vs possible points
      const percentage = this.scoringService.calculatePercentage(
        earnedPointsTotal,
        attempt.totalPossiblePoints,
      );

      // Map the percentage into a human-readable skill level (e.g. "ADVANCED")
      const level = this.levelMappingService.scoreToLevel(percentage);

      const submitted = await tx.attempt.update({
        where: { id: attemptId },
        data: {
          status: AttemptStatus.SUBMITTED,
          submittedAt: new Date(),
          score: earnedPointsTotal,
          percentage,
          level,
        },
        include: {
          assessment: { select: { title: true, passingScore: true } },
        },
      });

      // Automatically mark the assignment COMPLETED so the user is not stuck
      // with an ASSIGNED status after finishing the exam
      await tx.assessmentAssignment.updateMany({
        where: {
          assessmentId: attempt.assessmentId,
          userId: user.userId,
          status: AssignmentStatus.ASSIGNED,
        },
        data: { status: AssignmentStatus.COMPLETED },
      });

      return {
        id: submitted.id,
        assessmentTitle: submitted.assessment.title,
        status: submitted.status,
        score: submitted.score,
        totalPossiblePoints: submitted.totalPossiblePoints,
        percentage: submitted.percentage,
        level: submitted.level,
        // `passed` is null if the assessment has no passing threshold defined
        passed:
          submitted.assessment.passingScore !== null
            ? submitted.percentage >= submitted.assessment.passingScore
            : null,
        submittedAt: submitted.submittedAt,
      };
    });
  }

  /**
   * Returns the final result summary for a SUBMITTED attempt.
   * Throws an error if the attempt has not been submitted yet — the result
   * is only meaningful after grading is complete.
   */
  async getAttemptResult(user: AuthenticatedUser, attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: { select: { title: true, passingScore: true } },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied to this attempt');
    }

    if (attempt.status !== AttemptStatus.SUBMITTED) {
      throw new BadRequestException('Attempt has not been submitted yet');
    }

    return {
      id: attempt.id,
      assessmentTitle: attempt.assessment.title,
      status: attempt.status,
      score: attempt.score,
      totalPossiblePoints: attempt.totalPossiblePoints,
      percentage: attempt.percentage,
      level: attempt.level,
      passed:
        attempt.assessment.passingScore !== null
          ? attempt.percentage >= attempt.assessment.passingScore
          : null,
      submittedAt: attempt.submittedAt,
    };
  }

  /** Returns all attempts for the currently logged-in user, newest first. */
  async getMyAttempts(user: AuthenticatedUser) {
    return this.prisma.attempt.findMany({
      where: { userId: user.userId },
      orderBy: { startedAt: 'desc' },
      include: {
        assessment: { select: { id: true, title: true, passingScore: true } },
      },
    });
  }

  async getAssessmentAttempts(assessmentId: string) {
    await this.ensureAssessmentExists(assessmentId);
    return this.prisma.attempt.findMany({
      where: { assessmentId },
      orderBy: { startedAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async removeAttempt(id: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id } });
    if (!attempt) throw new NotFoundException('Attempt not found');

    await this.prisma.attempt.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ─── Validation Helpers ───────────────────────────────────────────────────

  /**
   * Validates that a question's options meet the requirements for its type.
   * Called during assessment publishing to catch configuration mistakes early.
   *
   * Rules:
   *   - SINGLE_CHOICE: needs ≥2 options, exactly 1 correct
   *   - TRUE_FALSE:    needs exactly 2 options, exactly 1 correct
   *   - MULTIPLE_CHOICE: needs ≥2 options, at least 1 correct
   *
   * This prevents scenarios like a SINGLE_CHOICE question with 0 or 2 correct
   * options, which would make scoring undefined.
   */
  private validateQuestionOptions(
    type: QuestionType,
    options: Array<{ isCorrect: boolean; text: string }>,
    questionTitle: string,
  ) {
    const correctCount = options.filter((o) => o.isCorrect).length;

    switch (type) {
      case QuestionType.SINGLE_CHOICE:
        if (options.length < 2) {
          throw new BadRequestException(
            `Question "${questionTitle}" (SINGLE_CHOICE) must have at least 2 options`,
          );
        }
        if (correctCount !== 1) {
          throw new BadRequestException(
            `Question "${questionTitle}" (SINGLE_CHOICE) must have exactly 1 correct option`,
          );
        }
        break;

      case QuestionType.TRUE_FALSE:
        if (options.length !== 2) {
          throw new BadRequestException(
            `Question "${questionTitle}" (TRUE_FALSE) must have exactly 2 options`,
          );
        }
        if (correctCount !== 1) {
          throw new BadRequestException(
            `Question "${questionTitle}" (TRUE_FALSE) must have exactly 1 correct option`,
          );
        }
        break;

      case QuestionType.MULTIPLE_CHOICE:
        if (options.length < 2) {
          throw new BadRequestException(
            `Question "${questionTitle}" (MULTIPLE_CHOICE) must have at least 2 options`,
          );
        }
        if (correctCount < 1) {
          throw new BadRequestException(
            `Question "${questionTitle}" (MULTIPLE_CHOICE) must have at least 1 correct option`,
          );
        }
        break;
    }
  }

  /** Throws NotFoundException if the assessment with the given ID does not exist. */
  private async ensureAssessmentExists(id: string) {
    const exists = await this.prisma.assessment.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Assessment not found');
    return exists;
  }

  /** Throws NotFoundException if the question with the given ID does not exist. */
  private async ensureQuestionExists(id: string) {
    const exists = await this.prisma.question.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Question not found');
    return exists;
  }
}
