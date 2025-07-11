import {COLORS, Color} from '../../src/functions/colors'

describe('COLORS', () => {
  test('should have all expected color constants', () => {
    expect(COLORS.highlight).toBe('\u001b[35m')
    expect(COLORS.info).toBe('\u001b[34m')
    expect(COLORS.success).toBe('\u001b[32m')
    expect(COLORS.warning).toBe('\u001b[33m')
    expect(COLORS.error).toBe('\u001b[31m')
    expect(COLORS.reset).toBe('\u001b[0m')
  })

  test('should have the correct ANSI escape codes', () => {
    // eslint-disable-next-line no-control-regex
    expect(COLORS.highlight).toMatch(/^\u001b\[35m$/)
    // eslint-disable-next-line no-control-regex
    expect(COLORS.info).toMatch(/^\u001b\[34m$/)
    // eslint-disable-next-line no-control-regex
    expect(COLORS.success).toMatch(/^\u001b\[32m$/)
    // eslint-disable-next-line no-control-regex
    expect(COLORS.warning).toMatch(/^\u001b\[33m$/)
    // eslint-disable-next-line no-control-regex
    expect(COLORS.error).toMatch(/^\u001b\[31m$/)
    // eslint-disable-next-line no-control-regex
    expect(COLORS.reset).toMatch(/^\u001b\[0m$/)
  })

  test('should be a constant object', () => {
    // Test that the object properties exist and are strings
    expect(typeof COLORS.highlight).toBe('string')
    expect(typeof COLORS.info).toBe('string')
    expect(typeof COLORS.success).toBe('string')
    expect(typeof COLORS.warning).toBe('string')
    expect(typeof COLORS.error).toBe('string')
    expect(typeof COLORS.reset).toBe('string')
  })

  test('should have all colors as strings', () => {
    expect(typeof COLORS.highlight).toBe('string')
    expect(typeof COLORS.info).toBe('string')
    expect(typeof COLORS.success).toBe('string')
    expect(typeof COLORS.warning).toBe('string')
    expect(typeof COLORS.error).toBe('string')
    expect(typeof COLORS.reset).toBe('string')
  })

  test('should have Color type properly defined', () => {
    const highlight: Color = COLORS.highlight
    const info: Color = COLORS.info
    const success: Color = COLORS.success
    const warning: Color = COLORS.warning
    const error: Color = COLORS.error
    const reset: Color = COLORS.reset

    expect(highlight).toBe(COLORS.highlight)
    expect(info).toBe(COLORS.info)
    expect(success).toBe(COLORS.success)
    expect(warning).toBe(COLORS.warning)
    expect(error).toBe(COLORS.error)
    expect(reset).toBe(COLORS.reset)
  })

  test('should work in string concatenation', () => {
    const coloredText = `${COLORS.highlight}Hello${COLORS.reset}`
    expect(coloredText).toBe('\u001b[35mHello\u001b[0m')
  })

  test('should work in template literals', () => {
    const text = 'World'
    const coloredText = `${COLORS.success}${text}${COLORS.reset}`
    expect(coloredText).toBe('\u001b[32mWorld\u001b[0m')
  })

  test('should have different values for different colors', () => {
    const colors = Object.values(COLORS)
    const uniqueColors = [...new Set(colors)]
    expect(uniqueColors.length).toBe(colors.length)
  })

  test('should contain all expected keys', () => {
    const expectedKeys = [
      'highlight',
      'info',
      'success',
      'warning',
      'error',
      'reset'
    ]
    const actualKeys = Object.keys(COLORS)
    expect(actualKeys.sort()).toEqual(expectedKeys.sort())
  })

  test('should have proper length for each color code', () => {
    // All ANSI color codes should be 5 characters (including escape sequence)
    expect(COLORS.highlight.length).toBe(5)
    expect(COLORS.info.length).toBe(5)
    expect(COLORS.success.length).toBe(5)
    expect(COLORS.warning.length).toBe(5)
    expect(COLORS.error.length).toBe(5)
    expect(COLORS.reset.length).toBe(4) // Reset is 4 characters
  })
})
