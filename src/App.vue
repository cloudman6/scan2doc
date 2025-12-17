<template>
  <div
    class="app-container"
    @drop="handleDrop"
    @dragover="handleDragOver"
  >
    <!-- Header -->
    <header class="app-header">
      <button class="add-btn" @click="handleFileAdd">Add File</button>
      <strong class="filename">{{ currentFileName }}</strong>
      <span class="save-status" style="color:#16a34a;">✔ Saved locally</span>
      <div class="spacer"></div>
      <button class="export-btn primary">Export Markdown</button>
    </header>

    <!-- Main Content -->
    <main class="app-main">
      <!-- Page List -->
      <aside class="page-list-container">
        <PageList ref="pageListRef" :pages="pagesStore.pages" @page-selected="handlePageSelected" @page-deleted="handlePageDeleted" />
      </aside>

      <!-- Page Viewer (formerly Inspector) -->
      <section class="page-viewer-container">
        <PageViewer :current-page="currentPage" />
      </section>

      <!-- Preview -->
      <aside class="preview-container">
        <Preview :current-page="currentPage" />
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect, onMounted } from 'vue'
import { usePagesStore } from './stores/pages'
import type { Page } from './stores/pages'
import PageList from './components/page-list/PageList.vue'
import Preview from './components/preview/Preview.vue'
import PageViewer from './components/page-viewer/PageViewer.vue'

const pagesStore = usePagesStore()

const currentFileName = ref('No file added')
const currentPage = ref<Page | null>(null)
const pageListRef = ref()

// Simple toast notification replacement
let undoTimeoutId: ReturnType<typeof setTimeout> | null = null
let currentUndoCallback: (() => void) | null = null

function handlePageSelected(page: Page) {
  currentPage.value = page
}

// Simple toast notification function
function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', undoCallback?: () => void) {
  console.log('showToast called:', { message, type, hasUndoCallback: !!undoCallback })

  // Clear any existing toast and timeout first
  const existingToast = document.getElementById('toast-notification')
  if (existingToast) {
    existingToast.remove()
  }

  if (undoTimeoutId) {
    console.log('Clearing existing timeout:', undoTimeoutId)
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
  console.log('Setting timeout duration:', duration, 'for type:', type)

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
      console.log('Undo button clicked, currentUndoCallback:', !!currentUndoCallback)
      if (currentUndoCallback) {
        console.log('Calling undo callback...')
        currentUndoCallback()
        console.log('Undo callback executed, removing toast...')

        // Clear the timeout using the stored ID
        const storedTimeoutId = toast.getAttribute('data-timeout-id')
        if (storedTimeoutId) {
          const timeoutId = parseInt(storedTimeoutId)
          console.log('Clearing timeout with stored ID:', timeoutId)
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
  console.log('Setting timeout for duration:', duration)

  // Store timeout ID in a data attribute on the toast element itself
  const timeoutId = setTimeout(() => {
    console.log('Timeout executed, removing toast:', message)
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
  console.log('Timeout set with ID:', timeoutId)
}

// Handle page deletion
async function handlePageDeleted(page: Page) {
  try {
    // Delete page from store (this also stores it for undo)
    const deletedPage = pagesStore.deletePage(page.id)

    if (deletedPage) {
      // Delete from database
      await pagesStore.deletePageFromDB(page.id)

      // Show undo message using simple toast
      showToast(
        `Page "${page.fileName}" deleted`,
        'info',
        handleUndoDelete
      )

      // Update current page if the deleted page was selected
      if (currentPage.value?.id === page.id) {
        currentPage.value = pagesStore.pages[0] || null
      }
    }
  } catch (error) {
    console.error('Delete failed:', error)
    showToast('Failed to delete page', 'error')
  }
}

// Handle undo delete
async function handleUndoDelete() {
  try {
    const restoredPage = pagesStore.undoDelete()

    if (restoredPage) {
      showToast(`Page "${restoredPage.fileName}" restored`, 'success')

      // Update current page to the restored page if no page is selected
      if (!currentPage.value) {
        currentPage.value = restoredPage
      }
    }
  } catch (error) {
    console.error('Undo failed:', error)
    showToast('Failed to restore page', 'error')
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
      console.error('Add error:', result.error)
      // You could show a toast notification here
      alert(`Add failed: ${result.error}`)
    }
  } catch (error) {
    console.error('Add failed:', error)
    alert('Add failed. Please try again.')
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

// Load pages from database on mount
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
  display: flex;
  flex-direction: column;
}

.app-header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  gap: 12px;
}

.app-header .spacer {
  flex: 1;
}

.app-main {
  display: grid;
  grid-template-columns: 260px 1fr 320px;
  height: calc(100vh - 56px);
}

.page-list-container {
  padding: 8px;
  overflow-y: auto;
  border-right: 1px solid #e5e7eb;
  background: white;
}

.page-viewer-container {
  display: flex;
  flex-direction: column;
  background: white;
  border-right: 1px solid #e5e7eb;
}

.preview-container {
  padding: 16px;
  border-left: 1px solid #e5e7eb;
  background: #fafafa;
}

/* ====== Buttons ====== */
button {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
}

button.primary {
  background: #6366f1;
  color: white;
  border: none;
}

.add-btn, .export-btn {
  font-size: 14px;
}

.filename {
  font-size: 14px;
}

.save-status {
  font-size: 14px;
}
</style>

