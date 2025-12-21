import { defineStore } from 'pinia'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { db } from '@/db/index'
import type { DBPage } from '@/db/index'
import fileAddService from '@/services/add'
import { pdfEvents } from '@/services/pdf/events'

export interface PageProcessingLog {
  id: string
  timestamp: Date
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
  details?: any
}

export interface PageOutput {
  format: 'text' | 'markdown' | 'html'
  content: string
  confidence?: number
}

export interface Page {
  id: string
  fileId?: string // Reference to source file in DB
  pageNumber?: number // Page number in the original file
  fileName: string
  fileSize: number
  fileType: string
  origin: 'upload' | 'pdf_generated'

  // Processing status
  status: 'pending_render' | 'rendering' | 'ready' | 'recognizing' | 'completed' | 'error'
  progress: number
  order: number  // Sort order for drag and drop

  // Image data
  imageData?: string  // base64 image data for persistence (can be used directly as img src)
  thumbnailData?: string  // base64 thumbnail data for persistence (can be used directly as img src)
  width?: number
  height?: number

  // OCR results
  ocrText?: string
  ocrConfidence?: number

  // Outputs
  outputs: PageOutput[]

  // Processing logs
  logs: PageProcessingLog[]

  // Timestamps
  createdAt: Date
  updatedAt: Date
  processedAt?: Date
}

export const usePagesStore = defineStore('pages', () => {
  // State
  const pages = ref<Page[]>([])
  const selectedPageIds = ref<string[]>([])
  const processingQueue = ref<string[]>([])

  // Undo support state - unified for single and batch deletions
  const recentlyDeleted = ref<{
    pages: Page[]
    timestamp: number
    timeoutId?: number
  } | null>(null)

  // PDF processing state
  const pdfProcessing = ref<{
    active: boolean
    total: number
    completed: number
    currentFile?: string
  }>({
    active: false,
    total: 0,
    completed: 0
  })

  // Getters
  const pagesByStatus = computed(() => {
    return (status: Page['status']) => pages.value.filter(page => page.status === status)
  })

  const selectedPages = computed(() =>
    pages.value.filter(page => selectedPageIds.value.includes(page.id))
  )

  const processingPages = computed(() =>
    pages.value.filter(page => page.status === 'processing')
  )

  const completedPages = computed(() =>
    pages.value.filter(page => page.status === 'completed')
  )

  const totalPages = computed(() => pages.value.length)

  const overallProgress = computed(() => {
    if (totalPages.value === 0) return 0
    const totalProgress = pages.value.reduce((sum, page) => sum + page.progress, 0)
    return Math.round(totalProgress / totalPages.value)
  })

  // Actions
  async function addPage(page: Omit<Page, 'id' | 'createdAt' | 'updatedAt' | 'order'> & { order?: number }) {
    const nextOrder = await db.getNextOrder()
    const newPage: Page = {
      ...page,
      id: generateId(),
      order: page.order !== undefined ? page.order : nextOrder,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    pages.value.push(newPage)
    return newPage
  }

  // Database actions
  async function loadPagesFromDB() {
    try {
      const dbPages = await db.getAllPagesForDisplay()
      pages.value = dbPages.map(dbPageToPage)
    } catch (error) {
      console.error('Failed to load pages from database:', error)
    }
  }

  async function savePageToDB(page: Page) {
    try {
      const dbPage = { ...pageToDBPage(page), id: page.id }
      await db.savePage(dbPage)
    } catch (error) {
      console.error('Failed to save page to database:', error)
      // Provide more detailed error information
      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          pageId: page.id,
          fileName: page.fileName
        })
      }
      throw error // Re-throw to allow caller to handle
    }
  }

  async function deletePageFromDB(pageId: string) {
    try {
      await db.deletePage(pageId)
    } catch (error) {
      console.error('Failed to delete page from database:', error)
    }
  }

  // Batch database deletion for performance
  async function deletePagesFromDB(pageIds: string[]) {
    try {
      const deletePromises = pageIds.map(pageId => db.deletePage(pageId))
      await Promise.all(deletePromises)
    } catch (error) {
      console.error('Failed to delete pages from database:', error)
    }
  }

  // Reordering actions
  async function reorderPages(newOrder: { id: string; order: number }[]) {
    try {
      // Update database
      await db.updatePagesOrder(newOrder)

      // Update local store
      for (const { id, order } of newOrder) {
        const page = pages.value.find(p => p.id === id)
        if (page) {
          page.order = order
          page.updatedAt = new Date()
        }
      }

      // Sort pages array by order
      pages.value.sort((a, b) => a.order - b.order)
    } catch (error) {
      console.error('Failed to reorder pages:', error)
    }
  }

  // File add actions
  async function addFiles(files?: File[]) {
    try {
      const filesToProcess = files || await fileAddService.triggerFileSelect(true)

      if (filesToProcess.length === 0) {
        return { success: false, pages: [], error: 'No files selected' }
      }

      const result = await fileAddService.processFiles(filesToProcess)

      if (result.success && result.pages.length > 0) {
        // Add pages to store
        for (const page of result.pages) {
          // Remove order to let addPage assign the correct nextOrder
          const { order: _order, ...pageWithoutOrder } = page
          const newPage = await addPage(pageWithoutOrder)
          // Save to database
          await savePageToDB(newPage)
        }
      }

      return result
    } catch (error) {
      console.error('File add failed:', error)
      return {
        success: false,
        pages: [],
        error: error instanceof Error ? error.message : 'Unknown add error'
      }
    }
  }

  
  // Helper function to clean logs for serialization
  function cleanLogsForSerialization(logs: PageProcessingLog[]): PageProcessingLog[] {
    return logs.map(log => ({
      id: log.id,
      timestamp: new Date(log.timestamp), // Ensure Date objects are serializable
      level: log.level,
      message: log.message,
      details: typeof log.details === 'object' && log.details !== null
        ? JSON.parse(JSON.stringify(log.details)) // Deep clone to remove circular refs
        : log.details
    }))
  }

  // Helper functions to convert between DBPage and Page
  function pageToDBPage(page: Page): Omit<DBPage, 'id'> {
    return {
      fileName: page.fileName,
      fileSize: page.fileSize,
      fileType: page.fileType,
      origin: page.origin,
      status: page.status,
      progress: page.progress,
      order: page.order,
      fileId: page.fileId,
      pageNumber: page.pageNumber,
      imageData: page.imageData,
      thumbnailData: page.thumbnailData,
      width: page.width,
      height: page.height,
      ocrText: page.ocrText,
      ocrConfidence: page.ocrConfidence,
      outputs: [...page.outputs], // Create a copy of outputs array
      logs: cleanLogsForSerialization(page.logs), // Clean logs for serialization
      createdAt: new Date(page.createdAt), // Ensure Date objects are serializable
      updatedAt: new Date(page.updatedAt), // Ensure Date objects are serializable
      processedAt: page.processedAt ? new Date(page.processedAt) : undefined
    }
  }

  function dbPageToPage(dbPage: DBPage): Page {
    return {
      id: dbPage.id!,
      fileName: dbPage.fileName,
      fileSize: dbPage.fileSize,
      fileType: dbPage.fileType,
      origin: dbPage.origin,
      status: dbPage.status,
      progress: dbPage.progress,
      order: dbPage.order,
      fileId: dbPage.fileId,
      pageNumber: dbPage.pageNumber,
      imageData: dbPage.imageData,
      thumbnailData: dbPage.thumbnailData,
      width: dbPage.width,
      height: dbPage.height,
      ocrText: dbPage.ocrText,
      ocrConfidence: dbPage.ocrConfidence,
      outputs: dbPage.outputs,
      logs: dbPage.logs,
      createdAt: dbPage.createdAt,
      updatedAt: dbPage.updatedAt,
      processedAt: dbPage.processedAt
    }
  }

  function updatePage(pageId: string, updates: Partial<Page>) {
    const pageIndex = pages.value.findIndex(page => page.id === pageId)
    if (pageIndex !== -1) {
      const currentPage = pages.value[pageIndex]!
      pages.value[pageIndex] = {
        ...currentPage,
        ...updates,
        id: currentPage.id, // Ensure id is preserved
        fileId: currentPage.fileId,
        pageNumber: currentPage.pageNumber,
        fileName: currentPage.fileName, // Ensure required fields are preserved
        fileSize: currentPage.fileSize,
        fileType: currentPage.fileType,
        status: currentPage.status,
        progress: currentPage.progress,
        updatedAt: new Date()
      }
    }
  }

  function updatePageProgress(pageId: string, progress: number) {
    updatePage(pageId, { progress })
  }

  function updatePageStatus(pageId: string, status: Page['status']) {
    const updates: Partial<Page> = { status }
    if (status === 'ready' || status === 'completed') {
      updates.processedAt = new Date()
      updates.progress = 100
    } else if (status === 'rendering' || status === 'recognizing') {
      updates.progress = 0
    }
    updatePage(pageId, updates)
  }

  function addPageLog(pageId: string, log: Omit<PageProcessingLog, 'id' | 'timestamp'>) {
    const page = pages.value.find(p => p.id === pageId)
    if (page) {
      const newLog: PageProcessingLog = {
        ...log,
        id: generateId(),
        timestamp: new Date()
      }
      page.logs.push(newLog)
      page.updatedAt = new Date()
    }
  }

  function setOcrResult(pageId: string, text: string, confidence?: number) {
    updatePage(pageId, {
      ocrText: text,
      ocrConfidence: confidence
    })
  }

  function addOutput(pageId: string, output: PageOutput) {
    const page = pages.value.find(p => p.id === pageId)
    if (page) {
      page.outputs.push(output)
      page.updatedAt = new Date()
    }
  }

  function selectPage(pageId: string) {
    if (!selectedPageIds.value.includes(pageId)) {
      selectedPageIds.value.push(pageId)
    }
  }

  function deselectPage(pageId: string) {
    const index = selectedPageIds.value.indexOf(pageId)
    if (index !== -1) {
      selectedPageIds.value.splice(index, 1)
    }
  }

  function togglePageSelection(pageId: string) {
    if (selectedPageIds.value.includes(pageId)) {
      deselectPage(pageId)
    } else {
      selectPage(pageId)
    }
  }

  function selectAllPages() {
    selectedPageIds.value = pages.value.map(page => page.id)
  }

  function clearSelection() {
    selectedPageIds.value = []
  }

  // Unified deletion function for both single and batch deletions
  function deletePages(pageIds: string[]) {
    const deletedPages: Page[] = []

    // Find and collect all pages to be deleted
    for (const pageId of pageIds) {
      const index = pages.value.findIndex(page => page.id === pageId)
      if (index !== -1) {
        const deletedPage = pages.value[index]
        if (deletedPage) {
          deletedPages.push(deletedPage)
        }
      }
    }

    if (deletedPages.length === 0) {
      return null
    }

    // Store deleted pages for undo (with 7-second timeout)
    if (recentlyDeleted.value?.timeoutId) {
      clearTimeout(recentlyDeleted.value.timeoutId)
    }

    recentlyDeleted.value = {
      pages: deletedPages,
      timestamp: Date.now(),
      timeoutId: setTimeout(() => {
        clearUndoCache()
      }, 7000) as unknown as number // 7 seconds
    }

    // Remove pages from store (in reverse order to maintain correct indices)
    const sortedIndices = pageIds
      .map(pageId => pages.value.findIndex(page => page.id === pageId))
      .filter(index => index !== -1)
      .sort((a, b) => b - a) // Sort in descending order

    for (const index of sortedIndices) {
      const deletedPage = pages.value[index]
      if (deletedPage) {
        pages.value.splice(index, 1)
        deselectPage(deletedPage.id)
      }
    }

    return deletedPages.length === 1 ? deletedPages[0] : deletedPages
  }

  // Legacy function for backward compatibility - now uses unified deletion logic
  function deletePage(pageId: string) {
    const result = deletePages([pageId])
    return Array.isArray(result) ? result[0] || null : result
  }

  function undoDelete() {
    if (recentlyDeleted.value) {
      const { pages: deletedPages } = recentlyDeleted.value

      // Clear the timeout since we're undoing
      if (recentlyDeleted.value.timeoutId) {
        clearTimeout(recentlyDeleted.value.timeoutId)
      }

      // Restore all pages in correct order
      for (const deletedPage of deletedPages) {
        // Find the correct position based on order
        let insertIndex = pages.value.length
        for (let i = 0; i < pages.value.length; i++) {
          const currentPage = pages.value[i]
          if (currentPage && currentPage.order > deletedPage.order) {
            insertIndex = i
            break
          }
        }

        // Insert the page back into store
        pages.value.splice(insertIndex, 0, deletedPage)
      }

      // Ensure pages are sorted by order to maintain consistency
      pages.value.sort((a, b) => a.order - b.order)

      // Save all restored pages to database
      const savePromises = deletedPages.map(page =>
        savePageToDB(page).catch(error => {
          console.error('Failed to save restored page to database:', error)
        })
      )

      Promise.all(savePromises).catch(error => {
        console.error('Failed to save some restored pages to database:', error)
      })

      // Clear undo cache
      clearUndoCache()

      return deletedPages.length === 1 ? deletedPages[0] : deletedPages
    }
    return null
  }

  function clearUndoCache() {
    if (recentlyDeleted.value?.timeoutId) {
      clearTimeout(recentlyDeleted.value.timeoutId)
    }
    recentlyDeleted.value = null
  }

  function deleteAllPages() {
    pages.value = []
    selectedPageIds.value = []
    processingQueue.value = []
  }

  function addToProcessingQueue(pageId: string) {
    if (!processingQueue.value.includes(pageId)) {
      processingQueue.value.push(pageId)
    }
  }

  function removeFromProcessingQueue(pageId: string) {
    const index = processingQueue.value.indexOf(pageId)
    if (index !== -1) {
      processingQueue.value.splice(index, 1)
    }
  }

  function reset() {
    pages.value = []
    selectedPageIds.value = []
    processingQueue.value = []
  }

  // Setup PDF event listeners
  function setupPDFEventListeners() {
    // Handle page rendering started
    pdfEvents.on('pdf:page:rendering', ({ pageId }) => {
      updatePageStatus(pageId, 'rendering')
      addPageLog(pageId, {
        level: 'info',
        message: 'Page rendering started'
      })
    })

    // Handle page rendering completed
    pdfEvents.on('pdf:page:done', async ({ pageId, imageData, thumbnailData, width, height, fileSize }) => {
      // Check if page exists in store, if not, load it from database
      let page = pages.value.find(p => p.id === pageId)

      if (!page) {
        // Page not found in store, load from database
        try {
          const dbPage = await db.getPage(pageId)
          if (dbPage) {
            page = dbPageToPage(dbPage)
            pages.value.push(page)
            console.log(`[Pages Store] Loaded new page from DB: ${pageId}`)
          }
        } catch (error) {
          console.error(`[Pages Store] Failed to load page ${pageId} from DB:`, error)
        }
      }

      if (page) {
        // Update page with image data, thumbnail and size
        updatePage(pageId, {
          status: 'ready',
          progress: 100,
          imageData,
          thumbnailData,
          width,
          height,
          fileSize
        })

        // Save to database
        await savePageToDB(page)

        addPageLog(pageId, {
          level: 'success',
          message: 'Page rendered successfully'
        })

        console.log(`[Pages Store] Updated page ${pageId} with image data and thumbnail`)
      } else {
        console.error(`[Pages Store] Page ${pageId} not found in store or database`)
      }
    })

    // Handle page rendering error
    pdfEvents.on('pdf:page:error', ({ pageId, error }) => {
      updatePageStatus(pageId, 'error')
      addPageLog(pageId, {
        level: 'error',
        message: `Rendering failed: ${error}`
      })
    })

    // Handle processing progress
    pdfEvents.on('pdf:progress', ({ done, total }) => {
      pdfProcessing.value.completed = done
      pdfProcessing.value.total = total
    })

    // Handle PDF processing start
    pdfEvents.on('pdf:processing-start', ({ file, totalPages }) => {
      pdfProcessing.value.active = true
      pdfProcessing.value.total = totalPages
      pdfProcessing.value.completed = 0
      pdfProcessing.value.currentFile = file.name
    })

    // Handle PDF processing complete
    pdfEvents.on('pdf:processing-complete', () => {
      pdfProcessing.value.active = false
      pdfProcessing.value.currentFile = undefined
    })

    // Handle PDF processing error
    pdfEvents.on('pdf:processing-error', ({ file, error }) => {
      console.error(`PDF processing error for ${file.name}:`, error)
    })

    // Handle PDF logs
    pdfEvents.on('pdf:log', ({ pageId, message, level }) => {
      addPageLog(pageId, {
        level,
        message
      })
    })
  }

  // Setup event listeners when store is created
  setupPDFEventListeners()

  // Helper
  function generateId(): string {
    return `page_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  return {
    // State
    pages,
    selectedPageIds,
    processingQueue,
    pdfProcessing,

    // Getters
    pagesByStatus,
    selectedPages,
    processingPages,
    completedPages,
    totalPages,
    overallProgress,

    // Actions
    addPage,
    updatePage,
    updatePageProgress,
    updatePageStatus,
    addPageLog,
    setOcrResult,
    addOutput,
    selectPage,
    deselectPage,
    togglePageSelection,
    selectAllPages,
    clearSelection,
    deletePage,
    deletePages,
    deleteAllPages,
    undoDelete,
    clearUndoCache,
    addToProcessingQueue,
    removeFromProcessingQueue,
    reset,

    // Database actions
    loadPagesFromDB,
    savePageToDB,
    deletePageFromDB,
    deletePagesFromDB,

    // Reordering actions
    reorderPages,

    // File add actions
    addFiles,

    // PDF specific actions
    setupPDFEventListeners
  }
})