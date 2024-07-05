// Import the outputs function and mock @actions/core
import {status} from '../../src/functions/status'
jest.mock('@actions/core')

// Get references to the mocked functions
const core = require('@actions/core')

const prNumber = 123

var data
var context
var octokit
var graphQLOK

describe('status function', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    data = {
      checks: 'all'
    }

    context = {
      actor: 'monalisa',
      repo: {
        owner: 'corp',
        repo: 'test'
      },
      issue: {
        number: 123
      }
    }

    graphQLOK = jest.fn().mockReturnValue({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'CLEAN',
          reviews: {
            totalCount: 1
          },
          commits: {
            nodes: [
              {
                commit: {
                  checkSuites: {
                    totalCount: 3
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS'
                        },
                        {
                          isRequired: true,
                          conclusion: 'SKIPPED'
                        },
                        {
                          isRequired: false,
                          conclusion: 'SUCCESS'
                        }
                      ]
                    }
                  }
                }
              }
            ]
          }
        }
      }
    })

    octokit = {
      graphql: graphQLOK
    }
  })

  test('should successfully get the status of a PR that is approved, with CI passing, and in a cleanly mergeable state', async () => {
    expect(await status(octokit, context, prNumber, data)).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS'
    })

    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('statusResult:')
    )
  })

  test('should successfully get the status of a PR that is approved and in a cleanly mergeable state but only required CI checks are evaluated', async () => {
    data.checks = 'required'

    octokit.graphql = jest.fn().mockReturnValue({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'CLEAN',
          reviews: {
            totalCount: 1
          },
          commits: {
            nodes: [
              {
                commit: {
                  checkSuites: {
                    totalCount: 3
                  },
                  statusCheckRollup: {
                    state: 'FAILURE',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS'
                        },
                        {
                          isRequired: true,
                          conclusion: 'SKIPPED'
                        },
                        {
                          isRequired: false,
                          conclusion: 'FAILURE'
                        }
                      ]
                    }
                  }
                }
              }
            ]
          }
        }
      }
    })

    expect(await status(octokit, context, prNumber, data)).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS'
    })
  })

  test('should successfully get the status of a PR that is approved and in a cleanly mergeable state but only required CI checks are evaluated but the required CI checks are failing', async () => {
    data.checks = 'required'

    octokit.graphql = jest.fn().mockReturnValue({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'BLOCKED',
          reviews: {
            totalCount: 1
          },
          commits: {
            nodes: [
              {
                commit: {
                  checkSuites: {
                    totalCount: 3
                  },
                  statusCheckRollup: {
                    state: 'FAILURE',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'FAILURE'
                        },
                        {
                          isRequired: true,
                          conclusion: 'SKIPPED'
                        },
                        {
                          isRequired: false,
                          conclusion: 'SUCCESS'
                        }
                      ]
                    }
                  }
                }
              }
            ]
          }
        }
      }
    })

    expect(await status(octokit, context, prNumber, data)).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'BLOCKED',
      total_approvals: 1,
      commit_status: 'FAILURE'
    })
  })
})
