<template>
  <div
    :class="['page-item', { active: isActive, dragging: isDragging }]"
    @click="handleClick"
    @mouseenter="isPageHovered = true"
    @mouseleave="isPageHovered = false"
  >
    <div class="drag-handle">⋮⋮</div>
    <NButton
      text
      size="tiny"
      circle
      :style="{
        position: 'absolute',
        top: '50%',
        right: '4px',
        transform: isDeleteHovered ? 'translateY(-50%) scale(1.1)' : 'translateY(-50%)',
        opacity: isPageHovered || isDeleteHovered ? 1 : 0,
        transition: 'all 0.2s ease'
      }"
      @click.stop="handleDelete"
      @mouseenter="isDeleteHovered = true"
      @mouseleave="isDeleteHovered = false"
      title="Delete page"
    >
      <template #icon>
        <img
          :src="isDeleteHovered ? '/src/assets/delete_red.svg' : '/src/assets/delete.svg'"
          alt="Delete"
          style="width: 16px; height: 16px; transition: all 0.2s ease;"
        />
      </template>
    </NButton>
    <div class="page-thumbnail">
      <img v-if="page.thumbnailData" :src="page.thumbnailData" alt="" />
      <div v-else class="placeholder-image"></div>
    </div>
    <div class="page-meta">
      <div class="page-name">{{ page.fileName }}</div>
      <div class="page-info">
        {{ formatFileSize(page.fileSize) }}
      </div>
      <div class="status-row">
        <n-tag :type="getStatusType(page.status)" size="small">
          OCR
        </n-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NTag } from 'naive-ui'
import type { Page } from '@/stores/pages'

interface Props {
  page: Page
  isActive?: boolean
  isDragging?: boolean
}

interface Emits {
  (e: 'click', page: Page): void
  (e: 'delete', page: Page): void
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  isDragging: false
})

const emit = defineEmits<Emits>()

// Reactive state for delete icon and page hover
const isDeleteHovered = ref(false)
const isPageHovered = ref(false)

function handleClick() {
  emit('click', props.page)
}

function handleDelete() {
  emit('delete', props.page)
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getStatusClass(status: Page['status']): string {
  switch (status) {
    case 'completed':
      return 'done'
    case 'processing':
      return 'processing'
    case 'error':
      return 'error'
    default:
      return 'pending'
  }
}

function getStatusType(status: Page['status']): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'completed':
      return 'success'
    case 'processing':
      return 'info'
    case 'error':
      return 'error'
    default:
      return 'warning'
  }
}
</script>

<style scoped>
.page-item {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
  margin-right: 13px;
  user-select: none; /* Prevent text selection during drag */
  position: relative;
}

.page-item:hover {
  background: #f8f9fa;
}

.page-item.active {
  border-color: #6366f1;
  background: #f0f1ff;
}

.page-item.dragging {
  transform: rotate(5deg);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  opacity: 0.9;
}

/* Drag and drop styles */
.drag-handle {
  display: flex;
  align-items: center;
  color: #9ca3af;
  font-size: 12px;
  cursor: grab;
  padding: 0 4px;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.page-thumbnail {
  flex-shrink: 0;
}

.page-thumbnail img {
  width: 48px;
  height: 64px;
  object-fit: cover;
  background: #ddd;
  border-radius: 4px;
}

.placeholder-image {
  width: 48px;
  height: 64px;
  background: #ddd;
  border-radius: 4px;
}

.page-meta {
  font-size: 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
  min-width: 0;
}

.page-name {
  font-weight: 500;
  color: #111;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.page-info {
  color: #6b7280;
  font-size: 11px;
  margin-bottom: 4px;
}

.status-row {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

</style>