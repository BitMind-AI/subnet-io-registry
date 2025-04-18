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
 * Load example requests and responses for a subnet endpoint
 */
export function loadSubnetExamples(
  subnetId: string,
  endpointPath: string
): { request: any; response: any }[] {
  const examples: { request: any; response: any }[] = []

  // Convert endpoint path to directory name
  const endpointName = endpointPath.replace(/^\//, '').replace(/\//g, '_')
  const examplesDir = path.join(SUBNETS_DIR, subnetId, 'examples', endpointName)

  // Check if examples directory exists
  if (!fs.existsSync(examplesDir)) {
    return examples
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
    } catch (error: any) {
      console.error(
        `Error parsing JSON for ${subnetId}${endpointPath}: ${
          error.message || String(error)
        }`
      )
      // Skip this example if there's a JSON parsing error
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
  // Convert endpoint path to directory name
  const endpointName = endpointPath.replace(/^\//, '').replace(/\//g, '_')
  const examplesDir = path.join(SUBNETS_DIR, subnetId, 'examples', endpointName)

  // Check if examples directory exists
  if (!fs.existsSync(examplesDir)) {
    return null
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

  return null
}

/**
 * Generate test cases for all subnets and endpoints
 */
export function generateTestCases(): TestCase[] {
  const testCases: TestCase[] = []

  for (const subnetId of getAvailableSubnets()) {
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
