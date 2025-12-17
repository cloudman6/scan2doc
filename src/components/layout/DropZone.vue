<template>
  <div
    class="drop-zone"
    :class="{ 'is-dragging': isDragging }"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
  >
    <div class="drop-zone-content">
      <div class="drop-icon">
        <!-- Icon will go here -->
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M7 10l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 15V3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M20 15v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h3 class="drop-title">Drop files here</h3>
      <p class="drop-description">
        or click to select images and PDF files
      </p>
      <input
        ref="fileInput"
        type="file"
        class="file-input"
        accept="image/*,.pdf"
        multiple
        @change="handleFileSelect"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  disabled?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  files: [files: File[]]
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement>()

function handleDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()

  if (props.disabled) return

  isDragging.value = false

  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length > 0) {
    emit('files', files)
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()

  if (!props.disabled) {
    e.dataTransfer!.dropEffect = 'copy'
  }
}

function handleDragEnter(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()

  if (!props.disabled) {
    isDragging.value = true
  }
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()

  if (e.target === e.currentTarget) {
    isDragging.value = false
  }
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (files.length > 0) {
    emit('files', files)
  }
  // Clear input value to allow selecting same file again
  target.value = ''
}

function click() {
  if (!props.disabled) {
    fileInput.value?.click()
  }
}

defineExpose({
  click
})
</script>

<style scoped>
.drop-zone {
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  padding: 32px;
  background: #fafafa;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  position: relative;
}

.drop-zone:hover {
  border-color: #1890ff;
  background: #f0f8ff;
}

.drop-zone.is-dragging {
  border-color: #1890ff;
  background: #e6f7ff;
  transform: scale(1.01);
}

.drop-zone-content {
  pointer-events: none;
}

.drop-icon {
  color: #999;
  margin-bottom: 16px;
}

.drop-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.drop-description {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  pointer-events: auto;
}

.drop-zone:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.drop-zone:disabled:hover {
  border-color: #d9d9d9;
  background: #fafafa;
}
</style>