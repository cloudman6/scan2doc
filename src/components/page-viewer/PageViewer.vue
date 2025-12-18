<template>
  <div class="page-viewer">
    <!-- Header with page info and controls -->
    <n-card class="viewer-header" size="small" :bordered="false">
      <n-space justify="space-between" align="center">
        <h3 class="page-title">
          Page {{ currentPage?.id?.toString().padStart(3, '0') || '---' }}
        </h3>
        <n-space align="center" size="small">
          <n-button-group size="small">
            <n-button @click="zoomOut" :disabled="zoomLevel <= 0.25">
              <template #icon>−</template>
            </n-button>
            <n-button disabled>{{ Math.round(zoomLevel * 100) }}%</n-button>
            <n-button @click="zoomIn" :disabled="zoomLevel >= 3">
              <template #icon>+</template>
            </n-button>
          </n-button-group>
          <n-button size="small" @click="fitToScreen">Fit</n-button>
        </n-space>
      </n-space>
    </n-card>

    <!-- Main image display area -->
    <div class="image-container" ref="imageContainer">
      <div v-if="currentPage" class="image-wrapper">
        <img
          v-if="currentPage.imageData"
          :src="currentPage.imageData"
          :style="{ transform: `scale(${zoomLevel})` }"
          class="page-image"
          alt=""
          @loadstart="onImageStartLoad"
          @load="onImageLoad"
          @error="onImageError"
        />
        <n-empty v-else description="No image available">
          <template #icon>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </template>
        </n-empty>

        <!-- Loading overlay -->
        <n-spin v-if="imageLoading" size="large" class="loading-overlay">
          <template #description>Loading image...</template>
        </n-spin>

        <!-- Error overlay -->
        <n-result
          v-if="imageError"
          status="error"
          :title="imageError"
          class="error-overlay"
        />
      </div>
      <n-empty v-else description="Select a page to view" class="placeholder-select">
        <template #icon>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </template>
      </n-empty>
    </div>

    <!-- Bottom toolbar -->
    <n-card class="viewer-toolbar" size="small" :bordered="false">
      <n-space justify="space-between" align="center">
        <n-space size="medium">
          <n-text depth="3">
            Status: <n-text :type="getStatusType()" depth="1">{{ statusText }}</n-text>
          </n-text>
          <n-text v-if="imageSize" depth="3">
            Size: <n-text depth="1">{{ imageSize }}</n-text>
          </n-text>
          <n-text v-if="currentPage?.fileSize" depth="3">
            File: <n-text depth="1">{{ formatFileSize(currentPage.fileSize) }}</n-text>
          </n-text>
        </n-space>
        <n-button
          :type="status === 'processing' ? 'info' : 'primary'"
          :loading="status === 'processing'"
          :disabled="!currentPage || status === 'processing'"
          @click="runOCR"
          size="small"
        >
          {{ status === 'processing' ? 'Processing OCR...' : 'Run OCR' }}
        </n-button>
      </n-space>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NCard, NSpace, NButton, NButtonGroup, NSpin, NEmpty, NResult, NText } from 'naive-ui'

interface Page {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  status: 'idle' | 'processing' | 'completed' | 'error'
  progress: number
  imageData?: string  // base64 image data that can be used directly as img src
  thumbnailData?: string  // base64 thumbnail data that can be used directly as img src
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

const zoomLevel = ref(1)
const imageContainer = ref<HTMLElement>()
const imageSize = ref<string>('')
const imageLoading = ref(false)
const imageError = ref<string>('')

const status = computed(() => props.currentPage?.status || 'idle')

const statusText = computed(() => {
  switch (status.value) {
    case 'idle': return 'Idle'
    case 'processing': return 'Processing'
    case 'completed': return 'Completed'
    case 'error': return 'Error'
    default: return 'Unknown'
  }
})

const statusClass = computed(() => {
  switch (status.value) {
    case 'completed': return 'status-done'
    case 'processing': return 'status-processing'
    case 'error': return 'status-error'
    default: return 'status-idle'
  }
})

function getStatusType(): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (status.value) {
    case 'completed': return 'success'
    case 'processing': return 'info'
    case 'error': return 'error'
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
  // Add logic to calculate optimal fit if needed
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

function onImageStartLoad() {
  imageLoading.value = true
  imageError.value = ''
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function runOCR() {
  if (!props.currentPage || status.value === 'processing') return

  // This would integrate with your OCR service
  console.log('Running OCR for page', props.currentPage.id)
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