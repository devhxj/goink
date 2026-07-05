# Blueprint Quality Decisions

[Back to implementation index](../reference-anchor-implementation-plan.md) | [Back to decisions index](decisions.md).

## Blueprint Quality Gates

A blueprint can proceed to material binding only when it passes deterministic review. A blueprint can proceed to draft generation only when it has also been explicitly approved.

Hard fail conditions:

- any of the logic, emotion, narration, character, reference, transition, or execution tracks is missing or empty;
- any beat has no narrative function;
- a beat changes character emotion without a trigger;
- a beat declares emotion but no external evidence or narrative expression plan;
- a scene transition lacks a causal or emotional reason;
- a POV character knows information outside `viewpoint_allowed_knowledge`;
- a scene fact includes a forbidden fact or a fact not present in known facts/declared slot values;
- a prose-generation beat lacks prose duties or is dialogue/action-only without an explicit short-exchange flag;
- a beat has paragraph intention but no declared novelistic execution mode, such as dwell, compress, withhold, reveal, contrast, linger, or turn;
- a dialogue-heavy beat has no subtext, withheld reaction, interiority, environmental pressure, or rhythm duty;
- a reference-bound beat has no material type, function tag, rewrite budget, or intended use;
- selected material matches only semantic similarity and has no function/emotion/POV/prose-duty fit;
- the final hook depends on a new fact that was not set up earlier in the blueprint.

Soft warnings:

- too many beats use the same narrative duty;
- every beat asks for the same reference material type;
- emotion transitions are all direct and immediate, with no suppression/delay/misdirection;
- narration distance is unchanged across the entire chapter when the chapter plan implies pressure changes;
- paragraph intentions repeat mechanically across adjacent beats;
- too many beats choose `no_reuse_reason`, reducing the value of the anchor layer;
- max rewrite level exceeds the project default.

These gates make "先写细章剧本，评审后再写正文" technically useful: the blueprint becomes a validation surface for logic, emotion, perspective, narration, and reference-use constraints before prose fluency can hide defects.

Failure-mode coverage matrix:

| Failure mode | Detection layer | Required response |
|---|---|---|
| fake emotion, direct emotion jumps | blueprint review: emotion track and beat fields | fail review until trigger, suppressed reaction, external evidence, and after-state are explicit |
| screenplay-like action/dialogue blocks | blueprint review: narration and execution tracks | fail review unless prose duties and anti-screenplay duties are present |
| hard scene transitions | blueprint review: transition plan | fail review until causal, emotional, informational, or viewpoint pressure is present |
| POV leakage | blueprint review and draft audit | fail review/audit when beat facts exceed viewpoint knowledge boundary |
| invented world facts | blueprint review and draft audit | fail review/audit unless fact appears in known facts, approved slot values, or source-backed detail |
| decorative reference retrieval | material binding | reject semantic-only matches without function, emotion, POV, or prose-duty fit |
| over-rewritten imitation | adaptation audit | classify as L2/L3/L4 and block above allowed rewrite level |
| prose hides weak structure | workflow preflight | block draft generation until review has passed and approval matches current hashes |
| stale approved blueprint | approval preflight | invalidate approval and material links after source plan or reviewed fields change |
| model tries to write full chapter directly | service/tool boundary | reject unbounded draft calls; only beat-scoped candidates are allowed |

This matrix is deliberately conservative. It does not claim the system can make the model truly understand emotion. Instead, it reduces the number of places where fake understanding can pass unnoticed: emotion must be represented as evidence-bearing state transitions, narration must be represented as prose duties, and every candidate must trace back to approved fields and source material.

## Blueprint Analysis Contract

The blueprint is the technical version of "write a detailed chapter script first, then review it". It is not prose and not a loose outline. It is a machine-checkable analysis contract that must be complete before material binding or draft generation.

The contract has five required analysis tracks, one transition plan, and one required execution track. The five analysis tracks are logic, emotion, narration, character, and reference use:

```text
logic_track
  - premise inherited from previous state
  - beat-level cause/effect edges
  - conflict escalation
  - scene transition reason
  - payoff/setup relationship
  - final hook dependency

emotion_track
  - character emotion before/after each beat
  - trigger for every emotional change
  - suppressed/internal reaction
  - external evidence visible in prose
  - delayed release or misdirection, if any

narration_track
  - POV owner and knowledge boundary
  - narrative distance per beat
  - scene vs summary ratio
  - interiority/sensory/environment/subtext duties
  - rhythm target and sentence-density target
  - anti-screenplay duty for dialogue/action beats

character_track
  - goal, pressure, knowledge, misbelief, leverage, restraint
  - role-state before/after
  - relationship pressure before/after
  - what the character cannot know yet

reference_track
  - reference material query for each beat
  - expected material type and function tag
  - allowed rewrite level
  - required slot substitutions
  - locked phrase policy
  - no-reuse reason when a beat should not borrow material

transition_plan
  - scene boundary reason
  - emotional carry-over
  - information carry-over
  - paragraph bridge duty
  - transition risk

execution_track
  - paragraph intention per beat
  - novelistic execution mode: dwell, compress, withhold, reveal, contrast, linger, turn
  - anti-screenplay duty for action/dialogue-heavy beats
  - required non-action material: interiority, sensory anchor, environmental pressure, subtext, delayed reaction, or narrative transition
  - source-backed detail target
  - candidate rejection rule for the beat
```

This contract exists because the system should not assume the model "understands emotion". Instead, it requires the model to expose emotional mechanics as inspectable data: trigger, internal state, outward evidence, narrative expression, and state change. If any part is missing, the prose generator is not allowed to compensate creatively.

The execution track is intentionally separate from the reference track. A reference sentence may be a good lexical match but still be wrong for the paragraph's job. The generator must know whether the beat needs to slow down, imply, compress, linger on a sensory detail, or turn the emotional state before it can select material safely.

Current contract status:

- The payload carries `logic_analysis`, `emotion_analysis`, `narration_analysis`, `character_analysis`, `reference_analysis`, `transition_plan`, and `execution_contract`.
- `reference_analysis` must remain a first-class track. Beat-level `reference_query` fields are still required, but they are execution details under the chapter-level reference-use analysis, not a substitute for it.
- Review must treat missing chapter-level reference analysis, missing beat-level reference queries, missing material types, missing intended use, missing rewrite levels, and missing no-reuse reasons as reference-track defects.

Blueprint revision should be explicit:

- review failure creates `review_failed`, not a silently patched blueprint;
- revision creates a new blueprint revision or updates the draft while preserving latest review history;
- approval only applies to the exact `context_hash` and `source_plan_hash`;
- editing any beat after approval invalidates approval and requires re-review;
- material binding may run only after review passes, and draft generation may run only after explicit approval.

## Blueprint Payload Shape

The payload should be structured, not free-form prose:

```text
ReferenceChapterBlueprintPayload
- blueprint_id
- novel_id
- chapter_number
- title
- status
- source_plan_scope
- source_plan_hash
- context_hash
- analysis_contract_hash
- blueprint_version
- build_version
- parent_blueprint_id
- primary_anchor_id
- chapter_function
- logic_analysis
- emotion_analysis
- narration_analysis
- character_analysis
- reference_analysis
- transition_plan
- previous_state
- final_state
- final_hook
- global_pov
- global_narrative_distance
- known_facts
- forbidden_facts
- risk_flags
- execution_contract
- beats
- latest_review
- created_at
- updated_at
```

Each beat must be structured:

```text
ReferenceChapterBlueprintBeatPayload
- beat_id
- beat_index
- scene_index
- beat_type
- narrative_function
- logic_premise
- conflict_pressure
- causality_in
- causality_out
- transition_in
- transition_out
- pov_character
- narrative_distance
- viewpoint_allowed_knowledge
- viewpoint_forbidden_knowledge
- character_states_before
- character_states_after
- character_goals
- character_misbeliefs
- relationship_pressure
- emotion_trigger
- emotion_before
- emotion_after
- suppressed_reaction
- external_evidence
- narration_strategy
- rhythm_strategy
- paragraph_intention
- execution_mode
- anti_screenplay_duty
- sensory_anchor_target
- subtext_plan
- source_backed_detail_target
- candidate_rejection_rule
- scene_facts
- forbidden_facts
- reference_query
- required_material_types
- max_rewrite_level
- slot_plan
- locked_phrase_policy
- no_reuse_reason
- prose_duties
- risk_flags
```

The `prose_duties` field is important. It prevents screenplay drift by forcing each beat to declare whether the final prose needs interiority, sensory detail, transition, reaction, subtext, environmental pressure, or information reveal.

The analysis fields can start as JSON-encoded arrays/objects in SQLite and strongly typed contract records later. The important rule is that the bridge payload remains structured enough for deterministic review and UI inspection; do not collapse analysis into a single Markdown blob.

## Blueprint Review Strategy

Blueprint review is a gate, not a comment generator. It must return pass/fail plus concrete defects:

```text
ReferenceChapterBlueprintReviewPayload
- review_id
- blueprint_id
- status
- score
- logic_errors
- causality_errors
- emotion_errors
- narration_errors
- execution_errors
- character_state_errors
- pov_errors
- continuity_errors
- transition_errors
- forbidden_fact_errors
- reference_binding_errors
- material_fit_errors
- screenplay_drift_risks
- ai_prose_risks
- novelistic_narration_errors
- required_fixes
- defects (category, field_path, beat_id, severity, reason, required_fix)
- reviewed_at
```

Initial deterministic checks:

- every blueprint has logic, emotion, narration, character, reference, transition, and execution tracks;
- every beat except the first has `causality_in`;
- every beat except the last has `causality_out`;
- every scene transition has a reason rather than a location/time jump only;
- every emotional change has a trigger and external evidence;
- every emotional change has a believable before/after state and does not jump directly to a convenient plot emotion;
- every major character in a beat has goal, pressure, knowledge boundary, and role-state delta;
- POV knowledge does not include facts outside the current viewpoint;
- narration duties include at least one non-action/non-dialogue duty for ordinary prose beats;
- execution mode exists for every prose beat and is compatible with the beat's narrative function;
- dialogue/action-heavy beats include non-script narrative work: subtext, interiority, sensory anchor, delayed reaction, environment pressure, or transition pressure;
- forbidden facts do not appear in beat facts or final hook;
- every prose-generation beat has a reference query and max rewrite level;
- every reference query includes material type and intended narrative function;
- every selected material must match the beat's function, POV, emotion, or prose duty; semantic similarity alone is insufficient;
- no beat is dialogue/action-only unless intentionally marked as a short exchange;
- final hook follows from earlier beat state instead of appearing as a new fact.

Review result semantics:

- hard-gate failures make `status = failed` regardless of numeric score;
- numeric score is diagnostic only and must not override hard gates;
- optional LLM critique may add findings but cannot mark a failed deterministic review as passed;
- review must not silently revise the blueprint;
- draft generation requires `approved`, not merely `review_passed`.

LLM review can be added as a second pass, but deterministic review must decide whether drafting is allowed.

## Blueprint Revision and Approval Lifecycle

Blueprint revision must be explicit because silent self-repair hides the exact failure that the blueprint layer is meant to expose.

Lifecycle rules:

- `draft` blueprints can be edited or regenerated.
- `review_failed` blueprints keep the failed review and required fixes.
- A revision either creates a new row with `parent_blueprint_id` or updates the draft while preserving review history; pick one strategy before adding UI editing.
- `review_passed` means deterministic review passed, but draft generation is still disabled.
- `approved` requires a passing review and an explicit approve operation.
- Any edit to beats, analysis tracks, known facts, forbidden facts, reference query plan, rewrite levels, or source plan hash invalidates approval.
- Any material binding created before a blueprint edit must be marked stale or recomputed.
- `used_for_candidate` records that at least one draft candidate was generated from the exact approved version.
- `superseded` preserves older blueprints read-only for traceability.

Revision payloads should include:

- changed field path;
- previous value hash;
- new value hash;
- user/agent origin;
- revision reason;
- resulting review requirement.

This prevents a model from fixing a failed blueprint by rewriting the whole artifact without preserving what changed. It also gives the UI enough information to explain why draft generation became disabled.
