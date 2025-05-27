import * as core from '@actions/core'
import {COLORS} from './colors'

// Helper function to get the status of a pull request from multiple perspectives
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param prNumber: The pull request number
// :param data: An object containing the checks parameter and other data
// :return: An object containing the review_decision, merge_state_status, and commit_status
export async function status(octokit, context, prNumber, data) {
  const query = `query($owner:String!, $name:String!, $number:Int!) {
    repository(owner:$owner, name:$name) {
        pullRequest(number:$number) {
            reviewDecision
            mergeStateStatus
            commits(last: 1) {
                nodes {
                    commit {
                        checkSuites {
                          totalCount
                        }
                        statusCheckRollup {
                            state
                            contexts(first:100) {
                                nodes {
                                    ... on CheckRun {
                                        isRequired(pullRequestNumber:$number)
                                        conclusion
                                    }
                                }
                            }
                        }
                    }
                }
            }
            reviews(states: APPROVED) {
                totalCount
            }
        }
    }
}`
  // Note: https://docs.github.com/en/graphql/overview/schema-previews#merge-info-preview (mergeStateStatus)
  const variables = {
    owner: context.repo.owner,
    name: context.repo.repo,
    number: parseInt(prNumber),
    headers: {
      Accept: 'application/vnd.github.merge-info-preview+json'
    }
  }
  // Make the GraphQL query
  const result = await octokit.graphql(query, variables)

  var commitStatus = null
  try {
    // If there are no CI checks defined at all, we can set the commitStatus to null
    if (
      result.repository.pullRequest.commits.nodes[0].commit.checkSuites
        .totalCount === 0
    ) {
      core.info('💡 no CI checks have been defined for this pull request')
      commitStatus = null

      // If only the required checks need to pass
    } else if (data.checks === 'required') {
      // https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks#check-statuses-and-conclusions
      commitStatus =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes
          .filter(x => x.isRequired)
          .reduce(
            (acc, x) =>
              acc &&
              ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(
                (x.conclusion || '').toUpperCase()
              ),
            true
          )
          ? 'SUCCESS'
          : 'FAILURE'

      // If there are CI check defined, we need to check for the 'state' of the latest commit
      // TODO: in the future, this might need to be refactored to look through all the checks individually
      // and do a SUCCESS/FAILURE check just so that we are able to filter out "this" check. Meaning, that
      // this current GitHub Action check does not fail the PR as it will always be in a running state
      // at the time of the PR check
      // For now, we will just use the state of the latest commit which will likely include the state of this check
      // and that state will most likely be 'PENDING'. This only really matters if the context of this check (this action)
      // is running on the commit that is being checked. So we should also do a check to see if this current action run's
      // context is the same as the commit that is being checked for the commit status checks
    } else {
      commitStatus =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
          .state
    }
  } catch (e) {
    core.debug(
      `could not retrieve PR commit status: ${e} - Handled: ${COLORS.success}OK`
    )
    core.debug('this repo may not have any CI checks defined')
    core.debug('skipping commit status check and proceeding...')
    commitStatus = null

    // Try to display the raw GraphQL result for debugging purposes
    try {
      core.debug('raw graphql result for debugging:')
      core.debug(result)
    } catch {
      // istanbul ignore next
      core.debug(
        'Could not output raw graphql result for debugging - This is bad'
      )
    }
  }

  const statusResult = {
    review_decision: result?.repository?.pullRequest?.reviewDecision || null,
    total_approvals:
      result?.repository?.pullRequest?.reviews?.totalCount || null,
    merge_state_status:
      result?.repository?.pullRequest?.mergeStateStatus || null,
    commit_status: commitStatus || null
  }

  core.debug(`statusResult: ${JSON.stringify(statusResult, null, 2)}`)

  return statusResult
}
