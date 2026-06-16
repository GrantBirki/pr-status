import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createGitHubClient,
  type FetchImplementation,
  type GitHubCheck,
  type GitHubReview
} from '../src/github.ts'

const TOKEN = 'github_pat_synthetic_test_token'
const request = {owner: 'octocat', repo: 'example', number: 42} as const

interface FetchCall {
  url: string
  init: RequestInit
}

type FetchStep = (call: FetchCall) => Response | Promise<Response>

function jsonResponse(
  value: unknown,
  status = 200,
  headers?: HeadersInit
): Response {
  return new Response(JSON.stringify(value), {
    status,
    ...(headers === undefined ? {} : {headers})
  })
}

function textResponse(
  value: string,
  status: number,
  headers?: HeadersInit
): Response {
  return new Response(value, {
    status,
    ...(headers === undefined ? {} : {headers})
  })
}

function createSequenceFetch(steps: FetchStep[]): {
  fetch: FetchImplementation
  calls: FetchCall[]
} {
  const calls: FetchCall[] = []
  const fetch: FetchImplementation = async (input, init = {}) => {
    const call = {url: String(input), init}
    calls.push(call)
    const step = steps.shift()
    assert.ok(step, `unexpected fetch call to ${call.url}`)
    return step(call)
  }
  return {fetch, calls}
}

interface ConnectionOptions<T> {
  nodes?: T[]
  hasNextPage?: boolean
  endCursor?: string | null
}

interface PullPageOptions {
  state?: 'OPEN' | 'CLOSED' | 'MERGED'
  headRefOid?: string
  checks?: ConnectionOptions<GitHubCheck> | null
  reviews?: ConnectionOptions<GitHubReview>
  reviewDecision?: string | null
  mergeStateStatus?: string
  mergeable?: string
  isDraft?: boolean
  errors?: unknown[]
}

function connection<T>(options: ConnectionOptions<T> = {}): {
  nodes: T[]
  pageInfo: {hasNextPage: boolean; endCursor: string | null}
} {
  return {
    nodes: options.nodes ?? [],
    pageInfo: {
      hasNextPage: options.hasNextPage ?? false,
      endCursor: options.endCursor ?? null
    }
  }
}

function pullPage(options: PullPageOptions = {}): unknown {
  const pullRequest: Record<string, unknown> = {
    state: options.state ?? 'OPEN',
    headRefOid: options.headRefOid ?? 'abc123',
    reviewDecision: options.reviewDecision ?? null,
    mergeStateStatus: options.mergeStateStatus ?? 'CLEAN',
    mergeable: options.mergeable ?? 'MERGEABLE',
    isDraft: options.isDraft ?? false
  }

  if (options.checks !== undefined) {
    pullRequest.commits = {
      nodes: [
        {
          commit: {
            statusCheckRollup:
              options.checks === null
                ? null
                : {contexts: connection(options.checks)}
          }
        }
      ]
    }
  }

  if (options.reviews !== undefined) {
    pullRequest.latestReviews = connection(options.reviews)
  }

  const result: Record<string, unknown> = {
    data: {repository: {pullRequest}}
  }
  if (options.errors !== undefined) {
    result.errors = options.errors
  }
  return result
}

function completePullPage(options: PullPageOptions = {}): unknown {
  return pullPage({checks: {}, reviews: {}, ...options})
}

function createClient(
  fetch: FetchImplementation,
  sleep: (milliseconds: number) => Promise<void> = async () => {}
) {
  return createGitHubClient(TOKEN, {fetch, sleep})
}

function responseForLabels(
  labels: string[],
  status = 200,
  headers?: HeadersInit
): Response {
  return jsonResponse(labels.map(name => ({name})), status, headers)
}

test('uses GitHub.com endpoints, protocol headers, a versioned user agent, and the native fetch default', async t => {
  const timeoutDurations: number[] = []
  const checks: GitHubCheck[] = [
    {
      __typename: 'CheckRun',
      name: 'build',
      isRequired: true,
      conclusion: null,
      status: null
    },
    {
      __typename: 'StatusContext',
      context: 'legacy',
      isRequired: false,
      state: null
    }
  ]
  const reviews: GitHubReview[] = [
    {state: 'APPROVED', author: {__typename: 'User', login: 'octocat'}},
    {state: 'COMMENTED', author: null}
  ]
  const recording = createSequenceFetch([
    () =>
      jsonResponse(
        completePullPage({
          checks: {nodes: checks},
          reviews: {nodes: reviews},
          reviewDecision: 'APPROVED',
          isDraft: true
        })
      )
  ])
  t.mock.method(
    AbortSignal,
    'timeout',
    (milliseconds: number): AbortSignal => {
      timeoutDurations.push(milliseconds)
      return new AbortController().signal
    }
  )
  t.mock.method(globalThis, 'fetch', recording.fetch as typeof fetch)
  const previousApiUrl = process.env.GITHUB_API_URL
  const previousGraphqlUrl = process.env.GITHUB_GRAPHQL_URL
  delete process.env.GITHUB_API_URL
  delete process.env.GITHUB_GRAPHQL_URL
  t.after(() => {
    if (previousApiUrl === undefined) delete process.env.GITHUB_API_URL
    else process.env.GITHUB_API_URL = previousApiUrl
    if (previousGraphqlUrl === undefined) delete process.env.GITHUB_GRAPHQL_URL
    else process.env.GITHUB_GRAPHQL_URL = previousGraphqlUrl
  })

  const client = createGitHubClient(TOKEN)
  const result = await client.getPullRequestStatus(request)

  assert.deepEqual(result, {
    state: 'OPEN',
    headRefOid: 'abc123',
    reviewDecision: 'APPROVED',
    mergeStateStatus: 'CLEAN',
    mergeable: 'MERGEABLE',
    isDraft: true,
    checks,
    latestReviews: reviews
  })
  assert.equal(recording.calls.length, 1)
  const call = recording.calls[0]!
  assert.equal(call.url, 'https://api.github.com/graphql')
  assert.equal(call.init.method, 'POST')
  assert.ok(call.init.signal instanceof AbortSignal)
  assert.deepEqual(timeoutDurations, [15_000])
  const headers = new Headers(call.init.headers)
  assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`)
  assert.equal(headers.get('accept'), 'application/vnd.github+json')
  assert.equal(headers.get('x-github-api-version'), '2022-11-28')
  assert.equal(headers.get('content-type'), 'application/json')
  assert.equal(headers.get('user-agent'), 'grantbirki/pr-status@v3.0.0')

  const body = JSON.parse(String(call.init.body)) as {
    query: string
    variables: Record<string, unknown>
  }
  assert.match(body.query, /contexts\(first: 100, after: \$checksCursor\)/u)
  assert.match(body.query, /latestReviews\(first: 100, after: \$reviewsCursor\)/u)
  assert.match(body.query, /\n      state\n      headRefOid\n/u)
  assert.deepEqual(body.variables, {
    owner: 'octocat',
    repo: 'example',
    number: 42,
    checksCursor: null,
    reviewsCursor: null,
    includeChecks: true,
    includeReviews: true
  })
})

test('rejects empty tokens and non-GitHub.com runner API endpoints before fetching', () => {
  const fetch: FetchImplementation = async () => {
    assert.fail('fetch must not be called')
  }

  assert.throws(() => createGitHubClient('', {fetch}), /token must not be empty/u)
  assert.throws(
    () =>
      createGitHubClient(TOKEN, {
        fetch,
        environment: {
          GITHUB_API_URL: 'https://github.example/api/v3',
          GITHUB_GRAPHQL_URL: 'https://api.github.com/graphql'
        }
      }),
    /GitHub Enterprise Server is not supported/u
  )
  assert.throws(
    () =>
      createGitHubClient(TOKEN, {
        fetch,
        environment: {
          GITHUB_API_URL: 'https://api.github.com',
          GITHUB_GRAPHQL_URL: 'https://github.example/api/graphql'
        }
      }),
    /Unsupported GitHub GraphQL URL/u
  )
  assert.doesNotThrow(() =>
    createGitHubClient(TOKEN, {
      fetch,
      environment: {
        GITHUB_API_URL: 'https://api.github.com',
        GITHUB_GRAPHQL_URL: 'https://api.github.com/graphql'
      }
    })
  )
})

test('paginates check contexts and latest reviews independently', async () => {
  const firstCheck: GitHubCheck = {
    __typename: 'CheckRun',
    name: 'one',
    isRequired: true,
    conclusion: 'SUCCESS',
    status: 'COMPLETED'
  }
  const secondCheck: GitHubCheck = {
    __typename: 'StatusContext',
    context: 'two',
    isRequired: false,
    state: 'PENDING'
  }
  const firstReview: GitHubReview = {
    state: 'APPROVED',
    author: {__typename: 'User', login: 'one'}
  }
  const secondReview: GitHubReview = {
    state: 'CHANGES_REQUESTED',
    author: {__typename: 'User', login: 'two'}
  }
  const thirdReview: GitHubReview = {
    state: 'APPROVED',
    author: {__typename: 'Bot', login: 'automation'}
  }
  const recording = createSequenceFetch([
    () =>
      jsonResponse(
        completePullPage({
          checks: {nodes: [firstCheck], hasNextPage: true, endCursor: 'c1'},
          reviews: {
            nodes: [firstReview],
            hasNextPage: true,
            endCursor: 'r1'
          }
        })
      ),
    () =>
      jsonResponse(
        completePullPage({
          checks: {nodes: [secondCheck]},
          reviews: {
            nodes: [secondReview],
            hasNextPage: true,
            endCursor: 'r2'
          }
        })
      ),
    () =>
      jsonResponse(
        pullPage({
          reviews: {nodes: [thirdReview]}
        })
      )
  ])

  const result = await createClient(recording.fetch).getPullRequestStatus(request)

  assert.deepEqual(result.checks, [firstCheck, secondCheck])
  assert.deepEqual(result.latestReviews, [
    firstReview,
    secondReview,
    thirdReview
  ])
  assert.equal(recording.calls.length, 3)
  const variables = recording.calls.map(call =>
    (JSON.parse(String(call.init.body)) as {variables: Record<string, unknown>})
      .variables
  )
  assert.deepEqual(variables, [
    {
      owner: 'octocat',
      repo: 'example',
      number: 42,
      checksCursor: null,
      reviewsCursor: null,
      includeChecks: true,
      includeReviews: true
    },
    {
      owner: 'octocat',
      repo: 'example',
      number: 42,
      checksCursor: 'c1',
      reviewsCursor: 'r1',
      includeChecks: true,
      includeReviews: true
    },
    {
      owner: 'octocat',
      repo: 'example',
      number: 42,
      checksCursor: 'c1',
      reviewsCursor: 'r2',
      includeChecks: false,
      includeReviews: true
    }
  ])
})

test('treats a null status rollup as a confirmed empty check set', async () => {
  const recording = createSequenceFetch([
    () => jsonResponse(pullPage({checks: null, reviews: {}, errors: []}))
  ])

  const result = await createClient(recording.fetch).getPullRequestStatus(request)

  assert.deepEqual(result.checks, [])
  assert.deepEqual(result.latestReviews, [])
})

test('retries network and timeout failures at the bounded default delays', async () => {
  const sleeps: number[] = []
  let calls = 0
  const fetch: FetchImplementation = async () => {
    calls += 1
    if (calls === 1) throw new TypeError('connection reset')
    if (calls === 2) throw new DOMException('timed out', 'AbortError')
    return responseForLabels(['ready'])
  }
  const client = createClient(fetch, async milliseconds => {
    sleeps.push(milliseconds)
  })

  assert.deepEqual(await client.listIssueLabels(request), ['ready'])
  assert.equal(calls, 3)
  assert.deepEqual(sleeps, [500, 1_000])
})

test('retries response-body network failures', async () => {
  const failedResponse = responseForLabels([])
  failedResponse.text = async () => {
    throw new TypeError('body stream reset')
  }
  const recording = createSequenceFetch([
    () => failedResponse,
    () => responseForLabels(['recovered'])
  ])
  const sleeps: number[] = []

  const result = await createClient(recording.fetch, async milliseconds => {
    sleeps.push(milliseconds)
  }).listIssueLabels(request)

  assert.deepEqual(result, ['recovered'])
  assert.deepEqual(sleeps, [500])
})

test('redacts Error and non-Error network failures after three attempts', async () => {
  for (const reason of [
    new Error(`request failed for Bearer ${TOKEN}`),
    `request failed for ${TOKEN}`
  ]) {
    let calls = 0
    const fetch: FetchImplementation = async () => {
      calls += 1
      throw reason
    }
    const client = createClient(fetch)

    await assert.rejects(
      client.listIssueLabels(request),
      error => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /failed after 3 attempts/u)
        assert.doesNotMatch(error.message, new RegExp(TOKEN, 'u'))
        assert.match(error.message, /\[REDACTED\]/u)
        return true
      }
    )
    assert.equal(calls, 3)
  }
})

test('retries every approved HTTP status and never retries ordinary failures', async () => {
  for (const status of [403, 429, 500, 502, 503, 504]) {
    const retryHeaders = status === 403 ? {'Retry-After': '0'} : undefined
    const recording = createSequenceFetch([
      () => textResponse('temporary', status, retryHeaders),
      () => responseForLabels(['ok'])
    ])
    const sleeps: number[] = []
    const result = await createClient(
      recording.fetch,
      async milliseconds => {
        sleeps.push(milliseconds)
      }
    ).listIssueLabels(request)

    assert.deepEqual(result, ['ok'])
    assert.equal(recording.calls.length, 2)
    assert.deepEqual(sleeps, [status === 403 ? 0 : 500])
  }

  for (const status of [401, 404, 422]) {
    const recording = createSequenceFetch([
      () => textResponse('', status)
    ])
    await assert.rejects(
      createClient(recording.fetch).listIssueLabels(request),
      new RegExp(`HTTP ${status}`, 'u')
    )
    assert.equal(recording.calls.length, 1)
  }
})

test('retries a throttled 403 only when GitHub supplies Retry-After', async () => {
  const recording = createSequenceFetch([
    () => textResponse('forbidden', 403)
  ])

  await assert.rejects(
    createClient(recording.fetch).listIssueLabels(request),
    /HTTP 403/u
  )
  assert.equal(recording.calls.length, 1)
})

test('honors a short Retry-After and rejects invalid or excessive delays', async () => {
  const shortRetry = createSequenceFetch([
    () => textResponse('slow down', 429, {'Retry-After': '0.25'}),
    () => responseForLabels(['ok'])
  ])
  const sleeps: number[] = []
  assert.deepEqual(
    await createClient(shortRetry.fetch, async milliseconds => {
      sleeps.push(milliseconds)
    }).listIssueLabels(request),
    ['ok']
  )
  assert.deepEqual(sleeps, [250])

  for (const retryAfter of ['01', '11']) {
    const recording = createSequenceFetch([
      () => textResponse('slow down', 429, {'Retry-After': retryAfter})
    ])
    await assert.rejects(
      createClient(recording.fetch).listIssueLabels(request),
      retryAfter === '01' ? /invalid Retry-After/u : /longer than 10 seconds/u
    )
    assert.equal(recording.calls.length, 1)
  }
})

test('stops after three retryable HTTP responses', async () => {
  const recording = createSequenceFetch([
    () => textResponse('temporary', 500),
    () => textResponse('temporary', 500),
    () => textResponse('still broken', 500)
  ])
  const sleeps: number[] = []

  await assert.rejects(
    createClient(recording.fetch, async milliseconds => {
      sleeps.push(milliseconds)
    }).listIssueLabels(request),
    /HTTP 500: still broken/u
  )
  assert.equal(recording.calls.length, 3)
  assert.deepEqual(sleeps, [500, 1_000])
})

test('bounds HTTP response excerpts and redacts tokens defensively', async () => {
  const body = `${TOKEN} Bearer another-secret ${'x'.repeat(8_000)}`
  const recording = createSequenceFetch([
    () => textResponse(body, 401)
  ])

  await assert.rejects(
    createClient(recording.fetch).listIssueLabels(request),
    error => {
      assert.ok(error instanceof Error)
      assert.doesNotMatch(error.message, new RegExp(TOKEN, 'u'))
      assert.doesNotMatch(error.message, /another-secret/u)
      assert.match(error.message, /\[REDACTED\]/u)
      assert.ok(error.message.length < 4_300)
      return true
    }
  )
})

test('treats GraphQL errors in HTTP 200 responses as bounded redacted failures', async () => {
  const recording = createSequenceFetch([
    () =>
      jsonResponse({
        errors: [{message: `${TOKEN} ${'x'.repeat(8_000)}`}]
      })
  ])

  await assert.rejects(
    createClient(recording.fetch).getPullRequestStatus(request),
    error => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /GraphQL request failed/u)
      assert.doesNotMatch(error.message, new RegExp(TOKEN, 'u'))
      assert.ok(error.message.length < 4_300)
      return true
    }
  )
})

test('rejects malformed JSON and malformed GraphQL response shapes', async () => {
  const valid = completePullPage() as {
    data: {repository: {pullRequest: Record<string, unknown>}}
  }
  const pullRequest = valid.data.repository.pullRequest
  const validCommits = pullRequest.commits
  const validReviews = pullRequest.latestReviews
  const validMetadata = {
    state: 'OPEN',
    headRefOid: 'abc123',
    reviewDecision: null,
    mergeStateStatus: 'CLEAN',
    mergeable: 'MERGEABLE',
    isDraft: false
  }

  const malformed: Array<{body: string; message: RegExp}> = [
    {body: '{', message: /Invalid JSON/u},
    {body: '1', message: /response must be an object/u},
    {body: 'null', message: /response must be an object/u},
    {body: '[]', message: /response must be an object/u},
    {
      body: JSON.stringify({errors: {}, data: {}}),
      message: /errors must be an array/u
    },
    {
      body: JSON.stringify({data: null}),
      message: /data must be an object/u
    },
    {
      body: JSON.stringify({data: {repository: null}}),
      message: /data\.repository must be an object/u
    },
    {
      body: JSON.stringify({data: {repository: {pullRequest: null}}}),
      message: /pullRequest must be an object/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              state: 'UNKNOWN',
              commits: validCommits,
              latestReviews: validReviews
            }
          }
        }
      }),
      message: /state must be OPEN, CLOSED, or MERGED/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              headRefOid: null,
              commits: validCommits,
              latestReviews: validReviews
            }
          }
        }
      }),
      message: /headRefOid must be a string/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              reviewDecision: 1,
              commits: validCommits,
              latestReviews: validReviews
            }
          }
        }
      }),
      message: /reviewDecision must be a string or null/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              mergeable: null,
              commits: validCommits,
              latestReviews: validReviews
            }
          }
        }
      }),
      message: /mergeable must be a string/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              isDraft: 'false',
              commits: validCommits,
              latestReviews: validReviews
            }
          }
        }
      }),
      message: /isDraft must be a boolean/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              commits: {nodes: []},
              latestReviews: validReviews
            }
          }
        }
      }),
      message: /must contain one latest commit/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              commits: {nodes: 'bad'},
              latestReviews: validReviews
            }
          }
        }
      }),
      message: /commits\.nodes must be an array/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              commits: {
                nodes: [{commit: {statusCheckRollup: {contexts: {nodes: 'bad'}}}}]
              },
              latestReviews: validReviews
            }
          }
        }
      }),
      message: /contexts\.nodes must be an array/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              commits: {
                nodes: [
                  {
                    commit: {
                      statusCheckRollup: {
                        contexts: {
                          nodes: [
                            {
                              __typename: 'FutureCheck',
                              isRequired: false
                            }
                          ],
                          pageInfo: {hasNextPage: false, endCursor: null}
                        }
                      }
                    }
                  }
                ]
              },
              latestReviews: validReviews
            }
          }
        }
      }),
      message: /unsupported __typename/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              commits: validCommits,
              latestReviews: {
                nodes: [{state: 'APPROVED'}],
                pageInfo: {hasNextPage: false, endCursor: null}
              }
            }
          }
        }
      }),
      message: /author must be an object/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              commits: validCommits,
              latestReviews: {
                nodes: [],
                pageInfo: {hasNextPage: 'false', endCursor: null}
              }
            }
          }
        }
      }),
      message: /hasNextPage must be a boolean/u
    },
    {
      body: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              ...validMetadata,
              commits: validCommits,
              latestReviews: {
                nodes: [],
                pageInfo: {hasNextPage: true, endCursor: 1}
              }
            }
          }
        }
      }),
      message: /endCursor must be a string or null/u
    }
  ]

  for (const fixture of malformed) {
    const recording = createSequenceFetch([
      () => textResponse(fixture.body, 200)
    ])
    await assert.rejects(
      createClient(recording.fetch).getPullRequestStatus(request),
      fixture.message
    )
  }
})

test('rejects a missing, repeated, or over-limit GraphQL cursor', async () => {
  const noCursor = createSequenceFetch([
    () =>
      jsonResponse(
        completePullPage({
          checks: {hasNextPage: true},
          reviews: {}
        })
      )
  ])
  await assert.rejects(
    createClient(noCursor.fetch).getPullRequestStatus(request),
    /checks pagination returned no next cursor/u
  )

  const repeatedCursor = createSequenceFetch([
    () =>
      jsonResponse(
        completePullPage({
          checks: {hasNextPage: true, endCursor: 'same'},
          reviews: {}
        })
      ),
    () =>
      jsonResponse(
        pullPage({
          checks: {hasNextPage: true, endCursor: 'same'}
        })
      )
  ])
  await assert.rejects(
    createClient(repeatedCursor.fetch).getPullRequestStatus(request),
    /checks pagination repeated a cursor/u
  )

  let pages = 0
  const pageLimitFetch: FetchImplementation = async () => {
    pages += 1
    return jsonResponse(
      pullPage({
        checks: {hasNextPage: true, endCursor: `cursor-${pages}`},
        ...(pages === 1 ? {reviews: {}} : {})
      })
    )
  }
  await assert.rejects(
    createClient(pageLimitFetch).getPullRequestStatus(request),
    /checks pagination exceeded 100 pages/u
  )
  assert.equal(pages, 100)
})

test('rejects more than 10,000 GraphQL nodes', async () => {
  const check: GitHubCheck = {
    __typename: 'CheckRun',
    name: 'build',
    isRequired: true,
    conclusion: 'SUCCESS',
    status: 'COMPLETED'
  }
  const recording = createSequenceFetch([
    () =>
      jsonResponse(
        completePullPage({
          checks: {nodes: Array.from({length: 10_001}, () => check)},
          reviews: {}
        })
      )
  ])

  await assert.rejects(
    createClient(recording.fetch).getPullRequestStatus(request),
    /checks pagination exceeded 10,000 nodes/u
  )
})

test('paginates issue labels and encodes every user-controlled path segment', async () => {
  const next =
    'https://api.github.com/repos/octo%20cat/exam%2Fple/issues/42/labels?per_page=100&page=2'
  const recording = createSequenceFetch([
    () =>
      responseForLabels(['one'], 200, {
        Link: `garbage, <https://api.github.com/last>; rel="last", <${next}>; rel="next"`
      }),
    () => responseForLabels(['two'])
  ])
  const client = createClient(recording.fetch)

  const result = await client.listIssueLabels({
    owner: 'octo cat',
    repo: 'exam/ple',
    number: 42
  })

  assert.deepEqual(result, ['one', 'two'])
  assert.deepEqual(
    recording.calls.map(call => call.url),
    [
      'https://api.github.com/repos/octo%20cat/exam%2Fple/issues/42/labels?per_page=100&page=1',
      next
    ]
  )
  assert.equal(recording.calls[0]!.init.body, undefined)
  assert.equal(recording.calls[0]!.init.method, 'GET')
})

test('paginates issue comments since an operation started', async () => {
  const since = '2026-01-02T03:04:05.000Z'
  const next =
    'https://api.github.com/repos/octo%20cat/exam%2Fple/issues/42/comments?since=2026-01-02T03%3A04%3A05.000Z&per_page=100&page=2'
  const first = {
    id: 1,
    body: 'first',
    user: {login: 'github-actions[bot]', type: 'Bot'}
  }
  const second = {
    id: 2,
    body: 'second',
    user: null
  }
  const recording = createSequenceFetch([
    () => jsonResponse([first], 200, {Link: `<${next}>; rel="next"`}),
    () => jsonResponse([second])
  ])

  const result = await createClient(recording.fetch).listIssueComments({
    owner: 'octo cat',
    repo: 'exam/ple',
    number: 42,
    since
  })

  assert.deepEqual(result, [first, second])
  assert.deepEqual(
    recording.calls.map(call => call.url),
    [
      'https://api.github.com/repos/octo%20cat/exam%2Fple/issues/42/comments?since=2026-01-02T03%3A04%3A05.000Z&per_page=100&page=1',
      next
    ]
  )
})

test('lists all issue comments when no timestamp filter is provided', async () => {
  const recording = createSequenceFetch([() => jsonResponse([])])

  assert.deepEqual(
    await createClient(recording.fetch).listIssueComments(request),
    []
  )
  assert.equal(
    recording.calls[0]!.url,
    'https://api.github.com/repos/octocat/example/issues/42/comments?per_page=100&page=1'
  )
})

test('gets an exact issue comment with pull request ownership data', async () => {
  const response = {
    id: 600,
    body: '<!-- branch-deploy-status:{} -->',
    user: {login: 'github-actions[bot]', type: 'Bot'},
    issue_url: 'https://api.github.com/repos/octocat/example/issues/42'
  }
  const recording = createSequenceFetch([() => jsonResponse(response)])

  assert.deepEqual(
    await createClient(recording.fetch).getIssueComment({
      owner: 'octocat',
      repo: 'example',
      commentId: 600
    }),
    {
      id: response.id,
      body: response.body,
      user: response.user,
      issueUrl: response.issue_url
    }
  )
  assert.equal(
    recording.calls[0]!.url,
    'https://api.github.com/repos/octocat/example/issues/comments/600'
  )
  assert.equal(recording.calls[0]!.init.method, 'GET')
})

test('rejects invalid exact issue comment requests and ownership data', async () => {
  const noFetch: FetchImplementation = async () => {
    assert.fail('fetch must not be called')
  }
  for (const commentId of [0, 1.5]) {
    await assert.rejects(
      createClient(noFetch).getIssueComment({
        owner: 'octocat',
        repo: 'example',
        commentId
      }),
      /comment ID must be a positive safe integer/u
    )
  }

  const malformed = createSequenceFetch([
    () =>
      jsonResponse({
        id: 600,
        body: 'marker',
        user: null,
        issue_url: null
      })
  ])
  await assert.rejects(
    createClient(malformed.fetch).getIssueComment({
      owner: 'octocat',
      repo: 'example',
      commentId: 600
    }),
    /issue comment\.issue_url must be a string/u
  )
})

test('rejects malformed issue comment responses and empty timestamps', async () => {
  const fixtures: Array<{value: unknown; message: RegExp}> = [
    {value: {}, message: /issue comments must be an array/u},
    {value: [null], message: /issue comments\[0\] must be an object/u},
    {
      value: [{id: 0, body: 'x', user: {login: 'x', type: 'User'}}],
      message: /id must be a positive safe integer/u
    },
    {
      value: [{id: 1, body: null, user: {login: 'x', type: 'User'}}],
      message: /body must be a string/u
    },
    {
      value: [{id: 1, body: 'x', user: []}],
      message: /user must be an object/u
    },
    {
      value: [{id: 1, body: 'x', user: {login: null, type: 'User'}}],
      message: /user\.login must be a string/u
    },
    {
      value: [{id: 1, body: 'x', user: {login: 'x', type: null}}],
      message: /user\.type must be a string/u
    }
  ]

  for (const fixture of fixtures) {
    const recording = createSequenceFetch([() => jsonResponse(fixture.value)])
    await assert.rejects(
      createClient(recording.fetch).listIssueComments({
        ...request,
        since: '2026-01-02T03:04:05.000Z'
      }),
      fixture.message
    )
  }

  const fetch: FetchImplementation = async () => {
    assert.fail('fetch must not be called')
  }
  await assert.rejects(
    createClient(fetch).listIssueComments({...request, since: ''}),
    /since timestamp must not be empty/u
  )
})

test('enforces issue comment pagination page, repeat, and node caps', async () => {
  const commentsPath = '/repos/octocat/example/issues/42/comments'
  const firstPage = `https://api.github.com${commentsPath}?page=1`
  const repeated = createSequenceFetch([
    () => jsonResponse([], 200, {Link: `<${firstPage}>; rel="next"`})
  ])
  await assert.rejects(
    createClient(repeated.fetch).listIssueComments({
      ...request,
      since: '2026-01-02T03:04:05.000Z'
    }),
    /issue comments pagination repeated a page/u
  )

  let pages = 0
  const pageLimitFetch: FetchImplementation = async () => {
    pages += 1
    return jsonResponse([], 200, {
      Link: `<https://api.github.com${commentsPath}?page=${pages + 1}>; rel="next"`
    })
  }
  await assert.rejects(
    createClient(pageLimitFetch).listIssueComments({
      ...request,
      since: '2026-01-02T03:04:05.000Z'
    }),
    /issue comments pagination exceeded 100 pages/u
  )
  assert.equal(pages, 100)

  const comment = {
    id: 1,
    body: 'x',
    user: {login: 'github-actions[bot]', type: 'Bot'}
  }
  const nodeLimit = createSequenceFetch([
    () => jsonResponse(Array.from({length: 10_001}, () => comment))
  ])
  await assert.rejects(
    createClient(nodeLimit.fetch).listIssueComments({
      ...request,
      since: '2026-01-02T03:04:05.000Z'
    }),
    /issue comments pagination exceeded 10,000 nodes/u
  )
})

test('ignores Link headers that do not advertise another page', async () => {
  const recording = createSequenceFetch([
    () =>
      responseForLabels(['only'], 200, {
        Link: '<https://api.github.com/last>; rel="last"'
      })
  ])

  assert.deepEqual(await createClient(recording.fetch).listIssueLabels(request), [
    'only'
  ])
  assert.equal(recording.calls.length, 1)
})

test('removes labels idempotently and bulk-adds labels with validated responses', async () => {
  const recording = createSequenceFetch([
    () => responseForLabels(['keep']),
    () => textResponse('not found', 404),
    () => responseForLabels(['keep', 'ready'])
  ])
  const client = createClient(recording.fetch)

  await client.removeLabel({...request, name: 'needs review/now'})
  await client.removeLabel({...request, name: 'already-gone'})
  await client.addLabels({...request, labels: ['ready']})

  assert.equal(recording.calls[0]!.init.method, 'DELETE')
  assert.match(recording.calls[0]!.url, /needs%20review%2Fnow$/u)
  assert.equal(recording.calls[1]!.init.method, 'DELETE')
  assert.equal(recording.calls[2]!.init.method, 'POST')
  assert.equal(
    recording.calls[2]!.init.body,
    JSON.stringify({labels: ['ready']})
  )
})

test('retries bulk label addition because the endpoint produces set-like state', async () => {
  const recording = createSequenceFetch([
    () => textResponse('temporary', 503),
    () => responseForLabels(['ready'])
  ])
  const sleeps: number[] = []

  await createClient(recording.fetch, async milliseconds => {
    sleeps.push(milliseconds)
  }).addLabels({...request, labels: ['ready']})

  assert.equal(recording.calls.length, 2)
  assert.deepEqual(sleeps, [500])
})

test('retries idempotent label removal with the same encoded request', async () => {
  const recording = createSequenceFetch([
    () => textResponse('temporarily unavailable', 503),
    () => textResponse('', 404)
  ])
  const sleeps: number[] = []

  await createClient(recording.fetch, async milliseconds => {
    sleeps.push(milliseconds)
  }).removeLabel({...request, name: 'needs review/now'})

  assert.deepEqual(sleeps, [500])
  assert.equal(recording.calls.length, 2)
  for (const call of recording.calls) {
    assert.equal(call.init.method, 'DELETE')
    assert.equal(call.init.body, undefined)
    assert.equal(
      call.url,
      'https://api.github.com/repos/octocat/example/issues/42/labels/needs%20review%2Fnow'
    )
  }
})

test('rejects malformed label JSON and response shapes', async () => {
  const fixtures: Array<{response: Response; message: RegExp}> = [
    {response: textResponse('{', 200), message: /Invalid JSON/u},
    {response: jsonResponse({}), message: /labels must be an array/u},
    {response: jsonResponse([null]), message: /labels\[0\] must be an object/u},
    {
      response: jsonResponse([{name: null}]),
      message: /labels\[0\]\.name must be a string/u
    }
  ]

  for (const fixture of fixtures) {
    const recording = createSequenceFetch([() => fixture.response])
    await assert.rejects(
      createClient(recording.fetch).listIssueLabels(request),
      fixture.message
    )
  }

  const badRemoval = createSequenceFetch([
    () => textResponse('', 200)
  ])
  await assert.rejects(
    createClient(badRemoval.fetch).removeLabel({...request, name: 'ready'}),
    /Invalid JSON/u
  )

  const badAddition = createSequenceFetch([
    () => jsonResponse({labels: []})
  ])
  await assert.rejects(
    createClient(badAddition.fetch).addLabels({...request, labels: ['ready']}),
    /labels must be an array/u
  )
})

test('rejects invalid, off-origin, credentialed, and repeated REST pagination links', async () => {
  const labelsPath = '/repos/octocat/example/issues/42/labels'
  const links = [
    {value: 'not a url', message: /invalid URL/u},
    {value: 'https://example.com/next', message: /unsupported API URL/u},
    {
      value: 'https://user@api.github.com/next',
      message: /unsupported API URL/u
    },
    {
      value: 'https://:password@api.github.com/next',
      message: /unsupported API URL/u
    },
    {
      value: 'https://api.github.com/user?page=2',
      message: /unsupported API URL/u
    },
    {
      value: `https://api.github.com${labelsPath}`,
      message: /invalid page number/u
    },
    {
      value: `https://api.github.com${labelsPath}?page=0`,
      message: /invalid page number/u
    }
  ]

  for (const link of links) {
    const recording = createSequenceFetch([
      () => responseForLabels([], 200, {Link: `<${link.value}>; rel="next"`})
    ])
    await assert.rejects(
      createClient(recording.fetch).listIssueLabels(request),
      link.message
    )
  }

  const firstPage =
    'https://api.github.com/repos/octocat/example/issues/42/labels?per_page=100&page=1'
  const repeated = createSequenceFetch([
    () => responseForLabels([], 200, {Link: `<${firstPage}>; rel="next"`})
  ])
  await assert.rejects(
    createClient(repeated.fetch).listIssueLabels(request),
    /labels pagination repeated a page/u
  )
})

test('enforces REST pagination page and node caps', async () => {
  let pages = 0
  const pageLimitFetch: FetchImplementation = async () => {
    pages += 1
    return responseForLabels([], 200, {
      Link: `<https://api.github.com/repos/octocat/example/issues/42/labels?per_page=100&page=${pages + 1}>; rel="next"`
    })
  }
  await assert.rejects(
    createClient(pageLimitFetch).listIssueLabels(request),
    /labels pagination exceeded 100 pages/u
  )
  assert.equal(pages, 100)

  const nodeLimit = createSequenceFetch([
    () => responseForLabels(Array.from({length: 10_001}, (_, index) => `l${index}`))
  ])
  await assert.rejects(
    createClient(nodeLimit.fetch).listIssueLabels(request),
    /labels pagination exceeded 10,000 nodes/u
  )
})

test('validates repository coordinates and pull request numbers before requests', async () => {
  const fetch: FetchImplementation = async () => {
    assert.fail('fetch must not be called')
  }
  const client = createClient(fetch)
  const invalidRequests = [
    {owner: '', repo: 'example', number: 1},
    {owner: 'octocat', repo: '', number: 1},
    {owner: 'octocat', repo: 'example', number: Number.NaN},
    {owner: 'octocat', repo: 'example', number: -1},
    {owner: 'octocat', repo: 'example', number: 0}
  ]

  for (const invalid of invalidRequests) {
    await assert.rejects(client.listIssueLabels(invalid), /must|positive/u)
  }
})
