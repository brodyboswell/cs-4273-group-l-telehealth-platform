# Unit Test Comparison: Technology Stack Evaluation

This document compares the results of implementing **one unit test** for the **User Text Input** feature across three candidate stacks—Python, TypeScript, and JavaScript—and evaluates each stack’s suitability for the Virtual Client Telehealth Simulation Platform.

## Feature Under Test

**User text input** validates and normalizes student messages before they enter the interaction/response log and decision-tree routing pipeline.

All three implementations use the same behavior:

1. Reject `null` / `None` input
2. Trim leading/trailing whitespace
3. Reject empty or whitespace-only strings
4. Return the cleaned message string

**Shared test case:** `"  How are you feeling today?  "` → `"How are you feeling today?"`

## Test Results

| Language | Test Framework | Result | Notes |
| -------- | -------------- | ------ | ----- |
| **Python** | `unittest` (stdlib) | **PASSED** | Zero extra dependencies; ran immediately with the system Python interpreter |
| **JavaScript** | `node:test` + `node:assert` | **PASSED** | Zero extra dependencies; ran with Node’s built-in test runner |
| **TypeScript** | `node:test` via `tsx` | **PASSED** | Required `npm install` (TypeScript, `tsx`, `@types/node`) before the first run |

**Overall:** All three suites pass when executed individually or via `python run_all_tests.py`.

## Comparison by Evaluation Criteria

### 1. Setup & Tooling Overhead

| Criterion | Python | JavaScript | TypeScript |
| --------- | ------ | ---------- | ---------- |
| Extra packages to run the test | None | None | Yes (`tsx`, `typescript`, `@types/node`) |
| Time to first green test | Fastest | Fast | Slowest (install step) |
| Fit for quick prototype spikes | Strong | Strong | Moderate |

**Takeaway:** Python and JavaScript minimize friction for early prototypes. TypeScript adds setup cost that pays off later through type safety.

### 2. Clarity & Maintainability of the Test

| Criterion | Python | JavaScript | TypeScript |
| --------- | ------ | ---------- | ---------- |
| Readable Arrange–Act–Assert structure | Yes | Yes | Yes |
| Compile-time checks on test/feature API | No | No | Yes |
| Refactor safety as schemas grow | Low–medium | Low | High |

**Takeaway:** All three tests are equally clear for this simple case. TypeScript becomes more valuable as message schemas, session metadata, and rubric payloads grow more complex.

### 3. Alignment With Project Needs

Our system needs real-time text capture, deterministic decision-tree routing, audit logging, interactive canvas tools, and rubric evaluation.

| Project need | Python | JavaScript | TypeScript |
| ------------ | ------ | ---------- | ---------- |
| Fast chat / text I/O prototype | Strong | Strong | Strong |
| Decision-tree / FSM state modeling | Strong (custom / libs) | Adequate | Strong (`XState`, typed states) |
| Canvas tools (whiteboard, emotion sheet, chess UI) | Frontend still JS/React | Strong (React ecosystem) | Strong (typed React / Next.js) |
| AI / evaluation / data pipelines | Strongest (FastAPI, Pydantic, ML/LLM tooling) | Adequate | Good (Zod, Vercel AI SDK) |
| End-to-end type safety (client ↔ server contracts) | Split stack (TS front + Python back) | Weak | Strongest |
| Team onboarding for a semester project | Familiar for many CS students | Lowest barrier | Medium barrier, high long-term payoff |

## Suitability Summary

### Python (FastAPI + React)
- **Pros:** Excellent for backend logic, evaluation scoring, and AI/decision-tree tooling; stdlib testing is simple and reliable.
- **Cons:** Frontend remains a separate language; API contracts between React and FastAPI need manual discipline (or generated clients).
- **Best if:** Backend-heavy evaluation and research pipelines are the priority.

### JavaScript (Express + React/Vite)
- **Pros:** Fastest full-stack prototyping; one language family for UI and API; unit tests run with no install friction.
- **Cons:** No compile-time guarantees for session logs, tree nodes, or rubric schemas—risk grows as features accumulate.
- **Best if:** Speed of iteration matters more than strict correctness guarantees early on.

### TypeScript (Next.js / Fastify + React)
- **Pros:** Shared types across UI, route handlers, decision-tree nodes, and log payloads; strongest fit for a complex, stateful telehealth simulation; tests catch contract mistakes earlier.
- **Cons:** Higher initial tooling cost (as seen in this exercise’s `npm install` requirement).
- **Best if:** The team wants long-term maintainability for interactive tools, audited logs, and rubric evaluation in one typed codebase.

## Recommendation

For this project’s combination of **structured dialogue state**, **auditable logs**, and **interactive clinical tools**, **TypeScript is the most suitable overall stack**, despite slightly higher unit-test setup cost. Python remains a strong option for backend evaluation/AI components if the team prefers a split architecture. JavaScript is viable for rapid early prototypes but is the weakest long-term fit for typed clinical schemas and deterministic session state.

This comparison is based on a single feature unit test and should be revisited after the foundation prototype (chat + decision tree) is implemented.
