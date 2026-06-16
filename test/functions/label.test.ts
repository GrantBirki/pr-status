import assert from 'node:assert/strict'
import test from 'node:test'

import {
  determineLabelActions,
  label
} from '../../src/functions/label.ts'
import type {LabelClient} from '../../src/functions/label.ts'
import {createRecordingCore, includesMessage} from './helpers.ts'

interface LabelRecording {
  client: LabelClient
  listed: Array<{owner: string; repo: string; number: number}>
  removed: Array<{owner: string; repo: string; number: number; name: string}>
  added: Array<{
    owner: string
    repo: string
    number: number
    labels: string[]
  }>
}

interface Failures {
  list?: Error
  remove?: Error
  add?: Error
}

function recordingClient(
  currentLabels: string[],
  failures: Failures = {}
): LabelRecording {
  const listed: LabelRecording['listed'] = []
  const removed: LabelRecording['removed'] = []
  const added: LabelRecording['added'] = []

  const client: LabelClient = {
    async listIssueLabels(request) {
      listed.push(request)
      if (failures.list !== undefined) {
        throw failures.list
      }
      return currentLabels
    },
    async removeLabel(request) {
      removed.push(request)
      if (failures.remove !== undefined) {
        throw failures.remove
      }
    },
    async addLabels(request) {
      added.push(request)
      if (failures.add !== undefined) {
        throw failures.add
      }
    }
  }

  return {client, listed, removed, added}
}

const context = {repo: {owner: 'octocat', repo: 'example'}}
const baseRequest = {owner: 'octocat', repo: 'example', number: 42}

test('selects, trims, and de-duplicates PASS labels with addition winning overlap', () => {
  assert.deepEqual(
    determineLabelActions(
      true,
      [' ready ', 'ready', ''],
      ['blocked', 'ready'],
      [' waiting ', 'blocked']
    ),
    {
      labelsToAdd: ['ready'],
      labelsToRemove: ['blocked', 'waiting']
    }
  )
})

test('selects, trims, and de-duplicates FAIL labels with addition winning overlap', () => {
  assert.deepEqual(
    determineLabelActions(
      false,
      ['ready', ' blocked ', 'ready'],
      [' blocked ', 'blocked'],
      ['ignored']
    ),
    {
      labelsToAdd: ['blocked'],
      labelsToRemove: ['ready']
    }
  )
})

test('returns without client calls when no labels are requested', async () => {
  const core = createRecordingCore()
  const client = recordingClient([])

  assert.deepEqual(
    await label(42, context, client.client, [' ', ''], [], {core: core.core}),
    {added: [], removed: []}
  )
  assert.deepEqual(client.listed, [])
  assert.deepEqual(client.added, [])
  assert.ok(includesMessage(core.info, 'No labels to add or remove'))
})

test('adds normalized labels without listing when no removals are requested', async () => {
  const core = createRecordingCore()
  const client = recordingClient([])

  const result = await label(
    42,
    context,
    client.client,
    [' ready ', 'ready', 'reviewed'],
    [],
    {core: core.core}
  )

  assert.deepEqual(result, {added: ['ready', 'reviewed'], removed: []})
  assert.deepEqual(client.listed, [])
  assert.deepEqual(client.added, [
    {...baseRequest, labels: ['ready', 'reviewed']}
  ])
  assert.ok(includesMessage(core.info, 'Labels added: ready, reviewed'))
})

test('lists labels, skips absent removals, removes in order, then bulk-adds', async () => {
  const core = createRecordingCore()
  const client = recordingClient(['remove-one', 'remove-two'])

  const result = await label(
    42,
    context,
    client.client,
    [' add ', 'remove-two'],
    ['missing', ' remove-one ', 'remove-one', 'remove-two'],
    {core: core.core}
  )

  assert.deepEqual(result, {added: ['add', 'remove-two'], removed: ['remove-one']})
  assert.deepEqual(client.listed, [baseRequest])
  assert.deepEqual(client.removed, [{...baseRequest, name: 'remove-one'}])
  assert.deepEqual(client.added, [
    {...baseRequest, labels: ['add', 'remove-two']}
  ])
  assert.ok(includesMessage(core.info, "Label not found: 'missing'"))
  assert.ok(includesMessage(core.info, 'Label removed: remove-one'))
})

test('supports removal without additions', async () => {
  const client = recordingClient(['one', 'two'])

  const result = await label(
    42,
    context,
    client.client,
    [],
    ['one', 'two'],
    {core: createRecordingCore().core}
  )

  assert.deepEqual(result, {added: [], removed: ['one', 'two']})
  assert.deepEqual(client.removed, [
    {...baseRequest, name: 'one'},
    {...baseRequest, name: 'two'}
  ])
  assert.deepEqual(client.added, [])
})

test('reuses a supplied label snapshot instead of listing again', async () => {
  const client = recordingClient([], {list: new Error('must not list')})

  const result = await label(
    42,
    context,
    client.client,
    ['ready'],
    ['waiting'],
    {
      core: createRecordingCore().core,
      currentLabels: ['waiting']
    }
  )

  assert.deepEqual(result, {added: ['ready'], removed: ['waiting']})
  assert.deepEqual(client.listed, [])
  assert.deepEqual(client.removed, [{...baseRequest, name: 'waiting'}])
})

test('propagates label-list failures without attempting additions', async () => {
  const expected = new Error('list failed')
  const client = recordingClient([], {list: expected})

  await assert.rejects(
    label(42, context, client.client, ['add'], ['remove'], {
      core: createRecordingCore().core
    }),
    expected
  )
  assert.deepEqual(client.added, [])
})

test('propagates label-removal failures without attempting additions', async () => {
  const expected = new Error('remove failed')
  const client = recordingClient(['remove'], {remove: expected})

  await assert.rejects(
    label(42, context, client.client, ['add'], ['remove'], {
      core: createRecordingCore().core
    }),
    expected
  )
  assert.deepEqual(client.added, [])
})

test('propagates bulk-addition failures', async () => {
  const expected = new Error('add failed')
  const client = recordingClient([], {add: expected})

  await assert.rejects(
    label(42, context, client.client, ['add'], [], {
      core: createRecordingCore().core
    }),
    expected
  )
})
