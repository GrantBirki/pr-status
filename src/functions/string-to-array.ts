import * as core from '@actions/core'

import type {CoreDependencies} from '../types.ts'

const defaultDependencies: CoreDependencies = {core}

// Helper function to convert a String to an Array specifically in Actions
// :param string: A comma separated string to convert to an array
// :return Array: The function returns an Array - can be empty
export function stringToArray(
  value: unknown,
  dependencies: CoreDependencies = defaultDependencies
): string[] {
  const coreApi = dependencies.core

  try {
    // Input validation - handle null, undefined, or non-string inputs
    if (value === null || value === undefined || typeof value !== 'string') {
      coreApi.debug(
        'in stringToArray(), invalid input was found so an empty Array was returned'
      )
      return []
    }

    // If the String is empty, return an empty Array
    if (value.trim() === '') {
      coreApi.debug(
        'in stringToArray(), an empty String was found so an empty Array was returned'
      )
      return []
    }

    // Split up the String on commas, trim each element, and return the Array
    const stringArray = value.split(',').map(target => target.trim())
    const results: string[] = []

    // filter out empty items
    for (const item of stringArray) {
      if (item === '') {
        continue
      }
      results.push(item)
    }

    return results
  } catch (error) {
    coreApi.error(`failed string for debugging purposes: ${String(value)}`)
    throw new Error(`could not convert String to Array - error: ${error}`)
  }
}
