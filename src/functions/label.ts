import * as core from '@actions/core'

import type {
  CoreDependencies,
  IssueNumber,
  LabelClient,
  LabelResult,
  RepositoryOnlyContext
} from '../types.ts'

const defaultDependencies: CoreDependencies = {core}

/**
 * Add and remove labels from a pull request
 * @param {string} issueNumber - The issue number to add the labels to
 * @param {Object} context - The GitHub Actions event context
 * @param {Object} octokit - The octokit client
 * @param {Array} labelsToAdd - An array of labels to add to the pull request
 * @param {Array} labelsToRemove - An array of labels to remove from the pull request
 * @returns {Object} An object containing the labels added and removed
 */
export async function label(
  issueNumber: IssueNumber,
  context: RepositoryOnlyContext,
  octokit: LabelClient,
  labelsToAdd: string[],
  labelsToRemove: string[],
  dependencies: CoreDependencies = defaultDependencies
): Promise<LabelResult> {
  const coreApi = dependencies.core
  const {owner, repo} = context.repo
  const addedLabels: string[] = [] // an array of labels that were actually added
  const removedLabels: string[] = [] // an array of labels that were actually removed

  // Exit early if there are no labels to add or remove
  if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
    coreApi.info('🏷️ No labels to add or remove')
    return {
      added: [],
      removed: []
    }
  }

  coreApi.info(`🏷️ Processing labels for PR #${issueNumber}`)

  // First, find and cleanup labelsToRemove if any are provided
  if (labelsToRemove.length > 0) {
    coreApi.debug('🔍 Fetching current labels on the issue')

    try {
      const currentLabelsResult = await octokit.rest.issues.listLabelsOnIssue({
        owner: owner,
        repo: repo,
        issue_number: issueNumber
      })
      const currentLabels = currentLabelsResult.data.map(label => label.name)

      coreApi.debug(`📋 Current labels: ${currentLabels.join(', ')}`)
      coreApi.debug(`❌ Labels to remove: ${labelsToRemove.join(', ')}`)

      // Remove unwanted labels
      for (const label of labelsToRemove) {
        if (currentLabels.includes(label)) {
          await octokit.rest.issues.removeLabel({
            owner: owner,
            repo: repo,
            issue_number: issueNumber,
            name: label
          })
          coreApi.info(`🏷️ ❌ Label removed: ${label}`)
          removedLabels.push(label)
        } else {
          coreApi.info(
            `🏷️ ⚠️ Label not found: '${label}' so it was not removed`
          )
        }
      }
    } catch (error: unknown) {
      const labelError = error as Error
      coreApi.warning(
        `⚠️ Failed to process label removal: ${labelError.message}`
      )
    }
  }

  // Now, add the labels if any are provided
  if (labelsToAdd.length > 0) {
    coreApi.debug(`🔍 Attempting to apply labels: ${labelsToAdd.join(', ')}`)

    try {
      await octokit.rest.issues.addLabels({
        owner: owner,
        repo: repo,
        issue_number: issueNumber,
        labels: labelsToAdd
      })
      coreApi.info(`🏷️ ✅ Labels added: ${labelsToAdd.join(', ')}`)
      addedLabels.push(...labelsToAdd)
    } catch (error: unknown) {
      const labelError = error as Error
      coreApi.warning(`⚠️ Failed to add labels: ${labelError.message}`)
    }
  }

  return {
    added: addedLabels,
    removed: removedLabels
  }
}
