# Interveasy Backend — End-to-End Workflow Demonstrations

This document demonstrates the three core workflows supported by the Interveasy backend platform using concrete REST API calls, SQL database executions, and business rule verifications.

---

## Workflow 1: Interview Management & Scheduling

### Overview
Demonstrates scheduling an interview, querying availability slots, conflict detection (preventing double booking), lifecycle status transitions, and adding shared/private notes.

### Step 1: Authentication
Authenticate as Candidate (`john@test.com`) and Interviewer (`jane@test.com`).

```bash
# Candidate Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john@test.com", "password": "Test@123456"}' \
  -c candidate_cookie.txt

# Interviewer Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@test.com", "password": "Test@123456"}' \
  -c interviewer_cookie.txt
```

### Step 2: Query Interviewer Availability
Candidate inspects open booking slots based on the interviewer's recurring weekly availability (e.g., Tuesdays 09:00 - 17:00 UTC).

```bash
curl -X GET "http://localhost:3000/interviewers/JANE_USER_ID/availability?from=2026-11-17T00:00:00Z&to=2026-11-18T00:00:00Z&slotMinutes=60" \
  -b candidate_cookie.txt
```

**Response (HTTP 200 OK):**
```json
{
  "interviewerId": "JANE_USER_ID",
  "timezone": "UTC",
  "from": "2026-11-17T00:00:00.000Z",
  "to": "2026-11-18T00:00:00.000Z",
  "slots": [
    { "startAt": "2026-11-17T09:00:00.000Z", "endAt": "2026-11-17T10:00:00.000Z" },
    { "startAt": "2026-11-17T10:00:00.000Z", "endAt": "2026-11-17T11:00:00.000Z" },
    { "startAt": "2026-11-17T11:00:00.000Z", "endAt": "2026-11-17T12:00:00.000Z" }
  ]
}
```

### Step 3: Book an Interview Session
Candidate schedules an interview reservation for Tuesday 10:00–11:00 UTC.

```bash
curl -X POST http://localhost:3000/interviews \
  -b candidate_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "interviewerId": "JANE_USER_ID",
    "title": "Senior Backend Systems Mock Interview",
    "description": "Topics: Distributed locking, PostgreSQL isolation levels, and NestJS architecture.",
    "startAt": "2026-11-17T10:00:00.000Z",
    "endAt": "2026-11-17T11:00:00.000Z",
    "timezone": "UTC"
  }'
```

**Response (HTTP 201 Created):**
```json
{
  "id": "c1f7a0b3-1111-4444-8888-000000000001",
  "userId": "JOHN_USER_ID",
  "interviewerId": "JANE_USER_ID",
  "title": "Senior Backend Systems Mock Interview",
  "status": "PENDING",
  "startAt": "2026-11-17T10:00:00.000Z",
  "endAt": "2026-11-17T11:00:00.000Z",
  "timezone": "UTC",
  "createdAt": "2026-11-13T14:30:00.000Z"
}
```

### Step 4: Double-Booking & Conflict Detection
Another candidate (or the same candidate) attempts to book an overlapping session (10:30–11:30 UTC).

```bash
curl -X POST http://localhost:3000/interviews \
  -b candidate_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "interviewerId": "JANE_USER_ID",
    "title": "Conflicting Session",
    "startAt": "2026-11-17T10:30:00.000Z",
    "endAt": "2026-11-17T11:30:00.000Z",
    "timezone": "UTC"
  }'
```

**Response (HTTP 409 Conflict):**
```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Scheduling conflict: overlapping interview exists",
  "path": "/interviews",
  "timestamp": "2026-11-13T14:30:05.000Z"
}
```
*Note: Concurrency protection is guarded both at the application level via serializable transaction checks and at the database engine level via PostgreSQL `EXCLUDE USING gist` constraints.*

### Step 5: Interviewer Confirms the Booking
Only the interviewer (or an Admin) has the authority to transition `PENDING -> CONFIRMED`.

```bash
curl -X PATCH http://localhost:3000/interviews/c1f7a0b3-1111-4444-8888-000000000001/status \
  -b interviewer_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CONFIRMED",
    "reason": "Calendar verified and confirmed"
  }'
```

**Response (HTTP 200 OK):**
```json
{
  "id": "c1f7a0b3-1111-4444-8888-000000000001",
  "status": "CONFIRMED",
  "updatedAt": "2026-11-13T14:31:00.000Z"
}
```

### Step 6: Interviewer Adds an Evaluation Note
During or after the interview, the interviewer records feedback notes with controlled visibility (`SHARED` vs `PRIVATE`).

```bash
curl -X POST http://localhost:3000/interviews/c1f7a0b3-1111-4444-8888-000000000001/notes \
  -b interviewer_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Candidate accurately explained PostgreSQL transaction isolation anomalies (dirty read, non-repeatable read, phantom read).",
    "visibility": "SHARED"
  }'
```

**Response (HTTP 201 Created):**
```json
{
  "id": "n1111111-2222-3333-4444-555555555555",
  "interviewId": "c1f7a0b3-1111-4444-8888-000000000001",
  "authorId": "JANE_USER_ID",
  "content": "Candidate accurately explained PostgreSQL transaction isolation anomalies...",
  "visibility": "SHARED",
  "createdAt": "2026-11-13T14:32:00.000Z"
}
```

---

## Workflow 2: Feedback & Performance Analytics

### Overview
Demonstrates peer evaluation across defined categories, prevention of duplicate/self evaluations, database aggregation queries, and administrative performance intelligence.

### Step 1: Submit Categorized Feedback
The interviewer submits scores (1–5) and commentary for the candidate.

```bash
curl -X POST http://localhost:3000/interviews/c1f7a0b3-1111-4444-8888-000000000001/feedback \
  -b interviewer_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "subjectId": "JOHN_USER_ID",
    "category": "TECHNICAL",
    "score": 5,
    "comment": "Demonstrated expert proficiency in database indexing and asynchronous execution."
  }'
```

**Response (HTTP 201 Created):**
```json
{
  "id": "f2222222-3333-4444-5555-666666666666",
  "authorId": "JANE_USER_ID",
  "subjectId": "JOHN_USER_ID",
  "interviewId": "c1f7a0b3-1111-4444-8888-000000000001",
  "category": "TECHNICAL",
  "score": 5,
  "comment": "Demonstrated expert proficiency in database indexing...",
  "createdAt": "2026-11-13T14:33:00.000Z"
}
```

### Step 2: Prevent Duplicate Feedback
Submitting another score for the same author, interview, and category is rejected.

```bash
curl -X POST http://localhost:3000/interviews/c1f7a0b3-1111-4444-8888-000000000001/feedback \
  -b interviewer_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "subjectId": "JOHN_USER_ID",
    "category": "TECHNICAL",
    "score": 4
  }'
```

**Response (HTTP 409 Conflict):**
```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Feedback for category TECHNICAL has already been submitted for this interview"
}
```

### Step 3: Candidate Retrieves Their Feedback History
Candidate views feedback received across all sessions.

```bash
curl -X GET "http://localhost:3000/users/me/feedback?page=1&limit=10&sortBy=createdAt&sortOrder=desc" \
  -b candidate_cookie.txt
```

**Response (HTTP 200 OK):**
```json
{
  "data": [
    {
      "id": "f2222222-3333-4444-5555-666666666666",
      "category": "TECHNICAL",
      "score": 5,
      "comment": "Demonstrated expert proficiency in database indexing...",
      "author": { "id": "JANE_USER_ID", "name": "Jane Doe", "email": "jane@test.com" },
      "interview": { "id": "c1f7a0b3-1111-4444-8888-000000000001", "title": "Senior Backend Systems Mock Interview" }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### Step 4: Candidate Performance Aggregations
Candidate accesses their database-aggregated scores.

```bash
curl -X GET http://localhost:3000/users/me/performance \
  -b candidate_cookie.txt
```

**Response (HTTP 200 OK):**
```json
{
  "overall": {
    "averageScore": 4.67,
    "totalFeedback": 3,
    "minScore": 4,
    "maxScore": 5
  },
  "byCategory": [
    { "category": "TECHNICAL", "totalFeedback": 1, "averageScore": 5.0, "minScore": 5, "maxScore": 5 },
    { "category": "COMMUNICATION", "totalFeedback": 1, "averageScore": 4.0, "minScore": 4, "maxScore": 4 },
    { "category": "PROBLEM_SOLVING", "totalFeedback": 1, "averageScore": 5.0, "minScore": 5, "maxScore": 5 }
  ]
}
```

### Step 5: Admin Global Performance Analytics
Admin requests organization-wide category distribution and trends.

```bash
curl -X GET "http://localhost:3000/analytics/feedback-by-category" \
  -b admin_cookie.txt
```

**Response (HTTP 200 OK):**
```json
[
  { "category": "TECHNICAL", "totalFeedback": 42, "averageScore": 4.35, "minScore": 2, "maxScore": 5 },
  { "category": "COMMUNICATION", "totalFeedback": 40, "averageScore": 4.12, "minScore": 1, "maxScore": 5 },
  { "category": "PROBLEM_SOLVING", "totalFeedback": 38, "averageScore": 4.41, "minScore": 3, "maxScore": 5 }
]
```

---

## Workflow 3: Public Demo Requests & Lead Management (CRM)

### Overview
Demonstrates public prospect lead capture, input sanitization and email normalization, duplicate prevention, administrative review, status lifecycle progression, and conversion analytics.

### Step 1: Public Demo Request Submission
An enterprise prospect submits a demo request via the public landing page (no credentials required).

```bash
curl -X POST http://localhost:3000/demo-requests \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "   Alex Mercer   ",
    "email": "  Alex.Mercer@Gentek-Labs.com  ",
    "phone": "+1-555-0188",
    "company": "Gentek Laboratories",
    "jobTitle": "Director of Software Engineering",
    "teamSize": 60,
    "message": "Evaluating mock interview practice systems for our senior backend hiring pipeline.",
    "source": "WEBSITE"
  }'
```

**Response (HTTP 201 Created):**
```json
{
  "id": "e3333333-4444-5555-6666-777777777777",
  "message": "Demo request received successfully. Our team will contact you shortly."
}
```
*Note: Email was automatically trimmed and normalized to lowercase: `alex.mercer@gentek-labs.com`.*

### Step 2: Prevent Concurrent Duplicate Submissions
If the prospect clicks the submit button multiple times or submits again with the same email while their request is active:

```bash
curl -X POST http://localhost:3000/demo-requests \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Alex Mercer",
    "email": "alex.mercer@gentek-labs.com",
    "company": "Gentek Laboratories"
  }'
```

**Response (HTTP 409 Conflict):**
```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "A demo request with this email is already active and being processed"
}
```

### Step 3: Admin Reviews Leads Pipeline
Sales administrator lists pending leads with pagination and status filters.

```bash
curl -X GET "http://localhost:3000/admin/leads?status=NEW&sortBy=createdAt&sortOrder=desc" \
  -b admin_cookie.txt
```

**Response (HTTP 200 OK):**
```json
{
  "data": [
    {
      "id": "e3333333-4444-5555-6666-777777777777",
      "fullName": "Alex Mercer",
      "email": "alex.mercer@gentek-labs.com",
      "phone": "+1-555-0188",
      "company": "Gentek Laboratories",
      "jobTitle": "Director of Software Engineering",
      "teamSize": 60,
      "status": "NEW",
      "source": "WEBSITE",
      "createdAt": "2026-11-13T14:35:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### Step 4: Admin Updates Lead Lifecycle Status
The administrator transitions the lead from `NEW -> CONTACTED`, recording meeting notes.

```bash
curl -X PATCH http://localhost:3000/admin/leads/e3333333-4444-5555-6666-777777777777/status \
  -b admin_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CONTACTED",
    "adminNotes": "Introductory discovery call conducted. Scheduled live platform walkthrough for Thursday."
  }'
```

**Response (HTTP 200 OK):**
```json
{
  "id": "e3333333-4444-5555-6666-777777777777",
  "status": "CONTACTED",
  "adminNotes": "Introductory discovery call conducted. Scheduled live platform walkthrough for Thursday.",
  "updatedAt": "2026-11-13T14:36:00.000Z"
}
```

### Step 5: Enforcing Lifecycle Transition Integrity
An administrator attempting an invalid direct transition (e.g. from `CONTACTED` back to `NEW` or directly to terminal `CONVERTED` without `QUALIFIED`) is rejected.

```bash
curl -X PATCH http://localhost:3000/admin/leads/e3333333-4444-5555-6666-777777777777/status \
  -b admin_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "status": "NEW"
  }'
```

**Response (HTTP 400 Bad Request):**
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid status transition: cannot change lead from CONTACTED to NEW. Allowed transitions: [QUALIFIED, UNQUALIFIED, REJECTED]"
}
```

### Step 6: Admin CRM Analytics Dashboard
Admin queries conversion and acquisition metrics.

```bash
curl -X GET http://localhost:3000/admin/leads/analytics \
  -b admin_cookie.txt
```

**Response (HTTP 200 OK):**
```json
{
  "totalLeads": 24,
  "byStatus": [
    { "status": "NEW", "count": 6 },
    { "status": "CONTACTED", "count": 8 },
    { "status": "QUALIFIED", "count": 4 },
    { "status": "CONVERTED", "count": 4 },
    { "status": "REJECTED", "count": 2 }
  ],
  "conversionRate": 16.67,
  "bySource": [
    { "source": "WEBSITE", "count": 14 },
    { "source": "REFERRAL", "count": 6 },
    { "source": "EMAIL_CAMPAIGN", "count": 4 }
  ],
  "trends": [
    { "period": "2026-10-01T00:00:00.000Z", "count": 10 },
    { "period": "2026-11-01T00:00:00.000Z", "count": 14 }
  ]
}
```
