<template>
  <div class="preview">
    <div class="preview-header">
       <n-tabs
        v-model:value="currentView"
        type="segment"
        animated
        class="preview-tabs"
      >
        <n-tab-pane
          v-for="view in views"
          :key="view.key"
          :name="view.key"
          :tab="view.label"
        />
      </n-tabs>
      <div v-if="currentView === 'md'" class="header-actions">
           <n-button 
             size="small" 
             secondary 
             type="primary" 
             @click="downloadMarkdown"
             :disabled="!mdContent || isLoadingMd"
           >
             Download
           </n-button>
      </div>
    </div>

    <div class="preview-content">
        <!-- Image View -->
        <div
          v-if="currentView === 'image'"
          class="image-wrapper"
        >
          <img
            v-if="fullImageUrl"
            :src="fullImageUrl"
            alt="Preview"
            class="preview-img"
          >
          <n-empty
            v-else
            :description="currentPage?.status === 'rendering' ? 'Rendering...' : 'No image available'"
          />
        </div>

        <!-- Markdown View -->
        <div v-else-if="currentView === 'md'" class="markdown-wrapper">
             <n-spin v-if="isLoadingMd" description="Loading markdown..." />
             <pre v-else class="markdown-preview">{{ mdContent || 'No markdown content available' }}</pre>
        </div>

        <!-- HTML View -->
        <div
          v-else-if="currentView === 'html'"
          class="html-preview"
          v-html="htmlContent || '<p>No HTML content available</p>'"
        />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, computed } from 'vue'
import { NTabs, NTabPane, NEmpty, NButton, NSpin } from 'naive-ui'
import { db } from '@/db'
import { uiLogger } from '@/utils/logger'

import type { Page } from '@/stores/pages'

const props = defineProps<{
  currentPage?: Page | null
}>()

const currentView = ref<'image' | 'md' | 'html'>('image')
const fullImageUrl = ref<string>('')
const mdContent = ref<string>('')
const isLoadingMd = ref(false)

const htmlContent = computed(() => {
  if (!props.currentPage?.outputs) return ''
  return props.currentPage.outputs.find((o: any) => o.format === 'html')?.content || ''
})

const views = [
  { key: 'image' as const, label: 'Image' },
  { key: 'md' as const, label: 'Markdown' },
  { key: 'html' as const, label: 'HTML' }
]

// Watch for page change or status change or view change
watch(
  [() => props.currentPage?.id, () => props.currentPage?.status, currentView],
  async ([newPageId, newStatus, newView], [oldPageId, oldStatus, oldView]) => {
    // Determine if we need to reload content
    if (!newPageId) {
       fullImageUrl.value = ''
       mdContent.value = ''
       return
    }

    // Image logic
    if (newView === 'image') {
        if (newPageId !== oldPageId || newStatus !== oldStatus || oldView !== 'image') {
           await handlePreviewPageChange(newPageId, newStatus, oldPageId, oldStatus)
        }
    } 
    // Markdown logic
    else if (newView === 'md') {
        if (newPageId !== oldPageId || newStatus !== oldStatus || oldView !== 'md') {
            await loadMarkdown(newPageId)
        }
    }
  },
  { immediate: true }
)

/**
 * Handle page or status change for preview
 */
async function handlePreviewPageChange(
  newPageId: string | undefined,
  newStatus: string | undefined,
  oldPageId: string | undefined,
  oldStatus: string | undefined
) {
  const idChanged = newPageId !== oldPageId
  // Cleanup if page changed
  cleanupPreviewUrl(idChanged)

  if (!newPageId || newStatus === 'pending_render' || newStatus === 'rendering') return

  await loadPreviewBlob(newPageId)
}

function cleanupPreviewUrl(idChanged: boolean) {
  if (idChanged && fullImageUrl.value) {
    URL.revokeObjectURL(fullImageUrl.value)
    fullImageUrl.value = ''
  }
}

async function loadPreviewBlob(pageId: string) {
  try {
    const blob = await db.getPageImage(pageId)
    if (blob) {
      fullImageUrl.value = URL.createObjectURL(blob)
    }
  } catch (error) {
    uiLogger.error('Failed to load image for preview', error)
  }
}

async function loadMarkdown(pageId: string) {
    isLoadingMd.value = true
    try {
        const record = await db.getPageMarkdown(pageId)
        if (record) {
            mdContent.value = record.content
        } else {
            // Fallback to OCR text if no markdown yet?
            // Actually OCR text is in page object, but let's stick to DB or Page object
            // Page object has ocrText.
            mdContent.value = props.currentPage?.ocrText || ''
        }
    } catch (error) {
        uiLogger.error('Failed to load markdown', error)
        mdContent.value = 'Failed to load content.'
    } finally {
        isLoadingMd.value = false
    }
}

function downloadMarkdown() {
    if (!mdContent.value || !props.currentPage) return
    const blob = new Blob([mdContent.value], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Use original filename base + .md
    const baseName = props.currentPage.fileName.replace(/\.[^/.]+$/, "")
    const pageNum = props.currentPage.pageNumber || 1
    a.download = `${baseName}_page${pageNum}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

onUnmounted(() => {
  if (fullImageUrl.value) {
    URL.revokeObjectURL(fullImageUrl.value)
  }
})
</script>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.preview-content {
  flex: 1;
  padding: 16px;
  overflow: auto;
  height: 100%;
}

.image-preview {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-wrapper {
  max-width: 100%;
  max-height: 100%;
  display: flex;
  justify-content: center;
}

.preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.markdown-preview {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #374151;
  background: #f9fafb;
  padding: 16px;
  border-radius: 6px;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.html-preview {
  padding: 16px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.5;
  color: #374151;
}

.html-preview :deep(h1) {
  font-size: 1.5em;
  margin: 0.67em 0;
  font-weight: bold;
}

.html-preview :deep(h2) {
  font-size: 1.3em;
  margin: 0.75em 0;
  font-weight: bold;
}

.html-preview :deep(p) {
  margin: 1em 0;
}
</style>