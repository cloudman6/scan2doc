import * as pdfjsLib from 'pdfjs-dist'
import { CMAP_URL, CMAP_PACKED } from '../services/pdf/config'
import { workerLogger } from '@/services/logger'

// Configure PDF.js worker
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface PDFRenderMessage {
  type: 'render'
  payload: {
    pdfData: ArrayBuffer
    pageId: string
    pageNumber: number
    scale?: number
    imageFormat?: 'png' | 'jpeg'
    quality?: number
  }
}

interface PDFRenderResult {
  pageId: string
  imageBlob: Blob // Directly return binary data
  width: number
  height: number
  pageNumber: number
  fileSize: number
}

interface PDFErrorMessage {
  pageId: string
  error: string
}

type WorkerMessage = PDFRenderMessage
type WorkerResponse = PDFRenderResult | { type: 'error'; payload: PDFErrorMessage }

// Worker implementation
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data

  if (type !== 'render') {
    return
  }

  let pageId: string | undefined
  let pageNumber: number | undefined

  try {
    const {
      pdfData,
      pageId: inputPageId,
      pageNumber: inputPageNumber,
      scale = 2.5,  // Higher scale for better text quality
      imageFormat = 'png',
      quality = 0.95  // Higher quality for better text rendering
    } = payload

    // Store values for error handling
    pageId = inputPageId
    pageNumber = inputPageNumber

    // Validate inputs
    if (!pageId) {
      throw new Error('pageId is required')
    }
    if (!pageNumber || pageNumber < 1) {
      throw new Error(`Invalid pageNumber: ${pageNumber}`)
    }
    if (!pdfData || pdfData.byteLength === 0) {
      throw new Error('pdfData is empty or invalid')
    }

    // Load PDF document with enhanced font configuration
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfData),
      cMapUrl: CMAP_URL,
      cMapPacked: CMAP_PACKED,
      // Enable font fallback for better text rendering
      useSystemFonts: true,
      // Increase font rendering quality
      fontExtraProperties: true,
      // Enable enhanced font rendering
      verbosity: 0 // Reduce font loading warnings
    })

    const pdfDocument = await loadingTask.promise

    // Get page
    const page = await pdfDocument.getPage(pageNumber)

    // Calculate viewport with scale
    const viewport = page.getViewport({ scale })

    // Create canvas
    const canvas = new OffscreenCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d', {
      // Enable better text rendering settings
      alpha: false,  // Disable alpha channel for better text clarity
      desynchronized: true,  // Improve rendering performance
      willReadFrequently: false
    })!

    // Set rendering context properties for better text quality
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'

    // Enhanced text rendering with font fallback
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      // Enable render for better text quality
      intent: 'print',  // Use print intent for higher quality rendering
      // Enhanced text rendering options
      renderInteractiveForms: true,
      // Enable better text rendering for CJK characters
      textLayer: true
    }

    try {
      await (page.render(renderContext as any).promise)
    } catch (renderError) {
      workerLogger.warn('Enhanced rendering failed, falling back to standard rendering:', renderError)
      // Fallback to basic rendering if enhanced fails
      await (page.render({
        canvasContext: context,
        viewport: viewport,
        intent: 'print'
      } as any).promise)
    }

    // Convert canvas to base64 using convertToBlob (correct method for OffscreenCanvas)
    const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png'

    // Create a blob from the OffscreenCanvas
    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality: imageFormat === 'jpeg' ? quality : undefined
    })

    // Clean up resources to prevent memory leaks
    page.cleanup()
    await pdfDocument.destroy()

    // Send result back to main thread
    const response: PDFRenderResult = {
      pageId: pageId!,
      imageBlob: blob, // Send Blob directly
      pageNumber: pageNumber!,
      width: viewport.width,
      height: viewport.height,
      fileSize: blob.size
    }

    self.postMessage(response)

  } catch (error) {
    workerLogger.error('PDF rendering error:', error)

    // Ensure we have pageId for error response
    const errorPageId = pageId || payload?.pageId || 'unknown'

    const errorResponse: WorkerResponse = {
      type: 'error',
      payload: {
        pageId: errorPageId,
        error: error instanceof Error ? error.message : 'Unknown rendering error'
      }
    }

    self.postMessage(errorResponse)
  }
})