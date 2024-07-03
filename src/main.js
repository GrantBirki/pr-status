import * as core from '@actions/core'
import * as github from '@actions/github'
import {context} from '@actions/github'
import {octokitRetry} from '@octokit/plugin-retry'
import {COLORS} from './functions/colors'
import {stringToArray} from './functions/string-to-array'

export async function run() {
  try {
    core.debug(`${COLORS.highlight}approve workflow is starting${COLORS.reset}`)
    // Get the inputs for the branch-deploy Action
    const token = core.getInput('github_token', {required: true})

    // Create an octokit client with the retry plugin
    const octokit = github.getOctokit(token, {
      additionalPlugins: [octokitRetry]
    })

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
