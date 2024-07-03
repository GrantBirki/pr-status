import * as core from '@actions/core'

// Helper function for setting GitHub Actions outputs
// :param statusResult: The object containing the relevant status information
// :return: nothing
export function outputs(statusResult) {
  // set the outputs
  core.setOutput('review_decision', statusResult.review_decision)
  core.setOutput('total_approvals', statusResult.total_approvals)
  core.setOutput('merge_state_status', statusResult.merge_state_status)
  core.setOutput('commit_status', statusResult.commit_status)

  // set the approved output
  if (statusResult.review_decision === 'APPROVED') {
    core.setOutput('approved', 'true')
  } else {
    core.setOutput('approved', 'false')
  }
}
