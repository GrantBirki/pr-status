import {run} from '../src/main'
import * as github from '@actions/github'
import * as core from '@actions/core'
import {COLORS} from '../src/functions/colors'
import * as status from '../src/functions/status'
import * as label from '../src/functions/label'
import * as outputs from '../src/functions/outputs'

// const setOutputMock = jest.spyOn(core, 'setOutput')
// const saveStateMock = jest.spyOn(core, 'saveState')
// const setFailedMock = jest.spyOn(core, 'setFailed')
const infoMock = jest.spyOn(core, 'info')
const debugMock = jest.spyOn(core, 'debug')

const prNumber = '123'

describe('main', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(core, 'setOutput').mockImplementation(() => {})
    jest.spyOn(core, 'setFailed').mockImplementation(() => {})
    jest.spyOn(core, 'saveState').mockImplementation(() => {})
    jest.spyOn(core, 'info').mockImplementation(() => {})
    jest.spyOn(core, 'debug').mockImplementation(() => {})
    jest.spyOn(core, 'warning').mockImplementation(() => {})
    jest.spyOn(core, 'error').mockImplementation(() => {})
    process.env.INPUT_GITHUB_TOKEN = 'faketoken'
    process.env.INPUT_CHECKS = 'all'
    process.env.INPUT_PR_NUMBER = prNumber
    process.env.INPUT_EVALUATIONS = 'APPROVED'
    process.env.INPUT_PASS_LABELS = 'ready-for-deployment'
    process.env.INPUT_FAIL_LABELS = 'needs-review'

    github.context.payload = {
      issue: {
        number: 123
      }
    }

    jest.spyOn(github, 'getOctokit').mockImplementation(() => {
      return {}
    })
    jest.spyOn(status, 'status').mockImplementation(() => {
      return {
        review_decision: 'APPROVED',
        merge_state_status: 'CLEAN',
        commit_status: 'SUCCESS',
        total_approvals: 1
      }
    })

    jest.spyOn(label, 'label').mockImplementation(() => {
      return true
    })

    jest.spyOn(outputs, 'outputs').mockImplementation(() => {
      return true
    })
  })

  test('successfully runs the action', async () => {
    expect(await run()).toBe('success')
    expect(infoMock).toHaveBeenCalledWith(
      `🏃 running status checks on pull request ${COLORS.highlight}${prNumber}${COLORS.reset}`
    )
    expect(debugMock).toHaveBeenCalledWith(`pass: true`)
  })

  test('runs the action when the PR is not in a "pass" state', async () => {
    jest.spyOn(outputs, 'outputs').mockImplementation(() => {
      return false
    })

    expect(await run()).toBe('success')
    expect(infoMock).toHaveBeenCalledWith(
      `🏃 running status checks on pull request ${COLORS.highlight}${prNumber}${COLORS.reset}`
    )
    expect(debugMock).toHaveBeenCalledWith(`pass: false`)
  })
})
