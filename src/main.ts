import actions from './actions.ts'
import type {ActionsApi} from './actions.ts'
import {loadActionContext} from './context.ts'
import type {ActionContext} from './context.ts'
import {
  determineLabelActions as selectLabelActions,
  label as reconcileLabels
} from './functions/label.ts'
import type {LabelActions} from './functions/label.ts'
import {outputs as writeOutputs} from './functions/outputs.ts'
import {parseEvaluationCriteria} from './functions/outputs.ts'
import type {CheckSelection} from './functions/constants.ts'
import {
  determineBranchDeployState as selectBranchDeployState,
  parseActionMode,
  parseBranchDeployTransition,
  parseBooleanInput,
  parseOperationResult,
  validateBranchDeployConfiguration,
  validateBranchDeployPolicy
} from './functions/branch-deploy.ts'
import type {
  ActionMode,
  BranchDeployConfiguration,
  BranchDeployPolicy
} from './functions/branch-deploy.ts'
import {resolveBranchDeployEvent as resolveEventTransition} from './functions/branch-deploy-event.ts'
import type {BranchDeployEventResolution} from './functions/branch-deploy-event.ts'
import {
  parseCheckSelection,
  parsePullRequestNumber,
  status as getStatus
} from './functions/status.ts'
import type {StatusResult} from './functions/status.ts'
import {stringToArray as parseStringToArray} from './functions/string-to-array.ts'
import {createGitHubClient} from './github.ts'
import type {GitHubClient} from './github.ts'

export type BranchDeployInputs =
  | {
      source: 'event'
      policy: BranchDeployPolicy
    }
  | {
      source: 'explicit'
      configuration: BranchDeployConfiguration
    }

export interface ActionInputs {
  mode: ActionMode
  token: string
  currentCheckName: string
  checks: CheckSelection
  evaluations: string[]
  passLabels: string[]
  passLabelsCleanup: string[]
  failLabels: string[]
  excludeChecks: string[]
  prNumber: number | null
  branchDeploy: BranchDeployInputs | null
}

export interface MainDependencies {
  core: ActionsApi
  loadContext(): ActionContext
  createClient(token: string): GitHubClient
  status: typeof getStatus
  outputs: typeof writeOutputs
  stringToArray: typeof parseStringToArray
  determineLabelActions: typeof selectLabelActions
  determineBranchDeployState: typeof selectBranchDeployState
  resolveBranchDeployEvent(
    context: ActionContext
  ): BranchDeployEventResolution
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
  determineBranchDeployState: selectBranchDeployState,
  resolveBranchDeployEvent: resolveEventTransition,
  label: reconcileLabels
}

export function parseInputs(
  dependencies: Pick<MainDependencies, 'core' | 'stringToArray'>,
  context: ActionContext
): ActionInputs {
  const {core, stringToArray} = dependencies
  const mode = parseActionMode(core.getInput('mode'))
  const token = core.getInput('github_token', {required: true})
  const currentCheckName = core.getInput('workflow') || context.job
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
  let prNumber: number | null = null
  let branchDeploy: BranchDeployInputs | null = null

  parseEvaluationCriteria(evaluations)
  if (mode === 'branch-deploy') {
    if (
      passLabels.length > 0 ||
      passLabelsCleanup.length > 0 ||
      failLabels.length > 0
    ) {
      throw new Error(
        'branch-deploy mode cannot be combined with pass_labels, pass_labels_cleanup, or fail_labels'
      )
    }

    const policy: BranchDeployPolicy = {
      labels: {
        noop: core.getInput('noop_label'),
        review: core.getInput('review_label'),
        deploy: core.getInput('deploy_label'),
        merge: core.getInput('merge_label')
      },
      clearOnDraft: parseBooleanInput(
        'clear_on_draft',
        core.getInput('clear_on_draft')
      ),
      demoteMergeOnReviewFailure: parseBooleanInput(
        'demote_merge_on_review_failure',
        core.getInput('demote_merge_on_review_failure')
      ),
      dryRun: parseBooleanInput('dry_run', core.getInput('dry_run'))
    }
    validateBranchDeployPolicy(policy)

    const transitionInput = core.getInput('transition')
    if (transitionInput === '') {
      branchDeploy = {source: 'event', policy}
    } else {
      const transition = parseBranchDeployTransition(transitionInput)
      const configuration: BranchDeployConfiguration = {
        ...policy,
        transition,
        expectedHeadSha: core.getInput('expected_head_sha'),
        operationResult: parseOperationResult(
          core.getInput('operation_result'),
          transition
        ),
        preserveAdvancedReset: false
      }
      validateBranchDeployConfiguration(configuration)
      prNumber = parsePullRequestNumber(
        inputPullRequestNumber === ''
          ? context.issueNumber
          : inputPullRequestNumber
      )
      branchDeploy = {source: 'explicit', configuration}
    }
  } else {
    prNumber = parsePullRequestNumber(
      inputPullRequestNumber === ''
        ? context.issueNumber
        : inputPullRequestNumber
    )
  }
  core.debug('📋 Parsed and validated inputs successfully')

  return {
    mode,
    token,
    currentCheckName,
    checks,
    evaluations,
    passLabels,
    passLabelsCleanup,
    failLabels,
    excludeChecks,
    prNumber,
    branchDeploy
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
    const client = dependencies.createClient(inputs.token)
    let prNumber = inputs.prNumber
    let branchDeployConfiguration: BranchDeployConfiguration | null = null
    let nativeBranchDeployEvent = false

    if (inputs.branchDeploy !== null) {
      if (inputs.branchDeploy.source === 'explicit') {
        branchDeployConfiguration = inputs.branchDeploy.configuration
      } else {
        const resolution = dependencies.resolveBranchDeployEvent(context)
        if (!resolution.shouldReconcile) {
          core.setOutput('branch_deploy_reconciled', 'false')
          core.info(`🚦 No branch-deploy reconciliation: ${resolution.reason}`)
          core.info('✅ PR Status Action completed successfully')
          return 'success'
        }
        prNumber = resolution.prNumber
        nativeBranchDeployEvent = true
        branchDeployConfiguration = {
          ...inputs.branchDeploy.policy,
          transition: resolution.transition,
          expectedHeadSha: resolution.expectedHeadSha,
          operationResult: resolution.operationResult,
          preserveAdvancedReset: resolution.preserveAdvancedReset
        }
        validateBranchDeployConfiguration(branchDeployConfiguration)
      }
    }

    if (prNumber === null) {
      throw new Error('pull request number could not be resolved')
    }
    core.info(`🔍 Evaluating PR #${prNumber}`)

    const statusResult: StatusResult = await dependencies.status(
      client,
      context,
      prNumber,
      {
        checks: inputs.checks,
        excludeChecks: inputs.excludeChecks,
        currentCheckName: inputs.currentCheckName
      },
      {core}
    )

    const passed = dependencies.outputs(
      statusResult,
      {evaluations: inputs.evaluations},
      {core}
    )
    core.info(`📊 Evaluation result: ${passed ? 'PASS ✅' : 'FAIL ❌'}`)

    let labelActions: LabelActions
    let currentLabels: string[] | undefined

    if (inputs.mode === 'branch-deploy') {
      const branchDeploy =
        branchDeployConfiguration as BranchDeployConfiguration
      currentLabels = await client.listIssueLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        number: prNumber
      })
      const decision = dependencies.determineBranchDeployState({
        configuration: branchDeploy,
        pullRequest: {
          state: statusResult.pull_request_state,
          headSha: statusResult.head_sha,
          isDraft: statusResult.is_draft
        },
        evaluationPassed: passed,
        currentLabels
      })
      core.setOutput('branch_deploy_state', decision.state)
      core.setOutput(
        'head_matches',
        decision.headMatches === null
          ? ''
          : decision.headMatches
            ? 'true'
            : 'false'
      )
      core.info(`🚦 Branch-deploy state: ${decision.state}`)
      if (nativeBranchDeployEvent && decision.headMatches === false) {
        core.setOutput('branch_deploy_reconciled', 'false')
        core.info(
          '🚦 No branch-deploy reconciliation: event head no longer matches the pull request head'
        )
        core.info('✅ PR Status Action completed successfully')
        return 'success'
      }
      core.setOutput('branch_deploy_reconciled', 'true')
      labelActions = decision
    } else {
      labelActions = dependencies.determineLabelActions(
        passed,
        inputs.passLabels,
        inputs.failLabels,
        inputs.passLabelsCleanup
      )
    }
    logLabelActions(
      labelActions.labelsToAdd,
      labelActions.labelsToRemove,
      core
    )
    if (branchDeployConfiguration?.dryRun === true) {
      core.info('🏷️ Dry run enabled; branch-deploy labels were not changed')
    } else {
      await dependencies.label(
        prNumber,
        context,
        client,
        labelActions.labelsToAdd,
        labelActions.labelsToRemove,
        currentLabels === undefined ? {core} : {core, currentLabels}
      )
    }

    core.info('✅ PR Status Action completed successfully')
    return 'success'
  } catch (error: unknown) {
    core.setFailed(`PR Status Action failed: ${safeErrorMessage(error, token)}`)
    return 'failure'
  }
}
