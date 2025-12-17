<template>
  <div class="preview">
    <div class="preview-tabs">
      <button
        v-for="view in views"
        :key="view.key"
        :class="{ active: currentView === view.key }"
        @click="switchView(view.key)"
      >
        {{ view.label }}
      </button>
    </div>
    <div class="preview-content">
      <div v-if="currentView === 'image'" class="image-preview">
        <div class="placeholder">Image Preview</div>
      </div>
      <pre v-else-if="currentView === 'md'" class="markdown-preview">{{ currentPageContent?.md || 'No markdown content available' }}</pre>
      <div v-else-if="currentView === 'html'" class="html-preview" v-html="currentPageContent?.html || '<p>No HTML content available</p>'"></div>
      <div v-else class="placeholder">
        Select a page to preview
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'

interface Page {
  id: number
  md?: string
  html?: string
  thumbnail?: string
  ocrStatus: 'pending' | 'processing' | 'done' | 'error'
  mdStatus: 'pending' | 'processing' | 'done' | 'error'
}

const props = defineProps<{
  currentPage?: Page | null
}>()

const currentView = ref<'image' | 'md' | 'html'>('image')

const views = [
  { key: 'image' as const, label: 'Image' },
  { key: 'md' as const, label: 'Markdown' },
  { key: 'html' as const, label: 'HTML' }
]

const currentPageContent = computed(() => props.currentPage)

function switchView(view: 'image' | 'md' | 'html') {
  currentView.value = view
}

// Auto-switch to first available content when page changes
watchEffect(() => {
  if (props.currentPage) {
    if (currentView.value === 'image' && !props.currentPage.thumbnail) {
      if (props.currentPage.md) {
        currentView.value = 'md'
      } else if (props.currentPage.html) {
        currentView.value = 'html'
      }
    }
  }
})
</script>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.preview-tabs {
  background: white;
  padding: 8px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  gap: 6px;
}

.preview-tabs button {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
}

.preview-tabs button.active {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.preview-tabs button:hover {
  background: #f9fafb;
}

.preview-content {
  flex: 1;
  padding: 16px;
  overflow: auto;
  background: white;
}

.image-preview {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: #f9fafb;
  border: 2px dashed #e5e7eb;
  border-radius: 8px;
  color: #6b7280;
  font-size: 14px;
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