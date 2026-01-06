<template>
  <div class="page-list-container">
    <!-- Selection Toolbar -->
    <div
      v-if="pages.length > 0"
      class="selection-toolbar"
      data-testid="selection-toolbar"
    >
      <NCheckbox
        :checked="isAllSelected"
        :indeterminate="isPartiallySelected"
        size="small"
        data-testid="select-all-checkbox"
        @update:checked="handleSelectAll"
      />
      
      <!-- Export dropdown button -->
      <NDropdown
        v-if="hasSelection"
        trigger="click"
        :options="exportMenuOptions"
        placement="bottom-start"
        @select="handleExportSelect"
      >
        <NButton
          text
          size="tiny"
          circle
          title="Export selected pages"
          class="export-selected-btn"
        >
          <template #icon>
            <n-icon
              size="18"
              color="#18a058"
            >
              <DownloadOutline />
            </n-icon>
          </template>
        </NButton>
      </NDropdown>

      <!-- Batch OCR button -->
      <NButton
        v-if="hasSelection"
        text
        size="tiny"
        circle
        title="Scan selected pages to document"
        class="batch-ocr-btn"
        data-testid="batch-ocr-button"
        @click="handleBatchOCR"
      >
        <template #icon>
          <n-icon
            size="18"
            color="#18a058"
          >
            <DocumentTextOutline />
          </n-icon>
        </template>
      </NButton>

      <!-- Delete button -->
      <NButton
        v-if="hasSelection"
        text
        size="tiny"
        circle
        :style="{
          transform: isDeleteHovered ? 'scale(1.1)' : 'scale(1)',
          transition: 'all 0.2s ease'
        }"
        title="Delete selected pages"
        class="delete-selected-btn"
        data-testid="batch-delete-button"
        @click="handleBatchDelete"
        @mouseenter="isDeleteHovered = true"
        @mouseleave="isDeleteHovered = false"
      >
        <template #icon>
          <n-icon
            size="18"
            :color="isDeleteHovered ? '#d03050' : '#666'"
          >
            <TrashOutline />
          </n-icon>
        </template>
      </NButton>
    </div>

    <n-scrollbar class="page-list">
      <draggable
        v-model="localPages"
        item-key="id"
        ghost-class="ghost"
        chosen-class="chosen"
        @end="handleDragEnd"
      >
        <template #item="{ element: page }">
          <PageItem
            :page="page"
            :is-active="page.id === selectedId"
            @click="selectPage"
            @delete="handlePageDeleted"
          />
        </template>
      </draggable>

      <!-- Empty state when no pages -->
      <n-empty
        v-if="localPages.length === 0"
        description="No pages added"
        class="empty-state"
      >
        <template #icon>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line
              x1="12"
              y1="18"
              x2="12"
              y2="12"
            />
            <line
              x1="9"
              y1="15"
              x2="12"
              y2="12"
            />
            <line
              x1="15"
              y1="15"
              x2="12"
              y2="12"
            />
          </svg>
        </template>
      </n-empty>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, h } from 'vue'
import draggable from 'vuedraggable'
import { usePagesStore } from '@/stores/pages'
import PageItem from '@/components/page-item/PageItem.vue'
import type { Page, PageStatus } from '@/stores/pages'
import { TrashOutline, DownloadOutline, DocumentTextOutline } from '@vicons/ionicons5'
import { NScrollbar, NEmpty, NCheckbox, NButton, NIcon, NDropdown, useMessage, useDialog } from 'naive-ui'
import { exportService } from '@/services/export'
import { ocrService } from '@/services/ocr'
import { db } from '@/db'

const props = defineProps<{
  pages: Page[]
  selectedId: string | null
}>()

type ExportFormat = 'markdown' | 'docx' | 'pdf'

const emit = defineEmits<{
  pageSelected: [page: Page]
  pageDeleted: [page: Page]
  batchDeleted: [pages: Page[]]
}>()

const pagesStore = usePagesStore()
const isDeleteHovered = ref(false)
const message = useMessage()
const dialog = useDialog()

// Local copy of pages for drag and drop
const localPages = ref<Page[]>([...props.pages])

// Watch for changes in props.pages and update local copy
watch(() => props.pages, (newPages) => {
  localPages.value = [...newPages]
}, { deep: true, immediate: true })

// Computed properties for selection state
const hasSelection = computed(() => pagesStore.selectedPageIds.length > 0)
const isAllSelected = computed(() =>
  props.pages.length > 0 && pagesStore.selectedPageIds.length === props.pages.length
)
const isPartiallySelected = computed(() =>
  pagesStore.selectedPageIds.length > 0 && pagesStore.selectedPageIds.length < props.pages.length
)

function selectPage(page: Page) {
  emit('pageSelected', page)
}

function handlePageDeleted(page: Page) {
  emit('pageDeleted', page)
}

function handleSelectAll(checked: boolean) {
  if (checked) {
    pagesStore.selectAllPages()
  } else {
    pagesStore.clearSelection()
  }
}

function handleBatchDelete() {
  const selectedPages = pagesStore.selectedPages
  if (selectedPages.length > 0) {
    // Emit batch delete event
    emit('batchDeleted', selectedPages)
  }
}

async function handleBatchOCR() {
  const selectedPages = pagesStore.selectedPages
  if (selectedPages.length === 0) return

  // Call batch OCR service
  const result = await ocrService.queueBatchOCR(selectedPages)

  // Show result notification
  if (result.queued > 0) {
    let msg = `已将 ${result.queued} 个页面添加到 OCR 队列`
    if (result.skipped > 0) {
      msg += ` (跳过 ${result.skipped} 个已处理)`
    }
    message.success(msg)
  } else {
    message.warning('选中的页面都已处理或正在处理中')
  }
}

// Export functionality
const exportMenuOptions = computed(() => {
  const stats = exportStats.value
  return [
    {
      label: `Export as Markdown (${stats.markdown}/${stats.total})`,
      key: 'markdown',
      disabled: stats.markdown === 0,
      icon: () => h(NIcon, null, { default: () => h(DocumentTextOutline) })
    },
    {
      label: `Export as DOCX (${stats.docx}/${stats.total})`,
      key: 'docx',
      disabled: stats.docx === 0,
      icon: () => h(NIcon, null, { default: () => h(DownloadOutline) })
    },
    {
      label: `Export as PDF (${stats.pdf}/${stats.total})`,
      key: 'pdf',
      disabled: stats.pdf === 0,
      icon: () => h(NIcon, null, { default: () => h(DownloadOutline) })
    }
  ]
})

const exportStats = ref({
  total: 0,
  markdown: 0,
  docx: 0,
  pdf: 0
})

// Watch selected pages and update stats
watch(() => pagesStore.selectedPages, async (selected) => {
  const total = selected.length
  if (total === 0) {
    exportStats.value = { total: 0, markdown: 0, docx: 0, pdf: 0 }
    return
  }

  const results = await Promise.all(
    selected.map(async (page) => ({
      hasMarkdown: await hasFormat(page.id, 'markdown'),
      hasDocx: await hasFormat(page.id, 'docx'),
      hasPdf: await hasFormat(page.id, 'pdf')
    }))
  )

  exportStats.value = {
    total,
    markdown: results.filter(r => r.hasMarkdown).length,
    docx: results.filter(r => r.hasDocx).length,
    pdf: results.filter(r => r.hasPdf).length
  }
}, { immediate: true })

async function handleExportSelect(key: string) {
  if (key === 'markdown' || key === 'docx' || key === 'pdf') {
    await handleQuickExport(key as ExportFormat)
  }
}

async function handleQuickExport(format: ExportFormat) {
  const { validPages, invalidPages } = await checkPagesReadiness(
    pagesStore.selectedPages,
    format
  )
  
  // All pages ready, export directly
  if (invalidPages.length === 0) {
    await performExport(validPages, format)
    message.success(`Exported ${validPages.length} pages`)
    return
  }
  
  // No pages ready, show warning
  if (validPages.length === 0) {
    dialog.warning({
      title: 'Cannot Export',
      content: `All ${invalidPages.length} selected pages don't have Markdown data yet.`,
      positiveText: 'OK'
    })
    return
  }
  
  // Some pages not ready, show confirmation
  await showExportConfirmDialog(validPages, invalidPages, format)
}

async function checkPagesReadiness(pages: Page[], format: ExportFormat) {
  const checks = await Promise.all(
    pages.map(async (page) => ({
      page,
      isReady: await hasFormat(page.id, format)
    }))
  )
  
  return {
    validPages: checks.filter(c => c.isReady).map(c => c.page),
    invalidPages: checks.filter(c => !c.isReady).map(c => c.page)
  }
}

async function hasFormat(pageId: string, format: ExportFormat): Promise<boolean> {
  if (format === 'markdown' || format === 'docx') {
    const md = await db.getPageMarkdown(pageId)
    return !!md && md.content.length > 0
  } else if (format === 'pdf') {
    const pdf = await db.getPagePDF(pageId)
    return !!pdf
  }
  return false
}

async function showExportConfirmDialog(
  validPages: Page[],
  invalidPages: Page[],
  format: string
) {
  return new Promise((resolve) => {
    dialog.warning({
      title: 'Some Pages Not Ready',
      content: () => h('div', { class: 'export-warning-content' }, [
        h('p', { style: 'margin-bottom: 12px' }, 
          `${invalidPages.length} of ${validPages.length + invalidPages.length} pages don't have ${format.toUpperCase()} data yet:`
        ),
        h('div', { 
          class: 'page-list-preview',
          style: 'max-height: 150px; overflow-y: auto; background: #f5f5f5; padding: 8px; border-radius: 4px; margin-bottom: 12px'
        }, 
          invalidPages.map(p => 
            h('div', { style: 'font-size: 13px; color: #666; padding: 2px 0' }, 
              `• ${p.fileName} - ${getStatusLabel(p.status)}`
            )
          )
        ),
        h('p', { style: 'font-size: 13px; color: #666' }, 
          'You can cancel to complete OCR first, or skip these pages and export the rest.'
        )
      ]),
      positiveText: 'Skip & Export',
      negativeText: 'Cancel',
      onPositiveClick: async () => {
        await performExport(validPages, format as ExportFormat)
        message.success(
          `Exported ${validPages.length} pages (skipped ${invalidPages.length})`
        )
        resolve(true)
      },
      onNegativeClick: () => {
        resolve(false)
      }
    })
  })
}

async function performExport(pages: Page[], format: ExportFormat) {
  const options = {
    format: format,
    includeImages: true,
    useDataURI: false
  }
  
  if (format === 'markdown') {
    const result = await exportService.exportToMarkdown(pages, options)
    exportService.downloadBlob(result)
  } else if (format === 'docx') {
    const result = await exportService.exportToDOCX(pages, options)
    exportService.downloadBlob(result)
  } else if (format === 'pdf') {
    const result = await exportService.exportToPDF(pages, options)
    exportService.downloadBlob(result)
  }
}

function getStatusLabel(status: PageStatus): string {
  const labels: Record<PageStatus, string> = {
    'pending_render': 'Rendering...',
    'rendering': 'Rendering...',
    'pending_ocr': 'OCR Queued',
    'recognizing': 'OCR Running...',
    'ocr_success': 'OCR Done',
    'pending_gen': 'Generating...',
    'generating_markdown': 'Generating MD...',
    'markdown_success': 'MD Ready',
    'generating_docx': 'Generating DOCX...',
    'generating_pdf': 'Generating PDF...',
    'pdf_success': 'PDF Ready',
    'ready': 'Ready',
    'completed': 'Completed',
    'error': 'Error'
  }
  return labels[status] || status
}

interface DragEndEvent {
  oldIndex: number
  newIndex: number
}

async function handleDragEnd(event: DragEndEvent) {
  const { oldIndex, newIndex } = event

  if (oldIndex !== newIndex) {
    // Create new order mapping
    const newOrder = localPages.value.map((page, index) => ({
      id: page.id,
      order: index
    }))

    // Update store and database
    await pagesStore.reorderPages(newOrder)
  }
}

// Expose nothing for now as currentPage is controlled by parent
defineExpose({})
</script>

<style scoped>
.page-list-container {
  display: flex;
  padding: 8px 0 8px 8px;
  flex-direction: column;
  height: 100%;
}

.selection-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 18px; /* Align with page checkboxes: drag-handle(8px) + checkbox margin-left(8px) */
  border-bottom: 1px solid #f0f0f0;
  min-height: 40px;
}

.delete-selected-btn {
  margin-left: auto;
  margin-right: 8px;
}

.batch-ocr-btn {
  margin-left: 0;
}

.page-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 8px;
  padding: 8px 8px 8px 8px;
  padding-right: 12px; /* Extra space to prevent page item borders from overlapping scrollbar */
}

/* Draggable ghost class for vuedraggable */
.ghost {
  opacity: 0.5;
  background: var(--n-pressed-color);
}

/* Draggable chosen class for vuedraggable */
.chosen {
  cursor: grabbing;
}

.empty-state {
  padding: 32px 16px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>