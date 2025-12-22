<template>
  <n-layout class="app-container" @drop="handleDrop" @dragover="handleDragOver">
    <!-- Header -->
    <n-layout-header class="app-header" bordered>
      <n-space align="center" size="medium">
        <n-button @click="handleFileAdd">Add File</n-button>
        <n-text strong>{{ currentFileName }}</n-text>
        <n-text type="success">✔ Saved locally</n-text>
      </n-space>
      <n-space align="center" size="medium">
        <n-button type="primary">Export Markdown</n-button>
      </n-space>
    </n-layout-header>

    <!-- Main Content -->
    <n-layout has-sider class="app-main">
      <!-- Page List -->
      <n-layout-sider
        :width="260"
        :collapsed-width="0"
        show-trigger="bar"
        collapse-mode="width"
        bordered
      >
        <div class="page-list-container">
          <PageList
            ref="pageListRef"
            :pages="pagesStore.pages"
            @page-selected="handlePageSelected"
            @page-deleted="handlePageDeleted"
            @batch-deleted="handleBatchDeleted"
          />
        </div>
      </n-layout-sider>

      <!-- Page Viewer (formerly Inspector) -->
      <n-layout-content class="page-viewer-container">
        <PageViewer :current-page="currentPage" />
      </n-layout-content>

      <!-- Preview -->
      <n-layout-sider
        :width="320"
        :collapsed-width="0"
        show-trigger="bar"
        collapse-mode="width"
        bordered
      >
        <div class="preview-container">
          <Preview :current-page="currentPage" />
        </div>
      </n-layout-sider>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { ref, watchEffect, onMounted } from 'vue'
import { usePagesStore } from './stores/pages'
import type { Page } from './stores/pages'
import { uiLogger } from '@/services/logger'
import PageList from './components/page-list/PageList.vue'
import Preview from './components/preview/Preview.vue'
import PageViewer from './components/page-viewer/PageViewer.vue'
import { NLayout, NLayoutHeader, NLayoutSider, NLayoutContent, NSpace, NButton, NText, createDiscreteApi } from 'naive-ui'

const pagesStore = usePagesStore()
const { message } = createDiscreteApi(['message'])

const currentFileName = ref('No file added')
const currentPage = ref<Page | null>(null)
const pageListRef = ref()

// Simple toast notification replacement
let undoTimeoutId: ReturnType<typeof setTimeout> | null = null
let currentUndoCallback: (() => void) | null = null

function handlePageSelected(page: Page) {
  // Get current selection state
  const wasSelected = pagesStore.selectedPageIds.includes(page.id)

  // Clear all other page selections, but keep the clicked page's selection if it was already selected
  if (wasSelected) {
    // If the clicked page was already selected, keep only this page selected
    pagesStore.selectedPageIds = [page.id]
  } else {
    // If the clicked page was not selected, clear all selections
    pagesStore.clearSelection()
  }

  currentPage.value = page
}

// Simple toast notification function
function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', undoCallback?: () => void) {
  uiLogger.info('showToast called:', { message, type, hasUndoCallback: !!undoCallback })

  // Clear any existing toast and timeout first
  const existingToast = document.getElementById('toast-notification')
  if (existingToast) {
    existingToast.remove()
  }

  if (undoTimeoutId) {
    uiLogger.info('Clearing existing timeout:', undoTimeoutId)
    clearTimeout(undoTimeoutId)
    undoTimeoutId = null
  }

  // Clear any existing undo callback
  currentUndoCallback = null

  // Create toast element - position below page list on left side
  const toast = document.createElement('div')
  toast.id = 'toast-notification'
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 10px; /* Position below page list (260px width + margin) */
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    max-width: 400px;
  `

  // Set duration based on type - success messages show for 2 seconds, others for 7 seconds
  const duration = type === 'success' ? 2000 : 7000
  uiLogger.info('Setting timeout duration:', duration, 'for type:', type)

  const messageText = document.createElement('span')
  messageText.textContent = message
  toast.appendChild(messageText)

  // Add undo button if callback provided
  if (undoCallback) {
    currentUndoCallback = undoCallback
    const undoBtn = document.createElement('button')
    undoBtn.textContent = 'Undo'
    undoBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `
    undoBtn.onclick = () => {
      uiLogger.info('Undo button clicked, currentUndoCallback:', !!currentUndoCallback)
      if (currentUndoCallback) {
        uiLogger.info('Calling undo callback...')
        currentUndoCallback()
        uiLogger.info('Undo callback executed, removing toast...')

        // Clear the timeout using the stored ID
        const storedTimeoutId = toast.getAttribute('data-timeout-id')
        if (storedTimeoutId) {
          const timeoutId = parseInt(storedTimeoutId)
          uiLogger.info('Clearing timeout with stored ID:', timeoutId)
          clearTimeout(timeoutId)
        }

        toast.remove()
        currentUndoCallback = null
        undoTimeoutId = null
      }
    }
    toast.appendChild(undoBtn)
  }

  document.body.appendChild(toast)

  // Auto dismiss after calculated duration
  uiLogger.info('Setting timeout for duration:', duration)

  // Store timeout ID in a data attribute on the toast element itself
  const timeoutId = setTimeout(() => {
    uiLogger.info('Timeout executed, removing toast:', message)
    if (toast && toast.parentNode) {
      toast.remove()
    }
    currentUndoCallback = null
    // Clear the global timeout ID if it matches
    if (undoTimeoutId === timeoutId) {
      undoTimeoutId = null
    }
  }, duration)

  // Store timeout ID on the toast element and in the global variable
  toast.setAttribute('data-timeout-id', timeoutId.toString())
  undoTimeoutId = timeoutId
  uiLogger.info('Timeout set with ID:', timeoutId)
}

// Handle page deletion (unified with batch deletion)
async function handlePageDeleted(page: Page) {
  await handleDeletion([page])
}

// Handle batch deletion
async function handleBatchDeleted(pages: Page[]) {
  await handleDeletion(pages)
}

// Unified deletion handler for both single and batch operations
async function handleDeletion(pagesToDelete: Page[]) {
  try {
    const pageIds = pagesToDelete.map(page => page.id)

    // Delete pages from store (this also stores them for undo)
    const deletedResult = pagesStore.deletePages(pageIds)

    if (deletedResult) {
      // Delete from database using batch operation
      await pagesStore.deletePagesFromDB(pageIds)

      // Create appropriate message
      const isSingle = pagesToDelete.length === 1
      const message = isSingle
        ? `Page "${pagesToDelete[0].fileName}" deleted`
        : `${pagesToDelete.length} pages deleted`

      // Show undo message using simple toast
      showToast(message, 'info', handleUndoDelete)

      // Update current page if it was deleted
      if (currentPage.value && pageIds.includes(currentPage.value.id)) {
        currentPage.value = pagesStore.pages[0] || null
      }

      // Clear selection after deletion
      pagesStore.clearSelection()
    }
  } catch (error) {
    uiLogger.error('Delete failed:', error)
    const isSingle = pagesToDelete.length === 1
    showToast(`Failed to delete ${isSingle ? 'page' : 'pages'}`, 'error')
  }
}

// Handle undo delete (unified for both single and batch operations)
async function handleUndoDelete() {
  try {
    const restoredResult = pagesStore.undoDelete()

    if (restoredResult) {
      const isSingle = !Array.isArray(restoredResult)
      const restoredPages = isSingle ? [restoredResult] : restoredResult

      const message = isSingle
        ? `Page "${restoredResult.fileName}" restored`
        : `${restoredPages.length} pages restored`

      showToast(message, 'success')

      // Update current page to the first restored page if no page is selected
      if (!currentPage.value && restoredPages.length > 0) {
        currentPage.value = restoredPages[0]
      }
    }
  } catch (error) {
    uiLogger.error('Undo failed:', error)
    showToast('Failed to restore pages', 'error')
  }
}

// Handle file add
async function handleFileAdd() {
  try {
    const result = await pagesStore.addFiles()

    if (result.success && result.pages.length > 0) {
      // Update current file name to show the first added file
      const firstPage = result.pages[0]
      if (firstPage) {
        currentFileName.value = result.pages.length === 1
          ? firstPage.fileName
          : `${result.pages.length} files added`

        // Select the first added page
        handlePageSelected(firstPage)
      }
    } else if (result.error) {
      uiLogger.error('Add error:', result.error)
      // Handle different error cases
      if (result.error === 'No files selected') {
        // Silent handling for cancelled file selection - no message needed
        return
      } else {
        // Show Naive UI error message for other errors (like unsupported file types)
        message.error(result.error)
      }
    }
  } catch (error) {
    uiLogger.error('Add failed:', error)
    message.error('Add failed. Please try again.')
  }
}

// Handle drag and drop
async function handleDrop(event: DragEvent) {
  event.preventDefault()
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length > 0) {
    const result = await pagesStore.addFiles(files)
    if (result.success && result.pages.length > 0) {
      const firstPage = result.pages[0]
      if (firstPage) {
        currentFileName.value = result.pages.length === 1
          ? firstPage.fileName
          : `${result.pages.length} files added`
        handlePageSelected(firstPage)
      }
    }
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}


// Watch for page list updates and sync current page
watchEffect(() => {
  if (pageListRef.value && pageListRef.value.currentPage && !currentPage.value) {
    currentPage.value = pageListRef.value.currentPage
  }
})

// Load pages from database on mount and resume PDF processing
onMounted(async () => {
  await pagesStore.loadPagesFromDB()
  if (pagesStore.pages.length > 0 && !currentPage.value) {
    const firstPage = pagesStore.pages[0]
    if (firstPage) {
      currentPage.value = firstPage
      currentFileName.value = pagesStore.pages.length === 1
        ? firstPage.fileName
        : `${pagesStore.pages.length} files`
    }
  }

  // Resume any interrupted PDF processing
  try {
    const { pdfService } = await import('./services/pdf')
    await pdfService.resumeProcessing()
  } catch (error) {
    uiLogger.error('Error resuming PDF processing:', error)
  }
})
</script>

<style>
/* ====== Base ====== */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, system-ui, sans-serif;
  background: #f6f7fb;
  color: #111;
}

/* ====== Layout ====== */
.app-container {
  height: 100vh;
}

.app-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.app-main {
  height: calc(100vh - 56px);
}

.page-list-container {
  padding: 8px;
  height: 100%;
}

.preview-container {
  padding: 16px;
  height: 100%;
}

.page-viewer-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>

