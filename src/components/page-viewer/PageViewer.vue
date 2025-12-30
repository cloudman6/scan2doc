<template>
  <div class="page-viewer">
    <!-- Header with page info and controls -->
    <n-card
      class="viewer-header"
      size="small"
      :bordered="false"
    >
      <n-space
        justify="space-between"
        align="center"
      >
        <h3 class="page-title">
          Page {{ currentPage?.id?.toString().padStart(3, '0') || '---' }}
        </h3>
        <n-space
          align="center"
          size="small"
        >
          <n-button-group size="small">
            <n-button
              :disabled="zoomLevel <= 0.25"
              @click="zoomOut"
            >
              <template #icon>
                −
              </template>
            </n-button>
            <n-button disabled>
              {{ Math.round(zoomLevel * 100) }}%
            </n-button>
            <n-button
              :disabled="zoomLevel >= 3"
              @click="zoomIn"
            >
              <template #icon>
                +
              </template>
            </n-button>
          </n-button-group>
          <n-button
            size="small"
            @click="fitToScreen"
          >
            Fit
          </n-button>
        </n-space>
      </n-space>
    </n-card>

    <!-- Main image display area -->
    <div
      ref="imageContainer"
      class="image-container"
    >
      <div
        v-if="currentPage"
        class="image-wrapper"
      >
        <img
          v-if="fullImageUrl"
          :src="fullImageUrl"
          :style="{ transform: `scale(${zoomLevel})` }"
          class="page-image"
          alt=""
          @load="onImageLoad"
          @error="onImageError"
        >
        <n-empty
          v-else-if="!imageLoading"
          description="No image available"
        >
          <template #icon>
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="2"
                ry="2"
              />
              <circle
                cx="8.5"
                cy="8.5"
                r="1.5"
              />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </template>
        </n-empty>

        <!-- Loading overlay -->
        <n-spin
          v-if="imageLoading"
          size="large"
          class="loading-overlay"
        >
          <template #description>
            Loading image...
          </template>
        </n-spin>

        <!-- Error overlay -->
        <n-result
          v-if="imageError"
          status="error"
          :title="imageError"
          class="error-overlay"
        />
      </div>
      <n-empty
        v-else
        description="Select a page to view"
        class="placeholder-select"
      >
        <template #icon>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line
              x1="16"
              y1="13"
              x2="8"
              y2="13"
            />
            <line
              x1="16"
              y1="17"
              x2="8"
              y2="17"
            />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </template>
      </n-empty>
    </div>

    <!-- Bottom toolbar -->
    <n-card
      class="viewer-toolbar"
      size="small"
      :bordered="false"
    >
      <n-space
        justify="space-between"
        align="center"
      >
        <n-space size="medium">
          <n-text depth="3">
            Status: <n-text
              :type="getStatusType()"
              depth="1"
            >
              {{ statusText }}
            </n-text>
          </n-text>
          <n-text
            v-if="imageSize"
            depth="3"
          >
            Size: <n-text depth="1">
              {{ imageSize }}
            </n-text>
          </n-text>
          <n-text
            v-if="currentPage?.fileSize !== undefined"
            depth="3"
          >
            File: <n-text depth="1">
              {{ formatFileSize(currentPage.fileSize) }}
            </n-text>
          </n-text>
        </n-space>
        <n-button
          :type="status === 'recognizing' ? 'info' : 'primary'"
          :loading="status === 'recognizing'"
          :disabled="!currentPage || status === 'recognizing' || status === 'pending_render' || status === 'rendering'"
          size="small"
          @click="runOCR"
        >
          {{ status === 'recognizing' ? 'Processing OCR...' : 'Run OCR' }}
        </n-button>
      </n-space>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { uiLogger } from '@/utils/logger'
import { NCard, NSpace, NButton, NButtonGroup, NSpin, NEmpty, NResult, NText } from 'naive-ui'
import { db } from '@/db'

import type { Page } from '@/stores/pages'

const props = defineProps<{
  currentPage?: Page | null
}>()

const zoomLevel = ref(1)
// const imageContainer = ref<HTMLElement>() // Unused ref removed
const imageSize = ref<string>('')
const imageLoading = ref(false)
const imageError = ref<string>('')
const fullImageUrl = ref<string>('')

const status = computed(() => props.currentPage?.status || 'ready')

// Watch for page change or status change to load full image
watch(
  [() => props.currentPage?.id, () => props.currentPage?.status],
  async ([newPageId, newStatus], [oldPageId, oldStatus]) => {
    await handlePageChange(newPageId, newStatus, oldPageId, oldStatus)
  },
  { immediate: true }
)

/**
 * Handle page or status change to load full image
 */
async function handlePageChange(
  newPageId: string | undefined, 
  newStatus: string | undefined, 
  oldPageId: string | undefined, 
  oldStatus: string | undefined
) {
  const idChanged = newPageId !== oldPageId
  const becameReady = newStatus === 'ready' && oldStatus !== 'ready'

  if (!idChanged && !becameReady) return

  cleanupPreviousUrl(idChanged)
  
  if (!newPageId || newStatus === 'pending_render' || newStatus === 'rendering') return

  await loadPageBlob(newPageId)
}

/**
 * Cleanup previous object URL
 */
function cleanupPreviousUrl(idChanged: boolean) {
  if (idChanged && fullImageUrl.value) {
    URL.revokeObjectURL(fullImageUrl.value)
    fullImageUrl.value = ''
  }
  imageError.value = ''
  imageSize.value = ''
}

/**
 * Load image blob from DB with a retry for stability (esp. for Webkit)
 */
async function loadPageBlob(pageId: string, retry = true) {
  imageLoading.value = true
  try {
    const blob = await db.getPageImage(pageId)
    if (blob) {
      fullImageUrl.value = URL.createObjectURL(blob)
      imageError.value = ''
    } else if (retry) {
      // Small delay and retry once - sometimes IDB is not ready immediately in Safari
      await new Promise(resolve => setTimeout(resolve, 100))
      await loadPageBlob(pageId, false)
    } else {
      imageError.value = 'Full image not found in storage'
    }
  } catch (error) {
    uiLogger.error('Failed to load full image', error)
    if (retry) {
      await new Promise(resolve => setTimeout(resolve, 100))
      await loadPageBlob(pageId, false)
    } else {
      imageError.value = 'Failed to load image from storage'
    }
  } finally {
    if (!retry) {
      imageLoading.value = false
    }
  }
}

// Cleanup on unmount
onUnmounted(() => {
  if (fullImageUrl.value) {
    URL.revokeObjectURL(fullImageUrl.value)
  }
})

const statusText = computed(() => {
  switch (status.value) {
    case 'pending_render': return 'Pending Render'
    case 'rendering': return 'Rendering'
    case 'ready': return 'Ready'
    case 'pending_ocr': return 'OCR Queued'
    case 'recognizing': return 'Recognizing...'
    case 'ocr_success': return 'OCR Done'
    case 'pending_gen': return 'Waiting for Gen'
    case 'generating_markdown': return 'Generating Markdown...'
    case 'markdown_success': return 'Markdown Ready'
    case 'generating_pdf': return 'Generating PDF...'
    case 'pdf_success': return 'PDF Ready'
    case 'generating_docx': return 'Generating DOCX...'
    case 'completed': return 'Completed'
    case 'error': return 'Error'
    default: return 'Unknown'
  }
})

function getStatusType(): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (status.value) {
    case 'completed':
    case 'ready':
    case 'ocr_success':
    case 'markdown_success':
    case 'pdf_success':
      return 'success'
    case 'rendering':
    case 'recognizing':
    case 'pending_ocr':
    case 'pending_gen':
    case 'generating_markdown':
    case 'generating_pdf':
    case 'generating_docx':
      return 'info'
    case 'error':
      return 'error'
    default: return 'default'
  }
}

function zoomIn() {
  if (zoomLevel.value < 3) {
    zoomLevel.value += 0.25
  }
}

function zoomOut() {
  if (zoomLevel.value > 0.25) {
    zoomLevel.value -= 0.25
  }
}

function fitToScreen() {
  zoomLevel.value = 1
}

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  imageSize.value = `${img.naturalWidth} × ${img.naturalHeight}`
  imageLoading.value = false
  imageError.value = ''
}

function onImageError() {
  imageSize.value = 'Load failed'
  imageLoading.value = false
  imageError.value = 'Failed to load image'
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function runOCR() {
  const isProcessing = status.value === 'recognizing' || 
                      status.value === 'pending_ocr' || 
                      status.value === 'rendering' || 
                      status.value === 'pending_render' ||
                      status.value === 'pending_gen' ||
                      status.value.startsWith('generating_')

  if (!props.currentPage || isProcessing) return
  uiLogger.info('Running OCR for page', props.currentPage.id)
}
</script>

<style scoped>
.page-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
}

.viewer-header {
  border-bottom: 1px solid var(--n-border-color);
}

.page-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color);
}

.image-container {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fa;
  position: relative;
}

.image-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 20px;
  position: relative;
}

.page-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  transition: transform 0.2s ease;
  transform-origin: center;
}

.placeholder-select {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  z-index: 10;
}

.viewer-toolbar {
  border-top: 1px solid var(--n-border-color);
  background: #fafafa;
}
</style>