import {
  CHECK_TYPES,
  FAILING_CHECK_STATES,
  PENDING_CHECK_STATES,
  PR_STATUS,
  SUCCESSFUL_CHECK_STATES
} from './constants.ts'
import type {CheckSelection, CommitStatus} from './constants.ts'
import type {ActionContext} from '../context.ts'
import type {
  GitHubCheck,
  GitHubClient,
  GitHubReview,
  PullRequestStatus
} from '../github.ts'

export type {GitHubCheck, GitHubReview} from '../github.ts'
export type RepositoryContext = Pick<ActionContext, 'repo'>
export type PullRequestStatusData = PullRequestStatus
export type PullRequestStatusClient = Pick<
  GitHubClient,
  'getPullRequestStatus'
>

export interface StatusData {
  checks: string
  excludeChecks?: readonly string[]
  currentCheckName?: string | undefined
}

export interface StatusResult {
  pull_request_state: PullRequestStatus['state']
  head_sha: string
  review_decision: string | null
  total_approvals: number
  merge_state_status: string
  mergeable_state: string
  is_draft: boolean
  commit_status: CommitStatus
}

interface StatusCoreApi {
  debug(message: string): void
  info(message: string): void
}

interface StatusDependencies {
  core: StatusCoreApi
}

export function parsePullRequestNumber(value: unknown): number {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new Error('pr_number must be a positive safe integer')
  }

  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error('pr_number must be a positive safe integer')
  }

  return number
}

export function parseCheckSelection(value: string): CheckSelection {
  if (value === CHECK_TYPES.ALL || value === CHECK_TYPES.REQUIRED) {
    return value
  }

  throw new Error("checks must be exactly 'all' or 'required'")
}

export function normalizeCheckStatus(check: GitHubCheck): CommitStatus {
  if (check.__typename === 'StatusContext') {
    return normalizeRawCheckState(check.state)
  }

  const completed = check.status === 'COMPLETED'
  const hasConclusion = check.conclusion !== null

  if (completed !== hasConclusion) {
    return PR_STATUS.UNKNOWN
  }

  const normalized = normalizeRawCheckState(
    hasConclusion ? check.conclusion : check.status
  )

  if (
    (completed && normalized === PR_STATUS.PENDING) ||
    (!completed &&
      (normalized === PR_STATUS.SUCCESS || normalized === PR_STATUS.FAILURE))
  ) {
    return PR_STATUS.UNKNOWN
  }

  return normalized
}

export function aggregateCheckStatuses(
  statuses: readonly CommitStatus[]
): CommitStatus {
  if (statuses.includes(PR_STATUS.FAILURE)) {
    return PR_STATUS.FAILURE
  }
  if (statuses.includes(PR_STATUS.UNKNOWN)) {
    return PR_STATUS.UNKNOWN
  }
  if (statuses.includes(PR_STATUS.PENDING)) {
    return PR_STATUS.PENDING
  }
  if (statuses.length > 0) {
    return PR_STATUS.SUCCESS
  }
  return PR_STATUS.UNKNOWN
}

export function countUniqueApprovals(
  reviews: readonly GitHubReview[]
): number {
  const approvedActors = new Set<string>()

  for (const review of reviews) {
    const actor = review.author
    if (
      review.state === 'APPROVED' &&
      actor !== null &&
      actor.__typename !== 'Bot' &&
      actor.login !== ''
    ) {
      approvedActors.add(actor.login)
    }
  }

  return approvedActors.size
}

export function determineCommitStatus(
  checks: readonly GitHubCheck[],
  checkSelection: CheckSelection,
  excludeChecks: readonly string[],
  currentCheckName?: string
): CommitStatus {
  const exclusions = new Set(normalizeConfiguredNames(excludeChecks))
  if (currentCheckName !== undefined && currentCheckName.trim() !== '') {
    exclusions.add(currentCheckName.trim())
  }

  const selectedChecks = checks.filter(check => {
    if (checkSelection === CHECK_TYPES.REQUIRED && !check.isRequired) {
      return false
    }
    return !exclusions.has(getCheckName(check))
  })

  return aggregateCheckStatuses(selectedChecks.map(normalizeCheckStatus))
}

export async function status(
  client: PullRequestStatusClient,
  context: RepositoryContext,
  pullRequestNumber: unknown,
  data: StatusData,
  dependencies: StatusDependencies
): Promise<StatusResult> {
  const number = parsePullRequestNumber(pullRequestNumber)
  const checkSelection = parseCheckSelection(data.checks)
  const {core} = dependencies
  const exclusions = normalizeConfiguredNames(data.excludeChecks ?? [])

  core.info('🔍 Fetching pull request status information...')
  if (
    data.currentCheckName !== undefined &&
    data.currentCheckName.trim() !== ''
  ) {
    exclusions.push(data.currentCheckName.trim())
  }
  core.info(
    `🚫 Checks to exclude from status evaluation: ${normalizeConfiguredNames(exclusions).join(', ')}`
  )

  const pullRequest = await client.getPullRequestStatus({
    owner: context.repo.owner,
    repo: context.repo.repo,
    number
  })

  const commitStatus = determineCommitStatus(
    pullRequest.checks,
    checkSelection,
    data.excludeChecks ?? [],
    data.currentCheckName
  )
  const result: StatusResult = {
    pull_request_state: pullRequest.state,
    head_sha: pullRequest.headRefOid,
    review_decision: pullRequest.reviewDecision,
    total_approvals: countUniqueApprovals(pullRequest.latestReviews),
    merge_state_status: pullRequest.mergeStateStatus,
    mergeable_state: pullRequest.mergeable,
    is_draft: pullRequest.isDraft,
    commit_status: commitStatus
  }

  core.info(`📊 Merge State Status: ${result.merge_state_status}`)
  core.info(`📊 Pull Request State: ${result.pull_request_state}`)
  core.info(`📊 Head SHA: ${result.head_sha}`)
  core.info(`📊 Mergeable State: ${result.mergeable_state}`)
  core.info(`📊 Is Draft: ${result.is_draft}`)
  core.info(`📊 Commit Status: ${result.commit_status}`)
  core.debug(`📊 Status result: ${JSON.stringify(result)}`)

  return result
}

function normalizeRawCheckState(state: string | null): CommitStatus {
  if (state !== null && SUCCESSFUL_CHECK_STATES.includes(state)) {
    return PR_STATUS.SUCCESS
  }
  if (state !== null && FAILING_CHECK_STATES.includes(state)) {
    return PR_STATUS.FAILURE
  }
  if (state !== null && PENDING_CHECK_STATES.includes(state)) {
    return PR_STATUS.PENDING
  }
  return PR_STATUS.UNKNOWN
}

function getCheckName(check: GitHubCheck): string {
  return check.__typename === 'CheckRun' ? check.name : check.context
}

function normalizeConfiguredNames(names: readonly string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const name of names) {
    const trimmed = name.trim()
    if (trimmed !== '' && !seen.has(trimmed)) {
      seen.add(trimmed)
      result.push(trimmed)
    }
  }

  return result
}
