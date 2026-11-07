import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import {
  FileText, Scissors, Layers, Minimize2, RotateCw, ListOrdered, Stamp, PenLine,
  Upload, Download, Trash2, ShieldCheck, CheckCircle2, AlertCircle, Loader2, X,
  ChevronLeft, ChevronRight, FileImage, FileDown, FileUp, Lock, Unlock, Signature,
  Hash, Crop, Maximize2, FileType, Search, Grid2X2, ArrowRight, Menu, FileSpreadsheet,
  Presentation, Type, Info, RefreshCw, GripVertical, FileCheck2, Columns3, Images,
  FileSearch, FileCode2, SlidersHorizontal
} from 'lucide-react'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore - Vite resolves this worker URL import during bundling
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import JSZip from 'jszip'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Empty in local Vite development (which uses the /api proxy). Set
// VITE_API_BASE_URL to the public backend URL for separate hosting.
const API_BASE_URL = String((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const apiUrl = (route: string) => `${API_BASE_URL}${route}`

type Tool = 'merge' | 'split' | 'compress' | 'rotate' | 'organize' | 'watermark' | 'editor' | 'images-to-pdf' | 'pdf-to-images' | 'office-to-pdf' | 'pdf-to-word' | 'pdf-to-text' | 'pdf-to-excel' | 'pdf-to-powerpoint' | 'ocr' | 'fill-forms' | 'page-numbers' | 'crop' | 'resize' | 'protect' | 'unlock' | 'sign' | 'compare' | 'metadata' | 'jpg-to-jpeg' | 'jpeg-to-jpg'
type FileEntry = { id: string; file: File }
type Notice = { type: 'success' | 'error' | 'info'; message: string }
type Card = { id: Tool; title: string; description: string; group: string; icon: typeof Layers; color: string; background: string; accept: string; multiple?: boolean }

const cards: Card[] = [
  { id: 'merge', title: 'Merge PDF', description: 'Combine multiple PDFs into a single document.', group: 'Organize PDF', icon: Layers, color: '#315d9b', background: '#eaf1ff', accept: '.pdf,application/pdf', multiple: true },
  { id: 'split', title: 'Split PDF', description: 'Extract selected pages or split every page.', group: 'Organize PDF', icon: Scissors, color: '#6d42c5', background: '#f1eaff', accept: '.pdf,application/pdf' },
  { id: 'organize', title: 'Organize pages', description: 'Preview, drag, reorder, rotate and remove pages.', group: 'Organize PDF', icon: ListOrdered, color: '#0c8a55', background: '#e5f7ed', accept: '.pdf,application/pdf' },
  { id: 'rotate', title: 'Rotate PDF', description: 'Rotate all pages or selected pages.', group: 'Organize PDF', icon: RotateCw, color: '#c47a16', background: '#fff3df', accept: '.pdf,application/pdf' },
  { id: 'images-to-pdf', title: 'Image to PDF', description: 'Turn JPG, PNG or WebP images into a PDF.', group: 'Convert PDF', icon: Images, color: '#b23d86', background: '#fdeaf5', accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', multiple: true },
  { id: 'pdf-to-images', title: 'PDF to JPG / PNG', description: 'Export PDF pages as image files in a ZIP.', group: 'Convert PDF', icon: FileImage, color: '#2875ac', background: '#e7f3fc', accept: '.pdf,application/pdf' },
  { id: 'jpg-to-jpeg', title: 'JPG to JPEG', description: 'Change a .jpg file to .jpeg without re-encoding the image.', group: 'Convert Images', icon: FileImage, color: '#b23d86', background: '#fdeaf5', accept: '.jpg,image/jpeg' },
  { id: 'jpeg-to-jpg', title: 'JPEG to JPG', description: 'Change a .jpeg file to .jpg without re-encoding the image.', group: 'Convert Images', icon: FileImage, color: '#2875ac', background: '#e7f3fc', accept: '.jpeg,image/jpeg' },
  { id: 'office-to-pdf', title: 'Word / Excel / PPT to PDF', description: 'Convert Office documents to PDF.', group: 'Convert PDF', icon: FileUp, color: '#2864a5', background: '#e9f1ff', accept: '.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.html,.htm' },
  { id: 'pdf-to-word', title: 'PDF to Word', description: 'Convert PDF content into an editable DOCX file.', group: 'Convert PDF', icon: FileType, color: '#2864a5', background: '#e9f1ff', accept: '.pdf,application/pdf' },
  { id: 'pdf-to-text', title: 'PDF to Text', description: 'Extract selectable text from PDF pages.', group: 'Convert PDF', icon: Type, color: '#64748b', background: '#eef2f6', accept: '.pdf,application/pdf' },
  { id: 'pdf-to-excel', title: 'PDF to Excel', description: 'Extract detected tables into an editable workbook.', group: 'Convert PDF', icon: FileSpreadsheet, color: '#16874e', background: '#e6f7eb', accept: '.pdf,application/pdf' },
  { id: 'pdf-to-powerpoint', title: 'PDF to PowerPoint', description: 'Turn each PDF page into a PowerPoint slide.', group: 'Convert PDF', icon: Presentation, color: '#c45a35', background: '#fff0e9', accept: '.pdf,application/pdf' },
  { id: 'ocr', title: 'OCR PDF', description: 'Make scanned PDF pages searchable with text recognition.', group: 'Convert PDF', icon: FileSearch, color: '#6c49bd', background: '#f0eaff', accept: '.pdf,application/pdf' },
  { id: 'fill-forms', title: 'Fill PDF Forms', description: 'Fill interactive text fields and checkboxes in PDF forms.', group: 'Edit & sign', icon: FileCheck2, color: '#0c8a55', background: '#e5f7ed', accept: '.pdf,application/pdf' },
  { id: 'compress', title: 'Compress PDF', description: 'Choose lossless, high-quality or maximum-size compression.', group: 'Optimize PDF', icon: Minimize2, color: '#16874e', background: '#e6f7eb', accept: '.pdf,application/pdf' },
  { id: 'page-numbers', title: 'Page Numbers', description: 'Add page numbering with custom placement.', group: 'Optimize PDF', icon: Hash, color: '#6c49bd', background: '#f0eaff', accept: '.pdf,application/pdf' },
  { id: 'crop', title: 'Crop PDF', description: 'Trim page margins by a custom amount.', group: 'Optimize PDF', icon: Crop, color: '#b46a22', background: '#fff2e4', accept: '.pdf,application/pdf' },
  { id: 'resize', title: 'Resize PDF', description: 'Scale pages to A4, A3, Letter or Legal.', group: 'Optimize PDF', icon: Maximize2, color: '#2b7c9c', background: '#e7f6fb', accept: '.pdf,application/pdf' },
  { id: 'watermark', title: 'Watermark', description: 'Stamp text across document pages.', group: 'Edit & sign', icon: Stamp, color: '#b23d86', background: '#fdeaf5', accept: '.pdf,application/pdf' },
  { id: 'editor', title: 'PDF editor', description: 'Preview pages and add text or freehand marks.', group: 'Edit & sign', icon: PenLine, color: '#315d9b', background: '#eaf1ff', accept: '.pdf,application/pdf' },
  { id: 'sign', title: 'Sign PDF', description: 'Draw a signature and place it on your document.', group: 'Edit & sign', icon: Signature, color: '#315d9b', background: '#eaf1ff', accept: '.pdf,application/pdf' },
  { id: 'protect', title: 'Protect PDF', description: 'Encrypt a PDF with a password.', group: 'Security & info', icon: Lock, color: '#c47a16', background: '#fff3df', accept: '.pdf,application/pdf' },
  { id: 'unlock', title: 'Unlock PDF', description: 'Remove password protection using its password.', group: 'Security & info', icon: Unlock, color: '#16874e', background: '#e6f7eb', accept: '.pdf,application/pdf' },
  { id: 'compare', title: 'Compare PDFs', description: 'Compare selectable text in two PDF versions.', group: 'Security & info', icon: Columns3, color: '#6c49bd', background: '#f0eaff', accept: '.pdf,application/pdf', multiple: true },
  { id: 'metadata', title: 'PDF metadata', description: 'View and edit title, author and document details.', group: 'Security & info', icon: FileSearch, color: '#64748b', background: '#eef2f6', accept: '.pdf,application/pdf' }
]
const fmt = (n: number) => n < 1_000_000 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1_000_000).toFixed(2)} MB`
const uid = () => Math.random().toString(36).slice(2, 10)
const groups = ['Organize PDF', 'Convert PDF', 'Convert Images', 'Optimize PDF', 'Edit & sign', 'Security & info']

export default function App() {
  const [active, setActive] = useState<Tool | 'home'>('home')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dragging, setDragging] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All tools')
  const picker = useRef<HTMLInputElement>(null)
  const [targetSize, setTargetSize] = useState('2')
  const [customSize, setCustomSize] = useState('2')
  const [compressionMode, setCompressionMode] = useState<'lossless' | 'recommended' | 'extreme'>('recommended')
  const [pageRange, setPageRange] = useState('1-3')
  const [splitEvery, setSplitEvery] = useState(false)
  const [rotation, setRotation] = useState('90')
  const [watermark, setWatermark] = useState('CONFIDENTIAL')
  const [opacity, setOpacity] = useState(25)
  const [pageOrder, setPageOrder] = useState<number[]>([])
  const [thumbs, setThumbs] = useState<string[]>([])
  const [pageNoPosition, setPageNoPosition] = useState('bottom-center')
  const [startAt, setStartAt] = useState('1')
  const [cropMargin, setCropMargin] = useState('24')
  const [pageSize, setPageSize] = useState('A4')
  const [imageFormat, setImageFormat] = useState('jpg')
  const [imageQuality, setImageQuality] = useState('85')
  const [password, setPassword] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [annotationText, setAnnotationText] = useState('Your text')
  const [annotationColor, setAnnotationColor] = useState('#1d4ed8')
  const [annotations, setAnnotations] = useState<{ page: number; text: string; x: number; y: number; color: string }[]>([])
  const [editorPage, setEditorPage] = useState(1)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const previewCanvas = useRef<HTMLCanvasElement>(null)
  const [metadata, setMetadata] = useState({ title: '', author: '', subject: '', keywords: '' })
  const [signing, setSigning] = useState(false)
  const signCanvas = useRef<HTMLCanvasElement>(null)
  const [signatureReady, setSignatureReady] = useState(false)
  const [formFields, setFormFields] = useState<{ name: string; kind: string; value: string }[]>([])

  useEffect(() => {
    if (active !== 'fill-forms' || !files[0]) { setFormFields([]); return }
    let cancelled = false
      ; (async () => { try { const d = await PDFDocument.load(await files[0].file.arrayBuffer()); const fields = d.getForm().getFields().map((field: any) => ({ name: field.getName(), kind: field.constructor?.name || 'Field', value: '' })); if (!cancelled) setFormFields(fields) } catch { if (!cancelled) setFormFields([]) } })()
    return () => { cancelled = true }
  }, [active, files])

  const selectedCard = active === 'home' ? null : cards.find(c => c.id === active)!
  const HeaderIcon = selectedCard?.icon || Grid2X2
  const totalSize = useMemo(() => files.reduce((a, b) => a + b.file.size, 0), [files])
  const allowedFiles = active === 'home' ? '' : selectedCard?.accept || '.pdf,application/pdf'
  const multi = active === 'merge' || active === 'images-to-pdf' || active === 'compare'

  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 6500); return () => clearTimeout(t) }, [notice])
  useEffect(() => {
    if (active !== 'editor' || !files[0]) { setPdfPreviewUrl(null); setPdfPageCount(0); return }
    const url = URL.createObjectURL(files[0].file); setPdfPreviewUrl(url)
    let cancelled = false
      ; (async () => { try { const doc = await pdfjsLib.getDocument({ data: await files[0].file.arrayBuffer() }).promise; if (!cancelled) { setPdfPageCount(doc.numPages); setEditorPage(1) } } catch { if (!cancelled) setNotice({ type: 'error', message: 'Could not preview this PDF. It may be encrypted or damaged.' }) } })()
    return () => { cancelled = true; URL.revokeObjectURL(url) }
  }, [active, files])
  useEffect(() => {
    if (!pdfPreviewUrl || !previewCanvas.current) return
    let cancelled = false
      ; (async () => { try { const doc = await pdfjsLib.getDocument(pdfPreviewUrl).promise; const page = await doc.getPage(editorPage); const vp = page.getViewport({ scale: 1.1 }); const c = previewCanvas.current!; c.width = vp.width; c.height = vp.height; await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as any).promise; if (cancelled) return } catch {/* handled above */ } })()
    return () => { cancelled = true }
  }, [pdfPreviewUrl, editorPage])
  useEffect(() => {
    if (active !== 'organize' || !files[0]) { setThumbs([]); setPageOrder([]); return }
    let cancelled = false
      ; (async () => { try { const doc = await pdfjsLib.getDocument({ data: await files[0].file.arrayBuffer() }).promise; const count = doc.numPages; setPageOrder(Array.from({ length: count }, (_, i) => i)); const images: string[] = []; for (let i = 1; i <= Math.min(count, 80); i++) { if (cancelled) return; const p = await doc.getPage(i); const vp = p.getViewport({ scale: .22 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await p.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as any).promise; images.push(c.toDataURL('image/jpeg', .72)) } if (!cancelled) setThumbs(images) } catch { if (!cancelled) setNotice({ type: 'error', message: 'Unable to load page thumbnails. The PDF may be protected or damaged.' }) } })()
    return () => { cancelled = true }
  }, [active, files])
  useEffect(() => { if (active === 'metadata' && files[0]) { (async () => { try { const d = await PDFDocument.load(await files[0].file.arrayBuffer()); setMetadata({ title: d.getTitle() || '', author: d.getAuthor() || '', subject: d.getSubject() || '', keywords: (d.getKeywords() || '') }) } catch { setMetadata({ title: '', author: '', subject: '', keywords: '' }) } })() } }, [active, files])

  const selectTool = (tool: Tool | 'home') => { setActive(tool); setFiles([]); setAnnotations([]); setNotice(null); setMobileMenu(false); setSearch(''); setSigning(false); setSignatureReady(false) }
  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming)
    let valid = arr
    if (active === 'images-to-pdf') valid = arr.filter(f => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name))
    else if (active === 'jpg-to-jpeg') valid = arr.filter(f => /\.jpg$/i.test(f.name))
    else if (active === 'jpeg-to-jpg') valid = arr.filter(f => /\.jpeg$/i.test(f.name))
    else if (active === 'office-to-pdf') valid = arr.filter(f => /\.(doc|docx|odt|rtf|xls|xlsx|ods|ppt|pptx|odp)$/i.test(f.name))
    else valid = arr.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!valid.length) { setNotice({ type: 'error', message: active === 'images-to-pdf' ? 'Choose JPG, PNG or WebP images.' : active === 'jpg-to-jpeg' ? 'Choose a .jpg image file.' : active === 'jpeg-to-jpg' ? 'Choose a .jpeg image file.' : active === 'office-to-pdf' ? 'Choose a Word, Excel or PowerPoint document.' : 'Please choose PDF files only.' }); return }
    if (valid.some(f => f.size > 100 * 1024 * 1024)) { setNotice({ type: 'error', message: 'Each file must be 100 MB or smaller.' }); return }
    const mapped = valid.map(file => ({ id: uid(), file }))
    setFiles(prev => multi ? [...prev, ...mapped] : [mapped[0]])
    setAnnotations([])
    setNotice({ type: 'success', message: `${valid.length} file${valid.length === 1 ? '' : 's'} added.` })
  }
  const removeFile = (id: string) => setFiles(p => p.filter(f => f.id !== id))
  const download = (blob: Blob, name: string) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500) }
  const readPdf = async (file: File) => PDFDocument.load(await file.arrayBuffer())

  const process = async () => {
    if (!files.length) { setNotice({ type: 'error', message: 'Add a document first.' }); return }
    setBusy(true)
    try {
      const first = files[0].file
      const base = fileBase(first)
      if (active === 'jpg-to-jpeg' || active === 'jpeg-to-jpg') {
        const from = active === 'jpg-to-jpeg' ? '.jpg' : '.jpeg'
        const to = active === 'jpg-to-jpeg' ? 'jpeg' : 'jpg'
        if (!first.name.toLowerCase().endsWith(from)) throw new Error(`Choose a ${from} image file.`)
        // JPG and JPEG are the same JPEG image format. Preserve the original bytes
        // and change only the filename extension: no re-encoding or quality loss.
        const imageBlob = new Blob([await first.arrayBuffer()], { type: 'image/jpeg' })
        download(imageBlob, outputName(first, 'converted', to))
        setNotice({ type: 'success', message: `File converted to .${to}. The JPEG image data was preserved without re-encoding.` })
        return
      } else if (active === 'merge') {
        if (files.length < 2) throw new Error('Add at least two PDFs to merge.')
        const out = await PDFDocument.create(); for (const f of files) { const d = await readPdf(f.file); (await out.copyPages(d, d.getPageIndices())).forEach(p => out.addPage(p)) } download(new Blob([await out.save()], { type: 'application/pdf' }), outputName(first, 'merged', 'pdf'))
      } else if (active === 'split') {
        const d = await readPdf(first)
        if (splitEvery) { const zip = new JSZip(); for (let i = 0; i < d.getPageCount(); i++) { const out = await PDFDocument.create(); (await out.copyPages(d, [i])).forEach(p => out.addPage(p)); zip.file(`${base}_page-${String(i + 1).padStart(3, '0')}_split.pdf`, await out.save()) } download(await zip.generateAsync({ type: 'blob' }), outputName(first, 'split', 'zip')) }
        else { const idx = parseRange(pageRange, d.getPageCount()); const out = await PDFDocument.create(); (await out.copyPages(d, idx)).forEach(p => out.addPage(p)); download(new Blob([await out.save()], { type: 'application/pdf' }), outputName(first, 'split', 'pdf')) }
      } else if (active === 'compress') {
        const targetMb = Number(targetSize === 'custom' ? customSize : targetSize)
        if (!Number.isFinite(targetMb) || targetMb <= 0) throw new Error('Enter a valid target size in MB.')
        const form = new FormData()
        form.append('pdf', first)
        form.append('targetMb', String(targetMb))
        form.append('mode', compressionMode)
        const r = await fetch(apiUrl('/api/pdf/compress'), { method: 'POST', body: form })
        if (!r.ok) throw new Error((await r.json()).error || 'Compression failed.')
        const blob = await r.blob()
        const before = Number(r.headers.get('X-Pdf-Original-Bytes') || first.size)
        const after = Number(r.headers.get('X-Pdf-Output-Bytes') || blob.size)
        const reached = r.headers.get('X-Pdf-Target-Reached') === 'true'
        const profile = r.headers.get('X-Pdf-Compression-Profile') || 'Compression completed'
        const downsampled = r.headers.get('X-Pdf-Image-Downsampled') === 'true'
        const saved = Math.max(0, Math.round((1 - after / before) * 1000) / 10)
        download(blob, outputName(first, 'compressed', 'pdf'))
        const status = reached ? 'Target reached.' : `Target not reached; best available result is ${fmt(after)}.`
        const engine = r.headers.get('X-Pdf-Compression-Engine') || ''
        const qualityNote = engine === 'original' ? 'No smaller optimized output was produced, so the original PDF was returned unchanged.' : engine !== 'Ghostscript' ? 'Only lossless structural optimization was used; image quality was not intentionally changed.' : downsampled ? 'Image resolution was reduced in Extreme mode; inspect the result before using it.' : 'Images were recompressed; resolution was not downsampled, but minor visual changes are possible.'
        setNotice({ type: 'success', message: `${fmt(before)} → ${fmt(after)} (${saved}% smaller). ${status} ${profile}. ${qualityNote}` })
        setBusy(false)
        return
      } else if (active === 'rotate' || active === 'organize') {
        const d = await readPdf(first); const out = await PDFDocument.create(); let idx = active === 'organize' ? pageOrder : d.getPageIndices()
        if (active === 'organize' && !idx.length) throw new Error('Page order is empty.')
        const pages = await out.copyPages(d, idx); pages.forEach(p => { if (active === 'rotate') p.setRotation(degrees((p.getRotation().angle + Number(rotation)) % 360)); out.addPage(p) }); download(new Blob([await out.save()], { type: 'application/pdf' }), outputName(first, active === 'rotate' ? 'rotated' : 'organized', 'pdf'))
      } else if (active === 'watermark') {
        const d = await readPdf(first); const font = await d.embedFont(StandardFonts.Helvetica); for (const p of d.getPages()) { const { width, height } = p.getSize(); p.drawText(watermark || 'WATERMARK', { x: width * .12, y: height * .48, size: Math.min(width, height) * .07, font, color: rgb(.48, .51, .56), opacity: opacity / 100, rotate: degrees(-35) }) } download(new Blob([await d.save()], { type: 'application/pdf' }), outputName(first, 'watermarked', 'pdf'))
      } else if (active === 'editor') {
        const d = await readPdf(first); const font = await d.embedFont(StandardFonts.Helvetica); const pages = d.getPages(); annotations.forEach(a => { const p = pages[a.page - 1]; if (p) { const { width, height } = p.getSize(); const c = hexRgb(a.color); p.drawText(a.text, { x: a.x * width, y: (1 - a.y) * height, size: 16, font, color: rgb(c.r, c.g, c.b) }) } }); download(new Blob([await d.save()], { type: 'application/pdf' }), outputName(first, 'edited', 'pdf'))
      } else if (active === 'images-to-pdf') {
        const out = await PDFDocument.create(); for (const f of files) { const bmp = await createImageBitmap(f.file); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0); const data = await blobToBytes(await new Promise<Blob>(resolve => c.toBlob(b => resolve(b!), 'image/jpeg', .94))); const img = await out.embedJpg(data); const page = out.addPage([img.width, img.height]); page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height }) } download(new Blob([await out.save()], { type: 'application/pdf' }), outputName(first, 'converted', 'pdf'))
      } else if (active === 'pdf-to-images') {
        const doc = await pdfjsLib.getDocument({ data: await first.arrayBuffer() }).promise; const zip = new JSZip(); for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const vp = p.getViewport({ scale: 1.6 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await p.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as any).promise; const blob = await new Promise<Blob>(resolve => c.toBlob(b => resolve(b!), imageFormat === 'png' ? 'image/png' : 'image/jpeg', Number(imageQuality) / 100)); zip.file(`${base}_page-${String(i).padStart(3, '0')}_converted.${imageFormat}`, blob) } download(await zip.generateAsync({ type: 'blob' }), outputName(first, 'converted', 'zip'))
      } else if (active === 'office-to-pdf') {
        const form = new FormData(); form.append('file', first); const r = await fetch(apiUrl('/api/convert/office-to-pdf'), { method: 'POST', body: form }); if (!r.ok) throw new Error((await r.json()).error || 'Office conversion failed.'); download(await r.blob(), outputName(first, 'converted', 'pdf'))
      } else if (active === 'pdf-to-word') {
        const form = new FormData(); form.append('pdf', first); const r = await fetch(apiUrl('/api/convert/pdf-to-word'), { method: 'POST', body: form }); if (!r.ok) throw new Error((await r.json()).error || 'PDF-to-Word conversion failed.'); download(await r.blob(), outputName(first, 'converted', 'docx'))
      } else if (active === 'pdf-to-excel' || active === 'pdf-to-powerpoint' || active === 'ocr') {
        const form = new FormData(); form.append('pdf', first); const endpoint = active === 'pdf-to-excel' ? '/api/convert/pdf-to-excel' : active === 'pdf-to-powerpoint' ? '/api/convert/pdf-to-powerpoint' : '/api/pdf/ocr'; const r = await fetch(apiUrl(endpoint), { method: 'POST', body: form }); if (!r.ok) throw new Error((await r.json()).error || 'Document conversion failed.'); const ext = active === 'pdf-to-excel' ? 'xlsx' : active === 'pdf-to-powerpoint' ? 'pptx' : 'pdf'; download(await r.blob(), outputName(first, active === 'ocr' ? 'searchable' : 'converted', ext))
      } else if (active === 'pdf-to-text') {
        const text = await extractPdfText(first); download(new Blob([text], { type: 'text/plain;charset=utf-8' }), outputName(first, 'extracted', 'txt'))
      } else if (active === 'page-numbers') {
        const d = await readPdf(first); const font = await d.embedFont(StandardFonts.Helvetica); const start = Number(startAt) || 1; d.getPages().forEach((p, i) => { const { width } = p.getSize(); const label = String(start + i); const tw = font.widthOfTextAtSize(label, 10); let x = (width - tw) / 2; if (pageNoPosition === 'bottom-left') x = 32; if (pageNoPosition === 'bottom-right') x = width - tw - 32; p.drawText(label, { x, y: 24, size: 10, font, color: rgb(.25, .28, .32) }) }); download(new Blob([await d.save()], { type: 'application/pdf' }), outputName(first, 'numbered', 'pdf'))
      } else if (active === 'crop') {
        const d = await readPdf(first); const m = Number(cropMargin); if (!Number.isFinite(m) || m < 0 || m > 45) throw new Error('Crop margin must be between 0 and 45 percent.'); d.getPages().forEach(p => { const { width, height } = p.getSize(); const x = width * m / 100, y = height * m / 100; p.setCropBox(x, y, width - 2 * x, height - 2 * y) }); download(new Blob([await d.save()], { type: 'application/pdf' }), outputName(first, 'cropped', 'pdf'))
      } else if (active === 'resize') {
        const src = await readPdf(first); const out = await PDFDocument.create(); const sizes: Record<string, [number, number]> = { A4: [595.28, 841.89], A3: [841.89, 1190.55], Letter: [612, 792], Legal: [612, 1008] }; const [w, h] = sizes[pageSize]; for (const original of src.getPages()) { const embedded = await out.embedPage(original); const scale = Math.min(w / embedded.width, h / embedded.height); const page = out.addPage([w, h]); page.drawPage(embedded, { x: (w - embedded.width * scale) / 2, y: (h - embedded.height * scale) / 2, width: embedded.width * scale, height: embedded.height * scale }) } download(new Blob([await out.save()], { type: 'application/pdf' }), outputName(first, `resized-${pageSize.toLowerCase()}`, 'pdf'))
      } else if (active === 'protect' || active === 'unlock') {
        if (password.length < 4) throw new Error('Enter a password with at least 4 characters.'); const form = new FormData(); form.append('pdf', first); form.append(active === 'protect' ? 'userPassword' : 'password', password); if (active === 'protect') form.append('ownerPassword', ownerPassword || password); const r = await fetch(apiUrl(`/api/pdf/${active}`), { method: 'POST', body: form }); if (!r.ok) throw new Error((await r.json()).error || `${active} failed.`); download(await r.blob(), outputName(first, active === 'protect' ? 'protected' : 'unlocked', 'pdf'))
      } else if (active === 'fill-forms') {
        const d = await readPdf(first); const form = d.getForm(); let filled = 0
        for (const item of formFields) { const field: any = form.getField(item.name); if (typeof field.setText === 'function') { field.setText(item.value); filled++ } else if (typeof field.check === 'function') { if (['true', 'yes', '1', 'checked'].includes(item.value.toLowerCase())) field.check(); else field.uncheck(); filled++ } else if (typeof field.select === 'function' && item.value) { field.select(item.value); filled++ } }
        if (!filled) throw new Error('No fillable fields were found. This PDF may be a flat scan or non-interactive form.')
        download(new Blob([await d.save()], { type: 'application/pdf' }), outputName(first, 'filled', 'pdf'))
      } else if (active === 'sign') {
        if (!signatureReady || !signCanvas.current) throw new Error('Draw your signature in the signature box first.'); const d = await readPdf(first); const png = await d.embedPng(await blobToBytes(await (await fetch(signCanvas.current.toDataURL())).blob())); for (const p of d.getPages()) { const { width } = p.getSize(); const w = Math.min(175, width * .36), h = w * png.height / png.width; p.drawImage(png, { x: (width - w) / 2, y: 38, width: w, height: h }) } download(new Blob([await d.save()], { type: 'application/pdf' }), outputName(first, 'signed', 'pdf'))
      } else if (active === 'compare') {
        if (files.length !== 2) throw new Error('Choose exactly two PDFs to compare.'); const a = await extractPdfText(files[0].file), b = await extractPdfText(files[1].file); const diff = makeTextComparison(a, b); download(new Blob([diff], { type: 'text/plain;charset=utf-8' }), `${fileBase(files[0].file)}_vs_${fileBase(files[1].file)}_comparison.txt`)
      } else if (active === 'metadata') {
        const d = await readPdf(first); d.setTitle(metadata.title); d.setAuthor(metadata.author); d.setSubject(metadata.subject); d.setKeywords(metadata.keywords.split(',').map(x => x.trim()).filter(Boolean)); download(new Blob([await d.save()], { type: 'application/pdf' }), outputName(first, 'metadata-updated', 'pdf'))
      }
      setNotice({ type: 'success', message: 'Your file is ready. Download started.' })
    } catch (e) { setNotice({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong while processing this document.' }) }
    finally { setBusy(false) }
  }

  const handlePageDrop = (e: DragEvent<HTMLDivElement>, to: number) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (!Number.isInteger(from) || from === to) return; setPageOrder(p => { const next = [...p]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next }) }
  const drawSignature = (e: PointerEvent<HTMLCanvasElement>) => { const c = signCanvas.current; if (!c) return; const rect = c.getBoundingClientRect(); const ctx = c.getContext('2d')!; const x = (e.clientX - rect.left) * c.width / rect.width, y = (e.clientY - rect.top) * c.height / rect.height; if (e.type === 'pointerdown') { setSigning(true); c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(x, y) } else if (e.type === 'pointermove' && signing) { ctx.lineTo(x, y); ctx.strokeStyle = '#163f78'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke() } else if (e.type === 'pointerup') { setSigning(false); setSignatureReady(true) } }
  const clearSignature = () => { const c = signCanvas.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setSignatureReady(false) }

  const navTools = cards.filter(c => ['merge', 'split', 'compress', 'rotate', 'organize', 'watermark', 'editor'].includes(c.id))
  const visibleCards = cards.filter(c => (category === 'All tools' || c.group === category) && `${c.title} ${c.description}`.toLowerCase().includes(search.toLowerCase()))

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><FileText size={21} /></div><div><strong>pdf<span>studio</span></strong><small>YOUR DOCUMENT WORKSPACE</small></div><button className="mobile-close" onClick={() => setMobileMenu(false)}><X /></button></div>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${active === 'home' ? 'active' : ''}`} onClick={() => selectTool('home')}><Grid2X2 size={18} />All tools <span className="nav-count">{cards.length}</span></button>
      <div className="nav-label tools-label">PDF TOOLS</div>
      {navTools.map(c => <button key={c.id} className={`nav-item ${active === c.id ? 'active' : ''}`} onClick={() => selectTool(c.id)}><c.icon size={18} />{c.title}</button>)}
      <div className="nav-label tools-label">MORE TOOLS</div>
      {cards.filter(c => !navTools.some(n => n.id === c.id)).map(c => <button key={c.id} className={`nav-item ${active === c.id ? 'active' : ''}`} onClick={() => selectTool(c.id)}><c.icon size={18} />{c.title}</button>)}
      <div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={19} /><div><b>Your files stay private</b><p>Temporary processing files are deleted after the task. No third-party document service.</p></div></div><div className="version">PDF STUDIO · VERSION 1.4</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="menu-button" onClick={() => setMobileMenu(true)}><Menu /></button><div className="breadcrumb">Workspace <span>/</span> <b>{active === 'home' ? 'All tools' : selectedCard?.title}</b></div><div className="top-right"><span className="local-pill"><i /> Secure processing</span><div className="avatar">PS</div></div></header>
      <div className="content">
        {active === 'home' ? <>
          <div className="page-heading"><div><div className="eyebrow">PDF WORKSPACE <span>•</span> PRIVATE BY DESIGN</div><h1>All PDF Tools</h1><p>A complete set of tools to manage, edit, convert and optimize your documents.</p></div><div className="heading-icon"><Grid2X2 size={24} /></div></div>
          <div className="tool-filters"><div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for a PDF tool..." /></div><div className="filter-pills"><button className={category === 'All tools' ? 'selected' : ''} onClick={() => setCategory('All tools')}>All tools</button>{groups.map(g => <button key={g} className={category === g ? 'selected' : ''} onClick={() => setCategory(g)}>{g}</button>)}</div></div>
          {groups.map(g => { const list = visibleCards.filter(c => c.group === g); if (!list.length) return null; return <section className="tool-group" key={g}><div className="group-heading"><h2>{g}</h2><span>{list.length} tools</span></div><div className="tool-grid">{list.map(c => <button key={c.id} className="tool-card" onClick={() => selectTool(c.id)}><div className="tool-card-top"><span className="tool-icon" style={{ color: c.color, background: c.background }}><c.icon size={23} /></span><span className="card-arrow"><ArrowRight size={17} /></span></div><h3>{c.title}</h3><p>{c.description}</p><span className="card-link">Open tool <ArrowRight size={13} /></span></button>)}</div></section> })}
          <div className="bottom-note"><div className="note-icon"><ShieldCheck size={18} /></div><div><b>Your documents, handled carefully</b><p>Most basic PDF operations happen in your browser. Conversion and password operations use this website's protected server and temporary files.</p></div></div>
        </> : <>
          <div className="page-heading"><div><div className="eyebrow">PDF WORKSPACE <span>•</span> {selectedCard?.group.toUpperCase()}</div><h1>{selectedCard?.title}</h1><p>{selectedCard?.description}</p></div><div className="heading-icon"><HeaderIcon size={24} /></div></div>
          {notice && <div className={`notice ${notice.type}`}><span>{notice.type === 'success' ? <CheckCircle2 size={18} /> : notice.type === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}</span>{notice.message}<button onClick={() => setNotice(null)}><X size={16} /></button></div>}
          <div className="workspace-grid">
            <section className="work-card">
              <div className="card-top"><div><h2>{active === 'images-to-pdf' ? 'Add images' : active === 'office-to-pdf' ? 'Add an Office document' : active === 'merge' ? 'Add PDF files' : active === 'jpg-to-jpeg' ? 'Select a JPG image' : active === 'jpeg-to-jpg' ? 'Select a JPEG image' : 'Select your file'}</h2><p>{active === 'merge' ? 'Choose two or more PDFs and arrange their order.' : active === 'images-to-pdf' ? 'Choose multiple JPG, PNG or WebP images.' : active === 'office-to-pdf' ? 'Choose a Word, Excel or PowerPoint document.' : active === 'jpg-to-jpeg' ? 'Your .jpg file will be saved with a .jpeg extension.' : active === 'jpeg-to-jpg' ? 'Your .jpeg file will be saved with a .jpg extension.' : 'Choose a document from your computer to get started.'}</p></div><span className="step-tag">STEP 01</span></div>
              <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }} onClick={() => picker.current?.click()}><input ref={picker} type="file" accept={allowedFiles} multiple={multi} hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} /><div className="upload-icon"><Upload size={23} /></div><h3>Drop your file here</h3><p>or <b>browse files</b> from your computer</p><span className="file-limit">{active === 'images-to-pdf' ? 'JPG · PNG · WebP' : active === 'jpg-to-jpeg' ? 'JPG image' : active === 'jpeg-to-jpg' ? 'JPEG image' : active === 'office-to-pdf' ? 'DOC · DOCX · XLS · XLSX · PPT · PPTX · HTML' : 'PDF files'} · Up to 100 MB per file</span></div>
              {files.length > 0 && <div className="file-list"><div className="file-list-head"><b>Selected files <span>{files.length}</span></b><button onClick={() => setFiles([])}><Trash2 size={14} /> Clear all</button></div>{files.map((f, i) => <div className="file-row" key={f.id}><div className="pdf-file-icon"><FileText size={18} /></div><div className="file-meta"><b>{f.file.name}</b><small>{fmt(f.file.size)} · {f.file.type || 'Document'}</small></div>{active === 'merge' && <div className="move-actions"><button onClick={() => setFiles(p => { const n = [...p]; if (i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })} disabled={i === 0}><ChevronLeft size={15} /></button><button onClick={() => setFiles(p => { const n = [...p]; if (i < n.length - 1) [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n })} disabled={i === files.length - 1}><ChevronRight size={15} /></button></div>}<button className="remove-file" onClick={() => removeFile(f.id)}><X size={16} /></button></div>)}</div>}
              {files.length > 0 && <div className="file-summary"><span>{files.length} file{files.length === 1 ? '' : 's'} selected</span><b>{fmt(totalSize)} total</b></div>}
              {active === 'organize' && files[0] && <div className="organizer-area"><div className="organizer-title"><b>Page thumbnails</b><small>Drag cards to reorder. First 80 pages shown.</small></div><div className="thumb-grid">{pageOrder.map((originalIndex, position) => <div key={`${originalIndex}-${position}`} className="thumb-card" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(position))} onDragOver={e => e.preventDefault()} onDrop={e => handlePageDrop(e, position)}><div className="thumb-image">{thumbs[originalIndex] ? <img src={thumbs[originalIndex]} alt={`Page ${originalIndex + 1}`} /> : <FileText size={25} />}</div><div className="thumb-bottom"><GripVertical size={13} /><span>Page {originalIndex + 1}</span><button title="Remove page" onClick={() => setPageOrder(p => p.filter((_, i) => i !== position))}><X size={13} /></button></div></div>)}</div><small className="field-help">Removed pages are excluded from the exported document.</small></div>}
              {active === 'sign' && files[0] && <div className="signature-area"><div className="organizer-title"><b>Draw your signature</b><small>Sign inside the box using your mouse or touchscreen.</small></div><canvas ref={signCanvas} width={600} height={160} className="sign-canvas" onPointerDown={drawSignature} onPointerMove={drawSignature} onPointerUp={drawSignature} onPointerLeave={e => { if (signing) drawSignature({ ...e, type: 'pointerup' } as any) }} /><button className="text-button" onClick={clearSignature}>Clear signature</button>{signatureReady && <span className="signature-ready"><CheckCircle2 size={14} /> Signature ready</span>}</div>}
            </section>
            <section className="options-card">
              <div className="card-top"><div><h2>Settings</h2><p>Customize your operation.</p></div><span className="step-tag">STEP 02</span></div>
              <div className="option-content">
                {(active === 'jpg-to-jpeg' || active === 'jpeg-to-jpg') && <div className="tip-box"><FileImage size={17} /><p>JPG and JPEG are the same image format. This tool preserves the original image bytes and changes only the file extension, so image quality is not changed.</p></div>}
                {active === 'merge' && <><div className="tip-box"><Layers size={17} /><p>Files are merged in the order shown. Use the arrows beside each file to change the sequence.</p></div><div className="option-note"><b>Output</b><span>One PDF · All pages</span></div></>}
                {active === 'split' && <><label className="field-label">Split method</label><div className="segmented"><button className={!splitEvery ? 'selected' : ''} onClick={() => setSplitEvery(false)}>Page range</button><button className={splitEvery ? 'selected' : ''} onClick={() => setSplitEvery(true)}>Every page</button></div>{!splitEvery && <><label className="field-label">Pages to extract</label><input className="text-input" value={pageRange} onChange={e => setPageRange(e.target.value)} placeholder="1-3, 5, 8-10" /><small className="field-help">Use commas for separate pages and hyphens for ranges.</small></>}</>}
                {active === 'compress' && <>
                  <label className="field-label">Maximum target size</label>
                  <select className="text-input" value={targetSize} onChange={e => setTargetSize(e.target.value)}>
                    <option value="1">1 MB</option><option value="2">2 MB</option><option value="3">3 MB</option><option value="5">5 MB</option><option value="10">10 MB</option><option value="custom">Custom size</option>
                  </select>
                  {targetSize === 'custom' && <input className="text-input spaced" type="number" min="0.1" max="1000" step="0.1" value={customSize} onChange={e => setCustomSize(e.target.value)} placeholder="Target size in MB" />}
                  <label className="field-label spaced-label">Compression mode</label>
                  <div className="compression-modes">
                    <button type="button" className={`compression-mode ${compressionMode === 'lossless' ? 'selected' : ''}`} onClick={() => setCompressionMode('lossless')}>
                      <span className="compression-mode-head"><b>Lossless</b><em>Safest</em></span>
                      <small>No intentional image re-encoding or downsampling. May save very little space.</small>
                    </button>
                    <button type="button" className={`compression-mode ${compressionMode === 'recommended' ? 'selected' : ''}`} onClick={() => setCompressionMode('recommended')}>
                      <span className="compression-mode-head"><b>Recommended</b><em>Balanced</em></span>
                      <small>Recompresses images at high visual quality without reducing their pixel dimensions.</small>
                    </button>
                    <button type="button" className={`compression-mode ${compressionMode === 'extreme' ? 'selected' : ''}`} onClick={() => setCompressionMode('extreme')}>
                      <span className="compression-mode-head"><b>Extreme</b><em>Smallest files</em></span>
                      <small>Stronger image compression and lower resolution may visibly affect image quality.</small>
                    </button>
                  </div>
                  <div className="quality-lock"><ShieldCheck size={18} /><div><b>{compressionMode === 'lossless' ? 'Image quality protected' : compressionMode === 'recommended' ? 'High visual quality' : 'Maximum size reduction'}</b><p>{compressionMode === 'lossless' ? 'Only PDF structure and eligible streams are optimized. The target size is not guaranteed.' : compressionMode === 'recommended' ? 'Images may be JPEG-recompressed, but their pixel dimensions are retained. Minor visual differences are possible.' : 'Images may be JPEG-recompressed and downsampled. Review the downloaded PDF before sharing or printing.'}</p></div></div>
                </>}
                {active === 'rotate' && <><label className="field-label">Rotation angle</label><div className="segmented three">{['90', '180', '270'].map(n => <button key={n} className={rotation === n ? 'selected' : ''} onClick={() => setRotation(n)}>{n}°</button>)}</div></>}
                {active === 'organize' && <div className="tip-box"><ListOrdered size={17} /><p>Drag page thumbnails in the left panel to reorder them. Remove a page with its × button. Export keeps the new order.</p></div>}
                {active === 'watermark' && <><label className="field-label">Watermark text</label><input className="text-input" value={watermark} onChange={e => setWatermark(e.target.value)} /><div className="range-heading"><label className="field-label">Opacity</label><b>{opacity}%</b></div><input className="range-input" type="range" min="5" max="70" value={opacity} onChange={e => setOpacity(Number(e.target.value))} /><div className="watermark-preview">{watermark || 'WATERMARK'}</div></>}
                {active === 'editor' && <><label className="field-label">Text to add</label><input className="text-input" value={annotationText} onChange={e => setAnnotationText(e.target.value)} /><div className="color-row">{['#1d4ed8', '#111827', '#dc2626', '#15803d', '#7c3aed'].map(c => <button key={c} className={`color-swatch ${annotationColor === c ? 'picked' : ''}`} style={{ background: c }} onClick={() => setAnnotationColor(c)} />)}</div><div className="option-note"><b>Current page</b><span>{editorPage} / {pdfPageCount || '—'}</span></div><button className="secondary-button" onClick={() => setAnnotations(p => [...p, { page: editorPage, text: annotationText, x: .12, y: .2 + p.filter(a => a.page === editorPage).length * .07, color: annotationColor }])}><span>＋</span> Add text to current page</button><small className="field-help">The editor adds new text on top of the PDF; it does not directly rewrite existing paragraph text.</small></>}
                {active === 'images-to-pdf' && <div className="tip-box"><Images size={17} /><p>Images are placed on pages at their natural pixel dimensions. Arrange the upload order before converting.</p></div>}
                {active === 'pdf-to-images' && <><label className="field-label">Image format</label><div className="segmented"><button className={imageFormat === 'jpg' ? 'selected' : ''} onClick={() => setImageFormat('jpg')}>JPG</button><button className={imageFormat === 'png' ? 'selected' : ''} onClick={() => setImageFormat('png')}>PNG</button></div><label className="field-label">JPG quality · {imageQuality}%</label><input className="range-input" type="range" min="50" max="100" value={imageQuality} onChange={e => setImageQuality(e.target.value)} disabled={imageFormat === 'png'} /><small className="field-help">All pages are bundled into one ZIP file.</small></>}
                {active === 'office-to-pdf' && <div className="tip-box"><FileSpreadsheet size={17} /><p>Supports DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT, ODS, ODP and RTF. Complex layouts may render differently from Microsoft Office.</p></div>}
                {active === 'pdf-to-word' && <div className="tip-box"><FileType size={17} /><p>Conversion attempts to preserve text and layout. Complex pages, scans and unusual fonts may need manual cleanup. Scanned PDFs require OCR first.</p></div>}
                {active === 'pdf-to-text' && <div className="tip-box"><Type size={17} /><p>Extracts selectable text from normal PDFs. For scanned documents, use OCR PDF first.</p></div>}
                {active === 'pdf-to-excel' && <div className="tip-box"><FileSpreadsheet size={17} /><p>Detected tables are exported to workbook sheets. Results depend on the structure of the source PDF; scanned tables need OCR first.</p></div>}
                {active === 'pdf-to-powerpoint' && <div className="tip-box"><Presentation size={17} /><p>Each PDF page becomes a slide image. This preserves appearance, but slide content is not individually editable.</p></div>}
                {active === 'ocr' && <div className="tip-box"><FileSearch size={17} /><p>OCR recognizes printed text in scanned pages and creates a searchable PDF. The hosted server supplies the OCR engine.</p></div>}
                {active === 'page-numbers' && <><label className="field-label">Starting number</label><input className="text-input" type="number" min="1" value={startAt} onChange={e => setStartAt(e.target.value)} /><label className="field-label spaced-label">Position</label><select className="text-input" value={pageNoPosition} onChange={e => setPageNoPosition(e.target.value)}><option value="bottom-center">Bottom center</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></>}
                {active === 'crop' && <><label className="field-label">Crop margin from each edge</label><input className="text-input" type="number" min="0" max="45" value={cropMargin} onChange={e => setCropMargin(e.target.value)} /><small className="field-help">Percentage of page width and height. This changes the visible crop box, not the underlying page content.</small></>}
                {active === 'resize' && <><label className="field-label">Target page size</label><select className="text-input" value={pageSize} onChange={e => setPageSize(e.target.value)}><option>A4</option><option>A3</option><option>Letter</option><option>Legal</option></select><div className="tip-box"><Maximize2 size={17} /><p>Pages are scaled proportionally and centered on the selected page size.</p></div></>}
                {(active === 'protect' || active === 'unlock') && <><label className="field-label">{active === 'protect' ? 'New PDF password' : 'Current PDF password'}</label><input className="text-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 4 characters" />{active === 'protect' && <><label className="field-label spaced-label">Owner password (optional)</label><input className="text-input" type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} placeholder="Defaults to user password" /></>}<small className="field-help">Passwords are used only for this operation and are not stored.</small></>}
                {active === 'fill-forms' && <div className="form-fields">{formFields.length ? formFields.map((field, i) => <div className="form-field" key={field.name}><label className="field-label">{field.name} <small>{field.kind.replace('PDF', '')}</small></label><input className="text-input" value={field.value} onChange={e => setFormFields(p => p.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder={field.kind.includes('CheckBox') ? 'Type true or false' : 'Enter value'} /></div>) : <div className="tip-box"><Info size={17} /><p>No interactive form fields were detected yet. Upload a fillable PDF form (not a scanned image) to see its fields here.</p></div>}</div>}
                {active === 'sign' && <div className="tip-box"><Signature size={17} /><p>Your drawn signature is embedded into the document. This is an electronic signature image, not a certificate-based digital signature.</p></div>}
                {active === 'compare' && <div className="tip-box"><Columns3 size={17} /><p>Select two PDFs. PDF Studio extracts selectable text and creates a comparison report. It does not yet perform pixel-level page comparison.</p></div>}
                {active === 'metadata' && <><label className="field-label">Title</label><input className="text-input" value={metadata.title} onChange={e => setMetadata(p => ({ ...p, title: e.target.value }))} /><label className="field-label spaced-label">Author</label><input className="text-input" value={metadata.author} onChange={e => setMetadata(p => ({ ...p, author: e.target.value }))} /><label className="field-label spaced-label">Subject</label><input className="text-input" value={metadata.subject} onChange={e => setMetadata(p => ({ ...p, subject: e.target.value }))} /><label className="field-label spaced-label">Keywords (comma separated)</label><input className="text-input" value={metadata.keywords} onChange={e => setMetadata(p => ({ ...p, keywords: e.target.value }))} /></>}
              </div>
              <div className="run-area"><button className="primary-button" onClick={process} disabled={busy || !files.length}>{busy ? <><Loader2 className="spin" size={18} /> Processing...</> : <><Download size={18} />{actionLabel(active)}</>}</button><div className="secure-line"><ShieldCheck size={14} />{['compress', 'protect', 'unlock', 'office-to-pdf', 'pdf-to-word', 'pdf-to-excel', 'pdf-to-powerpoint', 'ocr'].includes(active) ? 'Secure server processing · temporary files deleted' : 'Processed in your browser'}</div></div>
            </section>
          </div>
          {active === 'editor' && files[0] && <section className="editor-card"><div className="card-top"><div><h2>Document preview</h2><p>Click a location on the page to place your text.</p></div><div className="page-controls"><button disabled={editorPage <= 1} onClick={() => setEditorPage(p => Math.max(1, p - 1))}><ChevronLeft size={17} /></button><span>Page {editorPage} of {pdfPageCount || '—'}</span><button disabled={editorPage >= pdfPageCount} onClick={() => setEditorPage(p => Math.min(pdfPageCount, p + 1))}><ChevronRight size={17} /></button></div></div><div className="preview-stage"><div className="pdf-canvas-wrap"><canvas ref={previewCanvas} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setAnnotations(p => [...p, { page: editorPage, text: annotationText, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, color: annotationColor }]) }} /><div className="annotation-layer">{annotations.filter(a => a.page === editorPage).map((a, i) => <span key={i} style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, color: a.color }}>{a.text}</span>)}</div></div></div><p className="editor-footnote">Annotations are added as a new content layer. Existing PDF text cannot be edited in-place.</p></section>}
          <button className="back-tools" onClick={() => selectTool('home')}><Grid2X2 size={15} /> Back to all tools</button>
        </>}
        <footer>© 2026 PDF Studio <span>Tools for your everyday documents.</span></footer>
      </div>
    </main>
  </div>
}

function fileBase(file: File) { const name = file.name.trim(); const dot = name.lastIndexOf('.'); const raw = dot > 0 ? name.slice(0, dot) : name; return raw.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/, '') || 'document' }
function outputName(file: File, suffix: string, extension: string) { return `${fileBase(file)}_${suffix}.${extension.replace(/^\./, '')}` }
function actionLabel(tool: Tool) { const map: Record<Tool, string> = { merge: 'Merge PDFs', split: 'Split PDF', compress: 'Compress PDF', rotate: 'Rotate PDF', organize: 'Export organized PDF', watermark: 'Apply watermark', editor: 'Export edited PDF', 'images-to-pdf': 'Convert images to PDF', 'pdf-to-images': 'Convert PDF to images', 'office-to-pdf': 'Convert to PDF', 'pdf-to-word': 'Convert to Word', 'pdf-to-text': 'Extract text', 'pdf-to-excel': 'Convert to Excel', 'pdf-to-powerpoint': 'Convert to PowerPoint', ocr: 'Make searchable PDF', 'fill-forms': 'Save filled form', 'page-numbers': 'Add page numbers', crop: 'Crop PDF', resize: 'Resize PDF', protect: 'Protect PDF', unlock: 'Unlock PDF', sign: 'Apply signature', compare: 'Compare PDFs', metadata: 'Save metadata', 'jpg-to-jpeg': 'Convert JPG to JPEG', 'jpeg-to-jpg': 'Convert JPEG to JPG' }; return map[tool] }
function parseRange(value: string, count: number) { const set = new Set<number>(); for (const part of value.split(',').map(x => x.trim()).filter(Boolean)) { const m = part.match(/^(\d+)\s*-\s*(\d+)$/); if (m) { const a = +m[1], b = +m[2]; if (a < 1 || b < a || b > count) throw new Error(`Invalid page range ${part}. This PDF has ${count} pages.`); for (let n = a; n <= b; n++)set.add(n - 1) } else if (/^\d+$/.test(part)) { const n = +part; if (n < 1 || n > count) throw new Error(`Page ${n} is outside the document.`); set.add(n - 1) } else throw new Error(`Invalid page range: ${part}`) } return [...set].sort((a, b) => a - b) }
function hexRgb(hex: string) { const n = parseInt(hex.replace('#', ''), 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 } }
async function blobToBytes(blob: Blob) { return new Uint8Array(await blob.arrayBuffer()) }
async function extractPdfText(file: File) { const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; const out: string[] = []; for (let i = 1; i <= doc.numPages; i++) { const page = await doc.getPage(i); const content = await page.getTextContent(); out.push(`--- Page ${i} ---\n${content.items.map((x: any) => x.str || '').join(' ')}`) } return out.join('\n\n') }
function makeTextComparison(a: string, b: string) { const aa = a.split(/\s+/).filter(Boolean), bb = b.split(/\s+/).filter(Boolean); const report = ['PDF STUDIO — TEXT COMPARISON', '', `Version A words: ${aa.length}`, `Version B words: ${bb.length}`, '', 'Note: This is a simple word-position comparison, not a layout or pixel comparison.', '', '']; const max = Math.max(aa.length, bb.length); let changes = 0; for (let i = 0; i < max; i++) { if (aa[i] !== bb[i]) { changes++; report.push(`Position ${i + 1}:`, `  A: ${aa[i] ?? '[removed]'}`, `  B: ${bb[i] ?? '[added]'}`) } } report.splice(6, 0, `Different word positions: ${changes}`); return report.join('\n') }
