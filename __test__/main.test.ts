import { run } from '../src/main'
import * as github from '@actions/github'
import * as core from '@actions/core'
import { COLORS } from '../src/functions/colors'
import * as status from '../src/functions/status'
import * as label from '../src/functions/label'
import * as outputs from '../src/functions/outputs'

// Mock the required modules
jest.mock('@actions/core')
jest.mock('@actions/github')

const infoMock = jest.spyOn(core, 'info')
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
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      const inputs: { [key: string]: string } = {
        github_token: 'faketoken',
        checks: 'all',
        pr_number: prNumber,
        evaluations: 'APPROVED',
        pass_labels: 'ready-for-deployment',
        pass_labels_cleanup: 'needs-review',
        fail_labels: 'needs-review',
        workflow: 'test-workflow',
        exclude_checks: ''
      }
      return inputs[name] || ''
    })

    // Mock github context
    Object.defineProperty(github, 'context', {
      value: {
        payload: {
          issue: {
            number: 123
          }
        },
        repo: {
          owner: 'test',
          repo: 'test'
        },
        issue: {
          number: 123
        },
        workflow: 'test-workflow'
      },
      writable: true
    })

    jest.spyOn(github, 'getOctokit').mockImplementation(() => {
      return {} as any
    })
    
    jest.spyOn(status, 'status').mockImplementation(() => {
      return Promise.resolve({
        review_decision: 'APPROVED',
        merge_state_status: 'CLEAN',
        commit_status: 'SUCCESS',
        total_approvals: 1
      })
    })

    jest.spyOn(label, 'label').mockImplementation(() => {
      return Promise.resolve({
        added: [],
        removed: []
      })
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
    expect(infoMock).toHaveBeenCalledWith(`pass: true`)
    expect(infoMock).toHaveBeenCalledWith(`labelsToAdd: ready-for-deployment`)
    expect(infoMock).toHaveBeenCalledWith(`labelsToAdd isArray: true`)
    expect(infoMock).toHaveBeenCalledWith(
      `labelsToRemove: needs-review,needs-review`
    )
    expect(infoMock).toHaveBeenCalledWith(`labelsToRemove isArray: true`)
  })

  test('runs the action when the PR is not in a "pass" state', async () => {
    jest.spyOn(outputs, 'outputs').mockImplementation(() => {
      return false
    })

    expect(await run()).toBe('success')
    expect(infoMock).toHaveBeenCalledWith(`pass: false`)
    expect(infoMock).toHaveBeenCalledWith(`labelsToAdd: needs-review`)
    expect(infoMock).toHaveBeenCalledWith(
      `labelsToRemove: ready-for-deployment`
    )
  })

  test('successfully runs the action with different inputs', async () => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      const inputs: { [key: string]: string } = {
        github_token: 'faketoken',
        checks: 'required',
        pr_number: prNumber,
        evaluations: 'approved,mergeable',
        pass_labels: 'ready-to-merge',
        pass_labels_cleanup: 'waiting-for-review',
        fail_labels: 'needs-work',
        workflow: 'ci',
        exclude_checks: 'code-scanning'
      }
      return inputs[name] || ''
    })

    expect(await run()).toBe('success')
    expect(infoMock).toHaveBeenCalledWith(
      `🏃 running status checks on pull request ${COLORS.highlight}${prNumber}${COLORS.reset}`
    )
  })
})