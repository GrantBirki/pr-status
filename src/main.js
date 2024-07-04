import * as core from '@actions/core'
import * as github from '@actions/github'
import {context} from '@actions/github'
import {octokitRetry} from '@octokit/plugin-retry'
import {COLORS} from './functions/colors'
import {status} from './functions/status'
import {outputs} from './functions/outputs'
import {stringToArray} from './functions/string-to-array'

export async function run() {
  try {
    core.debug(`${COLORS.highlight}approve workflow is starting${COLORS.reset}`)

    // get the inputs
    const token = core.getInput('github_token', {required: true})
    const checks = core.getInput('checks', {required: true})
    const prNumber = core.getInput('pr_number', {required: true})
    const evaluations = stringToArray(
      core.getInput('evaluations', {required: true})
    )

    // create an octokit client with the retry plugin
    const octokit = github.getOctokit(token, {
      additionalPlugins: [octokitRetry]
    })

    // for debugging, dump the context object
    core.debug(`context: ${JSON.stringify(context, null, 2)}`)

    const data = {
      checks: checks,
      prNumber: prNumber,
      evaluations: evaluations
    }

    // get the status of the pull request
    const statusResult = await status(octokit, context, prNumber, data)

    // set the outputs
    outputs(statusResult, data)

    return 'success'
  } catch (error) {
    core.error(error.stack)
    core.setFailed(error.message)
  }
}

/* istanbul ignore next */
if (process.env.CI === 'true' && process.env.JEST_TEST !== 'true') {
  run()
}
