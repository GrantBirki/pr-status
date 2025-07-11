import * as core from '@actions/core'
import { COLORS } from './colors'
import { CHECK_STATUS, PR_STATUS, CHECK_TYPES } from './constants'
import { 
  GitHubContext, 
  ActionData, 
  StatusResult, 
  OctokitClient, 
  GraphQLResponse,
  CheckNode
} from '../types'

/**
 * Get the name of a check from either CheckRun or StatusContext node
 * @param check - The check object (CheckRun or StatusContext)
 * @returns The check name
 */
function getCheckName(check: CheckNode): string {
  if ('name' in check) {
    return check.name || 'Unknown'
  }
  if ('context' in check) {
    return check.context || 'Unknown'
  }
  return 'Unknown'
}

/**
 * Get the status of a check from either CheckRun or StatusContext node
 * @param check - The check object (CheckRun or StatusContext)
 * @returns The check status in uppercase
 */
function getCheckStatus(check: CheckNode): string {
  if ('conclusion' in check) {
    return (check.conclusion || 'UNKNOWN').toUpperCase()
  }
  if ('state' in check) {
    return (check.state || 'UNKNOWN').toUpperCase()
  }
  return 'UNKNOWN'
}

/**
 * Check if a status is considered successful
 * @param status - The status to check
 * @returns True if successful
 */
function isSuccessfulStatus(status: string): boolean {
  const successfulStatuses = [
    CHECK_STATUS.SUCCESS,
    CHECK_STATUS.SKIPPED,
    CHECK_STATUS.NEUTRAL
  ]
  return successfulStatuses.includes(status as any)
}

/**
 * Log all available checks for debugging purposes
 * @param checks - Array of check objects
 */
function logAllChecks(checks: CheckNode[]): void {
  core.info(`📋 Found ${checks.length} total CI checks on this pull request`)
  checks.forEach(check => {
    const checkName: string = getCheckName(check)
    const isRequired: string = check.isRequired ? '(required)' : '(optional)'
    const checkStatus: string = getCheckStatus(check)
    core.info(`  - ${checkName} ${isRequired}: ${checkStatus}`)
  })
}

/**
 * Filter checks by excluding specified patterns using exact matching
 * @param checks - Array of check objects
 * @param excludePatterns - Array of patterns to exclude
 * @returns Filtered array of checks
 */
function filterExcludedChecks(checks: CheckNode[], excludePatterns: string[]): CheckNode[] {
  return checks.filter(check => {
    const checkName: string = getCheckName(check)
    if (checkName === 'Unknown') {
      // If no name/context available, don't exclude it
      /* istanbul ignore next */
      return true
    }

    const shouldExclude: boolean = excludePatterns.some(
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
 * @param checks - Array of check objects
 * @param checkType - Type of checks ('required' or 'all')
 * @returns True if any check is failing
 */
function logCheckResults(checks: CheckNode[], checkType: string = 'check'): boolean {
  let hasFailingCheck: boolean = false

  checks.forEach(check => {
    const checkName: string = getCheckName(check)
    const checkStatus: string = getCheckStatus(check)
    const isSuccessful: boolean = isSuccessfulStatus(checkStatus)

    if (isSuccessful) {
      const prefix: string =
        checkType === CHECK_TYPES.REQUIRED ? 'Required check' : 'Check'
      core.info(`✅ ${prefix} '${checkName}': ${checkStatus}`)
    } else {
      const prefix: string =
        checkType === CHECK_TYPES.REQUIRED ? 'Required check' : 'Check'
      core.info(`❌ ${prefix} '${checkName}': ${checkStatus} (FAILING)`)
      hasFailingCheck = true
    }
  })

  return hasFailingCheck
}

/**
 * Evaluate if all checks are successful
 * @param checks - Array of check objects
 * @returns True if all checks are successful
 */
function areAllChecksSuccessful(checks: CheckNode[]): boolean {
  return checks.every(check => {
    const status: string = getCheckStatus(check)
    return isSuccessfulStatus(status)
  })
}

/**
 * Log the overall status summary
 * @param hasFailures - Whether there are failing checks
 * @param checkType - Type of checks ('required' or 'all')
 * @param overallState - The overall state from GitHub (for 'all' mode)
 */
function logOverallStatus(hasFailures: boolean, checkType: string, overallState: string | null = null): void {
  if (hasFailures) {
    if (checkType === CHECK_TYPES.REQUIRED) {
      core.info(
        `🔴 Overall required checks status: FAILURE (one or more required checks failed)`
      )
    } else {
      core.info(
        `🔴 Overall CI status: ${overallState} (one or more checks failed)`
      )
    }
  } else {
    if (checkType === CHECK_TYPES.REQUIRED) {
      core.info(
        `🟢 Overall required checks status: SUCCESS (all required checks passed)`
      )
    } else {
      core.info(`🟢 Overall CI status: SUCCESS (all checks passed)`)
    }
  }
}

/**
 * Process required checks and return commit status
 * @param result - GraphQL result object
 * @param checksToExclude - Array of check names to exclude
 * @returns The commit status
 */
function processRequiredChecks(result: GraphQLResponse, checksToExclude: string[]): string {
  // Log all available checks for debugging
  const allChecks: CheckNode[] =
    result.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup
      .contexts.nodes || []
  logAllChecks(allChecks)

  // Filter to required checks only, then exclude specified checks
  const requiredChecks: CheckNode[] = allChecks.filter(x => x.isRequired)
  const filteredChecks: CheckNode[] = filterExcludedChecks(requiredChecks, checksToExclude)

  core.info(
    `Evaluating ${filteredChecks.length} required checks (after exclusions)`
  )

  // Log the status of each required check and check for failures
  const hasFailingCheck: boolean = logCheckResults(filteredChecks, CHECK_TYPES.REQUIRED)

  // Determine overall status
  const commitStatus: string = areAllChecksSuccessful(filteredChecks)
    ? PR_STATUS.SUCCESS
    : PR_STATUS.FAILURE

  // Log overall status summary
  logOverallStatus(hasFailingCheck, CHECK_TYPES.REQUIRED)

  return commitStatus
}

/**
 * Process all checks and return commit status
 * @param result - GraphQL result object
 * @param checksToExclude - Array of check names to exclude
 * @returns The commit status
 */
function processAllChecks(result: GraphQLResponse, checksToExclude: string[]): string | null {
  // Log all available checks for debugging
  const allChecks: CheckNode[] =
    result.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup
      .contexts.nodes || []
  logAllChecks(allChecks)

  // Filter out excluded checks
  const filteredChecks: CheckNode[] = filterExcludedChecks(allChecks, checksToExclude)

  core.info(
    `Evaluating ${filteredChecks.length} total checks (after exclusions)`
  )

  // If all other checks are successful, return SUCCESS, otherwise use the overall state
  if (filteredChecks.length === 0) {
    core.info('💡 no other CI checks found after filtering out excluded checks')
    return null
  }

  // Log the status of each check and check for failures
  const hasFailingCheck: boolean = logCheckResults(filteredChecks, CHECK_TYPES.ALL)

  // Determine overall status
  const allSuccessful: boolean = areAllChecksSuccessful(filteredChecks)
  const commitStatus: string | null = allSuccessful
    ? PR_STATUS.SUCCESS
    : result.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup
        .state || null

  // Log overall status summary
  const overallState: string =
    result.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup
      .state || 'UNKNOWN'
  logOverallStatus(hasFailingCheck, CHECK_TYPES.ALL, overallState)

  return commitStatus
}

/**
 * GraphQL query to get PR status information
 */
const PR_STATUS_QUERY: string = `query($owner:String!, $name:String!, $number:Int!) {
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

/**
 * Helper function to get the status of a pull request from multiple perspectives
 * @param octokit - The octokit client
 * @param context - The GitHub Actions event context
 * @param prNumber - The pull request number
 * @param data - An object containing the checks parameter and other data
 * @returns An object containing the review_decision, merge_state_status, and commit_status
 */
export async function status(
  octokit: OctokitClient,
  context: GitHubContext,
  prNumber: number,
  data: ActionData
): Promise<StatusResult> {
  const variables = {
    owner: context.repo.owner,
    name: context.repo.repo,
    number: prNumber,
    headers: {
      Accept: 'application/vnd.github.merge-info-preview+json'
    }
  }

  // Get the checks to exclude from status evaluation
  const excludeChecks: string[] = data.excludeChecks || []
  const currentActionName: string = data.workflow || 'pr-status'

  // Combine default exclusions with user-provided exclusions
  const checksToExclude: string[] = [...excludeChecks, currentActionName].filter(Boolean)
  core.info(
    `Checks to exclude from status evaluation: ${checksToExclude.join(', ')}`
  )

  // Make the GraphQL query
  let result: GraphQLResponse | null = null
  let commitStatus: string | null = null
  try {
    result = await octokit.graphql<GraphQLResponse>(PR_STATUS_QUERY, variables)
  } catch (e) {
    core.info(
      `could not retrieve PR commit status: ${e} - Handled: ${COLORS.success}OK`
    )
    core.info('this repo may not have any CI checks defined')
    core.info('skipping commit status check and proceeding...')
    commitStatus = null
  }

  if (result) {
    try {
      // If there are no CI checks defined at all, we can set the commitStatus to null
      if (
        result.repository.pullRequest.commits.nodes[0]?.commit.checkSuites
          .totalCount === 0
      ) {
        core.info('💡 no CI checks have been defined for this pull request')
        commitStatus = null
      } else if (data.checks === CHECK_TYPES.REQUIRED) {
        // Process required checks only
        commitStatus = processRequiredChecks(result, checksToExclude)
      } else {
        // Process all checks
        commitStatus = processAllChecks(result, checksToExclude)
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
        core.debug(JSON.stringify(result))
      } catch {
        // istanbul ignore next
        core.debug(
          'Could not output raw graphql result for debugging - This is bad'
        )
      }
    }
  }

  const statusResult: StatusResult = {
    review_decision: result?.repository?.pullRequest?.reviewDecision || null,
    total_approvals:
      result?.repository?.pullRequest?.reviews?.totalCount || 0,
    merge_state_status:
      result?.repository?.pullRequest?.mergeStateStatus || null,
    commit_status: commitStatus || null
  }

  core.debug(`statusResult: ${JSON.stringify(statusResult, null, 2)}`)

  return statusResult
}