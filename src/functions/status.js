import * as core from '@actions/core'
import {COLORS} from './colors'

/**
 * Get the name of a check from either CheckRun or StatusContext node
 * @param {Object} check - The check object (CheckRun or StatusContext)
 * @returns {string} The check name
 */
function getCheckName(check) {
  return check.name || check.context || 'Unknown'
}

/**
 * Get the status of a check from either CheckRun or StatusContext node
 * @param {Object} check - The check object (CheckRun or StatusContext)
 * @returns {string} The check status in uppercase
 */
function getCheckStatus(check) {
  return (check.conclusion || check.state || 'UNKNOWN').toUpperCase()
}

/**
 * Check if a status is considered successful
 * @param {string} status - The status to check
 * @returns {boolean} True if successful
 */
function isSuccessfulStatus(status) {
  return ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(status)
}

/**
 * Log all available checks for debugging purposes
 * @param {Array} checks - Array of check objects
 */
function logAllChecks(checks) {
  core.info(`📋 Found ${checks.length} total CI checks on this pull request`)
  checks.forEach(check => {
    const checkName = getCheckName(check)
    const isRequired = check.isRequired ? '(required)' : '(optional)'
    const checkStatus = getCheckStatus(check)
    core.info(`  - ${checkName} ${isRequired}: ${checkStatus}`)
  })
}

/**
 * Filter checks by excluding specified patterns using exact matching
 * @param {Array} checks - Array of check objects
 * @param {Array} excludePatterns - Array of patterns to exclude
 * @returns {Array} Filtered array of checks
 */
function filterExcludedChecks(checks, excludePatterns) {
  return checks.filter(check => {
    const checkName = getCheckName(check)
    if (checkName === 'Unknown') {
      // If no name/context available, don't exclude it
      return true
    }

    const shouldExclude = excludePatterns.some(
      excludePattern => checkName === excludePattern
    )
    if (shouldExclude) {
      core.info(`Excluding check from status evaluation: ${checkName}`)
    }
    return !shouldExclude
  })
}

/**
 * Log the status of each check and return overall failure status
 * @param {Array} checks - Array of check objects
 * @param {string} checkType - Type of checks ('required' or 'all')
 * @returns {boolean} True if any check is failing
 */
function logCheckResults(checks, checkType = 'check') {
  let hasFailingCheck = false

  checks.forEach(check => {
    const checkName = getCheckName(check)
    const checkStatus = getCheckStatus(check)
    const isSuccessful = isSuccessfulStatus(checkStatus)

    if (isSuccessful) {
      const prefix = checkType === 'required' ? 'Required check' : 'Check'
      core.info(`✅ ${prefix} '${checkName}': ${checkStatus}`)
    } else {
      const prefix = checkType === 'required' ? 'Required check' : 'Check'
      core.info(`❌ ${prefix} '${checkName}': ${checkStatus} (FAILING)`)
      hasFailingCheck = true
    }
  })

  return hasFailingCheck
}

/**
 * Evaluate if all checks are successful
 * @param {Array} checks - Array of check objects
 * @returns {boolean} True if all checks are successful
 */
function areAllChecksSuccessful(checks) {
  return checks.every(check => {
    const status = getCheckStatus(check)
    return isSuccessfulStatus(status)
  })
}

/**
 * Log the overall status summary
 * @param {boolean} hasFailures - Whether there are failing checks
 * @param {string} checkType - Type of checks ('required' or 'all')
 * @param {string} overallState - The overall state from GitHub (for 'all' mode)
 */
function logOverallStatus(hasFailures, checkType, overallState = null) {
  if (hasFailures) {
    if (checkType === 'required') {
      core.info(
        `🔴 Overall required checks status: FAILURE (one or more required checks failed)`
      )
    } else {
      core.info(
        `🔴 Overall CI status: ${overallState} (one or more checks failed)`
      )
    }
  } else {
    if (checkType === 'required') {
      core.info(
        `🟢 Overall required checks status: SUCCESS (all required checks passed)`
      )
    } else {
      core.info(`🟢 Overall CI status: SUCCESS (all checks passed)`)
    }
  }
}

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
      logAllChecks(allChecks)

      // Filter to required checks only, then exclude specified checks
      const requiredChecks = allChecks.filter(x => x.isRequired)
      const filteredChecks = filterExcludedChecks(
        requiredChecks,
        checksToExclude
      )

      core.info(
        `Evaluating ${filteredChecks.length} required checks (after exclusions)`
      )

      // Log the status of each required check and check for failures
      const hasFailingCheck = logCheckResults(filteredChecks, 'required')

      // Determine overall status
      commitStatus = areAllChecksSuccessful(filteredChecks)
        ? 'SUCCESS'
        : 'FAILURE'

      // Log overall status summary
      logOverallStatus(hasFailingCheck, 'required')

      // If there are CI check defined, we need to check for the 'state' of the latest commit
      // We'll filter out excluded checks from the overall state calculation too
    } else {
      // Log all available checks for debugging
      const allChecks =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
          .contexts.nodes
      logAllChecks(allChecks)

      // Filter out excluded checks
      const filteredChecks = filterExcludedChecks(allChecks, checksToExclude)

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
        // Log the status of each check and check for failures
        const hasFailingCheck = logCheckResults(filteredChecks, 'all')

        // Determine overall status
        const allSuccessful = areAllChecksSuccessful(filteredChecks)
        commitStatus = allSuccessful
          ? 'SUCCESS'
          : result.repository.pullRequest.commits.nodes[0].commit
              .statusCheckRollup.state

        // Log overall status summary
        const overallState =
          result.repository.pullRequest.commits.nodes[0].commit
            .statusCheckRollup.state
        logOverallStatus(hasFailingCheck, 'all', overallState)
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
