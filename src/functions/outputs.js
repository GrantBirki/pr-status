import * as core from '@actions/core'
import {
  REVIEW_DECISION,
  EVALUATION_RESULT,
  EVALUATION_CRITERIA,
  PR_STATUS
} from './constants'

/**
 * Set GitHub Actions outputs and evaluate criteria
 * @param {Object} status - The object containing the relevant status information
 * @param {Object} data - The object containing the relevant data information
 * @returns {boolean} Whether all evaluation criteria pass
 */
export function outputs(status, data) {
  core.debug('📊 Setting GitHub Actions outputs...')

  // Set the outputs
  core.setOutput('review_decision', status.review_decision || null)
  core.setOutput('total_approvals', status.total_approvals || 0)
  core.setOutput('merge_state_status', status.merge_state_status || null)
  core.setOutput('commit_status', status.commit_status || null)
  core.setOutput('mergeable_state', status.mergeable_state || null)
  core.setOutput('is_draft', status.is_draft ? 'true' : 'false')

  // Set the approved output depending on the review decision
  if (status.review_decision === REVIEW_DECISION.APPROVED) {
    core.setOutput('approved', 'true')
  } else if (status.review_decision === null) {
    core.info(
      '💡 PR has no approval requirements so it is technically considered approved'
    )
    core.setOutput('approved', 'true')
  } else {
    core.setOutput('approved', 'false')
  }

  // Set the evaluation output depending on the input criteria
  if (data.evaluations.length === 0) {
    core.info('💡 No evaluation criteria provided')
    core.setOutput('evaluation', EVALUATION_RESULT.PASS)
    core.info(`📊 Evaluation result: PASS ✅`)
    return true // Default to pass when no criteria
  }

  core.info(
    `🔍 Evaluating ${data.evaluations.length} criteria: ${data.evaluations.join(', ')}`
  )

  /**
   * Parse and validate min_approvals evaluation criteria
   * @param {string} evaluation - The evaluation string (e.g., "min_approvals=2")
   * @returns {number} The minimum number of approvals required
   * @throws {Error} If the parsing fails or number is invalid
   */
  function parseMinApprovals(evaluation) {
    const parts = evaluation.split('=')
    if (parts.length !== 2) {
      throw new Error(`Invalid min_approvals format: ${evaluation}`)
    }

    const minApprovals = parseInt(parts[1], 10)
    if (isNaN(minApprovals) || minApprovals < 0) {
      throw new Error(`Invalid min_approvals value: ${parts[1]}`)
    }

    return minApprovals
  }

  /**
   * Evaluate a single evaluation criteria
   * @param {string} evaluation - The evaluation criteria to check
   * @param {Object} status - The status object containing PR information
   * @returns {boolean} True if the evaluation passes, false otherwise
   */
  function evaluateCriteria(evaluation, status) {
    if (evaluation === EVALUATION_CRITERIA.APPROVED) {
      if (
        status.review_decision !== REVIEW_DECISION.APPROVED &&
        status.review_decision !== null
      ) {
        core.warning(
          `⚠️ Evaluation '${evaluation}' failed - PR is not approved`
        )
        return false
      }
    } else if (evaluation === EVALUATION_CRITERIA.MERGEABLE) {
      if (status.mergeable_state !== 'MERGEABLE') {
        core.warning(
          `⚠️ Evaluation '${evaluation}' failed - PR is not in a mergeable state`
        )
        return false
      }
    } else if (evaluation === EVALUATION_CRITERIA.CI_PASSING) {
      if (
        status.commit_status !== PR_STATUS.SUCCESS &&
        status.commit_status !== null
      ) {
        core.warning(
          `⚠️ Evaluation '${evaluation}' failed - commit status is not successful`
        )
        return false
      }
    } else if (evaluation === EVALUATION_CRITERIA.NOT_DRAFT) {
      if (status.is_draft === true) {
        core.warning(
          `⚠️ Evaluation '${evaluation}' failed - PR is in draft status`
        )
        return false
      }
    } else if (evaluation.includes(EVALUATION_CRITERIA.MIN_APPROVALS)) {
      try {
        const minApprovals = parseMinApprovals(evaluation)
        if (status.total_approvals < minApprovals) {
          core.warning(
            `⚠️ Evaluation '${evaluation}' failed - PR only has ${status.total_approvals} approvals, but requires at least ${minApprovals} approvals`
          )
          return false
        }
      } catch (error) {
        core.warning(`⚠️ Evaluation '${evaluation}' failed - ${error.message}`)
        return false
      }
    } else {
      core.warning(
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

  core.setOutput(
    'evaluation',
    pass ? EVALUATION_RESULT.PASS : EVALUATION_RESULT.FAIL
  )

  return pass
}
