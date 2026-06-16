import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {
  COVERAGE_BADGE,
  writeCoverageBadge
} from '../scripts/coverage-badge.ts'

const repositoryRoot = new URL('../', import.meta.url)

test('coverage badge output is exact and deterministic', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'pr-status-badge-'))

  try {
    const outputPath = writeCoverageBadge(temporaryRoot)
    const firstOutput = await readFile(outputPath, 'utf8')
    writeCoverageBadge(temporaryRoot)
    const secondOutput = await readFile(outputPath, 'utf8')

    assert.equal(outputPath, join(temporaryRoot, 'badges', 'coverage.svg'))
    assert.equal(firstOutput, COVERAGE_BADGE)
    assert.equal(secondOutput, firstOutput)
    assert.equal(
      createHash('sha256').update(firstOutput).digest('hex'),
      '13f4bbc019e32239e91352a8c8b09d4be60aba1785aea334e232e592dd2a2373'
    )
  } finally {
    await rm(temporaryRoot, {recursive: true, force: true})
  }
})

test('test failures cannot be hidden by badge generation', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('package.json', repositoryRoot), 'utf8')
  ) as {scripts: Record<string, string>}

  assert.equal(
    packageJson.scripts.test,
    'npm run ci-test && npm run coverage-badge'
  )
  assert.doesNotMatch(packageJson.scripts.test, /\|\|/)
  assert.equal(
    packageJson.scripts.all,
    'npm run typecheck && npm test && npm run package'
  )
})

test('toolchain and dependency budget stay exact', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('package.json', repositoryRoot), 'utf8')
  ) as {
    packageManager: string
    engines: Record<string, string>
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }

  assert.equal(packageJson.packageManager, 'npm@11.13.0')
  assert.deepEqual(packageJson.engines, {
    node: '24.16.0',
    npm: '11.13.0'
  })
  assert.deepEqual(packageJson.dependencies, {})
  assert.deepEqual(packageJson.devDependencies, {
    '@types/node': '24.12.2',
    '@vercel/ncc': '0.38.4',
    typescript: '6.0.3'
  })
})

test('action metadata defaults self-exclusion to the current job', async () => {
  const actionMetadata = await readFile(
    new URL('action.yml', repositoryRoot),
    'utf8'
  )

  assert.match(
    actionMetadata,
    /  workflow:\n    description: [^\n]+\n    default: \$\{\{ github\.job \}\}\n    required: false\n/u
  )
  assert.doesNotMatch(actionMetadata, /github\.workflow/u)
})

test('branch-deploy-status workflow stays self-contained', async () => {
  const actionMetadata = await readFile(
    new URL('action.yml', repositoryRoot),
    'utf8'
  )
  const reusableWorkflow = await readFile(
    new URL(
      '.github/workflows/branch-deploy-status.yml',
      repositoryRoot
    ),
    'utf8'
  )
  const acceptanceWorkflow = await readFile(
    new URL('.github/workflows/acceptance.yml', repositoryRoot),
    'utf8'
  )

  assert.match(
    actionMetadata,
    /  mode:\n    description: [^\n]+\n    default: status\n    required: false\n/u
  )
  for (const output of ['branch_deploy_state', 'head_sha', 'head_matches']) {
    assert.match(actionMetadata, new RegExp(`  ${output}:\\n`, 'u'))
  }

  assert.match(reusableWorkflow, /  workflow_call:\n/u)
  assert.match(reusableWorkflow, /default: ready-for-noop/u)
  assert.match(reusableWorkflow, /default: approved,not_draft/u)
  assert.match(reusableWorkflow, /name: branch-deploy-status/u)
  assert.match(reusableWorkflow, /queue: max/u)
  assert.match(
    reusableWorkflow,
    /repository: \$\{\{ job\.workflow_repository \}\}\n          ref: \$\{\{ job\.workflow_sha \}\}/u
  )
  assert.match(reusableWorkflow, /uses: \.\/pr-status-action/u)
  assert.doesNotMatch(
    reusableWorkflow,
    /uses: GrantBirki\/pr-status@/u
  )
  assert.match(
    reusableWorkflow,
    /actions\/checkout@[0-9a-f]{40} # pin@v6/u
  )
  for (const output of [
    'branch_deploy_state',
    'head_sha',
    'head_matches',
    'evaluation',
    'approved',
    'total_approvals',
    'review_decision',
    'merge_state_status',
    'mergeable_state',
    'commit_status',
    'is_draft'
  ]) {
    assert.match(
      reusableWorkflow,
      new RegExp(`${output}: \\$\\{\\{ steps\\.pr-status\\.outputs\\.${output} \\}\\}`, 'u')
    )
  }

  assert.match(
    acceptanceWorkflow,
    /uses: \.\/\.github\/workflows\/branch-deploy-status\.yml/u
  )
  assert.match(acceptanceWorkflow, /dry_run: true/u)
})

test('lockfile uses public package URLs and no lifecycle scripts', async () => {
  const packageLock = JSON.parse(
    await readFile(new URL('package-lock.json', repositoryRoot), 'utf8')
  ) as {
    packages: Record<
      string,
      {resolved?: string; hasInstallScript?: boolean}
    >
  }

  for (const [packagePath, metadata] of Object.entries(packageLock.packages)) {
    assert.notEqual(
      metadata.hasInstallScript,
      true,
      `${packagePath || 'root'} has an install script`
    )
    if (metadata.resolved !== undefined) {
      assert.match(metadata.resolved, /^https:\/\/registry\.npmjs\.org\//)
    }
  }

  assert.deepEqual(Object.keys(packageLock.packages).sort(), [
    '',
    'node_modules/@types/node',
    'node_modules/@vercel/ncc',
    'node_modules/typescript',
    'node_modules/undici-types'
  ])
})

test('strict TypeScript checking includes source, tests, and helpers', async () => {
  const tsconfig = JSON.parse(
    await readFile(new URL('tsconfig.json', repositoryRoot), 'utf8')
  ) as {
    compilerOptions: Record<string, unknown>
    include: string[]
  }

  assert.deepEqual(tsconfig.include, [
    'src/**/*.ts',
    'test/**/*.ts',
    'scripts/**/*.ts'
  ])
  assert.equal(tsconfig.compilerOptions.strict, true)
  assert.equal(tsconfig.compilerOptions.skipLibCheck, undefined)
})

test('bundled public artifacts contain no local paths or unrelated sources', async () => {
  const bundle = await readFile(new URL('dist/index.js', repositoryRoot), 'utf8')
  const licenses = await readFile(
    new URL('dist/licenses.txt', repositoryRoot),
    'utf8'
  )
  const sourceMap = JSON.parse(
    await readFile(new URL('dist/index.js.map', repositoryRoot), 'utf8')
  ) as {sources: string[]; sourcesContent?: Array<string | null>}

  assert.doesNotMatch(bundle, /\/Users\/|\/home\/runner\//)
  assert.doesNotMatch(bundle, /@actions\/|@octokit\/|undici/u)
  assert.equal(licenses, '')
  assert.ok(sourceMap.sources.includes('.././src/index.ts'))
  assert.ok(sourceMap.sources.includes('.././src/main.ts'))
  assert.ok(sourceMap.sources.includes('.././src/actions.ts'))
  assert.ok(sourceMap.sources.includes('.././src/github.ts'))
  for (const source of sourceMap.sources) {
    assert.doesNotMatch(source, /^(?:\/|[A-Za-z]:\\)/)
    assert.doesNotMatch(source, /node_modules/)
    assert.doesNotMatch(source, /(?:__tests?__|\/test\/|\/tests\/)/)
    assert.doesNotMatch(source, /scripts\/coverage-badge/)
  }

  for (const sourceContent of sourceMap.sourcesContent ?? []) {
    if (sourceContent !== null) {
      assert.doesNotMatch(sourceContent, /\/Users\/|\/home\/runner\//)
    }
  }
})

test('bundled executable rejects unsupported non-Actions execution', () => {
  const environment = {...process.env}
  delete environment.GITHUB_ACTIONS
  delete environment.GITHUB_OUTPUT

  const result = spawnSync(process.execPath, ['dist/index.js'], {
    cwd: fileURLToPath(repositoryRoot),
    encoding: 'utf8',
    env: environment
  })

  assert.equal(result.error, undefined)
  assert.equal(result.status, 1)
  assert.match(result.stdout, /only run inside GitHub Actions/)
  assert.equal(result.stderr, '')
})
