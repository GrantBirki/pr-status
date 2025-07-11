import * as core from '@actions/core'
import * as github from '@actions/github'
import {VERSION} from './version'
import {context} from '@actions/github'
import {retry} from '@octokit/plugin-retry'
import {COLORS} from './functions/colors'
import {status} from './functions/status'
import {outputs} from './functions/outputs'
import {stringToArray} from './functions/string-to-array'
import {label} from './functions/label'
import {
  GitHubContext,
  ActionData,
  StatusResult,
  LabelActions,
  OctokitClient
} from './types'

/**
 * Determine labels to add and remove based on evaluation result
 * @param pass - Whether the evaluation passed
 * @param passLabels - Labels to add when passing
 * @param failLabels - Labels to add when failing
 * @param passLabelsCleanup - Labels to remove when passing
 * @returns Object with labelsToAdd and labelsToRemove arrays
 */
function determineLabelActions(
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
  } else {
    return {
      labelsToAdd: failLabels,
      labelsToRemove: passLabels
    }
  }
}

export async function run(): Promise<string> {
  try {
    core.info(`${COLORS.highlight}approve workflow is starting${COLORS.reset}`)

    // for debugging, dump the context object
    core.debug(`context: ${JSON.stringify(context, null, 2)}`)

    // get the inputs
    const token: string = core.getInput('github_token', {required: true})
    const workflow: string =
      core.getInput('workflow', {required: false}) || context.workflow
    const checks: string = core.getInput('checks', {required: true})
    const evaluations: string[] = stringToArray(
      core.getInput('evaluations', {required: true})
    )
    const passLabels: string[] = stringToArray(
      core.getInput('pass_labels', {required: false})
    )
    const passLabelsCleanup: string[] = stringToArray(
      core.getInput('pass_labels_cleanup', {required: false})
    )
    const failLabels: string[] = stringToArray(
      core.getInput('fail_labels', {required: false})
    )
    const excludeChecks: string[] = stringToArray(
      core.getInput('exclude_checks', {required: false})
    )
    const prNumberInput: string = core.getInput('pr_number', {required: false})
    const prNumber: number = parseInt(
      prNumberInput ||
        String(context.issue.number) ||
        String(context.payload.pull_request?.number || 0)
    )

    if (!prNumber || prNumber === 0) {
      /* istanbul ignore next */
      throw new Error(
        'pull request number not found in context or inputs, exiting'
      )
    }

    // create an octokit client with the retry plugin
    const octokit = github.getOctokit(token, {
      userAgent: `grantbirki/pr-status@${VERSION}`,
      additionalPlugins: [retry]
    }) as OctokitClient

    const data: ActionData = {
      checks: checks,
      prNumber: prNumber,
      evaluations: evaluations,
      excludeChecks: excludeChecks,
      workflow: workflow
    }

    // get the status of the pull request
    core.info(
      `🏃 running status checks on pull request ${COLORS.highlight}${prNumber}${COLORS.reset}`
    )
    const statusResult: StatusResult = await status(
      octokit,
      context as GitHubContext,
      prNumber,
      data
    )

    // set the outputs
    const pass: boolean = outputs(statusResult, data)
    core.info(`pass: ${pass}`)

    // determine labels to add and remove based on evaluation result
    const {labelsToAdd, labelsToRemove}: LabelActions = determineLabelActions(
      pass,
      passLabels,
      failLabels,
      passLabelsCleanup
    )

    core.info(`labelsToAdd: ${labelsToAdd}`)
    core.info(`labelsToAdd isArray: ${Array.isArray(labelsToAdd)}`)
    core.info(`labelsToRemove isArray: ${Array.isArray(labelsToRemove)}`)
    core.info(`labelsToRemove: ${labelsToRemove}`)

    await label(
      prNumber,
      context as GitHubContext,
      octokit,
      labelsToAdd,
      labelsToRemove
    )

    return 'success'
  } catch (error) {
    /* istanbul ignore next */
    core.error((error as Error).stack || (error as Error).message)
    /* istanbul ignore next */
    core.setFailed((error as Error).message)
    /* istanbul ignore next */
    return 'failure'
  }
}

/* istanbul ignore next */
if (process.env['CI'] === 'true' && process.env['JEST_TEST'] !== 'true') {
  run()
}
