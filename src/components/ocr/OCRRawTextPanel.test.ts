import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import OCRRawTextPanel from './OCRRawTextPanel.vue'

// Mock Naive UI message
const messageMock = {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
}

vi.mock('naive-ui', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual as any,
        useMessage: () => messageMock
    }
})

describe('OCRRawTextPanel.vue', () => {
    const defaultProps = {
        text: 'Sample OCR Text'
    }

    // Mock navigator.clipboard
    const writeTextMock = vi.fn()
    const originalClipboard = navigator.clipboard

    beforeEach(() => {
        vi.clearAllMocks()
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: writeTextMock
            },
            writable: true
        })
    })

    afterEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
            value: originalClipboard,
            writable: true
        })
    })

    it('renders correctly', () => {
        const wrapper = mount(OCRRawTextPanel, {
            props: defaultProps
        })
        expect(wrapper.find('.ocr-raw-text-panel').exists()).toBe(true)
        expect(wrapper.find('.title').text()).toBe('OCR Raw Result')
    })

    it('toggles expand/collapse', async () => {
        const wrapper = mount(OCRRawTextPanel, {
            props: defaultProps
        })

        // Default is expanded
        expect(wrapper.vm.expanded).toBe(true)

        // Convert to any to access private/internal elements if needed, 
        // but better to interact via UI
        await wrapper.find('.panel-header').trigger('click')
        expect(wrapper.vm.expanded).toBe(false)

        await wrapper.find('.panel-header').trigger('click')
        expect(wrapper.vm.expanded).toBe(true)
    })

    it('copies text to clipboard using navigator API', async () => {
        writeTextMock.mockResolvedValue(undefined)

        const wrapper = mount(OCRRawTextPanel, {
            props: defaultProps
        })

        const copyButton = wrapper.find('.panel-header button') // Finding the copy button
        await copyButton.trigger('click')

        expect(writeTextMock).toHaveBeenCalledWith('Sample OCR Text')
        expect(messageMock.success).toHaveBeenCalledWith('Copied to clipboard')
    })

    it('handles empty text copy gracefully', async () => {
        const wrapper = mount(OCRRawTextPanel, {
            props: { text: '' }
        })

        const copyButton = wrapper.find('.panel-header button')
        await copyButton.trigger('click')

        expect(writeTextMock).not.toHaveBeenCalled()
    })

    it('handles copy error', async () => {
        writeTextMock.mockRejectedValue(new Error('Copy failed'))

        const wrapper = mount(OCRRawTextPanel, {
            props: defaultProps
        })

        const copyButton = wrapper.find('.panel-header button')
        await copyButton.trigger('click')

        expect(writeTextMock).toHaveBeenCalled()
        expect(messageMock.error).toHaveBeenCalledWith('Failed to copy text')
    })

    it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
        // Mock clipboard unavailable
        Object.defineProperty(navigator, 'clipboard', {
            value: undefined,
            writable: true
        })

        const execCommandMock = vi.fn().mockReturnValue(true)
        document.execCommand = execCommandMock

        const wrapper = mount(OCRRawTextPanel, {
            props: defaultProps
        })

        const copyButton = wrapper.find('.panel-header button')
        await copyButton.trigger('click')

        expect(execCommandMock).toHaveBeenCalledWith('copy')
        expect(messageMock.success).toHaveBeenCalledWith('Copied to clipboard')
    })
})
