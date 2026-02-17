import { createApp } from './app.js'
import { migrateSecrets } from './config/store.js'
import { cleanupOldJobs } from './domain/jobs/imageJobs.js'
import { JOB_RETENTION_TIME, CLEANUP_INTERVAL } from './utils/constants.js'

const port = Number(process.env.PORT ?? 3001)

/**
 * Gracefully shutdown the server
 */
function setupGracefulShutdown(server: any, cleanup: NodeJS.Timeout) {
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`)
    
    // Stop accepting new connections
    server.close(() => {
      console.log('Server closed')
      
      // Clear cleanup interval
      clearInterval(cleanup)
      
      // Exit process
      process.exit(0)
    })
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout')
      process.exit(1)
    }, 10000)
  }
  
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

/**
 * Start the server
 */
async function start() {
  try {
    // Run migrations
    console.log('Running migrations...')
    await migrateSecrets()
    
    // Create and start server
    console.log('Starting server...')
    const app = createApp()
    const server = app.listen(port, () => {
      console.log(`âœ“ CCG server listening on http://localhost:${port}`)
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log(`  Press Ctrl+C to stop`)
    })
    
    // Setup job cleanup
    const cleanup = setInterval(
      () => cleanupOldJobs(JOB_RETENTION_TIME),
      CLEANUP_INTERVAL
    )
    cleanup.unref()
    
    // Setup graceful shutdown
    setupGracefulShutdown(server, cleanup)
    
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Start the server
start()
