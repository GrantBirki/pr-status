import * as core from '@actions/core'
import {GitHubContext, LabelResult, OctokitClient} from '../types'

/**
 * Helper function to add labels to a pull request
 * @param issueNumber - The issue number to add the labels to
 * @param context - The GitHub Actions event context
 * @param octokit - The octokit client
 * @param labelsToAdd - An array of labels to add to the pull request
 * @param labelsToRemove - An array of labels to remove from the pull request
 * @returns An object containing the labels added and removed
 */
export async function label(
  issueNumber: number,
  context: GitHubContext,
  octokit: OctokitClient,
  labelsToAdd: string[],
  labelsToRemove: string[]
): Promise<LabelResult> {
  // Get the owner, repo, and issue number from the context
  const {owner, repo} = context.repo
  let addedLabels: string[] = [] // an array of labels that were actually added
  const removedLabels: string[] = [] // an array of labels that were actually removed

  // exit early if there are no labels to add or remove
  if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
    core.info('🏷️ no labels to add or remove')
    return {
      added: [],
      removed: []
    }
  }

  // first, find and cleanup labelsToRemove if any are provided
  if (labelsToRemove.length > 0) {
    // Fetch current labels on the issue
    core.debug('fetching current labels on the issue')
    const currentLabelsResult = await octokit.rest.issues.listLabelsOnIssue({
      owner: owner,
      repo: repo,
      issue_number: issueNumber
    })
    const currentLabels: string[] = currentLabelsResult.data.map(
      label => label.name
    )

    core.info(`current labels: ${currentLabels}`)
    core.info(`labels to remove: ${labelsToRemove}`)

    // Remove unwanted labels
    for (const label of labelsToRemove) {
      if (currentLabels.includes(label)) {
        await octokit.rest.issues.removeLabel({
          owner: owner,
          repo: repo,
          issue_number: issueNumber,
          name: label
        })
        core.info(`🏷️ label removed: ${label}`)
        removedLabels.push(label)
      } else {
        core.info(`🏷️ label not found: '${label}' so it was not removed`)
      }
    }
  }

  // now, add the labels if any are provided
  if (labelsToAdd.length > 0) {
    core.debug(`attempting to apply labels: ${labelsToAdd}`)
    await octokit.rest.issues.addLabels({
      owner: owner,
      repo: repo,
      issue_number: issueNumber,
      labels: labelsToAdd
    })
    core.info(`🏷️ labels added: ${labelsToAdd}`)

    addedLabels = labelsToAdd
  }

  return {
    added: addedLabels,
    removed: removedLabels
  }
}
