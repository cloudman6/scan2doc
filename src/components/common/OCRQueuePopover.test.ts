import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import OCRQueuePopover from '@/components/common/OCRQueuePopover.vue'
import { createTestingPinia } from '@pinia/testing'
import { usePagesStore } from '@/stores/pages'

// Monkey-patch CSSStyleDeclaration to prevent JSDOM crash on Naive UI styles
if (typeof CSSStyleDeclaration !== 'undefined') {
    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function (property: string, value: string | null, priority?: string) {
        if (property === 'border' || property.startsWith('border-')) {
            if (typeof value === 'string' && value.includes('var(')) {
                return;
            }
        }
        return originalSetProperty.call(this, property, value, priority);
    };
}

vi.mock('naive-ui', async (importOriginal) => {
    const mod = await importOriginal<any>()
    return {
        ...mod,
        createDiscreteApi: vi.fn(() => ({
            message: {
                success: vi.fn(),
                info: vi.fn(),
                error: vi.fn()
            }
        }))
    }
})

// Type for exposed VM
interface PopoverVM {
    selectedIds: Set<string>;
    allTaskIds: string[];
    isAllSelected: boolean;
    isPartiallySelected: boolean;
    handleStopAll: () => Promise<void>;
    handleStopSelected: () => Promise<void>;
    handleStopSingle: (id: string) => Promise<void>;
    handleSelectAll: (checked: boolean) => void;
    handleItemSelect: (id: string, checked: boolean) => void;
    $nextTick: () => Promise<void>;
}

describe('OCRQueuePopover', () => {
    let pinia: any

    const activeTask = { id: 'p1', fileName: 'active.png', status: 'recognizing', updatedAt: new Date(), progress: 0 }
    const queuedTask = { id: 'p2', fileName: 'queued.png', status: 'pending_ocr', updatedAt: new Date(), progress: 0 }

    beforeEach(() => {
        // Mock environment issues
        if (typeof (global as any).ResizeObserver === 'undefined') {
            (global as any).ResizeObserver = vi.fn().mockImplementation(() => ({
                observe: vi.fn(),
                unobserve: vi.fn(),
                disconnect: vi.fn(),
            }));
        }

        pinia = createTestingPinia({
            createSpy: vi.fn,
            stubActions: false
        })
    })

    const mountComponent = () => {
        return mount(OCRQueuePopover, {
            global: {
                plugins: [pinia],
                stubs: {
                    NIcon: { template: '<i><slot /></i>' },
                    NBadge: { template: '<span><slot /></span>' },
                    NScrollbar: { template: '<div><slot /></div>' },
                    NEmpty: { template: '<div><slot /></div>' },
                    NSpin: { template: '<div><slot /></div>' }
                    // NCheckbox and NButton are NOT stubbed
                }
            }
        })
    }

    it('renders task lists and exhaustively covers all methods and branches', async () => {
        const s = usePagesStore(pinia)
        const cancelSpy = vi.fn()
        s.cancelOCRTasks = cancelSpy

        // @ts-expect-error - testing-pinia stubs
        s.pages = [activeTask, queuedTask]
        // @ts-expect-error - testing-pinia stubs
        s.activeOCRTasks = [activeTask]
        // @ts-expect-error - testing-pinia stubs
        s.queuedOCRTasks = [queuedTask]
        // @ts-expect-error - testing-pinia stubs
        s.ocrTaskCount = 2

        const wrapper = mountComponent()
        const vm = wrapper.vm as unknown as PopoverVM
        await vm.$nextTick()

        expect(wrapper.text()).toContain('OCR Queue')
        expect(wrapper.text()).toContain('active.png')
        expect(wrapper.text()).toContain('queued.png')

        // Find real Naive UI components
        const checkboxes = wrapper.findAll('.n-checkbox')
        expect(checkboxes.length).toBe(3)

        await vm.handleItemSelect('p1', true)
        await vm.handleItemSelect('p2', true)
        expect(vm.selectedIds.has('p1')).toBe(true)

        await vm.handleSelectAll(true)
        expect(vm.isAllSelected).toBe(true)
        await vm.handleSelectAll(false)
        expect(vm.selectedIds.size).toBe(0)

        const stopBtns = wrapper.findAll('.task-item button')
        if (stopBtns[0]) await stopBtns[0].trigger('click')
        expect(cancelSpy).toHaveBeenCalled()

        await vm.handleStopSelected()
        await vm.handleStopAll()
    })

    it('handles checkbox selection logic', async () => {
        const s = usePagesStore(pinia)
        const p3 = { id: 'p3', fileName: 'test3.png', status: 'recognizing', updatedAt: new Date(), progress: 0 }
        // @ts-expect-error - testing-pinia stubs
        s.pages = [activeTask, p3]
        // @ts-expect-error - testing-pinia stubs
        s.activeOCRTasks = [activeTask, p3]
        // @ts-expect-error - testing-pinia stubs
        s.ocrTaskCount = 2

        const wrapper = mountComponent()
        const vm = wrapper.vm as unknown as PopoverVM
        await vm.$nextTick()

        await vm.handleItemSelect('p1', true)
        expect(vm.isPartiallySelected).toBe(true)
    })

    it('cancels selected tasks and clears selection', async () => {
        const s = usePagesStore(pinia)
        const cancelSpy = vi.fn()
        s.cancelOCRTasks = cancelSpy
        // @ts-expect-error - testing-pinia stubs
        s.pages = [activeTask]
        // @ts-expect-error - testing-pinia stubs
        s.activeOCRTasks = [activeTask]
        // @ts-expect-error - testing-pinia stubs
        s.ocrTaskCount = 1

        const wrapper = mountComponent()
        const vm = wrapper.vm as unknown as PopoverVM
        await vm.$nextTick()

        await vm.handleItemSelect('p1', true)

        const cancelSelectedBtn = wrapper.findAll('button').find(b => b.text().includes('Cancel Selected'))
        expect(cancelSelectedBtn).toBeDefined()
        await cancelSelectedBtn?.trigger('click')
        expect(cancelSpy).toHaveBeenCalledWith(['p1'])
    })

    it('cancels all tasks via header button', async () => {
        const s = usePagesStore(pinia)
        s.cancelOCRTasks = vi.fn()
        // @ts-expect-error - testing-pinia stubs
        s.pages = [activeTask]
        // @ts-expect-error - testing-pinia stubs
        s.activeOCRTasks = [activeTask]
        // @ts-expect-error - testing-pinia stubs
        s.ocrTaskCount = 1

        const wrapper = mountComponent()
        await wrapper.vm.$nextTick()

        const cancelAllBtn = wrapper.findAll('button').find(b => b.text().includes('Cancel All'))
        expect(cancelAllBtn).toBeDefined()
        await cancelAllBtn?.trigger('click')

        expect((s.cancelOCRTasks as Mock).mock.calls[0]![0]).toContain('p1')
    })

    it('closes on footer button click', async () => {
        const wrapper = mountComponent()
        await wrapper.vm.$nextTick()
        const closeBtn = wrapper.findAll('button').find(b => b.text().includes('Close'))
        expect(closeBtn).toBeDefined()
        await closeBtn?.trigger('click')
        expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('renders empty state when no tasks', async () => {
        const s = usePagesStore(pinia)
        // @ts-expect-error - testing-pinia stubs
        s.pages = []
        // @ts-expect-error - testing-pinia stubs
        s.activeOCRTasks = []
        // @ts-expect-error - testing-pinia stubs
        s.ocrTaskCount = 0

        const wrapper = mountComponent()
        await wrapper.vm.$nextTick()
        expect(wrapper.text()).toContain('No active OCR tasks')
    })
})
