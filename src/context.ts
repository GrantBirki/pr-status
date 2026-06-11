import {readFileSync} from 'node:fs'

export interface RepositoryContext {
  owner: string
  repo: string
}

export interface ActionContext {
  repo: RepositoryContext
  job: string
  issueNumber: number | undefined
}

export interface ContextDependencies {
  environment: NodeJS.ProcessEnv
  readFile(path: string): string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nestedIssueNumber(
  payload: Record<string, unknown>,
  key: 'pull_request' | 'issue'
): number | undefined {
  const value = payload[key]
  if (!isRecord(value) || typeof value.number !== 'number') {
    return undefined
  }

  return value.number
}

function parseEventPayload(serializedPayload: string): Record<string, unknown> {
  let payload: unknown
  try {
    payload = JSON.parse(serializedPayload)
  } catch {
    throw new Error('GITHUB_EVENT_PATH does not contain valid JSON')
  }

  if (!isRecord(payload)) {
    throw new Error('GITHUB_EVENT_PATH must contain a JSON object')
  }

  return payload
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string
): string {
  const value = environment[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required in GitHub Actions`)
  }

  return value
}

export function loadActionContext(
  dependencies: ContextDependencies = {
    environment: process.env,
    readFile: path => readFileSync(path, 'utf8')
  }
): ActionContext {
  const {environment} = dependencies
  if (environment.GITHUB_ACTIONS !== 'true') {
    throw new Error('pr-status can only run inside GitHub Actions')
  }

  const repository = requiredEnvironmentValue(environment, 'GITHUB_REPOSITORY')
  const [owner, repo, extraPart] = repository.split('/')
  if (
    owner === undefined ||
    owner === '' ||
    repo === undefined ||
    repo === '' ||
    extraPart !== undefined
  ) {
    throw new Error('GITHUB_REPOSITORY must use the owner/repository format')
  }

  const eventPath = requiredEnvironmentValue(environment, 'GITHUB_EVENT_PATH')
  const job = requiredEnvironmentValue(environment, 'GITHUB_JOB')
  const payload = parseEventPayload(dependencies.readFile(eventPath))
  const issueNumber =
    nestedIssueNumber(payload, 'pull_request') ??
    nestedIssueNumber(payload, 'issue') ??
    (typeof payload.number === 'number' ? payload.number : undefined)

  return {
    repo: {
      owner,
      repo
    },
    job,
    issueNumber
  }
}
