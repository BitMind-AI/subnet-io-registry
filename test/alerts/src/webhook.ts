import { exec } from 'child_process'
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

      // Only process pushes to the main, master, or staging branches
      const allowedBranches = ['main', 'master', 'staging']
      const branchName = webhookData.ref.replace('refs/heads/', '')

      if (!allowedBranches.includes(branchName)) {
        console.log(`Ignoring push to ${webhookData.ref}`)
        res.statusCode = 200
        res.end(
          `Ignored push to ${branchName} branch. Only ${allowedBranches.join(
            ', '
          )} branches are processed.`
        )
        return
      }

      console.log(`Processing push to ${branchName} branch`)

      console.log(`Received valid webhook from ${webhookData.pusher.name}`)
      console.log(`Repository: ${webhookData.repository.full_name}`)
      console.log(`Commits: ${webhookData.commits.length}`)

      // Execute update script
      const scriptPath = path.join(config.repoPath, 'test/alerts/start.sh')
      console.log('Executing update script...')
      // Use npm run update if the script exists, otherwise fall back to direct execution
      const updateCommand = fs.existsSync(scriptPath)
        ? `${scriptPath} update`
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
