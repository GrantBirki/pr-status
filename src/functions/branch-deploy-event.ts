import type {ActionContext} from '../context.ts'
import type {
  BranchDeployTransition,
  OperationResult
} from './branch-deploy.ts'

const RESET_ACTIONS = new Set([
  'opened',
  'reopened',
  'synchronize',
  'ready_for_review'
])
const CLEAR_ACTIONS = new Set(['converted_to_draft', 'closed'])
const REVIEW_ACTIONS = new Set(['submitted', 'dismissed'])

export interface BranchDeployEventTransition {
  shouldReconcile: true
  transition: BranchDeployTransition
  prNumber: number
  expectedHeadSha: string
  operationResult: OperationResult | null
  preserveAdvancedReset: boolean
}

export interface IgnoredBranchDeployEvent {
  shouldReconcile: false
  reason: string
}

export type BranchDeployEventResolution =
  | BranchDeployEventTransition
  | IgnoredBranchDeployEvent

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`)
  }
  return value
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${path} must be a nonempty string`)
  }
  return value
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${path} must be a positive safe integer`)
  }
  return value as number
}

function pullRequestData(
  payload: Record<string, unknown>,
  requireHeadSha: boolean
): {prNumber: number; headSha: string} {
  const pullRequest = requireRecord(
    payload.pull_request,
    'github.event.pull_request'
  )
  const prNumber = requirePositiveInteger(
    pullRequest.number,
    'github.event.pull_request.number'
  )
  if (!requireHeadSha) {
    return {prNumber, headSha: ''}
  }

  const head = requireRecord(
    pullRequest.head,
    'github.event.pull_request.head'
  )
  return {
    prNumber,
    headSha: requireString(head.sha, 'github.event.pull_request.head.sha')
  }
}

export function resolveBranchDeployEvent(
  context: ActionContext
): BranchDeployEventResolution {
  const action =
    typeof context.eventPayload.action === 'string'
      ? context.eventPayload.action
      : ''
  let transition: BranchDeployTransition | null = null

  if (context.eventName === 'pull_request') {
    if (RESET_ACTIONS.has(action)) {
      transition = 'reset'
    } else if (CLEAR_ACTIONS.has(action)) {
      transition = 'clear'
    }
  } else if (
    context.eventName === 'pull_request_review' &&
    REVIEW_ACTIONS.has(action)
  ) {
    transition = 'review'
  }

  if (transition === null) {
    return {
      shouldReconcile: false,
      reason: `event ${context.eventName}:${action || 'unknown'} is not a supported branch-deploy status transition`
    }
  }

  const {prNumber, headSha} = pullRequestData(
    context.eventPayload,
    transition === 'reset'
  )
  return {
    shouldReconcile: true,
    transition,
    prNumber,
    expectedHeadSha: headSha,
    operationResult: null,
    preserveAdvancedReset:
      transition === 'reset' && context.runAttempt > 1
  }
}
