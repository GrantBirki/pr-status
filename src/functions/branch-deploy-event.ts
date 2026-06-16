import type {ActionContext} from '../context.ts'
import type {GitHubClient, GitHubIssueComment} from '../github.ts'
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
const STATUS_MARKER_PATTERN =
  /<!-- branch-deploy-status:([^\r\n]*) -->/gu

export interface BranchDeployEventTransition {
  shouldReconcile: true
  transition: BranchDeployTransition
  prNumber: number
  expectedHeadSha: string
  operationResult: OperationResult | null
}

export interface IgnoredBranchDeployEvent {
  shouldReconcile: false
  reason: string
}

export type BranchDeployEventResolution =
  | BranchDeployEventTransition
  | IgnoredBranchDeployEvent

interface BranchDeployCommandIdentity {
  prNumber: number
  expectedHeadSha: string
  transition: 'noop' | 'deploy'
  runId: number
  runAttempt: number
  job: string
  commandCommentId: number
  stableBranchUsed: boolean
}

interface TrustedBranchDeployMarker extends BranchDeployCommandIdentity {
  statusCommentId: number
}

interface BranchDeployDispatch extends BranchDeployCommandIdentity {
  operationResult: 'success' | 'failure'
  statusCommentId: number
}

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

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`)
  }
  return value
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${path} must be a positive safe integer`)
  }
  return value as number
}

function requireTransition(
  value: unknown,
  path: string
): BranchDeployDispatch['transition'] {
  if (value === 'noop' || value === 'deploy') {
    return value
  }
  throw new Error(`${path} must be exactly 'noop' or 'deploy'`)
}

function requireOperationResult(
  value: unknown,
  path: string
): BranchDeployDispatch['operationResult'] {
  if (value === 'success' || value === 'failure') {
    return value
  }
  throw new Error(`${path} must be exactly 'success' or 'failure'`)
}

function requireIsoTimestamp(value: unknown, path: string): string {
  const timestamp = requireString(value, path)
  const milliseconds = Date.parse(timestamp)
  if (!timestamp.endsWith('Z') || !Number.isFinite(milliseconds)) {
    throw new Error(`${path} must be an ISO 8601 UTC timestamp`)
  }
  return timestamp
}

function eventAction(payload: Record<string, unknown>): string {
  return typeof payload.action === 'string' ? payload.action : ''
}

function pullRequestEventData(
  payload: Record<string, unknown>,
  requireHeadSha: boolean
): {prNumber: number; headSha: string; updatedAt: string} {
  const pullRequest = requireRecord(
    payload.pull_request,
    'github.event.pull_request'
  )
  const prNumber = requirePositiveInteger(
    pullRequest.number,
    'github.event.pull_request.number'
  )
  if (!requireHeadSha) {
    return {prNumber, headSha: '', updatedAt: ''}
  }

  const head = requireRecord(
    pullRequest.head,
    'github.event.pull_request.head'
  )
  return {
    prNumber,
    headSha: requireString(
      head.sha,
      'github.event.pull_request.head.sha'
    ),
    updatedAt: requireIsoTimestamp(
      pullRequest.updated_at,
      'github.event.pull_request.updated_at'
    )
  }
}

function parseCommandIdentity(
  value: unknown,
  path: string
): BranchDeployCommandIdentity {
  const data = requireRecord(value, path)
  return {
    prNumber: requirePositiveInteger(data.pr_number, `${path}.pr_number`),
    expectedHeadSha: requireString(
      data.expected_head_sha,
      `${path}.expected_head_sha`
    ),
    transition: requireTransition(data.transition, `${path}.transition`),
    runId: requirePositiveInteger(
      data.github_run_id,
      `${path}.github_run_id`
    ),
    runAttempt: requirePositiveInteger(
      data.github_run_attempt,
      `${path}.github_run_attempt`
    ),
    job: requireString(data.github_job, `${path}.github_job`),
    commandCommentId: requirePositiveInteger(
      data.command_comment_id,
      `${path}.command_comment_id`
    ),
    stableBranchUsed: requireBoolean(
      data.stable_branch_used,
      `${path}.stable_branch_used`
    )
  }
}

function parseDispatch(payload: Record<string, unknown>): BranchDeployDispatch {
  const path = 'github.event.client_payload'
  const data = requireRecord(payload.client_payload, path)
  if (data.schema_version !== 1) {
    throw new Error(`${path}.schema_version must be exactly 1`)
  }
  const operationPath = `${path}.operation`
  const operation = requireRecord(data.operation, operationPath)
  const identity = parseCommandIdentity(
    {...operation, stable_branch_used: false},
    operationPath
  )
  return {
    ...identity,
    operationResult: requireOperationResult(
      operation.operation_result,
      `${operationPath}.operation_result`
    ),
    statusCommentId: requirePositiveInteger(
      operation.status_comment_id,
      `${operationPath}.status_comment_id`
    )
  }
}

function trustedStatusMarkers(
  comments: readonly GitHubIssueComment[]
): TrustedBranchDeployMarker[] {
  const markers: TrustedBranchDeployMarker[] = []
  for (const comment of comments) {
    if (
      comment.user?.login !== 'github-actions[bot]' ||
      comment.user.type !== 'Bot'
    ) {
      continue
    }
    for (const match of comment.body.matchAll(STATUS_MARKER_PATTERN)) {
      let value: unknown
      try {
        value = JSON.parse(match[1]!) as unknown
      } catch {
        throw new Error('branch-deploy status marker contains invalid JSON')
      }
      markers.push({
        ...parseCommandIdentity(value, 'branch-deploy status marker'),
        statusCommentId: comment.id
      })
    }
  }
  return markers
}

function sameCommand(
  marker: BranchDeployCommandIdentity,
  dispatch: BranchDeployDispatch
): boolean {
  return (
    marker.prNumber === dispatch.prNumber &&
    marker.expectedHeadSha === dispatch.expectedHeadSha &&
    marker.transition === dispatch.transition &&
    marker.runId === dispatch.runId &&
    marker.runAttempt === dispatch.runAttempt &&
    marker.job === dispatch.job &&
    marker.commandCommentId === dispatch.commandCommentId &&
    marker.stableBranchUsed === dispatch.stableBranchUsed
  )
}

function expectedIssueUrl(
  context: ActionContext,
  prNumber: number
): string {
  return `https://api.github.com/repos/${context.repo.owner}/${context.repo.repo}/issues/${prNumber}`
}

async function resolveDispatch(
  context: ActionContext,
  client: Pick<GitHubClient, 'getIssueComment' | 'listIssueComments'>
): Promise<BranchDeployEventResolution> {
  const dispatch = parseDispatch(context.eventPayload)
  const statusComment = await client.getIssueComment({
    ...context.repo,
    commentId: dispatch.statusCommentId
  })
  if (statusComment.id !== dispatch.statusCommentId) {
    throw new Error('repository dispatch status comment ID does not match')
  }
  if (
    statusComment.issueUrl.toLowerCase() !==
    expectedIssueUrl(context, dispatch.prNumber).toLowerCase()
  ) {
    throw new Error(
      'repository dispatch status comment does not belong to the pull request'
    )
  }

  const statusMarkers = trustedStatusMarkers([statusComment])
  if (
    statusMarkers.length !== 1 ||
    !sameCommand(statusMarkers[0]!, dispatch)
  ) {
    throw new Error(
      'repository dispatch has no matching trusted branch-deploy status marker'
    )
  }

  const comments = await client.listIssueComments({
    ...context.repo,
    number: dispatch.prNumber
  })
  const markers = trustedStatusMarkers(comments)
  const newerCommand = markers.some(
    marker =>
      marker.prNumber === dispatch.prNumber &&
      !marker.stableBranchUsed &&
      marker.statusCommentId > dispatch.statusCommentId
  )
  if (newerCommand) {
    return {
      shouldReconcile: false,
      reason: 'a newer branch-deploy command exists for this pull request'
    }
  }

  return {
    shouldReconcile: true,
    transition: dispatch.transition,
    prNumber: dispatch.prNumber,
    expectedHeadSha: dispatch.expectedHeadSha,
    operationResult: dispatch.operationResult
  }
}

export async function resolveBranchDeployEvent(
  context: ActionContext,
  client: Pick<GitHubClient, 'getIssueComment' | 'listIssueComments'>
): Promise<BranchDeployEventResolution> {
  const action = eventAction(context.eventPayload)

  if (context.eventName === 'pull_request') {
    if (RESET_ACTIONS.has(action)) {
      const data = pullRequestEventData(context.eventPayload, true)
      const comments = await client.listIssueComments({
        ...context.repo,
        number: data.prNumber,
        since: data.updatedAt
      })
      const commandOwnsCurrentHead = trustedStatusMarkers(comments).some(
        marker =>
          marker.prNumber === data.prNumber &&
          marker.expectedHeadSha === data.headSha &&
          !marker.stableBranchUsed
      )
      if (commandOwnsCurrentHead) {
        return {
          shouldReconcile: false,
          reason: 'a branch-deploy command already owns this pull request head'
        }
      }
      return {
        shouldReconcile: true,
        transition: 'reset',
        prNumber: data.prNumber,
        expectedHeadSha: data.headSha,
        operationResult: null
      }
    }
    if (CLEAR_ACTIONS.has(action)) {
      const data = pullRequestEventData(context.eventPayload, false)
      return {
        shouldReconcile: true,
        transition: 'clear',
        prNumber: data.prNumber,
        expectedHeadSha: '',
        operationResult: null
      }
    }
  }

  if (
    context.eventName === 'pull_request_review' &&
    REVIEW_ACTIONS.has(action)
  ) {
    const data = pullRequestEventData(context.eventPayload, false)
    return {
      shouldReconcile: true,
      transition: 'review',
      prNumber: data.prNumber,
      expectedHeadSha: '',
      operationResult: null
    }
  }

  if (
    context.eventName === 'repository_dispatch' &&
    action === 'branch-deploy-status'
  ) {
    return resolveDispatch(context, client)
  }

  return {
    shouldReconcile: false,
    reason: `event ${context.eventName}:${action || 'unknown'} is not a supported branch-deploy status transition`
  }
}
