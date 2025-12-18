import PQueue from 'p-queue'
import { pdfEvents } from './events'
import { db } from '@/db/index'
import type { DBPage } from '@/db/index'
import { enhancedPdfRenderer } from './enhancedPdfRenderer'

// PDF page render task interface
interface PDFRenderTask {
  pageId: string
  pdfData: ArrayBuffer
  pageNumber: number
  fileName: string
  pdfBase64?: string  // Base64 backup for reconstruction
  originalSize?: number  // Original size for validation
}

// Create singleton queue instance
export const pdfRenderQueue = new PQueue({
  concurrency: 2, // Process 2 pages at a time to balance performance and responsiveness
  autoStart: true
})

// Worker instance management
let workerInstance: Worker | null = null
let renderingTasks = new Map<string, PDFRenderTask>()

/**
 * Initialize PDF render worker
 */
function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('../../workers/pdfRender.worker.ts', import.meta.url), {
      type: 'module'
    })

    // Handle worker messages
    workerInstance.addEventListener('message', (event) => {
      const response = event.data

      if (response.type === 'error') {
        handleRenderError(response.payload.pageId, response.payload.error)
      } else {
        // Validate response data before processing
        if (!response.pageId) {
          console.warn('[PDF Queue] Received worker response without pageId:', response)
          return
        }

        if (!response.imageData) {
          console.warn('[PDF Queue] Received worker response without imageData:', response)
          return
        }

        // Check if we're still tracking this task
        if (!renderingTasks.has(response.pageId)) {
          console.warn(`[PDF Queue] Received response for unknown task: ${response.pageId}`)
          return
        }

        // Worker now returns base64 directly
        handleRenderSuccess(
          response.pageId,
          response.imageData,
          response.width,
          response.height,
          response.pageNumber
        )
      }
    })

    // Handle worker errors
    workerInstance.addEventListener('error', (error) => {
      console.error('PDF Worker error:', error)
      pdfEvents.emit('pdf:processing-error', {
        file: new File([], 'unknown.pdf'),
        error: `Worker error: ${error.message}`
      })
    })
  }

  return workerInstance
}


/**
 * Generate thumbnail from full-size image data
 */
async function generateThumbnail(
  imageData: string,
  maxSize: number = 200
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!

        // Calculate thumbnail dimensions maintaining aspect ratio
        const { width, height } = calculateThumbnailDimensions(
          img.width,
          img.height,
          maxSize,
          maxSize
        )

        canvas.width = width
        canvas.height = height

        // Draw and resize image
        ctx.drawImage(img, 0, 0, width, height)

        // Convert to base64
        const thumbnailData = canvas.toDataURL('image/jpeg', 0.8)
        resolve(thumbnailData)
      } catch (error) {
        reject(error)
      }
    }

    img.onerror = () => reject(new Error('Failed to load image for thumbnail generation'))
    img.src = imageData
  })
}

/**
 * Calculate thumbnail dimensions maintaining aspect ratio
 */
function calculateThumbnailDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const widthRatio = maxWidth / originalWidth
  const heightRatio = maxHeight / originalHeight
  const ratio = Math.min(widthRatio, heightRatio, 1) // Don't upscale

  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio)
  }
}

/**
 * Handle successful page rendering
 */
async function handleRenderSuccess(
  pageId: string,
  imageData: string,
  width: number,
  height: number,
  pageNumber: number
): Promise<void> {
  console.log(`[PDF Success] Render success for pageId: ${pageId}`)

  try {
    const task = renderingTasks.get(pageId)
    if (!task) {
      console.error(`[PDF Error] No task found for pageId: ${pageId}. Available tasks:`, Array.from(renderingTasks.keys()))
      return
    }

    // Get the page from database
    const page = await db.getPage(pageId)
    if (!page) {
      console.error(`[PDF Error] Page not found in database: ${pageId}`)
      return
    }

    // Validate image data
    if (!imageData || !imageData.startsWith('data:')) {
      console.error(`[PDF Error] Invalid image data for pageId: ${pageId}`)
      handleRenderError(pageId, 'Invalid image data returned from worker')
      return
    }

    // Generate thumbnail
    let thumbnailData: string
    try {
      thumbnailData = await generateThumbnail(imageData, 200)
      console.log(`[PDF Success] Generated thumbnail for pageId: ${pageId}`)
    } catch (thumbError) {
      console.warn(`[PDF Warning] Failed to generate thumbnail for ${pageId}:`, thumbError)
      // Fall back to using the original image as thumbnail
      thumbnailData = imageData
    }

    // Update page with rendered image data and thumbnail
    const updatedPage: DBPage = {
      ...page,
      imageData,
      thumbnailData,
      width,
      height,
      status: 'done',
      progress: 100,
      updatedAt: new Date(),
      processedAt: new Date()
    }

    // Save to database
    await db.savePage(updatedPage)

    // Emit success event
    pdfEvents.emit('pdf:page:done', {
      pageId,
      imageData,
      thumbnailData,
      width,
      height
    })

    console.log(`[PDF Success] Successfully updated page ${pageId} with image data and thumbnail`)

    // Clean up
    renderingTasks.delete(pageId)
    console.log(`[PDF Success] Removed task for pageId: ${pageId}. Remaining tasks:`, Array.from(renderingTasks.keys()))

    // Update overall progress
    await updateOverallProgress()

  } catch (error) {
    console.error(`[PDF Error] Error handling render success for ${pageId}:`, error)
    handleRenderError(pageId, error instanceof Error ? error.message : 'Unknown error')
  }
}

/**
 * Handle page rendering error
 */
async function handleRenderError(pageId: string, errorMessage: string): Promise<void> {
  console.log(`[PDF Error] Render error for pageId: ${pageId}, error: ${errorMessage}`)

  try {
    const task = renderingTasks.get(pageId)
    if (!task) {
      console.error(`[PDF Error] No task found for pageId: ${pageId}. Available tasks:`, Array.from(renderingTasks.keys()))
      return
    }

    // Get the page from database
    const page = await db.getPage(pageId)
    if (!page) {
      console.error(`[PDF Error] Page not found in database: ${pageId}`)
      return
    }

    // Add error log to page
    const errorLog = {
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'error' as const,
      message: `Rendering failed: ${errorMessage}`,
      details: {
        pageNumber: task.pageNumber,
        fileName: task.fileName,
        error: errorMessage
      }
    }

    // Update page with error status
    const updatedPage: DBPage = {
      ...page,
      status: 'error',
      updatedAt: new Date(),
      logs: [...page.logs, errorLog]
    }

    // Save to database
    await db.savePage(updatedPage)

    // Emit error event
    pdfEvents.emit('pdf:page:error', {
      pageId,
      error: errorMessage
    })

    console.log(`[PDF Error] Updated page ${pageId} with error status`)

    // Clean up
    renderingTasks.delete(pageId)
    console.log(`[PDF Error] Removed task for pageId: ${pageId}. Remaining tasks:`, Array.from(renderingTasks.keys()))

  } catch (error) {
    console.error(`[PDF Error] Error handling render error for ${pageId}:`, error)
  }
}

/**
 * Update overall PDF processing progress
 */
async function updateOverallProgress(): Promise<void> {
  try {
    const allPages = await db.getAllPages()
    const pdfPages = allPages.filter(page => page.fileType === 'application/pdf')

    const totalPages = pdfPages.length
    const completedPages = pdfPages.filter(page => page.status === 'done').length
    const errorPages = pdfPages.filter(page => page.status === 'error').length

    // Emit progress event
    pdfEvents.emit('pdf:progress', {
      done: completedPages,
      total: totalPages
    })

    // Check if all PDF pages are processed
    if (totalPages > 0 && (completedPages + errorPages) === totalPages) {
      if (errorPages === 0) {
        pdfEvents.emit('pdf:processing-complete', {
          file: new File([], 'completed.pdf'),
          totalPages
        })
      }
    }

  } catch (error) {
    console.error('Error updating overall progress:', error)
  }
}

/**
 * Convert ArrayBuffer to base64 for safe storage
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert base64 back to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Queue a PDF page for rendering
 */
export async function queuePDFPageRender(task: PDFRenderTask): Promise<void> {
  console.log(`[PDF Queue] Queuing page render for pageId: ${task.pageId}, pageNumber: ${task.pageNumber}`)

  // Check if already processed
  const page = await db.getPage(task.pageId)
  if (page && (page.status === 'done' || page.status === 'rendering')) {
    console.log(`[PDF Queue] Skipping page ${task.pageId} - status: ${page.status}`)
    return // Skip if already processed or currently rendering
  }

  // Store PDF base64 data for reliable reconstruction
  const pdfBase64 = arrayBufferToBase64(task.pdfData)

  // Create enhanced task with base64 backup
  const enhancedTask = {
    ...task,
    pdfBase64,
    originalSize: task.pdfData.byteLength
  }

  // Add task to tracking map BEFORE queuing
  renderingTasks.set(task.pageId, enhancedTask)
  console.log(`[PDF Queue] Added task to tracking map. Current tasks:`, Array.from(renderingTasks.keys()))

  // Add to queue
  await pdfRenderQueue.add(async () => {
    console.log(`[PDF Queue] Starting render for pageId: ${task.pageId}`)
    await renderPDFPage(enhancedTask)
  })
}

/**
 * Render a single PDF page
 */
async function renderPDFPage(task: PDFRenderTask): Promise<void> {
  try {
    console.log(`[PDF Render] Starting render for pageId: ${task.pageId}, pageNumber: ${task.pageNumber}`)

    // Update page status to rendering
    const page = await db.getPage(task.pageId)
    if (page) {
      const updatedPage: DBPage = {
        ...page,
        status: 'rendering',
        progress: 50,
        updatedAt: new Date()
      }
      await db.savePage(updatedPage)
      console.log(`[PDF Render] Updated page ${task.pageId} status to rendering`)
    }

    // Ensure task is in tracking map
    if (!renderingTasks.has(task.pageId)) {
      console.warn(`[PDF Render] Task not found in tracking map, adding now: pageId=${task.pageId}`)
      renderingTasks.set(task.pageId, task)
    }

    // Emit rendering event
    pdfEvents.emit('pdf:page:rendering', { pageId: task.pageId })
    pdfEvents.emit('pdf:log', {
      pageId: task.pageId,
      message: `Rendering page ${task.pageNumber}`,
      level: 'info'
    })

    // Validate task data
    if (!task.pdfData || task.pdfData.byteLength === 0) {
      throw new Error('PDF data is empty or invalid')
    }
    if (!task.pageId) {
      throw new Error('Page ID is required')
    }
    if (!task.pageNumber || task.pageNumber < 1) {
      throw new Error(`Invalid page number: ${task.pageNumber}`)
    }

    // Create a fresh copy of PDF data for this rendering attempt
    // This avoids ArrayBuffer detachment issues
    let pdfDataCopy: ArrayBuffer

    try {
      pdfDataCopy = task.pdfData.slice(0)
    } catch (sliceError) {
      console.warn(`[PDF Render] Cannot copy PDF data, reconstructing from base64 backup:`, sliceError)

      // Fallback: reconstruct from base64 backup
      if (!task.pdfBase64) {
        throw new Error('PDF data is detached and no base64 backup is available')
      }

      try {
        pdfDataCopy = base64ToArrayBuffer(task.pdfBase64)
        console.log(`[PDF Render] Successfully reconstructed PDF data from base64 (${pdfDataCopy.byteLength} bytes)`)
      } catch (reconstructionError) {
        console.error(`[PDF Render] Failed to reconstruct PDF data from base64:`, reconstructionError)
        throw new Error('PDF data reconstruction failed')
      }
    }

    // Try enhanced rendering first, fallback to worker if needed
    try {
      console.log(`[PDF Render] Attempting enhanced rendering for pageId: ${task.pageId}`)

      // Get optimal fallback font for this PDF
      const fallbackFont = await enhancedPdfRenderer.getOptimalFallbackFont(pdfDataCopy)
      console.log(`[PDF Render] Using fallback font: ${fallbackFont} for pageId: ${task.pageId}`)

      // Use enhanced renderer
      const result = await enhancedPdfRenderer.renderPage(pdfDataCopy, task.pageNumber, {
        scale: 2.5,
        imageFormat: 'png',
        quality: 0.95,
        useEnhancedFonts: true,
        fallbackFontFamily: fallbackFont
      })

      // Handle successful enhanced rendering
      await handleRenderSuccess(
        task.pageId,
        result.imageData,
        result.width,
        result.height,
        task.pageNumber
      )

      console.log(`[PDF Render] Enhanced rendering successful for pageId: ${task.pageId}`)

    } catch (enhancedError) {
      console.warn(`[PDF Render] Enhanced rendering failed for ${task.pageId}, falling back to worker:`, enhancedError)

      // Fallback to worker rendering - create another copy if needed
      let workerPdfData: ArrayBuffer
      try {
        workerPdfData = pdfDataCopy.slice(0)
      } catch (workerSliceError) {
        console.warn(`[PDF Render] Cannot create worker copy, using original:`, workerSliceError)
        workerPdfData = pdfDataCopy
      }

      const worker = getWorker()

      worker.postMessage({
        type: 'render',
        payload: {
          pdfData: workerPdfData,
          pageId: task.pageId,
          pageNumber: task.pageNumber,
          scale: 2.5,
          imageFormat: 'png',
          quality: 0.95
        }
      })
    }

  } catch (error) {
    console.error(`[PDF Render] Error queueing PDF page render for ${task.pageId}:`, error)
    await handleRenderError(task.pageId, error instanceof Error ? error.message : 'Unknown render error')
  }
}

/**
 * Queue all pages from a PDF file
 */
export async function queuePDFPages(
  file: File,
  pdfData: ArrayBuffer,
  pageCount: number
): Promise<void> {
  try {
    // Create pages for each PDF page (if not already created)
    const pages: Omit<DBPage, 'id' | 'createdAt' | 'updatedAt'>[] = []

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      // Generate page name: <PDF文件名>_<page number>.png
      const baseName = file.name.replace(/\.pdf$/i, '')
      const pageFileName = `${baseName}_${pageNum}.png`

      pages.push({
        fileName: pageFileName,
        fileSize: 0, // Will be updated after rendering
        fileType: 'image/png', // Rendered as PNG
        status: 'idle',
        progress: 0,
        order: -1, // Will be set by store
        outputs: [],
        logs: [{
          id: Date.now().toString(),
          timestamp: new Date(),
          level: 'info',
          message: `Page ${pageNum} of ${file.name} ready for rendering`
        }]
      })
    }

    // Save pages to database
    const savedPageIds: string[] = []
    for (const pageData of pages) {
      const pageId = await db.saveAddedPage(pageData)
      if (!pageId) {
        throw new Error('Failed to save page to database - no ID returned')
      }
      savedPageIds.push(pageId)
    }

    // Queue each page for rendering
    for (let i = 0; i < savedPageIds.length; i++) {
      const pageId = savedPageIds[i]
      const pageNumber = i + 1

      // Validate pageId before queuing
      if (!pageId) {
        console.error(`Invalid pageId at index ${i}:`, pageId)
        continue
      }

      // Each task will create its own copy when needed
      await queuePDFPageRender({
        pageId,
        pdfData,
        pageNumber,
        fileName: file.name
      })
    }

    // Emit processing start event
    pdfEvents.emit('pdf:processing-start', {
      file,
      totalPages: pageCount
    })

  } catch (error) {
    console.error('Error queueing PDF pages:', error)
    pdfEvents.emit('pdf:processing-error', {
      file,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Resume processing of idle PDF pages
 */
export async function resumePDFProcessing(): Promise<void> {
  try {
    // Find all PDF pages with idle status
    const idlePages = await db.getPagesByStatus('idle')
    const pdfPages = idlePages.filter(page => page.fileName && page.fileName.includes('.pdf_'))

    if (pdfPages.length === 0) {
      return
    }

    console.log(`Resuming processing for ${pdfPages.length} PDF pages`)

    // Group pages by original PDF file
    const pagesByFile = new Map<string, DBPage[]>()

    for (const page of pdfPages) {
      // Extract original PDF filename from page name
      const match = page.fileName.match(/^(.+?)_\d+\.png$/)
      const pdfFileName = match ? `${match[1]}.pdf` : 'unknown.pdf'

      if (!pagesByFile.has(pdfFileName)) {
        pagesByFile.set(pdfFileName, [])
      }
      pagesByFile.get(pdfFileName)!.push(page)
    }

    // Note: In a real implementation, we would need to reload the PDF data
    // For now, we'll emit a log that manual re-upload is needed
    for (const [pdfFileName, pages] of pagesByFile) {
      pdfEvents.emit('pdf:log', {
        pageId: pages[0].id!,
        message: `PDF "${pdfFileName}" needs to be re-uploaded to resume processing`,
        level: 'warning'
      })
    }

  } catch (error) {
    console.error('Error resuming PDF processing:', error)
  }
}

/**
 * Get queue statistics
 */
export function getQueueStats() {
  return {
    size: pdfRenderQueue.size,
    pending: pdfRenderQueue.pending,
    isPaused: pdfRenderQueue.isPaused
  }
}

/**
 * Pause/resume the queue
 */
export function pauseQueue() {
  pdfRenderQueue.pause()
}

export function resumeQueue() {
  pdfRenderQueue.start()
}

/**
 * Clear the queue
 */
export function clearQueue() {
  pdfRenderQueue.clear()
  renderingTasks.clear()
}