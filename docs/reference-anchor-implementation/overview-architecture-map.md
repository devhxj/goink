# Reference Anchor Architecture Map

[Back to implementation index](../reference-anchor-implementation-plan.md) | [Back to overview](overview.md).

## Current Architecture Map

### Solution Layout

The current repository is a .NET 10 + Photino implementation:

```text
src/Novelist.Contracts/      JSON payload contracts shared by frontend bridge and services
src/Novelist.Core/           service interfaces, bridge dispatcher, bridge handler registration
src/Novelist.Infrastructure/ infrastructure implementations: file stores, SQLite, RAG, LLM, embeddings
src/Novelist.Agent/          Microsoft Agent Framework tool registry and chat tool executor
src/Novelist.App/            Photino desktop shell, local asset loading, manual service composition
frontend/src/                React/Vite UI with hand-owned bridge client
tests/Novelist.Tests/        unit and contract tests
tests/Novelist.IntegrationTests/ service, bridge, and host integration tests
```

Important dependency direction:

```text
Contracts <- Core <- Infrastructure
Contracts <- Core <- Agent
Contracts/Core/Infrastructure/Agent <- App
```

Reference-anchor code must follow this direction. Contracts cannot depend on Core, Infrastructure, or Agent.

### Runtime Composition

`src/Novelist.App/Desktop/PhotinoWindowFactory.cs` manually constructs services and registers bridge handlers. There is no central DI container for application services in desktop mode.

Current composition pattern:

```text
AppInitializationOptions
  -> FileSystemAppSettingsService
  -> FileSystemNovelService
  -> FileSystemChapterContentService
  -> FileSystemPreferenceService
  -> FileSystemWorldEntityService
  -> FileSystemPlanningService
  -> FileSystemEmbeddingSettingsService
  -> SqliteRagIndexService
  -> RagStoryMemorySearchService
  -> NovelistMafToolRegistry
  -> FileSystemChatSessionService
  -> BridgeDispatcher.Register...
```

The current composition instantiates the reference-anchor service in this factory and passes it to both:

- `ReferenceAnchorBridgeHandlers`
- `NovelistMafToolRegistry`

The anchored drafting service is instantiated after the reference-anchor service because it consumes:

- the immutable reference material bank;
- chapter content and planning services;
- world/timeline state used to prevent invented facts;
- the LLM configuration used to create structured blueprints and prose candidates.

It is passed to:

- `ReferenceAnchoredDraftBridgeHandlers`
- `NovelistMafToolRegistry`

### Desktop Runtime Boundary

Novelist is a local desktop application. The reference-anchor layer should run in-process through the existing Photino bridge and manually composed application services. Do not introduce ASP.NET Core as the default API host for this feature.

Runtime rules:

- frontend-to-backend calls continue to use the Photino bridge request envelope, not HTTP endpoints;
- reference-anchor services are constructed in `PhotinoWindowFactory.cs`, not through ASP.NET Core DI;
- SQLite, source import, blueprint generation, review, material binding, and draft audit all execute inside the desktop process;
- a local HTTP server may only be used for static asset serving if the existing desktop packaging/runtime path already requires it, not as the application API boundary;
- CORS, port allocation, localhost auth, and web-server lifecycle concerns must not become required for normal desktop use.

Rationale:

- the app already has a stable IPC boundary through `BridgeDispatcher`;
- keeping services in-process avoids extra ports, background server lifetime bugs, and local network attack surface;
- desktop debugging failures such as a missing `frontend/dist/index.html` should be treated as frontend build/dev workflow issues, not as a reason to add a web host;
- the public contract remains the bridge DTO layer, which is already covered by parity tests.

### Bridge Model

Frontend calls go through `frontend/src/lib/novelist/api.ts`, which wraps `BridgeDispatcher` requests as:

```json
{ "kind": "request", "id": "...", "method": "...", "payload": { "args": [] } }
```

Backend handlers are extension methods under `src/Novelist.Core/Bridge/`.

Existing tests enforce frontend/backend method parity:

- `tests/Novelist.Tests/Bridge/BridgeFrontendContractTests.cs`
- `tests/Novelist.Tests/Bridge/BridgeHandlerRegistrationTests.cs`

Adding methods requires updating all of:

- `BridgeCompatibilityAppMethods.MethodNames`
- `frontend/src/lib/novelist/api.ts`
- `frontend/src/lib/novelist/types.ts`
- bridge registration tests if expected counts or representative methods change

### Storage Model

The project uses two storage styles:

- JSON file stores for novels, chapters, world entities, planning, preferences, settings.
- SQLite + sqlite-vec for large semantic indexes in `SqliteRagIndexService`.

Reference-anchor storage is closer to RAG than to JSON stores because it must support:

- many source segments
- many derived materials
- vector search
- rebuild state
- provenance joins
- candidate/audit records

Therefore the implementation should use SQLite, not JSON.

### Existing RAG Reuse Points

Relevant files:

- `src/Novelist.Core/App/IRagIndexService.cs`
- `src/Novelist.Infrastructure/App/SqliteRagIndexService.cs`
- `src/Novelist.Infrastructure/App/SqliteVecProvisioning.cs`
- `src/Novelist.Infrastructure/App/RagStoryMemorySearchService.cs`
- `tests/Novelist.IntegrationTests/RagIndexServiceTests.cs`
- `tests/Novelist.IntegrationTests/StoryMemorySearchServiceTests.cs`

Reusable dependencies:

- `IEmbeddingConfigurationService`
- `IEmbeddingClient`
- `EmbeddingRequestOptions`
- `ISqliteVecTableProvisioner`
- `ISqliteVecQueryProvider`
- `SqliteVecProvisionRequest`
- `SqliteVecSearchRequest`

Do not reuse `RagChunkPayload` or `rag_chunks`; reference anchors need a separate schema and table namespace.

### Agent Tool Model

`NovelistMafToolRegistry` is partial:

- base registry in `NovelistMafToolRegistry.cs`
- structured writing tools in `NovelistMafStructuredTools.cs`
- web tools in `NovelistMafWebTools.cs`

The registry injects `NovelId` through `NovelistMafToolContext`. Tool schemas must not expose internal session fields unless intentionally part of the tool.

Reference tools live in a dedicated partial file:

```text
src/Novelist.Agent/NovelistMafReferenceTools.cs
```

The agent tools retrieve/adapt/audit materials and generate/review blueprint-gated draft candidates, but must not call `SaveContent`.

### Frontend Model

Workspace UI is organized through:

- `frontend/src/views/WorkspaceView.tsx`
- `frontend/src/components/shell/ActivityBar.tsx`
- `frontend/src/components/sidebar/SidePanel.tsx`
- feature folders under `frontend/src/components/`

Current reference-anchor frontend entry:

```text
frontend/src/components/reference-anchor/ReferenceAnchorView.tsx
frontend/src/components/reference-anchor/BlueprintDetail.tsx
frontend/src/components/reference-anchor/blueprintRevision.ts
frontend/src/components/reference-anchor/referenceAnchorStyles.ts
```

`ActivityBar` includes the `reference` activity, and `WorkspaceView` renders `ReferenceAnchorView` for the active novel. A small list/filter panel can be added to `SidePanel` later, but the current UI is a full main panel.
