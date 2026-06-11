import assert from 'node:assert/strict'
import test from 'node:test'

import {stringToArray} from '../../src/functions/string-to-array.ts'
import {createRecordingCore} from './helpers.ts'

test('converts comma-separated strings and filters empty items', () => {
  const recording = createRecordingCore()

  assert.deepEqual(
    stringToArray('label one, label two,, label three,', {
      core: recording.core
    }),
    ['label one', 'label two', 'label three']
  )
  assert.deepEqual(stringToArray('single', {core: recording.core}), ['single'])
  assert.deepEqual(recording.debug, [])
})

test('returns an empty array for empty strings', () => {
  const recording = createRecordingCore()

  assert.deepEqual(stringToArray('   ', {core: recording.core}), [])
  assert.deepEqual(recording.debug, [
    'in stringToArray(), an empty String was found so an empty Array was returned'
  ])
})

test('returns an empty array for nullish and non-string inputs', () => {
  const recording = createRecordingCore()

  assert.deepEqual(stringToArray(null, {core: recording.core}), [])
  assert.deepEqual(stringToArray(undefined, {core: recording.core}), [])
  assert.deepEqual(stringToArray(42, {core: recording.core}), [])
  assert.equal(recording.debug.length, 3)
  assert.ok(
    recording.debug.every(message =>
      message.includes('invalid input was found')
    )
  )
})

test('reports and wraps unexpected conversion errors', () => {
  const recording = createRecordingCore()
  const expected = new Error('debug failed')
  recording.core.debug = (): void => {
    throw expected
  }

  assert.throws(
    () => stringToArray('', {core: recording.core}),
    /could not convert String to Array - error: Error: debug failed/
  )
  assert.deepEqual(recording.error, ['failed string for debugging purposes: '])
})
