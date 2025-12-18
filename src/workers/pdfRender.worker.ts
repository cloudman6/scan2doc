import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString()
  
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
  imageData: string  // base64 image data
  width: number
  height: number
  pageNumber: number
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
      scale = 2.0,  // Higher scale for better quality
      imageFormat = 'png',
      quality = 0.9
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

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfData),
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.449/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.449/standard_fonts/', 
      disableWorker: true
    })

    const pdfDocument = await loadingTask.promise

    // Get page
    const page = await pdfDocument.getPage(pageNumber)

    // Calculate viewport with scale
    const viewport = page.getViewport({ scale })

    // Create canvas
    const canvas = new OffscreenCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')!

    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise

    // Convert canvas to base64 using convertToBlob (correct method for OffscreenCanvas)
    const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png'

    // Create a blob from the OffscreenCanvas
    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality: imageFormat === 'jpeg' ? quality : undefined
    })

    // Convert blob to base64
    const imageData = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })

    // Send result back to main thread - ensure pageId is properly set
    const response: PDFRenderResult = {
      pageId: pageId!, // We validated this above
      imageData, // base64 string
      pageNumber: pageNumber!, // We validated this above
      width: viewport.width,
      height: viewport.height
    }

    self.postMessage(response)

  } catch (error) {
    console.error('PDF rendering error:', error)

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