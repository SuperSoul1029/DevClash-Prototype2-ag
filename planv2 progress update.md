## March 22, 2026 - Epic 0 (Real Generative AI Core) Executed

### What Was Completed

- Implemented Epic 0 LLM orchestration across core generation domains in the backend service.
- Replaced deterministic-only generation paths with LLM-first JSON-mode generation (with resilient fallback) for:
  - `GET /api/planner/daily` and `POST /api/planner/rebalance` (Planner Intelligence).
  - `POST /api/practice/next-set` (Adaptive Practice Intelligence).
  - `POST /api/tests/generate` (Custom Exam Intelligence).
- Implemented robust LLM client utilities with:
  - OpenAI and OpenRouter compatibility.
  - Automatic JSON-mode detection and enforcement.
  - Resilient JSON extraction logic (handles markdown fences and reasoning clutter).
  - Zod schema validation for all AI outputs.
  - Configurable timeouts and user-friendly error propagation.
- Added visible AI debugging to the frontend:
  - Red error text in Dashboard and Test Center when background AI processes fail.
  - Detailed error messages surfaced from the backend to help troubleshoot API keys, quotas, or parsing issues.

### How It Was Done

- **LLM Client Layer**: Created `backend/src/utils/llmClient.js` using native `fetch`. It supports per-provider headers (OpenRouter metadata), `reasoning` toggles, and regex-based JSON extraction.
- **Provider Switching**: Migrated from OpenAI to OpenRouter (`stepfun/step-3.5-flash:free`) to test reasoning-capable models.
- **UI Error Visibility**: Updated `LearningContext.jsx` to track `aiDebug` messages and added conditional rendering in `DashboardPage.jsx` and `TestCenterPage.jsx`.
- **Environment Management**: Updated `.env` and `env.js` to support `LLM_FORCE_JSON_MODE`, `LLM_REASONING_ENABLED`, and OpenRouter-specific fields.

### Quality Verification

- **API Probing**: Used direct terminal scripts (`Invoke-WebRequest`) to verify 401 (Unauthorized) and 429 (Quota) errors from providers.
- **Regression Testing**: Ensured deterministic fallbacks still work perfectly when AI is disabled or fails.
- **Linting**: Both frontend and backend quality gates pass.

### Adjustments to Next Steps

- **Stable AI Setup**: User must disable `LLM_REASONING_ENABLED` and enable `LLM_FORCE_JSON_MODE` when using strict JSON-only endpoints to avoid parsing failures caused by model verbosity.
- **Backend Restart**: Note that `.env` changes require a full backend process restart to take effect.
- **Demo Hardening**: The current "red error text" should be kept during the hackathon evaluation phase to prove real AI interaction even if providers hit rate limits.

## March 23, 2026 - Phase 1 (LLM Gateway Foundation) Implemented

### What Was Completed

- Added a dedicated Gateway domain under `backend/src/services/llmGateway`.
- Added a versioned contract registry for initial tool families:
  - `planner.daily.tasks.v1`
  - `practice.nextset.v1`
  - `tests.generate.v1`
- Implemented a universal output envelope validator in Gateway:
  - `outputType`
  - `schemaVersion`
  - `payload`
  - `meta` (optional)
- Added a unified Gateway response shape for controllers:
  - `ok`, `status`, `contract`, `data`, `envelope`, `debug`
- Migrated Planner AI generation (`GET /api/planner/daily`) to call Gateway contract execution while preserving deterministic fallback semantics.

### Reliability/Format Notes

- Planner now validates model output against the envelope contract before task normalization.
- When validation fails, Planner receives consistent debug context (`error` + truncated `rawOutput`) from Gateway.
- Existing endpoint behavior remains backward-compatible through existing fallback generation logic.

### Observed Fallback Behavior

- Fallback still activates if:
  - LLM is not configured.
  - Contract validation fails.
  - Provider response cannot be normalized into valid contract payload.
- Controller still returns generation diagnostics to support frontend error visibility.

## March 23, 2026 - Phase 2 (Reliability Layer + Cross-Tool Adoption) Implemented

### What Was Completed

- Upgraded the Gateway orchestration with bounded multi-stage reliability flow:
  - Primary contract parse/validation.
  - Envelope extraction attempt from raw model output.
  - Structured repair attempt for malformed outputs.
  - Deterministic stop conditions with bounded retries.
- Added standardized Gateway attempt telemetry in debug payload:
  - `attemptCount`
  - `attempts[]` with per-stage success/failure (`primary_parse`, `envelope_extract`, `repair`)
  - normalized error code/message and provider/model metadata
- Added Gateway reliability controls via env config:
  - `LLM_GATEWAY_MAX_ATTEMPTS`
  - `LLM_GATEWAY_REPAIR_ENABLED`
  - `LLM_GATEWAY_ENABLE_IN_TESTS`
- Completed cross-tool Gateway migration for core generation families:
  - `POST /api/practice/next-set` now uses `practice.nextset.v1`
  - `POST /api/tests/generate` now uses `tests.generate.v1`
  - Planner daily generation remains on `planner.daily.tasks.v1`
- Implemented concrete prompts for missing Gateway contracts:
  - `practice.nextset.v1`
  - `tests.generate.v1`

### Reliability/Format Notes

- Gateway now treats request-level provider failures differently from parse/schema failures:
  - extraction/repair only runs when output is malformed/invalid,
  - request failures use immediate bounded fallback path.
- Retry policy is intentionally conservative:
  - retries only for transient transport/server conditions,
  - no retry on provider rate-limit responses to avoid latency spikes.
- Existing controller fallback semantics are preserved and still user-safe.

### Observed Fallback Behavior

- Fallback activates with consistent diagnostics when:
  - contract execution fails,
  - provider is unavailable/rate-limited,
  - Gateway is disabled in tests.
- Fallback responses remain backward-compatible while now carrying richer standardized debug context from Gateway.

### Quality Verification

- Backend lint passes.
- Full backend test suite passes (`14/14`) after reliability tuning.

## March 23, 2026 - Phase 3 (Platformization + Future Tool Onboarding) Implemented

### What Was Completed

- Platformized the Gateway into a reusable protocol layer for future AI tools beyond planner/practice/tests.
- Added formal contract metadata and governance fields for each contract:
  - `family`
  - `description`
  - `lifecycle` (`active`/`deprecated` + migration metadata)
  - `routing` policy (`fast`, `balanced`, `quality`)
- Added policy-based model routing in Gateway execution:
  - Route policy is resolved per contract.
  - Per-policy model overrides are now configurable via env (`LLM_GATEWAY_ROUTE_*_MODEL`).
  - Gateway debug now includes resolved route policy and model for each execution.
- Added deprecated-contract guardrail in Gateway:
  - New env control: `LLM_GATEWAY_ALLOW_DEPRECATED_CONTRACTS`.
  - Gateway can block deprecated contracts with structured error payload when disabled.
- Added Gateway platform observability:
  - New `getGatewaySummary()` service API.
  - `/api/health` now includes Gateway configuration, routing map, and full contract catalog metadata.
- Added explicit onboarding documentation/playbook for future AI tools:
  - `backend/src/services/llmGateway/README.md`
  - Includes contract checklist, lifecycle/versioning rules, routing rules, integration pattern, and test strategy.

### Reliability/Format Notes

- Existing controller fallback semantics remain unchanged and backward-compatible.
- Contract registry now validates lifecycle and routing metadata at load time to prevent malformed contract definitions.
- Routing defaults remain safe:
  - no env override required,
  - existing `LLM_MODEL` remains fallback for all route tiers.

### Observed Platform Behavior

- Gateway now exposes richer deterministic runtime diagnostics without controller-specific logic changes.
- Health endpoint provides a single cross-feature source of truth for:
  - active contracts,
  - deprecation map,
  - routing policy model assignments,
  - reliability controls.

### Quality Verification

- Added new gateway registry unit coverage (`backend/tests/llmGateway.registry.test.js`).
- Extended B4 health API verification to assert Gateway diagnostics exposure.
- Backend lint and tests verified after platformization changes.
