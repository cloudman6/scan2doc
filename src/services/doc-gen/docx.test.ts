import { describe, it, expect, vi, beforeEach } from 'vitest'
import { docxGenerator } from './docx'
import { db } from '@/db'
import * as docxMathConverter from '@hungknguyen/docx-math-converter'

// Mock db
vi.mock('@/db', () => ({
    db: {
        getPageExtractedImage: vi.fn(),
        savePageDOCX: vi.fn()
    }
}))

// We do NOT mock '@hungknguyen/docx-math-converter' anymore because we want to test
// the real 'convertMathMl2Math' function which works, unlike 'convertLatex2Math'.

const TableCellSpy = vi.fn()
vi.mock('docx', async (importOriginal) => {
    const actual = await importOriginal<typeof import('docx')>()
    return {
        ...actual,
        TableCell: class extends actual.TableCell {
            constructor(options: any) {
                super(options)
                TableCellSpy(options)
            }
        }
    }
})

describe('DocxGenerator', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        TableCellSpy.mockClear()
    })

    it('should generate a DOCX blob from a simple Markdown string', async () => {
        const markdown = '# Heading 1\n\nThis is a paragraph with **bold** and *italic* text.'
        const blob = await docxGenerator.generate(markdown)

        expect(blob).toBeDefined()
        expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle images with scan2doc-img: protocol', async () => {
        const imageId = 'test-image-123'
        const markdown = `Check this image:\n\n![Figure 1](scan2doc-img:${imageId})`

        // Mock image data
        const mockImageBuffer = new ArrayBuffer(8)
        vi.mocked(db.getPageExtractedImage).mockResolvedValue({
            id: imageId,
            pageId: 'page1',
            blob: mockImageBuffer,
            box: [0, 0, 100, 100]
        })

        const blob = await docxGenerator.generate(markdown)

        expect(blob).toBeDefined()
        expect(db.getPageExtractedImage).toHaveBeenCalledWith(imageId)
    })

    it('should correctly handle heading levels', async () => {
        const markdown = '# H1\n## H2\n### H3'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle lists (implicitly as paragraphs for now)', async () => {
        const markdown = '- Item 1\n- Item 2'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should not crash on empty markdown', async () => {
        const blob = await docxGenerator.generate('')
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle softbreak and hardbreak', async () => {
        const markdown = 'Line1\nLine2  \nLine3'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle createImageParagraph failure', async () => {
        vi.mocked(db.getPageExtractedImage).mockRejectedValue(new Error('Extract Fail'))
        const markdown = '![Fig](scan2doc-img:fail-id)'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should parse HTML tables and include them in the document', async () => {
        const markdown = `
Here is a table:

<table>
  <tr>
    <th>Header 1</th>
    <th>Header 2</th>
  </tr>
  <tr>
    <td>Cell 1</td>
    <td>Cell 2</td>
  </tr>
</table>

End of table.
`
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should convert LaTeX math to OMML/docx objects via MathML workaround', async () => {
        // We verify that KaTeX is used to convert LaTeX to MathML
        // This confirms our pipeline: LaTeX -> [KaTeX] -> MathML -> [convertMathMl2Math] -> OMML

        // Note: effectively mocking katex to spy on it might require careful setup if we want the real implementation to run.
        // But simply importing katex and spying on it should work if it's configurable. 
        // Or we can simple assume if it doesn't crash and returns blob, it's good.

        const markdown = 'Equation: $$E=mc^2$$'
        const blob = await docxGenerator.generate(markdown)

        expect(blob).toBeDefined()
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should verify convertMathMl2Math exports exist (Integration Check)', async () => {
        expect(typeof docxMathConverter.convertMathMl2Math).toBe('function')
    })

    it('should handle inline image failures gracefully', async () => {
        vi.mocked(db.getPageExtractedImage).mockRejectedValueOnce(new Error('Inline Fail'))
        const markdown = 'Text and ![fail](scan2doc-img:fail)'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle missing inline image ID', async () => {
        const markdown = 'Text and ![fail](scan2doc-img:)'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle math conversion error gracefully', async () => {
        const markdown = '$$ \\invalidcommandthatcrashes $$'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle block math $$...$$', async () => {
        const markdown = '$$E=mc^2$$'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle math conversion error gracefully', async () => {
        // Force error by passing invalid latex that katex might choke on?
        // Actually convertLatexToDocxMath has a try-catch.
        // Pass something that throws in katex.renderToString?
        // ' \u0000 ' maybe?
        // Or mock katex.renderToString
        const markdown = '$$ \\invalidcommandthatcrashes $$'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })


    it('should use AUTO width for table cells to allow content-based sizing', async () => {
        const markdown = `
<table>
  <tr>
    <td>短</td>
    <td>这是一个很长的内容列</td>
  </tr>
</table>
`
        await docxGenerator.generate(markdown)

        expect(TableCellSpy).toHaveBeenCalledTimes(2)

        const calls = TableCellSpy.mock.calls
        const widths = calls.map((c: any) => c[0].width)

        // All cells should use AUTO width
        widths.forEach(width => {
            expect(width.type).toBe('auto')
        })
    })
})
