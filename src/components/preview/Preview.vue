<template>
  <div class="preview">
    <div class="preview-header">
       <n-tabs
        v-model:value="currentView"
        type="segment"
        animated
        class="preview-tabs"
      >
        <n-tab-pane
          v-for="view in views"
          :key="view.key"
          :name="view.key"
          :tab="view.label"
        />
      </n-tabs>
      <div v-if="currentView !== 'md'" class="header-actions">
           <!-- Generic download button for binary outputs -->
           <n-button 
             size="small" 
             secondary 
             type="primary" 
             @click="downloadBinary(currentView)"
             :disabled="isBinaryLoading"
           >
             Download {{ currentView.toUpperCase() }}
           </n-button>
      </div>
      <div v-if="currentView === 'md'" class="header-actions">
           <n-switch v-model:value="mdViewMode" size="small" :round="false">
              <template #checked>Preview</template>
              <template #unchecked>Source</template>
           </n-switch>
           <n-button 
             size="small" 
             secondary 
             type="primary" 
             @click="handleDownloadMarkdown"
             :disabled="!mdContent || isLoadingMd"
           >
             Download MD
           </n-button>
      </div>
    </div>

    <div class="preview-content">
        <!-- Markdown View -->
        <div v-if="currentView === 'md'" class="markdown-wrapper">
             <n-spin v-if="isLoadingMd" description="Loading markdown..." />
             <template v-else>
               <div v-if="mdViewMode" class="markdown-render-area markdown-body" v-html="renderedMd"></div>
               <pre v-else class="markdown-preview">{{ mdContent || 'No markdown content available' }}</pre>
             </template>
        </div>

        <!-- Word (DOCX) View -->
        <div v-else-if="currentView === 'docx'" class="docx-wrapper">
            <n-spin v-if="isBinaryLoading" description="Loading DOCX..." />
            <n-empty v-else-if="!hasBinary" description="DOCX not generated yet" />
            <div v-else class="docx-render-area">
                <div ref="wordPreviewContainer" class="word-container"></div>
                <div class="docx-footer">
                  <n-button type="primary" ghost @click="downloadBinary('docx')">Download DOCX</n-button>
                </div>
            </div>
        </div>

        <!-- PDF View -->
        <div v-else-if="currentView === 'pdf'" class="binary-preview">
            <n-spin v-if="isBinaryLoading" description="Checking PDF status..." />
            <n-empty v-else-if="!hasBinary" description="Sandwich PDF not generated yet" />
            <div v-else class="download-info">
                <div class="file-icon">📄</div>
                <div class="file-name">{{ props.currentPage?.fileName.replace(/\.[^/.]+$/, "") }}.pdf</div>
                <n-button type="primary" @click="downloadBinary('pdf')">Download Searchable PDF</n-button>
            </div>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { NTabs, NTabPane, NEmpty, NButton, NSpin, NSwitch } from 'naive-ui'
import { renderAsync } from 'docx-preview'
import MarkdownIt from 'markdown-it'
import { db } from '@/db'
import { uiLogger } from '@/utils/logger'

import type { Page } from '@/stores/pages'

const props = defineProps<{
  currentPage?: Page | null
}>()

const currentView = ref<'md' | 'docx' | 'pdf'>('md')
const mdContent = ref<string>('')
const isLoadingMd = ref(false)
const isBinaryLoading = ref(false)
const hasBinary = ref(false)
const wordPreviewContainer = ref<HTMLElement | null>(null)
const docxBlob = ref<Blob | null>(null)
const mdViewMode = ref<boolean>(true) // true for preview, false for source
const renderedMd = ref<string>('')
const mdRenderer = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true
})

// Custom render rule or post-process for scan2doc-img:
// We'll use a simple regex replacement for now as it's efficient for this use case
const processMarkdownImages = async (markdown: string): Promise<string> => {
    // Regex to find ![alt](scan2doc-img:ID)
    const regex = /!\[(.*?)\]\(scan2doc-img:([a-zA-Z0-9_-]+)\)/g
    let match
    let processed = markdown
    
    while ((match = regex.exec(markdown)) !== null) {
        const [fullMatch, alt, imageId] = match
        if (!imageId) continue
        
        try {
            const image = await db.getPageExtractedImage(imageId)
            if (image) {
                // Ensure Blob
                 let blob: Blob
                 if (image.blob instanceof Blob) {
                     blob = image.blob
                 } else {
                     blob = new Blob([image.blob], { type: 'image/png' })
                 }
                 const url = URL.createObjectURL(blob)
                 
                 // Simpler: Replace protocol in string
                 // Note: if multiple same images exist, this simple replace might fetch multiple times or replace all at once?
                 // But replacing by full match string is safer if alt text differs, 
                 // but here imageId is what matters. 
                 // Actually replace only the first occurrence or use split/join? 
                 // replace(string, string) only replaces first occurrence. 
                 // We are iterating via regex.exec, so we should be careful.
                 // Ideally we should build a new string.
                 
                 // Let's use string replacement for the exact match we just found.
                 const replacement = `![${alt}](${url})`
                 processed = processed.replace(fullMatch, replacement)
                 
                 // Add to cleanup list
                 previewObjectUrls.push(url)
            }
        } catch (e) {
            console.error('Failed to load image for MD preview', imageId, e)
        }
    }
    return processed
}
const previewObjectUrls: string[] = []

const views = [
  { key: 'md' as const, label: 'Markdown' },
  { key: 'docx' as const, label: 'Word' },
  { key: 'pdf' as const, label: 'PDF' }
]

// Watch for page change or status change or view change
watch(
  [() => props.currentPage?.id, () => props.currentPage?.status, currentView],
  async ([newPageId, newStatus, newView], [oldPageId, oldStatus, oldView]) => {
    if (!newPageId) {
       mdContent.value = ''
       hasBinary.value = false
       return
    }

    if (newView === 'md') {
        if (newPageId !== oldPageId || newStatus !== oldStatus || oldView !== 'md') {
            await loadMarkdown(newPageId)
        }
    } else if (newView === 'docx' || newView === 'pdf') {
        if (newPageId !== oldPageId || newStatus !== oldStatus || oldView !== newView) {
            await checkBinaryStatus(newPageId, newView)
        }
    }
  },
  { immediate: true }
)

async function checkBinaryStatus(pageId: string, type: 'docx' | 'pdf') {
    isBinaryLoading.value = true
    docxBlob.value = null
    try {
        const blob = type === 'docx' 
            ? await db.getPageDOCX(pageId) 
            : await db.getPagePDF(pageId)
        
        hasBinary.value = !!blob
        
        if (type === 'docx' && blob) {
            docxBlob.value = blob
            // Using a small delay to ensure DOM is ready and initialized
            setTimeout(async () => {
                await renderDocx()
            }, 100)
        }
    } catch (error) {
        uiLogger.error(`Failed to check binary status for ${type}`, error)
        hasBinary.value = false
    } finally {
        isBinaryLoading.value = false
    }
}

async function renderDocx() {
  if (!wordPreviewContainer.value || !docxBlob.value) return
  try {
    // Clear previous content
    wordPreviewContainer.value.innerHTML = ''
    
    // Some libraries behave better with ArrayBuffer than Blob
    const arrayBuffer = await docxBlob.value.arrayBuffer()
    
    await renderAsync(arrayBuffer, wordPreviewContainer.value, undefined, {
        className: 'docx-preview-output',
        inWrapper: false,
        ignoreHeight: false,
        ignoreWidth: false,
        breakPages: true
    })
  } catch (error) {
    uiLogger.error('[Preview] Failed to render DOCX', error)
  }
}

async function loadMarkdown(pageId: string) {
    isLoadingMd.value = true
    try {
        const record = await db.getPageMarkdown(pageId)
        if (record) {
            mdContent.value = record.content
            const processedMd = await processMarkdownImages(record.content)
            renderedMd.value = mdRenderer.render(processedMd)
        } else {
            // Fallback to OCR text if no markdown yet?
            // Actually OCR text is in page object, but let's stick to DB or Page object
             // Page object has ocrText.
             mdContent.value = props.currentPage?.ocrText || ''
             renderedMd.value = mdRenderer.render(mdContent.value)
        }
    } catch (error) {
        uiLogger.error('Failed to load markdown', error)
        mdContent.value = 'Failed to load content.'
    } finally {
        isLoadingMd.value = false
    }
}

function handleDownloadMarkdown() {
    if (!mdContent.value || !props.currentPage) return
    const blob = new Blob([mdContent.value], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Use original filename base + .md
    const baseName = props.currentPage.fileName.replace(/\.[^/.]+$/, "")
    const pageNum = props.currentPage.pageNumber || 1
    a.download = `${baseName}_page${pageNum}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

async function downloadBinary(type: 'docx' | 'pdf' | 'md') {
    if (type === 'md') {
        handleDownloadMarkdown()
        return
    }

    if (!props.currentPage) return
    const pageId = props.currentPage.id!
    
    try {
        const blob = type === 'docx' 
            ? await db.getPageDOCX(pageId) 
            : await db.getPagePDF(pageId)
            
        if (!blob) return

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const baseName = props.currentPage.fileName.replace(/\.[^/.]+$/, "")
        const ext = type === 'docx' ? 'docx' : 'pdf'
        a.download = `${baseName}.${ext}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    } catch (error) {
        uiLogger.error(`Failed to download ${type}`, error)
    }
}

onUnmounted(() => {
  // Cleanup MD preview images
  previewObjectUrls.forEach(url => URL.revokeObjectURL(url))
  previewObjectUrls.length = 0
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

.image-wrapper {
  max-width: 100%;
  max-height: 100%;
  display: flex;
  justify-content: center;
}

.preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
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

.binary-preview {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.docx-wrapper {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.docx-render-area {
  flex: 1;
  overflow: auto;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.word-container {
  background: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-height: 100%;
  width: 100%;
  max-width: 800px;
}

.docx-footer {
  margin-top: 16px;
  padding-bottom: 20px;
}

/* Deep selector for docx-preview generated content */
:deep(.docx-preview-output) {
  padding: 40px !important;
  background: white !important;
  margin: 0 auto !important;
}

.download-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
  background: #f9fafb;
  border-radius: 12px;
  border: 1px dashed #d1d5db;
}

.file-icon {
  font-size: 64px;
}

.file-name {
  font-weight: 500;
  color: #374151;
  font-size: 16px;
}

.markdown-render-area {
  padding: 24px;
  background: white;
  border-radius: 6px;
  /* Minimal github-like styles */
  font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: #24292f;
}

.markdown-render-area :deep(h1) {
  padding-bottom: 0.3em;
  font-size: 2em;
  border-bottom: 1px solid #d0d7de;
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
}

.markdown-render-area :deep(h2) {
  padding-bottom: 0.3em;
  font-size: 1.5em;
  border-bottom: 1px solid #d0d7de;
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
}

.markdown-render-area :deep(p) {
    margin-top: 0;
    margin-bottom: 16px;
}

.markdown-render-area :deep(img) {
    max-width: 100%;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border-radius: 4px;
    margin: 10px 0;
}

.markdown-render-area :deep(ul), .markdown-render-area :deep(ol) {
    padding-left: 2em;
    margin-bottom: 16px;
}
</style>