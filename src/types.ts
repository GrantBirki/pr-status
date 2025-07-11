/**
 * Type definitions for GitHub Action: pr-status
 */

// GitHub API Response Types
export interface GitHubContext {
  repo: {
    owner: string
    repo: string
  }
  issue: {
    number: number
  }
  payload: {
    pull_request?: {
      number: number
    }
  }
  workflow: string
}

export interface CheckRun {
  name: string
  conclusion: string | null
  isRequired?: boolean
}

export interface StatusContext {
  context: string
  state: string
  isRequired?: boolean
}

export type CheckNode = CheckRun | StatusContext

export interface StatusCheckRollupContext {
  nodes: CheckNode[]
}

export interface StatusCheckRollup {
  state: string
  contexts: StatusCheckRollupContext
}

export interface CheckSuites {
  totalCount: number
}

export interface Commit {
  checkSuites: CheckSuites
  statusCheckRollup: StatusCheckRollup
}

export interface CommitNode {
  commit: Commit
}

export interface Commits {
  nodes: CommitNode[]
}

export interface Reviews {
  totalCount: number
}

export interface PullRequest {
  reviewDecision: string | null
  mergeStateStatus: string | null
  commits: Commits
  reviews: Reviews
}

export interface Repository {
  pullRequest: PullRequest
}

export interface GraphQLResponse {
  repository: Repository
}

// Action Input/Output Types
export interface ActionInputs {
  github_token: string
  workflow?: string
  pr_number?: string
  checks: string
  evaluations: string
  pass_labels?: string
  pass_labels_cleanup?: string
  fail_labels?: string
  exclude_checks?: string
}

export interface ActionOutputs {
  approved: string
  total_approvals: number
  review_decision: string | null
  merge_state_status: string | null
  commit_status: string | null
  evaluation: string | null
}

// Internal Data Types
export interface StatusResult {
  review_decision: string | null
  total_approvals: number
  merge_state_status: string | null
  commit_status: string | null
}

export interface ActionData {
  checks: string
  prNumber: number
  evaluations: string[]
  excludeChecks: string[]
  workflow: string
}

export interface LabelResult {
  added: string[]
  removed: string[]
}

export interface LabelActions {
  labelsToAdd: string[]
  labelsToRemove: string[]
}

// Octokit Client Type
export interface OctokitClient {
  graphql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>
  rest: {
    issues: {
      listLabelsOnIssue: (params: {
        owner: string
        repo: string
        issue_number: number
      }) => Promise<{data: Array<{name: string}>}>
      removeLabel: (params: {
        owner: string
        repo: string
        issue_number: number
        name: string
      }) => Promise<any>
      addLabels: (params: {
        owner: string
        repo: string
        issue_number: number
        labels: string[]
      }) => Promise<any>
    }
  }
}

// Evaluation Function Type
export type EvaluationFunction = (
  evaluation: string,
  status: StatusResult
) => boolean
