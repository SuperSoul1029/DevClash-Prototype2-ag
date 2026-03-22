# DevClash Backend (Phase B4)

Node + Express + MongoDB backend foundation for the DevClash hackathon MVP.

## Stack

- JavaScript (Node.js)
- Express
- MongoDB + Mongoose
- JWT auth
- Zod validation
- Jest + Supertest tests

## Setup

1. Copy `.env.example` to `.env` and edit values.
2. Install dependencies:
   - `npm.cmd install`
3. Run server:
   - `npm.cmd run dev`

## Scripts

- `npm.cmd run dev` - Run with nodemon
- `npm.cmd run start` - Run production mode
- `npm.cmd run lint` - Lint all files
- `npm.cmd run test` - Run Jest API tests
- `npm.cmd run seed` - Seed demo users/curriculum

## API Groups (B1 + B4)

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Users

- `GET /api/users/me/profile`
- `PUT /api/users/me/profile`

### Curriculum

- `GET /api/subjects`
- `GET /api/subjects/:subjectId`
- `POST /api/subjects`
- `PATCH /api/subjects/:subjectId`
- `DELETE /api/subjects/:subjectId`
- `GET /api/topics`
- `GET /api/topics/:topicId`
- `POST /api/topics`
- `PATCH /api/topics/:topicId`
- `DELETE /api/topics/:topicId`

### Retention

- `POST /api/retention/events`
- `GET /api/retention/state`

### Planner

- `GET /api/planner/daily`
- `POST /api/planner/tasks/:taskId/status`
- `POST /api/planner/rebalance`

### Coverage

- `POST /api/coverage/sync-activity`
- `POST /api/coverage/manual-mark`
- `POST /api/coverage/manual-unmark`
- `GET /api/coverage/state`

### Progress

- `GET /api/progress/overview`

### Tests

- `POST /api/tests/generate`
- `POST /api/tests/start`
- `POST /api/tests/save`
- `POST /api/tests/submit`
- `GET /api/tests/result/:attemptId`

### Practice

- `POST /api/practice/next-set`

### Tutor

- `POST /api/tutor/query`

### Media

- `POST /api/media/youtube/explain`
- `GET /api/media/youtube/explain/:jobId`

### Jobs

- `GET /api/jobs/:jobId`

### Health

- `GET /api/health`
- `GET /health`

## Indexes Added

- Users: unique email, role+createdAt
- Profiles: unique userId, classLevel+updatedAt
- Subjects: unique code+classLevel, classLevel+name
- Topics: unique subjectId+slug, classLevel+subjectId+updatedAt
- TopicProgress: unique userId+topicId, userId+nextReviewAt+retentionScore
- RevisionEvents: userId+topicId+occurredAt
- PlannerTasks: userId+dueDate+status, userId+topicId+dueDate+status
- GeneratedExams: userId+createdAt
- ExamAttempts: userId+examId+status, userId+submittedAt+status
- VideoJobs: userId+createdAt, status

## B4 Reliability Notes

- Queue mode defaults to in-memory if `REDIS_URL` is not configured.
- If Redis is configured and reachable, BullMQ is used for YouTube explain jobs.
- API-level request throttling is enabled via rate limiting middleware.
- Structured JSON request/error logging is enabled with per-request IDs.

## Seed Data

Run `npm.cmd run seed` to create:

- Demo user: `student@devclash.local` / `password123`
- Class 11 + 12 subjects
- Sample topics
