import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

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
  assert.deepEqual(packageJson.dependencies, {
    '@actions/core': '1.11.1',
    '@actions/github': '6.0.1',
    '@octokit/plugin-retry': '6.1.0'
  })
  assert.deepEqual(packageJson.devDependencies, {
    '@types/node': '24.12.2',
    '@vercel/ncc': '0.38.4',
    typescript: '6.0.3'
  })
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
  const sourceMap = JSON.parse(
    await readFile(new URL('dist/index.js.map', repositoryRoot), 'utf8')
  ) as {sources: string[]; sourcesContent?: Array<string | null>}

  assert.doesNotMatch(bundle, /\/Users\/|\/home\/runner\//)
  assert.ok(sourceMap.sources.includes('.././src/index.ts'))
  assert.ok(sourceMap.sources.includes('.././src/main.ts'))
  for (const source of sourceMap.sources) {
    assert.doesNotMatch(source, /^(?:\/|[A-Za-z]:\\)/)
    assert.doesNotMatch(source, /(?:__tests?__|\/test\/|\/tests\/)/)
    assert.doesNotMatch(source, /scripts\/coverage-badge/)
  }

  for (const sourceContent of sourceMap.sourcesContent ?? []) {
    if (sourceContent !== null) {
      assert.doesNotMatch(sourceContent, /\/Users\/|\/home\/runner\//)
    }
  }
})
