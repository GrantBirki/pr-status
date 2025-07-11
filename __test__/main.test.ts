import {run} from '../src/main'
import * as github from '@actions/github'
import * as core from '@actions/core'
import {COLORS} from '../src/functions/colors'
import * as status from '../src/functions/status'
import * as label from '../src/functions/label'
import * as outputs from '../src/functions/outputs'

// Mock the required modules
jest.mock('@actions/core')
jest.mock('@actions/github')

const infoMock = jest.spyOn(core, 'info')
const errorMock = jest.spyOn(core, 'error')
const setFailedMock = jest.spyOn(core, 'setFailed')
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
      const inputs: {[key: string]: string} = {
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
      const inputs: {[key: string]: string} = {
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

  test('runs action with pr_number from context when input is empty', async () => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      const inputs: {[key: string]: string} = {
        github_token: 'faketoken',
        checks: 'all',
        pr_number: '', // Empty PR number
        evaluations: 'approved',
        pass_labels: '',
        pass_labels_cleanup: '',
        fail_labels: '',
        workflow: 'test-workflow',
        exclude_checks: ''
      }
      return inputs[name] || ''
    })

    expect(await run()).toBe('success')
    expect(infoMock).toHaveBeenCalledWith(
      `🏃 running status checks on pull request ${COLORS.highlight}123${COLORS.reset}`
    )
  })

  test('runs action with pr_number from payload when context issue number is missing', async () => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      const inputs: {[key: string]: string} = {
        github_token: 'faketoken',
        checks: 'all',
        pr_number: '',
        evaluations: 'approved',
        pass_labels: '',
        pass_labels_cleanup: '',
        fail_labels: '',
        workflow: 'test-workflow',
        exclude_checks: ''
      }
      return inputs[name] || ''
    })

    // Mock github context without issue number but with payload
    Object.defineProperty(github, 'context', {
      value: {
        payload: {
          pull_request: {
            number: 456
          }
        },
        repo: {
          owner: 'test',
          repo: 'test'
        },
        issue: {
          number: 456 // This should be the same as payload
        },
        workflow: 'test-workflow'
      },
      writable: true
    })

    expect(await run()).toBe('success')
    expect(infoMock).toHaveBeenCalledWith(
      `🏃 running status checks on pull request ${COLORS.highlight}456${COLORS.reset}`
    )
  })

  test('handles error when PR number is not found', async () => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      const inputs: {[key: string]: string} = {
        github_token: 'faketoken',
        checks: 'all',
        pr_number: '',
        evaluations: 'approved',
        pass_labels: '',
        pass_labels_cleanup: '',
        fail_labels: '',
        workflow: 'test-workflow',
        exclude_checks: ''
      }
      return inputs[name] || ''
    })

    // Mock github context without any PR number
    Object.defineProperty(github, 'context', {
      value: {
        payload: {},
        repo: {
          owner: 'test',
          repo: 'test'
        },
        issue: {
          number: 0
        },
        workflow: 'test-workflow'
      },
      writable: true
    })

    expect(await run()).toBe('failure')
    expect(setFailedMock).toHaveBeenCalledWith(
      'pull request number not found in context or inputs, exiting'
    )
  })

  test('handles errors in the action gracefully', async () => {
    jest.spyOn(status, 'status').mockImplementation(() => {
      throw new Error('Test error')
    })

    expect(await run()).toBe('failure')
    expect(errorMock).toHaveBeenCalled()
    expect(setFailedMock).toHaveBeenCalledWith('Test error')
  })

  test('handles errors without stack trace', async () => {
    jest.spyOn(status, 'status').mockImplementation(() => {
      const error = new Error('Test error')
      error.stack = undefined
      throw error
    })

    expect(await run()).toBe('failure')
    expect(errorMock).toHaveBeenCalledWith('Test error')
    expect(setFailedMock).toHaveBeenCalledWith('Test error')
  })

  test('uses default workflow when not provided', async () => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      const inputs: {[key: string]: string} = {
        github_token: 'faketoken',
        checks: 'all',
        pr_number: prNumber,
        evaluations: 'approved',
        pass_labels: '',
        pass_labels_cleanup: '',
        fail_labels: '',
        workflow: '', // Empty workflow
        exclude_checks: ''
      }
      return inputs[name] || ''
    })

    await run()
    expect(status.status).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        workflow: 'test-workflow' // Should use context workflow
      })
    )
  })
})
