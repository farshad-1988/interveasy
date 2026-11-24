# Assessment System – 10-Day Implementation & Learning Plan

This plan extends the existing Interveasy NestJS + Prisma LMS without modifying unrelated LMS/auth behavior. It follows current project conventions: modular NestJS (`module/controller/service/dto`), DTO validation with `class-validator`/`class-transformer`, JWT auth (`JwtAuthGuard`), RBAC (`RolesGuard` + `@Roles`), ownership checks, Prisma transactions, centralized error handling, and paginated list responses `{ data, meta }`.

## Day 1: Business Analysis, Assessment Flow & Data Modeling
- **Learning objectives:** Translate PM requirements into actors/entities/rules/APIs/edge cases; understand snapshot-based attempt integrity, scoring authority on backend, and security boundaries (no correct-answer leakage, ownership/IDOR prevention).
- **Theory & learning (60–90 min):** Review existing auth/RBAC, Prisma relations/constraints, LMS enrollment/progress patterns, transaction and race-condition basics for submissions.
- **Implementation (~2 hrs):** Inspect codebase; produce `docs/assessment-design.md` (Actors, Entities, Rules, API, Edge Cases) with ERD, assessment flow, attempt lifecycle, and start-to-result sequence diagrams (Mermaid). Define enums/statuses and snapshot strategy.
- **Testing & documentation (20–30 min):** Validate design against requirements (multiple attempts, unpublish during active attempt, deterministic scoring, assignment policy). Cross-check with existing architecture.
- **Deliverables:** `docs/assessment-design.md`, finalized domain model and endpoint contracts.
- **Interview questions:** Why snapshot questions/options per attempt? How do you prevent leaking correct answers? Trade-offs of enum/status modeling and multiple attempts vs single-attempt constraints.

## Day 2: Database Schema & Migrations
- **Learning objectives:** Model relations, constraints, indexes, and deletion policies for integrity and history; understand composite uniques and cascade/restrict choices.
- **Theory & learning (60–90 min):** Prisma schema/migrations in this repo, Postgres arrays for `selectedOptionIds`, unique/index design, transactional DDL considerations.
- **Implementation (~2 hrs):** Add `Assessment`, `Question`, `Option`, `AssessmentAssignment`, `Attempt`, `AttemptQuestion`, `AttemptOption`, `Answer` models/enums and `User` relations in `prisma/schema.prisma`. Create migration `20261110150000_add_assessment_system`, generate Prisma client, run `prisma validate`.
- **Testing & documentation (20–30 min):** Verify generated types/enums; review FK/index/unique coverage (duplicate answer prevention, snapshot uniqueness, assignment constraints).
- **Deliverables:** Updated schema, migration SQL, generated client, validation passing.
- **Interview questions:** Why `@@unique([attemptQuestionId])` for answers? When to cascade vs restrict? How do snapshots preserve history after authoring changes?

## Day 3: Question Bank
- **Learning objectives:** Implement type-safe question/option authoring with strong DTO validation and domain invariants.
- **Theory & learning (60–90 min):** `class-validator` custom validation patterns, question-type invariants, safe admin responses vs user responses.
- **Implementation (~2 hrs):** Create question/option DTOs and services/controllers (admin-only): create/list/update/delete questions and options; enforce `SINGLE_CHOICE` (exactly 1 correct), `TRUE_FALSE` (2 options, 1 correct), `MULTIPLE_CHOICE` (>=1 correct); deterministic ordering.
- **Testing & documentation (20–30 min):** Unit tests for config validation per type; verify correct answers visible only in admin/authoring flows.
- **Deliverables:** Question/Option APIs + validation logic + tests.
- **Interview questions:** How to enforce invariants at DTO vs service vs DB layers? How to evolve question types safely?

## Day 4: Assessment Management & Assignment
- **Learning objectives:** Assessment lifecycle (draft/publish/unpublish), publish gating, and access control via assignments.
- **Theory & learning (60–90 min):** Publishing preconditions, guarding structural edits, assignment status/due-date semantics.
- **Implementation (~2 hrs):** Assessment CRUD + publish/unpublish endpoints with validation (>=1 valid question, all questions/options valid). Implement `AssessmentAssignment` entity/APIs: admin assign, user list own, prevent duplicate active assignments, due-date validation, authorization checks.
- **Testing & documentation (20–30 min):** Tests for publish rejection/acceptance, unauthorized management, duplicate assignment, due-date rules.
- **Deliverables:** Assessment management APIs, Assignment APIs, RBAC/ownership enforcement.
- **Interview questions:** Why block starting unpublished assessments but allow completing active attempts after unpublish? How to model “duplicate active assignment” constraints?

## Day 5: Attempt Lifecycle
- **Learning objectives:** Transactional attempt creation, immutable snapshots, expiration, and ownership.
- **Theory & learning (60–90 min):** Prisma `$transaction`, snapshot patterns, time-based expiration handling, idempotency/consistency.
- **Implementation (~2 hrs):** `POST /assessments/:id/start`: verify published + authorized/assigned + due; create attempt and snapshot questions/options (deterministic order), totals, `expiresAt`; return safe payload without correctness. `GET /attempts/:id/questions` with ownership/expiry checks. Support multiple attempts per rules.
- **Testing & documentation (20–30 min):** Tests for valid start, unpublished/unauthorized rejection, snapshot correctness and immutability after source edits.
- **Deliverables:** Attempt start/read APIs with transactional snapshotting.
- **Interview questions:** What must be atomic at attempt start? How do snapshots protect historical results?

## Day 6: Answer Submission
- **Learning objectives:** Safe, validated answer persistence with upsert semantics and strict state checks.
- **Theory & learning (60–90 min):** Upsert vs insert/update races, option ownership validation, request hardening (no trusted client scores).
- **Implementation (~2 hrs):** `POST /attempts/:id/answers`: verify owner, `IN_PROGRESS`, not expired; validate `attemptQuestionId` and selected options belong to question; enforce type cardinality and no duplicates; upsert answer (`selectedOptionIds`, `answeredAt`); reject forbidden fields.
- **Testing & documentation (20–30 min):** Tests for save/update, invalid/foreign options, other-user attempt, post-submit/expired rejection.
- **Deliverables:** Answer submission API + validation/upsert logic.
- **Interview questions:** How do you prevent duplicate answers under concurrency? Why ignore client correctness/points?

## Day 7: Scoring Engine
- **Learning objectives:** Pure, deterministic scoring isolated from transport/DB concerns.
- **Theory & learning (60–90 min):** Set equality, rounding/precision, edge-case driven design.
- **Implementation (~2 hrs):** Implement `ScoringService` with `calculateQuestionScore(questionType, selectedOptionIds, correctOptionIds, points)`; exact set comparison for multiple choice; handle unanswered/zero-points cases and consistent rounding.
- **Testing & documentation (20–30 min):** Comprehensive unit tests: all types, incorrect cases, option order differences, missing answers, zero totals, floating-point precision.
- **Deliverables:** `src/scoring/scoring.service.ts` (or equivalent) + unit tests.
- **Interview questions:** Why keep scoring pure? How to guarantee determinism and testability?

## Day 8: Level Mapping & History
- **Learning objectives:** Centralized level policy, result persistence, assignment synchronization, and user/admin history access.
- **Theory & learning (60–90 min):** Boundary-value analysis, result read models, privacy in history APIs.
- **Implementation (~2 hrs):** `LevelMappingService` (configurable thresholds, single conversion function). `POST /attempts/:id/submit` and `GET /attempts/:id/result`; persist final results; update assignment to `COMPLETED` on submit. Implement `GET /users/me/assessments`, `GET /assessments/:id/attempts` (admin), `GET /users/:id/assessments` (admin) with pagination/filtering; preserve historical snapshot results.
- **Testing & documentation (20–30 min):** Level boundary unit tests; history ownership/admin access and filter/pagination tests.
- **Deliverables:** Level mapping, submission/result/history APIs, assignment status updates.
- **Interview questions:** How to handle boundary scores (49/50/74/75/89/90)? What must history never expose?

## Day 9: Tests & Swagger
- **Learning objectives:** Validate business rules end-to-end, concurrency/transaction safety, and clear API contracts.
- **Theory & learning (60–90 min):** Jest unit vs e2e patterns in this repo, testing transactions/races conceptually, API documentation standards.
- **Implementation (~2 hrs):** Add/complete unit and integration tests for assessments, questions, assignments, attempts, answers, scoring, submission (including duplicate/concurrent), and history. Add/align Swagger/OpenAPI documentation for all endpoints (auth/roles, DTOs, params, responses, errors, pagination, examples) consistent with project conventions; ensure no correct-answer leakage in user contracts.
- **Testing & documentation (20–30 min):** Run targeted suites; fix regressions; document error examples and pagination metadata.
- **Deliverables:** Passing relevant tests, documented API contracts, updated docs.
- **Interview questions:** How to test race conditions deterministically? What belongs in integration vs unit tests?

## Day 10: Final Demo & Interview Defense
- **Learning objectives:** Demonstrate complete flow and defend architecture, data integrity, security, and scoring decisions.
- **Theory & learning (60–90 min):** Prepare explanations of ERD, snapshots, transactions/isolation, RBAC/ownership, and scoring/level design.
- **Implementation (~2 hrs):** End-to-end demo script/steps (admin creates/publishes/assigns; user starts, answers, submits; view results/history). Final verification and fixes (Prisma validate/migrations, build, lint, tests, endpoint/role/integrity checks).
- **Testing & documentation (20–30 min):** Produce final release report with completed features, files changed, relationships, endpoint list, test results, remaining issues, and demo instructions.
- **Deliverables:** Working end-to-end demo, `FINAL_REPORT.md` (or equivalent), verified build/lint/tests.
- **Interview questions:** Walk through submit transaction and concurrent double-submit prevention. How are snapshots and scoring kept trustworthy? How does the system enforce least privilege and prevent IDOR?
