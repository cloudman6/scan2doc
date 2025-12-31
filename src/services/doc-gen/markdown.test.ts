import { describe, it, expect } from 'vitest'
import { MarkdownAssembler } from './markdown'
import type { OCRResult } from '@/services/ocr'
import sample1 from '../../../tests/e2e/samples/sample1.json'

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
    it('should clean raw_text by removing noisy ref tags but preserving valid ones', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            // "table" is noisy, shoud contain "Figure 1", should remove det
            raw_text: '<|ref|>table<|/ref|>Content\n<|ref|>Figure 1<|/ref|><|det|>[[0,0,0,0]]<|/det|>',
            boxes: [],
            image_dims: { w: 1, h: 1 },
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())

        // "table" is a noisy label, should be removed
        expect(result).not.toContain('table')

        // "Figure 1" is NOT a noisy label, should be preserved (unwrapped)
        expect(result).toContain('Figure 1')

        // Det tag should be removed (as no matching box/image)
        expect(result).not.toContain('<|det|>')

        expect(result).toContain('Content')
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
    it('should replace det tags with image links when coordinates match', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            raw_text: 'Start <|det|>[[10,10,20,20]]<|/det|> End',
            boxes: [
                { box: [10, 10, 20, 20], label: 'figure' },
                { box: [50, 50, 60, 60], label: 'text' }
            ],
            image_dims: { w: 100, h: 100 },
            prompt_type: 'document'
        }
        // index 0 matches the box [10,10,20,20]
        const imageMap = new Map<string, string>([
            ['0', 'img-id-0']
        ])

        const result = assembler.assemble(ocrResult, imageMap)

        // matched image should be in-place
        expect(result).toContain('Start ![Figure 1](scan2doc-img:img-id-0) End')
        // should NOT be in Figures section at the bottom
        expect(result).not.toContain('## Figures')
    })

    it('should unwrap ref tags instead of removing them', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            raw_text: 'See <|ref|>Figure 1<|/ref|> below',
            boxes: [],
            image_dims: { w: 100, h: 100 },
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())
        expect(result).toContain('See Figure 1 below')
        expect(result).not.toContain('<|ref|>')
        expect(result).not.toContain('<|/ref|>')
    })

    it('should handle mixed: in-place for matched, append for unmatched', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            raw_text: 'Text <|det|>[[0,0,10,10]]<|/det|>',
            boxes: [
                { box: [0, 0, 10, 10], label: 'figure' }, // match
                { box: [20, 20, 30, 30], label: 'figure' }  // no det tag for this, should append
            ],
            image_dims: { w: 100, h: 100 },
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([
            ['0', 'img-0'],
            ['1', 'img-1']
        ])

        const result = assembler.assemble(ocrResult, imageMap)

        // In-place
        expect(result).toContain('Text ![Figure 1](scan2doc-img:img-0)')

    })

    it('should handle normalized coordinates (0-1000) in raw_text matching absolute boxes', () => {
        const width = 1487
        const height = 2105
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            // raw_text has normalized coords (e.g., 318/1000 * 1487 ~= 473)
            raw_text: 'Text <|ref|>image<|/ref|><|det|>[[318, 239, 555, 360]]<|/det|>',
            boxes: [
                // Absolute coordinates: [473, 503, 826, 758] (approx matches the normalized ones above)
                { box: [473, 503, 826, 758], label: 'image' }
            ],
            image_dims: { w: width, h: height },
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([
            ['0', 'img-real']
        ])

        const result = assembler.assemble(ocrResult, imageMap)

        // Should NOT contain the "image" label from ref tag
        expect(result).not.toContain('image ![')
        // Should contain the image in-place
        expect(result).toContain('Text ![Figure 1](scan2doc-img:img-real)')
        // Should not append at end
        expect(result).not.toContain('## Figures')
    })
    it('should handle approximate coordinate matching', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            // Coordinates slightly off (1px difference)
            raw_text: '<|det|>[[10,10,21,21]]<|/det|>',
            boxes: [
                { box: [10, 10, 20, 20], label: 'figure' }
            ],
            image_dims: { w: 1000, h: 1000 },
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([
            ['0', 'img-approx']
        ])

        const result = assembler.assemble(ocrResult, imageMap)
        expect(result).toContain('![Figure 1](scan2doc-img:img-approx)')
    })

    describe('Real World Sample Integration', () => {
        it('should correctly process sample1.json structure', () => {
            // Setup Image Map based on sample1 boxes
            // Indexes 6, 7, 12, 13, 14, 15 are images in sample1
            const imageMap = new Map<string, string>([
                ['6', 'img-6'],
                ['7', 'img-7'],
                ['12', 'img-12'],
                ['13', 'img-13'],
                ['14', 'img-14'],
                ['15', 'img-15']
            ])

            // @ts-expect-error -- importing json as any/unknown
            const result = assembler.assemble(sample1 as OCRResult, imageMap)

            // 1. Verify Noisy Labels are gone
            // "title", "text", "image" should not appear as standalone lines derived from refs
            // Note: Use regex to check words are not surrounded by newlines or markdown structure that implies they are headers
            // More simply, raw_text has <|ref|>title<|/ref|>, we expect "title" to be GONE.
            expect(result).not.toMatch(/^title$/m) // Start/End of line match
            expect(result).not.toMatch(/^text$/m)
            expect(result).not.toMatch(/^image$/m)

            // 2. Verify Content Integrity
            expect(result).toContain('# OSTE0KJ3000')
            expect(result).toContain('受检者ID: 1021112511173001')
            expect(result).toContain('骨质情况良好。')

            // 3. Verify Image Placement (In-Context)
            // In sample1, images 6,7 are under "测量结果" (Measurement Results)
            const measurementIndex = result.indexOf('# 测量结果')
            const img6Index = result.indexOf('![Figure 1](scan2doc-img:img-6)')
            const img7Index = result.indexOf('![Figure 2](scan2doc-img:img-7)')
            const boneDensityIndex = result.indexOf('# 骨密度')

            expect(img6Index).toBeGreaterThan(measurementIndex)
            expect(img7Index).toBeGreaterThan(measurementIndex)

            // Should be BEFORE the next section "骨密度"
            expect(img6Index).toBeLessThan(boneDensityIndex)
            expect(img7Index).toBeLessThan(boneDensityIndex)

            // images 12,13,14,15 are under "结果分析" (Result Analysis)
            const analysisIndex = result.indexOf('# 结果分析')
            const docOpinionIndex = result.indexOf('# 诊断意见')

            expect(result.indexOf('![Figure 3]')).toBeGreaterThan(analysisIndex)
            expect(result.indexOf('![Figure 3]')).toBeLessThan(docOpinionIndex)

            // 4. Verify No Fallback
            // Since all images found in boxes should match det tags in sample1, 
            // the fallback "## Figures" section should NOT exist.
            expect(result).not.toContain('## Figures')
        })
    })
})
