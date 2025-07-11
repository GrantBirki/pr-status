import * as core from '@actions/core'
import {
  REVIEW_DECISION,
  EVALUATION_RESULT,
  EVALUATION_CRITERIA,
  PR_STATUS
} from './constants'

// Helper function for setting GitHub Actions outputs
// :param status: The object containing the relevant status information
// :param data: The object containing the relevant data information
// :return: nothing
export function outputs(status, data) {
  // set the outputs
  core.setOutput('review_decision', status.review_decision || null)
  core.setOutput('total_approvals', status.total_approvals || 0)
  core.setOutput('merge_state_status', status.merge_state_status || null)
  core.setOutput('commit_status', status.commit_status || null)

  // set the approved output depending on the review decision
  if (status.review_decision === REVIEW_DECISION.APPROVED) {
    core.setOutput('approved', 'true')
  } else if (status.review_decision === null) {
    core.info(
      'PR has no approval requirements so it is technically considered approved'
    )
    core.setOutput('approved', 'true')
  } else {
    core.setOutput('approved', 'false')
  }

  // set the evaluation output depending on the input criteria
  // if no evaluations were provided, set the output to null
  if (data.evaluations.length === 0) {
    core.setOutput('evaluation', null)
  }

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
      core.warning(`evaluation '${evaluation}' failed - PR is not approved`)
      return false
    }
  } else if (evaluation === EVALUATION_CRITERIA.MERGEABLE) {
    if (status.merge_state_status !== 'CLEAN') {
      core.warning(
        `evaluation '${evaluation}' failed - PR is not cleanly mergeable`
      )
      return false
    }
  } else if (evaluation === EVALUATION_CRITERIA.CI_PASSING) {
    if (status.commit_status !== PR_STATUS.SUCCESS && status.commit_status !== null) {
      core.warning(
        `evaluation '${evaluation}' failed - commit status is not successful`
      )
      return false
    }
  } else if (evaluation.includes(EVALUATION_CRITERIA.MIN_APPROVALS)) {
    try {
      const minApprovals = parseMinApprovals(evaluation)
      if (status.total_approvals < minApprovals) {
        core.warning(
          `evaluation '${evaluation}' failed - PR only has ${status.total_approvals} approvals, but requires at least ${minApprovals} approvals as configured by this action`
        )
        return false
      }
    } catch (error) {
      core.warning(
        `evaluation '${evaluation}' failed - ${error.message}`
      )
      return false
    }
  } else {
    core.warning(
      `evaluation '${evaluation}' failed - unknown evaluation criteria`
    )
    return false
  }
  
  return true
}

  // iterate over all the evaluations and check them
  let pass = true
  data.evaluations.forEach(evaluation => {
    if (!evaluateCriteria(evaluation, status)) {
      pass = false
    }
  })

  core.setOutput('evaluation', pass ? EVALUATION_RESULT.PASS : EVALUATION_RESULT.FAIL)
  core.debug(`evaluation: ${pass ? 'PASS ✅' : 'FAIL ❌'}`)

  return pass
}
