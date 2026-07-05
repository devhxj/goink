# Reference Anchor Tasks: Phases 0-4

[Back to implementation index](../reference-anchor-implementation-plan.md) | [Back to tasks index](tasks-and-verification.md).

## Phase 0: Contract and Test Fixture Foundation

**Description:** Add contracts, enum constants, benchmark fixture format, and tests for payload serialization.

**Acceptance criteria:**

- [x] `ReferenceAnchorPayloads.cs` compiles.
- [x] `ReferenceAnchoredDraftPayloads.cs` compiles.
- [x] `IReferenceAnchorService.cs` compiles.
- [x] `IReferenceAnchoredDraftService.cs` compiles.
- [x] JSON property names match frontend snake_case.
- [x] Rewrite level constants, build states, blueprint states, beat types, and review statuses are documented in code or tests.
- [x] Blueprint contracts can represent logic, emotion, narration, character, reference-use, transition, and execution tracks.
- [x] Revision contracts can express field-level blueprint edits and approval invalidation reasons.
- [x] Review contracts expose separate logic, narration, execution, character-state, transition, material-fit, and novelistic-narration errors.

**Verification:**

- [x] `dotnet test tests/Novelist.Tests/Novelist.Tests.csproj --filter Bridge`
- [x] `dotnet test tests/Novelist.Tests/Novelist.Tests.csproj --filter ReferenceAnchorContractTests`

**Files likely touched:**

- `src/Novelist.Contracts/App/ReferenceAnchorPayloads.cs`
- `src/Novelist.Contracts/App/ReferenceAnchoredDraftPayloads.cs`
- `src/Novelist.Core/App/IReferenceAnchorService.cs`
- `src/Novelist.Core/App/IReferenceAnchoredDraftService.cs`
- `tests/Novelist.Tests/`

## Phase 1: SQLite Store and Source Import

**Description:** Implement anchor creation, source file validation, immutable source segmentation, and build status persistence.

**Acceptance criteria:**

- [x] Create anchor validates novel id and source file.
- [x] TXT/MD source is split into chapter/paragraph/sentence segments.
- [x] Segment ids and hashes are stable across rebuilds.
- [x] Rebuild is idempotent for unchanged source.
- [x] Failed import records a failed status with a redacted error.

**Verification:**

- [x] `dotnet test tests/Novelist.IntegrationTests/Novelist.IntegrationTests.csproj --filter ReferenceAnchor`

**Files likely touched:**

- `src/Novelist.Infrastructure/App/SqliteReferenceAnchorService.cs`
- `tests/Novelist.IntegrationTests/ReferenceAnchorServiceTests.cs`

## Phase 2: Material Extraction and Slots

**Description:** Build sentence and passage material banks with deterministic tags, conservative slots, and blueprint-usable narrative metadata.

**Acceptance criteria:**

- [x] Material rows point to valid source segments.
- [x] Function/material tags exist with confidence fields.
- [x] Emotion, POV, and technique material tags plus blueprint prose-duty/external-evidence duties exist for blueprint matching.
- [x] Slots are stored separately and tied to material ids.
- [x] Locked phrases survive L1 adaptation.
- [x] User corrections can be represented even if UI arrives later.

Current design note: narrative duty and external evidence are beat-level blueprint duties (`prose_duties` / `external_evidence`) matched against material function and technique tags during binding, not standalone `reference_materials` columns.

**Verification:**

- [x] extractor integration tests for Chinese punctuation/dialogue/paragraph cases
- [x] extractor integration tests for emotion, narrative-duty-adjacent function tags, and POV tag cases
- [x] integration test verifies material counts and provenance joins

**Files likely touched:**

- `SqliteReferenceAnchorService.cs`
- internal extractor classes in `src/Novelist.Infrastructure/App/`
- `tests/Novelist.Tests/` extractor tests

## Phase 3: Hybrid Search and Blueprint Material Matching

**Description:** Add paginated material search with tag filters, optional embeddings, and score components usable by blueprint beat binding.

**Acceptance criteria:**

- [x] Search works without embedding configuration using lexical/tag ranking.
- [x] Search records score components.
- [x] If embedding config exists, vectors are provisioned in reference-specific vec tables.
- [x] Missing sqlite-vec returns a recoverable status.
- [x] Results are bounded and paginated.
- [x] Search can filter by narrative duty, emotion transition, POV, technique, and material type.
- [x] Beat-level material matching returns ranked candidates without selecting them automatically unless requested.
- [x] Ready reference vector indexes contribute transient `embedding` score components to material search and blueprint binding, while embedding/vector failures fall back to lexical/tag ranking.

**Verification:**

- [x] lexical ranking and pagination tests without embedding configuration
- [x] search score-component contract and integration tests
- [x] fake embedding client test
- [x] fake sqlite-vec provisioner test
- [x] complete search filter tests for narrative duty and emotion transition coverage
- [x] search embedding-score integration tests and binding score propagation tests
- [x] beat-to-material ranking tests

**Files likely touched:**

- `SqliteReferenceAnchorService.cs`
- possibly shared sqlite-vec table-name helper
- `ReferenceAnchorServiceTests.cs`

## Phase 4: Chapter Narrative Blueprint Analysis and Review Gate

**Description:** Implement structured chapter blueprint generation with logic, emotion, narration, character, reference-use, transition, and execution tracks; deterministic review; explicit revision; approval invalidation; and material binding. This phase must land before any chapter drafting tool.

This is the implementation phase for the "write the detailed chapter scenario first, review it, then draft prose" workflow. It must be delivered as vertical slices that each leave the app in a testable state:

```text
Slice 4A: deterministic blueprint contract
  contract + SQLite persistence + bridge serialization + contract tests

Slice 4B: review gate
  deterministic hard gates + failed/pass review records + approval disabled before pass + field-level defects

Slice 4C: explicit approval gate
  passing review hash/version verification + approved execution contract + draft generation still disabled before material binding

Slice 4D: revision and invalidation
  field-level changes + review history + approval/material-link invalidation

Slice 4E: material binding
  beat-level ranked links + score components + stale-link rejection

Slice 4F: MAF/tool fixture
  full agent workflow through generate/review/approve/bind without writing chapter content
```

Recommended implementation slices:

1. Persist full blueprint records and beats with `context_hash`, `source_plan_hash`, `analysis_contract_hash`, `review_version`, and generator version.
2. Build a deterministic context pack from chapter plan, previous state, world entities, known facts, forbidden facts, and selected anchors.
3. [x] Extract a `ReferenceChapterBlueprintNormalizer` so hashes and reviewed field sets are stable and reusable in service, tests, and future UI editing.
4. Add a constrained blueprint generator that returns structured payloads only.
5. [x] Extract a `ReferenceChapterBlueprintReviewer` and add the current deterministic review rules for logic, emotion, narration, character, reference-use, transition, execution, causality, POV, forbidden facts, prose duties, anti-screenplay duties, and final hook dependency.
6. Add an explicit approval gate that freezes the latest passing `analysis_contract_hash` and `review_version`.
7. Add explicit revision and invalidation semantics for reviewed fields, approval rows, and material links.
8. Add material binding only after approval, with score components and stale-link handling.
9. Add fixture files for bad blueprints so fake emotion, hard transition, POV leak, missing prose duty, action/dialogue-only beat, and material mismatch never regress.

**Acceptance criteria:**

- [x] Blueprint generation targets `novel_id` and `chapter_number`.
- [x] Blueprint generation builds and hashes a normalized context pack before persistence.
- [x] Blueprint stores chapter function, causality chain, emotion trajectory, POV constraints, scene facts, forbidden facts, prose duties, and beat-level reference queries.
- [x] Blueprint stores complete logic, emotion, narration, character, reference-use, transition, and execution tracks.
- [x] Each beat stores transition-in/out, character goal/knowledge/misbelief/state delta, suppressed reaction, external evidence, narration strategy, rhythm strategy, paragraph intention, execution mode, anti-screenplay duty, source-backed detail target, slot plan, locked phrase policy, and no-reuse reason.
- [x] Blueprint generator cannot persist final prose paragraphs as a substitute for beat duties.
- [x] Normalizer computes the same `analysis_contract_hash` for semantically identical payloads with equivalent whitespace/array defaults.
- [x] Reviewer is deterministic and idempotent for unchanged `blueprint_id`, `context_hash`, `source_plan_hash`, `analysis_contract_hash`, and `review_version`.
- [x] Review fails blueprints with missing analysis tracks, missing execution track, missing causality, unsupported emotional shifts, missing external evidence, POV knowledge leaks, missing transition reasons, forbidden facts, material mismatch, action/dialogue-only beats, or screenplay drift risks.
- [x] Review result separates logic, causality, emotion, narration, execution, character-state, POV, continuity, transition, forbidden-fact, reference-binding, material-fit, screenplay-drift, novelistic-narration, and AI-prose findings.
- [x] Review defects include field path or beat id, severity, reason, and required fix in a form the UI can render without parsing prose.
- [x] Review stores `context_hash`, `source_plan_hash`, `analysis_contract_hash`, and `review_version` so approvals can be invalidated deterministically.
- [x] Approved status requires a passing review.
- [x] Approval records freeze `review_id`, `context_hash`, `source_plan_hash`, `analysis_contract_hash`, `review_version`, approver origin, and approval time.
- [x] A blueprint with `review_passed` but no explicit approval cannot bind materials or generate draft candidates.
- [x] A blueprint with approval but no current material links cannot generate draft candidates unless every requested beat has an approved `no_reuse_reason`.
- [x] Editing approved analysis tracks, execution contract, known/forbidden facts, and beat reference query invalidates approval and requires re-review.
- [x] Editing approved beat POV, character-state, emotion-mechanic, scene-fact, prose-duty, and material-query tag fields invalidates approval and records revision paths.
- [x] Editing any approved blueprint beat, analysis track, execution track, known/forbidden fact, or reference query invalidates approval and requires re-review.
- [x] Blueprint revision records field paths, previous/new value hashes, origin, invalidated review id, and reason.
- [x] Changing the source chapter plan hash marks existing blueprints stale.
- [x] Material binding links candidate reference materials to beats with max rewrite levels.
- [x] Material binding records and exposes score components: lexical, tag, function, emotion, POV, prose-duty, and user-verified boosts.
- [x] Material binding rejects semantic-only matches when function, POV, emotion, or prose-duty fit is absent.
- [x] Material binding stores the `analysis_contract_hash` it was created against and is stale when that hash changes.
- [x] Stale material links are not used for draft generation.

**Verification:**

- [x] unit tests for blueprint payload serialization
- [x] unit tests for context-pack hashing and stale detection
- [x] component tests for blueprint normalization and analysis-contract hashing
- [x] component tests for deterministic blueprint review rules, including anti-screenplay and execution-track defects
- [x] fixture tests for fake emotion, hard transition, POV leak, missing prose duty, action/dialogue-only beat, and material mismatch
- [x] unit tests for explicit approval hash/version matching
- [x] integration tests for approval invalidation after beat, analysis, execution, known-fact, and reference-query edits
- [x] integration test for generate/review/approve/stale lifecycle
- [x] integration test for beat material binding and provenance joins
- [x] integration test proving review-passed-without-approval cannot bind or draft
- [x] bridge test for `BindReferenceBlueprintMaterials` after approval and for failure before approval

**Files likely touched:**

- `src/Novelist.Contracts/App/ReferenceAnchoredDraftPayloads.cs`
- `src/Novelist.Core/App/IReferenceAnchoredDraftService.cs`
- `src/Novelist.Infrastructure/App/SqliteReferenceAnchoredDraftService.cs`
- `tests/Novelist.Tests/ReferenceChapterBlueprint*Tests.cs`
- `tests/Novelist.IntegrationTests/ReferenceAnchoredDraftServiceTests.cs`
