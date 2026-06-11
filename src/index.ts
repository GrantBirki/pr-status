import {run} from './main.ts'

export function startEntrypoint(
  environment: NodeJS.ProcessEnv = process.env,
  runAction: () => Promise<unknown> = run
): void {
  if (environment.CI === 'true') {
    void runAction()
  }
}

startEntrypoint()
