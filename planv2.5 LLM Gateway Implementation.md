# Modular Implementation Plan V2.5: Unified LLM Gateway Protocol

## Context: Why This Plan Exists

**What are we doing?** We are standardizing all LLM-powered features behind a single modular Gateway layer so Planner, Practice, Tests, Tutor, Video parsing, Summaries, and future AI tools all use one reliable contract.
**Why now?** Current flows work but are fragile when models return reasoning-heavy or non-conforming formats. A shared Gateway architecture prevents repeated parser fixes in each controller and enables consistent behavior across all tools.
**Outcome target:** Every tool can request AI output in its own schema, receive full model response for debugging, and reliably extract/validate machine-usable data with retries and fallback.

---

## General Instructions

- **CRITICAL: Strict Modularity**
  - **Backend:** Keep orchestration concerns isolated in a Gateway domain (contracts, extraction, retries, routing, validation).
  - **Controllers:** Keep feature controllers thin; they call the Gateway and only handle domain mapping + persistence.
  - **Frontend:** Keep AI debug rendering generic so any tool can surface structured failure info without custom UI logic.

- **Single Source of Truth for AI Contracts**
  - Define one contract per tool output format with explicit schema versioning.
  - Avoid embedding format logic directly in prompts inside controller files.

- **Progress Tracking**
  - Update `planv2 progress update.md` after each phase.
  - Note what changed in reliability, what formats were accepted, and any fallback behavior observed.

- **Reliability Over Cleverness**
  - Treat model output as untrusted input.
  - Validate every payload before business logic or DB writes.
  - Prefer safe fallback over partially malformed LLM output.

- **Backward Compatibility**
  - Existing endpoints should keep working while migrating to Gateway.
  - Roll out by feature family, not all at once.

---

## Design Principles for All Phases

- **Protocol-first architecture:** prompt design, output markers, schema validation, and retry strategy are a formal protocol, not ad-hoc parsing.
- **Tool-specific intent, generic transport:** each tool has unique expected payload, but extraction/repair/retry infrastructure is shared.
- **Observable by default:** always retain enough debug detail to explain why a generation failed.
- **Version everything:** contract shape and extractor behavior should be versioned to avoid breaking future iterations.

---

## Gateway Output Format Strategy (High-Level)

Use a universal machine-output envelope that each tool can fill with its own payload.

- The model can include reasoning or prose if needed.
- The response must end with a deterministic machine block.
- Gateway extracts only the machine block and validates it.

Recommended envelope shape:

- `outputType` (tool contract name)
- `schemaVersion` (contract version)
- `payload` (tool-specific data)
- `meta` (optional model notes, optional confidence, optional diagnostics)

This keeps summarization, generation, analysis, and recommendation tools compatible with one extraction path.

---

## Phase 1: Foundation and Protocol Baseline (One Chat Session Scope)

### Objective

Create the minimum shared LLM Gateway foundation so current tools can route through one orchestration path without major behavior changes.

### Rough Guidelines

- Establish a dedicated Gateway module structure in backend utilities/services.
- Introduce a contract registry for tool definitions (planner, practice, tests as initial adopters).
- Define a universal output envelope and a first-pass extractor strategy.
- Centralize schema validation and standardized error objects.
- Add normalized debug payload fields so frontend can display consistent diagnostics.

### Expected Deliverables

- Basic Gateway entrypoint used by at least one existing AI flow.
- Contract objects for initial tools with version tags.
- Unified response object shape from Gateway to controllers.
- Basic docs describing how new tools register contracts.

### Guardrails

- Do not over-optimize model routing yet.
- Avoid broad controller rewrites; keep integration minimal.

### Completion Signal

At least one tool reliably executes through Gateway with no regression in endpoint behavior and clearer debug data than before.

---

## Phase 2: Reliability Layer and Cross-Tool Adoption (One Chat Session Scope)

### Objective

Make the Gateway resilient under real provider variability and migrate core generation tools to this shared path.

### Rough Guidelines

- Add staged extraction and repair flow (primary parse, envelope extraction, repair attempt, fallback path).
- Implement bounded retry policy with clear stop conditions.
- Expand migration to planner, practice, and test generation tools.
- Ensure contracts enforce key constraints while allowing safe normalization/coercion.
- Standardize logging and metrics around failures, retries, and fallbacks.

### Expected Deliverables

- Multi-attempt orchestration with deterministic outcome states.
- Consistent fallback semantics across migrated tools.
- Shared telemetry fields for success/failure diagnosis.
- Cleaner controller logic focused on domain concerns.

### Guardrails

- Keep retry loops bounded and transparent.
- Do not silently accept invalid payloads without contract validation.

### Completion Signal

Core AI tools run through the same Gateway and show improved reliability under noisy model outputs.

---

## Phase 3: Platformization and Future Tool Onboarding (One Chat Session Scope)

### Objective

Turn the Gateway into a reusable platform for all future AI capabilities, not just current generation endpoints.

### Rough Guidelines

- Finalize onboarding workflow for any new AI tool (summaries, tutor answer synthesis, transcript analysis, etc.).
- Introduce model/provider routing policies by tool category (quality, latency, cost priorities).
- Add contract lifecycle governance: versioning strategy, deprecation path, migration notes.
- Improve frontend debug UX with consistent cross-feature diagnostics.
- Add test coverage strategy for protocol compliance and regression prevention.

### Expected Deliverables

- Documented playbook for adding a new tool contract quickly.
- Stable, reusable protocol stack across the product.
- Operational visibility into reliability and fallback rates.
- Confidence that future AI features can be shipped without repeating parser/format churn.

### Guardrails

- Avoid coupling tool business rules into generic Gateway internals.
- Keep contract definitions explicit and discoverable.

### Completion Signal

The system behaves as an AI platform: new LLM-powered tools can be onboarded with low friction and predictable reliability.

---

## Cross-Phase Quality Checklist

- Output extraction is deterministic and not dependent on prompt luck alone.
- Each tool contract is versioned and validated.
- Debug output always includes enough context to troubleshoot.
- Fallback behavior is intentional and user-safe.
- Existing APIs remain stable during migration.

---

## Risk Areas to Watch (High-Level)

- Model/provider differences in structured output support.
- Token budget pressure causing machine-output truncation.
- Overly strict schemas that reject usable payloads.
- Overly loose schemas that accept unsafe payloads.
- Silent drift between prompt instructions and contract expectations.

---

## Rollout Recommendation

- Roll out contract-by-contract, not endpoint-by-endpoint all at once.
- Keep a short feedback loop: observe real failures, tune extractor/repair logic, then expand.
- Treat this as infrastructure investment that unlocks all future AI epics in `planV2.md`.
