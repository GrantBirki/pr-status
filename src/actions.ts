import {randomUUID} from 'node:crypto'
import {appendFileSync, existsSync} from 'node:fs'

export const MAX_FAILURE_MESSAGE_LENGTH = 4096

export interface InputOptions {
  required?: boolean
  trimWhitespace?: boolean
}

export type WorkflowCommandProperties = Readonly<
  Record<string, string | number | boolean>
>

export interface ActionsApi {
  getInput(name: string, options?: InputOptions): string
  debug(message: string): void
  info(message: string): void
  warning(
    message: string | Error,
    properties?: WorkflowCommandProperties
  ): void
  error(
    message: string | Error,
    properties?: WorkflowCommandProperties
  ): void
  setOutput(name: string, value: unknown): void
  setFailed(message: string | Error): void
}

export interface ActionsDependencies {
  env: NodeJS.ProcessEnv
  writeLine(message: string): void
  fileExists(path: string): boolean
  appendFile(path: string, data: string): void
  createUuid(): string
  setExitCode(code: number): void
}

function escapeCommandData(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
}

function escapeCommandProperty(value: string): string {
  return escapeCommandData(value).replace(/:/g, '%3A').replace(/,/g, '%2C')
}

function messageText(message: string | Error): string {
  return message instanceof Error ? message.message : message
}

function workflowCommand(
  command: string,
  message: string | Error,
  properties: WorkflowCommandProperties = {}
): string {
  const serializedProperties = Object.entries(properties).map(
    ([name, value]) => `${name}=${escapeCommandProperty(String(value))}`
  )
  const propertySection =
    serializedProperties.length === 0
      ? ''
      : ` ${serializedProperties.join(',')}`

  return `::${command}${propertySection}::${escapeCommandData(messageText(message))}`
}

function outputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'boolean') {
    return String(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Output numbers must be finite')
    }

    return String(value)
  }

  throw new TypeError(`Unsupported output value type: ${typeof value}`)
}

function failureMessage(message: string | Error): string {
  const value = messageText(message)
  return value.length > MAX_FAILURE_MESSAGE_LENGTH
    ? value.slice(0, MAX_FAILURE_MESSAGE_LENGTH)
    : value
}

export function createActions(
  overrides: Partial<ActionsDependencies> = {}
): ActionsApi {
  const dependencies: ActionsDependencies = {
    env: process.env,
    writeLine(message: string): void {
      console.log(message)
    },
    fileExists: existsSync,
    appendFile(path: string, data: string): void {
      appendFileSync(path, data, {encoding: 'utf8'})
    },
    createUuid: randomUUID,
    setExitCode(code: number): void {
      process.exitCode = code
    },
    ...overrides
  }

  function getInput(name: string, options: InputOptions = {}): string {
    const environmentName = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`
    const rawValue = dependencies.env[environmentName] ?? ''
    const value =
      options.trimWhitespace === false ? rawValue : rawValue.trim()

    if (options.required === true && value.length === 0) {
      throw new Error(`Input required and not supplied: ${name}`)
    }

    return value
  }

  function debug(message: string): void {
    dependencies.writeLine(workflowCommand('debug', message))
  }

  function info(message: string): void {
    dependencies.writeLine(message)
  }

  function warning(
    message: string | Error,
    properties: WorkflowCommandProperties = {}
  ): void {
    dependencies.writeLine(workflowCommand('warning', message, properties))
  }

  function error(
    message: string | Error,
    properties: WorkflowCommandProperties = {}
  ): void {
    dependencies.writeLine(workflowCommand('error', message, properties))
  }

  function setOutput(name: string, value: unknown): void {
    const outputPath = dependencies.env.GITHUB_OUTPUT
    if (!outputPath) {
      throw new Error(
        'GITHUB_OUTPUT is not set; this action only supports GitHub Actions environment files'
      )
    }
    if (!dependencies.fileExists(outputPath)) {
      throw new Error(
        'GITHUB_OUTPUT does not exist; this action only supports GitHub Actions environment files'
      )
    }

    const serializedValue = outputValue(value)
    const delimiter = `ghadelimiter_${dependencies.createUuid()}`
    if (name.includes(delimiter)) {
      throw new Error('Output name contains the generated delimiter')
    }
    if (serializedValue.includes(delimiter)) {
      throw new Error('Output value contains the generated delimiter')
    }

    dependencies.appendFile(
      outputPath,
      `${name}<<${delimiter}\n${serializedValue}\n${delimiter}\n`
    )
  }

  function setFailed(message: string | Error): void {
    error(failureMessage(message))
    dependencies.setExitCode(1)
  }

  return {getInput, debug, info, warning, error, setOutput, setFailed}
}

const actions = createActions()

export default actions
