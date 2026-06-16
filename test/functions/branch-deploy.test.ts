import assert from 'node:assert/strict'
import test from 'node:test'

import {
  determineBranchDeployState,
  parseActionMode,
  parseBooleanInput,
  parseOperationResult,
  parseBranchDeployTransition,
  validateBranchDeployConfiguration
} from '../../src/functions/branch-deploy.ts'
import type {
  OperationResult,
  BranchDeployConfiguration,
  BranchDeployData,
  BranchDeployTransition
} from '../../src/functions/branch-deploy.ts'

const labels = {
  noop: 'ready-for-noop',
  review: 'ready-for-review',
  deploy: 'ready-for-deployment',
  merge: 'ready-to-merge'
}

function configuration(
  overrides: Partial<BranchDeployConfiguration> = {}
): BranchDeployConfiguration {
  return {
    transition: 'review',
    expectedHeadSha: '',
    operationResult: null,
    labels,
    clearOnDraft: true,
    demoteMergeOnReviewFailure: true,
    dryRun: false,
    ...overrides
  }
}

function data(overrides: {
  configuration?: Partial<BranchDeployConfiguration>
  state?: 'OPEN' | 'CLOSED' | 'MERGED'
  headSha?: string
  isDraft?: boolean
  evaluationPassed?: boolean
  currentLabels?: string[]
} = {}): BranchDeployData {
  return {
    configuration: configuration(overrides.configuration),
    pullRequest: {
      state: overrides.state ?? 'OPEN',
      headSha: overrides.headSha ?? 'abc123',
      isDraft: overrides.isDraft ?? false
    },
    evaluationPassed: overrides.evaluationPassed ?? true,
    currentLabels: overrides.currentLabels ?? []
  }
}

function command(
  transition: 'noop' | 'deploy',
  operationResult: OperationResult,
  overrides: Parameters<typeof data>[0] = {}
): BranchDeployData {
  return data({
    ...overrides,
    configuration: {
      ...overrides.configuration,
      transition,
      operationResult,
      expectedHeadSha: 'abc123'
    }
  })
}

test('parses action modes, transitions, operation results, and booleans', () => {
  assert.equal(parseActionMode(''), 'status')
  assert.equal(parseActionMode('status'), 'status')
  assert.equal(parseActionMode('branch-deploy'), 'branch-deploy')
  assert.throws(() => parseActionMode('READY'), /mode must be exactly/)

  for (const transition of [
    'reset',
    'review',
    'noop',
    'deploy',
    'clear'
  ] as const) {
    assert.equal(parseBranchDeployTransition(transition), transition)
  }
  assert.throws(
    () => parseBranchDeployTransition('initialize'),
    /transition must be exactly/
  )

  assert.equal(parseOperationResult('', 'review'), null)
  for (const result of [
    'success',
    'failure',
    'cancelled',
    'skipped'
  ] as const) {
    assert.equal(parseOperationResult(result, 'review'), result)
  }
  assert.throws(
    () => parseOperationResult('', 'noop'),
    /operation_result is required/
  )
  assert.throws(
    () => parseOperationResult('unknown', 'clear'),
    /operation_result must be exactly/
  )

  assert.equal(parseBooleanInput('dry_run', 'true'), true)
  assert.equal(parseBooleanInput('dry_run', 'false'), false)
  assert.throws(
    () => parseBooleanInput('dry_run', 'TRUE'),
    /dry_run must be exactly/
  )
})

test('validates branch-deploy labels and head-bound transitions', () => {
  assert.doesNotThrow(() => validateBranchDeployConfiguration(configuration()))
  assert.throws(
    () =>
      validateBranchDeployConfiguration(
        configuration({labels: {...labels, noop: '  '}})
      ),
    /labels must not be empty/
  )
  assert.throws(
    () =>
      validateBranchDeployConfiguration(
        configuration({labels: {...labels, review: labels.noop}})
      ),
    /labels must be distinct/
  )
  assert.throws(
    () =>
      validateBranchDeployConfiguration(
        configuration({labels: {...labels, review: 'READY-FOR-NOOP'}})
      ),
    /labels must be distinct/
  )

  for (const transition of [
    'reset',
    'noop',
    'deploy'
  ] as BranchDeployTransition[]) {
    assert.throws(
      () =>
        validateBranchDeployConfiguration(
          configuration({transition, operationResult: 'success'})
        ),
      /expected_head_sha is required/
    )
  }
})

test('closed, merged, and draft pull requests clear managed labels', () => {
  const currentLabels = [...Object.values(labels), 'unrelated']
  const cases = [
    data({state: 'CLOSED', currentLabels}),
    data({state: 'MERGED', currentLabels}),
    data({isDraft: true, currentLabels})
  ]

  for (const item of cases) {
    assert.deepEqual(determineBranchDeployState(item), {
      state: 'cleared',
      headMatches: null,
      labelsToAdd: [],
      labelsToRemove: Object.values(labels)
    })
  }

  assert.equal(
    determineBranchDeployState(
      data({
        isDraft: true,
        currentLabels: [labels.review],
        configuration: {clearOnDraft: false}
      })
    ).state,
    'deploy'
  )
})

test('reset, clear, and review transitions use current live state', () => {
  assert.deepEqual(
    determineBranchDeployState(
      data({
        configuration: {
          transition: 'reset',
          expectedHeadSha: 'abc123'
        },
        currentLabels: [labels.review, labels.deploy, 'unrelated']
      })
    ),
    {
      state: 'noop',
      headMatches: true,
      labelsToAdd: [labels.noop],
      labelsToRemove: [labels.review, labels.deploy]
    }
  )

  assert.deepEqual(
    determineBranchDeployState(
      data({
        configuration: {
          transition: 'reset',
          expectedHeadSha: 'old-head'
        },
        currentLabels: [labels.review]
      })
    ),
    {
      state: 'review',
      headMatches: false,
      labelsToAdd: [],
      labelsToRemove: []
    }
  )
  assert.equal(
    determineBranchDeployState(
      data({
        configuration: {transition: 'clear'},
        currentLabels: [labels.deploy]
      })
    ).state,
    'deploy'
  )

  assert.equal(determineBranchDeployState(data()).state, 'noop')
  assert.equal(
    determineBranchDeployState(data({currentLabels: [labels.noop]})).state,
    'noop'
  )
  assert.equal(
    determineBranchDeployState(data({currentLabels: [labels.review]})).state,
    'deploy'
  )
  assert.equal(
    determineBranchDeployState(data({currentLabels: [labels.deploy]})).state,
    'deploy'
  )
  assert.equal(
    determineBranchDeployState(data({currentLabels: [labels.merge]})).state,
    'merge'
  )
  assert.equal(
    determineBranchDeployState(
      data({
        evaluationPassed: false,
        currentLabels: [labels.deploy]
      })
    ).state,
    'review'
  )
  assert.equal(
    determineBranchDeployState(
      data({
        evaluationPassed: false,
        currentLabels: [labels.merge]
      })
    ).state,
    'review'
  )
  assert.equal(
    determineBranchDeployState(
      data({
        evaluationPassed: false,
        currentLabels: [labels.merge],
        configuration: {demoteMergeOnReviewFailure: false}
      })
    ).state,
    'merge'
  )
})

test('conflicting labels select the least-advanced state before review', () => {
  const decision = determineBranchDeployState(
    data({
      currentLabels: [
        labels.merge,
        labels.deploy,
        labels.review,
        labels.noop
      ]
    })
  )

  assert.deepEqual(decision, {
    state: 'noop',
    headMatches: null,
    labelsToAdd: [],
    labelsToRemove: [
      labels.review,
      labels.deploy,
      labels.merge
    ]
  })
})

test('label identity is case-insensitive while mutations retain live casing', () => {
  assert.deepEqual(
    determineBranchDeployState(
      data({
        evaluationPassed: false,
        currentLabels: ['READY-FOR-DEPLOYMENT', 'unrelated']
      })
    ),
    {
      state: 'review',
      headMatches: null,
      labelsToAdd: [labels.review],
      labelsToRemove: ['READY-FOR-DEPLOYMENT']
    }
  )
  assert.deepEqual(
    determineBranchDeployState(
      data({currentLabels: ['READY-FOR-REVIEW']})
    ),
    {
      state: 'deploy',
      headMatches: null,
      labelsToAdd: [labels.deploy],
      labelsToRemove: ['READY-FOR-REVIEW']
    }
  )
})

test('noop transitions use live SHA, operation result, and evaluation', () => {
  assert.deepEqual(determineBranchDeployState(command('noop', 'success')), {
    state: 'deploy',
    headMatches: true,
    labelsToAdd: [labels.deploy],
    labelsToRemove: []
  })
  assert.equal(
    determineBranchDeployState(
      command('noop', 'success', {evaluationPassed: false})
    ).state,
    'review'
  )

  for (const result of ['failure', 'cancelled', 'skipped'] as const) {
    assert.equal(
      determineBranchDeployState(command('noop', result)).state,
      'noop'
    )
  }

  const stale = determineBranchDeployState(
    command('noop', 'success', {
      headSha: 'new-head',
      currentLabels: [labels.review]
    })
  )
  assert.deepEqual(stale, {
    state: 'noop',
    headMatches: false,
    labelsToAdd: [labels.noop],
    labelsToRemove: [labels.review]
  })
})

test('deploy transitions converge failed and successful commands', () => {
  assert.deepEqual(
    determineBranchDeployState(
      command('deploy', 'success', {
        currentLabels: [labels.deploy]
      })
    ),
    {
      state: 'merge',
      headMatches: true,
      labelsToAdd: [labels.merge],
      labelsToRemove: [labels.deploy]
    }
  )

  for (const result of ['failure', 'cancelled', 'skipped'] as const) {
    assert.equal(
      determineBranchDeployState(command('deploy', result)).state,
      'deploy'
    )
  }

  assert.equal(
    determineBranchDeployState(
      command('deploy', 'success', {headSha: 'different-head'})
    ).state,
    'noop'
  )
})

test('already-correct states and dry runs do not change decisions', () => {
  const decision = determineBranchDeployState(
    data({
      configuration: {
        transition: 'reset',
        expectedHeadSha: 'abc123',
        dryRun: true
      },
      currentLabels: [labels.noop, 'unrelated']
    })
  )

  assert.deepEqual(decision, {
    state: 'noop',
    headMatches: true,
    labelsToAdd: [],
    labelsToRemove: []
  })
})
