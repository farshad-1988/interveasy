# Interveasy Backend — Senior Engineering Audit & Completion Report

> **Project:** Interveasy (Interview Practice Platform Backend)  
> **Author:** Senior Backend Engineer & Software Architect  
> **Date:** 2026-11-13  
> **Stack:** NestJS 11 · Prisma ORM 7.10 (PrismaPg adapter) · PostgreSQL · JWT + CSRF Auth · Swagger OpenAPI

---

## 1. Executive Summary

The Interveasy backend was audited, enhanced, and completed to transform it from a foundational interview booking and authentication baseline into a secure, production-grade enterprise interview practice platform.

### Key Deliverables Implemented
1. **Feedback & Performance Analytics Module (`src/feedback/`):**
   - Peer evaluation across 5 categories (`TECHNICAL`, `COMMUNICATION`, `PROBLEM_SOLVING`, `BEHAVIORAL`, `OVERALL`) with 1–5 scoring.
   - Enforced duplicate prevention (unique per author, interview, and category) with HTTP 409 Conflict.
   - Self-feedback prevention and non-participant access denial (HTTP 400 & 403).
   - In-database aggregation (`AVG`, `COUNT`, `MIN`, `MAX`, `GROUP BY`) eliminating wasteful in-memory Node.js processing.
   - Admin global analytics (`/analytics/feedback-by-category`, `/analytics/average-scores`, `/analytics/trends`).
2. **Demo Requests & Lead Management CRM (`src/leads/`):**
   - Public lead intake endpoint (`POST /demo-requests`) with input sanitization and email normalization.
   - Duplicate prevention within transactional boundary (HTTP 409 Conflict).
   - Admin lead listing with multi-field search, status/source/size/date filters, pagination, and sorting.
   - Strict status transition lifecycle (`NEW` → `CONTACTED` → `QUALIFIED` → `CONVERTED`).
   - Admin CRM conversion analytics and monthly acquisition trajectory.
3. **Interview Scheduling Enhancements (`src/interviews/`):**
   - Validated recurring availability rules and slot calculations.
   - Handled daylight saving time and IANA timezones using zoned date conversions.
   - Prevented interviewer and candidate double-booking using both database transactions and PostgreSQL exclusion constraints (`EXCLUDE USING gist`).
4. **Security & Production Hardening:**
   - Swagger OpenAPI documentation configured with `@nestjs/swagger` and `swagger-ui-express` across all controller routes and DTOs.
   - Role-Based Access Control (`RolesGuard` & `@Roles(Role.ADMIN)`) protecting administrative and analytical surfaces.
   - Resolved CommonJS / ESM build conflicts in Jest by installing compatible `@nestjs/swagger@11.4.8`.
   - Fixed missing `role` properties in existing authentication unit test specs.
   - Comprehensive test suites: **18 test suites, 96 unit tests passing** and complete e2e test suites.

---

## 2. Inventory of Created and Modified Files

### Created Files
| File Path | Description |
|---|---|
| `src/feedback/dto/feedback.dto.ts` | DTOs for feedback creation, queries, and analytics with class-validator & Swagger decorators |
| `src/feedback/feedback.service.ts` | Business logic for feedback submission, personal stats, and admin analytics |
| `src/feedback/feedback.controller.ts` | Controllers for `/interviews/:id/feedback`, `/sessions/:id/feedback`, `/users/me/feedback`, `/analytics/*` |
| `src/feedback/feedback.module.ts` | NestJS module registering feedback providers and controllers |
| `src/feedback/feedback.service.spec.ts` | Unit tests covering all feedback validation, duplication, and calculation cases |
| `src/leads/dto/lead.dto.ts` | DTOs for public demo requests, admin lead queries, assignment, and status updates |
| `src/leads/leads.service.ts` | CRM logic for lead deduplication, transitions, assignments, and conversion metrics |
| `src/leads/leads.controller.ts` | Public `/demo-requests` controller and administrative `/admin/leads` controllers |
| `src/leads/leads.module.ts` | NestJS module registering lead providers and controllers |
| `src/leads/leads.service.spec.ts` | Unit tests covering lead intake, duplicate conflicts, lifecycle transitions, and analytics |
| `test/feedback.e2e-spec.ts` | End-to-end integration tests for feedback lifecycle and RBAC |
| `test/leads.e2e-spec.ts` | End-to-end integration tests for CRM lead intake, transitions, and analytics |
| `test/interviews.e2e-spec.ts` | End-to-end integration tests for interview scheduling, conflicts, notes, and availability |
| `prisma/migrations/20261113143000_add_feedback_and_leads/migration.sql` | Production PostgreSQL DDL for Feedback and Lead tables, enums, indexes, and FKs |
| `docs/DESIGN.md` | Comprehensive system design document (Actors, ERD, Rules, Edge Cases) |
| `docs/SQL_QUERIES.md` | Manually executable PostgreSQL queries, JOINs, aggregations, and index justifications |
| `docs/DEMO.md` | Real-world API demonstration flows with request/response payloads |
| `docs/FINAL_REPORT.md` | This audit, implementation, and verification document |

### Modified Files
| File Path | Changes Made |
|---|---|
| `prisma/schema.prisma` | Added `FeedbackCategory`, `Feedback`, `LeadStatus`, `LeadSource`, `Lead` models and User/Interview relations |
| `prisma/seed.ts` | Seeded recurring availability, completed interview, categorized feedback, and CRM leads |
| `src/app.module.ts` | Registered `FeedbackModule` and `LeadsModule` |
| `src/main.ts` | Added Swagger OpenAPI setup at `/api/docs` |
| `src/auth/auth.controller.ts` | Added Swagger tags and operation metadata; cleaned up unused imports |
| `src/auth/auth.controller.spec.ts` | Fixed missing `role: 'USER'` on test `AuthenticatedUser` arguments |
| `src/users/users.controller.ts` | Added `@ApiTags('Users & Administration')` and endpoint operation docs |
| `src/interviews/interviews.controller.ts` | Added Swagger tags and detailed response status documentation |
| `src/interviews/interview-availability.controller.ts` | Added Swagger documentation for recurring availability endpoints |
| `package.json` | Installed `@nestjs/swagger@11.4.8` and `swagger-ui-express@^5.0.1` |

---

## 3. Database Schema & Relationships

### Entity-Relationship Architecture

```mermaid
erDiagram
    User ||--o{ Interview : "books as candidate"
    User ||--o{ Interview : "hosts as interviewer"
    User ||--o{ InterviewAvailability : "defines rules"
    User ||--o{ InterviewNote : "writes notes"
    User ||--o{ Feedback : "submits as author"
    User ||--o{ Feedback : "receives as subject"
    User ||--o{ Lead : "assigned leads"
    Interview ||--o{ InterviewNote : "contains notes"
    Interview ||--o{ InterviewStatusHistory : "tracks state"
    Interview ||--o{ Feedback : "evaluated in"

    Feedback {
        string id PK
        string authorId FK
        string subjectId FK
        string interviewId FK
        FeedbackCategory category
        int score
        string comment
        datetime createdAt
    }

    Lead {
        string id PK
        string fullName
        string email
        string phone
        string company
        string jobTitle
        int teamSize
        string message
        LeadStatus status
        LeadSource source
        string assignedToId FK
        string adminNotes
        datetime createdAt
    }
```

### PostgreSQL Index Strategy & Justification

| Table | Index Columns | Type | Justification |
|---|---|---|---|
| `Feedback` | `[authorId, interviewId, category]` | UNIQUE | **Enforces business rule:** Prevents duplicate feedback for the same category on an interview |
| `Feedback` | `[subjectId]` | B-Tree | Speeds up candidate feedback retrieval (`WHERE "subjectId" = $1`) |
| `Feedback` | `[subjectId, category]` | Composite B-Tree | Optimizes category filtering on a user's feedback history |
| `Feedback` | `[subjectId, createdAt]` | Composite B-Tree | Optimizes paginated ordering (`ORDER BY "createdAt" DESC`) for user dashboards |
| `Feedback` | `[interviewId]` | B-Tree | Fast lookup of all feedback belonging to an interview session |
| `Lead` | `[email]` | B-Tree | Fast duplicate check during lead submission (`WHERE "email" = $1`) |
| `Lead` | `[status]` | B-Tree | Accelerates admin pipeline filtering (`WHERE "status" = 'NEW'`) |
| `Lead` | `[status, createdAt]` | Composite B-Tree | Powers CRM queue sorting by status and submission date |
| `Interview` | `[userId, startAt]` | Composite B-Tree | Candidate schedule overlap detection and upcoming booking queries |
| `Interview` | `[interviewerId, startAt]` | Composite B-Tree | Interviewer schedule overlap detection |

---

## 4. API Endpoints Catalog

### Authentication & Users
- `POST /auth/register` — User registration
- `POST /auth/login` — Authentication and session cookie issuance
- `POST /auth/logout` — Session revocation
- `GET /users/me` — Authenticated user profile
- `PATCH /users/me` — Update user profile
- `GET /users` — List all users (*Admin only*)
- `GET /users/:id` — View user profile (*Admin or Self*)
- `PUT /users/:id/role` — Modify user role (*Admin only*)

### Interviews & Scheduling
- `POST /interviews` — Book a new interview session
- `GET /interviews/:id` — View interview session details
- `PATCH /interviews/:id/status` — Lifecycle transition (`CONFIRMED`, `CANCELLED`, `COMPLETED`, `REJECTED`, `NO_SHOW`)
- `POST /interviews/:id/notes` — Add evaluation note (`SHARED` or `PRIVATE`)
- `GET /users/me/interviews` — Paginated user interview history
- `GET /interviewers/:id/availability` — Compute open booking slots
- `POST /interview-availability` — Set recurring availability rule
- `GET /interview-availability/me` — List interviewer's availability rules
- `PATCH /interview-availability/:id` — Update availability rule
- `DELETE /interview-availability/:id` — Remove availability rule

### Feedback & Performance Analytics
- `POST /interviews/:id/feedback` — Submit peer feedback (1–5 score + commentary)
- `POST /sessions/:id/feedback` — Endpoint alias for interview feedback
- `GET /users/me/feedback` — Candidate's received feedback history
- `GET /users/me/performance` — Database-aggregated performance metrics
- `GET /analytics/feedback-by-category` — Category distribution (*Admin only*)
- `GET /analytics/average-scores` — Score averages & top performers (*Admin only*)
- `GET /analytics/trends` — Monthly scoring and volume trajectory (*Admin only*)

### Demo Requests & CRM Leads
- `POST /demo-requests` — Public demo request intake (*Unauthenticated*)
- `GET /admin/leads` — List CRM leads with filters & pagination (*Admin only*)
- `GET /admin/leads/analytics` — Conversion rate & acquisition breakdown (*Admin only*)
- `GET /admin/leads/:id` — Lead details by UUID (*Admin only*)
- `PATCH /admin/leads/:id/status` — Advance lead lifecycle status (*Admin only*)
- `PATCH /admin/leads/:id/assign` — Assign lead to team member (*Admin only*)

---

## 5. Security & Business Rules Implementation

### 1. Resource Ownership & IDOR Protection
- Candidates and Interviewers can only access interviews where they are direct participants (`userId === interview.userId || userId === interview.interviewerId`).
- Private interview notes (`visibility === NoteVisibility.PRIVATE`) are strictly hidden from non-authors unless requested by an Admin.
- User profile lookup (`GET /users/:id`) enforces `user.role === Role.ADMIN || user.userId === id`.

### 2. State Transition Finite State Machines (FSM)
- **Interview Lifecycle:**
  - `PENDING` → `CONFIRMED`, `REJECTED`, `CANCELLED`
  - `CONFIRMED` → `COMPLETED`, `CANCELLED`, `NO_SHOW`
  - Terminal states (`REJECTED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`) cannot transition.
  - Role permissions: Only the interviewer can confirm, complete, or reject. Both participants can cancel.
- **Lead Lifecycle:**
  - `NEW` → `CONTACTED`, `QUALIFIED`, `UNQUALIFIED`, `REJECTED`
  - `CONTACTED` → `QUALIFIED`, `UNQUALIFIED`, `REJECTED`
  - `QUALIFIED` → `CONVERTED`, `UNQUALIFIED`, `REJECTED`
  - `UNQUALIFIED` → `QUALIFIED`, `REJECTED`
  - `CONVERTED` → terminal
  - `REJECTED` → `NEW` (re-open)

### 3. Concurrency & Deduplication
- Double-booking prevention runs inside `prisma.$transaction` checking active statuses (`PENDING`, `CONFIRMED`) with time interval overlap:
  $$\text{startAt} < \text{existingEndAt} \quad \text{AND} \quad \text{endAt} > \text{existingStartAt}$$
- PostgreSQL GIST exclusion constraint acts as the final relational safety net:
  `EXCLUDE USING gist ("interviewerId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&)`
- Lead submissions normalize email via `toLowerCase().trim()` and reject duplicates with HTTP 409 Conflict.

---

## 6. Verification & Quality Gates

### 1. TypeScript Strict Typechecking
```powershell
npx tsc --noEmit
# Exit Code: 0 (Zero errors)
```

### 2. ESLint Static Analysis & Prettier Formatting
```powershell
npx eslint "{src,apps,libs,test}/**/*.ts"
# Exit Code: 0 (Zero errors, Zero warnings)
```

### 3. Prisma Schema Validation & Generation
```powershell
npx prisma validate
# The schema at prisma\schema.prisma is valid 🚀

npx prisma generate
# ✔ Generated Prisma Client (7.10.1) to .\src\generated\prisma in 165ms
```

### 4. NestJS Application Compilation Build
```powershell
npx nest build
# Exit Code: 0 (Built successfully to ./dist)
```

### 5. Jest Unit Test Results
```
PASS src/auth/utils/token.util.spec.ts
PASS src/auth/auth.cookies.spec.ts
PASS src/auth/utils/duration.util.spec.ts
PASS src/config/env.validation.spec.ts
PASS src/auth/guards/csrf.guard.spec.ts
PASS src/auth/strategies/jwt.strategy.spec.ts
PASS src/auth/strategies/jwt/jwt.service.spec.ts
PASS src/app.controller.spec.ts
PASS src/users/users.service.spec.ts
PASS src/programs/programs.service.spec.ts
PASS src/interviews/interviews.service.spec.ts
PASS src/progress/progress.service.spec.ts
PASS src/enrollments/enrollments.service.spec.ts
PASS src/leads/leads.service.spec.ts
PASS src/feedback/feedback.service.spec.ts
PASS src/users/users.controller.spec.ts
PASS src/auth/auth.controller.spec.ts
PASS src/auth/auth.service.spec.ts

Test Suites: 18 passed, 18 total
Tests:       96 passed, 96 total
Snapshots:   0 total
Time:        7.971 s
```

---

## 7. Operational Instructions

### Required Environment Variables
Ensure the following variables are defined in your `.env` file:
```env
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/interveasy?schema=public"
JWT_SECRET="your-ultra-secure-jwt-secret-min-32-chars"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
CORS_ORIGIN="http://localhost:5173"
DISABLE_AUTH_THROTTLE="false"
```

### Starting the Server
```bash
# Development mode
npm run start:dev

# Production build and run
npm run build
npm run start:prod
```

### Accessing Interactive Swagger API Documentation
Once the server is running, navigate to:
```
http://localhost:3000/api/docs
```
The Swagger UI provides interactive request execution, schema documentation, and authentication headers for all endpoints across Authentication, Users, Interviews, Availability, Feedback, Analytics, and CRM Leads.
