import {
  EVALUATION_CRITERIA,
  EVALUATION_RESULT,
  PR_STATUS,
  REVIEW_DECISION
} from './constants.ts'
import type {StatusResult} from './status.ts'

export type EvaluationCriterion =
  | {kind: 'approved'; source: string}
  | {kind: 'ci_passing'; source: string}
  | {kind: 'mergeable'; source: string}
  | {kind: 'not_draft'; source: string}
  | {kind: 'min_approvals'; minimum: number; source: string}

interface OutputCoreApi {
  debug(message: string): void
  info(message: string): void
  warning(message: string): void
  setOutput(name: string, value: unknown): void
}

interface OutputDependencies {
  core: OutputCoreApi
}

interface EvaluationData {
  evaluations: readonly string[]
}

const MIN_APPROVALS_PATTERN = /^min_approvals=(0|[1-9][0-9]*)$/

export function parseEvaluationCriteria(
  evaluations: readonly string[]
): EvaluationCriterion[] {
  return evaluations.map(evaluation => {
    if (evaluation === EVALUATION_CRITERIA.APPROVED) {
      return {kind: EVALUATION_CRITERIA.APPROVED, source: evaluation}
    }
    if (evaluation === EVALUATION_CRITERIA.CI_PASSING) {
      return {kind: EVALUATION_CRITERIA.CI_PASSING, source: evaluation}
    }
    if (evaluation === EVALUATION_CRITERIA.MERGEABLE) {
      return {kind: EVALUATION_CRITERIA.MERGEABLE, source: evaluation}
    }
    if (evaluation === EVALUATION_CRITERIA.NOT_DRAFT) {
      return {kind: EVALUATION_CRITERIA.NOT_DRAFT, source: evaluation}
    }

    const minimumMatch = MIN_APPROVALS_PATTERN.exec(evaluation)
    if (minimumMatch !== null) {
      return {
        kind: EVALUATION_CRITERIA.MIN_APPROVALS,
        minimum: Number(minimumMatch[1]),
        source: evaluation
      }
    }

    throw new Error(`Invalid evaluation criterion: ${evaluation}`)
  })
}

export function evaluateCriterion(
  status: StatusResult,
  criterion: EvaluationCriterion
): boolean {
  if (criterion.kind === EVALUATION_CRITERIA.APPROVED) {
    return (
      status.review_decision === REVIEW_DECISION.APPROVED ||
      status.review_decision === null
    )
  }
  if (criterion.kind === EVALUATION_CRITERIA.CI_PASSING) {
    return status.commit_status === PR_STATUS.SUCCESS
  }
  if (criterion.kind === EVALUATION_CRITERIA.MERGEABLE) {
    return status.mergeable_state === 'MERGEABLE'
  }
  if (criterion.kind === EVALUATION_CRITERIA.NOT_DRAFT) {
    return !status.is_draft
  }
  return status.total_approvals >= criterion.minimum
}

export function outputs(
  status: StatusResult,
  data: EvaluationData,
  dependencies: OutputDependencies
): boolean {
  const criteria = parseEvaluationCriteria(data.evaluations)
  const {core} = dependencies

  core.debug('📊 Setting GitHub Actions outputs...')
  core.setOutput('review_decision', status.review_decision)
  core.setOutput('total_approvals', status.total_approvals)
  core.setOutput('merge_state_status', status.merge_state_status)
  core.setOutput('commit_status', status.commit_status)
  core.setOutput('mergeable_state', status.mergeable_state)
  core.setOutput('is_draft', status.is_draft ? 'true' : 'false')

  const approved = evaluateCriterion(status, {
    kind: EVALUATION_CRITERIA.APPROVED,
    source: EVALUATION_CRITERIA.APPROVED
  })
  if (status.review_decision === null) {
    core.info(
      '💡 PR has no approval requirements so it is technically considered approved'
    )
  }
  core.setOutput('approved', approved ? 'true' : 'false')

  if (criteria.length === 0) {
    core.info('💡 No evaluation criteria provided')
  } else {
    core.info(
      `🔍 Evaluating ${criteria.length} criteria: ${data.evaluations.join(', ')}`
    )
  }

  let passed = true
  for (const criterion of criteria) {
    if (!evaluateCriterion(status, criterion)) {
      core.warning(failureMessage(status, criterion))
      passed = false
    }
  }

  core.setOutput(
    'evaluation',
    passed ? EVALUATION_RESULT.PASS : EVALUATION_RESULT.FAIL
  )
  return passed
}

function failureMessage(
  status: StatusResult,
  criterion: EvaluationCriterion
): string {
  if (criterion.kind === EVALUATION_CRITERIA.APPROVED) {
    return `⚠️ Evaluation '${criterion.source}' failed - PR is not approved`
  }
  if (criterion.kind === EVALUATION_CRITERIA.CI_PASSING) {
    return `⚠️ Evaluation '${criterion.source}' failed - commit status is not successful`
  }
  if (criterion.kind === EVALUATION_CRITERIA.MERGEABLE) {
    return `⚠️ Evaluation '${criterion.source}' failed - PR is not in a mergeable state`
  }
  if (criterion.kind === EVALUATION_CRITERIA.NOT_DRAFT) {
    return `⚠️ Evaluation '${criterion.source}' failed - PR is in draft status`
  }
  return `⚠️ Evaluation '${criterion.source}' failed - PR only has ${status.total_approvals} approvals, but requires at least ${criterion.minimum} approvals`
}
