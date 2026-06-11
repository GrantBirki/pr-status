import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

export const COVERAGE_BADGE = `<svg xmlns="http://www.w3.org/2000/svg" width="105" height="20" role="img" aria-label="coverage: 100%">
  <title>coverage: 100%</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="105" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="63" height="20" fill="#555"/>
    <rect x="63" width="42" height="20" fill="#4c1"/>
    <rect width="105" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="315" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="530">coverage</text>
    <text x="315" y="140" transform="scale(.1)" textLength="530">coverage</text>
    <text aria-hidden="true" x="840" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="320">100%</text>
    <text x="840" y="140" transform="scale(.1)" textLength="320">100%</text>
  </g>
</svg>
`

export function writeCoverageBadge(rootDirectory = process.cwd()): string {
  const outputPath = join(rootDirectory, 'badges', 'coverage.svg')
  mkdirSync(dirname(outputPath), {recursive: true})
  writeFileSync(outputPath, COVERAGE_BADGE)
  return outputPath
}

const invokedPath = process.argv[1]
if (
  invokedPath &&
  import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  writeCoverageBadge()
}
