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
      commitStatus =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes
          .filter(x => x.isRequired)
          .reduce(
            (acc, x) => acc && ['SUCCESS', 'SKIPPED'].includes(x.conclusion),
            true
          )
          ? 'SUCCESS'
          : 'FAILURE'

      // If there are CI checked defined, we need to check for the 'state' of the latest commit
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

  return {
    review_decision: result?.repository?.pullRequest?.reviewDecision,
    total_approvals: result?.repository?.pullRequest?.reviews?.totalCount,
    merge_state_status: result?.repository?.pullRequest?.mergeStateStatus,
    commit_status: commitStatus
  }
}
