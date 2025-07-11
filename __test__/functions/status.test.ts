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

  test('should handle empty commit nodes', async () => {
    octokit.graphql = jest.fn().mockReturnValue({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'CLEAN',
          reviews: {
            totalCount: 1
          },
          commits: {
            nodes: []
          }
        }
      }
    })

    const result = await status(octokit, context, prNumber, data)
    expect(result.commit_status).toBe(null)
  })

  test('should handle null commit in nodes', async () => {
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
                commit: null
              }
            ]
          }
        }
      }
    })

    const result = await status(octokit, context, prNumber, data)
    expect(result.commit_status).toBe(null)
  })

  test('should handle null statusCheckRollup', async () => {
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
                  statusCheckRollup: null
                }
              }
            ]
          }
        }
      }
    })

    const result = await status(octokit, context, prNumber, data)
    expect(result.commit_status).toBe(null)
  })

  test('should handle null contexts in statusCheckRollup', async () => {
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
                    contexts: null
                  }
                }
              }
            ]
          }
        }
      }
    })

    const result = await status(octokit, context, prNumber, data)
    expect(result.commit_status).toBe(null)
  })

  test('should handle null nodes in contexts', async () => {
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
                      nodes: null
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
    expect(result.commit_status).toBe(null)
  })

  test('should handle check exclusions with all checks', async () => {
    data.checks = 'all'
    data.excludeChecks = ['test-check']

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
                          conclusion: 'SUCCESS',
                          name: 'another-check'
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
    expect(result.commit_status).toBe('SUCCESS') // Only 'another-check' should be considered
  })

  test('should handle checks with IN_PROGRESS status', async () => {
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
                          conclusion: 'IN_PROGRESS',
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
    expect(result.commit_status).toBe('PENDING')
  })

  test('should handle checks with QUEUED status', async () => {
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
                          conclusion: 'QUEUED',
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
    expect(result.commit_status).toBe('PENDING')
  })

  test('should handle checks with REQUESTED status', async () => {
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
                          conclusion: 'REQUESTED',
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
    expect(result.commit_status).toBe('PENDING')
  })

  test('should handle checks with WAITING status', async () => {
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
                          conclusion: 'WAITING',
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
    expect(result.commit_status).toBe('PENDING')
  })

  test('should handle checks with CANCELLED status', async () => {
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
                          conclusion: 'CANCELLED',
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
    expect(result.commit_status).toBe('FAILURE')
  })

  test('should handle checks with TIMED_OUT status', async () => {
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
                          conclusion: 'TIMED_OUT',
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
    expect(result.commit_status).toBe('FAILURE')
  })

  test('should handle checks with ACTION_REQUIRED status', async () => {
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
                          conclusion: 'ACTION_REQUIRED',
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
    expect(result.commit_status).toBe('FAILURE')
  })

  test('should handle checks with STALE status', async () => {
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
                          conclusion: 'STALE',
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
    expect(result.commit_status).toBe('FAILURE')
  })

  test('should handle unknown check status', async () => {
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
                    state: 'UNKNOWN',
                    contexts: {
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'UNKNOWN_STATUS',
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
    expect(result.commit_status).toBe('UNKNOWN') // Should fall back to overall state
  })

  test('should handle different review totalCount values', async () => {
    octokit.graphql = jest.fn().mockReturnValue({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'CLEAN',
          reviews: {
            totalCount: 5 // Different count
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

    const result = await status(octokit, context, prNumber, data)
    expect(result.total_approvals).toBe(5)
  })

  test('should handle zero review totalCount', async () => {
    octokit.graphql = jest.fn().mockReturnValue({
      repository: {
        pullRequest: {
          reviewDecision: null,
          mergeStateStatus: 'CLEAN',
          reviews: {
            totalCount: 0
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

    const result = await status(octokit, context, prNumber, data)
    expect(result.total_approvals).toBe(0)
  })

  test('should handle various mergeStateStatus values', async () => {
    const testCases = [
      'DIRTY',
      'UNSTABLE',
      'BLOCKED',
      'BEHIND',
      'DRAFT',
      'UNKNOWN'
    ]

    for (const mergeState of testCases) {
      octokit.graphql = jest.fn().mockReturnValue({
        repository: {
          pullRequest: {
            reviewDecision: 'APPROVED',
            mergeStateStatus: mergeState,
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

      const result = await status(octokit, context, prNumber, data)
      expect(result.merge_state_status).toBe(mergeState)
    }
  })
})
