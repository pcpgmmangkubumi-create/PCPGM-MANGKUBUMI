# Security Specification — AI SMART TEACHER

## 1. Data Invariants
1. **Strict Ownership**: Every teacher-scoped document (`schools`, `curricula`, `calendars`, `textbooks`, `workspaces`, `documents`, `prosem_items`, `classes`, `students`, `questions`, `quizzes`, `grades`, `journals`, `ai_settings`) must carry `ownerId == request.auth.uid` on creation and preserve `ownerId` immutably on updates.
2. **Role Integrity**: On `/users/{userId}`, users cannot self-assign `role == 'admin'` during creation or escalate their `role` on update; only a verified Admin can grant admin privileges.
3. **PII Isolation**: Student records (`/students/{studentId}`) and user profiles (`/users/{userId}`) are readable only by the owning teacher or verified Admin (`isOwner` / `isAdmin`).
4. **Exam Key Isolation**: `/quizzes/{quizId}` never stores plaintext answer keys (`correctAnswer`); grading uses server-sealed tokens, and `/quiz_submissions/{submissionId}` is readable only by the owning teacher (`quizOwnerId`), the submitting signed-in student (`studentUid`), or an Admin.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must match server `request.time`.

## 2. Dirty Dozen Adversarial Payloads
1. **Self-Admin Escalation**: `POST /users/uid123` with `{ role: "admin" }` -> `PERMISSION_DENIED`.
2. **Ghost Shadow Field**: `POST /schools/s1` with `{ ...valid, isVerifiedOfficial: true }` -> `PERMISSION_DENIED`.
3. **Cross-Tenant Ownership Hijack**: `POST /classes/c1` with `{ ownerId: "otherTeacherUid" }` -> `PERMISSION_DENIED`.
4. **Owner Mutation**: `PATCH /documents/d1` changing `ownerId` -> `PERMISSION_DENIED`.
5. **ID Poisoning**: `PUT /textbooks/<2000-char-junk-id>` -> `PERMISSION_DENIED` (`isValidId` guard).
6. **Student PII Scraping**: `LIST /students` as non-owner teacher -> `PERMISSION_DENIED`.
7. **Unverified Email Write**: `POST /workspaces/w1` with `email_verified: false` -> `PERMISSION_DENIED`.
8. **Client Timestamp Forgery**: `POST /journals/j1` with `createdAt` set to a forged past date -> `PERMISSION_DENIED`.
9. **Closed Quiz Submission**: `POST /quiz_submissions/sub1` referencing a `draft` or `closed` quiz -> `PERMISSION_DENIED`.
10. **Student Grade Tampering**: `PATCH /quiz_submissions/sub1` by student attempting to raise `finalScore` -> `PERMISSION_DENIED`.
11. **Oversized String DoS**: `POST /questions/q1` with 2MB `stem` string -> `PERMISSION_DENIED`.
12. **Blanket Collection Read**: `LIST /documents` without `ownerId == request.auth.uid` filter -> `PERMISSION_DENIED`.
