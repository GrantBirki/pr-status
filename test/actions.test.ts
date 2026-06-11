import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import actions, {
  createActions,
  MAX_FAILURE_MESSAGE_LENGTH
} from '../src/actions.ts'
import type {ActionsDependencies} from '../src/actions.ts'

interface RecordedWrite {
  path: string
  data: string
}

interface ActionsRecording {
  actions: ReturnType<typeof createActions>
  lines: string[]
  writes: RecordedWrite[]
  exitCodes: number[]
}

function createRecordingActions(
  env: NodeJS.ProcessEnv = {},
  uuid = '00000000-0000-4000-8000-000000000000',
  fileExists = true
): ActionsRecording {
  const lines: string[] = []
  const writes: RecordedWrite[] = []
  const exitCodes: number[] = []
  const dependencies: ActionsDependencies = {
    env,
    writeLine(message: string): void {
      lines.push(message)
    },
    fileExists(): boolean {
      return fileExists
    },
    appendFile(path: string, data: string): void {
      writes.push({path, data})
    },
    createUuid(): string {
      return uuid
    },
    setExitCode(code: number): void {
      exitCodes.push(code)
    }
  }

  return {
    actions: createActions(dependencies),
    lines,
    writes,
    exitCodes
  }
}

test('inputs use GitHub Actions environment naming and trimming', () => {
  const recording = createRecordingActions({
    INPUT_MIXED_NAME: '  value  ',
    INPUT_PRESERVED: '  keep me  ',
    INPUT_WHITESPACE: '   ',
    INPUT_GITHUB_TOKEN: 'synthetic-secret-value'
  })

  assert.equal(recording.actions.getInput('mixed name'), 'value')
  assert.equal(
    recording.actions.getInput('preserved', {trimWhitespace: false}),
    '  keep me  '
  )
  assert.equal(recording.actions.getInput('missing'), '')
  assert.equal(
    recording.actions.getInput('whitespace', {
      required: true,
      trimWhitespace: false
    }),
    '   '
  )
  assert.throws(
    () => recording.actions.getInput('missing', {required: true}),
    /Input required and not supplied: missing/
  )
  assert.throws(
    () => recording.actions.getInput('whitespace', {required: true}),
    /Input required and not supplied: whitespace/
  )

  assert.equal(
    recording.actions.getInput('github_token', {required: true}),
    'synthetic-secret-value'
  )
  assert.deepEqual(recording.lines, [])
  assert.deepEqual(recording.writes, [])
})

test('logging uses escaped workflow commands and raw informational lines', () => {
  const recording = createRecordingActions()

  recording.actions.debug('progress 100%\r\nnext')
  recording.actions.info('plain informational message')
  recording.actions.warning('warning 100%\r\nnext', {
    file: 'path:part,other%\r\nfile',
    line: 12,
    active: false
  })
  recording.actions.error(new Error('failure 100%\r\nnext'), {
    title: 'bad:value,here'
  })

  assert.deepEqual(recording.lines, [
    '::debug::progress 100%25%0D%0Anext',
    'plain informational message',
    '::warning file=path%3Apart%2Cother%25%0D%0Afile,line=12,active=false::warning 100%25%0D%0Anext',
    '::error title=bad%3Avalue%2Chere::failure 100%25%0D%0Anext'
  ])
})

test('outputs use only the environment file and deterministic primitive values', () => {
  const recording = createRecordingActions({GITHUB_OUTPUT: '/tmp/output'})
  const delimiter = 'ghadelimiter_00000000-0000-4000-8000-000000000000'

  recording.actions.setOutput('text', 'first\nsecond')
  recording.actions.setOutput('null', null)
  recording.actions.setOutput('undefined', undefined)
  recording.actions.setOutput('true', true)
  recording.actions.setOutput('false', false)
  recording.actions.setOutput('zero', 0)
  recording.actions.setOutput('number', 42.5)

  assert.deepEqual(
    recording.writes.map(write => write.path),
    Array.from({length: 7}, () => '/tmp/output')
  )
  assert.deepEqual(
    recording.writes.map(write => write.data),
    [
      `text<<${delimiter}\nfirst\nsecond\n${delimiter}\n`,
      `null<<${delimiter}\n\n${delimiter}\n`,
      `undefined<<${delimiter}\n\n${delimiter}\n`,
      `true<<${delimiter}\ntrue\n${delimiter}\n`,
      `false<<${delimiter}\nfalse\n${delimiter}\n`,
      `zero<<${delimiter}\n0\n${delimiter}\n`,
      `number<<${delimiter}\n42.5\n${delimiter}\n`
    ]
  )
})

test('output protocol rejects unsupported environments and unsafe values', () => {
  const missingFile = createRecordingActions()
  assert.throws(
    () => missingFile.actions.setOutput('result', 'PASS'),
    /GITHUB_OUTPUT is not set; this action only supports GitHub Actions environment files/
  )

  const nonexistentFile = createRecordingActions(
    {GITHUB_OUTPUT: '/tmp/missing-output'},
    undefined,
    false
  )
  assert.throws(
    () => nonexistentFile.actions.setOutput('result', 'PASS'),
    /GITHUB_OUTPUT does not exist/
  )

  const recording = createRecordingActions({GITHUB_OUTPUT: '/tmp/output'})
  assert.throws(
    () => recording.actions.setOutput('result', Number.NaN),
    /Output numbers must be finite/
  )
  assert.throws(
    () => recording.actions.setOutput('result', {value: 'PASS'}),
    /Unsupported output value type: object/
  )

  const delimiter = 'ghadelimiter_00000000-0000-4000-8000-000000000000'
  assert.throws(
    () => recording.actions.setOutput(`result-${delimiter}`, 'PASS'),
    /Output name contains the generated delimiter/
  )
  assert.throws(
    () => recording.actions.setOutput('result', `PASS-${delimiter}`),
    /Output value contains the generated delimiter/
  )
  assert.deepEqual(recording.writes, [])
})

test('setFailed reports bounded errors and sets a failing exit code', () => {
  const recording = createRecordingActions()

  recording.actions.setFailed('short failure')
  recording.actions.setFailed(new Error('error object'))
  recording.actions.setFailed('x'.repeat(MAX_FAILURE_MESSAGE_LENGTH + 1))

  assert.deepEqual(recording.exitCodes, [1, 1, 1])
  assert.deepEqual(recording.lines.slice(0, 2), [
    '::error::short failure',
    '::error::error object'
  ])
  assert.equal(
    recording.lines[2],
    `::error::${'x'.repeat(MAX_FAILURE_MESSAGE_LENGTH)}`
  )
})

test('default adapter uses the production Node boundaries', async t => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'pr-status-actions-'))
  const outputPath = join(temporaryRoot, 'output.txt')
  const originalOutput = process.env.GITHUB_OUTPUT
  const originalInput = process.env.INPUT_DEFAULT_NAME
  const originalExitCode = process.exitCode
  const lines: string[] = []

  t.mock.method(console, 'log', (message: unknown): void => {
    lines.push(String(message))
  })
  process.env.GITHUB_OUTPUT = outputPath
  process.env.INPUT_DEFAULT_NAME = ' production '
  await writeFile(outputPath, '')

  try {
    assert.equal(actions.getInput('default name'), 'production')
    actions.info('production info')
    actions.setOutput('result', 'PASS')
    actions.setFailed('production failure')

    const output = await readFile(outputPath, 'utf8')
    assert.match(
      output,
      /^result<<ghadelimiter_[0-9a-f-]+\nPASS\nghadelimiter_[0-9a-f-]+\n$/
    )
    const [openingDelimiter, closingDelimiter] = output
      .trimEnd()
      .split('\n')
      .filter(line => line.includes('ghadelimiter_'))
      .map(line => line.replace(/^result<</, ''))
    assert.equal(openingDelimiter, closingDelimiter)
    assert.deepEqual(lines, [
      'production info',
      '::error::production failure'
    ])
    assert.equal(process.exitCode, 1)
  } finally {
    if (originalOutput === undefined) {
      delete process.env.GITHUB_OUTPUT
    } else {
      process.env.GITHUB_OUTPUT = originalOutput
    }
    if (originalInput === undefined) {
      delete process.env.INPUT_DEFAULT_NAME
    } else {
      process.env.INPUT_DEFAULT_NAME = originalInput
    }
    process.exitCode = originalExitCode
    await rm(temporaryRoot, {recursive: true, force: true})
  }
})
