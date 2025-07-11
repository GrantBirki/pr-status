import {
  GitHubContext,
  ActionData,
  StatusResult,
  LabelActions,
  LabelResult,
  OctokitClient,
  CheckRun,
  StatusContext,
  CheckNode,
  ActionInputs,
  ActionOutputs,
  EvaluationFunction
} from '../src/types'

describe('Type Definitions', () => {
  test('should be able to import all types', () => {
    // Test that all types can be imported without errors
    expect(typeof GitHubContext).toBe('undefined') // Interfaces are types, not runtime values
    expect(typeof ActionData).toBe('undefined')
    expect(typeof StatusResult).toBe('undefined')
    expect(typeof LabelActions).toBe('undefined')
    expect(typeof LabelResult).toBe('undefined')
    expect(typeof OctokitClient).toBe('undefined')
    expect(typeof CheckRun).toBe('undefined')
    expect(typeof StatusContext).toBe('undefined')
    expect(typeof CheckNode).toBe('undefined')
    expect(typeof ActionInputs).toBe('undefined')
    expect(typeof ActionOutputs).toBe('undefined')
    expect(typeof EvaluationFunction).toBe('undefined')
  })

  test('should be able to create objects matching the interfaces', () => {
    const githubContext: GitHubContext = {
      repo: {
        owner: 'test',
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

    const actionData: ActionData = {
      checks: 'all',
      prNumber: 1,
      evaluations: ['approved'],
      excludeChecks: [],
      workflow: 'test'
    }

    const statusResult: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }

    const labelActions: LabelActions = {
      labelsToAdd: ['ready'],
      labelsToRemove: ['draft']
    }

    const labelResult: LabelResult = {
      added: ['ready'],
      removed: ['draft']
    }

    expect(githubContext.repo.owner).toBe('test')
    expect(actionData.checks).toBe('all')
    expect(statusResult.review_decision).toBe('APPROVED')
    expect(labelActions.labelsToAdd[0]).toBe('ready')
    expect(labelResult.added[0]).toBe('ready')
  })

  test('should handle union types correctly', () => {
    const checkRun: CheckRun = {
      name: 'test',
      conclusion: 'SUCCESS',
      isRequired: true
    }

    const statusContext: StatusContext = {
      context: 'test',
      state: 'SUCCESS',
      isRequired: true
    }

    const checkNode1: CheckNode = checkRun
    const checkNode2: CheckNode = statusContext

    expect(checkNode1).toBeDefined()
    expect(checkNode2).toBeDefined()
  })

  test('should handle nullable types correctly', () => {
    const statusResult: StatusResult = {
      review_decision: null,
      total_approvals: 0,
      merge_state_status: null,
      commit_status: null
    }

    expect(statusResult.review_decision).toBeNull()
    expect(statusResult.merge_state_status).toBeNull()
    expect(statusResult.commit_status).toBeNull()
  })

  test('should handle optional properties correctly', () => {
    const actionInputs: ActionInputs = {
      github_token: 'token',
      checks: 'all',
      evaluations: 'approved'
    }

    expect(actionInputs.github_token).toBe('token')
    expect(actionInputs.workflow).toBeUndefined()
    expect(actionInputs.pr_number).toBeUndefined()
  })

  test('should handle function types correctly', () => {
    const evaluationFunction: EvaluationFunction = (
      evaluation: string,
      status: StatusResult
    ) => {
      return evaluation === 'approved' && status.review_decision === 'APPROVED'
    }

    const status: StatusResult = {
      review_decision: 'APPROVED',
      total_approvals: 1,
      merge_state_status: 'CLEAN',
      commit_status: 'SUCCESS'
    }

    expect(evaluationFunction('approved', status)).toBe(true)
    expect(evaluationFunction('rejected', status)).toBe(false)
  })
})
