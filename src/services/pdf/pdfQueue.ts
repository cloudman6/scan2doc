import PQueue from 'p-queue'
import { pdfEvents } from './events'
import { db, generatePageId } from '@/db/index'
import type { DBPage } from '@/db/index'
import { enhancedPdfRenderer } from './enhancedPdfRenderer'
import { queueLogger } from '@/services/logger'

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
          queueLogger.warn('[PDF Queue] Received worker response without pageId:', response)
          return
        }

        if (!response.imageBlob) {
          queueLogger.warn('[PDF Queue] Received worker response without imageBlob:', response)
          return
        }

        // Check if we're still tracking this task
        if (!renderingTasks.has(response.pageId)) {
          queueLogger.warn(`[PDF Queue] Received response for unknown task: ${response.pageId}`)
          return
        }

        // Worker now returns Blob directly
        handleRenderSuccess(
          response.pageId,
          response.imageBlob,
          response.width,
          response.height,
          response.pageNumber,
          response.fileSize
        )
      }
    })

    // Handle worker errors
    workerInstance.addEventListener('error', (error) => {
      queueLogger.error('PDF Worker error:', error)
      pdfEvents.emit('pdf:processing-error', {
        file: new File([], 'unknown.pdf'),
        error: `Worker error: ${error.message}`
      })
    })
  }

  return workerInstance
}




/**
 * Generate thumbnail from Blob
 */
async function generateThumbnailFromBlob(
  blob: Blob,
  maxSize: number = 200
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        const { width, height } = calculateThumbnailDimensions(img.width, img.height, maxSize, maxSize)
        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)
        const thumbnailData = canvas.toDataURL('image/jpeg', 0.8)
        URL.revokeObjectURL(url)
        resolve(thumbnailData)
      } catch (error) {
        URL.revokeObjectURL(url)
        reject(error)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image for thumbnail generation'))
    }
    img.src = url
  })
}

/**
 * Handle successful page rendering
 */
async function handleRenderSuccess(
  pageId: string,
  imageBlob: Blob,
  width: number,
  height: number,
  _pageNumber: number,
  fileSize: number
): Promise<void> {
  queueLogger.info(`[PDF Success] Render success for pageId: ${pageId}`)

  try {
    const task = renderingTasks.get(pageId)
    if (!task) {
      queueLogger.error(`[PDF Error] No task found for pageId: ${pageId}`)
      return
    }

    // Get the page from database
    const page = await db.getPage(pageId)
    if (!page) {
      queueLogger.error(`[PDF Error] Page not found in database: ${pageId}`)
      return
    }

    // Generate thumbnail from Blob
    let thumbnailData: string
    try {
      thumbnailData = await generateThumbnailFromBlob(imageBlob, 200)
    } catch (thumbError) {
      queueLogger.warn(`[PDF Warning] Failed to generate thumbnail for ${pageId}:`, thumbError)
      // If thumbnail fails, we don't have a good fallback here without Base64
      // We'll leave it undefined, the UI should handle it
      thumbnailData = ''
    }

    // Save full image Blob directly to separate table
    await db.savePageImage(pageId, imageBlob)

    // Update page metadata
    const updatedPage: DBPage = {
      ...page,
      imageData: undefined,
      thumbnailData,
      width,
      height,
      fileSize,
      status: 'ready',
      progress: 100,
      updatedAt: new Date(),
      processedAt: new Date()
    }

    await db.savePage(updatedPage)

    // Emit success event
    pdfEvents.emit('pdf:page:done', {
      pageId,
      thumbnailData,
      width,
      height,
      fileSize
    })

    renderingTasks.delete(pageId)
    await updateOverallProgress()

  } catch (error) {
    queueLogger.error(`[PDF Error] Error handling render success for ${pageId}:`, error)
    handleRenderError(pageId, error instanceof Error ? error.message : 'Unknown error')
  }
}

/**
 * Handle page rendering error
 */
async function handleRenderError(pageId: string, errorMessage: string): Promise<void> {
  queueLogger.info(`[PDF Error] Render error for pageId: ${pageId}, error: ${errorMessage}`)

  try {
    const task = renderingTasks.get(pageId)
    if (!task) {
      queueLogger.error(`[PDF Error] No task found for pageId: ${pageId}. Available tasks:`, Array.from(renderingTasks.keys()))
      return
    }

    // Get the page from database
    const page = await db.getPage(pageId)
    if (!page) {
      queueLogger.error(`[PDF Error] Page not found in database: ${pageId}`)
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

    queueLogger.info(`[PDF Error] Updated page ${pageId} with error status`)

    // Clean up
    renderingTasks.delete(pageId)
    queueLogger.info(`[PDF Error] Removed task for pageId: ${pageId}. Remaining tasks:`, Array.from(renderingTasks.keys()))

  } catch (error) {
    queueLogger.error(`[PDF Error] Error handling render error for ${pageId}:`, error)
  }
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
 * Update overall PDF processing progress and clean up finished files
 */
async function updateOverallProgress(): Promise<void> {
  try {
    const allPages = await db.getAllPages()
    const pdfPages = allPages.filter(page => page.origin === 'pdf_generated')

    const totalPages = pdfPages.length
    const completedPages = pdfPages.filter(page => page.status === 'ready').length
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
          file: new File([], 'completed.pdf'), // Dummy file object
          totalPages
        })
      }
    }
    
    // Cleanup logic: Delete files from DB if all their pages are processed
    const fileIds = new Set<string>()
    pdfPages.forEach(p => {
       if (p.fileId) fileIds.add(p.fileId)
    })
    
    for (const fileId of fileIds) {
       const pagesForFile = pdfPages.filter(p => p.fileId === fileId)
       const allDone = pagesForFile.every(p => p.status === 'ready' || p.status === 'error')
       
       if (allDone && pagesForFile.length > 0) {
          // Verify if file still exists before trying to delete
          const file = await db.getFile(fileId)
          if (file) {
             queueLogger.info(`[Cleanup] All pages for file ${fileId} are processed. Deleting source file from DB.`)
             await db.deleteFile(fileId)
          }
       }
    }

  } catch (error) {
    queueLogger.error('Error updating overall progress:', error)
  }
}

/**
 * Convert ArrayBuffer to base64 for safe storage
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
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
  queueLogger.info(`[PDF Queue] Queuing page render for pageId: ${task.pageId}, pageNumber: ${task.pageNumber}`)

  // Check if already processed
  const page = await db.getPage(task.pageId)
  if (page && (page.status === 'ready' || page.status === 'rendering')) {
    queueLogger.info(`[PDF Queue] Skipping page ${task.pageId} - status: ${page.status}`)
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
  queueLogger.info(`[PDF Queue] Added task to tracking map. Current tasks:`, Array.from(renderingTasks.keys()))

  // Add to queue
  await pdfRenderQueue.add(async () => {
    queueLogger.info(`[PDF Queue] Starting render for pageId: ${task.pageId}`)
    await renderPDFPage(enhancedTask)
  })
}

/**
 * Render a single PDF page
 */
async function renderPDFPage(task: PDFRenderTask): Promise<void> {
  try {
    queueLogger.info(`[PDF Render] Starting render for pageId: ${task.pageId}, pageNumber: ${task.pageNumber}`)

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
      queueLogger.info(`[PDF Render] Updated page ${task.pageId} status to rendering`)
    }

    // Ensure task is in tracking map
    if (!renderingTasks.has(task.pageId)) {
      queueLogger.warn(`[PDF Render] Task not found in tracking map, adding now: pageId=${task.pageId}`)
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
      queueLogger.warn(`[PDF Render] Cannot copy PDF data, reconstructing from base64 backup:`, sliceError)

      // Fallback: reconstruct from base64 backup
      if (!task.pdfBase64) {
        throw new Error('PDF data is detached and no base64 backup is available')
      }

      try {
        pdfDataCopy = base64ToArrayBuffer(task.pdfBase64)
        queueLogger.info(`[PDF Render] Successfully reconstructed PDF data from base64 (${pdfDataCopy.byteLength} bytes)`)
      } catch (reconstructionError) {
        queueLogger.error(`[PDF Render] Failed to reconstruct PDF data from base64:`, reconstructionError)
        throw new Error('PDF data reconstruction failed')
      }
    }

    // Try enhanced rendering first, fallback to worker if needed
    try {
      queueLogger.info(`[PDF Render] Attempting enhanced rendering for pageId: ${task.pageId}`)

      // Get optimal fallback font for this PDF
      const fallbackFont = await enhancedPdfRenderer.getOptimalFallbackFont(pdfDataCopy)
      queueLogger.info(`[PDF Render] Using fallback font: ${fallbackFont} for pageId: ${task.pageId}`)

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
        result.imageBlob,
        result.width,
        result.height,
        task.pageNumber,
        result.fileSize
      )

      queueLogger.info(`[PDF Render] Enhanced rendering successful for pageId: ${task.pageId}`)

    } catch (enhancedError) {
      queueLogger.warn(`[PDF Render] Enhanced rendering failed for ${task.pageId}, falling back to worker:`, enhancedError)

      // Fallback to worker rendering - create another copy if needed
      let workerPdfData: ArrayBuffer
      try {
        workerPdfData = pdfDataCopy.slice(0)
      } catch (workerSliceError) {
        queueLogger.warn(`[PDF Render] Cannot create worker copy, using original:`, workerSliceError)
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
    queueLogger.error(`[PDF Render] Error queueing PDF page render for ${task.pageId}:`, error)
    await handleRenderError(task.pageId, error instanceof Error ? error.message : 'Unknown render error')
  }
}

/**
 * Queue all pages from a PDF file
 */
export async function queuePDFPages(
  file: File,
  pdfData: ArrayBuffer,
  pageCount: number,
  fileId?: string
): Promise<void> {
  try {
    // Create pages for each PDF page (if not already created)
    const pages: DBPage[] = []
    const startOrder = await db.getNextOrder()

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      // Generate page name: <PDF文件名>_<page number>.png
      const baseName = file.name.replace(/\.pdf$/i, '')
      const pageFileName = `${baseName}_${pageNum}.png`

      pages.push({
        id: generatePageId(),
        fileName: pageFileName,
        fileSize: 0, // Will be updated after rendering
        fileType: 'image/png', // Rendered as PNG
        origin: 'pdf_generated',
        status: 'pending_render',
        progress: 0,
        order: startOrder + pageNum - 1, // Set explicit order
        fileId, // Link to source file
        pageNumber: pageNum, // Store explicit page number
        outputs: [],
        logs: [{
          id: Date.now().toString(),
          timestamp: new Date(),
          level: 'info',
          message: `Page ${pageNum} of ${file.name} ready for rendering`
        }],
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }

    // Save pages to database
    const savedPageIds: string[] = []
    for (const pageData of pages) {
      const pageId = await db.savePage(pageData)
      if (!pageId) {
        throw new Error('Failed to save page to database - no ID returned')
      }
      savedPageIds.push(pageId)
      
      // Emit queued event so store can load the page immediately
      pdfEvents.emit('pdf:page:queued', { pageId })
    }

    // Queue each page for rendering
    for (let i = 0; i < savedPageIds.length; i++) {
      const pageId = savedPageIds[i]
      const pageNumber = i + 1

      // Validate pageId before queuing
      if (!pageId) {
        queueLogger.error(`Invalid pageId at index ${i}:`, pageId)
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
    queueLogger.error('Error queueing PDF pages:', error)
    pdfEvents.emit('pdf:processing-error', {
      file,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Resume processing of interrupted PDF pages
 */
export async function resumePDFProcessing(): Promise<void> {
  try {
    // 1. Find all incomplete PDF pages (pending_render OR rendering)
    const pendingPages = await db.getPagesByStatus('pending_render')
    const renderingPages = await db.getPagesByStatus('rendering')
    
    // Combine and filter for PDF generated pages
    const incompletePages = [...pendingPages, ...renderingPages]
      .filter(page => page.origin === 'pdf_generated')

    if (incompletePages.length === 0) {
      return
    }

    queueLogger.info(`[Resume] Found ${incompletePages.length} incomplete PDF pages to resume`)

    // 2. Group pages by fileId
    const pagesByFileId = new Map<string, DBPage[]>()
    // For legacy pages without fileId, group by filename (will fail but handled gracefully)
    const legacyPages: DBPage[] = []

    for (const page of incompletePages) {
      if (page.fileId) {
        if (!pagesByFileId.has(page.fileId)) {
          pagesByFileId.set(page.fileId, [])
        }
        pagesByFileId.get(page.fileId)!.push(page)
      } else {
        legacyPages.push(page)
      }
    }

    // Handle legacy pages (mark as error or warn)
    if (legacyPages.length > 0) {
      queueLogger.warn(`[Resume] Found ${legacyPages.length} legacy pages without fileId link`)
      // Group by filename just to log meaningful warnings
      const byName = new Map<string, DBPage[]>()
      legacyPages.forEach(p => {
        const name = p.fileName.split('_')[0] + '.pdf' // Crude guess
        if (!byName.has(name)) byName.set(name, [])
        byName.get(name)!.push(p)
      })
      
      for (const [name, pages] of byName) {
        const firstPage = pages[0]
        if (firstPage && firstPage.id) {
          pdfEvents.emit('pdf:log', {
            pageId: firstPage.id,
            message: `Legacy PDF "${name}" pages cannot be auto-resumed. Please re-upload.`,
            level: 'warning'
          })
        }
        // Update status to error to stop "stuck" state
        for (const page of pages) {
          await db.savePage({ ...page, status: 'error' })
        }
      }
    }

    // 3. Process each file group
    for (const [fileId, pages] of pagesByFileId) {
      try {
        // Load file from DB
        const dbFile = await db.getFile(fileId)
        
        if (!dbFile) {
          queueLogger.error(`[Resume] Source file not found for fileId: ${fileId}`)
          // Mark all pages as error
          for (const page of pages) {
             pdfEvents.emit('pdf:log', {
                pageId: page.id!,
                message: `Source PDF file missing. Cannot resume processing.`,
                level: 'error'
             })
             await db.savePage({ ...page, status: 'error' })
          }
          continue
        }

        queueLogger.info(`[Resume] Loaded source file "${dbFile.name}" (${dbFile.size} bytes)`)
        
        // Convert Blob to ArrayBuffer
        const pdfData = await dbFile.content.arrayBuffer()
        
        // Re-queue pages
        for (const page of pages) {
          // Determine page number
          let pageNumber = page.pageNumber
          if (!pageNumber) {
             // Fallback: extract from filename (e.g. "foo_1.png")
             const match = page.fileName.match(/_(\d+)\.png$/)
             if (match && match[1]) pageNumber = parseInt(match[1])
          }
          
          if (!pageNumber) {
            queueLogger.error(`[Resume] Could not determine page number for page ${page.id}`)
             await db.savePage({ ...page, status: 'error' })
            continue
          }

          // Reset status to pending if it was rendering
          if (page.status === 'rendering') {
             await db.savePage({ ...page, status: 'pending_render', progress: 0 })
          }

          // Queue render task
          await queuePDFPageRender({
            pageId: page.id!,
            pdfData, // Pass the ArrayBuffer (queuePDFPageRender handles copying)
            pageNumber,
            fileName: dbFile.name
          })
        }
        
        queueLogger.info(`[Resume] Successfully re-queued ${pages.length} pages for "${dbFile.name}"`)

      } catch (error) {
        queueLogger.error(`[Resume] Failed to resume file ${fileId}:`, error)
      }
    }

  } catch (error) {
    queueLogger.error('Error resuming PDF processing:', error)
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