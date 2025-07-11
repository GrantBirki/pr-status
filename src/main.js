import * as core from '@actions/core'
import * as github from '@actions/github'
import {VERSION} from './version'
import {context} from '@actions/github'
import {octokitRetry} from '@octokit/plugin-retry'
import {COLORS} from './functions/colors'
import {status} from './functions/status'
import {outputs} from './functions/outputs'
import {stringToArray} from './functions/string-to-array'
import {label} from './functions/label'

/**
 * Parse and validate input parameters from GitHub Actions
 * @returns {Object} Parsed input parameters
 */
function parseInputs() {
  const inputs = {
    token: core.getInput('github_token', {required: true}),
    workflow: core.getInput('workflow', {required: false}) || context.workflow,
    checks: core.getInput('checks', {required: true}),
    evaluations: stringToArray(core.getInput('evaluations', {required: true})),
    passLabels: stringToArray(core.getInput('pass_labels', {required: false})),
    passLabelsCleanup: stringToArray(
      core.getInput('pass_labels_cleanup', {required: false})
    ),
    failLabels: stringToArray(core.getInput('fail_labels', {required: false})),
    excludeChecks: stringToArray(
      core.getInput('exclude_checks', {required: false})
    ),
    prNumber:
      core.getInput('pr_number', {required: false}) ||
      context.issue?.number ||
      context.payload?.pull_request?.number
  }

  // Validate PR number
  if (!inputs.prNumber) {
    throw new Error('❌ Pull request number not found in context or inputs')
  }

  core.debug(`📋 Parsed inputs: ${JSON.stringify(inputs, null, 2)}`)
  return inputs
}

/**
 * Create and configure the Octokit client
 * @param {string} token - GitHub token for authentication
 * @returns {Object} Configured Octokit client
 */
function createOctokitClient(token) {
  return github.getOctokit(token, {
    userAgent: `grantbirki/pr-status@${VERSION}`,
    additionalPlugins: [octokitRetry]
  })
}

/**
 * Log the label actions that will be performed
 * @param {Array} labelsToAdd - Labels to add
 * @param {Array} labelsToRemove - Labels to remove
 */
function logLabelActions(labelsToAdd, labelsToRemove) {
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

/**
 * Determine labels to add and remove based on evaluation result
 * @param {boolean} pass - Whether the evaluation passed
 * @param {Array} passLabels - Labels to add when passing
 * @param {Array} failLabels - Labels to add when failing
 * @param {Array} passLabelsCleanup - Labels to remove when passing
 * @returns {Object} Object with labelsToAdd and labelsToRemove arrays
 */
function determineLabelActions(
  pass,
  passLabels,
  failLabels,
  passLabelsCleanup
) {
  if (pass) {
    return {
      labelsToAdd: passLabels,
      labelsToRemove: failLabels.concat(passLabelsCleanup)
    }
  } else {
    return {
      labelsToAdd: failLabels,
      labelsToRemove: passLabels
    }
  }
}

/**
 * Main function that orchestrates the PR status workflow
 * @returns {string} 'success' if the workflow completes successfully
 */
export async function run() {
  try {
    core.info(`🚀 ${COLORS.highlight}PR Status Action starting${COLORS.reset}`)

    // Parse and validate inputs
    const inputs = parseInputs()
    core.info(`🔍 Evaluating PR #${inputs.prNumber}`)

    // Create Octokit client
    const octokit = createOctokitClient(inputs.token)

    // Prepare data for status evaluation
    const data = {
      checks: inputs.checks,
      prNumber: inputs.prNumber,
      evaluations: inputs.evaluations,
      excludeChecks: inputs.excludeChecks,
      workflow: inputs.workflow
    }

    // Get PR status information
    core.info(
      `🏃 Running status checks on pull request ${COLORS.highlight}${inputs.prNumber}${COLORS.reset}`
    )
    const statusResult = await status(octokit, context, inputs.prNumber, data)

    // Evaluate the status and set outputs
    const pass = outputs(statusResult, data)
    const passStatus = pass ? '✅ PASS' : '❌ FAIL'
    core.info(`📊 Evaluation result: ${passStatus}`)

    // Determine and apply label changes
    const {labelsToAdd, labelsToRemove} = determineLabelActions(
      pass,
      inputs.passLabels,
      inputs.failLabels,
      inputs.passLabelsCleanup
    )

    logLabelActions(labelsToAdd, labelsToRemove)
    await label(inputs.prNumber, context, octokit, labelsToAdd, labelsToRemove)

    core.info(
      `✅ ${COLORS.success}PR Status Action completed successfully${COLORS.reset}`
    )
    return 'success'
  } catch (error) {
    core.error(
      `❌ ${COLORS.error}PR Status Action failed: ${error.message}${COLORS.reset}`
    )
    core.debug(`🔍 Error details: ${error.stack}`)
    core.setFailed(error.message)
    throw error
  }
}

/* istanbul ignore next */
if (process.env.CI === 'true' && process.env.JEST_TEST !== 'true') {
  run()
}
