// Import the outputs function and mock @actions/core
import {status} from '../../src/functions/status'
jest.mock('@actions/core')

// Get references to the mocked functions
const core = require('@actions/core')

describe('status function', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
  })

  test('should successfully get the status of a PR that is approved, with CI passing, and in a cleanly mergeable state', async () => {
    // const status = {
    //   review_decision: 'APPROVED',
    //   total_approvals: 2,
    //   merge_state_status: 'CLEAN',
    //   commit_status: 'SUCCESS'
    // }
    // const result = await status(status, data)
    // expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('statusResult'))
    // expect(result).toBe(true)
  })
})
