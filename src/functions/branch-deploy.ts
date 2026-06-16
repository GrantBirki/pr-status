export const ACTION_MODES = ['status', 'branch-deploy'] as const
export const BRANCH_DEPLOY_TRANSITIONS = [
  'reset',
  'review',
  'noop',
  'deploy',
  'clear'
] as const
export const OPERATION_RESULTS = [
  'success',
  'failure',
  'cancelled',
  'skipped'
] as const

export type ActionMode = (typeof ACTION_MODES)[number]
export type BranchDeployTransition =
  (typeof BRANCH_DEPLOY_TRANSITIONS)[number]
export type OperationResult = (typeof OPERATION_RESULTS)[number]
export type BranchDeployState =
  | 'cleared'
  | 'noop'
  | 'review'
  | 'deploy'
  | 'merge'

export interface BranchDeployLabels {
  noop: string
  review: string
  deploy: string
  merge: string
}

export interface BranchDeployConfiguration {
  transition: BranchDeployTransition
  expectedHeadSha: string
  operationResult: OperationResult | null
  labels: BranchDeployLabels
  clearOnDraft: boolean
  demoteMergeOnReviewFailure: boolean
  dryRun: boolean
}

export interface BranchDeployPullRequest {
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  headSha: string
  isDraft: boolean
}

export interface BranchDeployDecision {
  state: BranchDeployState
  headMatches: boolean | null
  labelsToAdd: string[]
  labelsToRemove: string[]
}

export interface BranchDeployData {
  configuration: BranchDeployConfiguration
  pullRequest: BranchDeployPullRequest
  evaluationPassed: boolean
  currentLabels: readonly string[]
}

export function parseActionMode(value: string): ActionMode {
  const normalized = value === '' ? 'status' : value
  if (ACTION_MODES.includes(normalized as ActionMode)) {
    return normalized as ActionMode
  }
  throw new Error("mode must be exactly 'status' or 'branch-deploy'")
}

export function parseBranchDeployTransition(
  value: string
): BranchDeployTransition {
  if (
    BRANCH_DEPLOY_TRANSITIONS.includes(value as BranchDeployTransition)
  ) {
    return value as BranchDeployTransition
  }
  throw new Error(
    "transition must be exactly 'reset', 'review', 'noop', 'deploy', or 'clear'"
  )
}

export function parseOperationResult(
  value: string,
  transition: BranchDeployTransition
): OperationResult | null {
  const command = transition === 'noop' || transition === 'deploy'
  if (!command && value === '') {
    return null
  }
  if (OPERATION_RESULTS.includes(value as OperationResult)) {
    return value as OperationResult
  }
  throw new Error(
    command
      ? 'operation_result is required for noop and deploy transitions'
      : "operation_result must be exactly 'success', 'failure', 'cancelled', or 'skipped'"
  )
}

export function parseBooleanInput(name: string, value: string): boolean {
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  throw new Error(`${name} must be exactly 'true' or 'false'`)
}

export function validateBranchDeployConfiguration(
  configuration: BranchDeployConfiguration
): void {
  const labels = Object.values(configuration.labels)
  if (labels.some(label => label.trim() === '')) {
    throw new Error('branch-deploy labels must not be empty')
  }
  if (new Set(labels.map(labelKey)).size !== labels.length) {
    throw new Error('branch-deploy labels must be distinct')
  }

  const headBoundTransition =
    configuration.transition === 'reset' ||
    configuration.transition === 'noop' ||
    configuration.transition === 'deploy'
  if (headBoundTransition && configuration.expectedHeadSha === '') {
    throw new Error(
      'expected_head_sha is required for reset, noop, and deploy transitions'
    )
  }
}

export function determineBranchDeployState(
  data: BranchDeployData
): BranchDeployDecision {
  const {configuration, pullRequest, evaluationPassed, currentLabels} = data
  const currentState = currentBranchDeployState(
    currentLabels,
    configuration.labels
  )
  let headMatches: boolean | null = null
  let state: BranchDeployState

  if (
    pullRequest.state === 'CLOSED' ||
    pullRequest.state === 'MERGED' ||
    (pullRequest.isDraft && configuration.clearOnDraft)
  ) {
    state = 'cleared'
  } else if (configuration.transition === 'reset') {
    headMatches = pullRequest.headSha === configuration.expectedHeadSha
    state = headMatches ? 'noop' : (currentState ?? 'noop')
  } else if (configuration.transition === 'clear') {
    state = currentState ?? 'noop'
  } else if (
    configuration.transition === 'noop' ||
    configuration.transition === 'deploy'
  ) {
    headMatches = pullRequest.headSha === configuration.expectedHeadSha
    if (!headMatches) {
      state = 'noop'
    } else if (configuration.operationResult !== 'success') {
      state =
        configuration.transition === 'noop' ? 'noop' : 'deploy'
    } else if (configuration.transition === 'noop') {
      state = evaluationPassed ? 'deploy' : 'review'
    } else {
      state = 'merge'
    }
  } else if (currentState === null || currentState === 'noop') {
    state = 'noop'
  } else if (evaluationPassed) {
    state = currentState === 'merge' ? 'merge' : 'deploy'
  } else if (
    currentState === 'merge' &&
    !configuration.demoteMergeOnReviewFailure
  ) {
    state = 'merge'
  } else {
    state = 'review'
  }

  return {
    state,
    headMatches,
    ...exactLabelActions(currentLabels, configuration.labels, state)
  }
}

function currentBranchDeployState(
  currentLabels: readonly string[],
  labels: BranchDeployLabels
): Exclude<BranchDeployState, 'cleared'> | null {
  const current = new Set(currentLabels.map(labelKey))
  if (current.has(labelKey(labels.noop))) {
    return 'noop'
  }
  if (current.has(labelKey(labels.review))) {
    return 'review'
  }
  if (current.has(labelKey(labels.deploy))) {
    return 'deploy'
  }
  if (current.has(labelKey(labels.merge))) {
    return 'merge'
  }
  return null
}

function exactLabelActions(
  currentLabels: readonly string[],
  labels: BranchDeployLabels,
  state: BranchDeployState
): {labelsToAdd: string[]; labelsToRemove: string[]} {
  const managed = [
    labels.noop,
    labels.review,
    labels.deploy,
    labels.merge
  ]
  const desired =
    state === 'cleared'
      ? null
      : state === 'noop'
        ? labels.noop
        : state === 'review'
          ? labels.review
          : state === 'deploy'
            ? labels.deploy
            : labels.merge
  const current = new Set(currentLabels.map(labelKey))
  const currentNames = new Map(
    currentLabels.map(label => [labelKey(label), label])
  )
  const desiredKey = desired === null ? null : labelKey(desired)

  return {
    labelsToAdd:
      desired !== null && !current.has(labelKey(desired)) ? [desired] : [],
    labelsToRemove: managed
      .filter(
        label => current.has(labelKey(label)) && labelKey(label) !== desiredKey
      )
      .map(label => currentNames.get(labelKey(label)) as string)
  }
}

function labelKey(label: string): string {
  return label.trim().toLowerCase()
}
