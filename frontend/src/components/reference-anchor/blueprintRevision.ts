import type { reference } from '@/lib/novelist/types'

export type BlueprintRevisionForm = {
  knownFacts: string
  forbiddenFacts: string
  narrativeFunction: string
  logicPremise: string
  conflictPressure: string
  causalityIn: string
  causalityOut: string
  transitionIn: string
  transitionOut: string
  povCharacter: string
  narrativeDistance: string
  viewpointAllowedKnowledge: string
  viewpointForbiddenKnowledge: string
  characterStatesBefore: string
  characterStatesAfter: string
  characterGoals: string
  characterMisbeliefs: string
  relationshipPressure: string
  emotionTrigger: string
  emotionBefore: string
  emotionAfter: string
  suppressedReaction: string
  externalEvidence: string
  narrationStrategy: string
  rhythmStrategy: string
  paragraphIntention: string
  executionMode: string
  antiScreenplayDuty: string
  sensoryAnchorTarget: string
  subtextPlan: string
  sourceBackedDetailTarget: string
  candidateRejectionRule: string
  sceneFacts: string
  beatForbiddenFacts: string
  requiredMaterialTypes: string
  maxRewriteLevel: string
  slotPlan: reference.SlotValue[]
  lockedPhrasePolicy: string
  noReuseReason: string
  proseDuties: string
  referenceQuery: string
  referenceMaterialTypes: string
  referenceEmotionTags: string
  referenceFunctionTags: string
  referencePovTags: string
  referenceTechniqueTags: string
  referenceMaxResults: string
  styleProfileIds: string
  styleDimensions: string
  imitationIntensity: '' | 'diagnostic_only' | 'loose' | 'moderate' | 'strong'
  minStyleFit: string
  allowedCloseness: string
  requiredEvidenceTypes: string
  forbiddenStyleRisks: string
}

export type BlueprintRevisionStringKey = {
  [Key in keyof BlueprintRevisionForm]: BlueprintRevisionForm[Key] extends string ? Key : never
}[keyof BlueprintRevisionForm]

export const EMPTY_REVISION_FORM: BlueprintRevisionForm = {
  knownFacts: '',
  forbiddenFacts: '',
  narrativeFunction: '',
  logicPremise: '',
  conflictPressure: '',
  causalityIn: '',
  causalityOut: '',
  transitionIn: '',
  transitionOut: '',
  povCharacter: '',
  narrativeDistance: '',
  viewpointAllowedKnowledge: '',
  viewpointForbiddenKnowledge: '',
  characterStatesBefore: '',
  characterStatesAfter: '',
  characterGoals: '',
  characterMisbeliefs: '',
  relationshipPressure: '',
  emotionTrigger: '',
  emotionBefore: '',
  emotionAfter: '',
  suppressedReaction: '',
  externalEvidence: '',
  narrationStrategy: '',
  rhythmStrategy: '',
  paragraphIntention: '',
  executionMode: '',
  antiScreenplayDuty: '',
  sensoryAnchorTarget: '',
  subtextPlan: '',
  sourceBackedDetailTarget: '',
  candidateRejectionRule: '',
  sceneFacts: '',
  beatForbiddenFacts: '',
  requiredMaterialTypes: '',
  maxRewriteLevel: '',
  slotPlan: [],
  lockedPhrasePolicy: '',
  noReuseReason: '',
  proseDuties: '',
  referenceQuery: '',
  referenceMaterialTypes: '',
  referenceEmotionTags: '',
  referenceFunctionTags: '',
  referencePovTags: '',
  referenceTechniqueTags: '',
  referenceMaxResults: '',
  styleProfileIds: '',
  styleDimensions: '',
  imitationIntensity: '',
  minStyleFit: '',
  allowedCloseness: '',
  requiredEvidenceTypes: '',
  forbiddenStyleRisks: '',
}

export function lines(value: string): string[] {
  return value
    .split(/\r?\n|;|；/)
    .map(item => item.trim())
    .filter(Boolean)
}

function multiline(values: string[] | undefined): string {
  return (values ?? []).join('\n')
}

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function sameNumberList(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function normalizeSlotPlan(slotPlan: reference.SlotValue[] | undefined): reference.SlotValue[] {
  return (slotPlan ?? [])
    .map(slot => ({
      slot_name: slot.slot_name.trim(),
      value: slot.value.trim(),
    }))
    .filter(slot => slot.slot_name.length > 0 || slot.value.length > 0)
}

function numericLines(value: string): number[] {
  const ids: number[] = []
  for (const item of value.split(/\r?\n|,|，|;|；|\s+/)) {
    const normalized = item.trim()
    if (!normalized) continue
    if (!/^\d+$/.test(normalized)) {
      throw new Error(`风格画像 ID 必须是正整数：${normalized}`)
    }

    const parsed = Number.parseInt(normalized, 10)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`风格画像 ID 必须是正整数：${normalized}`)
    }

    if (!ids.includes(parsed)) ids.push(parsed)
  }

  return ids
}

function normalizeStyleContract(
  contract: reference.BlueprintStyleContract | null | undefined,
): reference.BlueprintStyleContract | null {
  if (!contract) return null
  const style_profile_ids = (contract.style_profile_ids ?? [])
    .filter(id => Number.isSafeInteger(id) && id > 0)
    .filter((id, index, values) => values.indexOf(id) === index)
  const style_dimensions = (contract.style_dimensions ?? []).map(value => value.trim()).filter(Boolean)
  const required_evidence_types = (contract.required_evidence_types ?? []).map(value => value.trim()).filter(Boolean)
  const forbidden_style_risks = (contract.forbidden_style_risks ?? []).map(value => value.trim()).filter(Boolean)
  const imitation_intensity = contract.imitation_intensity?.trim() as reference.BlueprintStyleContract['imitation_intensity'] | ''
  const allowed_closeness = contract.allowed_closeness?.trim() ?? ''
  const min_style_fit = Number.isFinite(contract.min_style_fit)
    ? Math.max(0, Number(contract.min_style_fit.toFixed(4)))
    : 0

  if (
    style_profile_ids.length === 0 &&
    style_dimensions.length === 0 &&
    required_evidence_types.length === 0 &&
    forbidden_style_risks.length === 0 &&
    !imitation_intensity &&
    !allowed_closeness &&
    min_style_fit <= 0
  ) {
    return null
  }

  return {
    style_profile_ids,
    style_dimensions,
    imitation_intensity: (imitation_intensity || '') as reference.BlueprintStyleContract['imitation_intensity'],
    min_style_fit,
    allowed_closeness,
    required_evidence_types,
    forbidden_style_risks,
  }
}

function sameStyleContract(
  left: reference.BlueprintStyleContract | null,
  right: reference.BlueprintStyleContract | null,
): boolean {
  if (left === null || right === null) return left === right
  return sameNumberList(left.style_profile_ids, right.style_profile_ids) &&
    sameList(left.style_dimensions, right.style_dimensions) &&
    left.imitation_intensity === right.imitation_intensity &&
    left.min_style_fit === right.min_style_fit &&
    left.allowed_closeness === right.allowed_closeness &&
    sameList(left.required_evidence_types, right.required_evidence_types) &&
    sameList(left.forbidden_style_risks, right.forbidden_style_risks)
}

function sameSlotPlan(left: reference.SlotValue[], right: reference.SlotValue[]): boolean {
  return left.length === right.length &&
    left.every((slot, index) => slot.slot_name === right[index].slot_name && slot.value === right[index].value)
}

export function addStringChange(
  changes: reference.BlueprintRevisionChange[],
  fieldPath: string,
  nextValue: string,
  currentValue: string,
) {
  const trimmed = nextValue.trim()
  if (trimmed !== currentValue) {
    changes.push({ field_path: fieldPath, new_value: trimmed })
  }
}

export function addListChange(
  changes: reference.BlueprintRevisionChange[],
  fieldPath: string,
  nextValue: string,
  currentValue: string[],
) {
  const nextList = lines(nextValue)
  if (!sameList(nextList, currentValue)) {
    changes.push({ field_path: fieldPath, new_value: JSON.stringify(nextList) })
  }
}

export function addSlotPlanChange(
  changes: reference.BlueprintRevisionChange[],
  fieldPath: string,
  nextValue: reference.SlotValue[],
  currentValue: reference.SlotValue[],
) {
  const nextSlotPlan = normalizeSlotPlan(nextValue)
  const currentSlotPlan = normalizeSlotPlan(currentValue)
  if (!sameSlotPlan(nextSlotPlan, currentSlotPlan)) {
    changes.push({ field_path: fieldPath, new_value: JSON.stringify(nextSlotPlan) })
  }
}

export function styleContractFromForm(form: BlueprintRevisionForm): reference.BlueprintStyleContract | null {
  const hasAnyStyleField = [
    form.styleProfileIds,
    form.styleDimensions,
    form.imitationIntensity,
    form.minStyleFit,
    form.allowedCloseness,
    form.requiredEvidenceTypes,
    form.forbiddenStyleRisks,
  ].some(value => value.trim().length > 0)

  if (!hasAnyStyleField) return null

  let minStyleFit = 0
  const normalizedMinStyleFit = form.minStyleFit.trim()
  if (normalizedMinStyleFit) {
    minStyleFit = Number.parseFloat(normalizedMinStyleFit)
    if (!Number.isFinite(minStyleFit) || minStyleFit < 0 || minStyleFit > 10) {
      throw new Error('最低风格匹配必须是 0 到 10 之间的数字')
    }
  }

  return normalizeStyleContract({
    style_profile_ids: numericLines(form.styleProfileIds),
    style_dimensions: lines(form.styleDimensions),
    imitation_intensity: form.imitationIntensity as reference.BlueprintStyleContract['imitation_intensity'],
    min_style_fit: Math.round(minStyleFit * 10_000) / 10_000,
    allowed_closeness: form.allowedCloseness.trim(),
    required_evidence_types: lines(form.requiredEvidenceTypes),
    forbidden_style_risks: lines(form.forbiddenStyleRisks),
  })
}

export function addStyleContractChange(
  changes: reference.BlueprintRevisionChange[],
  fieldPath: string,
  nextValue: reference.BlueprintStyleContract | null,
  currentValue: reference.BlueprintStyleContract | null | undefined,
) {
  const nextContract = normalizeStyleContract(nextValue)
  const currentContract = normalizeStyleContract(currentValue)
  if (sameStyleContract(nextContract, currentContract)) return
  changes.push({
    field_path: fieldPath,
    new_value: nextContract ? JSON.stringify(nextContract) : '',
  })
}

export function formFromBlueprint(blueprint: reference.ChapterBlueprint | null): BlueprintRevisionForm {
  if (!blueprint) return EMPTY_REVISION_FORM
  const beat = blueprint.beats[0]
  return {
    knownFacts: multiline(blueprint.known_facts),
    forbiddenFacts: multiline(blueprint.forbidden_facts),
    narrativeFunction: beat?.narrative_function ?? '',
    logicPremise: beat?.logic_premise ?? '',
    conflictPressure: beat?.conflict_pressure ?? '',
    causalityIn: beat?.causality_in ?? '',
    causalityOut: beat?.causality_out ?? '',
    transitionIn: beat?.transition_in ?? '',
    transitionOut: beat?.transition_out ?? '',
    povCharacter: beat?.pov_character ?? '',
    narrativeDistance: beat?.narrative_distance ?? '',
    viewpointAllowedKnowledge: multiline(beat?.viewpoint_allowed_knowledge),
    viewpointForbiddenKnowledge: multiline(beat?.viewpoint_forbidden_knowledge),
    characterStatesBefore: multiline(beat?.character_states_before),
    characterStatesAfter: multiline(beat?.character_states_after),
    characterGoals: multiline(beat?.character_goals),
    characterMisbeliefs: multiline(beat?.character_misbeliefs),
    relationshipPressure: multiline(beat?.relationship_pressure),
    emotionTrigger: beat?.emotion_trigger ?? '',
    emotionBefore: beat?.emotion_before ?? '',
    emotionAfter: beat?.emotion_after ?? '',
    suppressedReaction: beat?.suppressed_reaction ?? '',
    externalEvidence: beat?.external_evidence ?? '',
    narrationStrategy: beat?.narration_strategy ?? '',
    rhythmStrategy: beat?.rhythm_strategy ?? '',
    paragraphIntention: beat?.paragraph_intention ?? '',
    executionMode: beat?.execution_mode ?? '',
    antiScreenplayDuty: beat?.anti_screenplay_duty ?? '',
    sensoryAnchorTarget: beat?.sensory_anchor_target ?? '',
    subtextPlan: beat?.subtext_plan ?? '',
    sourceBackedDetailTarget: beat?.source_backed_detail_target ?? '',
    candidateRejectionRule: beat?.candidate_rejection_rule ?? '',
    sceneFacts: multiline(beat?.scene_facts),
    beatForbiddenFacts: multiline(beat?.forbidden_facts),
    requiredMaterialTypes: multiline(beat?.required_material_types),
    maxRewriteLevel: beat?.max_rewrite_level ?? '',
    slotPlan: normalizeSlotPlan(beat?.slot_plan),
    lockedPhrasePolicy: beat?.locked_phrase_policy ?? '',
    noReuseReason: beat?.no_reuse_reason ?? '',
    proseDuties: multiline(beat?.prose_duties),
    referenceQuery: beat?.reference_query.query ?? '',
    referenceMaterialTypes: multiline(beat?.reference_query.material_types),
    referenceEmotionTags: multiline(beat?.reference_query.emotion_tags),
    referenceFunctionTags: multiline(beat?.reference_query.function_tags),
    referencePovTags: multiline(beat?.reference_query.pov_tags),
    referenceTechniqueTags: multiline(beat?.reference_query.technique_tags),
    referenceMaxResults: beat ? String(beat.reference_query.max_results) : '',
    styleProfileIds: (beat?.style_contract?.style_profile_ids ?? []).join('\n'),
    styleDimensions: multiline(beat?.style_contract?.style_dimensions),
    imitationIntensity: beat?.style_contract?.imitation_intensity ?? '',
    minStyleFit: beat?.style_contract ? String(beat.style_contract.min_style_fit) : '',
    allowedCloseness: beat?.style_contract?.allowed_closeness ?? '',
    requiredEvidenceTypes: multiline(beat?.style_contract?.required_evidence_types),
    forbiddenStyleRisks: multiline(beat?.style_contract?.forbidden_style_risks),
  }
}
