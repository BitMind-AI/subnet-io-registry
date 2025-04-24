import fs from 'fs'
import yaml from 'js-yaml'
import path from 'path'
import { ApiDefinition, TestCase } from './types'

// Common binary file types and their MIME types
const BINARY_FILE_TYPES = [
  { pattern: '*.mp4', mimeType: 'video/mp4' },
  { pattern: '*.mov', mimeType: 'video/quicktime' },
  { pattern: '*.avi', mimeType: 'video/x-msvideo' },
  { pattern: '*.jpg', mimeType: 'image/jpeg' },
  { pattern: '*.jpeg', mimeType: 'image/jpeg' },
  { pattern: '*.png', mimeType: 'image/png' },
  { pattern: '*.gif', mimeType: 'image/gif' },
  { pattern: '*.pdf', mimeType: 'application/pdf' },
  { pattern: '*.txt', mimeType: 'text/plain' },
]

// Path to the subnets directory
const SUBNETS_DIR = path.resolve(__dirname, '../../../subnets')

/**
 * Get a list of available subnet IDs
 */
export function getAvailableSubnets(): string[] {
  return fs
    .readdirSync(SUBNETS_DIR)
    .filter((dir) => fs.statSync(path.join(SUBNETS_DIR, dir)).isDirectory())
    .filter((dir) => fs.existsSync(path.join(SUBNETS_DIR, dir, 'api.yml')))
}

/**
 * Load API definition for a subnet
 */
export function loadSubnetApi(subnetId: string): ApiDefinition {
  const apiFile = path.join(SUBNETS_DIR, subnetId, 'api.yml')
  const fileContent = fs.readFileSync(apiFile, 'utf-8')
  return yaml.load(fileContent) as ApiDefinition
}

/**
 * Generate possible directory names for an endpoint path
 */
function getPossibleDirectoryNames(endpointPath: string): string[] {
  // Remove leading slash
  const pathClean = endpointPath.replace(/^\//, '')

  // Generate possible directory names with different separators
  return [
    pathClean, // path/to/endpoint
    pathClean.replace(/\//g, '_'), // path_to_endpoint
    pathClean.replace(/\//g, '-'), // path-to-endpoint
    pathClean.replace(/-/g, '_'), // path_to_endpoint (if path has hyphens)
    pathClean.replace(/-/g, '/').replace(/\//g, '_'), // path_to_endpoint (if path has hyphens and slashes)
  ]
}

/**
 * Load example requests and responses for a subnet endpoint
 */
export function loadSubnetExamples(
  subnetId: string,
  endpointPath: string
): { request: any; response: any }[] {
  const examples: { request: any; response: any }[] = []

  // Get possible directory names for the endpoint path
  const possibleDirNames = getPossibleDirectoryNames(endpointPath)

  // Try each possible directory name
  for (const dirName of possibleDirNames) {
    const examplesDir = path.join(SUBNETS_DIR, subnetId, 'examples', dirName)

    // Check if examples directory exists
    if (!fs.existsSync(examplesDir)) {
      continue
    }

    // Check for request.json and response.json files
    const requestFile = path.join(examplesDir, 'request.json')
    const responseFile = path.join(examplesDir, 'response.json')

    if (fs.existsSync(requestFile)) {
      try {
        const request = JSON.parse(fs.readFileSync(requestFile, 'utf-8'))
        const response = fs.existsSync(responseFile)
          ? JSON.parse(fs.readFileSync(responseFile, 'utf-8'))
          : null

        examples.push({ request, response })
        console.log(
          `Loaded example for ${subnetId}${endpointPath} from ${examplesDir}`
        )

        // We found an example, no need to check other possible directory names
        break
      } catch (error: any) {
        console.error(
          `Error parsing JSON for ${subnetId}${endpointPath} in ${examplesDir}: ${
            error.message || String(error)
          }`
        )
        // Skip this example if there's a JSON parsing error
      }
    }
  }

  return examples
}

/**
 * Find a binary file in the examples directory for a given subnet and endpoint
 */
export function findBinaryFile(
  subnetId: string,
  endpointPath: string
): { filename: string; content: Buffer; mimeType: string } | null {
  // Get possible directory names for the endpoint path
  const possibleDirNames = getPossibleDirectoryNames(endpointPath)

  // Try each possible directory name
  for (const dirName of possibleDirNames) {
    const examplesDir = path.join(SUBNETS_DIR, subnetId, 'examples', dirName)

    // Check if examples directory exists
    if (!fs.existsSync(examplesDir)) {
      continue
    }

    // Look for binary files of supported types
    for (const { pattern, mimeType } of BINARY_FILE_TYPES) {
      // Use glob pattern to find matching files
      const files = fs.readdirSync(examplesDir).filter((file) => {
        // Simple glob pattern matching for file extensions
        const extension = path.extname(file).toLowerCase()
        return pattern.endsWith(extension)
      })

      if (files.length > 0) {
        try {
          const filePath = path.join(examplesDir, files[0])
          const content = fs.readFileSync(filePath)
          return {
            filename: files[0],
            content,
            mimeType,
          }
        } catch (error: any) {
          console.error(
            `Error reading binary file: ${error.message || String(error)}`
          )
        }
      }
    }
  }

  return null
}

/**
 * Generate test cases for all subnets and endpoints
 * @param specificSubnetId Optional subnet ID to test only a specific subnet
 */
export function generateTestCases(specificSubnetId?: string): TestCase[] {
  const testCases: TestCase[] = []

  // Get subnets to test - either all available or just the specified one
  const subnetsToTest = specificSubnetId
    ? [specificSubnetId].filter((id) => getAvailableSubnets().includes(id))
    : getAvailableSubnets()

  // If a specific subnet was requested but not found, log a warning
  if (specificSubnetId && subnetsToTest.length === 0) {
    console.warn(
      `Warning: Subnet ${specificSubnetId} not found or has no API definition.`
    )
    return []
  }

  for (const subnetId of subnetsToTest) {
    try {
      const apiDef = loadSubnetApi(subnetId)

      for (const endpoint of apiDef.endpoints) {
        const examples = loadSubnetExamples(subnetId, endpoint.path)

        for (const example of examples) {
          testCases.push({
            subnetId,
            endpoint,
            request: example.request,
            expectedResponse: example.response,
          })
        }
      }
    } catch (error) {
      console.error(
        `Error generating test cases for subnet ${subnetId}:`,
        error
      )
    }
  }

  return testCases
}
