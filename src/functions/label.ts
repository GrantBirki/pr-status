import type {ActionContext} from '../context.ts'
import type {GitHubClient} from '../github.ts'

export type RepositoryContext = Pick<ActionContext, 'repo'>
export type LabelClient = Pick<
  GitHubClient,
  'listIssueLabels' | 'removeLabel' | 'addLabels'
>

export interface LabelResult {
  added: string[]
  removed: string[]
}

export interface LabelActions {
  labelsToAdd: string[]
  labelsToRemove: string[]
}

interface LabelCoreApi {
  debug(message: string): void
  info(message: string): void
}

interface LabelDependencies {
  core: LabelCoreApi
}

export function determineLabelActions(
  passed: boolean,
  passLabels: readonly string[],
  failLabels: readonly string[],
  passLabelsCleanup: readonly string[]
): LabelActions {
  const add = normalizeLabels(passed ? passLabels : failLabels)
  const remove = normalizeLabels(
    passed ? [...failLabels, ...passLabelsCleanup] : passLabels
  )
  const additions = new Set(add)

  return {
    labelsToAdd: add,
    labelsToRemove: remove.filter(label => !additions.has(label))
  }
}

export async function label(
  pullRequestNumber: number,
  context: RepositoryContext,
  client: LabelClient,
  labelsToAdd: readonly string[],
  labelsToRemove: readonly string[],
  dependencies: LabelDependencies
): Promise<LabelResult> {
  const {core} = dependencies
  const add = normalizeLabels(labelsToAdd)
  const additions = new Set(add)
  const remove = normalizeLabels(labelsToRemove).filter(
    name => !additions.has(name)
  )

  if (add.length === 0 && remove.length === 0) {
    core.info('🏷️ No labels to add or remove')
    return {added: [], removed: []}
  }

  const request = {
    owner: context.repo.owner,
    repo: context.repo.repo,
    number: pullRequestNumber
  }
  const removed: string[] = []

  core.info(`🏷️ Processing labels for PR #${pullRequestNumber}`)
  if (remove.length > 0) {
    core.debug('🔍 Fetching current labels on the issue')
    const current = new Set(await client.listIssueLabels(request))

    for (const name of remove) {
      if (!current.has(name)) {
        core.info(`🏷️ ⚠️ Label not found: '${name}' so it was not removed`)
        continue
      }

      await client.removeLabel({...request, name})
      removed.push(name)
      core.info(`🏷️ ❌ Label removed: ${name}`)
    }
  }

  if (add.length > 0) {
    core.debug(`🔍 Attempting to apply labels: ${add.join(', ')}`)
    await client.addLabels({...request, labels: add})
    core.info(`🏷️ ✅ Labels added: ${add.join(', ')}`)
  }

  return {added: add, removed}
}

function normalizeLabels(labels: readonly string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const label of labels) {
    const trimmed = label.trim()
    if (trimmed !== '' && !seen.has(trimmed)) {
      seen.add(trimmed)
      result.push(trimmed)
    }
  }

  return result
}
