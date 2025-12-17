import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/db/index'
import type { DBPage } from '@/db/index'
import fileAddService from '@/services/add'

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
  fileName: string
  fileSize: number
  fileType: string

  // Processing status
  status: 'idle' | 'processing' | 'completed' | 'error'
  progress: number
  order: number  // Sort order for drag and drop

  // Image data
  imageUrl?: string  // Generated from imageData when needed
  thumbnailUrl?: string  // Generated from thumbnailData when needed
  imageData?: string  // base64 image data for persistence
  thumbnailData?: string  // base64 thumbnail data for persistence
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
  async function addPage(page: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>) {
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
    }
  }

  async function deletePageFromDB(pageId: string) {
    try {
      await db.deletePage(pageId)
    } catch (error) {
      console.error('Failed to delete page from database:', error)
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
          addPage(page)
          // Save to database
          await savePageToDB(page)
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

  // Helper function to convert base64 to blob URL
  function base64ToBlobUrl(base64: string, mimeType: string): string {
    // Remove data URL prefix if present
    const base64Data = base64.includes(',') ? (base64.split(',')[1] || '') : base64
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: mimeType })
    return URL.createObjectURL(blob)
  }

  // Helper functions to convert between DBPage and Page
  function pageToDBPage(page: Page): Omit<DBPage, 'id'> {
    return {
      fileName: page.fileName,
      fileSize: page.fileSize,
      fileType: page.fileType,
      status: page.status,
      progress: page.progress,
      order: page.order,
      imageData: page.imageData,
      thumbnailData: page.thumbnailData,
      width: page.width,
      height: page.height,
      ocrText: page.ocrText,
      ocrConfidence: page.ocrConfidence,
      outputs: page.outputs,
      logs: page.logs,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      processedAt: page.processedAt
    }
  }

  function dbPageToPage(dbPage: DBPage): Page {
    // Generate blob URLs from base64 data for display
    const imageUrl = dbPage.imageData ? base64ToBlobUrl(dbPage.imageData, dbPage.fileType) : undefined
    const thumbnailUrl = dbPage.thumbnailData ? base64ToBlobUrl(dbPage.thumbnailData, 'image/jpeg') : undefined

    return {
      id: dbPage.id!,
      fileName: dbPage.fileName,
      fileSize: dbPage.fileSize,
      fileType: dbPage.fileType,
      status: dbPage.status,
      progress: dbPage.progress,
      order: dbPage.order,
      imageUrl,
      thumbnailUrl,
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
    if (status === 'completed') {
      updates.processedAt = new Date()
      updates.progress = 100
    } else if (status === 'processing') {
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

  function deletePage(pageId: string) {
    const index = pages.value.findIndex(page => page.id === pageId)
    if (index !== -1) {
      pages.value.splice(index, 1)
      deselectPage(pageId)
    }
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

  // Helper
  function generateId(): string {
    return `page_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  return {
    // State
    pages,
    selectedPageIds,
    processingQueue,

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
    deleteAllPages,
    addToProcessingQueue,
    removeFromProcessingQueue,
    reset,

    // Database actions
    loadPagesFromDB,
    savePageToDB,
    deletePageFromDB,

    // Reordering actions
    reorderPages,

    // File add actions
    addFiles
  }
})