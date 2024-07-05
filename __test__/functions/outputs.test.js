// Import the outputs function and mock @actions/core
import {outputs} from '../../src/functions/outputs'
jest.mock('@actions/core')

// Get references to the mocked functions
const core = require('@actions/core')

describe('outputs function', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
  })

  test('should set outputs correctly for approved and mergeable PR with successful CI', () => {
    const status = {
      review_decision: 'APPROVED',
      total_approvals: 2,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data = {
      evaluations: ['approved', 'mergeable', 'ci_passing']
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
    const status = {
      review_decision: null,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data = {
      evaluations: ['approved']
    }

    outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('approved', 'true')
    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'PASS')
    expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('PASS'))
  })

  test('should handle PR not cleanly mergeable', () => {
    const status = {
      review_decision: 'APPROVED',
      merge_state_status: 'DIRTY',
      commit_status: 'SUCCESS'
    }
    const data = {
      evaluations: ['mergeable']
    }

    outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('PR is not cleanly mergeable')
    )
  })

  test('should handle CI not passing', () => {
    const status = {
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      commit_status: 'FAILURE'
    }
    const data = {
      evaluations: ['ci_passing']
    }

    outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('commit status is not successful')
    )
  })

  test('should handle PRs where changes have been requested', () => {
    const status = {
      review_decision: 'CHANGES_REQUESTED',
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data = {
      evaluations: ['approved']
    }

    outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('approved', 'false')
    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('PR is not approved')
    )
  })

  test('should handle situations where no evaluations are provided', () => {
    const status = {
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data = {
      evaluations: []
    }

    outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'PASS')
    expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('PASS'))
  })

  test('should handle unknown evaluation criteria', () => {
    const status = {
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }
    const data = {
      evaluations: ['unknown_criteria']
    }

    outputs(status, data)

    expect(core.setOutput).toHaveBeenCalledWith('evaluation', 'FAIL')
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('unknown evaluation criteria')
    )
  })
})
