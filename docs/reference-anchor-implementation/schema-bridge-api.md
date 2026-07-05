# Reference Anchor Bridge API Surface

[Back to implementation index](../reference-anchor-implementation-plan.md) | [Back to schema and integration index](schema-and-integration.md).

## Bridge API Surface

Current reference-anchor bridge methods:

```text
CreateReferenceAnchor
GetReferenceAnchors
DeleteReferenceAnchor
RebuildReferenceAnchor
GetReferenceAnchorBuildStatus
SearchReferenceMaterials
UpdateReferenceMaterialTags
AdaptReferenceMaterial
AuditReferenceReuse
RecordReferenceUserFeedback
GetReferenceUserFeedback
GenerateReferenceChapterBlueprint
GetReferenceChapterBlueprints
GetReferenceChapterBlueprint
ReviewReferenceChapterBlueprint
ReviseReferenceChapterBlueprint
ApproveReferenceChapterBlueprint
BindReferenceBlueprintMaterials
GenerateReferenceAnchoredDraft
AuditReferenceAnchoredDraft
```

`SearchReferenceMaterials` returns paged `ReferenceMaterialPayload` items. Search requests accept optional `narrative_duties` and `emotion_transitions` filters in addition to material type, function, emotion, POV, and technique filters. Search responses attach optional `score_components` to each returned material for ranking explainability; stored material rows do not persist those transient components. When the active Embeddings configuration matches a ready reference vector index, search adds transient `embedding` scores from sqlite-vec results and falls back to lexical/tag ranking if query embedding or vector search is unavailable. For anchors whose `license_status` is `unknown`, search/library preview payloads truncate exact source text by default; the full imported material text remains in SQLite and is still used for provenance, adaptation, material binding, and audit.

Reference material search remains separate from workspace-wide `SearchAll` in the current implementation. `SearchAll` continues to return workspace entities, chapter/content matches, and story-memory RAG hits; reference material results are exposed through `SearchReferenceMaterials` and the dedicated reference UI so license-sensitive previews, ranking explanations, and material filters stay under the reference-anchor policy. Any future global search integration should be a staged opt-in change with explicit result types and preview rules.

`ReferenceChapterBlueprintPayload` exposes `build_version`, `context_hash`, `source_plan_hash`, and `analysis_contract_hash` as the reproducibility surface for generated blueprints. Blueprint rows do not persist prompt text, prompt templates, or schema snapshots; `review_version` is stored on review and approval rows so gate decisions remain auditable without prompt-churn in the blueprint table.

Implementation files:

```text
src/Novelist.Contracts/App/ReferenceAnchorPayloads.cs
src/Novelist.Contracts/App/ReferenceAnchoredDraftPayloads.cs
src/Novelist.Core/App/IReferenceAnchorService.cs
src/Novelist.Core/App/IReferenceAnchoredDraftService.cs
src/Novelist.Core/Bridge/ReferenceAnchorBridgeHandlers.cs
src/Novelist.Core/Bridge/ReferenceAnchoredDraftBridgeHandlers.cs
src/Novelist.Core/Bridge/BridgeCompatibilityAppMethods.cs
```

Handler pattern should mirror `WorkspaceUtilityBridgeHandlers`:

- parse args array
- deserialize object payloads through `BridgeJson.SerializerOptions`
- validate primitive ids at boundary
- throw `BridgeValidationException` for shape issues
- let service-level `ArgumentException` map to validation errors
- return structured payloads
- `UpdateReferenceMaterialTags` updates the stored material row for user-confirmed function, emotion, POV, scene, or technique tags and marks it `user_verified`
