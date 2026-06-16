import assert from 'node:assert/strict'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {
  loadActionContext,
  type ContextDependencies
} from '../src/context.ts'

function dependencies(
  environment: NodeJS.ProcessEnv,
  payload: string = '{}'
): ContextDependencies {
  return {
    environment,
    readFile(path: string): string {
      assert.equal(path, '/event.json')
      return payload
    }
  }
}

const baseEnvironment: NodeJS.ProcessEnv = {
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_EVENT_PATH: '/event.json',
  GITHUB_JOB: 'evaluate',
  GITHUB_REPOSITORY: 'octocat/example',
}

test('loads repository, job, and pull request context without a workflow name', () => {
  assert.deepEqual(
    loadActionContext(
      dependencies(
        baseEnvironment,
        JSON.stringify({
          number: 3,
          issue: {number: 2},
          pull_request: {number: 1}
        })
      )
    ),
    {
      repo: {owner: 'octocat', repo: 'example'},
      job: 'evaluate',
      eventName: 'pull_request',
      eventPayload: {
        number: 3,
        issue: {number: 2},
        pull_request: {number: 1}
      },
      issueNumber: 1
    }
  )
})

test('falls back from issue to top-level event numbers', () => {
  const issueContext = loadActionContext(
    dependencies(baseEnvironment, JSON.stringify({issue: {number: 2}}))
  )
  assert.equal(issueContext.issueNumber, 2)

  const eventContext = loadActionContext(
    dependencies(baseEnvironment, JSON.stringify({number: 3}))
  )
  assert.equal(eventContext.issueNumber, 3)

  const emptyContext = loadActionContext(
    dependencies(
      baseEnvironment,
      JSON.stringify({pull_request: {}, issue: {}, number: '4'})
    )
  )
  assert.equal(emptyContext.issueNumber, undefined)
})

test('rejects execution outside GitHub Actions', () => {
  assert.throws(
    () =>
      loadActionContext(
        dependencies({...baseEnvironment, GITHUB_ACTIONS: 'false'})
      ),
    /only run inside GitHub Actions/
  )
})

test('requires GitHub Actions context variables', () => {
  for (const name of [
    'GITHUB_REPOSITORY',
    'GITHUB_EVENT_NAME',
    'GITHUB_EVENT_PATH',
    'GITHUB_JOB'
  ]) {
    const environment = {...baseEnvironment, [name]: ' '}
    assert.throws(
      () => loadActionContext(dependencies(environment)),
      new RegExp(`${name} is required`)
    )
  }
})

test('rejects malformed repository coordinates', () => {
  for (const repository of ['octocat', '/example', 'octocat/', 'a/b/c']) {
    assert.throws(
      () =>
        loadActionContext(
          dependencies({...baseEnvironment, GITHUB_REPOSITORY: repository})
        ),
      /owner\/repository format/
    )
  }
})

test('rejects malformed event payloads', () => {
  assert.throws(
    () => loadActionContext(dependencies(baseEnvironment, '{')),
    /does not contain valid JSON/
  )
  assert.throws(
    () => loadActionContext(dependencies(baseEnvironment, '[]')),
    /must contain a JSON object/
  )
})

test('default context dependencies read the GitHub event file', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'pr-status-context-'))
  const eventPath = join(temporaryRoot, 'event.json')
  const names = [
    'GITHUB_ACTIONS',
    'GITHUB_EVENT_NAME',
    'GITHUB_EVENT_PATH',
    'GITHUB_JOB',
    'GITHUB_REPOSITORY',
  ] as const
  const originalValues = new Map(
    names.map(name => [name, process.env[name]] as const)
  )

  await writeFile(eventPath, JSON.stringify({pull_request: {number: 42}}))
  process.env.GITHUB_ACTIONS = 'true'
  process.env.GITHUB_EVENT_NAME = 'pull_request'
  process.env.GITHUB_EVENT_PATH = eventPath
  process.env.GITHUB_JOB = 'evaluate'
  process.env.GITHUB_REPOSITORY = 'octocat/example'

  try {
    assert.deepEqual(loadActionContext(), {
      repo: {owner: 'octocat', repo: 'example'},
      job: 'evaluate',
      eventName: 'pull_request',
      eventPayload: {pull_request: {number: 42}},
      issueNumber: 42
    })
  } finally {
    for (const [name, value] of originalValues) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
    await rm(temporaryRoot, {recursive: true, force: true})
  }
})
