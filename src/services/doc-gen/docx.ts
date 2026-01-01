import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx'
import { db } from '@/db'
import { consola } from 'consola'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

export class DocxGenerator {
    private md: MarkdownIt

    constructor() {
        this.md = new MarkdownIt({
            html: true
        })
    }

    /**
     * Generate a DOCX blob from a Markdown string.
     * 
     * @param markdown The Markdown content
     * @param options Additional options for document styling
     * @returns A promise that resolves to a DOCX Blob
     */
    /**
     * Generate a DOCX blob from a Markdown string.
     */
    async generate(markdown: string): Promise<Blob> {
        const tokens = this.md.parse(markdown, {})
        const children: (Paragraph | Table)[] = []

        let i = 0
        while (i < tokens.length) {
            const token = tokens[i]!

            if (token.type === 'heading_open') {
                const result = this.processHeading(tokens, i)
                children.push(result.paragraph)
                i = result.nextIndex
            } else if (token.type === 'paragraph_open') {
                const result = await this.processParagraph(tokens, i)
                if (result.paragraph) children.push(result.paragraph)
                i = result.nextIndex
            } else if (token.type === 'html_block') {
                const table = this.processHtmlBlock(token.content)
                if (table) {
                    children.push(table)
                    // Add an empty paragraph after table to ensure spacing
                    children.push(new Paragraph({
                        text: '',
                        spacing: {
                            after: 240, // 12pt
                        }
                    }))
                }
                i++
            } else {
                i++
            }
        }

        const isChinese = this.detectDominantLanguage(markdown)

        const doc = new Document({
            styles: {
                default: {
                    document: {
                        run: {
                            font: isChinese ? 'Microsoft YaHei' : 'Arial',
                            characterSpacing: isChinese ? 20 : 0, // Reduced from 40 to 20
                        },
                    },
                },
            },
            sections: [{
                properties: {},
                children: children
            }]
        })

        return await Packer.toBlob(doc)
    }

    private processHeading(tokens: Token[], index: number) {
        const token = tokens[index]!
        const level = parseInt(token.tag.slice(1)) || 1
        const contentToken = tokens[index + 1]!
        const paragraph = this.createHeading(contentToken.content, level)
        return { paragraph, nextIndex: index + 3 } // open, inline, close
    }

    private async processParagraph(tokens: Token[], index: number) {
        const contentToken = tokens[index + 1]!
        let paragraph: Paragraph | null = null

        if (contentToken.type === 'inline') {
            const imageToken = contentToken.children?.find(c => c.type === 'image')
            if (imageToken) {
                const imageId = imageToken.attrGet('src')?.split(':')[1]
                if (imageId) {
                    paragraph = await this.createImageParagraph(imageId)
                }
            } else {
                paragraph = this.createParagraph(contentToken)
            }
        }

        return { paragraph, nextIndex: index + 3 } // open, inline, close
    }

    private createHeading(text: string, level: number): Paragraph {
        let headingLevel: string = HeadingLevel.HEADING_1
        if (level === 2) headingLevel = HeadingLevel.HEADING_2
        if (level === 3) headingLevel = HeadingLevel.HEADING_3
        if (level === 4) headingLevel = HeadingLevel.HEADING_4
        if (level === 5) headingLevel = HeadingLevel.HEADING_5
        if (level === 6) headingLevel = HeadingLevel.HEADING_6

        return new Paragraph({
            text,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            heading: headingLevel as any
        })
    }

    private createParagraph(inlineToken: Token): Paragraph {
        const textRuns: TextRun[] = []

        if (inlineToken.children) {
            let bold = false
            let italic = false

            for (const child of inlineToken.children) {
                if (child.type === 'strong_open') bold = true
                else if (child.type === 'strong_close') bold = false
                else if (child.type === 'em_open') italic = true
                else if (child.type === 'em_close') italic = false
                else if (child.type === 'text') {
                    textRuns.push(new TextRun({
                        text: child.content,
                        bold,
                        italics: italic
                    }))
                } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
                    textRuns.push(new TextRun({ text: '', break: 1 }))
                }
            }
        } else {
            textRuns.push(new TextRun(inlineToken.content))
        }

        return new Paragraph({
            children: textRuns,
            spacing: {
                after: 240, // 12pt
                line: 240, // 1 line
                lineRule: 'auto',
            }
        })
    }

    private async createImageParagraph(imageId: string): Promise<Paragraph | null> {
        try {
            const extractedImage = await db.getPageExtractedImage(imageId)
            if (!extractedImage) return null

            const buffer = extractedImage.blob instanceof Blob
                ? await extractedImage.blob.arrayBuffer()
                : extractedImage.blob

            return new Paragraph({
                children: [
                    new ImageRun({
                        data: buffer,
                        type: 'png',
                        transformation: {
                            width: 400, // Fixed width: Maintain aspect ratio or use box info in future
                            height: 300,
                        },
                    }),
                ],
            })
        } catch (error) {
            consola.error(`[DocxGenerator] Failed to create image paragraph for ${imageId}`, error)
            return null
        }
    }


    private processHtmlBlock(htmlContent: string): Table | null {
        try {
            const parser = new DOMParser()
            const doc = parser.parseFromString(htmlContent, 'text/html')
            const tableElement = doc.querySelector('table')

            if (!tableElement) return null

            const rows: TableRow[] = []
            const trElements = Array.from(tableElement.querySelectorAll('tr'))

            for (const tr of trElements) {
                const cells: TableCell[] = []
                const tdElements = Array.from(tr.querySelectorAll('td, th'))

                for (const td of tdElements) {
                    const textContent = td.textContent || ''
                    // Basic styling for header cells (th)
                    const isHeader = td.tagName.toLowerCase() === 'th'

                    cells.push(new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({
                                text: textContent.trim(),
                                bold: isHeader,
                            })]
                        })],
                        width: {
                            size: 100 / tdElements.length, // Distribute width evenly for now
                            type: WidthType.PERCENTAGE,
                        },
                    }))
                }

                rows.push(new TableRow({
                    children: cells
                }))
            }

            if (rows.length === 0) return null

            return new Table({
                rows: rows,
                width: {
                    size: 100,
                    type: WidthType.PERCENTAGE,
                },
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 1 },
                    bottom: { style: BorderStyle.SINGLE, size: 1 },
                    left: { style: BorderStyle.SINGLE, size: 1 },
                    right: { style: BorderStyle.SINGLE, size: 1 },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1 },
                }
            })
        } catch (error) {
            consola.error('[DocxGenerator] Failed to parse HTML table', error)
            return null
        }
    }

    private detectDominantLanguage(text: string): boolean {
        // Remove common markdown syntax to avoid skewing results (optional, but good for accuracy)
        /* eslint-disable sonarjs/slow-regex */
        const cleanText = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '') // Remove images
            .replace(/\[[^\]]*\]\([^)]*\)/g, '') // Remove links
            .replace(/[#*`~>+\-=_]/g, '') // Remove symbols
        /* eslint-enable sonarjs/slow-regex */

        const totalLength = cleanText.length
        if (totalLength === 0) return false

        // Count Chinese characters
        const chineseMatches = cleanText.match(/[\u4e00-\u9fa5]/g)
        const chineseCount = chineseMatches ? chineseMatches.length : 0

        // If more than 20% is Chinese, treat as Chinese dominant (threshold can be adjusted)
        // Using 20% because technical docs often have a lot of English code/keywords
        return (chineseCount / totalLength) > 0.2
    }
}

export const docxGenerator = new DocxGenerator()
