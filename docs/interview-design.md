# Interview Scheduling Design

## Actors

| Actor | Description | Auth | Permissions |
|---|---|---|---|
| USER (candidate) | Authenticated learner/candidate (Role.USER) | JWT bearer (JwtAuthGuard), identity from @CurrentUser() (AuthenticatedUser.userId/role/email/sessionId) | Create interview requests as self (candidate); view own interview details; view own interviews list/history (/users/me/interviews); view interviewer availability slots; create notes on interviews they participate in (visibility enforced); request allowed status changes on own interviews where policy permits (e.g. cancel own pending/confirmed per rules). Cannot access others’ interviews/notes, cannot manage others’ availability, cannot perform interviewer/admin-only actions. |
| INTERVIEWER (participant role) | Authenticated user acting as interviewer (identified by interviewerId on Interview/Availability) | JWT | Manage own availability; view interviews where assigned as interviewer; create/view notes for assigned interviews per visibility; perform permitted status transitions for assigned interviews (confirm/reject/complete/no-show/cancel per rules). Cannot access unrelated interviews. |
| ADMIN | Authenticated administrator (Role.ADMIN) | JWT + RolesGuard/@Roles | Full management/oversight: manage availability where authorized, view/manage interviews for support, perform administrative status actions where allowed. Subject to auditability. |

**Authorization/ownership conventions:** Reuse existing JwtAuthGuard, RolesGuard, @Roles, @CurrentUser(). Never trust userId/uthorId from body; derive from JWT. Resource ownership checks prevent IDOR: candidates access only interviews where userId == currentUserId; interviewers access only where interviewerId == currentUserId; admins may access as authorized. Note visibility enforced on read/write.

## Entities

> Prisma/PostgreSQL, aligned with existing conventions (UUID string ids, timestamps, enums, relations, indexes/constraints). Reuse existing User (and optional Assessment) models.

### Interview
| Field | Type | Notes |
|---|---|---|
| id | String @id @default(uuid()) | PK |
| userId | String | FK → User (candidate/owner) |
| interviewerId | String | FK → User (interviewer) |
| ssessmentId | String? | optional FK to Assessment |
| 	itle | String | required |
| description | String? | optional |
| startAt | DateTime | **stored in UTC** |
| endAt | DateTime | **stored in UTC**, must be > startAt |
| 	imezone | String | IANA timezone identifier (validated) |
| status | InterviewStatus | default PENDING |
| meetingUrl | String? | optional |
| createdAt, updatedAt | DateTime | |

**Relations:** N:1 candidate, N:1 interviewer, N:1 optional assessment, 1:N notes, 1:N statusHistory. **Indexes:** (userId), (interviewerId), (status), (startAt), (endAt), (userId,startAt), (interviewerId,startAt). **Conflict prevention:** transactional checks with locking and PostgreSQL exclusion constraint on 	stzrange(startAt,endAt,'[)') for active (non-cancelled/rejected) interviews to prevent double-booking under concurrency (409).

### InterviewAvailability
| Field | Type | Notes |
|---|---|---|
| id | String @id @default(uuid()) | PK |
| interviewerId | String | FK → User |
| dayOfWeek | Int | 0–6 |
| startTime | String | local HH:mm in availability timezone |
| endTime | String | local HH:mm; midnight-crossing supported |
| 	imezone | String | IANA timezone |
| isActive | Boolean @default(true) | |

**Indexes:** (interviewerId), (interviewerId,isActive), (dayOfWeek).

### InterviewNote
| Field | Type | Notes |
|---|---|---|
| id | String @id @default(uuid()) | PK |
| interviewId | String | FK → Interview |
| uthorId | String | FK → User (from JWT) |
| content | String | validated, non-empty |
| isibility | NoteVisibility | PRIVATE \| SHARED |
| createdAt, updatedAt | DateTime | |

**Indexes:** (interviewId), (authorId), (visibility). PRIVATE visible only to author (and admin where authorized by policy); SHARED visible to interview participants/admins.

### InterviewStatusHistory
| Field | Type | Notes |
|---|---|---|
| id | String @id @default(uuid()) | PK |
| interviewId | String | FK → Interview |
| romStatus | InterviewStatus | |
| 	oStatus | InterviewStatus | |
| changedById | String | FK → User |
| eason | String? | optional |
| createdAt | DateTime | |

### Enums
- InterviewStatus: PENDING, CONFIRMED, REJECTED, CANCELLED, COMPLETED, NO_SHOW
- NoteVisibility: PRIVATE, SHARED

### ERD

`mermaid
erDiagram
    User ||--o{ Interview : "candidate userId"
    User ||--o{ Interview : "interviewerId"
    User ||--o{ InterviewAvailability : manages
    User ||--o{ InterviewNote : authors
    User ||--o{ InterviewStatusHistory : changes
    Assessment ||--o{ Interview : optional_context
    Interview ||--o{ InterviewNote : has
    Interview ||--o{ InterviewStatusHistory : tracks

    User { string id PK }
    Interview { string id PK string userId FK string interviewerId FK string assessmentId FK datetime startAt datetime endAt string timezone enum status }
    InterviewAvailability { string id PK string interviewerId FK int dayOfWeek string startTime string endTime string timezone boolean isActive }
    InterviewNote { string id PK string interviewId FK string authorId FK string content enum visibility }
    InterviewStatusHistory { string id PK string interviewId FK enum fromStatus enum toStatus string changedById }
`

## Rules

### Booking & scheduling
- startAt/endAt persisted in **UTC**; 	imezone required valid **IANA** identifier.
- startAt < endAt. Reject past bookings.
- Requested slot must fit interviewer active availability for relevant local day(s) with **timezone conversion**, **DST** handling, and **midnight-crossing** intervals (evaluated in availability timezone, converted to UTC).
- Check both **candidate** and **interviewer** for conflicts; generate available slots from availability minus conflicts.

### Double-booking prevention
- Overlap: existing.startAt < requested.endAt && existing.endAt > requested.startAt.
- Half-open intervals **[startAt, endAt)** so back-to-back allowed.
- Not service-only: transactional creation with locking and/or **PostgreSQL exclusion constraint** on 	stzrange(startAt,endAt,'[)') for active statuses. Return **409 Conflict** on conflict.

### Status flow (centralized)
- Allowed: PENDING→CONFIRMED|REJECTED|CANCELLED, CONFIRMED→CANCELLED|COMPLETED|NO_SHOW.
- No other transitions. **Transition validity** centralized; **actor permissions** validated separately (interviewer/admin confirm/reject/complete/no-show as applicable; cancellation per policy; only authorized actors). Every change recorded in InterviewStatusHistory.

### Notes
- PRIVATE/SHARED. Only authorized participants create notes. Private notes hidden from unauthorized participants. Content validated. Ownership/role/visibility enforced.

### Interview workflow

`mermaid
flowchart TD
    A[Interviewer sets availability] --> B[Candidate gets slots]
    B --> C[POST /interviews]
    C --> D{Valid, future, start<end, in availability, no overlap?}
    D -- No --> R1[400/409]
    D -- Yes --> E[Create PENDING + history]
    E --> F{Interviewer/Admin decision}
    F -- Confirm --> G[CONFIRMED]
    F -- Reject --> H[REJECTED]
    F -- Cancel --> I[CANCELLED]
    G --> J{Outcome}
    J -- Complete --> K[COMPLETED]
    J -- No show --> L[NO_SHOW]
    J -- Cancel --> I
`

### Interview status flow

`mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> CONFIRMED
    PENDING --> REJECTED
    PENDING --> CANCELLED
    CONFIRMED --> CANCELLED
    CONFIRMED --> COMPLETED
    CONFIRMED --> NO_SHOW
    REJECTED --> [*]
    CANCELLED --> [*]
    COMPLETED --> [*]
    NO_SHOW --> [*]
`

### Sequence: booking to confirmation

`mermaid
sequenceDiagram
    autonumber
    actor C as Candidate
    participant API as Interviews API
    participant S as Scheduling Service
    participant DB as PostgreSQL/Prisma
    C->>API: GET /interviewers/:id/availability
    API->>S: compute slots (tz/DST/conflicts)
    S->>DB: read availability + interviews
    S-->>C: 200 slots
    C->>API: POST /interviews (JWT)
    S->>DB: tx + conflict check/lock/exclusion
    alt conflict
      S-->>C: 409 Conflict
    else ok
      S->>DB: create Interview(PENDING)+history
      S-->>C: 201
    end
    actor I as Interviewer/Admin
    I->>API: PATCH /interviews/:id/status CONFIRMED
    S->>DB: validate transition+actor, update+history
    S-->>I: 200 CONFIRMED
`

## API

| Method | Endpoint | Auth | Request | Response |
|---|---|---|---|---|
| POST | /interviews | JWT (candidate self) | interviewerId, assessmentId?, title, description?, startAt, endAt, timezone, meetingUrl? | 201 Interview |
| GET | /interviews/:id | JWT participant/admin | — | 200 Interview (notes filtered) |
| PATCH | /interviews/:id/status | JWT authorized actor | {status, reason?} | 200 Interview |
| GET | /interviewers/:id/availability | JWT | query rom,to,slotMinutes?,timezone? | 200 slots |
| POST | /interviews/:id/notes | JWT participant/admin | {content, visibility} | 201 Note |
| GET | /users/me/interviews | JWT | pagination + status,role,from,to,sortBy,sortOrder | 200 {data,meta} |
| POST | /interview-availability | JWT interviewer/admin (own) | {dayOfWeek,startTime,endTime,timezone,isActive?} | 201 |
| GET | /interview-availability/me | JWT owner | pagination | 200 {data,meta} |
| PATCH | /interview-availability/:id | JWT owner/admin | partial | 200 |
| DELETE | /interview-availability/:id | JWT owner/admin | — | 200 {deleted:true} |

Consistent errors: {statusCode,error,message,path,timestamp} (400/401/403/404/409).

## Edge Cases

| Case | Expected |
|---|---|
| Invalid/missing JWT | 401 |
| Not participant/forbidden (IDOR) | 403 |
| Not found | 404 |
| Invalid DTO/UUID/timezone, startAt>=endAt | 400 |
| Past booking | 400 |
| Outside availability / DST-midnight mismatch | 400/409 |
| Overlap (user or interviewer) | **409 Conflict** |
| Back-to-back [end,start) boundary | 201 allowed |
| Concurrent conflicting bookings | 409 (DB-enforced) |
| Invalid status transition / unauthorized actor | 409 or 400 / 403 |
| Private note to unauthorized viewer | hidden/403 |