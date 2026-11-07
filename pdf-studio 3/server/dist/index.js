import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = express();
const PORT = Number(process.env.PORT || 8787);
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 100 * 1024 * 1024);
const pdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        const allowed = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
        if (allowed)
            cb(null, true);
        else
            cb(new Error('Only PDF files are accepted.'));
    }
});
const anyUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 }
});
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173', 'http://127.0.0.1:5173'], exposedHeaders: ['X-Pdf-Original-Bytes', 'X-Pdf-Output-Bytes', 'X-Pdf-Target-Bytes', 'X-Pdf-Target-Reached', 'X-Pdf-Compression-Mode', 'X-Pdf-Compression-Engine', 'X-Pdf-Compression-Profile', 'X-Pdf-Image-Downsampled', 'X-Pdf-Reduction-Percent'] }));
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'PDF Studio', version: '1.5.2' }));
app.post('/api/pdf/compress', pdfUpload.single('pdf'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'Upload a PDF file.' });
    const targetMb = Number(req.body.targetMb || 2);
    const mode = String(req.body.mode || 'recommended');
    if (!Number.isFinite(targetMb) || targetMb <= 0 || targetMb > 1000) {
        return res.status(400).json({ error: 'Target size must be between 0.1 MB and 1000 MB.' });
    }
    if (!['lossless', 'recommended', 'extreme'].includes(mode)) {
        return res.status(400).json({ error: 'Choose Lossless, Recommended or Extreme compression.' });
    }
    let folder = '';
    try {
        assertPdf(req.file.buffer);
        folder = await tempFolder();
        const targetBytes = Math.round(targetMb * 1_000_000);
        const result = await optimizePdf(req.file.buffer, folder, mode, targetBytes);
        const improved = result.buffer.length < req.file.buffer.length;
        const finalBuffer = improved ? result.buffer : req.file.buffer;
        const finalResult = improved ? result : {
            buffer: req.file.buffer,
            engine: 'original',
            profile: 'Original retained; no smaller output was produced',
            downsampled: false
        };
        const targetReached = finalBuffer.length <= targetBytes;
        const reductionPercent = req.file.buffer.length > 0
            ? Math.max(0, Math.round((1 - finalBuffer.length / req.file.buffer.length) * 1000) / 10)
            : 0;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="compressed.pdf"');
        res.setHeader('X-Pdf-Original-Bytes', String(req.file.buffer.length));
        res.setHeader('X-Pdf-Output-Bytes', String(finalBuffer.length));
        res.setHeader('X-Pdf-Target-Bytes', String(targetBytes));
        res.setHeader('X-Pdf-Target-Reached', String(targetReached));
        res.setHeader('X-Pdf-Compression-Mode', mode);
        res.setHeader('X-Pdf-Compression-Engine', finalResult.engine);
        res.setHeader('X-Pdf-Compression-Profile', finalResult.profile);
        res.setHeader('X-Pdf-Image-Downsampled', String(finalResult.downsampled));
        res.setHeader('X-Pdf-Reduction-Percent', String(reductionPercent));
        res.send(finalBuffer);
    }
    catch (error) {
        sendError(res, error, 'Compression failed.');
    }
    finally {
        await clean(folder);
    }
});
app.post('/api/pdf/protect', pdfUpload.single('pdf'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'Upload a PDF file.' });
    const userPassword = String(req.body.userPassword || '');
    const ownerPassword = String(req.body.ownerPassword || userPassword);
    if (userPassword.length < 4)
        return res.status(400).json({ error: 'Use a password with at least 4 characters.' });
    let folder = '';
    try {
        assertPdf(req.file.buffer);
        folder = await tempFolder();
        const input = path.join(folder, 'input.pdf'), output = path.join(folder, 'protected.pdf');
        await writeFile(input, req.file.buffer, { mode: 0o600 });
        const result = await runCommand('qpdf', ['--encrypt', userPassword, ownerPassword, '256', '--', input, output]);
        if (result.code !== 0)
            throw new Error(result.stderr || 'Could not password-protect this PDF.');
        await sendPdf(res, await readFile(output), 'protected.pdf');
    }
    catch (error) {
        sendError(res, error, 'Could not protect this PDF.');
    }
    finally {
        await clean(folder);
    }
});
app.post('/api/pdf/unlock', pdfUpload.single('pdf'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'Upload a PDF file.' });
    const password = String(req.body.password || '');
    if (!password)
        return res.status(400).json({ error: 'Enter the PDF password.' });
    let folder = '';
    try {
        assertPdf(req.file.buffer);
        folder = await tempFolder();
        const input = path.join(folder, 'input.pdf'), output = path.join(folder, 'unlocked.pdf');
        await writeFile(input, req.file.buffer, { mode: 0o600 });
        const result = await runCommand('qpdf', [`--password=${password}`, '--decrypt', input, output]);
        if (result.code !== 0)
            throw new Error('Unable to unlock this PDF. Check the password and file permissions.');
        await sendPdf(res, await readFile(output), 'unlocked.pdf');
    }
    catch (error) {
        sendError(res, error, 'Could not unlock this PDF.');
    }
    finally {
        await clean(folder);
    }
});
const OFFICE_EXTENSIONS = new Set(['.doc', '.docx', '.odt', '.rtf', '.xls', '.xlsx', '.ods', '.ppt', '.pptx', '.odp', '.html', '.htm']);
app.post('/api/convert/office-to-pdf', anyUpload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'Choose a Word, Excel or PowerPoint file.' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!OFFICE_EXTENSIONS.has(ext))
        return res.status(400).json({ error: 'Supported formats: DOC, DOCX, ODT, RTF, XLS, XLSX, ODS, PPT, PPTX and ODP.' });
    let folder = '';
    try {
        folder = await tempFolder();
        const input = path.join(folder, `source${ext}`);
        await writeFile(input, req.file.buffer, { mode: 0o600 });
        const profile = `file://${path.join(folder, 'lo-profile')}`;
        const result = await runCommand('soffice', ['--headless', `-env:UserInstallation=${profile}`, '--convert-to', 'pdf', '--outdir', folder, input], 120_000);
        if (result.code !== 0)
            throw new Error(result.stderr || 'Office document conversion failed.');
        const output = path.join(folder, 'source.pdf');
        const buffer = await readFile(output).catch(() => null);
        if (!buffer)
            throw new Error('The document could not be converted. The file may be damaged or unsupported.');
        await sendPdf(res, buffer, `${path.basename(req.file.originalname, ext)}.pdf`);
    }
    catch (error) {
        sendError(res, error, 'Office-to-PDF conversion failed.');
    }
    finally {
        await clean(folder);
    }
});
app.post('/api/convert/pdf-to-word', pdfUpload.single('pdf'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'Upload a PDF file.' });
    let folder = '';
    try {
        assertPdf(req.file.buffer);
        folder = await tempFolder();
        const input = path.join(folder, 'input.pdf'), output = path.join(folder, 'converted.docx');
        await writeFile(input, req.file.buffer, { mode: 0o600 });
        const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/pdf_to_word.py');
        const python = process.env.PDFSTUDIO_PYTHON || 'python3';
        const result = await runCommand(python, [script, input, output], 180_000);
        if (result.code !== 0)
            throw new Error(result.stderr || 'PDF-to-Word conversion failed.');
        const buffer = await readFile(output);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename="converted.docx"');
        res.send(buffer);
    }
    catch (error) {
        sendError(res, error, 'PDF-to-Word conversion failed.');
    }
    finally {
        await clean(folder);
    }
});
app.post('/api/convert/pdf-to-excel', pdfUpload.single('pdf'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'Upload a PDF file.' });
    let folder = '';
    try {
        assertPdf(req.file.buffer);
        folder = await tempFolder();
        const input = path.join(folder, 'input.pdf'), output = path.join(folder, 'converted.xlsx');
        await writeFile(input, req.file.buffer, { mode: 0o600 });
        const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/pdf_to_excel.py');
        const result = await runCommand(process.env.PDFSTUDIO_PYTHON || 'python3', [script, input, output], 180_000);
        if (result.code !== 0)
            throw new Error(result.stderr || 'PDF-to-Excel conversion failed.');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="converted.xlsx"');
        res.send(await readFile(output));
    }
    catch (error) {
        sendError(res, error, 'PDF-to-Excel conversion failed.');
    }
    finally {
        await clean(folder);
    }
});
app.post('/api/convert/pdf-to-powerpoint', pdfUpload.single('pdf'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'Upload a PDF file.' });
    let folder = '';
    try {
        assertPdf(req.file.buffer);
        folder = await tempFolder();
        const input = path.join(folder, 'input.pdf'), output = path.join(folder, 'converted.pptx');
        await writeFile(input, req.file.buffer, { mode: 0o600 });
        const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/pdf_to_powerpoint.py');
        const result = await runCommand(process.env.PDFSTUDIO_PYTHON || 'python3', [script, input, output], 240_000);
        if (result.code !== 0)
            throw new Error(result.stderr || 'PDF-to-PowerPoint conversion failed.');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', 'attachment; filename="converted.pptx"');
        res.send(await readFile(output));
    }
    catch (error) {
        sendError(res, error, 'PDF-to-PowerPoint conversion failed.');
    }
    finally {
        await clean(folder);
    }
});
app.post('/api/pdf/ocr', pdfUpload.single('pdf'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'Upload a PDF file.' });
    let folder = '';
    try {
        assertPdf(req.file.buffer);
        folder = await tempFolder();
        const input = path.join(folder, 'input.pdf'), output = path.join(folder, 'searchable.pdf');
        await writeFile(input, req.file.buffer, { mode: 0o600 });
        const result = await runCommand('ocrmypdf', ['--skip-text', '--deskew', '--rotate-pages', '--output-type', 'pdf', input, output], 300_000);
        if (result.code !== 0)
            throw new Error(result.stderr || 'OCR processing failed.');
        await sendPdf(res, await readFile(output), 'searchable.pdf');
    }
    catch (error) {
        sendError(res, error, 'OCR processing failed.');
    }
    finally {
        await clean(folder);
    }
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
app.use((err, _req, res, _next) => {
    const status = err instanceof multer.MulterError ? 400 : 500;
    res.status(status).json({ error: err?.message || 'Unexpected server error.' });
});
async function optimizePdf(source, folder, mode, targetBytes) {
    const input = path.join(folder, 'original.pdf');
    await writeFile(input, source, { mode: 0o600 });
    // Always establish a lossless baseline first. This is also the only path
    // used by Lossless mode, so image pixels are not intentionally re-encoded.
    const lossless = await optimizePdfLosslessly(source, folder);
    let best = {
        buffer: lossless,
        engine: 'qpdf/pdf-lib',
        profile: 'Lossless structure optimization',
        downsampled: false
    };
    if (best.buffer.length >= source.length) {
        best = {
            buffer: source,
            engine: 'original',
            profile: 'Original retained; lossless pass was not smaller',
            downsampled: false
        };
    }
    if (mode === 'lossless' || best.buffer.length <= targetBytes)
        return best;
    // Recommended: recompress color/gray image streams at high visual quality
    // without reducing their pixel dimensions. This is lossy image encoding.
    const recommendedProfiles = [
        { name: 'High visual quality', qFactor: 0.15 },
        { name: 'High visual quality - stronger', qFactor: 0.22 },
        { name: 'Balanced visual quality', qFactor: 0.30 },
        { name: 'Compact visual quality', qFactor: 0.38 }
    ];
    // Extreme: progressively lower image resolution and stronger JPEG
    // recompression. This can visibly soften photographs and scanned pages.
    const extremeProfiles = [
        { name: 'Extreme - 200 DPI', qFactor: 0.26, dpi: 200 },
        { name: 'Extreme - 170 DPI', qFactor: 0.32, dpi: 170 },
        { name: 'Extreme - 140 DPI', qFactor: 0.39, dpi: 140 },
        { name: 'Extreme - 110 DPI', qFactor: 0.47, dpi: 110 }
    ];
    const profiles = mode === 'recommended' ? recommendedProfiles : extremeProfiles;
    let ghostscriptAvailable = true;
    let ghostscriptSucceeded = 0;
    let lastGhostscriptError = '';
    for (let index = 0; index < profiles.length; index++) {
        const profile = profiles[index];
        const output = path.join(folder, `compressed-${mode}-${index}.pdf`);
        try {
            await runGhostscript(input, output, profile);
            ghostscriptSucceeded++;
            const candidate = await readFile(output);
            if (candidate.subarray(0, 5).toString() !== '%PDF-')
                continue;
            if (candidate.length < best.buffer.length) {
                best = {
                    buffer: candidate,
                    engine: 'Ghostscript',
                    profile: profile.name,
                    downsampled: Boolean(profile.dpi)
                };
            }
            if (best.buffer.length <= targetBytes)
                break;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('is missing from the backend environment') || message.includes('ENOENT')) {
                ghostscriptAvailable = false;
                break;
            }
            lastGhostscriptError = message;
            // Some PDFs are not compatible with a particular rewrite profile.
            // Keep the best valid candidate and try the next profile.
        }
    }
    if (!ghostscriptAvailable) {
        throw new Error('Ghostscript is required for Recommended and Extreme compression. Rebuild the PDF Studio container using the updated Dockerfile.');
    }
    if (ghostscriptSucceeded === 0) {
        throw new Error(lastGhostscriptError || 'Ghostscript could not optimize this PDF. Try Lossless mode or another PDF file.');
    }
    return best;
}
async function optimizePdfLosslessly(source, folder) {
    const input = path.join(folder, 'lossless-input.pdf');
    const output = path.join(folder, 'optimized-qpdf.pdf');
    await writeFile(input, source, { mode: 0o600 });
    try {
        const result = await runCommand('qpdf', [
            '--stream-data=compress',
            '--recompress-flate',
            '--compression-level=9',
            '--object-streams=generate',
            input,
            output
        ]);
        if (result.code === 0 || result.code === 3) {
            const bytes = await readFile(output).catch(() => null);
            if (bytes && bytes.subarray(0, 5).toString() === '%PDF-')
                return bytes;
        }
    }
    catch {
        // Fall back to the already-installed pdf-lib package.
    }
    try {
        const document = await PDFDocument.load(source, { updateMetadata: false });
        const bytes = await document.save({
            useObjectStreams: true,
            addDefaultPage: false,
            updateFieldAppearances: false,
            objectsPerTick: 100
        });
        return Buffer.from(bytes);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown PDF parsing error.';
        throw new Error(`Lossless optimization could not process this PDF: ${detail}`);
    }
}
async function runGhostscript(input, output, profile) {
    const executable = process.platform === 'win32' ? 'gswin64c' : 'gs';
    const args = [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.7',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dSAFER',
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        '-dSubsetFonts=true',
        '-dEmbedAllFonts=true',
        '-dAutoRotatePages=/None',
        '-dPreserveAnnots=true',
        '-dCompressPages=true',
        '-dAutoFilterColorImages=false',
        '-dAutoFilterGrayImages=false',
        '-dEncodeColorImages=true',
        '-dEncodeGrayImages=true',
        '-dColorImageFilter=/DCTEncode',
        '-dGrayImageFilter=/DCTEncode',
        '-dPassThroughJPEGImages=false',
        '-dPassThroughJPXImages=false',
        `-sOutputFile=${output}`
    ];
    if (profile.dpi) {
        args.push('-dDownsampleColorImages=true', '-dDownsampleGrayImages=true', '-dDownsampleMonoImages=true', '-dColorImageDownsampleType=/Bicubic', '-dGrayImageDownsampleType=/Bicubic', '-dMonoImageDownsampleType=/Subsample', `-dColorImageResolution=${profile.dpi}`, `-dGrayImageResolution=${profile.dpi}`, `-dMonoImageResolution=${Math.max(300, profile.dpi)}`, '-dColorImageDownsampleThreshold=1.0', '-dGrayImageDownsampleThreshold=1.0', '-dMonoImageDownsampleThreshold=1.0');
    }
    else {
        args.push('-dDownsampleColorImages=false', '-dDownsampleGrayImages=false', '-dDownsampleMonoImages=false');
    }
    const imageDictionary = `<< /QFactor ${profile.qFactor} /Blend 1 /HSamples [1 1 1 1] /VSamples [1 1 1 1] >>`;
    const distillerParams = `<< /ColorImageDict ${imageDictionary} /GrayImageDict ${imageDictionary} >> setdistillerparams`;
    args.push('-c', distillerParams, '-f', input);
    const result = await runCommand(executable, args, 120_000);
    if (result.code !== 0) {
        throw new Error(result.stderr || `Ghostscript failed using profile: ${profile.name}`);
    }
}
async function tempFolder() { return mkdtemp(path.join(tmpdir(), 'pdf-studio-')); }
async function clean(folder) { if (folder)
    await rm(folder, { recursive: true, force: true }).catch(() => { }); }
function assertPdf(buffer) {
    if (buffer.subarray(0, 5).toString() !== '%PDF-')
        throw new Error('The uploaded file is not a valid PDF.');
}
async function sendPdf(res, buffer, filename) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[\r\n"\\]/g, '_')}"`);
    res.send(buffer);
}
function sendError(res, error, fallback) {
    const message = error instanceof Error ? error.message : fallback;
    const missing = message.includes('ENOENT');
    res.status(500).json({ error: missing ? 'A required document engine is unavailable. The site administrator must deploy using the included Dockerfile.' : message });
}
async function runCommand(command, args, timeoutMs = 90_000) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
        let stderr = '';
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
        child.stderr.on('data', chunk => { if (stderr.length < 20_000)
            stderr += chunk.toString(); });
        child.on('error', error => {
            clearTimeout(timer);
            const systemError = error;
            if (systemError.code === 'ENOENT') {
                reject(new Error(`Required document engine \"${command}\" is missing from the backend environment. Start PDF Studio with Podman using: podman compose up --build -d`));
            }
            else {
                reject(error);
            }
        });
        child.on('close', code => { clearTimeout(timer); resolve({ code, stderr }); });
    });
}
app.listen(PORT, '0.0.0.0', () => console.log(`PDF Studio API running on port ${PORT}`));
