import { describe, it, expect } from 'vitest'
import { MarkdownAssembler } from './markdown'
import type { OCRResult } from '@/services/ocr'

describe('MarkdownAssembler', () => {
    const assembler = new MarkdownAssembler()

    it('should return text as is if no images in map', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: 'Hello World',
            raw_text: 'Hello World',
            boxes: [],
            image_dims: { w: 100, h: 100 },
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())
        expect(result).toBe('Hello World')
    })

    it('should append images to the Figures section', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: 'Content',
            raw_text: 'Content',
            boxes: [
                { box: [0, 0, 10, 10], label: 'text' },
                { box: [10, 10, 20, 20], label: 'figure' }
            ],
            image_dims: { w: 100, h: 100 },
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([
            ['1', 'img-id-1']
        ])

        const result = assembler.assemble(ocrResult, imageMap)
        expect(result).toContain('Content')
        expect(result).toContain('## Figures')
        expect(result).toContain('![Figure 1](scan2doc-img:img-id-1)')
    })

    it('should sort images by index numerical order', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            raw_text: 'raw',
            boxes: [],
            image_dims: { w: 1, h: 1 },
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([
            ['10', 'img-10'],
            ['2', 'img-2']
        ])

        const result = assembler.assemble(ocrResult, imageMap)
        const lines = result.split('\n')
        const figureLines = lines.filter(l => l.startsWith('!['))
        expect(figureLines[0]).toContain('img-2')
        expect(figureLines[1]).toContain('img-10')
    })

    it('should handle empty text in OCR result', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            raw_text: 'raw',
            boxes: [],
            image_dims: { w: 1, h: 1 },
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([['0', 'id0']])
        const result = assembler.assemble(ocrResult, imageMap)
        expect(result).toContain('## Figures')
        expect(result).toContain('![Figure 1](scan2doc-img:id0)')
    })
    it('should clean raw_text by removing ref and det tags', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: 'table\nContent',
            raw_text: '<|ref|>table<|/ref|><|det|>[[0,0,0,0]]<|/det|>\nContent',
            boxes: [],
            image_dims: { w: 1, h: 1 },
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())
        expect(result).not.toContain('table')
        expect(result).toContain('Content')
        expect(result.trim()).toBe('Content')
    })

    it('should throw error if raw_text is missing', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: 'Fallback Text',
            // @ts-expect-error -- testing missing raw_text
            raw_text: null,
            boxes: [],
            image_dims: { w: 1, h: 1 },
            prompt_type: 'document'
        }
        expect(() => assembler.assemble(ocrResult, new Map())).toThrow('OCR result missing raw_text')
    })
})
