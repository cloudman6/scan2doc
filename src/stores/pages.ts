import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, generatePageId } from '@/db/index'
import type { DBPage } from '@/db/index'
import fileAddService from '@/services/add'
import { pdfEvents } from '@/services/pdf/events'
import { storeLogger } from '@/utils/logger'

export interface PageProcessingLog {
  id: string
  timestamp: Date
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
  details?: unknown
}

export interface PageOutput {
  format: 'text' | 'markdown' | 'html'
  content: string
  confidence?: number
}

export type PageStatus = 'pending_render' | 'rendering' | 'recognizing' | 'ready' | 'completed' | 'error'

export interface Page {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  origin: 'upload' | 'scanner' | 'pdf_generated'
  status: PageStatus
  progress: number
  ocrText?: string
  ocrConfidence?: number
  thumbnailData?: string
  width?: number
  height?: number
  outputs: PageOutput[]
  logs: PageProcessingLog[]
  createdAt: Date
  updatedAt: Date
  processedAt?: Date
  order: number
}


export const usePagesStore = defineStore('pages', () => {
  // State
  const pages = ref<Page[]>([])
  const selectedPageIds = ref<string[]>([])
  const processingQueue = ref<string[]>([])
  const pdfProcessing = ref({
    active: false,
    total: 0,
    completed: 0,
    currentFile: undefined as string | undefined
  })

  // Getters
  const pagesByStatus = computed(() => (status: PageStatus) =>
    pages.value.filter(page => page.status === status)
  )

  const selectedPages = computed(() =>
    pages.value.filter(page => selectedPageIds.value.includes(page.id))
  )

  const processingPages = computed(() => {
    return pages.value.filter(page =>
      page.status === 'pending_render' ||
      page.status === 'rendering' ||
      page.status === 'recognizing'
    )
  })

  const completedPages = computed(() =>
    pages.value.filter(page => page.status === 'completed' || page.status === 'ready')
  )

  const totalPages = computed(() => pages.value.length)

  const overallProgress = computed(() => {
    if (pages.value.length === 0) return 0
    const totalProgress = pages.value.reduce((sum, page) => sum + page.progress, 0)
    return Math.round(totalProgress / pages.value.length)
  })

  // Actions
  async function addPage(page: Omit<Page, 'id' | 'createdAt' | 'updatedAt' | 'order'> & { id?: string; order?: number }) {
    const id = page.id || generatePageId()
    const order = page.order || (await db.getNextOrder())

    // Create the page object
    const newPage: Page = {
      ...page,
      id,
      order,
      createdAt: new Date(),
      updatedAt: new Date(),
      outputs: page.outputs || [],
      logs: page.logs || []
    }

    pages.value.push(newPage)
    // Sort pages by order
    pages.value.sort((a, b) => a.order - b.order)

    return newPage
  }

  function updatePage(id: string, updates: Partial<Page>) {
    const index = pages.value.findIndex(p => p.id === id)
    if (index !== -1) {
      pages.value[index] = {
        ...pages.value[index]!,
        ...updates,
        updatedAt: new Date()
      }

      // If status is becoming ready/completed, ensure progress is 100 and set processedAt
      if (updates.status === 'ready' || updates.status === 'completed') {
        const p = pages.value[index]!
        p.progress = 100
        p.processedAt = new Date()
      }
    }
  }

  function updatePageProgress(id: string, progress: number) {
    updatePage(id, { progress })
  }

  function updatePageStatus(id: string, status: PageStatus) {
    updatePage(id, { status })
  }

  function addPageLog(id: string, log: Omit<PageProcessingLog, 'id' | 'timestamp'>) {
    const index = pages.value.findIndex(p => p.id === id)
    if (index !== -1) {
      pages.value[index]!.logs.push({
        ...log,
        id: `page_log_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
        timestamp: new Date()
      })
      pages.value[index]!.updatedAt = new Date()
    }
  }

  function setOcrResult(id: string, text: string, confidence?: number) {
    updatePage(id, { ocrText: text, ocrConfidence: confidence })
  }

  function addOutput(id: string, output: PageOutput) {
    const index = pages.value.findIndex(p => p.id === id)
    if (index !== -1) {
      pages.value[index]!.outputs.push(output)
      pages.value[index]!.updatedAt = new Date()
    }
  }

  function selectPage(id: string) {
    if (!selectedPageIds.value.includes(id)) {
      selectedPageIds.value.push(id)
    }
  }

  function deselectPage(id: string) {
    selectedPageIds.value = selectedPageIds.value.filter(oldId => oldId !== id)
  }

  function togglePageSelection(id: string) {
    if (selectedPageIds.value.includes(id)) {
      deselectPage(id)
    } else {
      selectPage(id)
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

    // Remove pages from store (in reverse order to maintain correct indices)
    const sortedIndices = pageIds
      .map(pageId => pages.value.findIndex(page => page.id === pageId))
      .filter(index => index !== -1)
      .sort((a, b) => b - a)

    for (const index of sortedIndices) {
      const deletedPage = pages.value[index]
      if (deletedPage) {
        pages.value.splice(index, 1)
        deselectPage(deletedPage.id)
      }
    }

    return deletedPages.length === 1 ? deletedPages[0] : deletedPages
  }

  function deletePage(pageId: string) {
    const result = deletePages([pageId])
    return Array.isArray(result) ? result[0] || null : result
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
    deleteAllPages()
  }

  // Database actions
  async function loadPagesFromDB() {
    try {
      const dbPages = await db.getAllPagesForDisplay()
      pages.value = dbPages.map(dbPage => dbPageToPage(dbPage))
    } catch (error) {
      storeLogger.error('[Pages Store] Failed to load pages from DB:', error)
    }
  }

  async function savePageToDB(page: Page) {
    try {
      const dbPage = { ...pageToDBPage(page), id: page.id }
      await db.savePage(dbPage)
    } catch (error) {
      storeLogger.error('[Pages Store] Failed to save page to DB:', error)
      throw error
    }
  }

  function deletePageFromDB(id: string) {
    return db.deletePage(id)
  }

  async function deletePagesFromDB(ids: string[]) {
    await Promise.all(ids.map(id => db.deletePage(id)))
  }

  async function reorderPages(updates: { id: string; order: number }[]) {
    try {
      await db.updatePagesOrder(updates)
      for (const update of updates) {
        const page = pages.value.find(p => p.id === update.id)
        if (page) {
          page.order = update.order
        }
      }
      pages.value.sort((a, b) => a.order - b.order)
    } catch (error) {
      storeLogger.error('[Pages Store] Failed to reorder pages in DB:', error)
    }
  }

  async function addFiles(inputFiles?: File[]) {
    try {
      let files: File[] | undefined | null = inputFiles

      if (!files) {
        files = await fileAddService.triggerFileSelect()
      }

      if (!files || files.length === 0) return { success: false, error: 'No files selected', pages: [] }

      const result = await fileAddService.processFiles(files)
      if (result.success && result.pages) {
        for (const pageData of result.pages) {
          const page = await addPage(pageData)
          await savePageToDB(page)
        }
      }
      return result
    } catch (error) {
      storeLogger.error('[Pages Store] Error adding files:', error)
      return { success: false, error: 'Failed to add files', pages: [] }
    }
  }

  function pageToDBPage(page: Page): Omit<DBPage, 'id'> {
    return {
      fileName: page.fileName,
      fileSize: page.fileSize,
      fileType: page.fileType,
      origin: page.origin,
      status: page.status,
      progress: page.progress,
      ocrText: page.ocrText,
      ocrConfidence: page.ocrConfidence,
      thumbnailData: page.thumbnailData,
      width: page.width,
      height: page.height,
      outputs: JSON.parse(JSON.stringify(page.outputs)),
      logs: JSON.parse(JSON.stringify(page.logs)),
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      processedAt: page.processedAt,
      order: page.order
    }
  }

  function dbPageToPage(dbPage: DBPage): Page {
    return {
      ...dbPage,
      id: dbPage.id!,
      createdAt: dbPage.createdAt || new Date(),
      updatedAt: dbPage.updatedAt || new Date(),
      outputs: dbPage.outputs || [],
      logs: dbPage.logs || []
    }
  }

  function setupPDFEventListeners() {
    pdfEvents.on('pdf:page:queued', async ({ pageId }) => {
      if (pages.value.some(p => p.id === pageId)) return

      try {
        const dbPage = await db.getPage(pageId)
        if (dbPage) {
          const page = dbPageToPage(dbPage)
          pages.value.push(page)
          pages.value.sort((a, b) => a.order - b.order)
          storeLogger.info(`[Pages Store] Loaded queued page from DB: ${pageId}`)
        }
      } catch (error) {
        storeLogger.error(`[Pages Store] Failed to load queued page ${pageId} from DB:`, error)
      }
    })

    pdfEvents.on('pdf:page:rendering', ({ pageId }) => {
      updatePageStatus(pageId, 'rendering')
      addPageLog(pageId, {
        level: 'info',
        message: 'Page rendering started'
      })
    })

    pdfEvents.on('pdf:page:done', async ({ pageId, thumbnailData, width, height, fileSize }) => {
      let page = pages.value.find(p => p.id === pageId)

      if (!page) {
        try {
          const dbPage = await db.getPage(pageId)
          if (dbPage) {
            page = dbPageToPage(dbPage)
            pages.value.push(page)
            pages.value.sort((a, b) => a.order - b.order)
          }
        } catch (error) {
          storeLogger.error(`[Pages Store] Failed to load page ${pageId} from DB:`, error)
        }
      }

      if (page) {
        updatePage(pageId, {
          status: 'ready',
          progress: 100,
          thumbnailData,
          width,
          height,
          fileSize
        })

        addPageLog(pageId, {
          level: 'success',
          message: 'Page rendered successfully'
        })
      } else {
        storeLogger.error(`[Pages Store] Page ${pageId} not found in store or database`)
      }
    })

    pdfEvents.on('pdf:page:error', ({ pageId, error }) => {
      updatePageStatus(pageId, 'error')
      addPageLog(pageId, {
        level: 'error',
        message: `Rendering failed: ${error}`
      })
    })

    pdfEvents.on('pdf:progress', ({ done, total }) => {
      pdfProcessing.value.completed = done
      pdfProcessing.value.total = total
    })

    pdfEvents.on('pdf:processing-start', ({ file, totalPages }) => {
      pdfProcessing.value.active = true
      pdfProcessing.value.total = totalPages
      pdfProcessing.value.completed = 0
      pdfProcessing.value.currentFile = file.name
    })

    pdfEvents.on('pdf:processing-complete', () => {
      pdfProcessing.value.active = false
      pdfProcessing.value.currentFile = undefined
    })

    pdfEvents.on('pdf:log', ({ pageId, message, level }) => {
      addPageLog(pageId, { level: level || 'info', message })
    })

    pdfEvents.on('pdf:processing-error', ({ file, error }) => {
      storeLogger.error(`[Pages Store] Global PDF processing error for ${file?.name}:`, error)
    })
  }

  setupPDFEventListeners()

  return {
    pages,
    selectedPageIds,
    processingQueue,
    pdfProcessing,
    pagesByStatus,
    selectedPages,
    processingPages,
    completedPages,
    totalPages,
    overallProgress,
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
    addToProcessingQueue,
    removeFromProcessingQueue,
    reset,
    loadPagesFromDB,
    savePageToDB,
    deletePageFromDB,
    deletePagesFromDB,
    reorderPages,
    addFiles,
    setupPDFEventListeners
  }
})