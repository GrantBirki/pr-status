import {setTimeout as defaultSleep} from 'node:timers/promises'

import {VERSION} from './version.ts'

const REST_API_URL = 'https://api.github.com'
const GRAPHQL_API_URL = 'https://api.github.com/graphql'
const REQUEST_TIMEOUT_MILLISECONDS = 15_000
const MAX_ATTEMPTS = 3
const MAX_PAGES = 100
const MAX_NODES = 10_000
const MAX_RETRY_AFTER_MILLISECONDS = 10_000
const MAX_ERROR_EXCERPT_LENGTH = 4 * 1024
const RETRY_DELAYS_MILLISECONDS = [500, 1_000] as const

const PULL_REQUEST_STATUS_QUERY = `query(
  $owner: String!
  $repo: String!
  $number: Int!
  $checksCursor: String
  $reviewsCursor: String
  $includeChecks: Boolean!
  $includeReviews: Boolean!
) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewDecision
      mergeStateStatus
      mergeable
      isDraft
      commits(last: 1) @include(if: $includeChecks) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100, after: $checksCursor) {
                nodes {
                  __typename
                  ... on CheckRun {
                    name
                    isRequired(pullRequestNumber: $number)
                    conclusion
                    status
                  }
                  ... on StatusContext {
                    context
                    isRequired(pullRequestNumber: $number)
                    state
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      }
      latestReviews(first: 100, after: $reviewsCursor) @include(if: $includeReviews) {
        nodes {
          state
          author {
            __typename
            login
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}`

export interface CheckRun {
  __typename: 'CheckRun'
  name: string
  isRequired: boolean
  conclusion: string | null
  status: string | null
}

export interface StatusContext {
  __typename: 'StatusContext'
  context: string
  isRequired: boolean
  state: string | null
}

export type GitHubCheck = CheckRun | StatusContext

export interface ReviewActor {
  __typename: string
  login: string
}

export interface GitHubReview {
  state: string
  author: ReviewActor | null
}

export interface PullRequestStatus {
  reviewDecision: string | null
  mergeStateStatus: string
  mergeable: string
  isDraft: boolean
  checks: GitHubCheck[]
  latestReviews: GitHubReview[]
}

export interface PullRequestRequest {
  owner: string
  repo: string
  number: number
}

export interface RemoveLabelRequest extends PullRequestRequest {
  name: string
}

export interface AddLabelsRequest extends PullRequestRequest {
  labels: string[]
}

export interface GitHubClient {
  getPullRequestStatus(request: PullRequestRequest): Promise<PullRequestStatus>
  listIssueLabels(request: PullRequestRequest): Promise<string[]>
  removeLabel(request: RemoveLabelRequest): Promise<void>
  addLabels(request: AddLabelsRequest): Promise<void>
}

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export type SleepImplementation = (milliseconds: number) => Promise<void>

export interface GitHubEnvironment {
  GITHUB_API_URL?: string
  GITHUB_GRAPHQL_URL?: string
}

export interface GitHubClientOptions {
  fetch?: FetchImplementation
  sleep?: SleepImplementation
  environment?: GitHubEnvironment
}

interface RequestResult {
  status: number
  body: string
  headers: Headers
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface Connection<T> {
  nodes: T[]
  pageInfo: PageInfo
}

interface PullRequestPage {
  metadata: Omit<PullRequestStatus, 'checks' | 'latestReviews'>
  checks: Connection<GitHubCheck> | null
  reviews: Connection<GitHubReview> | null
}

interface PaginationState {
  active: boolean
  cursor: string | null
  nodes: number
  pages: number
  seenCursors: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Malformed GitHub response: ${path} must be an object`)
  }
  return value
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Malformed GitHub response: ${path} must be an array`)
  }
  return value
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Malformed GitHub response: ${path} must be a string`)
  }
  return value
}

function requireNullableString(value: unknown, path: string): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new Error(
      `Malformed GitHub response: ${path} must be a string or null`
    )
  }
  return value
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Malformed GitHub response: ${path} must be a boolean`)
  }
  return value
}

function sanitizeExcerpt(value: string, token: string): string {
  const withoutToken = value.split(token).join('[REDACTED]')
  return withoutToken
    .replace(/Bearer\s+[^\s"',}]+/giu, 'Bearer [REDACTED]')
    .slice(0, MAX_ERROR_EXCERPT_LENGTH)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseJson(body: string, description: string, token: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new Error(
      `Invalid JSON from GitHub ${description}: ${sanitizeExcerpt(body, token)}`
    )
  }
}

function validateEndpoints(environment: GitHubEnvironment): void {
  const apiUrl = environment.GITHUB_API_URL ?? REST_API_URL
  const graphqlUrl = environment.GITHUB_GRAPHQL_URL ?? GRAPHQL_API_URL

  if (apiUrl !== REST_API_URL) {
    throw new Error(
      `Unsupported GitHub API URL: expected ${REST_API_URL}; GitHub Enterprise Server is not supported`
    )
  }

  if (graphqlUrl !== GRAPHQL_API_URL) {
    throw new Error(
      `Unsupported GitHub GraphQL URL: expected ${GRAPHQL_API_URL}; GitHub Enterprise Server is not supported`
    )
  }
}

function parseRetryAfter(value: string): number {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(value)) {
    throw new Error('GitHub returned an invalid Retry-After value')
  }

  const milliseconds = Number(value) * 1_000
  if (milliseconds > MAX_RETRY_AFTER_MILLISECONDS) {
    throw new Error(
      'GitHub requested a Retry-After delay longer than 10 seconds'
    )
  }
  return milliseconds
}

function retryDelay(
  response: Response,
  attempt: number
): number | null {
  const retryAfter = response.headers.get('retry-after')
  if (response.status === 403 && retryAfter === null) {
    return null
  }

  if (retryAfter !== null) {
    return parseRetryAfter(retryAfter)
  }

  return RETRY_DELAYS_MILLISECONDS[attempt - 1]!
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 403 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  )
}

function requestError(
  method: string,
  url: string,
  status: number,
  body: string,
  token: string
): Error {
  const excerpt = sanitizeExcerpt(body, token)
  const suffix = excerpt.length > 0 ? `: ${excerpt}` : ''
  return new Error(
    `GitHub API request failed: ${method} ${url} returned HTTP ${status}${suffix}`
  )
}

function parsePageInfo(value: unknown, path: string): PageInfo {
  const pageInfo = requireRecord(value, path)
  return {
    hasNextPage: requireBoolean(
      pageInfo.hasNextPage,
      `${path}.hasNextPage`
    ),
    endCursor: requireNullableString(pageInfo.endCursor, `${path}.endCursor`)
  }
}

function parseCheck(value: unknown, index: number): GitHubCheck {
  const path = `data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[${index}]`
  const check = requireRecord(value, path)
  const typename = requireString(check.__typename, `${path}.__typename`)
  const isRequired = requireBoolean(check.isRequired, `${path}.isRequired`)

  if (typename === 'CheckRun') {
    return {
      __typename: typename,
      name: requireString(check.name, `${path}.name`),
      isRequired,
      conclusion: requireNullableString(
        check.conclusion,
        `${path}.conclusion`
      ),
      status: requireNullableString(check.status, `${path}.status`)
    }
  }

  if (typename === 'StatusContext') {
    return {
      __typename: typename,
      context: requireString(check.context, `${path}.context`),
      isRequired,
      state: requireNullableString(check.state, `${path}.state`)
    }
  }

  throw new Error(
    `Malformed GitHub response: ${path} has an unsupported __typename`
  )
}

function parseReview(value: unknown, index: number): GitHubReview {
  const path = `data.repository.pullRequest.latestReviews.nodes[${index}]`
  const review = requireRecord(value, path)
  let author: ReviewActor | null = null

  if (review.author !== null) {
    const authorRecord = requireRecord(review.author, `${path}.author`)
    author = {
      __typename: requireString(
        authorRecord.__typename,
        `${path}.author.__typename`
      ),
      login: requireString(authorRecord.login, `${path}.author.login`)
    }
  }

  return {
    state: requireString(review.state, `${path}.state`),
    author
  }
}

function emptyConnection<T>(): Connection<T> {
  return {
    nodes: [],
    pageInfo: {hasNextPage: false, endCursor: null}
  }
}

function parseChecks(pullRequest: Record<string, unknown>): Connection<GitHubCheck> {
  const commits = requireRecord(
    pullRequest.commits,
    'data.repository.pullRequest.commits'
  )
  const nodes = requireArray(
    commits.nodes,
    'data.repository.pullRequest.commits.nodes'
  )
  if (nodes.length !== 1) {
    throw new Error(
      'Malformed GitHub response: pull request must contain one latest commit'
    )
  }

  const commitNode = requireRecord(
    nodes[0],
    'data.repository.pullRequest.commits.nodes[0]'
  )
  const commit = requireRecord(
    commitNode.commit,
    'data.repository.pullRequest.commits.nodes[0].commit'
  )
  if (commit.statusCheckRollup === null) {
    return emptyConnection()
  }

  const rollup = requireRecord(
    commit.statusCheckRollup,
    'data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup'
  )
  const contexts = requireRecord(
    rollup.contexts,
    'data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts'
  )
  const checks = requireArray(
    contexts.nodes,
    'data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes'
  )

  return {
    nodes: checks.map(parseCheck),
    pageInfo: parsePageInfo(
      contexts.pageInfo,
      'data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo'
    )
  }
}

function parseReviews(pullRequest: Record<string, unknown>): Connection<GitHubReview> {
  const latestReviews = requireRecord(
    pullRequest.latestReviews,
    'data.repository.pullRequest.latestReviews'
  )
  const reviews = requireArray(
    latestReviews.nodes,
    'data.repository.pullRequest.latestReviews.nodes'
  )
  return {
    nodes: reviews.map(parseReview),
    pageInfo: parsePageInfo(
      latestReviews.pageInfo,
      'data.repository.pullRequest.latestReviews.pageInfo'
    )
  }
}

function parsePullRequestPage(
  value: unknown,
  includeChecks: boolean,
  includeReviews: boolean,
  token: string
): PullRequestPage {
  const body = requireRecord(value, 'response')
  if ('errors' in body) {
    const errors = requireArray(body.errors, 'errors')
    if (errors.length > 0) {
      throw new Error(
        `GitHub GraphQL request failed: ${sanitizeExcerpt(JSON.stringify(errors), token)}`
      )
    }
  }

  const data = requireRecord(body.data, 'data')
  const repository = requireRecord(data.repository, 'data.repository')
  const pullRequest = requireRecord(
    repository.pullRequest,
    'data.repository.pullRequest'
  )

  return {
    metadata: {
      reviewDecision: requireNullableString(
        pullRequest.reviewDecision,
        'data.repository.pullRequest.reviewDecision'
      ),
      mergeStateStatus: requireString(
        pullRequest.mergeStateStatus,
        'data.repository.pullRequest.mergeStateStatus'
      ),
      mergeable: requireString(
        pullRequest.mergeable,
        'data.repository.pullRequest.mergeable'
      ),
      isDraft: requireBoolean(
        pullRequest.isDraft,
        'data.repository.pullRequest.isDraft'
      )
    },
    checks: includeChecks ? parseChecks(pullRequest) : null,
    reviews: includeReviews ? parseReviews(pullRequest) : null
  }
}

function parseLabelNames(value: unknown, path: string): string[] {
  const labels = requireArray(value, path)
  return labels.map((value, index) => {
    const label = requireRecord(value, `${path}[${index}]`)
    return requireString(label.name, `${path}[${index}].name`)
  })
}

function createPaginationState(): PaginationState {
  return {
    active: true,
    cursor: null,
    nodes: 0,
    pages: 0,
    seenCursors: new Set<string>()
  }
}

function recordConnectionPage<T>(
  state: PaginationState,
  connection: Connection<T>,
  description: string,
  destination: T[]
): void {
  state.pages += 1
  state.nodes += connection.nodes.length
  if (state.nodes > MAX_NODES) {
    throw new Error(`GitHub ${description} pagination exceeded 10,000 nodes`)
  }
  destination.push(...connection.nodes)

  if (!connection.pageInfo.hasNextPage) {
    state.active = false
    return
  }

  if (state.pages >= MAX_PAGES) {
    throw new Error(`GitHub ${description} pagination exceeded 100 pages`)
  }

  const cursor = connection.pageInfo.endCursor
  if (cursor === null) {
    throw new Error(
      `GitHub ${description} pagination returned no next cursor`
    )
  }
  if (state.seenCursors.has(cursor)) {
    throw new Error(
      `GitHub ${description} pagination repeated a cursor`
    )
  }

  state.seenCursors.add(cursor)
  state.cursor = cursor
}

function nextLink(value: string | null): string | null {
  if (value === null) {
    return null
  }

  for (const part of value.split(',')) {
    const match = /^\s*<([^>]+)>;\s*rel="([^"]+)"\s*$/u.exec(part)
    if (match !== null && match[2] === 'next') {
      return match[1]!
    }
  }
  return null
}

function requireGitHubRestUrl(
  value: string,
  expectedPath: string
): {url: string; page: string} {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('GitHub pagination returned an invalid URL')
  }

  if (
    url.origin !== REST_API_URL ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== expectedPath
  ) {
    throw new Error('GitHub pagination returned an unsupported API URL')
  }

  const page = url.searchParams.get('page')
  if (page === null || !/^[1-9][0-9]*$/u.test(page)) {
    throw new Error('GitHub pagination returned an invalid page number')
  }
  return {url: url.toString(), page}
}

function validateRequest(request: PullRequestRequest): void {
  if (request.owner.length === 0 || request.repo.length === 0) {
    throw new Error('GitHub repository owner and name must not be empty')
  }
  if (!Number.isSafeInteger(request.number) || request.number <= 0) {
    throw new Error('GitHub pull request number must be a positive safe integer')
  }
}

/**
 * Create the narrowly scoped GitHub.com client used by this action.
 */
export function createGitHubClient(
  token: string,
  options: GitHubClientOptions = {}
): GitHubClient {
  if (token.length === 0) {
    throw new Error('GitHub token must not be empty')
  }

  const environment = options.environment ?? process.env
  validateEndpoints(environment)

  const fetchImplementation = options.fetch ?? globalThis.fetch
  const sleep = options.sleep ?? defaultSleep
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': `grantbirki/pr-status@${VERSION}`,
    'X-GitHub-Api-Version': '2022-11-28'
  } as const

  async function request(
    method: string,
    url: string,
    body?: string,
    acceptNotFound = false
  ): Promise<RequestResult> {
    async function attemptRequest(attempt: number): Promise<RequestResult> {
      let response: Response
      let responseBody: string
      try {
        const init: RequestInit = {
          method,
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS)
        }
        if (body !== undefined) {
          init.body = body
        }
        response = await fetchImplementation(url, init)
        responseBody = await response.text()
      } catch (error: unknown) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAYS_MILLISECONDS[attempt - 1]!)
          return attemptRequest(attempt + 1)
        }
        throw new Error(
          `GitHub API network request failed after ${MAX_ATTEMPTS} attempts: ${sanitizeExcerpt(errorMessage(error), token)}`
        )
      }

      if (response.ok || (acceptNotFound && response.status === 404)) {
        return {
          status: response.status,
          body: responseBody,
          headers: response.headers
        }
      }

      if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
        const delay = retryDelay(response, attempt)
        if (delay !== null) {
          await sleep(delay)
          return attemptRequest(attempt + 1)
        }
      }

      throw requestError(method, url, response.status, responseBody, token)
    }
    return attemptRequest(1)
  }

  async function getPullRequestStatus(
    pullRequestRequest: PullRequestRequest
  ): Promise<PullRequestStatus> {
    validateRequest(pullRequestRequest)
    const checksState = createPaginationState()
    const reviewsState = createPaginationState()
    const checks: GitHubCheck[] = []
    const latestReviews: GitHubReview[] = []
    let metadata: PullRequestPage['metadata']

    do {
      const response = await request(
        'POST',
        GRAPHQL_API_URL,
        JSON.stringify({
          query: PULL_REQUEST_STATUS_QUERY,
          variables: {
            owner: pullRequestRequest.owner,
            repo: pullRequestRequest.repo,
            number: pullRequestRequest.number,
            checksCursor: checksState.cursor,
            reviewsCursor: reviewsState.cursor,
            includeChecks: checksState.active,
            includeReviews: reviewsState.active
          }
        })
      )
      const parsedJson = parseJson(response.body, 'GraphQL response', token)
      const page = parsePullRequestPage(
        parsedJson,
        checksState.active,
        reviewsState.active,
        token
      )
      metadata = page.metadata

      if (page.checks !== null) {
        recordConnectionPage(checksState, page.checks, 'checks', checks)
      }
      if (page.reviews !== null) {
        recordConnectionPage(
          reviewsState,
          page.reviews,
          'reviews',
          latestReviews
        )
      }
    } while (checksState.active || reviewsState.active)

    return {...metadata, checks, latestReviews}
  }

  async function listIssueLabels(
    pullRequestRequest: PullRequestRequest
  ): Promise<string[]> {
    validateRequest(pullRequestRequest)
    const path = `/repos/${encodeURIComponent(pullRequestRequest.owner)}/${encodeURIComponent(pullRequestRequest.repo)}/issues/${pullRequestRequest.number}/labels`
    let url = `${REST_API_URL}${path}?per_page=100&page=1`
    const seenPages = new Set<string>(['1'])
    const labels: string[] = []
    let pages = 0

    while (true) {
      pages += 1
      const response = await request('GET', url)
      const parsedJson = parseJson(response.body, 'labels response', token)
      labels.push(...parseLabelNames(parsedJson, 'labels'))
      if (labels.length > MAX_NODES) {
        throw new Error('GitHub labels pagination exceeded 10,000 nodes')
      }

      const link = nextLink(response.headers.get('link'))
      if (link === null) {
        return labels
      }
      if (pages >= MAX_PAGES) {
        throw new Error('GitHub labels pagination exceeded 100 pages')
      }

      const validatedLink = requireGitHubRestUrl(link, path)
      if (seenPages.has(validatedLink.page)) {
        throw new Error('GitHub labels pagination repeated a page')
      }
      seenPages.add(validatedLink.page)
      url = validatedLink.url
    }
  }

  async function removeLabel(labelRequest: RemoveLabelRequest): Promise<void> {
    validateRequest(labelRequest)
    const url = `${REST_API_URL}/repos/${encodeURIComponent(labelRequest.owner)}/${encodeURIComponent(labelRequest.repo)}/issues/${labelRequest.number}/labels/${encodeURIComponent(labelRequest.name)}`
    const response = await request('DELETE', url, undefined, true)
    if (response.status !== 404) {
      const parsedJson = parseJson(response.body, 'label removal response', token)
      parseLabelNames(parsedJson, 'labels')
    }
  }

  async function addLabels(labelRequest: AddLabelsRequest): Promise<void> {
    validateRequest(labelRequest)
    const url = `${REST_API_URL}/repos/${encodeURIComponent(labelRequest.owner)}/${encodeURIComponent(labelRequest.repo)}/issues/${labelRequest.number}/labels`
    const response = await request(
      'POST',
      url,
      JSON.stringify({labels: labelRequest.labels})
    )
    const parsedJson = parseJson(response.body, 'label addition response', token)
    parseLabelNames(parsedJson, 'labels')
  }

  return {getPullRequestStatus, listIssueLabels, removeLabel, addLabels}
}
