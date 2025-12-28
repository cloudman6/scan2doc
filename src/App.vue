<template>
  <n-layout
    class="app-container"
    @drop="handleDrop"
    @dragover="handleDragOver"
  >
    <!-- Header -->
    <AppHeader 
      :page-count="pagesStore.pages.length"
      @add-files="handleFileAdd"
    />

    <!-- Main Content -->
    <n-layout
      has-sider
      class="app-main"
    >
      <div
        v-if="pagesStore.pages.length === 0"
        style="width: 100%; height: 100%"
      >
        <EmptyState @add-files="handleFileAdd" />
      </div>
      
      <template v-else>
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
              :pages="pagesStore.pages"
              :selected-id="selectedPageId"
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
      </template>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { usePagesStore } from './stores/pages'
import type { Page } from './stores/pages'
import { uiLogger } from '@/utils/logger'
import PageList from './components/page-list/PageList.vue'
import Preview from './components/preview/Preview.vue'
import PageViewer from './components/page-viewer/PageViewer.vue'
import AppHeader from './components/common/AppHeader.vue'
import EmptyState from './components/common/EmptyState.vue'
import { NLayout, NLayoutSider, NLayoutContent, createDiscreteApi } from 'naive-ui'

const pagesStore = usePagesStore()
const { message, dialog } = createDiscreteApi(['message', 'dialog'], {
  configProviderProps: {},
  messageProviderProps: {
    placement: 'bottom-left'
  }
})




const selectedPageId = ref<string | null>(null)
const currentPage = computed(() => 
  pagesStore.pages.find(p => p.id === selectedPageId.value) || null
)

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

  selectedPageId.value = page.id
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
  const isSingle = pagesToDelete.length === 1
  const content = isSingle 
    ? `Are you sure you want to delete "${pagesToDelete[0]!.fileName}"?`
    : `Are you sure you want to delete ${pagesToDelete.length} selected pages?`

  dialog.warning({
    title: 'Confirm Deletion',
    content,
    positiveText: 'Confirm',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        const pageIds = pagesToDelete.map(page => page.id)

        // Delete pages from store
        const deletedResult = pagesStore.deletePages(pageIds)

        if (deletedResult) {
          // Delete from database using batch operation
          await pagesStore.deletePagesFromDB(pageIds)

          // Create appropriate message
          const successMsg = isSingle
            ? `Page "${pagesToDelete[0]!.fileName}" deleted`
            : `${pagesToDelete.length} pages deleted`

          // Show success message using Naive UI message
          message.success(successMsg)

          // Update current page if it was deleted
          if (currentPage.value && pageIds.includes(currentPage.value.id)) {
            selectedPageId.value = pagesStore.pages[0]?.id || null
          }

          // Clear selection after deletion
          pagesStore.clearSelection()
        }
      } catch (error) {
        uiLogger.error('Delete failed:', error)
        message.error(`Failed to delete ${isSingle ? 'page' : 'pages'}`)
      }
    }
  })
}


// Handle file add
async function handleFileAdd() {
  console.log('[App] handleFileAdd clicked');
  try {
    const result = await pagesStore.addFiles()
    console.log('[App] addFiles result:', result);

    if (result.success && result.pages.length > 0) {
      // Update current file name to show the first added file
      const firstPage = result.pages[0]
      if (firstPage) {
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
        handlePageSelected(firstPage)
      }
    }
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}


// Watch for changes in existing pages to keep selection valid
// If the selected page is removed or ID changes (unlikely), reset selection
watch(() => pagesStore.pages, (newPages) => {
  if (selectedPageId.value && !newPages.find(p => p.id === selectedPageId.value)) {
    // If selected page is gone, select the first available page or null
    selectedPageId.value = newPages[0]?.id || null
  } else if (!selectedPageId.value && newPages.length > 0) {
    // If no page selected but pages exist (e.g. init load), select first
    selectedPageId.value = newPages[0]!.id
  }
}, { deep: true })

// Load pages from database on mount and resume PDF processing
onMounted(async () => {
  await pagesStore.loadPagesFromDB()
  if (pagesStore.pages.length > 0 && !selectedPageId.value) {
    const firstPage = pagesStore.pages[0]
    if (firstPage) {
      selectedPageId.value = firstPage.id
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
  padding: 0;
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

