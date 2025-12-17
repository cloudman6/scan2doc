import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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
  projectId: string
  pageNumber: number
  originalFileName: string

  // Processing status
  status: 'idle' | 'processing' | 'completed' | 'error'
  progress: number

  // Image data
  imageUrl?: string
  thumbnailUrl?: string
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
  const pagesByProjectId = computed(() => {
    return (projectId: string) => pages.value.filter(page => page.projectId === projectId)
  })

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
  function addPage(page: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>) {
    const newPage: Page = {
      ...page,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    }
    pages.value.push(newPage)
    return newPage
  }

  function updatePage(pageId: string, updates: Partial<Page>) {
    const pageIndex = pages.value.findIndex(page => page.id === pageId)
    if (pageIndex !== -1) {
      pages.value[pageIndex] = {
        ...pages.value[pageIndex],
        ...updates,
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

  function selectAllPages(projectId?: string) {
    const pagesToSelect = projectId
      ? pagesByProjectId.value(projectId)
      : pages.value
    selectedPageIds.value = pagesToSelect.map(page => page.id)
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

  function deletePagesByProjectId(projectId: string) {
    pages.value = pages.value.filter(page => page.projectId !== projectId)
    selectedPageIds.value = selectedPageIds.value.filter(id =>
      !pages.value.find(page => page.id === id && page.projectId === projectId)
    )
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
    return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  return {
    // State
    pages,
    selectedPageIds,
    processingQueue,

    // Getters
    pagesByProjectId,
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
    deletePagesByProjectId,
    addToProcessingQueue,
    removeFromProcessingQueue,
    reset
  }
})