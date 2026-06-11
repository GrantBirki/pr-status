import * as core from '@actions/core'
import {
  REVIEW_DECISION,
  EVALUATION_RESULT,
  EVALUATION_CRITERIA,
  PR_STATUS
} from './constants.ts'
import type {
  ActionData,
  CoreDependencies,
  StatusResult
} from '../types.ts'

const defaultDependencies: CoreDependencies = {core}

/**
 * Set GitHub Actions outputs and evaluate criteria
 * @param {Object} status - The object containing the relevant status information
 * @param {Object} data - The object containing the relevant data information
 * @returns {boolean} Whether all evaluation criteria pass
 */
export function outputs(
  status: StatusResult,
  data: Pick<ActionData, 'evaluations'>,
  dependencies: CoreDependencies = defaultDependencies
): boolean {
  const coreApi = dependencies.core

  coreApi.debug('📊 Setting GitHub Actions outputs...')

  // Set the outputs
  coreApi.setOutput('review_decision', status.review_decision || null)
  coreApi.setOutput('total_approvals', status.total_approvals || 0)
  coreApi.setOutput('merge_state_status', status.merge_state_status || null)
  coreApi.setOutput('commit_status', status.commit_status || null)
  coreApi.setOutput('mergeable_state', status.mergeable_state || null)
  coreApi.setOutput('is_draft', status.is_draft ? 'true' : 'false')

  // Set the approved output depending on the review decision
  if (status.review_decision === REVIEW_DECISION.APPROVED) {
    coreApi.setOutput('approved', 'true')
  } else if (status.review_decision === null) {
    coreApi.info(
      '💡 PR has no approval requirements so it is technically considered approved'
    )
    coreApi.setOutput('approved', 'true')
  } else {
    coreApi.setOutput('approved', 'false')
  }

  // Set the evaluation output depending on the input criteria
  if (data.evaluations.length === 0) {
    coreApi.info('💡 No evaluation criteria provided')
    coreApi.setOutput('evaluation', EVALUATION_RESULT.PASS)
    coreApi.info('📊 Evaluation result: PASS ✅')
    return true // Default to pass when no criteria
  }

  coreApi.info(
    `🔍 Evaluating ${data.evaluations.length} criteria: ${data.evaluations.join(', ')}`
  )

  /**
   * Parse and validate min_approvals evaluation criteria
   * @param {string} evaluation - The evaluation string (e.g., "min_approvals=2")
   * @returns {number} The minimum number of approvals required
   * @throws {Error} If the parsing fails or number is invalid
   */
  function parseMinApprovals(evaluation: string): number {
    const parts = evaluation.split('=')
    if (parts.length !== 2) {
      throw new Error(`Invalid min_approvals format: ${evaluation}`)
    }

    const value = parts[1]!
    const minApprovals = parseInt(value, 10)
    if (isNaN(minApprovals) || minApprovals < 0) {
      throw new Error(`Invalid min_approvals value: ${value}`)
    }

    return minApprovals
  }

  /**
   * Evaluate a single evaluation criteria
   * @param {string} evaluation - The evaluation criteria to check
   * @param {Object} status - The status object containing PR information
   * @returns {boolean} True if the evaluation passes, false otherwise
   */
  function evaluateCriteria(
    evaluation: string,
    statusResult: StatusResult
  ): boolean {
    if (evaluation === EVALUATION_CRITERIA.APPROVED) {
      if (
        statusResult.review_decision !== REVIEW_DECISION.APPROVED &&
        statusResult.review_decision !== null
      ) {
        coreApi.warning(
          `⚠️ Evaluation '${evaluation}' failed - PR is not approved`
        )
        return false
      }
    } else if (evaluation === EVALUATION_CRITERIA.MERGEABLE) {
      if (statusResult.mergeable_state !== 'MERGEABLE') {
        coreApi.warning(
          `⚠️ Evaluation '${evaluation}' failed - PR is not in a mergeable state`
        )
        return false
      }
    } else if (evaluation === EVALUATION_CRITERIA.CI_PASSING) {
      if (
        statusResult.commit_status !== PR_STATUS.SUCCESS &&
        statusResult.commit_status !== null
      ) {
        coreApi.warning(
          `⚠️ Evaluation '${evaluation}' failed - commit status is not successful`
        )
        return false
      }
    } else if (evaluation === EVALUATION_CRITERIA.NOT_DRAFT) {
      if (statusResult.is_draft === true) {
        coreApi.warning(
          `⚠️ Evaluation '${evaluation}' failed - PR is in draft status`
        )
        return false
      }
    } else if (evaluation.includes(EVALUATION_CRITERIA.MIN_APPROVALS)) {
      try {
        const minApprovals = parseMinApprovals(evaluation)
        const totalApprovals = statusResult.total_approvals
        if ((totalApprovals ?? 0) < minApprovals) {
          coreApi.warning(
            `⚠️ Evaluation '${evaluation}' failed - PR only has ${totalApprovals} approvals, but requires at least ${minApprovals} approvals`
          )
          return false
        }
      } catch (error: unknown) {
        coreApi.warning(
          `⚠️ Evaluation '${evaluation}' failed - ${(error as Error).message}`
        )
        return false
      }
    } else {
      coreApi.warning(
        `⚠️ Evaluation '${evaluation}' failed - unknown evaluation criteria`
      )
      return false
    }

    return true
  }

  // Iterate over all the evaluations and check them
  let pass = true
  data.evaluations.forEach(evaluation => {
    if (!evaluateCriteria(evaluation, status)) {
      pass = false
    }
  })

  coreApi.setOutput(
    'evaluation',
    pass ? EVALUATION_RESULT.PASS : EVALUATION_RESULT.FAIL
  )

  return pass
}
