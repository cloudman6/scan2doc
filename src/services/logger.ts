import { createConsola } from 'consola/browser'

// Create the root logger
export const logger = createConsola({
  level: 3, // Default to Info level
})

// Export specialized loggers for different modules
export const pdfLogger = logger.withTag('PDF')
export const queueLogger = logger.withTag('Queue')
export const dbLogger = logger.withTag('DB')
export const storeLogger = logger.withTag('Store')
export const addLogger = logger.withTag('Add')

export default logger
