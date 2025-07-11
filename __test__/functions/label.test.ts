import {label} from '../../src/functions/label'
import * as core from '@actions/core'
import {GitHubContext, OctokitClient} from '../../src/types'

const issueNumber = 123

let context: GitHubContext
let octokit: OctokitClient

beforeEach(() => {
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.clearAllMocks()

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    },
    payload: {
      pull_request: {
        number: 1
      }
    },
    workflow: 'test'
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
    },
    graphql: jest.fn()
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

test('handles API error when adding labels', async () => {
  octokit.rest.issues.addLabels = jest
    .fn()
    .mockRejectedValue(new Error('API Error'))

  await expect(
    label(issueNumber, context, octokit, ['test-label'], [])
  ).rejects.toThrow('API Error')
})

test('handles API error when removing labels', async () => {
  octokit.rest.issues.removeLabel = jest
    .fn()
    .mockRejectedValue(new Error('API Error'))

  await expect(
    label(issueNumber, context, octokit, [], ['deploy-failed'])
  ).rejects.toThrow('API Error')
})

test('handles API error when listing labels', async () => {
  octokit.rest.issues.listLabelsOnIssue = jest
    .fn()
    .mockRejectedValue(new Error('API Error'))

  await expect(
    label(issueNumber, context, octokit, [], ['test-label'])
  ).rejects.toThrow('API Error')
})

test('handles empty labels array from API', async () => {
  octokit.rest.issues.listLabelsOnIssue = jest.fn().mockResolvedValue({
    data: []
  })

  expect(
    await label(issueNumber, context, octokit, ['new-label'], ['non-existent'])
  ).toStrictEqual({
    added: ['new-label'],
    removed: []
  })
})

test('handles labels with special characters', async () => {
  expect(
    await label(
      issueNumber,
      context,
      octokit,
      ['ready-for-deployment/staging'],
      ['deploy-failed']
    )
  ).toStrictEqual({
    added: ['ready-for-deployment/staging'],
    removed: ['deploy-failed']
  })
})

test('handles multiple labels with same name in different arrays', async () => {
  // Mock the listLabelsOnIssue to return the label so it can be removed
  octokit.rest.issues.listLabelsOnIssue = jest.fn().mockReturnValueOnce({
    data: [
      {
        name: 'test-label'
      }
    ]
  })

  expect(
    await label(issueNumber, context, octokit, ['test-label'], ['test-label'])
  ).toStrictEqual({
    added: ['test-label'],
    removed: ['test-label']
  })
})

test('handles very long label names', async () => {
  const longLabel = 'a'.repeat(200)
  expect(
    await label(issueNumber, context, octokit, [longLabel], [])
  ).toStrictEqual({
    added: [longLabel],
    removed: []
  })
})

test('handles case sensitivity in label names', async () => {
  octokit.rest.issues.listLabelsOnIssue = jest.fn().mockResolvedValue({
    data: [
      {
        name: 'Deploy-Failed' // Capital D
      }
    ]
  })

  expect(
    await label(issueNumber, context, octokit, [], ['deploy-failed']) // lowercase d
  ).toStrictEqual({
    added: [],
    removed: [] // Should not match due to case sensitivity
  })
})
