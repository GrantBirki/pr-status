import * as core from '@actions/core'
import * as github from '@actions/github'
import {retry as octokitRetry} from '@octokit/plugin-retry'

import {COLORS} from './functions/colors.ts'
import {label as updateLabels} from './functions/label.ts'
import {outputs as setOutputs} from './functions/outputs.ts'
import {status as getStatus} from './functions/status.ts'
import {stringToArray as parseStringToArray} from './functions/string-to-array.ts'
import type {
  ActionContext,
  ActionData,
  ActionInputs,
  CoreApi,
  OctokitClient
} from './types.ts'
import {VERSION} from './version.ts'

export interface MainDependencies {
  core: CoreApi
  context: ActionContext
  createOctokitClient(token: string): OctokitClient
  status: typeof getStatus
  outputs: typeof setOutputs
  stringToArray: typeof parseStringToArray
  label: typeof updateLabels
}

interface LabelActions {
  labelsToAdd: string[]
  labelsToRemove: string[]
}

/**
 * Parse and validate input parameters from GitHub Actions.
 */
export function parseInputs(
  dependencies: Pick<
    MainDependencies,
    'core' | 'context' | 'stringToArray'
  >
): ActionInputs {
  const {core: coreApi, context, stringToArray} = dependencies
  const coreDependencies = {core: coreApi}
  const token = coreApi.getInput('github_token', {required: true})
  const workflow =
    coreApi.getInput('workflow', {required: false}) || context.workflow
  const checks = coreApi.getInput('checks', {required: true})
  const evaluations = stringToArray(
    coreApi.getInput('evaluations', {required: true}),
    coreDependencies
  )
  const passLabels = stringToArray(
    coreApi.getInput('pass_labels', {required: false}),
    coreDependencies
  )
  const passLabelsCleanup = stringToArray(
    coreApi.getInput('pass_labels_cleanup', {required: false}),
    coreDependencies
  )
  const failLabels = stringToArray(
    coreApi.getInput('fail_labels', {required: false}),
    coreDependencies
  )
  const excludeChecks = stringToArray(
    coreApi.getInput('exclude_checks', {required: false}),
    coreDependencies
  )
  const prNumber =
    coreApi.getInput('pr_number', {required: false}) ||
    context.issue?.number ||
    context.payload?.pull_request?.number

  if (!prNumber) {
    throw new Error('❌ Pull request number not found in context or inputs')
  }

  const inputs: ActionInputs = {
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

  coreApi.debug('📋 Parsed inputs successfully')
  return inputs
}

/**
 * Create and configure the Octokit client.
 */
export function createOctokitClient(token: string): OctokitClient {
  const octokit = github.getOctokit(token, {
    userAgent: `grantbirki/pr-status@${VERSION}`,
    additionalPlugins: [octokitRetry]
  })

  // Octokit accepts string path parameters at runtime, while its declarations
  // require numbers. The action intentionally preserves its existing string
  // input flow through the narrower local interface.
  return octokit as unknown as OctokitClient
}

/**
 * Log the label actions that will be performed.
 */
export function logLabelActions(
  labelsToAdd: string[],
  labelsToRemove: string[],
  coreApi: CoreApi
): void {
  if (labelsToAdd.length > 0) {
    coreApi.info(`🏷️ Labels to add: ${labelsToAdd.join(', ')}`)
  }

  if (labelsToRemove.length > 0) {
    coreApi.info(`🏷️ Labels to remove: ${labelsToRemove.join(', ')}`)
  }

  if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
    coreApi.info('🏷️ No label changes needed')
  }
}

/**
 * Determine labels to add and remove based on the evaluation result.
 */
export function determineLabelActions(
  pass: boolean,
  passLabels: string[],
  failLabels: string[],
  passLabelsCleanup: string[]
): LabelActions {
  if (pass) {
    return {
      labelsToAdd: passLabels,
      labelsToRemove: failLabels.concat(passLabelsCleanup)
    }
  }

  return {
    labelsToAdd: failLabels,
    labelsToRemove: passLabels
  }
}

export const defaultDependencies: MainDependencies = {
  core,
  context: github.context,
  createOctokitClient,
  status: getStatus,
  outputs: setOutputs,
  stringToArray: parseStringToArray,
  label: updateLabels
}

/**
 * Main function that orchestrates the PR status workflow.
 */
export async function run(
  dependencies: MainDependencies = defaultDependencies
): Promise<'success'> {
  const {core: coreApi, context} = dependencies

  try {
    coreApi.info(
      `🚀 ${COLORS.highlight}PR Status Action starting${COLORS.reset}`
    )

    const inputs = parseInputs(dependencies)
    coreApi.info(`🔍 Evaluating PR #${inputs.prNumber}`)

    const octokit = dependencies.createOctokitClient(inputs.token)
    const data: ActionData = {
      checks: inputs.checks,
      prNumber: inputs.prNumber,
      evaluations: inputs.evaluations,
      excludeChecks: inputs.excludeChecks,
      workflow: inputs.workflow
    }

    coreApi.info(
      `🏃 Running status checks on pull request ${COLORS.highlight}${inputs.prNumber}${COLORS.reset}`
    )
    const statusResult = await dependencies.status(
      octokit,
      context,
      inputs.prNumber,
      data,
      {core: coreApi}
    )

    const pass = dependencies.outputs(statusResult, data, {core: coreApi})
    coreApi.info(`📊 Evaluation result: ${pass ? 'PASS ✅' : 'FAIL ❌'}`)

    const {labelsToAdd, labelsToRemove} = determineLabelActions(
      pass,
      inputs.passLabels,
      inputs.failLabels,
      inputs.passLabelsCleanup
    )

    logLabelActions(labelsToAdd, labelsToRemove, coreApi)
    await dependencies.label(
      inputs.prNumber,
      context,
      octokit,
      labelsToAdd,
      labelsToRemove,
      {core: coreApi}
    )

    coreApi.info(
      `✅ ${COLORS.success}PR Status Action completed successfully${COLORS.reset}`
    )
    return 'success'
  } catch (error: unknown) {
    const actionError = error as Error
    coreApi.error(
      `❌ ${COLORS.error}PR Status Action failed: ${actionError.message}${COLORS.reset}`
    )
    coreApi.debug(`🔍 Error details: ${actionError.stack}`)
    coreApi.setFailed(actionError.message)
    throw error
  }
}
