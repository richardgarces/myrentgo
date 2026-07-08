import { describe, expect, it } from 'vitest'
import {
  formatFileSize,
  MAX_DOCUMENT_UPLOAD_BYTES,
  validateDocumentFileSize,
  documentCategoryLabel,
  mimeFromDataUrl,
  isPdf,
} from '@/lib/document-utils'

describe('document-utils', () => {
  it('formats file sizes', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('enforces max upload size', () => {
    const ok = new File([new Uint8Array(1024)], 'small.pdf', { type: 'application/pdf' })
    expect(validateDocumentFileSize(ok)).toBeNull()

    const tooLarge = new File([new Uint8Array(MAX_DOCUMENT_UPLOAD_BYTES + 1)], 'big.pdf')
    expect(validateDocumentFileSize(tooLarge)).toMatch(/supera el límite/)
  })

  it('resolves category labels by entity type', () => {
    expect(documentCategoryLabel({ category: 'deed', entity_type: 'property' })).toBe('Escritura')
    expect(documentCategoryLabel({ category: 'contract', entity_type: 'lease' })).toBe('Contrato de arriendo')
  })

  it('parses mime from data URLs and detects PDFs', () => {
    expect(mimeFromDataUrl('data:application/pdf;base64,abc')).toBe('application/pdf')
    expect(isPdf('application/pdf', 'file.pdf')).toBe(true)
    expect(isPdf('application/octet-stream', 'file.docx')).toBe(false)
  })
})
