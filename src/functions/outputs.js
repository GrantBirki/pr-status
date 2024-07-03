import * as core from '@actions/core'

// Helper function for setting GitHub Actions outputs
// :param statusResult: The object containing the relevant status information
// :return: nothing
export function outputs(statusResult) {
  // set the outputs
  core.setOutput('review_decision', statusResult.review_decision || null)
  core.setOutput('total_approvals', statusResult.total_approvals || 0)
  core.setOutput('merge_state_status', statusResult.merge_state_status || null)
  core.setOutput('commit_status', statusResult.commit_status || null)

  // set the approved output depending on the review decision
  if (statusResult.review_decision === 'APPROVED') {
    core.setOutput('approved', 'true')
  } else {
    core.setOutput('approved', 'false')
  }
}
