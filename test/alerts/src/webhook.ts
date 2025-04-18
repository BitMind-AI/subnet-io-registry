import { exec, execSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { Config, WebhookPayload } from './types'

/**
 * Verify GitHub webhook signature
 */
function verifySignature(
  payload: Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false
  }

  const hmac = crypto.createHmac('sha1', secret)
  const digest = 'sha1=' + hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

/**
 * Handle webhook request
 */
function handleWebhook(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: Config
): void {
  const chunks: Buffer[] = []

  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk)
  })

  req.on('end', () => {
    const payload = Buffer.concat(chunks)
    const signature = req.headers['x-hub-signature'] as string | undefined

    // Verify signature
    if (!verifySignature(payload, signature, config.webhookSecret)) {
      console.error('Invalid webhook signature')
      res.statusCode = 401
      res.end('Invalid signature')
      return
    }

    try {
      // Parse payload
      const webhookData = JSON.parse(payload.toString()) as WebhookPayload

      // Get the branch name from the webhook data
      const branchName = webhookData.ref.replace('refs/heads/', '')

      // Get the current branch of the repository
      const getCurrentBranch = () => {
        try {
          // Execute git command to get current branch
          const currentBranch = execSync(
            `cd ${config.repoPath} && git rev-parse --abbrev-ref HEAD`,
            { encoding: 'utf8' }
          ).trim()
          return currentBranch
        } catch (error) {
          console.error('Error getting current branch:', error)
          // Default to main if we can't determine the current branch
          return 'main'
        }
      }

      const currentBranch = getCurrentBranch()

      // Only process pushes to the current branch
      if (branchName !== currentBranch) {
        console.log(
          `Ignoring push to ${branchName} branch (current branch is ${currentBranch})`
        )
        res.statusCode = 200
        res.end(
          `Ignored push to ${branchName} branch. Only pushes to the current branch (${currentBranch}) are processed.`
        )
        return
      }

      console.log(
        `Processing push to ${branchName} branch (matches current branch)`
      )

      console.log(`Received valid webhook from ${webhookData.pusher.name}`)
      console.log(`Repository: ${webhookData.repository.full_name}`)
      console.log(`Commits: ${webhookData.commits.length}`)

      // Execute update script
      const scriptPath = path.join(config.repoPath, 'test/alerts/start.sh')
      console.log('Executing update script...')
      // Use webhook-update command to avoid restart loops
      const updateCommand = fs.existsSync(scriptPath)
        ? `${scriptPath} webhook-update`
        : 'npm run update'

      console.log(`Running command: ${updateCommand}`)
      exec(updateCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing update script: ${error.message}`)
          res.statusCode = 500
          res.end('Error updating repository')
          return
        }

        console.log('Update script output:')
        console.log(stdout)

        if (stderr) {
          console.error('Update script errors:')
          console.error(stderr)
        }

        console.log('Repository updated successfully')
        res.statusCode = 200
        res.end('Repository updated successfully')
      })
    } catch (error) {
      console.error('Error processing webhook:', error)
      res.statusCode = 400
      res.end('Error processing webhook')
    }
  })
}

/**
 * Start the webhook server
 */
export function startWebhookServer(config: Config): http.Server | null {
  if (!config.webhookEnabled) {
    console.log('Webhook server is disabled')
    return null
  }

  console.log(`Starting webhook server on port ${config.webhookPort}...`)

  const server = http.createServer((req, res) => {
    // Only accept POST requests to the root path
    if (req.method === 'POST' && req.url === '/') {
      handleWebhook(req, res, config)
    } else {
      res.statusCode = 404
      res.end('Not found')
    }
  })

  server.listen(config.webhookPort, () => {
    console.log(`Webhook server listening on port ${config.webhookPort}`)
    console.log(`Repository path: ${config.repoPath}`)
  })

  server.on('error', (error) => {
    console.error('Webhook server error:', error)
  })

  return server
}
