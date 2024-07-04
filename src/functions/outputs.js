import * as core from '@actions/core'

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
  if (status.review_decision === 'APPROVED') {
    core.setOutput('approved', 'true')
  } else {
    core.setOutput('approved', 'false')
  }

  // set the evaluation output depending on the input criteria
  // if no evaluations were provided, set the output to null
  if (data.evaluations.length === 0) {
    core.setOutput('evaluations', null)
  }

  // iterate over all the evaluations and check them
  var pass = true
  data.evaluations.forEach(evaluation => {
    if (evaluation === 'approved') {
      if (status.review_decision !== 'APPROVED') {
        core.debug(`evaluation '${evaluation}' failed - PR is not approved`)
        pass = false
      }
    } else if (evaluation === 'mergeable') {
      if (status.merge_state_status !== 'CLEAN') {
        core.debug(
          `evaluation '${evaluation}' failed - PR is not cleanly mergeable`
        )
        pass = false
      }
    } else if (evaluation === 'ci_passing') {
      if (status.commit_status !== 'SUCCESS' || status.commit_status === null) {
        core.debug(
          `evaluation '${evaluation}' failed - commit status is not successful`
        )
        pass = false
      }
    } else {
      core.debug(
        `evaluation '${evaluation}' failed - unknown evaluation criteria`
      )
      pass = false
    }
  })

  core.setOutput('evaluation', pass ? 'PASS' : 'FAIL')
  core.info(`evaluation: ${pass ? 'PASS ✅' : 'FAIL ❌'}`)

  return pass
}
