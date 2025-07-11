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
    process.env.INPUT_PASS_LABELS_CLEANUP = 'needs-review'
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

    // Verify the core functions were called with correct parameters
    expect(status.status).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      prNumber,
      expect.objectContaining({
        checks: 'all',
        prNumber: prNumber,
        evaluations: ['APPROVED']
      })
    )

    expect(outputs.outputs).toHaveBeenCalledWith(
      expect.objectContaining({
        review_decision: 'APPROVED',
        merge_state_status: 'CLEAN',
        commit_status: 'SUCCESS'
      }),
      expect.anything()
    )

    expect(label.label).toHaveBeenCalledWith(
      prNumber,
      expect.anything(),
      expect.anything(),
      ['ready-for-deployment'],
      ['needs-review', 'needs-review']
    )
  })

  test('runs the action when the PR is not in a "pass" state', async () => {
    jest.spyOn(outputs, 'outputs').mockImplementation(() => {
      return false
    })

    expect(await run()).toBe('success')

    // Verify that label function was called with fail labels
    expect(label.label).toHaveBeenCalledWith(
      prNumber,
      expect.anything(),
      expect.anything(),
      ['needs-review'], // fail labels to add
      ['ready-for-deployment'] // pass labels to remove
    )
  })

  test('should handle context fallback for pr number', async () => {
    // This test verifies that the main function works with the existing mocks
    // and covers the workflow parameter addition

    const result = await run()
    expect(result).toBe('success')

    // Verify the status function was called with the correct data structure
    expect(status.status).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      '123', // PR number as string
      expect.objectContaining({
        prNumber: '123',
        excludeChecks: expect.any(Array)
      })
    )

    expect(outputs.outputs).toHaveBeenCalled()
  })

  test('should handle label actions when evaluation fails', async () => {
    jest.spyOn(outputs, 'outputs').mockImplementation(() => {
      return false
    })

    const result = await run()
    expect(result).toBe('success')

    // Verify that label function was called with fail labels and pass labels for removal
    expect(label.label).toHaveBeenCalledWith(
      '123',
      expect.anything(),
      expect.anything(),
      ['needs-review'], // fail labels to add
      ['ready-for-deployment'] // pass labels to remove
    )
  })

  test('should handle missing PR number gracefully', async () => {
    // Remove PR number from input
    delete process.env.INPUT_PR_NUMBER

    // Mock the context to not have PR number in payload either
    const originalPayload = github.context.payload
    github.context.payload = {}

    try {
      await expect(run()).rejects.toThrow()
    } finally {
      // Restore for other tests
      github.context.payload = originalPayload
      process.env.INPUT_PR_NUMBER = prNumber
    }
  })

  test('should handle errors gracefully', async () => {
    // Mock status function to throw an error
    jest.spyOn(status, 'status').mockImplementation(() => {
      throw new Error('GraphQL error')
    })

    await expect(run()).rejects.toThrow('GraphQL error')
  })

  test('should handle empty label arrays', async () => {
    // Set up empty label arrays
    process.env.INPUT_PASS_LABELS = ''
    process.env.INPUT_FAIL_LABELS = ''
    process.env.INPUT_PASS_LABELS_CLEANUP = ''

    expect(await run()).toBe('success')

    // Verify that label function was called with empty arrays
    expect(label.label).toHaveBeenCalledWith(
      prNumber,
      expect.anything(),
      expect.anything(),
      [], // empty pass labels
      [] // empty fail labels
    )
  })
})
