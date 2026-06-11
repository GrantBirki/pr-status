import assert from 'node:assert/strict'
import test from 'node:test'

import {label} from '../../src/functions/label.ts'
import type {
  ActionContext,
  LabelClient,
  LabelRequest
} from '../../src/types.ts'
import {createRecordingCore, includesMessage} from './helpers.ts'

interface LabelClientRecording {
  client: LabelClient
  listed: LabelRequest[]
  removed: Array<LabelRequest & {name: string}>
  added: Array<LabelRequest & {labels: string[]}>
}

interface LabelFailures {
  list?: unknown
  remove?: unknown
  add?: unknown
}

function createLabelClient(
  currentLabels: string[],
  failures: LabelFailures = {}
): LabelClientRecording {
  const listed: LabelRequest[] = []
  const removed: Array<LabelRequest & {name: string}> = []
  const added: Array<LabelRequest & {labels: string[]}> = []

  const client: LabelClient = {
    rest: {
      issues: {
        async listLabelsOnIssue(request) {
          listed.push(request)
          if ('list' in failures) {
            throw failures.list
          }
          return {data: currentLabels.map(name => ({name}))}
        },
        async removeLabel(request) {
          removed.push(request)
          if ('remove' in failures) {
            throw failures.remove
          }
        },
        async addLabels(request) {
          added.push(request)
          if ('add' in failures) {
            throw failures.add
          }
        }
      }
    }
  }

  return {client, listed, removed, added}
}

const context: ActionContext = {
  repo: {owner: 'octocat', repo: 'example'}
}

const baseRequest = {
  owner: 'octocat',
  repo: 'example',
  issue_number: 42
} as const

test('returns immediately when no labels are requested', async () => {
  const recording = createRecordingCore()
  const octokit = createLabelClient([])

  const result = await label(
    42,
    context,
    octokit.client,
    [],
    [],
    {core: recording.core}
  )

  assert.deepEqual(result, {added: [], removed: []})
  assert.deepEqual(octokit.listed, [])
  assert.deepEqual(octokit.added, [])
  assert.ok(includesMessage(recording.info, 'No labels to add or remove'))
})

test('adds labels without listing labels when no removals are requested', async () => {
  const recording = createRecordingCore()
  const octokit = createLabelClient([])

  const result = await label(
    42,
    context,
    octokit.client,
    ['ready', 'reviewed'],
    [],
    {core: recording.core}
  )

  assert.deepEqual(result, {added: ['ready', 'reviewed'], removed: []})
  assert.deepEqual(octokit.listed, [])
  assert.deepEqual(octokit.added, [
    {...baseRequest, labels: ['ready', 'reviewed']}
  ])
  assert.ok(includesMessage(recording.info, 'Labels added: ready, reviewed'))
})

test('preserves string pull request numbers in label requests', async () => {
  const recording = createRecordingCore()
  const octokit = createLabelClient([])

  await label(
    '0042',
    context,
    octokit.client,
    ['ready'],
    [],
    {core: recording.core}
  )

  assert.deepEqual(octokit.added, [
    {...baseRequest, issue_number: '0042', labels: ['ready']}
  ])
})

test('removes only existing requested labels before adding labels', async () => {
  const recording = createRecordingCore()
  const octokit = createLabelClient(['remove-me', 'keep-me'])

  const result = await label(
    42,
    context,
    octokit.client,
    ['add-me'],
    ['missing', 'remove-me'],
    {core: recording.core}
  )

  assert.deepEqual(result, {added: ['add-me'], removed: ['remove-me']})
  assert.deepEqual(octokit.listed, [baseRequest])
  assert.deepEqual(octokit.removed, [
    {...baseRequest, name: 'remove-me'}
  ])
  assert.deepEqual(octokit.added, [{...baseRequest, labels: ['add-me']}])
  assert.ok(includesMessage(recording.info, "Label not found: 'missing'"))
  assert.ok(includesMessage(recording.info, 'Label removed: remove-me'))
})

test('supports removal without adding labels', async () => {
  const recording = createRecordingCore()
  const octokit = createLabelClient(['one', 'two'])

  const result = await label(
    42,
    context,
    octokit.client,
    [],
    ['one', 'two'],
    {core: recording.core}
  )

  assert.deepEqual(result, {added: [], removed: ['one', 'two']})
  assert.deepEqual(octokit.removed, [
    {...baseRequest, name: 'one'},
    {...baseRequest, name: 'two'}
  ])
  assert.deepEqual(octokit.added, [])
})

test('warns on label-list failures and still attempts additions', async () => {
  const recording = createRecordingCore()
  const octokit = createLabelClient([], {list: new Error('list failed')})

  const result = await label(
    42,
    context,
    octokit.client,
    ['add-me'],
    ['remove-me'],
    {core: recording.core}
  )

  assert.deepEqual(result, {added: ['add-me'], removed: []})
  assert.deepEqual(octokit.added, [{...baseRequest, labels: ['add-me']}])
  assert.ok(includesMessage(recording.warning, 'list failed'))
})

test('warns on label-removal failures', async () => {
  const recording = createRecordingCore()
  const octokit = createLabelClient(['remove-me'], {
    remove: new Error('remove failed')
  })

  const result = await label(
    42,
    context,
    octokit.client,
    [],
    ['remove-me'],
    {core: recording.core}
  )

  assert.deepEqual(result, {added: [], removed: []})
  assert.ok(includesMessage(recording.warning, 'remove failed'))
})

test('warns on label-addition failures', async () => {
  const recording = createRecordingCore()
  const octokit = createLabelClient([], {add: new Error('add failed')})

  const result = await label(
    42,
    context,
    octokit.client,
    ['add-me'],
    [],
    {core: recording.core}
  )

  assert.deepEqual(result, {added: [], removed: []})
  assert.ok(includesMessage(recording.warning, 'add failed'))
})
