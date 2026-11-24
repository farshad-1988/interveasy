# Interveasy — Complete Technical Project Guide & Learning Manual

> **Purpose:** This document is an in-depth reference manual designed for software engineers, backend architects, and technical reviewers studying the Interveasy platform. It provides an end-to-end breakdown of architecture, code implementation, design patterns, domain logic, and interview defense topics.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Architecture](#3-project-architecture)
4. [Folder & File Structure](#4-folder--file-structure)
5. [All Modules & Responsibilities](#5-all-modules--responsibilities)
6. [Database Models & Relationships](#6-database-models--relationships)
7. [API Endpoints Reference](#7-api-endpoints-reference)
8. [Authentication & Authorization Flow](#8-authentication--authorization-flow)
9. [Step-by-Step Business Logic](#9-step-by-step-business-logic)
10. [Request Flow (Controller → Service → Database)](#10-request-flow-controller--service--database)
11. [Testing Guide (Unit & E2E)](#11-testing-guide-unit--e2e)
12. [Local Environment Setup](#12-local-environment-setup)
13. [Recommended Files to Study First](#13-recommended-files-to-study-first)
14. [Recommended Learning Order](#14-recommended-learning-order)
15. [Technical Concepts Guide](#15-technical-concepts-guide)
16. [25 Project-Specific Interview Questions & Answers](#16-25-project-specific-interview-questions--answers)

---

## 1. Project Overview

**Interveasy** is an enterprise-grade backend platform built to power a career acceleration and technical mock interview system. It bridges the gap between learning, assessment, live interviewing, and employer hiring.

The platform provides:
- **Curriculum & Track Delivery:** Multi-cloud roadmaps (AWS, Azure, GCP) organized hierarchically into Programs, Modules, and Tasks.
- **Progress Tracking:** Granular per-task completion metrics calculated via SQL aggregations.
- **Adaptive Skill Assessments:** Question bank engine evaluating single-choice and multiple-choice questions with deterministic mathematical scoring and skill tier classification.
- **Mock Interview Booking & Lifecycle:** Real-time scheduling with multi-timezone validation, conflict detection algorithms, and state machine audit history.
- **Feedback & Analytics Engine:** Multi-category scoring (1–5 rubric) and SQL aggregations for interview performance trends.
- **B2B Lead Management CRM:** Enterprise sales pipeline capturing demo inquiries with deduplication rules and conversion workflows.

---

## 2. Technology Stack

| Layer | Component | Choice | Reason for Selection |
|---|---|---|---|
| **Core Framework** | NestJS 11 | TypeScript, Node.js | Strict modularity, dependency injection, testability, enterprise standardization |
| **Database** | PostgreSQL 15+ | Relational DB | Strong ACID compliance, composite indices, complex aggregations |
| **ORM Layer** | Prisma ORM 7 | `@prisma/adapter-pg` | Type-safe queries, migration control, zero-overhead connection pooling |
| **Authentication** | Passport + JWT | `bcrypt`, HMAC-SHA256 | Stateless access tokens combined with stateful, revocable refresh sessions |
| **Validation** | class-validator | `class-transformer` | Declarative DTO validation with strict payload whitelisting |
| **Documentation** | Swagger / OpenAPI | `@nestjs/swagger` | Auto-generated interactive API contracts matching actual DTOs |
| **Rate Limiting** | NestJS Throttler | `@nestjs/throttler` | In-memory token bucket rate limiting against brute-force and DDoS attacks |
| **Test Runner** | Jest & Supertest | Automated testing | Fast unit mocks and isolated end-to-end integration tests |

---

## 3. Project Architecture

Interveasy adheres to a **Modular Monolith** architectural pattern. 

### Architectural Layers
```
┌────────────────────────────────────────────────────────┐
│                   HTTP Request Layer                   │
│   (Rate Limiter, CORS, Cookie Parser, CSRF Guard)     │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│               Security & Routing Layer                 │
│      (JwtAuthGuard, RolesGuard, ValidationPipe)        │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                   Controllers Layer                    │
│   (DTO binding, HTTP status codes, Response shape)     │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                    Services Layer                      │
│   (Business invariants, State machines, Math engines)  │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                   Data Access Layer                    │
│       (PrismaService, @prisma/adapter-pg, pg.Pool)     │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                 PostgreSQL Database                    │
└────────────────────────────────────────────────────────┘
```

---

## 4. Folder & File Structure

```
interveasy/
├── prisma/
│   ├── schema.prisma            # Canonical database schema & constraints
│   ├── seed.ts                  # Production demo data seeder
│   └── migrations/              # Incremental SQL migration history
├── src/
│   ├── main.ts                  # NestJS application bootstrap
│   ├── app.module.ts            # Root module wiring dependencies
│   ├── auth/                    # Authentication & session subsystem
│   │   ├── auth.controller.ts   # /auth endpoints
│   │   ├── auth.service.ts      # Authentication business logic & token rotation
│   │   ├── guards/              # JwtAuthGuard, CsrfGuard
│   │   ├── strategies/          # Passport JWT strategy
│   │   └── utils/               # Cryptographic token generator & duration parsers
│   ├── users/                   # User accounts & role administration
│   ├── programs/                # Learning tracks & curriculum roots
│   ├── modules/                 # Program chapters
│   ├── tasks/                   # Actionable learning tasks
│   ├── enrollments/             # User ↔ Program registration
│   ├── progress/                # Task completion tracking
│   ├── assessments/             # Question bank, attempts & answers
│   ├── scoring/                 # Pure scoring engine & skill level mapping
│   ├── interviews/              # Mock interview scheduling & state machine
│   ├── feedback/                # Rubrics, ratings & SQL analytics
│   ├── leads/                   # Enterprise demo CRM & deduplication
│   ├── common/                  # Shared filters, guards, pagination utilities
│   ├── config/                  # Environment variable schema validation
│   └── prisma/                  # PrismaService database lifecycle singleton
├── test/                        # End-to-end integration test suites
├── ARCHITECTURE.md              # High-level architecture documentation
├── README.md                    # Quickstart and operations manual
└── package.json                 # Project dependencies & scripts
```

---

## 5. All Modules & Responsibilities

1. **`AuthModule`**: User registration, credential verification, access token signing, session rotation, CSRF cookie handling.
2. **`UsersModule`**: User CRUD, secure profile retrieval, role promotions (ADMIN, INTERVIEWER, USER).
3. **`ProgramsModule`**: Curriculum track catalog (AWS, Azure, GCP), slug generation, activation flags.
4. **`ModulesModule`**: Program chapters, sequential ordering (`order` field).
5. **`TasksModule`**: Granular assignments, documentation links, completion requirements.
6. **`EnrollmentsModule`**: Links users to programs; enforces unique registration rules.
7. **`ProgressModule`**: Idempotent task completion markers; calculates real-time course percentages.
8. **`AssessmentsModule`**: Assessment definitions, question/option CRUD, user attempts, answer submissions.
9. **`ScoringModule`**: Pure mathematical scoring engine (set comparison for multi-select, precision rounding) and skill tier mapping.
10. **`InterviewsModule`**: Availability scheduling, multi-timezone normalization, overlap conflict detection, state transitions.
11. **`FeedbackModule`**: Post-interview evaluation rubrics, category ratings (1-5), SQL aggregations (`AVG`, `MIN`, `MAX`).
12. **`LeadsModule`**: Enterprise lead capture, domain parsing, duplicate detection, admin CRM management.
13. **`PrismaModule`**: Encapsulates `PrismaService` connection lifecycle to prevent connection exhaustion.
14. **`CommonModule`**: Global exception filter, RBAC guards, pagination helpers.

---

## 6. Database Models & Relationships

### Core Relationships
- **User (1) → Session (N):** A user can have multiple active logins (desktop, mobile).
- **User (1) → Enrollment (N) → Program (1):** Many-to-many relationship tracking user course registrations.
- **Program (1) → Module (N) → Task (N):** Hierarchical three-tier educational structure.
- **User (1) → Progress (N) → Task (1):** Idempotent record indicating a user completed a specific task.
- **Assessment (1) → Question (N) → Option (N):** Standard assessment tree with weighted points and correct answer flags.
- **Assessment (1) → Attempt (N) → AttemptAnswer (N):** Audit trail of user test attempts and submitted choices.
- **User (Candidate) & User (Interviewer) → Interview (N):** Dual foreign keys pointing to the same `User` entity.
- **Interview (1) → InterviewStatusHistory (N):** State machine audit log.
- **Interview (1) → Feedback (1):** 1-to-1 relationship storing structured ratings.
- **Lead (Standalone):** CRM lead storage with email uniqueness.

---

## 7. API Endpoints Reference

### 7.1 Authentication (`/api/auth`)
- `POST /api/auth/register` — Create a new candidate account.
- `POST /api/auth/login` — Authenticate credentials; sets HTTP-only refresh cookie, returns access token.
- `POST /api/auth/refresh` — Rotate refresh token and issue new access token.
- `POST /api/auth/logout` — Revoke active session and clear cookies.
- `GET /api/auth/sessions` — List active sessions for the current user.
- `DELETE /api/auth/sessions/:id` — Revoke a specific session.

### 7.2 Users (`/api/users`)
- `GET /api/users/me` — Retrieve current user profile.
- `PATCH /api/users/me` — Update current user profile.
- `GET /api/users` — Admin paginated list of users.
- `GET /api/users/:id` — Retrieve user by ID.
- `PATCH /api/users/:id/role` — Admin promote/demote user role.
- `DELETE /api/users/:id` — Admin delete user.

### 7.3 Learning Platform (`/api/programs`, `/api/modules`, `/api/tasks`)
- `GET /api/programs` — Public list of learning tracks with filtering and pagination.
- `POST /api/programs` — Admin create curriculum track.
- `POST /api/enrollments/:programId` — Enroll current user into a track.
- `GET /api/enrollments/my` — Get current user's enrollments.
- `POST /api/progress/:taskId` — Mark task as completed (calculates updated percentage).
- `GET /api/progress/:programId` — Retrieve progress summary for a program.

### 7.4 Assessments & Scoring (`/api/assessments`)
- `GET /api/assessments` — List published assessments.
- `POST /api/assessments` — Admin create assessment.
- `POST /api/assessments/:id/questions` — Admin add question with options.
- `POST /api/assessments/:id/attempts` — Start a new assessment attempt.
- `POST /api/assessments/attempts/:attemptId/submit` — Submit answers and calculate score.
- `GET /api/assessments/attempts/:attemptId` — View attempt results, score, and skill tier.

### 7.5 Mock Interviews (`/api/interviews`)
- `POST /api/interviews/availability` — Interviewer define weekly recurring availability slot.
- `GET /api/interviews/availability` — Query availability slots.
- `POST /api/interviews` — Book a mock interview (triggers conflict check).
- `GET /api/interviews` — List interviews for candidate or interviewer.
- `PATCH /api/interviews/:id/status` — Transition interview state (PENDING → CONFIRMED → COMPLETED/CANCELLED).
- `POST /api/interviews/:id/notes` — Add interviewer session notes.

### 7.6 Feedback & Analytics (`/api/feedback`)
- `POST /api/feedback` — Submit post-interview evaluation (1–5 rubric).
- `GET /api/feedback/interview/:interviewId` — Get feedback for a specific interview.
- `GET /api/feedback/analytics/summary` — Aggregated metrics (`AVG`, `MIN`, `MAX`) across categories.

### 7.7 Leads Management (`/api/leads`)
- `POST /api/leads` — Public submission for enterprise demo requests.
- `GET /api/leads` — Admin paginated lead listing with status filters.
- `PATCH /api/leads/:id/status` — Admin update lead lifecycle state.

---

## 8. Authentication & Authorization Flow

### The Hybrid Session Model
Interveasy implements a secure hybrid authentication model combining stateless JWTs with stateful, revocable database sessions:

```
Candidate Browser                     Interveasy Backend                 PostgreSQL DB
      │                                       │                                │
      ├─── POST /api/auth/login ─────────────►│                                │
      │    { email, password }                │                                │
      │                                       ├── Verify bcrypt password       │
      │                                       ├── Generate Session UUID        │
      │                                       ├── Hash Refresh Token Secret    │
      │                                       ├── Save Session ───────────────►│
      │                                       ├── Sign Access Token (15m JWT)  │
      │◄── Set Cookie (refreshToken) ─────────┤                                │
      │    Body: { accessToken }              │                                │
      │                                       │                                │
      ├─── GET /api/users/me ────────────────►│                                │
      │    Header: Bearer <accessToken>       │                                │
      │                                       ├── Verify JWT signature (HS256) │
      │                                       ├── Extract sub & role           │
      │◄── 200 OK (User Profile) ─────────────┤                                │
      │                                       │                                │
      ├─── POST /api/auth/refresh ───────────►│                                │
      │    Cookie: refreshToken               │                                │
      │                                       ├── Fetch session & check expiry─┼─► Verify
      │                                       ├── Compare SHA-256 hash         │
      │                                       ├── Generate NEW refresh token   │
      │                                       ├── Optimistic Lock Update ─────►│ Update Hash
      │◄── Set Cookie (NEW refreshToken) ─────┤                                │
      │    Body: { NEW accessToken }          │                                │
```

### Security Safeguards
1. **Timing Attack Immunity**: Dummy hash check executes `bcrypt.compare` even if the user email is not found, keeping response times uniform.
2. **Refresh Token Rotation (RTR)**: Each refresh token is strictly single-use. If a token is reused, the backend detects a hash mismatch, revokes the session immediately, and raises an `UnauthorizedException`.
3. **Double-Submit Cookie CSRF**: For browser-based mutating calls, a random CSRF token stored in a cookie must match the `x-csrf-token` header.

---

## 9. Step-by-Step Business Logic

### 9.1 Course Progress Calculation
When a user marks a task completed via `POST /api/progress/:taskId`:
1. Verify the task exists and fetch its parent `moduleId` and `programId`.
2. Ensure the user is currently enrolled in the program.
3. Upsert a `Progress` row: `isCompleted = true`, `completedAt = now()`.
4. Count total tasks in the program: `TotalTasks`.
5. Count completed tasks for the user in this program: `CompletedTasks`.
6. Compute percentage: $\text{ProgressPct} = \text{round}((\text{CompletedTasks} / \text{TotalTasks}) \times 100, 2)$.
7. If $\text{ProgressPct} = 100\%$, mark `Enrollment.status = COMPLETED`.

### 9.2 Deterministic Assessment Scoring
When a candidate submits test answers via `POST /api/assessments/attempts/:attemptId/submit`:
1. Verify the attempt is currently in `IN_PROGRESS` status and belongs to the caller.
2. Fetch all questions and their correct options for the assessment.
3. For each question:
   - If `SINGLE_CHOICE`: Compare candidate's selected option ID with the correct option ID.
   - If `MULTIPLE_CHOICE`: Compare the selected option set with the correct option set. Award full points if and only if both sets match identically. Zero partial credit.
4. Total score is the sum of earned points divided by total possible points $\times 100$.
5. Map score to skill level:
   - `< 50%` $\rightarrow$ `BEGINNER`
   - `50% - 69.99%` $\rightarrow$ `INTERMEDIATE`
   - `70% - 84.99%` $\rightarrow$ `ADVANCED`
   - `≥ 85%` $\rightarrow$ `EXPERT`
6. Save score, skill level, and mark attempt status as `SUBMITTED`.

### 9.3 Interview Scheduling & Conflict Detection
When booking an interview via `POST /api/interviews`:
1. Parse `startAt` and `endAt` into UTC dates; ensure $startAt < endAt$ and $startAt > now()$.
2. Verify IANA timezone string (e.g., `'America/New_York'`).
3. Ensure interviewer and candidate are different users.
4. Check interviewer availability rules:
   - Convert slot to day-of-week and time in the interviewer's configured timezone.
   - Verify the interval falls completely within an active availability window.
5. In a database transaction, check for overlapping active interviews:
   - Query interviews where status is `PENDING` or `CONFIRMED`.
   - Condition: $(startAt < \text{existing}.endAt) \land (endAt > \text{existing}.startAt)$.
   - Match on candidate ID or interviewer ID.
6. If any overlap exists, abort and throw `409 ConflictException`.
7. Otherwise, insert `Interview` with `status = PENDING` and record initial history in `InterviewStatusHistory`.

### 9.4 Lead Capture & Deduplication
When submitting a demo inquiry via `POST /api/leads`:
1. Trim and lowercase email.
2. Extract domain from corporate email (e.g. `user@enterprise.com` $\rightarrow$ `enterprise.com`).
3. Check for existing active lead with the same email or active request from the same company within the last 30 days.
4. If a duplicate exists, update the contact attempt count and timestamp rather than spamming sales with duplicate entries.
5. If new, create `Lead` with `status = NEW`.

---

## 10. Request Flow (Controller → Service → Database)

Here is the exact lifecycle of a request using `UsersController.findOne`:

```
1. Client sends GET /api/users/123 with Authorization: Bearer <token>
2. Express parses headers.
3. JwtAuthGuard runs:
   - PassportJwtStrategy validates the token against JWT_SECRET.
   - Sets req.user = { userId, email, role, sid }.
4. RolesGuard runs:
   - Checks @Roles(Role.ADMIN) against req.user.role.
5. UsersController.findOne(id) is invoked:
   - Calls this.usersService.findById(id).
6. UsersService.findById(id):
   - Invokes this.prisma.user.findUnique({
       where: { id },
       select: PUBLIC_USER_SELECT
     }).
7. PrismaClient passes parameterized SQL query to PostgreSQL via @prisma/adapter-pg.
8. PostgreSQL executes query and returns data row.
9. If found, Service returns user object.
   If not found, Service throws new NotFoundException('User not found').
10. Controller returns 200 OK with JSON response.
    (If an exception was thrown, GlobalHttpExceptionFilter formats standard JSON error).
```

---

## 11. Testing Guide (Unit & E2E)

### Running Unit Tests
Unit tests are written with Jest and mock the database layer using custom mocks or Jest spies:

```bash
# Run all unit tests
npm run test

# Run tests with code coverage report
npm run test:cov

# Run specific test suite
npx jest src/scoring/scoring.service.spec.ts
```

All 19 test suites and 134 unit tests pass with zero warnings:
- `auth.service.spec.ts`
- `users.service.spec.ts`
- `scoring.service.spec.ts`
- `level-mapping.service.spec.ts`
- `interviews.service.spec.ts`
- `feedback.service.spec.ts`
- `leads.service.spec.ts`

### Running End-to-End Tests
E2E tests spin up the full NestJS application instance using Supertest:

```bash
npm run test:e2e
```

---

## 12. Local Environment Setup

### 1. Prerequisites
- Node.js ≥ 20.x
- Docker or a local PostgreSQL 15+ instance

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `.env` contains:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/interveasy?schema=public"
JWT_SECRET="super-secret-development-key-minimum-32-chars-long"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
COOKIE_SECURE="false"
COOKIE_SAMESITE="lax"
CORS_ORIGIN="http://localhost:3000"
```

### 3. Database Initialization
```bash
# Run Prisma migrations
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate

# Seed sample tracks, questions, and demo users
npm run seed
```

### 4. Run Development Server
```bash
npm run start:dev
```
Access the application at `http://localhost:3000`.  
Explore the interactive API documentation at `http://localhost:3000/api/docs`.

---

## 13. Recommended Files to Study First

To understand the core architectural patterns quickly, review these files in order:
1. `src/main.ts` — Global middleware, Swagger setup, validation pipes, and error filters.
2. `prisma/schema.prisma` — Complete database schema, relations, enums, and indexes.
3. `src/auth/auth.service.ts` — Constant-time auth, session rotation, and JWT signing.
4. `src/interviews/interviews.service.ts` — Conflict detection algorithm and timezone conversions.
5. `src/scoring/scoring.service.ts` — Pure functional mathematical assessment grading.

---

## 14. Recommended Learning Order

```
[Day 1: Fundamentals]
├── 1. Prisma Schema & Migrations (prisma/schema.prisma)
└── 2. Core Bootstrap & Pipeline (src/main.ts, src/app.module.ts)

[Day 2: Identity & Access]
├── 3. User Entity & Projections (src/users/)
└── 4. Session & Auth Lifecycle (src/auth/)

[Day 3: Learning & Progression]
├── 5. Curriculum Tree (src/programs/, src/modules/, src/tasks/)
└── 6. Enrollment & Progress Aggregations (src/enrollments/, src/progress/)

[Day 4: Assessment & Logic]
├── 7. Question Bank & Submission Flow (src/assessments/)
└── 8. Deterministic Scoring Engine (src/scoring/)

[Day 5: Interview Scheduling & Business Workflows]
├── 9. Scheduling, Timezones & Conflict Math (src/interviews/)
├── 10. Performance Feedback & Aggregations (src/feedback/)
└── 11. Lead CRM & Idempotent Deduplication (src/leads/)
```

---

## 15. Technical Concepts Guide

### 15.1 Constant-Time Password Checking
To protect against user enumeration via timing attacks:
```typescript
const passwordHash = user?.password ?? DUMMY_PASSWORD_HASH;
const isValid = await bcrypt.compare(candidatePassword, passwordHash);
if (!user || !isValid) {
  throw new UnauthorizedException('Invalid credentials');
}
```
Because `bcrypt.compare` is computationally expensive (work factor 12), running it even when `user` is null ensures every request takes ~150ms regardless of whether the email exists.

### 15.2 Double-Submit Cookie CSRF Defense
1. Server sets a cryptographically random token in an HTTP-only or secure cookie (`_csrf`).
2. Client JavaScript reads a corresponding non-HTTP-only cookie or response header and sends it in the `x-csrf-token` header.
3. The server compares both tokens. An attacker from an external malicious domain cannot read the cookie due to Same-Origin Policy (SOP).

### 15.3 Timezone-Agnostic Storage
All timestamps in the PostgreSQL database are stored in **UTC** (`timestamp with time zone`). The backend receives local times with an explicit IANA timezone string (e.g., `Asia/Tehran`, `America/New_York`), validates the IANA timezone, converts the time to UTC for storage and overlap checking, and lets clients display times in user-preferred zones.

---

## 16. 25 Project-Specific Interview Questions & Answers

### Q1: What architectural pattern does Interveasy follow, and why was it chosen over microservices?
**Answer:** Interveasy uses a **Modular Monolith** architecture. It organizes code into cohesive, domain-driven NestJS modules (`Auth`, `Users`, `Programs`, `Assessments`, `Interviews`, `Feedback`, `Leads`) sharing a single database. This was selected because it avoids the operational complexity, network latency, distributed transaction overhead, and data consistency hurdles of microservices while maintaining strict code boundaries that can easily be split into microservices if scaling demands it.

### Q2: How does the application prevent timing attacks during user login?
**Answer:** In `AuthService.login`, if a queried email does not exist in the database, the code does not immediately return 401. Instead, it assigns `user?.password ?? DUMMY_PASSWORD_HASH` and executes `bcrypt.compare`. This ensures the execution duration is virtually identical whether an email exists or not, preventing attackers from enumerating valid registered emails.

### Q3: Explain the Refresh Token Rotation (RTR) mechanism implemented in this project.
**Answer:** Each time a client requests a new access token via `/auth/refresh`, the server verifies the presented refresh token against the database's hashed value. Upon successful validation, the server generates a brand-new refresh token and session secret, updates the stored SHA-256 hash in the database, and invalidates the old one. If an attacker replays a stolen, previously used refresh token, the hash mismatch immediately triggers an alert and revokes the session to safeguard the account.

### Q4: Why is the refresh token hashed before storing it in PostgreSQL?
**Answer:** Storing raw refresh tokens in the database exposes users to session hijacking if a database dump or read replica is compromised. Hashing the token with SHA-256 ensures that even with read access to the `Session` table, an attacker cannot forge valid refresh tokens.

### Q5: How is Cross-Site Request Forgery (CSRF) mitigated in Interveasy?
**Answer:** It uses the **Double-Submit Cookie Pattern** enforced by `CsrfGuard`. Mutating endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) require the request header `x-csrf-token` to match the value sent in the CSRF cookie. Because third-party sites cannot read or alter cookies across origins due to the browser's Same-Origin Policy, forged requests cannot provide the valid header token.

### Q6: How does the `ScoringService` handle multiple-choice questions without giving partial credit?
**Answer:** The scoring engine treats multi-select answers as mathematical sets. It converts the submitted option IDs and the correct option IDs into Sets. It verifies that both sets have identical cardinality ($|A| = |B|$) and that every element of $A$ is present in $B$. If a user selects even one incorrect option or misses one correct option, the earned points for that question are 0.

### Q7: Explain the interview conflict detection algorithm.
**Answer:** Two intervals $[A_{\text{start}}, A_{\text{end}}]$ and $[B_{\text{start}}, B_{\text{end}}]$ overlap if and only if $A_{\text{start}} < B_{\text{end}}$ and $A_{\text{end}} > B_{\text{start}}$. In `InterviewsService.ensureNoConflicts`, we query active interviews (`PENDING`, `CONFIRMED`) matching this condition where either the candidate or interviewer is already booked. Running this inside a database transaction guarantees no double-booking occurs even under concurrent requests.

### Q8: How does Interveasy handle multi-timezone scheduling across candidate and interviewer?
**Answer:** All interview records are stored in UTC in PostgreSQL. When an interviewer creates an availability window, they specify the day of the week, start time, end time, and an IANA timezone string (e.g., `Europe/London`). When a candidate books a slot, the system uses `Intl.DateTimeFormat` algorithms in `interview-time.util.ts` to convert the requested UTC window into the interviewer's local zone, verifying availability including windows that cross midnight.

### Q9: What is the purpose of `InterviewStatusHistory`?
**Answer:** It implements an audit trail for the interview state machine. Every state change (such as `PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `COMPLETED`) records the old status, the new status, the ID of the user who triggered the transition, a timestamp, and an optional reason. This provides complete observability and accountability.

### Q10: How does the database design ensure a user cannot enroll in the same program twice?
**Answer:** The Prisma schema defines a composite unique constraint on the `Enrollment` model: `@@unique([userId, programId])`. Attempting to insert a duplicate record triggers a PostgreSQL unique constraint violation (`P2002` in Prisma), which the service intercepts and converts into an HTTP `409 ConflictException`.

### Q11: How are SQL aggregations used in `FeedbackService`?
**Answer:** Rather than pulling thousands of feedback rows into Node.js memory to compute averages, `FeedbackService` executes native SQL aggregations (`AVG`, `MIN`, `MAX`, `COUNT`) grouped by rating categories. This pushes computation down to PostgreSQL's optimized query engine, drastically reducing network I/O and server memory footprint.

### Q12: Why does `UsersService` use `PUBLIC_USER_SELECT` rather than returning full entities?
**Answer:** To prevent accidental data leaks (such as password hashes, session secrets, or internal flags). By explicitly whitelisting fields in a Prisma projection object (`PUBLIC_USER_SELECT = { id: true, email: true, name: true, role: true, createdAt: true }`), the database only returns public fields over the wire.

### Q13: What is the purpose of `PrismaService` extending `OnModuleInit` and `OnModuleDestroy`?
**Answer:** NestJS lifecycle hooks allow `PrismaService` to establish its database connection pool during bootstrap (`onModuleInit`) and gracefully drain/close active database connections when the process shuts down (`onModuleDestroy`), preventing orphaned connections and connection pool exhaustion in PostgreSQL.

### Q14: How is lead deduplication handled in `LeadsService`?
**Answer:** When an enterprise demo inquiry is submitted, `LeadsService` normalizes the email, extracts the corporate domain, and checks whether an active lead with that email or company domain already exists within a 30-day window. If so, it increments the contact attempt counter rather than creating duplicate CRM entries.

### Q15: Why is `class-validator` configured with `whitelist: true` and `forbidNonWhitelisted: true`?
**Answer:** To prevent mass-assignment vulnerabilities. If an attacker submits unexpected extra properties (such as `{ "role": "ADMIN" }` on a registration endpoint), `forbidNonWhitelisted` immediately rejects the request with an HTTP 400 Bad Request error.

### Q16: How does `RolesGuard` work in conjunction with `@Roles()` decorator?
**Answer:** The `@Roles()` decorator attaches allowed roles metadata to route handlers using NestJS `Reflector`. `RolesGuard` implements `CanActivate`, reads the required roles from the handler or class metadata, extracts the authenticated user's role from `request.user`, and verifies whether the user possesses the necessary privileges.

### Q17: What is the role of `GlobalHttpExceptionFilter`?
**Answer:** It catches all unhandled exceptions thrown across the application, normalizes them into a consistent JSON envelope (`statusCode`, `message`, `error`, `timestamp`, `path`), logs the error with stack traces, and prevents internal server stack traces from leaking to public clients.

### Q18: What is the difference between Prisma's `prisma migrate deploy` and `prisma migrate dev`?
**Answer:** `prisma migrate dev` is for development: it detects schema changes, creates a new SQL migration file, applies it, and updates Prisma Client. `prisma migrate deploy` is for production/CI environments: it applies existing, unapplied migration files strictly without looking for schema differences or modifying migration history.

### Q19: Why does Interveasy use `@prisma/adapter-pg`?
**Answer:** In Prisma 7, driver adapters allow Prisma Client to connect to PostgreSQL through standard Node.js database drivers like `pg.Pool`. This provides improved connection pooling control, lower overhead, and support for modern cloud environments.

### Q20: How are soft and hard deletions handled in the system?
**Answer:** For critical entities like sessions, soft deletion is implemented via `revokedAt: DateTime?`. A revoked session is preserved for security audit logs but rejected for any future authentication attempts. For ephemeral relations, cascade deletes are configured in Prisma relations (e.g. deleting an interview deletes its associated notes).

### Q21: How is rate limiting implemented across the API?
**Answer:** `@nestjs/throttler` is registered globally with a limit of 100 requests per 60 seconds per IP address. Critical authentication endpoints can also apply custom `@Throttle()` decorators with tighter limits to prevent brute-force credential stuffing.

### Q22: What happens if two identical requests to mark a task as completed arrive simultaneously?
**Answer:** The `Progress` model has a composite unique constraint `@@unique([userId, taskId])`. An idempotent upsert or transactional write is used, ensuring that concurrent requests either update the existing completion record or handle the conflict cleanly without creating duplicate progress rows.

### Q23: How does the application manage environment variables safely?
**Answer:** It uses NestJS `ConfigModule` with Joi/validation schema validation in `src/config/env.validation.ts`. If required variables (such as `DATABASE_URL` or `JWT_SECRET`) are missing or do not satisfy security constraints (e.g., minimum 32 characters for `JWT_SECRET`), the application fails fast during startup before accepting any traffic.

### Q24: What is the difference between `startAt` and `scheduledAt` naming conventions?
**Answer:** `startAt` and `endAt` are explicit ISO-8601 timestamps representing a bounded time interval. This makes interval overlap logic ($startAt < existing.endAt \land endAt > existing.startAt$) unambiguous compared to a single `scheduledAt` point in time.

### Q25: How would you scale this architecture to handle 100,000 active concurrent users?
**Answer:**
1. **Stateless App Tier:** Run multiple NestJS container instances behind an Application Load Balancer (AWS ALB / Nginx).
2. **Distributed Cache:** Replace in-memory Throttler storage with a Redis cluster for shared rate-limiting and session revocation blacklists.
3. **Database Read Replicas:** Route read queries (`GET /api/programs`, `GET /api/assessments`) to PostgreSQL read replicas using Prisma read/write split pools.
4. **Asynchronous Processing:** Offload email notifications, lead CRM syncs, and PDF report generation to background job queues (BullMQ / Redis).
