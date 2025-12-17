<template>
  <div class="page-viewer">
    <!-- Header with page info and controls -->
    <div class="viewer-header">
      <h3 class="page-title">
        Page {{ currentPage?.id?.toString().padStart(3, '0') || '---' }}
      </h3>
      <div class="viewer-controls">
        <button
          class="zoom-btn"
          @click="zoomOut"
          :disabled="zoomLevel <= 0.25"
        >
          −
        </button>
        <span class="zoom-level">{{ Math.round(zoomLevel * 100) }}%</span>
        <button
          class="zoom-btn"
          @click="zoomIn"
          :disabled="zoomLevel >= 3"
        >
          +
        </button>
        <button class="zoom-btn" @click="fitToScreen">Fit</button>
      </div>
    </div>

    <!-- Main image display area -->
    <div class="image-container" ref="imageContainer">
      <div v-if="currentPage" class="image-wrapper">
        <img
          v-if="currentPage.imageUrl"
          :src="currentPage.imageUrl"
          :style="{ transform: `scale(${zoomLevel})` }"
          class="page-image"
          alt=""
          @loadstart="onImageStartLoad"
          @load="onImageLoad"
          @error="onImageError"
        />
        <div v-else class="placeholder-image">
          <div class="placeholder-content">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <p>No image available</p>
          </div>
        </div>

        <!-- Loading overlay -->
        <div v-if="imageLoading" class="loading-overlay">
          <div class="loading-spinner">Loading...</div>
        </div>

        <!-- Error overlay -->
        <div v-if="imageError" class="error-overlay">
          <div class="error-message">{{ imageError }}</div>
        </div>
      </div>
      <div v-else class="placeholder-select">
        <div class="placeholder-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <p>Select a page to view</p>
        </div>
      </div>
    </div>

    <!-- Bottom toolbar -->
    <div class="viewer-toolbar">
      <div class="status-info">
        <span class="status-item">
          Status: <strong :class="statusClass">{{ statusText }}</strong>
        </span>
        <span class="status-item" v-if="imageSize">
          Size: <strong>{{ imageSize }}</strong>
        </span>
        <span class="status-item" v-if="currentPage?.fileSize">
          File: <strong>{{ formatFileSize(currentPage.fileSize) }}</strong>
        </span>
      </div>
      <button
        class="ocr-btn"
        :class="{ processing: status === 'processing' }"
        @click="runOCR"
        :disabled="!currentPage || status === 'processing'"
      >
        {{ status === 'processing' ? 'Processing OCR...' : 'Run OCR' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Page {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  status: 'idle' | 'processing' | 'completed' | 'error'
  progress: number
  imageUrl?: string
  thumbnailUrl?: string
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.page-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111;
}

.viewer-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 16px;
  color: #374151;
}

.zoom-btn:hover:not(:disabled) {
  background: #f3f4f6;
}

.zoom-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.zoom-level {
  font-size: 12px;
  color: #6b7280;
  min-width: 42px;
  text-align: center;
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

.placeholder-image,
.placeholder-select {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}

.placeholder-content {
  text-align: center;
  color: #9ca3af;
}

.placeholder-content svg {
  margin: 0 auto 16px;
  opacity: 0.5;
}

.placeholder-content p {
  margin: 0;
  font-size: 14px;
}

.viewer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  background: #fafafa;
}

.status-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
}

.status-item {
  color: #6b7280;
}

.status-item strong {
  color: #111;
  font-weight: 600;
}

.status-done {
  color: #16a34a;
}

.status-pending {
  color: #d97706;
}

.status-idle {
  color: #d97706;
}

.status-processing {
  color: #2563eb;
}

.status-error {
  color: #dc2626;
}

.ocr-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: white;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
}

.ocr-btn:hover:not(:disabled) {
  background: #f3f4f6;
}

.ocr-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ocr-btn.processing {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

/* Loading and error overlays */
.image-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
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
}

.loading-spinner {
  padding: 16px;
  background: #3b82f6;
  color: white;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
}

.error-message {
  padding: 16px;
  background: #dc2626;
  color: white;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
}
</style>