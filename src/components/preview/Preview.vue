<template>
  <div class="preview">
    <n-tabs
      v-model:value="currentView"
      type="segment"
      animated
    >
      <n-tab-pane
        v-for="view in views"
        :key="view.key"
        :name="view.key"
        :tab="view.label"
      >
        <div class="preview-content">
          <div v-if="currentView === 'image'" class="image-preview">
            <div v-if="fullImageUrl" class="image-wrapper">
              <img :src="fullImageUrl" alt="Preview" class="preview-img" />
            </div>
            <n-empty v-else :description="currentPage?.status === 'rendering' ? 'Rendering...' : 'No image available'" />
          </div>
          <pre v-else-if="currentView === 'md'" class="markdown-preview">{{ currentPageContent?.md || 'No markdown content available' }}</pre>
          <div v-else-if="currentView === 'html'" class="html-preview" v-html="currentPageContent?.html || '<p>No HTML content available</p>'"></div>
          <n-empty v-else description="Select a page to preview" />
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { NTabs, NTabPane, NEmpty } from 'naive-ui'
import { db } from '@/db'
import { uiLogger } from '@/services/logger'

interface Page {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  origin: 'upload' | 'pdf_generated'
  status: 'pending_render' | 'rendering' | 'ready' | 'recognizing' | 'completed' | 'error'
  progress: number
  imageData?: string
  thumbnailData?: string
  width?: number
  height?: number
  ocrText?: string
  ocrConfidence?: number
  outputs: any[]
  logs: any[]
  createdAt: Date
  updatedAt: Date
  processedAt?: Date
}

const props = defineProps<{
  currentPage?: Page | null
}>()

const currentView = ref<'image' | 'md' | 'html'>('image')
const fullImageUrl = ref<string>('')

const views = [
  { key: 'image' as const, label: 'Image' },
  { key: 'md' as const, label: 'Markdown' },
  { key: 'html' as const, label: 'HTML' }
]

const currentPageContent = computed(() => props.currentPage)

// Watch for page change or status change to load image
watch(
  [() => props.currentPage?.id, () => props.currentPage?.status],
  async ([newPageId, newStatus], [oldPageId, oldStatus]) => {
    const idChanged = newPageId !== oldPageId
    const becameReady = newStatus === 'ready' && oldStatus !== 'ready'

    if (!idChanged && !becameReady) return

    if (idChanged && fullImageUrl.value) {
      URL.revokeObjectURL(fullImageUrl.value)
      fullImageUrl.value = ''
    }

    if (!newPageId || newStatus === 'pending_render' || newStatus === 'rendering') return

    try {
      const blob = await db.getPageImage(newPageId)
      if (blob) {
        fullImageUrl.value = URL.createObjectURL(blob)
      }
    } catch (error) {
      uiLogger.error('Failed to load image for preview', error)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (fullImageUrl.value) {
    URL.revokeObjectURL(fullImageUrl.value)
  }
})

function switchView(view: 'image' | 'md' | 'html') {
  currentView.value = view
}
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