import * as core from '@actions/core'

/**
 * Helper function to convert a String to an Array specifically in Actions
 * @param string - A comma separated string to convert to an array
 * @returns The function returns an Array - can be empty
 */
export function stringToArray(string: string | null | undefined): string[] {
  try {
    // Input validation - handle null, undefined, or non-string inputs
    if (string === null || string === undefined || typeof string !== 'string') {
      core.debug(
        'in stringToArray(), invalid input was found so an empty Array was returned'
      )
      return []
    }

    // If the String is empty, return an empty Array
    if (string.trim() === '') {
      core.debug(
        'in stringToArray(), an empty String was found so an empty Array was returned'
      )
      return []
    }

    // Split up the String on commas, trim each element, and return the Array
    const stringArray: string[] = string.split(',').map(target => target.trim())
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
    core.error(`failed string for debugging purposes: ${string}`)
    throw new Error(`could not convert String to Array - error: ${error}`)
  }
}
