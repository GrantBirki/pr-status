import * as core from '@actions/core'
import * as github from '@actions/github'
import {context} from '@actions/github'
import {octokitRetry} from '@octokit/plugin-retry'
import {COLORS} from './functions/colors'
import {status} from './functions/status'
// import {stringToArray} from './functions/string-to-array'

export async function run() {
  try {
    core.debug(`${COLORS.highlight}approve workflow is starting${COLORS.reset}`)
    const token = core.getInput('github_token', {required: true})
    const checks = core.getInput('checks', {required: true})
    const prNumber = core.getInput('pr_number', {required: true})

    // Create an octokit client with the retry plugin
    const octokit = github.getOctokit(token, {
      additionalPlugins: [octokitRetry]
    })

    // for debugging, dump the context object
    core.debug(`context: ${JSON.stringify(context, null, 2)}`)

    const data = {
      checks: checks
    }

    // Get the status of the pull request
    const statusResult = await status(octokit, context, prNumber, data)

    core.debug(`statusResult: ${JSON.stringify(statusResult, null, 2)}`)

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
