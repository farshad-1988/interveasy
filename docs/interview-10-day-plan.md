# Interview Scheduling – 10-Day Implementation & Learning Plan

Aligned with existing Interveasy NestJS/Prisma architecture (modules/controllers/services/DTOs, JWT auth, RBAC guards, ownership checks, pagination {data,meta}, centralized errors/validation). No unrelated LMS/Auth/Assessment changes.

## Day 1: Date/Time and Workflow
- **Learning objectives:** Model interview domain; understand UTC storage vs IANA display, DST/midnight edge cases, and status/booking workflows.
- **Theory & learning (60–90 min):** UTC instants, IANA zones, DST transitions, half-open intervals [start,end), overlap condition, state machines.
- **Implementation (~2 hrs):** Inspect architecture; author docs/interview-design.md (Actors, Entities, Rules, API, Edge Cases) with Mermaid workflow, booking→confirmation sequence, status flow, ERD.
- **Testing & documentation (20–30 min):** Validate rules (409 conflicts, back-to-back allowed, actor vs transition permissions).
- **Interview questions:** Why store UTC and keep IANA separately? How does [start,end) enable back-to-back bookings? How do DST/midnight crossings affect scheduling?

## Day 2: Database Schema and Relationships
- **Learning objectives:** Design relational schema with integrity constraints and concurrency-safe conflict prevention.
- **Theory & learning (60–90 min):** Prisma relations/indexes, PostgreSQL exclusion constraints/	stzrange, audit history modeling.
- **Implementation (~2 hrs):** Add Interview, InterviewAvailability, InterviewNote, InterviewStatusHistory, enums to prisma/schema.prisma; relations to User/optional Assessment; indexes/constraints; migration with overlap prevention strategy.
- **Testing & documentation (20–30 min):** prisma validate, generate client, review migration.
- **Interview questions:** Exclusion constraint vs locks—trade-offs? Why InterviewStatusHistory? Indexing for conflict queries?

## Day 3: Interview CRUD
- **Learning objectives:** Implement core booking/retrieval with DTO validation and ownership.
- **Theory & learning (60–90 min):** Nest DTO patterns, ISO datetime handling, IDOR prevention.
- **Implementation (~2 hrs):** InterviewsModule with POST /interviews, GET /interviews/:id; DTOs, participant/admin access checks, safe responses.
- **Testing & documentation (20–30 min):** Tests for create/get, validation, unauthorized access.
- **Interview questions:** Why derive userId from JWT? How to prevent leaking unauthorized data?

## Day 4: Availability and Validation
- **Learning objectives:** Manage interviewer availability and validate timezones/time windows.
- **Theory & learning (60–90 min):** IANA validation, recurring weekly availability, local-time parsing.
- **Implementation (~2 hrs):** Availability management endpoints (own/admin), GET /interviewers/:id/availability slot generation; validate day/time/tz, active rules, midnight-crossing.
- **Testing & documentation (20–30 min):** Tests for availability CRUD/authz and slot generation.
- **Interview questions:** How to validate IANA zones reliably? Representing availability across DST?

## Day 5: Scheduling and Conflict Detection
- **Learning objectives:** Timezone-aware scheduling and robust double-booking prevention.
- **Theory & learning (60–90 min):** UTC conversion, DST-safe logic, overlap predicate, transactions/locking.
- **Implementation (~2 hrs):** Enforce future, startAt<endAt, availability fit (DST/midnight), candidate+interviewer conflicts; transactional create with DB-level protection returning **409**; slots exclude conflicts.
- **Testing & documentation (20–30 min):** Tests for overlap, back-to-back, past, timezone/DST, concurrent conflicts.
- **Interview questions:** Why DB-level over service-only checks? Testing concurrent conflicts deterministically?

## Day 6: Status State Machine
- **Learning objectives:** Centralize transitions and separate permission checks.
- **Theory & learning (60–90 min):** FSMs, command validation vs authorization, audit trails.
- **Implementation (~2 hrs):** PATCH /interviews/:id/status with centralized allowed map, actor-permission checks, atomic update + history append.
- **Testing & documentation (20–30 min):** Tests for allowed/disallowed transitions and actor permissions.
- **Interview questions:** Why centralize transitions? 400 vs 403 vs 409? Value of history?

## Day 7: Notes and Interview Outcomes
- **Learning objectives:** Secure notes with visibility controls.
- **Theory & learning (60–90 min):** Least privilege, data visibility, content validation.
- **Implementation (~2 hrs):** POST /interviews/:id/notes; participant-only creation, PRIVATE/SHARED filtering, ownership/role enforcement.
- **Testing & documentation (20–30 min):** Tests for note creation and visibility (private hidden from unauthorized).
- **Interview questions:** Read-time vs write-time authorization for notes?

## Day 8: Security and Edge Cases
- **Learning objectives:** Harden against IDOR and temporal/input edge cases.
- **Theory & learning (60–90 min):** OWASP IDOR, safe errors, timezone pitfalls.
- **Implementation (~2 hrs):** Audit endpoints for JWT identity, participant checks, UUID validation, pagination/sort whitelisting, consistent errors; refine DST/midnight edges.
- **Testing & documentation (20–30 min):** Negative security and edge-case tests.
- **Interview questions:** Common IDOR vectors? Designing non-leaky errors?

## Day 9: Tests and Swagger
- **Learning objectives:** Confidence via automated tests and clear contracts.
- **Theory & learning (60–90 min):** Unit vs integration in NestJS/Jest, documenting auth/errors/pagination.
- **Implementation (~2 hrs):** Complete required Jest coverage (CRUD, DTOs, availability, timezone/DST, overlaps/back-to-back, concurrency/409, transitions, notes, ownership/RBAC, pagination). Align Swagger/API docs with project conventions.
- **Testing & documentation (20–30 min):** Run suites; fix regressions without breaking existing modules.
- **Interview questions:** Simulating concurrent booking conflicts in tests?

## Day 10: Complete Demo and Interview Defense
- **Learning objectives:** Demonstrate correctness and defend design.
- **Theory & learning (60–90 min):** Defense prep: schema/constraints, transactions, security, time handling.
- **Implementation (~2 hrs):** Successful booking + conflicting booking (409) demos; final verification (Prisma validate/migrate, build, lint, tests); confirm Auth/LMS/Assessment intact.
- **Testing & documentation (20–30 min):** Final release report (files, endpoints, migrations, results, issues, demo steps).
- **Interview questions:** Walk through conflict prevention under concurrency. Explain a DST edge case handled. How are private notes protected?