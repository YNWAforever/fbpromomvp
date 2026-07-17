# Staff Operations Dashboard Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with review gates.

Goal: Complete the staff-only operations dashboard for triaging venue coverage, approvals, sends, reports, and safe retry/cancel/pause actions.

Architecture: Keep data reads in server pages behind requireStaff(). Reuse existing repositories and application services; pass plain serializable rows to small presentation components. Keep mutating controls as server actions that validate the allowed promotion state and write audit events before and after state changes.

Tech Stack: Next.js App Router, React Server Components, server actions, Drizzle repositories, Vitest, Tailwind utility classes.

## Global constraints

- Preserve exact status labels from task-10-brief.md.
- Never call WozTell, BestTime, or OpenCode Go from a component.
- Enforce staff authorization on every page/action.
- Retry only send_failed; cancel only queued or send_failed; pause must audit the staff identity.
- Keep empty and unavailable states explicit; do not fabricate counts.
- Use the current codex/off-peak-rescue-mvp worktree and commit each independently reviewed task.

---

### Task 10A: Shared dashboard components and red tests

Files:
- Create src/components/status-badge.tsx, empty-state.tsx, metric-card.tsx, operations-table.tsx.
- Create src/app/(staff)/dashboard/dashboard.test.tsx.

Interfaces: OperationsTable consumes rows with id, state, optional reason, and optional action callbacks; it renders retry only for send_failed and displays exact status text.

- [ ] Write failing tests for retry visibility, accepted no-retry, Needs match review, empty state, and metric-card unavailable text.
- [ ] Run npm.cmd exec vitest run "src/app/(staff)/dashboard/dashboard.test.tsx" and capture the missing-component failure.
- [ ] Implement the four components with serializable props and accessible labels.
- [ ] Rerun the focused suite and commit feat: add staff dashboard primitives.

### Task 10B: Server dashboard pages

Files:
- Create src/app/(staff)/dashboard/venues/page.tsx, [venueId]/page.tsx.
- Create src/app/(staff)/dashboard/promotions/page.tsx, [promotionId]/page.tsx.
- Create src/app/(staff)/dashboard/reports/page.tsx.
- Create src/app/(staff)/dashboard/operations/page.tsx.

Interfaces: each page calls requireStaff() first; list pages load venue, promotion, and report rows through repositories; detail pages show configuration, readings, triggers, candidates, approvals, delivery, redemption, and audit context.

- [ ] Add route/page tests that mock requireStaff, verify unauthorized short-circuit, and assert unavailable/empty states.
- [ ] Implement the pages using existing DashboardLayout conventions and shared components.
- [ ] Run focused dashboard page tests and commit feat: add staff dashboard pages.

### Task 10C: Safe operations actions

Files:
- Create src/app/(staff)/dashboard/operations/actions.ts.
- Modify src/app/(staff)/dashboard/operations/page.tsx if needed.

Interfaces: server actions accept a promotion ID and staff session; retryPromotionAction calls the Task 7 retry service only for send_failed; cancelPromotionAction permits queued/send_failed; pausePromotionAction writes a staff audit event and returns a typed result.

- [ ] Write red tests for allowed and blocked transitions and audit identity.
- [ ] Implement requireStaff plus repository conditional updates and audit writes.
- [ ] Rerun focused tests and commit feat: add safe staff operations actions.

### Task 10D: Full verification and review

- [ ] Run npm.cmd test -- --run "src/app/(staff)/dashboard", npm.cmd run typecheck, npm.cmd run lint, and placeholder-only npm.cmd run build.
- [ ] Prepare the staged diff for independent spec and code-quality review.
- [ ] Fix findings, rerun all gates, commit the final dashboard changes, and update .superpowers/sdd/progress.md.