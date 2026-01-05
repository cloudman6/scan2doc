<template>
  <n-message-provider>
    <n-notification-provider placement="bottom-left">
      <n-dialog-provider>
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
              <!-- Page List with custom collapse trigger -->
              <n-layout-sider
                v-model:collapsed="pageListCollapsed"
                :width="260"
                :collapsed-width="0"
                collapse-mode="width"
                bordered
                :show-trigger="false"
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
            
              <!-- Custom Page List Collapse Trigger (BTN-PL) - positioned outside sider -->
              <div class="sider-trigger-container">
                <n-tooltip :placement="pageListCollapsed ? 'right' : 'left'">
                  <template #trigger>
                    <n-button
                      size="small"
                      circle
                      quaternary
                      class="sider-trigger-btn"
                      @click="pageListCollapsed = !pageListCollapsed"
                    >
                      <template #icon>
                        <n-icon>
                          <ChevronBackOutline v-if="!pageListCollapsed" />
                          <ChevronForwardOutline v-else />
                        </n-icon>
                      </template>
                    </n-button>
                  </template>
                  {{ pageListCollapsed ? 'Expand Page List' : 'Collapse Page List' }}
                </n-tooltip>
              </div>
  
              <!-- Middle: Content area with PageViewer, Divider, and Preview -->
              <div class="content-area">
                <!-- PageViewer -->
                <div
                  v-if="!pageViewerCollapsed"
                  class="panel page-viewer-panel"
                  :style="{ width: pageViewerWidth }"
                >
                  <div class="page-viewer-container">
                    <PageViewer
                      :current-page="currentPage"
                    />
                  </div>
                </div>

                <!-- Panel Divider (only show when both panels are visible or PageViewer collapsed) -->
                <div
                  v-if="!previewCollapsed"
                  class="panel-divider"
                >
                  <!-- PageViewer collapse: show when both expanded -->
                  <n-tooltip
                    v-if="!pageViewerCollapsed"
                    placement="right"
                  >
                    <template #trigger>
                      <n-button
                        size="small"
                        circle
                        quaternary
                        @click="pageViewerCollapsed = true"
                      >
                        <template #icon>
                          <n-icon><ChevronBackOutline /></n-icon>
                        </template>
                      </n-button>
                    </template>
                    Collapse Viewer
                  </n-tooltip>

                  <!-- PageViewer expand: show when PV collapsed -->
                  <n-tooltip
                    v-if="pageViewerCollapsed"
                    placement="right"
                  >
                    <template #trigger>
                      <n-button
                        size="small"
                        circle
                        quaternary
                        @click="pageViewerCollapsed = false"
                      >
                        <template #icon>
                          <n-icon><ChevronForwardOutline /></n-icon>
                        </template>
                      </n-button>
                    </template>
                    Expand Viewer
                  </n-tooltip>

                  <!-- Preview collapse: show when both expanded -->
                  <n-tooltip
                    v-if="!pageViewerCollapsed"
                    placement="left"
                  >
                    <template #trigger>
                      <n-button
                        size="small"
                        circle
                        quaternary
                        @click="previewCollapsed = true"
                      >
                        <template #icon>
                          <n-icon><ChevronForwardOutline /></n-icon>
                        </template>
                      </n-button>
                    </template>
                    Collapse Preview
                  </n-tooltip>
                </div>

                <!-- Preview -->
                <div
                  v-if="!previewCollapsed"
                  class="panel preview-panel"
                  :style="{ width: previewWidth }"
                >
                  <div class="preview-container">
                    <Preview
                      :current-page="currentPage"
                    />
                  </div>
                </div>

                <!-- Preview expand trigger (now part of flex layout, not absolute) -->
                <div
                  v-if="previewCollapsed"
                  class="right-edge-trigger"
                >
                  <n-tooltip placement="left">
                    <template #trigger>
                      <n-button
                        size="small"
                        circle
                        quaternary
                        @click="previewCollapsed = false"
                      >
                        <template #icon>
                          <n-icon><ChevronBackOutline /></n-icon>
                        </template>
                      </n-button>
                    </template>
                    Expand Preview
                  </n-tooltip>
                </div>
              </div>
            </template>
          </n-layout>
        </n-layout>
      </n-dialog-provider>
    </n-notification-provider>
  </n-message-provider>
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
import { NLayout, NLayoutSider, NButton, NIcon, NTooltip, createDiscreteApi, NMessageProvider, NDialogProvider, NNotificationProvider } from 'naive-ui'
import { ChevronForwardOutline, ChevronBackOutline } from '@vicons/ionicons5'
// Import documentService to ensure it's initialized and listening to OCR events
import { documentService } from '@/services/doc-gen'

const pagesStore = usePagesStore()
const { message, dialog } = createDiscreteApi(['message', 'dialog'], {
  configProviderProps: {},
  messageProviderProps: {
    placement: 'bottom-left'
  }
})

// Collapse state management
const pageListCollapsed = ref(false)
const pageViewerCollapsed = ref(false)
const previewCollapsed = ref(false)

// Computed widths for proper space distribution
const pageViewerWidth = computed(() => {
  if (pageViewerCollapsed.value) return '0'
  if (previewCollapsed.value) return 'calc(100% - 32px)' // Reserve space for right-edge-trigger
  return '50%'
})

const previewWidth = computed(() => {
  if (previewCollapsed.value) return '0'
  if (pageViewerCollapsed.value) return '100%'
  return '50%'
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
  }
  // Removed auto-selection of first page when none selected - this is handled by onMounted
  // to avoid race condition and double-triggering during initialization
}, { deep: true })

// Load pages from database on mount and resume PDF processing
onMounted(async () => {
  await pagesStore.loadPagesFromDB()
  if (pagesStore.pages.length > 0 && !selectedPageId.value) {
    const firstPage = pagesStore.pages[0]
    if (firstPage) {
      // Use handlePageSelected to ensure proper initialization
      handlePageSelected(firstPage)
    }
  }

  // Initialize event listeners for OCR and Document Generation
  pagesStore.setupOCREventListeners()
  pagesStore.setupDocGenEventListeners()

  // Resume any interrupted PDF processing
  try {
    const { pdfService } = await import('./services/pdf')
    await pdfService.resumeProcessing()
  } catch (error) {
    uiLogger.error('Error resuming PDF processing:', error)
  }

  // Expose store for E2E testing observability
  if (typeof window !== 'undefined') {
    (window as any).pagesStore = pagesStore
    // Log documentService to avoid tree-shaking and satisfy linter
    console.log('[App] Document service initialized', !!documentService)
  }
})
</script>

<style>
/* ====== Base ====== */
* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: Inter, system-ui, sans-serif;
  background: #f6f7f8;
  color: #111;
  height: 100%;
  overflow: hidden;
}


/* ====== Naive UI Overrides ====== */
.n-layout,
.n-layout-header,
.n-layout-sider,
.n-layout-content {
  background-color: #f6f7f8 !important;
}

/* Page List Collapse Trigger - positioned at sider edge */
.sider-trigger-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-shrink: 0;
}

.sider-trigger-btn {
  background: white !important;
  border: 1px solid #d0d0d0 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  width: 28px !important;
  height: 28px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.2s;
}

.sider-trigger-btn:hover {
  border-color: #18a058 !important;
  box-shadow: 0 2px 6px rgba(24, 160, 88, 0.2);
}

.sider-trigger-btn .n-icon {
  font-size: 18px !important;
}

/* ====== Layout ====== */
.app-container {
  height: 100vh;
}

.app-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.app-main {
  height: calc(100vh - 64px);
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
}

/* Content area with panels */
.content-area {
  flex: 1;
  display: flex;
  flex-direction: row; /* Key: horizontal layout */
  height: 100%;
  overflow: hidden;
  position: relative; /* For absolute positioned expand triggers */
}

.panel {
  height: 100%;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0; /* Prevent shrinking below specified width */
}

.page-viewer-panel {
  border-right: 1px solid #e0e0e0;
  border-left: 1px solid #e0e0e0;
}

.preview-panel {
  border-left: 1px solid #e0e0e0;
}

/* Panel divider with collapse/expand controls */
.panel-divider {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 32px;
  min-width: 32px;
  height: 100%;
  background: #f0f0f0;
  border-left: 1px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
  gap: 12px;
  flex-shrink: 0;
}

.panel-divider .n-button {
  background: white !important;
  border: 1px solid #d0d0d0 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  opacity: 0.8;
  transition: all 0.2s;
}

.panel-divider .n-button:hover {
  opacity: 1;
  border-color: #18a058 !important;
  box-shadow: 0 2px 6px rgba(24, 160, 88, 0.2);
}

/* Right edge trigger for Preview expand - now part of flex layout */
.right-edge-trigger {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 32px;
  min-width: 32px; /* Prevent shrinking */
  flex-shrink: 0;
  background: #f0f0f0;
  border-left: 1px solid #e0e0e0;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.right-edge-trigger .n-button {
  background: white !important;
  border: 1px solid #d0d0d0 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  opacity: 0.8;
  transition: all 0.2s;
}

.right-edge-trigger .n-button:hover {
  opacity: 1;
  border-color: #18a058 !important;
  box-shadow: 0 2px 6px rgba(24, 160, 88, 0.2);
}
</style>

