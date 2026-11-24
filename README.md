# Interveasy API

> **Interview Preparation Platform — Backend REST API**

A production-ready NestJS backend powering an end-to-end interview preparation platform. It handles authentication, learning content delivery, adaptive assessments, mock interview scheduling, analytics, and lead management — all secured behind JWT + CSRF guards and documented via Swagger.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Available Scripts](#available-scripts)
- [API Modules Overview](#api-modules-overview)
- [Database Schema Overview](#database-schema-overview)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Security](#security)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [NestJS](https://nestjs.com/) v11 (TypeScript) |
| Database | PostgreSQL 15+ |
| ORM | [Prisma](https://www.prisma.io/) v7 (with `@prisma/adapter-pg`) |
| Authentication | JWT (access + refresh tokens via HTTP-only cookies) |
| API Docs | Swagger / OpenAPI (`@nestjs/swagger`) |
| Validation | `class-validator` + `class-transformer` |
| Testing | Jest + Supertest |
| Rate Limiting | `@nestjs/throttler` |

---

## Architecture Overview

The API follows a **modular, layered architecture** typical of enterprise NestJS applications. Each domain (Auth, Users, Learning, Assessments, Interviews, Feedback, Leads) lives in its own self-contained module with a **Controller → Service → Prisma** flow. Cross-cutting concerns — global exception filters, role guards, pagination utilities, CSRF protection — are centralised in `src/common`. Configuration and env-variable validation live in `src/config`. Prisma is exposed as a singleton through a shared `PrismaModule` that every domain module imports.

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm (or npm/yarn — scripts use `pnpm exec` internally)
- PostgreSQL 15+ **or** Docker

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd interveasy

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, etc.

# 4a. Start PostgreSQL via Docker (skip if you have a local instance)
docker run --name nest_postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -p 5432:5432 \
  -d postgres

# 4b. (Optional) Enter the Postgres shell
npm run enterpostgres

# 5. Run database migrations
npx prisma migrate deploy

# 6. Generate Prisma Client
npx prisma generate

# 7. Seed the database with initial data
npm run seed

# 8. Start the development server (hot-reload)
npm run start:dev
```

The API will be available at **http://localhost:3000**.  
Swagger UI will be at **http://localhost:3000/api/docs**.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values below:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Full PostgreSQL connection string | `postgresql://postgres:pass@localhost:5432/interveasy?schema=public` |
| `JWT_SECRET` | Secret key for signing JWTs (**min 32 chars in production**) | `a-very-long-random-string-32chars+` |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `COOKIE_SECURE` | Send cookies over HTTPS only (`true` in production) | `false` |
| `COOKIE_SAMESITE` | Cookie SameSite policy (`lax` / `strict` / `none`) | `lax` |
| `CORS_ORIGIN` | Allowed CORS origin(s), comma-separated | `http://localhost:3000` |

> **Warning** — Never commit your real `.env` file. Use `.env.example` as the template.

---

## API Documentation

Interactive Swagger UI is auto-generated and available at:

```
http://localhost:3000/api/docs
```

It includes every endpoint grouped by module, with request/response schemas, authentication requirements, and example payloads.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Start server in watch mode (hot-reload) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:prod` | Run the compiled production build |
| `npm run test` | Run all unit tests with Jest |
| `npm run test:cov` | Run tests with coverage report |
| `npm run test:e2e` | Run end-to-end tests (Supertest) |
| `npm run seed` | Seed the database with initial/demo data |
| `npm run createtable` | Create a new Prisma migration (`prisma migrate dev`) |
| `npm run gui` | Open Prisma Studio (visual DB browser) |
| `npm run lint` | Lint and auto-fix source files |
| `npm run format` | Format source files with Prettier |

---

## API Modules Overview

| Module | Prefix | Key Features |
|---|---|---|
| **Auth** | `/auth` | Register, login (JWT), refresh token rotation, logout, active session listing, CSRF protection |
| **Users** | `/users` | CRUD operations, profile management, role assignment (ADMIN / INTERVIEWER / CANDIDATE) |
| **Learning Platform** | `/programs`, `/modules`, `/tasks`, `/enrollments`, `/progress` | Programs → Modules → Tasks hierarchy, enrollment management, per-task progress tracking |
| **Assessments** | `/assessments` | Question bank, multiple-choice & coding questions, scoring engine, skill-level calculation, attempt history |
| **Mock Interviews** | `/interviews` | Interviewer availability slots, candidate scheduling, conflict detection, status lifecycle (PENDING → CONFIRMED → COMPLETED), session notes |
| **Feedback & Analytics** | `/feedback` | Per-category feedback, aggregated performance scores, trend analytics, weak-area identification |
| **Lead Management** | `/leads` | Demo request capture, duplicate detection, CRM-style status workflow, conversion analytics |

---

## Database Schema Overview

### Core Entities & Relationships

```
User
 ├── RefreshToken[]        (1-to-many: a user has many active sessions)
 ├── Enrollment[]          (1-to-many: a user enrolls in many programs)
 ├── Progress[]            (1-to-many: tracks completion per task)
 ├── AssessmentAttempt[]   (1-to-many: assessment history)
 ├── Interview[]           (as candidate — 1-to-many)
 └── Interview[]           (as interviewer — 1-to-many)

Program
 └── Module[]
      └── Task[]

Assessment
 ├── Question[]
 └── AssessmentAttempt[]

Interview
 ├── InterviewerAvailability (linked slot)
 └── InterviewNote[]

Feedback  → linked to User + Interview
Lead      → standalone CRM entity
```

### Key Design Decisions

- **Soft cascade**: enrollments are deleted when a program is removed.
- **Unique constraints**: one enrollment per user–program pair; one progress record per user–task pair.
- **UTC timestamps**: all `scheduledAt` fields stored in UTC; conversion is the client's responsibility.
- **Token rotation**: each refresh issues a new token and invalidates the old one, stored in the `RefreshToken` table.

---

## Project Structure

```
interveasy/
├── prisma/
│   ├── schema.prisma          # Prisma data model (source of truth for DB schema)
│   ├── seed.ts                # Database seeder
│   └── migrations/            # Auto-generated SQL migration history
├── src/
│   ├── main.ts                # Bootstrap: Swagger, cookies, CORS, validation pipe
│   ├── app.module.ts          # Root module wiring all feature modules
│   ├── auth/                  # JWT auth, refresh tokens, CSRF, session management
│   │   ├── guards/            # JwtAuthGuard, CsrfGuard
│   │   ├── strategies/        # Passport JWT strategy + JWT service
│   │   ├── decorators/        # @CurrentUser()
│   │   ├── dto/               # LoginDto, RegisterDto
│   │   ├── types/             # Auth type definitions
│   │   └── utils/             # Duration parser, token utilities
│   ├── users/                 # User entity CRUD + role management
│   ├── programs/              # Learning programs
│   ├── modules/               # Program modules (chapters)
│   ├── tasks/                 # Individual learning tasks
│   ├── enrollments/           # User ↔ Program enrollment
│   ├── progress/              # Per-task completion tracking
│   ├── assessments/           # Question bank + scoring engine
│   ├── scoring/               # Score calculation helpers
│   ├── interviews/            # Mock interview scheduling & lifecycle
│   ├── feedback/              # Structured feedback + analytics
│   ├── leads/                 # CRM lead capture
│   ├── prisma/                # PrismaService singleton + PrismaModule
│   ├── config/                # Env validation (Joi/class-validator schema)
│   ├── common/
│   │   ├── filters/           # GlobalHttpExceptionFilter
│   │   ├── guards/            # RolesGuard
│   │   ├── decorators/        # @Roles()
│   │   └── utils/             # Pagination helper
│   └── generated/             # Auto-generated Prisma client types (do not edit)
├── test/
│   ├── app.e2e-spec.ts        # End-to-end test suite
│   └── jest-e2e.json          # E2E Jest config
├── .env.example               # Environment variable template
├── .env                       # Local secrets — NOT committed
├── package.json
├── tsconfig.json
└── nest-cli.json
```

---

## Testing

### Unit Tests

```bash
npm run test          # run all *.spec.ts files
npm run test:cov      # with Istanbul coverage report (output: /coverage)
npm run test:watch    # watch mode for TDD
```

### End-to-End Tests

```bash
npm run test:e2e      # Supertest against a running NestJS app instance
```

> **Tip** — Point E2E tests at a separate test database by overriding `DATABASE_URL` in a `.env.test` file and running:
> ```bash
> DATABASE_URL="postgresql://..." npm run test:e2e
> ```

### Coverage Goals

| Area | Target |
|---|---|
| Services | ≥ 80 % line coverage |
| Controllers | ≥ 70 % line coverage |
| Guards / Strategies | ≥ 90 % line coverage |

---

## Security

| Feature | Implementation |
|---|---|
| **Password hashing** | `bcrypt` with configurable salt rounds |
| **JWT access tokens** | Short-lived (default 15 min), delivered as HTTP-only cookies |
| **JWT refresh tokens** | Long-lived (default 7 d), stored hashed in DB; rotation on each refresh |
| **CSRF protection** | Custom `CsrfGuard` — validates `x-csrf-token` header on state-changing requests |
| **Role-based access** | `RolesGuard` + `@Roles()` decorator; roles: `ADMIN`, `INTERVIEWER`, `CANDIDATE` |
| **Rate limiting** | `@nestjs/throttler` applied globally |
| **Input validation** | `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` |
| **CORS** | Restricted to `CORS_ORIGIN` env value |
| **HTTP-only cookies** | Prevents XSS-based token theft |

---

## License

UNLICENSED — private project.
