import actions from './actions.ts'
import type {ActionsApi} from './actions.ts'
import {loadActionContext} from './context.ts'
import type {ActionContext} from './context.ts'
import {
  determineLabelActions as selectLabelActions,
  label as reconcileLabels
} from './functions/label.ts'
import {outputs as writeOutputs} from './functions/outputs.ts'
import {parseEvaluationCriteria} from './functions/outputs.ts'
import type {CheckSelection} from './functions/constants.ts'
import {
  parseCheckSelection,
  parsePullRequestNumber,
  status as getStatus
} from './functions/status.ts'
import type {StatusResult} from './functions/status.ts'
import {stringToArray as parseStringToArray} from './functions/string-to-array.ts'
import {createGitHubClient} from './github.ts'
import type {GitHubClient} from './github.ts'

export interface ActionInputs {
  token: string
  workflow: string
  checks: CheckSelection
  evaluations: string[]
  passLabels: string[]
  passLabelsCleanup: string[]
  failLabels: string[]
  excludeChecks: string[]
  prNumber: number
}

export interface MainDependencies {
  core: ActionsApi
  loadContext(): ActionContext
  createClient(token: string): GitHubClient
  status: typeof getStatus
  outputs: typeof writeOutputs
  stringToArray: typeof parseStringToArray
  determineLabelActions: typeof selectLabelActions
  label: typeof reconcileLabels
}

export type RunResult = 'success' | 'failure'

export const defaultDependencies: MainDependencies = {
  core: actions,
  loadContext: loadActionContext,
  createClient: createGitHubClient,
  status: getStatus,
  outputs: writeOutputs,
  stringToArray: parseStringToArray,
  determineLabelActions: selectLabelActions,
  label: reconcileLabels
}

export function parseInputs(
  dependencies: Pick<MainDependencies, 'core' | 'stringToArray'>,
  context: ActionContext
): ActionInputs {
  const {core, stringToArray} = dependencies
  const token = core.getInput('github_token', {required: true})
  const workflow = core.getInput('workflow') || context.workflow
  const checks = parseCheckSelection(
    core.getInput('checks', {required: true})
  )
  const evaluations = stringToArray(core.getInput('evaluations'))
  const passLabels = stringToArray(core.getInput('pass_labels'))
  const passLabelsCleanup = stringToArray(
    core.getInput('pass_labels_cleanup')
  )
  const failLabels = stringToArray(core.getInput('fail_labels'))
  const excludeChecks = stringToArray(core.getInput('exclude_checks'))
  const inputPullRequestNumber = core.getInput('pr_number')
  const prNumber = parsePullRequestNumber(
    inputPullRequestNumber === ''
      ? context.issueNumber
      : inputPullRequestNumber
  )

  parseEvaluationCriteria(evaluations)
  core.debug('📋 Parsed and validated inputs successfully')

  return {
    token,
    workflow,
    checks,
    evaluations,
    passLabels,
    passLabelsCleanup,
    failLabels,
    excludeChecks,
    prNumber
  }
}

export function logLabelActions(
  labelsToAdd: readonly string[],
  labelsToRemove: readonly string[],
  core: Pick<ActionsApi, 'info'>
): void {
  if (labelsToAdd.length > 0) {
    core.info(`🏷️ Labels to add: ${labelsToAdd.join(', ')}`)
  }
  if (labelsToRemove.length > 0) {
    core.info(`🏷️ Labels to remove: ${labelsToRemove.join(', ')}`)
  }
  if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
    core.info('🏷️ No label changes needed')
  }
}

export function safeErrorMessage(error: unknown, token?: string): string {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error'
  const withoutAuthorization = rawMessage.replace(
    /\bBearer\s+[^\s,;]+/gi,
    'Bearer [REDACTED]'
  )

  if (token === undefined || token === '') {
    return withoutAuthorization
  }

  return withoutAuthorization.split(token).join('[REDACTED]')
}

export async function run(
  dependencies: MainDependencies = defaultDependencies
): Promise<RunResult> {
  const {core} = dependencies
  let token: string | undefined

  try {
    core.info('🚀 PR Status Action starting')
    const context = dependencies.loadContext()
    const inputs = parseInputs(dependencies, context)
    token = inputs.token
    core.info(`🔍 Evaluating PR #${inputs.prNumber}`)

    const client = dependencies.createClient(inputs.token)
    const statusResult: StatusResult = await dependencies.status(
      client,
      context,
      inputs.prNumber,
      {
        checks: inputs.checks,
        excludeChecks: inputs.excludeChecks,
        workflow: inputs.workflow
      },
      {core}
    )

    const passed = dependencies.outputs(
      statusResult,
      {evaluations: inputs.evaluations},
      {core}
    )
    core.info(`📊 Evaluation result: ${passed ? 'PASS ✅' : 'FAIL ❌'}`)

    const labelActions = dependencies.determineLabelActions(
      passed,
      inputs.passLabels,
      inputs.failLabels,
      inputs.passLabelsCleanup
    )
    logLabelActions(
      labelActions.labelsToAdd,
      labelActions.labelsToRemove,
      core
    )
    await dependencies.label(
      inputs.prNumber,
      context,
      client,
      labelActions.labelsToAdd,
      labelActions.labelsToRemove,
      {core}
    )

    core.info('✅ PR Status Action completed successfully')
    return 'success'
  } catch (error: unknown) {
    core.setFailed(`PR Status Action failed: ${safeErrorMessage(error, token)}`)
    return 'failure'
  }
}
