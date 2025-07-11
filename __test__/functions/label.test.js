import {label} from '../../src/functions/label'
import * as core from '@actions/core'

const issueNumber = 123

var context
var octokit
beforeEach(() => {
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.clearAllMocks()

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    }
  }

  octokit = {
    rest: {
      issues: {
        addLabels: jest.fn().mockReturnValueOnce({
          data: {}
        }),
        removeLabel: jest.fn().mockReturnValueOnce({
          data: {}
        }),
        listLabelsOnIssue: jest.fn().mockReturnValueOnce({
          data: [
            {
              name: 'deploy-failed'
            },
            {
              name: 'noop'
            }
          ]
        })
      }
    }
  }
})

test('adds a single label to a pull request and removes none', async () => {
  expect(
    await label(issueNumber, context, octokit, ['read-for-review'], [])
  ).toStrictEqual({
    added: ['read-for-review'],
    removed: []
  })
})

test('adds a single label to a pull request and tries to remove a label but it is not on the PR to begin with', async () => {
  expect(
    await label(
      issueNumber,
      context,
      octokit,
      ['read-for-review'],
      ['unknown-label']
    )
  ).toStrictEqual({
    added: ['read-for-review'],
    removed: []
  })
})

test('adds two labels to a pull request and removes none', async () => {
  expect(
    await label(
      issueNumber,
      context,
      octokit,
      ['read-for-review', 'cool-label'],
      []
    )
  ).toStrictEqual({
    added: ['read-for-review', 'cool-label'],
    removed: []
  })
})

test('does not add or remove any labels', async () => {
  expect(await label(issueNumber, context, octokit, [], [])).toStrictEqual({
    added: [],
    removed: []
  })
})

test('adds a single label to a pull request and removes a single label', async () => {
  expect(
    await label(
      issueNumber,
      context,
      octokit,
      ['deploy-success'],
      ['deploy-failed']
    )
  ).toStrictEqual({
    added: ['deploy-success'],
    removed: ['deploy-failed']
  })
})

test('adds two labels to a pull request and removes two labels', async () => {
  expect(
    await label(
      issueNumber,
      context,
      octokit,
      ['deploy-success', 'read-for-review'],
      ['deploy-failed', 'noop']
    )
  ).toStrictEqual({
    added: ['deploy-success', 'read-for-review'],
    removed: ['deploy-failed', 'noop']
  })
})

test('does not add any labels and removes a single label', async () => {
  expect(
    await label(issueNumber, context, octokit, [], ['noop'])
  ).toStrictEqual({
    added: [],
    removed: ['noop']
  })
})

test('should handle errors when fetching current labels', async () => {
  // Mock the API to throw an error
  octokit.rest.issues.listLabelsOnIssue = jest
    .fn()
    .mockRejectedValue(new Error('API Error'))

  const result = await label(issueNumber, context, octokit, [], ['test-label'])

  expect(result).toStrictEqual({
    added: [],
    removed: []
  })

  expect(core.warning).toHaveBeenCalledWith(
    expect.stringContaining('Failed to process label removal')
  )
})

test('should handle errors when adding labels', async () => {
  // Mock the API to throw an error
  octokit.rest.issues.addLabels = jest
    .fn()
    .mockRejectedValue(new Error('API Error'))

  const result = await label(issueNumber, context, octokit, ['test-label'], [])

  expect(result).toStrictEqual({
    added: [],
    removed: []
  })

  expect(core.warning).toHaveBeenCalledWith(
    expect.stringContaining('Failed to add labels')
  )
})
