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
      checks: 'all',
      excludeChecks: ['pr-status'],
      workflow: 'test-workflow'
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
      expect.stringContaining('Status result:')
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

  test('should successfully get the status of a PR that has no defined approvals or CI checks', async () => {
    octokit.graphql = jest.fn().mockReturnValue({
      repository: {
        pullRequest: {
          reviewDecision: null,
          commits: {
            nodes: [
              {
                commit: {
                  checkSuites: {
                    totalCount: 0
                  },
                  statusCheckRollup: null
                }
              }
            ]
          }
        }
      }
    })

    expect(await status(octokit, context, prNumber, data)).toStrictEqual({
      review_decision: null,
      merge_state_status: null,
      total_approvals: null,
      commit_status: null
    })
  })

  test('should successfully get the status of a PR that has no defined CI checks but has approvals', async () => {
    octokit.graphql = jest.fn().mockReturnValueOnce({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'CLEAN',
          reviews: {
            totalCount: 1
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

  test('should exclude specified checks from status evaluation', async () => {
    data.excludeChecks = ['pr-status', 'test-check']

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
                          conclusion: 'FAILURE',
                          name: 'pr-status' // This should be excluded
                        },
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
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

    const result = await status(octokit, context, prNumber, data)

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS' // Should be SUCCESS because pr-status check was excluded
    })

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'Excluding check from status evaluation: pr-status'
      )
    )
  })

  test('should handle when all checks are filtered out in "all" mode', async () => {
    data.excludeChecks = ['test-check', 'another-check', 'optional-check']
    data.workflow = 'test-workflow'

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
                          name: 'test-check' // This will be excluded
                        },
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'another-check' // This will be excluded
                        },
                        {
                          isRequired: false,
                          conclusion: 'SUCCESS',
                          name: 'optional-check' // This will be excluded
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: null // Should be null because all checks were filtered out
    })

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'No CI checks found after filtering out excluded checks'
      )
    )
  })

  test('should handle mixed success/failure checks in "all" mode when some excluded', async () => {
    data.excludeChecks = ['pr-status']
    data.workflow = 'test-workflow'

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
                          name: 'passing-check'
                        },
                        {
                          isRequired: true,
                          conclusion: 'FAILURE',
                          name: 'failing-check'
                        },
                        {
                          isRequired: false,
                          conclusion: 'PENDING',
                          name: 'pr-status' // This will be excluded
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'FAILURE' // Should use overall state since not all checks pass
    })
  })

  test('should handle empty excludeChecks and workflow parameters', async () => {
    data.excludeChecks = []
    data.workflow = null

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
                    totalCount: 1
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'test-check'
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS'
    })

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('pr-status') // Should use fallback workflow name
    )
  })

  test('should handle StatusContext nodes (not just CheckRun)', async () => {
    data.excludeChecks = ['pr-status/check'] // Use exact name to match
    data.workflow = 'test-workflow'

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
                    totalCount: 2
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          state: 'SUCCESS',
                          context: 'continuous-integration/travis-ci' // StatusContext type
                        },
                        {
                          isRequired: false,
                          state: 'PENDING',
                          context: 'pr-status/check' // This should be excluded
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS'
    })

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'Excluding check from status evaluation: pr-status/check'
      )
    )
  })

  test('should use exact matching and not match substrings', async () => {
    data.excludeChecks = ['test'] // This should NOT match 'test foo' or 'test bar'
    data.workflow = 'ci-workflow'

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
                    totalCount: 4
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'test' // This should be excluded (exact match)
                        },
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'test foo' // This should NOT be excluded (not exact match)
                        },
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'test bar' // This should NOT be excluded (not exact match)
                        },
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'ci-workflow' // This should be excluded (matches workflow)
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS' // Should be SUCCESS because 'test foo' and 'test bar' are still passing
    })

    // Should exclude 'test' exactly but not 'test foo' or 'test bar'
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Excluding check from status evaluation: test')
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'Excluding check from status evaluation: ci-workflow'
      )
    )

    // Should evaluate 2 checks after exclusions (test foo and test bar)
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Evaluating 2 total checks (after exclusions)')
    )
  })

  test('should handle case when no checks are present', async () => {
    data.excludeChecks = []
    data.workflow = 'test-workflow'

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
                    totalCount: 1
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [] // No checks present
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: null // Should be null when no checks found
    })

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('No CI checks found on this pull request')
    )
  })

  test('should handle case when no required checks remain after filtering', async () => {
    data.checks = 'required'
    data.excludeChecks = ['test-check']
    data.workflow = 'test-workflow'

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
                    totalCount: 1
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'test-check' // This will be filtered out
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS' // Should be SUCCESS when no required checks remain
    })

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('No required checks found after filtering')
    )
  })

  test('should handle checks with Unknown name gracefully', async () => {
    data.excludeChecks = ['unknown-check']
    data.workflow = 'test-workflow'

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
                    totalCount: 1
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS'
                          // No name or context property - should result in 'Unknown'
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS'
    })

    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Check with unknown name found, including in evaluation'
      )
    )
  })

  test('should handle when no exclude patterns are provided', async () => {
    // Test the edge case where excludePatterns is empty/null
    data.excludeChecks = null
    data.workflow = null

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
                    totalCount: 1
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'test-check'
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS'
    })

    // Should still include the fallback workflow name
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('pr-status'))
  })

  test('should handle checks with UNKNOWN status and provide debug info', async () => {
    data.excludeChecks = []
    data.workflow = 'test-workflow'

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
                    totalCount: 1
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: null,
                          status: null,
                          state: null,
                          name: 'unknown-check'
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

    expect(result).toStrictEqual({
      review_decision: 'APPROVED',
      merge_state_status: 'CLEAN',
      total_approvals: 1,
      commit_status: 'SUCCESS' // Should use overall state since check is UNKNOWN
    })

    // Should log debug info about the UNKNOWN check
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('Check status is UNKNOWN for check:')
    )
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('Available fields:')
    )
  })

  test('should use new logging format with "check:" prefix and "- state:" suffix', async () => {
    data.excludeChecks = []
    data.workflow = 'test-workflow'

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
                    totalCount: 2
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'required-check'
                        },
                        {
                          isRequired: false,
                          conclusion: 'PENDING',
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

    await status(octokit, context, prNumber, data)

    // Should use the new logging format
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining(
        '  - check: required-check (required) - state: SUCCESS'
      )
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining(
        '  - check: optional-check (optional) - state: PENDING'
      )
    )
  })

  test('should handle CheckRun status field when conclusion is not available', async () => {
    data.excludeChecks = []
    data.workflow = 'test-workflow'

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
                    totalCount: 1
                  },
                  statusCheckRollup: {
                    state: 'SUCCESS',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: null,
                          status: 'IN_PROGRESS',
                          name: 'in-progress-check'
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

    await status(octokit, context, prNumber, data)

    // Should use the status field when conclusion is not available
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining(
        '  - check: in-progress-check (required) - state: IN_PROGRESS'
      )
    )
  })

  test('should handle GraphQL errors gracefully', async () => {
    data.excludeChecks = []
    data.workflow = 'test-workflow'

    const graphqlError = new Error('GraphQL query failed')
    octokit.graphql = jest.fn().mockRejectedValue(graphqlError)

    await expect(status(octokit, context, prNumber, data)).rejects.toThrow(
      'GraphQL query failed'
    )

    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch PR status')
    )
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('Error details:')
    )
  })
})
