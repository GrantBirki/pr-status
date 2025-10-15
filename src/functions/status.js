import * as core from '@actions/core'
import {CHECK_STATUS, PR_STATUS, CHECK_TYPES} from './constants'

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
  // For CheckRun, prioritize conclusion over status, then fallback to state
  // For StatusContext, use state
  const status = (
    check.conclusion ||
    check.status ||
    check.state ||
    'UNKNOWN'
  ).toUpperCase()

  // Add debug logging to help troubleshoot cases where we get UNKNOWN
  if (status === 'UNKNOWN') {
    core.debug(`⚠️ Check status is UNKNOWN for check: ${JSON.stringify(check)}`)

    // Try to provide more context about what fields are available
    const availableFields = Object.keys(check).filter(
      key => check[key] !== null && check[key] !== undefined
    )
    core.debug(`Available fields: ${availableFields.join(', ')}`)
  }

  return status
}

/**
 * Check if a status is considered successful
 * @param {string} status - The status to check
 * @returns {boolean} True if successful
 */
function isSuccessfulStatus(status) {
  return [
    CHECK_STATUS.SUCCESS,
    CHECK_STATUS.SKIPPED,
    CHECK_STATUS.NEUTRAL
  ].includes(status)
}

/**
 * Log all available checks for debugging purposes
 * @param {Array} checks - Array of check objects
 */
function logAllChecks(checks) {
  if (checks.length === 0) {
    core.info('📋 No CI checks found on this pull request')
    return
  }

  core.info(`📋 Found ${checks.length} total CI checks on this pull request`)
  checks.forEach(check => {
    const checkName = getCheckName(check)
    const isRequired = check.isRequired ? '(required)' : '(optional)'
    const checkStatus = getCheckStatus(check)
    core.info(`  - check: ${checkName} ${isRequired} - state: ${checkStatus}`)
  })
}

/**
 * Filter checks by excluding specified patterns using exact matching
 * @param {Array} checks - Array of check objects
 * @param {Array} excludePatterns - Array of patterns to exclude
 * @returns {Array} Filtered array of checks
 */
function filterExcludedChecks(checks, excludePatterns) {
  if (!excludePatterns || excludePatterns.length === 0) {
    return checks
  }

  return checks.filter(check => {
    const checkName = getCheckName(check)
    if (checkName === 'Unknown') {
      core.debug('⚠️ Check with unknown name found, including in evaluation')
      return true
    }

    const shouldExclude = excludePatterns.some(
      excludePattern => checkName === excludePattern
    )
    if (shouldExclude) {
      core.info(`🚫 Excluding check from status evaluation: ${checkName}`)
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
      const prefix =
        checkType === CHECK_TYPES.REQUIRED ? 'Required check' : 'Check'
      core.info(`✅ ${prefix} '${checkName}': ${checkStatus}`)
    } else {
      const prefix =
        checkType === CHECK_TYPES.REQUIRED ? 'Required check' : 'Check'
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
  const isRequired = checkType === CHECK_TYPES.REQUIRED

  if (hasFailures) {
    const statusMessage = isRequired
      ? '🔴 Overall required checks status: FAILURE (one or more required checks failed)'
      : `🔴 Overall CI status: ${overallState || 'FAILURE'} (one or more checks failed)`
    core.info(statusMessage)
  } else {
    const statusMessage = isRequired
      ? '🟢 Overall required checks status: SUCCESS (all required checks passed)'
      : '🟢 Overall CI status: SUCCESS (all checks passed)'
    core.info(statusMessage)
  }
}

/**
 * Process required checks and return commit status
 * @param {Object} result - GraphQL result object
 * @param {Array} checksToExclude - Array of check names to exclude
 * @returns {string} The commit status
 */
function processRequiredChecks(result, checksToExclude) {
  const allChecks =
    result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
      .contexts.nodes

  // Log all available checks for debugging
  logAllChecks(allChecks)

  // Filter to required checks only, then exclude specified checks
  const requiredChecks = allChecks.filter(x => x.isRequired)
  const filteredChecks = filterExcludedChecks(requiredChecks, checksToExclude)

  core.info(
    `🔍 Evaluating ${filteredChecks.length} required checks (after exclusions)`
  )

  if (filteredChecks.length === 0) {
    core.info('💡 No required checks found after filtering')
    return PR_STATUS.SUCCESS
  }

  // Log the status of each required check and check for failures
  const hasFailingCheck = logCheckResults(filteredChecks, CHECK_TYPES.REQUIRED)

  // Determine overall status
  const commitStatus = areAllChecksSuccessful(filteredChecks)
    ? PR_STATUS.SUCCESS
    : PR_STATUS.FAILURE

  // Log overall status summary
  logOverallStatus(hasFailingCheck, CHECK_TYPES.REQUIRED)

  return commitStatus
}

/**
 * Process all checks and return commit status
 * @param {Object} result - GraphQL result object
 * @param {Array} checksToExclude - Array of check names to exclude
 * @returns {string} The commit status
 */
function processAllChecks(result, checksToExclude) {
  const allChecks =
    result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
      .contexts.nodes

  // Log all available checks for debugging
  logAllChecks(allChecks)

  // Filter out excluded checks
  const filteredChecks = filterExcludedChecks(allChecks, checksToExclude)

  core.info(
    `🔍 Evaluating ${filteredChecks.length} total checks (after exclusions)`
  )

  // If no checks remain after filtering, return null
  if (filteredChecks.length === 0) {
    core.info('💡 No CI checks found after filtering out excluded checks')
    return null
  }

  // Log the status of each check and check for failures
  const hasFailingCheck = logCheckResults(filteredChecks, CHECK_TYPES.ALL)

  // Determine overall status
  const allSuccessful = areAllChecksSuccessful(filteredChecks)
  const rollupState =
    result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
      .state
  const commitStatus = allSuccessful ? PR_STATUS.SUCCESS : rollupState

  // Log overall status summary
  logOverallStatus(hasFailingCheck, CHECK_TYPES.ALL, rollupState)

  return commitStatus
}

/**
 * GraphQL query to get PR status information
 */
const PR_STATUS_QUERY = `query($owner:String!, $name:String!, $number:Int!) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) {
      reviewDecision
      mergeStateStatus
      mergeable
      isDraft
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
                    status
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

/**
 * Prepare GraphQL query variables for the PR status query
 * @param {Object} context - GitHub Actions context
 * @param {string} prNumber - Pull request number
 * @returns {Object} GraphQL query variables
 */
function prepareQueryVariables(context, prNumber) {
  return {
    owner: context.repo.owner,
    name: context.repo.repo,
    number: parseInt(prNumber),
    headers: {
      Accept: 'application/vnd.github.merge-info-preview+json'
    }
  }
}

/**
 * Prepare the list of checks to exclude from evaluation
 * @param {Object} data - Data object containing exclude checks and workflow info
 * @returns {Array} Array of check names to exclude
 */
function prepareExcludeChecks(data) {
  const excludeChecks = data.excludeChecks || []
  const currentActionName = data.workflow || 'pr-status'

  const checksToExclude = [...excludeChecks, currentActionName].filter(Boolean)
  if (checksToExclude.length > 0) {
    core.info(
      `🚫 Checks to exclude from status evaluation: ${checksToExclude.join(', ')}`
    )
  }

  return checksToExclude
}

/**
 * Determine commit status based on GraphQL result and check type
 * @param {Object} result - GraphQL query result
 * @param {Object} data - Data object containing checks configuration
 * @param {Array} checksToExclude - Array of check names to exclude
 * @returns {string|null} Commit status or null
 */
function determineCommitStatus(result, data, checksToExclude) {
  try {
    const checkSuites =
      result.repository.pullRequest.commits.nodes[0].commit.checkSuites

    // If there are no CI checks defined at all, return null
    if (checkSuites.totalCount === 0) {
      core.info('💡 No CI checks have been defined for this pull request')
      return null
    }

    // Process checks based on type
    if (data.checks === CHECK_TYPES.REQUIRED) {
      return processRequiredChecks(result, checksToExclude)
    } else {
      return processAllChecks(result, checksToExclude)
    }
  } catch (error) {
    core.warning(`⚠️ Could not retrieve PR commit status: ${error.message}`)
    core.info('💡 This repo may not have any CI checks defined')
    core.info('🔄 Skipping commit status check and proceeding...')

    // Try to display the raw GraphQL result for debugging purposes
    try {
      core.debug('🔍 Raw GraphQL result for debugging:')
      core.debug(JSON.stringify(result, null, 2))
    } catch (debugError) {
      core.debug('❌ Could not output raw GraphQL result for debugging')
    }

    return null
  }
}

/**
 * Extract status result from GraphQL response
 * @param {Object} result - GraphQL query result
 * @param {string|null} commitStatus - Determined commit status
 * @returns {Object} Status result object
 */
function extractStatusResult(result, commitStatus) {
  const statusResult = {
    review_decision: result?.repository?.pullRequest?.reviewDecision || null,
    total_approvals:
      result?.repository?.pullRequest?.reviews?.totalCount || null,
    merge_state_status:
      result?.repository?.pullRequest?.mergeStateStatus || null,
    mergeable_state: result?.repository?.pullRequest?.mergeable || null,
    is_draft: result?.repository?.pullRequest?.isDraft || false,
    commit_status: commitStatus || null
  }

  core.info(`📊 Merge State Status: ${statusResult.merge_state_status}`)
  core.info(`📊 Mergeable State: ${statusResult.mergeable_state}`)
  core.info(`📊 Is Draft: ${statusResult.is_draft}`)

  core.debug(`📊 Status result: ${JSON.stringify(statusResult, null, 2)}`)
  return statusResult
}

/**
 * Get the status of a pull request from multiple perspectives
 * @param {Object} octokit - The octokit client
 * @param {Object} context - The GitHub Actions event context
 * @param {string} prNumber - The pull request number
 * @param {Object} data - An object containing the checks parameter and other data
 * @returns {Object} An object containing the review_decision, merge_state_status, and commit_status
 */
export async function status(octokit, context, prNumber, data) {
  try {
    core.info('🔍 Fetching pull request status information...')

    // Prepare query variables and exclusions
    const variables = prepareQueryVariables(context, prNumber)
    const checksToExclude = prepareExcludeChecks(data)

    // Make the GraphQL query
    const result = await octokit.graphql(PR_STATUS_QUERY, variables)

    // Determine commit status
    const commitStatus = determineCommitStatus(result, data, checksToExclude)

    // Extract and return the status result
    return extractStatusResult(result, commitStatus)
  } catch (error) {
    core.error(`❌ Failed to fetch PR status: ${error.message}`)
    core.debug(`🔍 Error details: ${error.stack}`)
    throw error
  }
}
