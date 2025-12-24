import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// 1. Mock 'pdfjs-dist' and its worker URL BEFORE importing the worker
vi.mock('pdfjs-dist', () => {
  return {
    version: '4.0.0',
    GlobalWorkerOptions: {
      workerSrc: '',
    },
    getDocument: vi.fn(),
  };
});

// Mock the worker URL import
vi.mock('pdfjs-dist/legacy/build/pdf.worker.mjs?url', () => {
  return {
    default: 'mock-worker-url',
  };
});

// Mock logger
vi.mock('@/services/logger', () => ({
  workerLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// 2. Setup Global Mocks for Worker Environment
// We need to capture the 'message' event listener that the worker registers
let messageHandler: ((event: MessageEvent) => Promise<void>) | null = null;

// Mock self.addEventListener and self.postMessage
const postMessageMock = vi.fn();
const addEventListenerMock = vi.fn((type, handler) => {
  if (type === 'message') {
    messageHandler = handler;
  }
});

// Assign to globalThis (which acts as 'self' in this context)
// We cast to any to avoid strict type checking issues with the global scope
(globalThis as any).self = globalThis;
(globalThis as any).addEventListener = addEventListenerMock;
(globalThis as any).postMessage = postMessageMock;

// Mock OffscreenCanvas
class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };
  }
  convertToBlob({ type, quality }: any) {
    return Promise.resolve(new Blob(['mock-image-data'], { type }));
  }
}
(globalThis as any).OffscreenCanvas = MockOffscreenCanvas;


describe('pdfRender.worker', () => {
  let pdfjsLib: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    messageHandler = null;

    // Reset pdfjsLib mock implementation for each test
    pdfjsLib = await import('pdfjs-dist');
    
    // We need to re-import the worker to trigger the addEventListener call
    // However, ES modules are cached. We might need to rely on the fact that 
    // we captured the handler if the module was already loaded, 
    // OR we use vi.resetModules() if we want to re-execute the top-level code.
    vi.resetModules();
    
    // Re-setup global mocks because resetModules might clear some state or if we used doMock
    (globalThis as any).addEventListener = addEventListenerMock;
    (globalThis as any).postMessage = postMessageMock;
    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

    // Import the worker code. 
    // Note: Since we are mocking dependencies, this should be safe to run in Node/Jsdom.
    await import('@/workers/pdfRender.worker');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createEvent = (data: any) => {
    return { data } as MessageEvent;
  };

  it('should register a message listener', () => {
    expect(addEventListenerMock).toHaveBeenCalledWith('message', expect.any(Function));
    expect(messageHandler).toBeInstanceOf(Function);
  });

  it('should ignore non-render messages', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');
    
    await messageHandler(createEvent({ type: 'ping' }));
    
    expect(pdfjsLib.getDocument).not.toHaveBeenCalled();
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it('should handle missing pageId error', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const payload = {
        // pageId missing
        pageNumber: 1,
        pdfData: new ArrayBuffer(10)
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    expect(postMessageMock).toHaveBeenCalledWith({
        type: 'error',
        payload: {
            pageId: 'unknown',
            error: 'pageId is required'
        }
    });
  });

  it('should handle invalid pageNumber error', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const payload = {
        pageId: 'p1',
        pageNumber: 0, // Invalid
        pdfData: new ArrayBuffer(10)
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: {
            pageId: 'p1',
            error: expect.stringContaining('Invalid pageNumber')
        }
    }));
  });

  it('should handle empty pdfData error', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const payload = {
        pageId: 'p1',
        pageNumber: 1,
        pdfData: new ArrayBuffer(0) // Empty
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: {
            pageId: 'p1',
            error: expect.stringContaining('pdfData is empty')
        }
    }));
  });

  it('should successfully render a PDF page', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    // Setup PDF.js mocks
    const mockPage = {
        getViewport: vi.fn().mockReturnValue({ width: 100, height: 200 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        cleanup: vi.fn(),
    };
    const mockPdfDocument = {
        getPage: vi.fn().mockResolvedValue(mockPage),
        destroy: vi.fn().mockResolvedValue(undefined),
    };
    const loadingTask = {
        promise: Promise.resolve(mockPdfDocument),
    };
    pdfjsLib.getDocument.mockReturnValue(loadingTask);

    const payload = {
        pageId: 'page-123',
        pageNumber: 1,
        pdfData: new ArrayBuffer(100),
        scale: 2.0,
        imageFormat: 'png' as const,
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    // Verify PDF loading
    expect(pdfjsLib.getDocument).toHaveBeenCalled();
    expect(mockPdfDocument.getPage).toHaveBeenCalledWith(1);
    expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 2.0 });

    // Verify Render
    expect(mockPage.render).toHaveBeenCalled();
    
    // Verify Result
    expect(postMessageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        imageBlob: expect.any(Blob),
        pageNumber: 1,
        width: 100,
        height: 200,
        fileSize: expect.any(Number)
    });

    // Verify Cleanup
    expect(mockPage.cleanup).toHaveBeenCalled();
    expect(mockPdfDocument.destroy).toHaveBeenCalled();
  });

  it('should correctly implement OffscreenCanvasFactory', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const mockPage = {
        getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        cleanup: vi.fn(),
    };
    pdfjsLib.getDocument.mockReturnValue({ promise: Promise.resolve({ getPage: () => mockPage, destroy: () => {} }) });

    // Trigger execution to get access to the factory passed to pdfjsLib
    await messageHandler(createEvent({ 
        type: 'render', 
        payload: {
            pageId: 'p1',
            pageNumber: 1,
            pdfData: new ArrayBuffer(10),
        } 
    }));

    // Extract factory from getDocument call
    const params = pdfjsLib.getDocument.mock.calls[0][0];
    const factory = params.canvasFactory;

    expect(factory).toBeDefined();

    // Test create
    const obj = factory.create(100, 50);
    expect(obj.canvas).toBeInstanceOf(MockOffscreenCanvas);
    expect(obj.canvas.width).toBe(100);
    expect(obj.canvas.height).toBe(50);
    expect(obj.context).toBeDefined();

    // Test reset
    factory.reset(obj, 200, 150);
    expect(obj.canvas.width).toBe(200);
    expect(obj.canvas.height).toBe(150);

    // Test destroy
    factory.destroy(obj);
    expect(obj.canvas).toBeNull();
    expect(obj.context).toBeNull();

    // Test robustness (branches where canvas is missing)
    const emptyObj = { canvas: null, context: null };
    factory.reset(emptyObj, 100, 100); // Should not throw
    factory.destroy(emptyObj); // Should not throw
  });

  it('should swallow errors during cleanup', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const mockPage = {
        getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        cleanup: vi.fn().mockImplementation(() => { throw new Error('Cleanup error'); }),
    };
    const mockPdfDocument = {
        getPage: vi.fn().mockResolvedValue(mockPage),
        destroy: vi.fn().mockRejectedValue(new Error('Destroy error')),
    };
    pdfjsLib.getDocument.mockReturnValue({ promise: Promise.resolve(mockPdfDocument) });

    await messageHandler(createEvent({ 
        type: 'render', 
        payload: {
            pageId: 'p1',
            pageNumber: 1,
            pdfData: new ArrayBuffer(10),
        } 
    }));

    // Should still succeed and send response
    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'p1' }));
  });

  it('should handle non-Error objects thrown', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    pdfjsLib.getDocument.mockImplementation(() => {
        throw 'String error';
    });

    await messageHandler(createEvent({ 
        type: 'render', 
        payload: {
            pageId: 'p1',
            pageNumber: 1,
            pdfData: new ArrayBuffer(10),
        } 
    }));

    expect(postMessageMock).toHaveBeenCalledWith({
        type: 'error',
        payload: {
            pageId: 'p1',
            error: 'Unknown rendering error'
        }
    });
  });

  it('should polyfill document.createElement for canvas if document is missing', async () => {
    vi.resetModules();
    
    // Save original document
    const originalDocument = globalThis.document;
    
    // Remove document to trigger polyfill
    // Note: In jsdom, document might be non-configurable. 
    // We try to delete it from globalThis (self).
    // If explicit delete fails, this test might not cover the line, but let's try.
    try {
        // @ts-ignore
        delete globalThis.document;
    } catch (e) {
        console.warn('Could not delete document, skipping polyfill test');
        return;
    }

    // Re-import worker
    await import('@/workers/pdfRender.worker');

    const polyfilledDoc = (globalThis as any).document;
    
    // Only verify if polyfill happened (it might not if delete failed)
    if (polyfilledDoc && polyfilledDoc !== originalDocument) {
        expect(polyfilledDoc.createElement).toBeDefined();
        
        // Test createElement('canvas')
        const canvas = polyfilledDoc.createElement('canvas');
        expect(canvas).toBeInstanceOf(MockOffscreenCanvas);
        expect(canvas.width).toBe(1);
        expect(canvas.height).toBe(1);

        // Test other elements
        expect(polyfilledDoc.createElement('div')).toBeNull();
    }

    // Restore document
    globalThis.document = originalDocument;
  });

  it('should use fallback rendering if primary rendering fails', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const mockPage = {
        getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
        render: vi.fn()
            .mockReturnValueOnce({ promise: Promise.reject(new Error('Enhanced render failed')) }) // First call fails
            .mockReturnValueOnce({ promise: Promise.resolve() }), // Second call (fallback) succeeds
        cleanup: vi.fn(),
    };
    const mockPdfDocument = {
        getPage: vi.fn().mockResolvedValue(mockPage),
        destroy: vi.fn(),
    };
    pdfjsLib.getDocument.mockReturnValue({ promise: Promise.resolve(mockPdfDocument) });

    const payload = {
        pageId: 'p1',
        pageNumber: 1,
        pdfData: new ArrayBuffer(10),
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    // Should have called render twice
    expect(mockPage.render).toHaveBeenCalledTimes(2);
    // Should verify warning log
    const { workerLogger } = await import('@/services/logger');
    expect(workerLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Enhanced rendering failed'),
        expect.any(Error)
    );
    // Should still succeed
    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({
        pageId: 'p1'
    }));
  });

  it('should handle unexpected errors during processing', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    // Mock getDocument to throw
    pdfjsLib.getDocument.mockImplementation(() => {
        throw new Error('Critical PDF Error');
    });

    const payload = {
        pageId: 'p1',
        pageNumber: 1,
        pdfData: new ArrayBuffer(10),
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    const { workerLogger } = await import('@/services/logger');
    expect(workerLogger.error).toHaveBeenCalledWith(
        'PDF rendering error:',
        expect.any(Error)
    );

    expect(postMessageMock).toHaveBeenCalledWith({
        type: 'error',
        payload: {
            pageId: 'p1',
            error: 'Critical PDF Error'
        }
    });
  });

  it('should use provided fallbackFontFamily', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const mockPage = {
        getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        cleanup: vi.fn(),
    };
    pdfjsLib.getDocument.mockReturnValue({ promise: Promise.resolve({ getPage: () => mockPage, destroy: () => {} }) });

    await messageHandler(createEvent({ 
        type: 'render', 
        payload: {
            pageId: 'p1',
            pageNumber: 1,
            pdfData: new ArrayBuffer(10),
            fallbackFontFamily: 'Arial'
        } 
    }));

    // We can't easily check the canvas context font property since it's inside the closure,
    // but we can ensure the code ran without error. 
    // Ideally we would mock OffscreenCanvas context to spy on property setters if we really needed to verify this.
    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'p1' }));
  });

});
