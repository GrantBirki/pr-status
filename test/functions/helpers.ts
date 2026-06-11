import type {CoreApi} from '../../src/types.ts'

export interface RecordingCore {
  core: CoreApi
  debug: string[]
  info: string[]
  warning: string[]
  error: string[]
  failed: Array<string | Error>
  outputs: Map<string, unknown>
}

export function createRecordingCore(): RecordingCore {
  const debug: string[] = []
  const info: string[] = []
  const warning: string[] = []
  const error: string[] = []
  const failed: Array<string | Error> = []
  const outputs = new Map<string, unknown>()

  const core: CoreApi = {
    getInput(name: string): string {
      throw new Error(`Unexpected input request: ${name}`)
    },
    debug(message: string): void {
      debug.push(message)
    },
    info(message: string): void {
      info.push(message)
    },
    warning(message: string): void {
      warning.push(message)
    },
    error(message: string): void {
      error.push(message)
    },
    setOutput(name: string, value: unknown): void {
      outputs.set(name, value)
    },
    setFailed(message: string | Error): void {
      failed.push(message)
    }
  }

  return {core, debug, info, warning, error, failed, outputs}
}

export function includesMessage(messages: string[], text: string): boolean {
  return messages.some(message => message.includes(text))
}
