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
                      name
                    }
                    ... on StatusContext {
                      isRequired(pullRequestNumber:$number)
                      state
                      context
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

  // Get the checks to exclude from status evaluation
  const excludeChecks = data.excludeChecks || []
  const currentActionName = data.workflow || 'pr-status'

  // Combine default exclusions with user-provided exclusions
  const checksToExclude = [...excludeChecks, currentActionName].filter(Boolean)
  core.info(
    `Checks to exclude from status evaluation: ${checksToExclude.join(', ')}`
  )

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
      // Log all available checks for debugging
      const allChecks =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
          .contexts.nodes
      core.info(
        `📋 Found ${allChecks.length} total CI checks on this pull request`
      )
      allChecks.forEach(check => {
        const checkName = check.name || check.context || 'Unknown'
        const isRequired = check.isRequired ? '(required)' : '(optional)'
        const checkStatus = (
          check.conclusion ||
          check.state ||
          'UNKNOWN'
        ).toUpperCase()
        core.info(`  - ${checkName} ${isRequired}: ${checkStatus}`)
      })

      // https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks#check-statuses-and-conclusions
      const filteredChecks =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes
          .filter(x => x.isRequired)
          .filter(x => {
            // Exclude specified checks from status evaluation using EXACT matching
            // For CheckRun nodes, use the 'name' field
            // For StatusContext nodes, use the 'context' field
            const checkName = x.name || x.context
            if (!checkName) {
              // If no name/context available, don't exclude it
              return true
            }

            const shouldExclude = checksToExclude.some(
              excludePattern => checkName === excludePattern
            )
            if (shouldExclude) {
              core.info(`Excluding check from status evaluation: ${checkName}`)
            }
            return !shouldExclude
          })

      core.info(
        `Evaluating ${filteredChecks.length} required checks (after exclusions)`
      )

      // Log the status of each required check for debugging
      let hasFailingCheck = false
      filteredChecks.forEach(check => {
        const checkName = check.name || check.context || 'Unknown'
        const checkStatus = (
          check.conclusion ||
          check.state ||
          ''
        ).toUpperCase()
        const isSuccessful = ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(
          checkStatus
        )

        if (isSuccessful) {
          core.info(`✅ Required check '${checkName}': ${checkStatus}`)
        } else {
          core.info(
            `❌ Required check '${checkName}': ${checkStatus} (FAILING)`
          )
          hasFailingCheck = true
        }
      })

      commitStatus = filteredChecks.reduce(
        (acc, x) =>
          acc &&
          ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(
            (x.conclusion || x.state || '').toUpperCase()
          ),
        true
      )
        ? 'SUCCESS'
        : 'FAILURE'

      if (hasFailingCheck) {
        core.info(
          `🔴 Overall required checks status: FAILURE (one or more required checks failed)`
        )
      } else {
        core.info(
          `🟢 Overall required checks status: SUCCESS (all required checks passed)`
        )
      }

      // If there are CI check defined, we need to check for the 'state' of the latest commit
      // We'll filter out excluded checks from the overall state calculation too
    } else {
      // Log all available checks for debugging
      const allAvailableChecks =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
          .contexts.nodes
      core.info(
        `📋 Found ${allAvailableChecks.length} total CI checks on this pull request`
      )
      allAvailableChecks.forEach(check => {
        const checkName = check.name || check.context || 'Unknown'
        const isRequired = check.isRequired ? '(required)' : '(optional)'
        const checkStatus = (
          check.conclusion ||
          check.state ||
          'UNKNOWN'
        ).toUpperCase()
        core.info(`  - ${checkName} ${isRequired}: ${checkStatus}`)
      })

      const allChecks =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
          .contexts.nodes
      const filteredChecks = allChecks.filter(x => {
        // Exclude specified checks from status evaluation using EXACT matching
        // For CheckRun nodes, use the 'name' field
        // For StatusContext nodes, use the 'context' field
        const checkName = x.name || x.context
        if (!checkName) {
          // If no name/context available, don't exclude it
          return true
        }

        const shouldExclude = checksToExclude.some(
          excludePattern => checkName === excludePattern
        )
        if (shouldExclude) {
          core.info(`Excluding check from status evaluation: ${checkName}`)
        }
        return !shouldExclude
      })

      core.info(
        `Evaluating ${filteredChecks.length} total checks (after exclusions)`
      )

      // If all other checks are successful, return SUCCESS, otherwise use the overall state
      if (filteredChecks.length === 0) {
        core.info(
          '💡 no other CI checks found after filtering out excluded checks'
        )
        commitStatus = null
      } else {
        // Log the status of each check for debugging
        let hasFailingCheck = false
        filteredChecks.forEach(check => {
          const checkName = check.name || check.context || 'Unknown'
          const checkStatus = (
            check.conclusion ||
            check.state ||
            ''
          ).toUpperCase()
          const isSuccessful = ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(
            checkStatus
          )

          if (isSuccessful) {
            core.info(`✅ Check '${checkName}': ${checkStatus}`)
          } else {
            core.info(`❌ Check '${checkName}': ${checkStatus} (FAILING)`)
            hasFailingCheck = true
          }
        })

        const allOtherChecksSuccessful = filteredChecks.every(x =>
          ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(
            (x.conclusion || x.state || '').toUpperCase()
          )
        )
        commitStatus = allOtherChecksSuccessful
          ? 'SUCCESS'
          : result.repository.pullRequest.commits.nodes[0].commit
              .statusCheckRollup.state

        if (hasFailingCheck) {
          const overallState =
            result.repository.pullRequest.commits.nodes[0].commit
              .statusCheckRollup.state
          core.info(
            `🔴 Overall CI status: ${overallState} (one or more checks failed)`
          )
        } else {
          core.info(`🟢 Overall CI status: SUCCESS (all checks passed)`)
        }
      }
    }
  } catch (e) {
    core.info(
      `could not retrieve PR commit status: ${e} - Handled: ${COLORS.success}OK`
    )
    core.info('this repo may not have any CI checks defined')
    core.info('skipping commit status check and proceeding...')
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
