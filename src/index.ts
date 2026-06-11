import {run} from './main.ts'

export function startEntrypoint(
  runAction: () => Promise<unknown> = run
): void {
  void runAction()
}

startEntrypoint()
