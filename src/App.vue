<template>
  <div
    class="app-container"
    @drop="handleDrop"
    @dragover="handleDragOver"
  >
    <!-- Header -->
    <header class="app-header">
      <button class="add-btn" @click="handleFileAdd">Add File</button>
      <strong class="filename">{{ currentFileName }}</strong>
      <span class="save-status" style="color:#16a34a;">✔ Saved locally</span>
      <div class="spacer"></div>
      <button class="export-btn primary">Export Markdown</button>
    </header>

    <!-- Main Content -->
    <main class="app-main">
      <!-- Page List -->
      <aside class="page-list-container">
        <PageList ref="pageListRef" :pages="pagesStore.pages" @page-selected="handlePageSelected" />
      </aside>

      <!-- Page Viewer (formerly Inspector) -->
      <section class="page-viewer-container">
        <PageViewer :current-page="currentPage" />
      </section>

      <!-- Preview -->
      <aside class="preview-container">
        <Preview :current-page="currentPage" />
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect, onMounted } from 'vue'
import { usePagesStore } from './stores/pages'
import type { Page } from './stores/pages'
import PageList from './components/page-list/PageList.vue'
import Preview from './components/preview/Preview.vue'
import PageViewer from './components/page-viewer/PageViewer.vue'

const pagesStore = usePagesStore()

const currentFileName = ref('No file added')
const currentPage = ref(pagesStore.pages[0] || null)
const pageListRef = ref()

function handlePageSelected(page: Page) {
  currentPage.value = page
}

// Handle file add
async function handleFileAdd() {
  try {
    const result = await pagesStore.addFiles()

    if (result.success && result.pages.length > 0) {
      // Update current file name to show the first added file
      currentFileName.value = result.pages.length === 1
        ? result.pages[0].fileName
        : `${result.pages.length} files added`

      // Select the first added page
      if (result.pages.length > 0) {
        handlePageSelected(result.pages[0])
      }
    } else if (result.error) {
      console.error('Add error:', result.error)
      // You could show a toast notification here
      alert(`Add failed: ${result.error}`)
    }
  } catch (error) {
    console.error('Add failed:', error)
    alert('Add failed. Please try again.')
  }
}

// Handle drag and drop
async function handleDrop(event: DragEvent) {
  event.preventDefault()
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length > 0) {
    const result = await pagesStore.addFiles(files)
    if (result.success && result.pages.length > 0) {
      currentFileName.value = result.pages.length === 1
        ? result.pages[0].fileName
        : `${result.pages.length} files added`
      if (result.pages.length > 0) {
        handlePageSelected(result.pages[0])
      }
    }
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}


// Watch for page list updates and sync current page
watchEffect(() => {
  if (pageListRef.value && pageListRef.value.currentPage && !currentPage.value) {
    currentPage.value = pageListRef.value.currentPage
  }
})

// Load pages from database on mount
onMounted(async () => {
  await pagesStore.loadPagesFromDB()
  if (pagesStore.pages.length > 0 && !currentPage.value) {
    currentPage.value = pagesStore.pages[0]
    currentFileName.value = pagesStore.pages.length === 1
      ? pagesStore.pages[0].fileName
      : `${pagesStore.pages.length} files`
  }
})
</script>

<style>
/* ====== Base ====== */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, system-ui, sans-serif;
  background: #f6f7fb;
  color: #111;
}

/* ====== Layout ====== */
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  gap: 12px;
}

.app-header .spacer {
  flex: 1;
}

.app-main {
  display: grid;
  grid-template-columns: 260px 1fr 320px;
  height: calc(100vh - 56px);
}

.page-list-container {
  padding: 8px;
  overflow-y: auto;
  border-right: 1px solid #e5e7eb;
  background: white;
}

.page-viewer-container {
  display: flex;
  flex-direction: column;
  background: white;
  border-right: 1px solid #e5e7eb;
}

.preview-container {
  padding: 16px;
  border-left: 1px solid #e5e7eb;
  background: #fafafa;
}

/* ====== Buttons ====== */
button {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
}

button.primary {
  background: #6366f1;
  color: white;
  border: none;
}

.add-btn, .export-btn {
  font-size: 14px;
}

.filename {
  font-size: 14px;
}

.save-status {
  font-size: 14px;
}
</style>

