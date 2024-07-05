import {run} from '../src/main'
import * as github from '@actions/github'
import * as core from '@actions/core'
// import {COLORS} from '../src/functions/colors'
import * as status from '../src/functions/status'
import * as label from '../src/functions/label'
import * as outputs from '../src/functions/outputs'

// const setOutputMock = jest.spyOn(core, 'setOutput')
// const saveStateMock = jest.spyOn(core, 'saveState')
// const setFailedMock = jest.spyOn(core, 'setFailed')
// const infoMock = jest.spyOn(core, 'info')
// const debugMock = jest.spyOn(core, 'debug')

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
})
