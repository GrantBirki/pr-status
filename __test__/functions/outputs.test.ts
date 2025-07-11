// Import the outputs function and mock @actions/core
import {outputs} from '../../src/functions/outputs'
import * as core from '@actions/core'
import {StatusResult, ActionData} from '../../src/types'

// Mock the core module
jest.mock('@actions/core')

describe('outputs function', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
  })

  test('should set outputs correctly for approved and mergeable PR with successful CI', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 2,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['approved', 'mergeable', 'ci_passing'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('review_decision', 'APPROVED')
    expect(core.setOutput).toHaveBeenCalledWith('total_approvals', 2)
    expect(core.setOutput).toHaveBeenCalledWith('merge_state_status', 'CLEAN')
    expect(core.setOutput).toHaveBeenCalledWith('commit_status', 'SUCCESS')
    expect(core.setOutput).toHaveBeenCalledWith('approved', 'true')
    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'PASS')
    expect(result).toBe(true)
  })

  test('should handle PR with no hard approval requirements', () => {
    const status: StatusResult = {
      review_decision: null,
      total_approvals: 0,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['approved'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('approved', 'true')
    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'PASS')
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('PASS'))
  })

  test('should handle PR with failed CI', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'FAILURE'
    }
    const data: ActionData = {
      evaluations: ['approved', 'ci_passing'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('ci_passing')
    )
    expect(result).toBe(false)
  })

  test('should handle PR that is not mergeable', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'DIRTY',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['approved', 'mergeable'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('mergeable')
    )
    expect(result).toBe(false)
  })

  test('should handle min_approvals evaluation', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['min_approvals=2'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('min_approvals')
    )
    expect(result).toBe(false)
  })

  test('should handle min_approvals evaluation with sufficient approvals', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 3,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['min_approvals=2'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'PASS')
    expect(result).toBe(true)
  })

  test('should handle invalid min_approvals format', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['min_approvals=invalid'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('min_approvals')
    )
    expect(result).toBe(false)
  })

  test('should handle unknown evaluation criteria', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['unknown_criteria'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('unknown_criteria')
    )
    expect(result).toBe(false)
  })

  test('should handle empty evaluations array', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: [],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', null)
    expect(result).toBe(true)
  })

  test('should handle null values properly', () => {
    const status: StatusResult = {
      review_decision: null,
      total_approvals: 0,
      merge_state_status: null,
      commit_status: null
    }
    const data: ActionData = {
      evaluations: [],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('review_decision', null)
    expect(core.setOutput).toHaveBeenCalledWith('total_approvals', 0)
    expect(core.setOutput).toHaveBeenCalledWith('merge_state_status', null)
    expect(core.setOutput).toHaveBeenCalledWith('commit_status', null)
    expect(core.setOutput).toHaveBeenCalledWith('approved', 'true')
  })

  test('should handle review_decision with CHANGES_REQUESTED', () => {
    const status: StatusResult = {
      review_decision: 'CHANGES_REQUESTED',
      total_approvals: 0,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['approved'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('approved', 'false')
    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle review_decision with REVIEW_REQUIRED', () => {
    const status: StatusResult = {
      review_decision: 'REVIEW_REQUIRED',
      total_approvals: 0,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['approved'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('approved', 'false')
    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle zero total_approvals but null review_decision', () => {
    const status: StatusResult = {
      review_decision: null,
      total_approvals: 0,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['approved'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('approved', 'true')
    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'PASS')
    expect(result).toBe(true)
  })

  test('should handle merge_state_status with BEHIND', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'BEHIND',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['mergeable'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle merge_state_status with BLOCKED', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'BLOCKED',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['mergeable'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle commit_status with PENDING', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'PENDING'
    }
    const data: ActionData = {
      evaluations: ['ci_passing'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle commit_status with ERROR', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'ERROR'
    }
    const data: ActionData = {
      evaluations: ['ci_passing'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle multiple evaluations with mixed results', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'FAILURE'
    }
    const data: ActionData = {
      evaluations: ['approved', 'mergeable', 'ci_passing'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle min_approvals with equal approvals', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 2,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['min_approvals=2'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'PASS')
    expect(result).toBe(true)
  })

  test('should handle min_approvals with zero required', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 0,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['min_approvals=0'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'PASS')
    expect(result).toBe(true)
  })

  test('should handle min_approvals with malformed format missing equals', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['min_approvals2'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle min_approvals with negative value', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['min_approvals=-1'],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle empty evaluation string', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: [''],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle evaluation with whitespace', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['  approved  '],
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })

  test('should handle case sensitivity in evaluation criteria', () => {
    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data: ActionData = {
      evaluations: ['APPROVED'], // uppercase
      checks: 'all',
      prNumber: 123,
      excludeChecks: [],
      workflow: 'test'
    }

    const result = outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(result).toBe(false)
  })
})
