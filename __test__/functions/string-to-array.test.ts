import {stringToArray} from '../../src/functions/string-to-array'
import * as core from '@actions/core'

const debugMock = jest.spyOn(core, 'debug')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

test('successfully converts a string to an array', async () => {
  expect(stringToArray('production,staging,development')).toStrictEqual([
    'production',
    'staging',
    'development'
  ])
})

test('successfully converts a single string item string to an array', async () => {
  expect(stringToArray('production,')).toStrictEqual(['production'])

  expect(stringToArray('production')).toStrictEqual(['production'])
})

test('successfully converts an empty string to an empty array', async () => {
  expect(stringToArray('')).toStrictEqual([])

  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), an empty String was found so an empty Array was returned'
  )
})

test('successfully converts garbage to an empty array', async () => {
  expect(stringToArray(',,,')).toStrictEqual([])
})

test('handles null input gracefully', async () => {
  expect(stringToArray(null)).toStrictEqual([])
  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), invalid input was found so an empty Array was returned'
  )
})

test('handles undefined input gracefully', async () => {
  expect(stringToArray(undefined)).toStrictEqual([])
  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), invalid input was found so an empty Array was returned'
  )
})

test('handles non-string input gracefully', async () => {
  expect(stringToArray(123 as unknown as string)).toStrictEqual([])
  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), invalid input was found so an empty Array was returned'
  )
})

test('handles boolean input gracefully', async () => {
  expect(stringToArray(true as unknown as string)).toStrictEqual([])
  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), invalid input was found so an empty Array was returned'
  )
})

test('handles object input gracefully', async () => {
  expect(stringToArray({} as unknown as string)).toStrictEqual([])
  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), invalid input was found so an empty Array was returned'
  )
})

test('handles array input gracefully', async () => {
  expect(stringToArray([] as unknown as string)).toStrictEqual([])
  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), invalid input was found so an empty Array was returned'
  )
})

test('handles string with only whitespace', async () => {
  expect(stringToArray('   ')).toStrictEqual([])
  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), an empty String was found so an empty Array was returned'
  )
})

test('handles string with tabs and newlines', async () => {
  expect(stringToArray('\t\n')).toStrictEqual([])
  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), an empty String was found so an empty Array was returned'
  )
})

test('handles mixed whitespace with commas', async () => {
  expect(stringToArray('  ,  ,  ')).toStrictEqual([])
})

test('handles string with leading/trailing whitespace', async () => {
  expect(stringToArray('  production, staging  ')).toStrictEqual([
    'production',
    'staging'
  ])
})

test('handles string with extra spaces around commas', async () => {
  expect(stringToArray('production , staging , development')).toStrictEqual([
    'production',
    'staging',
    'development'
  ])
})

test('handles string with multiple consecutive commas', async () => {
  expect(stringToArray('production,,,staging')).toStrictEqual([
    'production',
    'staging'
  ])
})

test('handles string with comma at start', async () => {
  expect(stringToArray(',production,staging')).toStrictEqual([
    'production',
    'staging'
  ])
})

test('handles string with comma at end', async () => {
  expect(stringToArray('production,staging,')).toStrictEqual([
    'production',
    'staging'
  ])
})

test('handles string with special characters', async () => {
  expect(stringToArray('feature/branch-name,hotfix/urgent-fix')).toStrictEqual([
    'feature/branch-name',
    'hotfix/urgent-fix'
  ])
})

test('handles string with numbers', async () => {
  expect(stringToArray('123,456,789')).toStrictEqual(['123', '456', '789'])
})

test('handles string with mixed content', async () => {
  expect(stringToArray('test-123,feature/branch,hotfix')).toStrictEqual([
    'test-123',
    'feature/branch',
    'hotfix'
  ])
})

test('handles very long string', async () => {
  const longString = 'a'.repeat(1000)
  expect(stringToArray(longString)).toStrictEqual([longString])
})

test('handles string with unicode characters', async () => {
  expect(stringToArray('测试,テスト,🚀')).toStrictEqual([
    '测试',
    'テスト',
    '🚀'
  ])
})

test('handles string with quotes', async () => {
  expect(stringToArray('"quoted",\'single\'')).toStrictEqual([
    '"quoted"',
    "'single'"
  ])
})

test('handles string with HTML entities', async () => {
  expect(stringToArray('&amp;,&lt;,&gt;')).toStrictEqual([
    '&amp;',
    '&lt;',
    '&gt;'
  ])
})

test('handles string with backslashes', async () => {
  expect(stringToArray('path\\to\\file,another\\path')).toStrictEqual([
    'path\\to\\file',
    'another\\path'
  ])
})

test('handles string with forward slashes', async () => {
  expect(stringToArray('path/to/file,another/path')).toStrictEqual([
    'path/to/file',
    'another/path'
  ])
})

test('handles error in string processing', async () => {
  // Mock the split function to throw an error
  const originalSplit = String.prototype.split
  String.prototype.split = jest.fn().mockImplementation(() => {
    throw new Error('Mock error')
  })

  try {
    expect(() => stringToArray('test')).toThrow(
      'could not convert String to Array - error: Error: Mock error'
    )
  } finally {
    // Restore the original split function
    String.prototype.split = originalSplit
  }
})
