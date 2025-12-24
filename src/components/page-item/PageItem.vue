<template>
  <div
    :class="['page-item', { active: isActive, dragging: isDragging, selected: isSelected }]"
    @click="handleClick"
    @mouseenter="isPageHovered = true"
    @mouseleave="isPageHovered = false"
  >
    <div class="drag-handle">⋮⋮</div>
    <NCheckbox
      :checked="isSelected"
      @update:checked="handleCheckboxChange"
      @click.stop
      size="small"
      class="page-checkbox"
    />
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
      <transition name="fade">
        <img v-if="page.thumbnailData" :src="page.thumbnailData" alt="" class="thumbnail-img" />
        <div v-else class="status-placeholder" :class="page.status">
          <div class="shimmer" v-if="page.status === 'rendering' || page.status === 'pending_render'"></div>
          <div class="placeholder-content">
            <span class="page-hint">{{ page.order + 1 }}</span>
            <div class="status-indicator">
              <n-spin v-if="page.status === 'rendering'" size="small" />
              <span v-else-if="page.status === 'pending_render'" class="pending-dot">...</span>
              <span v-else-if="page.status === 'error'" class="error-sign">!</span>
            </div>
            <span class="status-label">{{ getShortStatusText(page.status) }}</span>
          </div>
        </div>
      </transition>
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
import { NButton, NTag, NCheckbox, NSpin } from 'naive-ui'
import { usePagesStore } from '@/stores/pages'
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

// Store and reactive state
const pagesStore = usePagesStore()
const isDeleteHovered = ref(false)
const isPageHovered = ref(false)

// Computed property for selection state
const isSelected = computed(() =>
  pagesStore.selectedPageIds.includes(props.page.id)
)

function handleClick() {
  emit('click', props.page)
}

function handleDelete() {
  emit('delete', props.page)
}

function handleCheckboxChange(checked: boolean) {
  pagesStore.togglePageSelection(props.page.id)
}

function getShortStatusText(status: Page['status']): string {
  switch (status) {
    case 'pending_render': return 'Queued'
    case 'rendering': return 'Rendering'
    case 'error': return 'Error'
    default: return ''
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
}



function getStatusType(status: Page['status']): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'completed':
    case 'ready':
      return 'success'
    case 'rendering':
    case 'recognizing':
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
  padding: 8px 8px 8px 0;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  border: 0px solid transparent;
  transition: all 0.2s ease;
  margin-right: 13px;
  user-select: none; /* Prevent text selection during drag */
  position: relative;
  align-items: center;
}

.page-item:hover {
  background: #F5F5F5;
}

.page-item.active {
  background: #D3E4F8;
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
  padding: 0;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.page-thumbnail {
  flex-shrink: 0;
  width: 48px;
  height: 64px;
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  background: #f3f4f6;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.status-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  background: #f3f4f6;
}

.status-placeholder.pending_render {
  background: #f3f4f6;
}

.status-placeholder.rendering {
  background: #ebf5ff;
}

.status-placeholder.error {
  background: #fef2f2;
  color: #ef4444;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  z-index: 1;
}

.page-hint {
  font-size: 14px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.2);
  line-height: 1;
}

.status-indicator {
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
  font-weight: 600;
}

.status-placeholder.rendering .status-label {
  color: #3b82f6;
}

.pending-dot {
  font-weight: bold;
  letter-spacing: 1px;
  color: #9ca3af;
}

/* Shimmer Animation */
.shimmer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.6) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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

.page-checkbox {
  flex-shrink: 0;
  margin: 0;
  display: flex;
  align-items: center;
  width: 15px;
  height: 15px;
}

.page-item.selected {
  border-color: #6366f1;
  background: #D3E4F8;
}

</style>