<template>
  <div
    :class="['page-item', { active: isActive, dragging: isDragging, selected: isSelected }]"
    @click="handleClick"
    @mouseenter="isPageHovered = true"
    @mouseleave="isPageHovered = false"
  >
    <div class="drag-handle">
      ⋮⋮
    </div>
    <NCheckbox
      :checked="isSelected"
      size="small"
      class="page-checkbox"
      @update:checked="handleCheckboxChange"
      @click.stop
    />
    <NButton
      text
      size="tiny"
      circle
      :style="{
        position: 'absolute',
        top: '50%',
        right: '12px',
        transform: isDeleteHovered ? 'translateY(-50%) scale(1.1)' : 'translateY(-50%)',
        opacity: isPageHovered || isDeleteHovered ? 1 : 0,
        transition: 'all 0.2s ease',
        zIndex: 10
      }"
      title="Delete page"
      @click.stop="handleDelete"
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
    <div class="page-thumbnail">
      <transition name="fade">
        <img
          v-if="page.thumbnailData"
          :src="page.thumbnailData"
          alt=""
          class="thumbnail-img"
        >
        <div
          v-else
          class="status-placeholder"
          :class="page.status"
        >
          <div
            v-if="page.status === 'rendering' || page.status === 'pending_render'"
            class="shimmer"
          />
          <div class="placeholder-content">
            <span class="page-hint">{{ page.order + 1 }}</span>
            <div class="status-indicator">
              <n-spin
                v-if="page.status === 'rendering'"
                size="small"
              />
              <span
                v-else-if="page.status === 'pending_render'"
                class="pending-dot"
              >...</span>
              <span
                v-else-if="page.status === 'error'"
                class="error-sign"
              >!</span>
            </div>
            <span class="status-label">{{ getShortStatusText(page.status) }}</span>
          </div>
        </div>
      </transition>
    </div>
    <div class="page-meta">
      <div class="page-name">
        {{ page.fileName }}
      </div>
      <div class="page-info">
        {{ formatFileSize(page.fileSize) }}
      </div>
      <div class="status-row">
        <n-tag
          :type="getStatusType(page.status)"
          size="small"
        >
          OCR
        </n-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NTag, NCheckbox, NSpin, NIcon } from 'naive-ui'
import { TrashOutline } from '@vicons/ionicons5'
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

function handleCheckboxChange() {
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
  /* Layout & Box Model */
  width: auto; /* Allow it to shrink */
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  margin: 8px 16px 8px 0; /* Increased to 16px to clear scrollbar */
  padding: 8px 8px 8px 0; 
  
  /* Borders & Background */
  background: white;
  border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.06);
  border-left: 4px solid transparent; /* Active indicator space */
  
  /* Behavior */
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

/* Hover effect */
.page-item:hover {
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
  z-index: 1;
}

/* Active/Selected state */
.page-item.active,
.page-item.selected {
  background: #ffffff;
  border-left-color: #18A058; /* Highlight color */
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15); /* Soft blue shadow */
}

.page-item.active .page-name,
.page-item.selected .page-name {
  color: #3b82f6;
  font-weight: 600;
}

/* Dragging state */
.page-item.dragging {
  transform: rotate(2deg) scale(1.02);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  opacity: 0.95;
  background: #fafafa;
  cursor: grabbing;
}

/* Drag handle */
.drag-handle {
  display: flex;
  align-items: center;
  color: #d1d5db;
  font-size: 14px;
  cursor: grab;
  margin-left: 0; /* Reset margin */
  margin-right: 4px; 
  user-select: none;
  transition: color 0.2s;
  width: 12px; /* Narrower width */
  justify-content: center;
}

.page-item:hover .drag-handle {
  color: #9ca3af; /* Darker on hover */
}

.drag-handle:active {
  cursor: grabbing;
}

/* Thumbnail area */
.page-thumbnail {
  flex-shrink: 0;
  width: 48px;
  height: 64px;
  margin-right: 4px;
  position: relative;
  overflow: hidden;
  border-radius: 6px; /* Slightly softer corners */
  background: #f3f4f6;
  border: 1px solid rgba(0,0,0,0.05);
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}

.page-item:hover .thumbnail-img {
  transform: scale(1.05); /* Subtle zoom on hover */
}

/* Status Placeholder */
.status-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  background: #f9fafb;
}

.status-placeholder.rendering {
  background: #eff6ff;
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
  font-size: 9px; /* Slightly larger */
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
    rgba(255, 255, 255, 0.4) 50%,
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

/* Text Meta Info */
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
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
  padding-right: 24px; /* Space for delete button */
  font-size: 13px;
}

.page-info {
  color: #9ca3af;
  font-size: 11px;
  margin-bottom: 4px;
}

.status-row {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

/* Inputs */
.page-checkbox {
  flex-shrink: 0;
  margin: 0;
  margin-right: 8px; /* Gap to thumbnail */
  display: flex;
  align-items: center;
  /* Visual alignment tweak if needed specifically for NCheckbox */
  transform: translateX(-2px); 
}
</style>