import * as core from '@actions/core'

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
  issueNumber,
  context,
  octokit,
  labelsToAdd,
  labelsToRemove
) {
  const {owner, repo} = context.repo
  const addedLabels = [] // an array of labels that were actually added
  const removedLabels = [] // an array of labels that were actually removed

  // Exit early if there are no labels to add or remove
  if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
    core.info('🏷️ No labels to add or remove')
    return {
      added: [],
      removed: []
    }
  }

  core.info(`🏷️ Processing labels for PR #${issueNumber}`)

  // First, find and cleanup labelsToRemove if any are provided
  if (labelsToRemove.length > 0) {
    core.debug('🔍 Fetching current labels on the issue')

    try {
      const currentLabelsResult = await octokit.rest.issues.listLabelsOnIssue({
        owner: owner,
        repo: repo,
        issue_number: issueNumber
      })
      const currentLabels = currentLabelsResult.data.map(label => label.name)

      core.debug(`📋 Current labels: ${currentLabels.join(', ')}`)
      core.debug(`❌ Labels to remove: ${labelsToRemove.join(', ')}`)

      // Remove unwanted labels
      for (const label of labelsToRemove) {
        if (currentLabels.includes(label)) {
          await octokit.rest.issues.removeLabel({
            owner: owner,
            repo: repo,
            issue_number: issueNumber,
            name: label
          })
          core.info(`🏷️ ❌ Label removed: ${label}`)
          removedLabels.push(label)
        } else {
          core.info(`🏷️ ⚠️ Label not found: '${label}' so it was not removed`)
        }
      }
    } catch (error) {
      core.warning(`⚠️ Failed to process label removal: ${error.message}`)
    }
  }

  // Now, add the labels if any are provided
  if (labelsToAdd.length > 0) {
    core.debug(`🔍 Attempting to apply labels: ${labelsToAdd.join(', ')}`)

    try {
      await octokit.rest.issues.addLabels({
        owner: owner,
        repo: repo,
        issue_number: issueNumber,
        labels: labelsToAdd
      })
      core.info(`🏷️ ✅ Labels added: ${labelsToAdd.join(', ')}`)
      addedLabels.push(...labelsToAdd)
    } catch (error) {
      core.warning(`⚠️ Failed to add labels: ${error.message}`)
    }
  }

  return {
    added: addedLabels,
    removed: removedLabels
  }
}
