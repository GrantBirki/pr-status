// Import the status function and mock @actions/core
import {status} from '../../src/functions/status'
import * as core from '@actions/core'
import {GitHubContext, ActionData, OctokitClient} from '../../src/types'

// Mock the core module
jest.mock('@actions/core')

const prNumber = 123

let data: ActionData
let context: GitHubContext
let octokit: OctokitClient
let graphQLOK: jest.Mock

describe('status function', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    data = {
      checks: 'all',
      excludeChecks: ['pr-status'],
      workflow: 'test-workflow',
      prNumber: 123,
      evaluations: []
    }

    context = {
      repo: {
        owner: 'corp',
        repo: 'test'
      },
      issue: {
        number: 123
      },
      payload: {
        pull_request: {
          number: 123
        }
      },
      workflow: 'test-workflow'
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
                          conclusion: 'SUCCESS',
                          name: 'test-check'
                        },
                        {
                          isRequired: true,
                          conclusion: 'SKIPPED',
                          name: 'another-check'
                        },
                        {
                          isRequired: false,
                          conclusion: 'SUCCESS',
                          name: 'optional-check'
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
      graphql: graphQLOK,
      rest: {
        issues: {
          listLabelsOnIssue: jest.fn(),
          removeLabel: jest.fn(),
          addLabels: jest.fn()
        }
      }
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
                          conclusion: 'SUCCESS',
                          name: 'test-check'
                        },
                        {
                          isRequired: true,
                          conclusion: 'SKIPPED',
                          name: 'another-check'
                        },
                        {
                          isRequired: false,
                          conclusion: 'FAILURE',
                          name: 'optional-check'
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

  test('should handle PR with no CI checks', async () => {
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
                    totalCount: 0
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: []
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
      commit_status: null
    })
  })

  test('should handle GraphQL errors gracefully', async () => {
    octokit.graphql = jest.fn().mockRejectedValue(new Error('GraphQL error'))

    const result = await status(octokit, context, prNumber, data)

    expect(result.review_decision).toBe(null)
    expect(result.merge_state_status).toBe(null)
    expect(result.total_approvals).toBe(0)
    expect(result.commit_status).toBe(null)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('could not retrieve PR commit status')
    )
  })

  test('should handle required checks with failures', async () => {
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
                          conclusion: 'FAILURE',
                          name: 'test-check'
                        },
                        {
                          isRequired: true,
                          conclusion: 'SKIPPED',
                          name: 'another-check'
                        },
                        {
                          isRequired: false,
                          conclusion: 'SUCCESS',
                          name: 'optional-check'
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

  test('should handle empty checks array after exclusions', async () => {
    data.excludeChecks = ['test-check', 'another-check', 'optional-check']

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
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'test-check'
                        },
                        {
                          isRequired: true,
                          conclusion: 'SKIPPED',
                          name: 'another-check'
                        },
                        {
                          isRequired: false,
                          conclusion: 'SUCCESS',
                          name: 'optional-check'
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
      commit_status: null
    })
  })

  test('should handle StatusContext nodes', async () => {
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
                    state: 'PENDING',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          state: 'SUCCESS',
                          context: 'status-context-check'
                        },
                        {
                          isRequired: false,
                          state: 'PENDING',
                          context: 'another-status-check'
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
      commit_status: 'PENDING'
    })
  })

  test('should handle checks with neutral and skipped statuses', async () => {
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
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'NEUTRAL',
                          name: 'neutral-check'
                        },
                        {
                          isRequired: true,
                          conclusion: 'SKIPPED',
                          name: 'skipped-check'
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

  test('should handle checks with unknown names', async () => {
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
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS'
                          // name is missing
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

    const result = await status(octokit, context, prNumber, data)
    expect(result.commit_status).toBe('SUCCESS')
  })
})
