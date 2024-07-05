import * as core from '@actions/core'
import * as github from '@actions/github'
import {context} from '@actions/github'
import {octokitRetry} from '@octokit/plugin-retry'
import {COLORS} from './functions/colors'
import {status} from './functions/status'
import {outputs} from './functions/outputs'
import {stringToArray} from './functions/string-to-array'
import {label} from './functions/label'

export async function run() {
  try {
    core.debug(`${COLORS.highlight}approve workflow is starting${COLORS.reset}`)

    // for debugging, dump the context object
    core.debug(`context: ${JSON.stringify(context, null, 2)}`)

    // get the inputs
    const token = core.getInput('github_token', {required: true})
    const checks = core.getInput('checks', {required: true})
    const evaluations = stringToArray(
      core.getInput('evaluations', {required: true})
    )
    const passLabels = stringToArray(
      core.getInput('pass_labels', {required: false})
    )
    const failLabels = stringToArray(
      core.getInput('fail_labels', {required: false})
    )
    const prNumber =
      core.getInput('pr_number', {required: false}) ||
      context.issue.number ||
      context.payload.pull_request.number
    if (!prNumber) {
      /* istanbul ignore next */
      throw new Error(
        'pull request number not found in context or inputs, exiting'
      )
    }

    // create an octokit client with the retry plugin
    const octokit = github.getOctokit(token, {
      additionalPlugins: [octokitRetry]
    })

    const data = {
      checks: checks,
      prNumber: prNumber,
      evaluations: evaluations
    }

    // get the status of the pull request
    core.info(
      `🏃 running status checks on pull request ${COLORS.highlight}${prNumber}${COLORS.reset}`
    )
    const statusResult = await status(octokit, context, prNumber, data)

    // set the outputs
    const pass = outputs(statusResult, data)
    core.debug(`pass: ${pass}`)

    // conditionally set the labels to add or remove
    if (pass === true) {
      await label(context, octokit, passLabels, failLabels)
    } else {
      await label(context, octokit, failLabels, passLabels)
    }

    return 'success'
  } catch (error) {
    /* istanbul ignore next */
    core.error(error.stack)
    /* istanbul ignore next */
    core.setFailed(error.message)
  }
}

/* istanbul ignore next */
if (process.env.CI === 'true' && process.env.JEST_TEST !== 'true') {
  run()
}
