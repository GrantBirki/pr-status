import assert from 'node:assert/strict'
import test from 'node:test'

import {stringToArray} from '../../src/functions/string-to-array.ts'

test('trims and filters comma-separated values in order', () => {
  assert.deepEqual(
    stringToArray(' first,second, first, ,third,second '),
    ['first', 'second', 'first', 'third', 'second']
  )
  assert.deepEqual(stringToArray('single'), ['single'])
})

test('returns an empty array for empty or non-string values', () => {
  assert.deepEqual(stringToArray('   '), [])
  assert.deepEqual(stringToArray(null), [])
  assert.deepEqual(stringToArray(undefined), [])
  assert.deepEqual(stringToArray(42), [])
})
