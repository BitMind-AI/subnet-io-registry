import axios, { AxiosError } from 'axios'
import FormData from 'form-data'
import { findBinaryFile } from './discovery'
import { Config, TestCase, TestResult } from './types'
import { validateResponse } from './validator'

/**
 * Process request data to handle binary file placeholders
 */
function processRequestData(
  subnetId: string,
  endpoint: string,
  requestData: any
): { data: any; headers: Record<string, string>; isMultipart: boolean } {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  let isMultipart = false
  let data = { ...requestData }

  // Check if this is a multipart/form-data request with binary file placeholders
  if (requestData.formData) {
    const formData = new FormData()
    isMultipart = true

    // Process each form field
    for (const [key, value] of Object.entries(requestData.formData)) {
      if (value === '<binary file>') {
        // Find a binary file for this endpoint
        const binaryFile = findBinaryFile(subnetId, endpoint)
        if (binaryFile) {
          // Add the file to the form data
          formData.append(key, binaryFile.content, {
            filename: binaryFile.filename,
            contentType: binaryFile.mimeType,
          })
          console.log(
            `Using binary file ${binaryFile.filename} for ${subnetId}${endpoint}`
          )
        } else {
          console.warn(`No binary file found for ${subnetId}${endpoint}`)
          // Add a placeholder if no file is found
          formData.append(key, 'placeholder')
        }
      } else {
        // Add regular form field
        formData.append(key, String(value))
      }
    }

    // Use the form data instead of the original request data
    data = formData
    // Let the form data set its own content type with boundary
    headers[
      'Content-Type'
    ] = `multipart/form-data; boundary=${formData.getBoundary()}`
  }

  return { data, headers, isMultipart }
}

/**
 * Execute a single test case
 */
export async function executeTest(
  testCase: TestCase,
  config: Config
): Promise<TestResult> {
  const { subnetId, endpoint, request, expectedResponse } = testCase
  const startTime = Date.now()

  try {
    // Prepare the request URL
    const url = `${config.apiBaseUrl}/${subnetId}${endpoint.path}`

    // Process request data to handle binary files
    const {
      data,
      headers: contentHeaders,
      isMultipart,
    } = processRequestData(subnetId, endpoint.path, request)

    // Prepare headers with authorization
    const headers: Record<string, string> = {
      ...contentHeaders,
      Authorization: `Bearer ${config.apiToken}`,
    }

    // Execute the request with retry logic
    let lastError: Error | null = null
    let response: any = null
    let statusCode: number | undefined

    for (let attempt = 0; attempt < config.testRetryCount; attempt++) {
      try {
        const axiosConfig: any = {
          method: endpoint.method,
          url,
          headers,
          timeout: config.testTimeoutMs,
        }

        // Handle different request methods
        if (endpoint.method.toUpperCase() === 'GET') {
          // For GET requests, send data as query parameters
          axiosConfig.params = {}

          // Handle each key-value pair in the data object
          for (const [key, value] of Object.entries(data)) {
            // Special handling for arrays - create multiple params with the same key
            if (Array.isArray(value)) {
              // For arrays, add each element as a separate parameter with the same key
              axiosConfig.params[key] = value
            } else {
              // For non-arrays, add as a single parameter
              axiosConfig.params[key] = String(value)
            }
          }

          // Debug logging removed
        } else if (isMultipart) {
          // For multipart/form-data, use the form data object directly
          axiosConfig.data = data
          // Let axios handle the content type header with boundary
          delete axiosConfig.headers['Content-Type']
        } else {
          // For other requests (POST, PUT, etc.), use the data as is
          axiosConfig.data = data
        }

        const axiosResponse = await axios(axiosConfig)

        response = axiosResponse.data
        statusCode = axiosResponse.status
        lastError = null
        break // Success, exit retry loop
      } catch (error) {
        lastError = error as Error
        if (axios.isAxiosError(error)) {
          statusCode = error.response?.status
          // If it's a server error (5xx), retry
          if (statusCode && statusCode >= 500) {
            console.log(
              `Retrying subnet ${subnetId} endpoint ${endpoint.path} after server error ${statusCode}`
            )
            await new Promise((resolve) => setTimeout(resolve, 1000)) // Wait 1 second before retry
            continue
          }
        }
        break // For client errors or non-Axios errors, don't retry
      }
    }

    if (lastError) {
      // Handle the error case
      let errorMessage = lastError.message

      if (axios.isAxiosError(lastError)) {
        const axiosError = lastError as AxiosError
        const responseData = axiosError.response?.data as any
        errorMessage =
          (responseData?.error ? String(responseData.error) : undefined) ||
          (responseData?.message ? String(responseData.message) : undefined) ||
          `HTTP ${axiosError.response?.status}: ${axiosError.message}`
      }

      return {
        subnetId,
        endpoint,
        success: false,
        error: errorMessage,
        statusCode,
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
      }
    }

    // Validate the response
    const validationResult = validateResponse(response, expectedResponse)

    return {
      subnetId,
      endpoint,
      success: validationResult.valid,
      error: validationResult.valid
        ? undefined
        : validationResult.errors.join(', '),
      response,
      statusCode,
      responseTime: Date.now() - startTime,
      timestamp: new Date(),
    }
  } catch (error: any) {
    // Catch any unexpected errors
    return {
      subnetId,
      endpoint,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      responseTime: Date.now() - startTime,
      timestamp: new Date(),
    }
  }
}

/**
 * Execute all test cases in parallel
 */
export async function runTests(
  testCases: TestCase[],
  config: Config
): Promise<TestResult[]> {
  console.log(`Running ${testCases.length} tests...`)

  // Execute all tests in parallel with Promise.all
  return Promise.all(testCases.map((testCase) => executeTest(testCase, config)))
}
