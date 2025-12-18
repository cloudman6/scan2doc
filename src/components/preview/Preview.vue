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
            <n-empty description="Image Preview" />
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
import { ref, computed, watchEffect } from 'vue'
import { NTabs, NTabPane, NEmpty } from 'naive-ui'

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