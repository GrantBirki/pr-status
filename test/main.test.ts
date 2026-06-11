import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import type {MainDependencies} from '../src/main.ts'
import type {
  CoreApi,
  LabelResult,
  OctokitClient,
  StatusResult
} from '../src/types.ts'
import {createRecordingCore} from './functions/helpers.ts'

type MainModule = typeof import('../src/main.ts')

interface RecordedRequest {
  method: string | undefined
  url: string | undefined
  body: string
}

const statusResult: StatusResult = {
  review_decision: 'APPROVED',
  total_approvals: 2,
  merge_state_status: 'CLEAN',
  mergeable_state: 'MERGEABLE',
  is_draft: false,
  commit_status: 'SUCCESS'
}

function createOctokitStub(): OctokitClient {
  return {
    async graphql(): Promise<unknown> {
      return {}
    },
    rest: {
      issues: {
        async listLabelsOnIssue() {
          return {data: []}
        },
        async removeLabel(): Promise<void> {},
        async addLabels(): Promise<void> {}
      }
    }
  }
}

function setEnvironment(
  values: Record<string, string | undefined>
): () => void {
  const originalValues = new Map<string, string | undefined>()

  for (const [name, value] of Object.entries(values)) {
    originalValues.set(name, process.env[name])
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }

  return () => {
    for (const [name, value] of originalValues) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
  }
}

async function waitForOutput(
  outputPath: string,
  expectedText: string
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const output = await readFile(outputPath, 'utf8')
    if (output.includes(expectedText)) {
      return output
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  throw new Error(`Timed out waiting for ${expectedText} in ${outputPath}`)
}

function coreWithInputs(
  inputs: Record<string, string>,
  coreApi: CoreApi
): CoreApi {
  return {
    ...coreApi,
    getInput(name: string): string {
      return inputs[name] ?? ''
    }
  }
}

function createRunDependencies(
  main: MainModule,
  pass: boolean,
  inputs: Partial<Record<string, string>> = {}
): {
  dependencies: MainDependencies
  logs: ReturnType<typeof createRecordingCore>
  createdTokens: string[]
  labels: Array<{add: string[]; remove: string[]}>
} {
  const logs = createRecordingCore()
  const createdTokens: string[] = []
  const labels: Array<{add: string[]; remove: string[]}> = []
  const values: Record<string, string> = {
    github_token: 'synthetic-secret-value',
    workflow: 'PR checks',
    checks: 'all',
    evaluations: 'approved',
    pass_labels: 'ready',
    pass_labels_cleanup: 'waiting',
    fail_labels: 'blocked',
    exclude_checks: 'self',
    pr_number: '42',
    ...inputs
  }

  const dependencies: MainDependencies = {
    core: coreWithInputs(values, logs.core),
    context: {
      workflow: 'Context workflow',
      repo: {owner: 'octocat', repo: 'example'}
    },
    createOctokitClient(token: string): OctokitClient {
      createdTokens.push(token)
      return createOctokitStub()
    },
    async status(): Promise<StatusResult> {
      return statusResult
    },
    outputs(): boolean {
      return pass
    },
    stringToArray: main.defaultDependencies.stringToArray,
    async label(
      _issueNumber,
      _context,
      _octokit,
      labelsToAdd,
      labelsToRemove
    ): Promise<LabelResult> {
      labels.push({add: labelsToAdd, remove: labelsToRemove})
      return {added: labelsToAdd, removed: labelsToRemove}
    }
  }

  return {dependencies, logs, createdTokens, labels}
}

test('main entrypoint and orchestration', async t => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'pr-status-main-'))
  const eventPath = join(temporaryRoot, 'event.json')
  const outputPath = join(temporaryRoot, 'output.txt')
  const requests: RecordedRequest[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => {
      body += chunk
    })
    request.on('end', () => {
      requests.push({method: request.method, url: request.url, body})
      response.writeHead(200, {'content-type': 'application/json'})
      response.end(
        JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviewDecision: 'APPROVED',
                mergeStateStatus: 'CLEAN',
                mergeable: 'MERGEABLE',
                isDraft: false,
                commits: {
                  nodes: [
                    {
                      commit: {
                        checkSuites: {totalCount: 0},
                        statusCheckRollup: null
                      }
                    }
                  ]
                },
                reviews: {totalCount: 2}
              }
            }
          }
        })
      )
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object')

  await writeFile(
    eventPath,
    JSON.stringify({
      pull_request: {number: 321},
      repository: {name: 'example', owner: {login: 'octocat'}}
    })
  )
  await writeFile(outputPath, '')

  const restoreEnvironment = setEnvironment({
    CI: 'true',
    GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_OUTPUT: outputPath,
    GITHUB_REPOSITORY: 'octocat/example',
    GITHUB_WORKFLOW: 'Integration workflow',
    INPUT_GITHUB_TOKEN: 'synthetic-integration-value',
    INPUT_WORKFLOW: '',
    INPUT_CHECKS: 'all',
    INPUT_EVALUATIONS: 'not_draft',
    INPUT_PASS_LABELS: '',
    INPUT_PASS_LABELS_CLEANUP: '',
    INPUT_FAIL_LABELS: '',
    INPUT_EXCLUDE_CHECKS: '',
    INPUT_PR_NUMBER: ''
  })

  try {
    await t.test(
      'executes the dynamically imported entrypoint against a mock GitHub API',
      async subtest => {
        const entrypoint = await import(`../src/index.ts?run=${Date.now()}`)
        const actionOutput = await waitForOutput(outputPath, 'evaluation')

        assert.equal(requests.length, 1)
        assert.equal(requests[0]?.method, 'POST')
        assert.equal(requests[0]?.url, '/graphql')
        const requestBody = JSON.parse(requests[0]?.body ?? '') as {
          variables: Record<string, unknown>
        }
        assert.deepEqual(requestBody.variables, {
          owner: 'octocat',
          name: 'example',
          number: 321
        })
        assert.match(actionOutput, /evaluation<<ghadelimiter_/)
        assert.match(actionOutput, /\nPASS\n/)
        assert.match(actionOutput, /total_approvals<<ghadelimiter_/)
        assert.match(actionOutput, /\n2\n/)
        assert.doesNotMatch(actionOutput, /synthetic-integration-value/)

        process.env.CI = 'false'
        const skippedRun = subtest.mock.fn(async (): Promise<void> => {})
        entrypoint.startEntrypoint(process.env, skippedRun)
        assert.equal(skippedRun.mock.callCount(), 0)
        assert.equal(requests.length, 1)
      }
    )

    const main = await import('../src/main.ts')

    await t.test('parses explicit inputs without logging their values', () => {
      const recording = createRecordingCore()
      const inputs = main.parseInputs({
        core: coreWithInputs(
          {
            pr_number: '77',
            github_token: 'never-log-this-value',
            workflow: 'Explicit workflow',
            checks: 'required',
            evaluations: 'approved, ci_passing',
            pass_labels: 'ready, done',
            pass_labels_cleanup: 'waiting',
            fail_labels: 'blocked',
            exclude_checks: 'self, docs'
          },
          recording.core
        ),
        context: {repo: {owner: 'octocat', repo: 'example'}},
        stringToArray: main.defaultDependencies.stringToArray
      })

      assert.deepEqual(inputs, {
        token: 'never-log-this-value',
        workflow: 'Explicit workflow',
        checks: 'required',
        evaluations: ['approved', 'ci_passing'],
        passLabels: ['ready', 'done'],
        passLabelsCleanup: ['waiting'],
        failLabels: ['blocked'],
        excludeChecks: ['self', 'docs'],
        prNumber: '77'
      })
      assert.equal(recording.debug.at(-1), '📋 Parsed inputs successfully')
      assert.doesNotMatch(
        [
          ...recording.debug,
          ...recording.info,
          ...recording.warning,
          ...recording.error
        ].join('\n'),
        /never-log-this-value/
      )
    })

    await t.test('uses issue and pull request context fallbacks', () => {
      const issueRecording = createRecordingCore()
      const issueInputs = main.parseInputs({
        core: coreWithInputs(
          {github_token: 'value', checks: 'all', evaluations: ''},
          issueRecording.core
        ),
        context: {
          workflow: 'Context workflow',
          repo: {owner: 'octocat', repo: 'example'},
          issue: {number: 12},
          payload: {pull_request: {number: 13}}
        },
        stringToArray: main.defaultDependencies.stringToArray
      })
      assert.equal(issueInputs.prNumber, 12)
      assert.equal(issueInputs.workflow, 'Context workflow')

      const payloadInputs = main.parseInputs({
        core: coreWithInputs(
          {github_token: 'value', checks: 'all', evaluations: ''},
          createRecordingCore().core
        ),
        context: {
          repo: {owner: 'octocat', repo: 'example'},
          payload: {pull_request: {number: 13}}
        },
        stringToArray: main.defaultDependencies.stringToArray
      })
      assert.equal(payloadInputs.prNumber, 13)
      assert.equal(payloadInputs.workflow, undefined)
    })

    await t.test('rejects a missing pull request number', () => {
      const recording = createRecordingCore()
      assert.throws(
        () =>
          main.parseInputs({
            core: coreWithInputs({}, recording.core),
            context: {repo: {owner: 'octocat', repo: 'example'}},
            stringToArray: main.defaultDependencies.stringToArray
          }),
        /Pull request number not found/
      )
    })

    await t.test('selects and logs pass, fail, and empty label actions', async subtest => {
      const passing = createRunDependencies(main, true)
      const outputsMock = subtest.mock.method(
        passing.dependencies,
        'outputs'
      )
      assert.equal(await main.run(passing.dependencies), 'success')
      assert.equal(outputsMock.mock.callCount(), 1)
      assert.deepEqual(passing.createdTokens, ['synthetic-secret-value'])
      assert.deepEqual(passing.labels, [
        {add: ['ready'], remove: ['blocked', 'waiting']}
      ])
      assert.ok(
        passing.logs.info.some(message => message.includes('PASS'))
      )
      assert.doesNotMatch(
        [...passing.logs.info, ...passing.logs.debug].join('\n'),
        /synthetic-secret-value/
      )

      const failing = createRunDependencies(main, false)
      assert.equal(await main.run(failing.dependencies), 'success')
      assert.deepEqual(failing.labels, [
        {add: ['blocked'], remove: ['ready']}
      ])
      assert.ok(
        failing.logs.info.some(message => message.includes('FAIL'))
      )

      const empty = createRunDependencies(main, true, {
        pass_labels: '',
        pass_labels_cleanup: '',
        fail_labels: ''
      })
      assert.equal(await main.run(empty.dependencies), 'success')
      assert.deepEqual(empty.labels, [{add: [], remove: []}])
      assert.ok(
        empty.logs.info.some(message =>
          message.includes('No label changes needed')
        )
      )
    })

    await t.test('marks orchestration failures', async subtest => {
      const failure = new Error('GraphQL failed')
      const fixture = createRunDependencies(main, true)
      const failingStatus = subtest.mock.fn(async (): Promise<StatusResult> => {
        throw failure
      })
      fixture.dependencies.status = failingStatus

      await assert.rejects(main.run(fixture.dependencies), error => {
        assert.equal(error, failure)
        return true
      })
      assert.equal(failingStatus.mock.callCount(), 1)
      assert.deepEqual(fixture.logs.failed, [failure.message])
      assert.ok(
        fixture.logs.error.some(message => message.includes(failure.message))
      )
    })

    await t.test('creates the retained Octokit client without a request', () => {
      const octokit = main.createOctokitClient('synthetic-client-value')
      assert.equal(typeof octokit.graphql, 'function')
      assert.equal(typeof octokit.rest.issues.addLabels, 'function')
    })
  } finally {
    restoreEnvironment()
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
    await rm(temporaryRoot, {recursive: true, force: true})
  }
})
