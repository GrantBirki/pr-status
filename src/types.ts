export type IssueNumber = string | number

export interface InputOptions {
  required?: boolean
}

export interface CoreApi {
  getInput(name: string, options?: InputOptions): string
  debug(message: string): void
  info(message: string): void
  warning(message: string): void
  error(message: string): void
  setOutput(name: string, value: unknown): void
  setFailed(message: string | Error): void
}

export interface RepositoryContext {
  owner: string
  repo: string
}

export interface RepositoryOnlyContext {
  repo: RepositoryContext
}

export interface ActionContext extends RepositoryOnlyContext {
  workflow?: string
  issue?: {
    number?: number
  }
  payload?: {
    pull_request?: {
      number?: number
    }
  }
}

export interface LabelRequest {
  owner: string
  repo: string
  issue_number: IssueNumber
  [key: string]: unknown
}

export interface LabelClient {
  rest: {
    issues: {
      listLabelsOnIssue(
        request: LabelRequest
      ): Promise<{data: Array<{name: string}>}>
      removeLabel(request: LabelRequest & {name: string}): Promise<unknown>
      addLabels(
        request: LabelRequest & {labels: string[]}
      ): Promise<unknown>
    }
  }
}

export interface GraphqlClient {
  graphql(query: string, variables: Record<string, unknown>): Promise<unknown>
}

export type OctokitClient = GraphqlClient & LabelClient

export interface StatusResult {
  review_decision: string | null
  total_approvals: number | null
  merge_state_status: string | null
  mergeable_state: string | null
  is_draft: boolean
  commit_status: string | null
}

export interface ActionData {
  checks: string
  prNumber: IssueNumber
  evaluations: string[]
  excludeChecks: string[]
  workflow: string | undefined
}

export interface ActionInputs extends ActionData {
  token: string
  passLabels: string[]
  passLabelsCleanup: string[]
  failLabels: string[]
}

export interface LabelResult {
  added: string[]
  removed: string[]
}

export interface CoreDependencies {
  core: CoreApi
}
