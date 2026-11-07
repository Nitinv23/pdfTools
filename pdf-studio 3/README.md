# PDF Studio v1.5.2

A full-stack, browser-based PDF toolkit. Visitors use the hosted website without installing anything. The included Docker image installs the server-side document engines.

## Included tools

### Organize and edit
- Merge PDFs, split by page range or into individual files, rotate pages, and visually organize/reorder/remove pages.
- Add text watermarks, page numbers, text annotations, and drawn signatures.
- Crop page margins, resize to A4/A3/Letter/Legal, edit document metadata, and fill interactive AcroForm fields.

### Convert
- JPG/PNG/WebP images to PDF; PDF pages to JPG/PNG ZIP.
- Word/Excel/PowerPoint/OpenDocument/RTF to PDF using LibreOffice.
- PDF to Word (DOCX), PDF to Excel (detected tables), PDF to PowerPoint (each page as a slide image), and PDF to text.
- OCR scanned PDFs into searchable PDFs.

### Optimize and secure
- PDF compression with three modes: Lossless, Recommended, and Extreme. A requested maximum size is a target, not a guarantee.
  - Lossless optimizes PDF structure and does not intentionally re-encode or downsample image data.
  - Recommended re-encodes color and grayscale images at high visual quality while retaining pixel dimensions. It is lossy, so subtle image changes are possible.
  - Extreme applies stronger image compression and progressive downsampling to get smaller files. It may visibly reduce image quality.
- Password protect and unlock with the supplied password.
- Text-based comparison of two PDFs.

## Compression notes

Recommended compression progressively tries several high-visual-quality image recompression profiles without changing image pixel dimensions. Extreme compression progressively tries stronger profiles and lower resolutions. The service returns the smallest valid candidate that it generated without making the PDF larger than the original; the requested maximum size is not guaranteed. Keep the original and inspect compressed output, especially for scans, signatures, forms, and documents intended for printing.

Ghostscript is installed inside the runtime container through the included Dockerfile. If you update from an earlier PDF Studio version, rebuild the container once with `podman compose up --build -d` so Ghostscript is added to the image. No separate Mac installation or npm package install is needed.

## Important conversion notes
- PDF-to-Word conversion may need manual formatting cleanup, especially for complex layouts and scans.
- PDF-to-Excel extracts detected tables; it cannot reliably infer tables from every document. OCR scanned PDFs first.
- PDF-to-PowerPoint creates one slide image per PDF page; slide contents are not individually editable.
- OCR quality depends on scan clarity and the language installed in the server image (English is included by default).
- The signature tool creates an electronic signature image, not a certificate-based digital signature.
- Fill PDF Forms supports interactive PDF form fields. It cannot fill a flat scanned form automatically.

## Deploy (recommended)

Use a Docker-compatible container host with persistent application availability, sufficient RAM, and adequate temporary disk space. On a Mac with Podman Desktop, run:

```bash
podman machine start
podman compose up --build -d
```

For Docker-compatible environments, `docker compose up --build -d` also works. The included `START-PDF-STUDIO.command` launcher is configured for Podman on macOS. The backend container installs qpdf, Ghostscript, LibreOffice and OCR engines; do not start the project with `npm run dev` when testing server-side compression/conversion features.

The app is served on port 8787. Put it behind HTTPS and a reverse proxy for public use. Visitors only need a modern browser; they do not install Ghostscript, qpdf, LibreOffice, Python, OCR, or other processing tools. These are bundled in the server container.

## Local development

The `npm run dev` workflow starts the frontend and API on your host machine. Server-side Lossless compression requires qpdf; Recommended and Extreme compression require Ghostscript. For a no-extra-engine local setup, use the Podman container workflow above instead.

## Production considerations before public launch
- Configure upload limits, request rate limits, processing concurrency, and job timeouts to match your hosting plan.
- Use HTTPS, a restrictive CORS policy, and a reverse proxy request-size limit.
- Add malware scanning if your threat model requires it. Never execute uploaded files.
- Temporary server files are created with restrictive permissions and deleted after each request.
- Add monitoring and resource quotas; OCR and Office conversions can be CPU/RAM intensive.
- Test representative PDFs and Office files before enabling public traffic.


## Compression modes (v1.5)

- **Lossless:** qpdf / pdf-lib structural optimization. Does not intentionally recompress or downsample embedded images.
- **Recommended:** Ghostscript recompresses color and grayscale image streams at high visual quality without reducing image dimensions. This is lossy; subtle visual changes are possible.
- **Extreme:** Ghostscript progressively lowers image quality and downsamples color/grayscale images to try to meet the requested maximum size. Inspect the output carefully.

The selected target is a maximum-size goal, not a guarantee. The app tests progressively stronger profiles and returns the smallest valid output that it can generate without making the file larger than the original. Rewriting a PDF can affect unsupported interactive features, signatures, forms, or unusual PDF constructs; keep the original file.


## v1.5.1 additions

- Added JPG to JPEG and JPEG to JPG extension conversion. JPG and JPEG are the same JPEG image format, so this preserves the source bytes and changes only the extension (no re-encoding).
- Downloads now preserve the uploaded filename as the base name and append an operation suffix, such as `_compressed`, `_split`, `_merged`, `_rotated`, `_watermarked`, `_edited`, `_converted`, or `_signed`.
- Split-every-page and PDF-to-images archives use the source filename as the prefix and include page numbers in each archive entry.


## v1.5.2 additions

- Added **JPG to JPEG** and **JPEG to JPG** tools under Convert Images. JPG and JPEG are extension variants of the same JPEG format, so the tool preserves image bytes and changes only the extension without re-encoding.
- Output files now retain the uploaded file's base name and append an operation suffix. Examples: `invoice_compressed.pdf`, `report_merged.pdf`, `contract_rotated.pdf`, `scan_split.pdf`, and `photo_converted.jpeg`.
- Multi-file and page-export archives use the source base name and numbered entries, e.g. `scan_page-001_split.pdf` or `report_page-001_converted.jpg`.


## Split deployment: Netlify frontend + Render backend

This repository is prepared for separate hosting:

- **Netlify** hosts the React/Vite frontend from `client/dist`.
- **Render** runs the Node.js API and native document engines in the root Dockerfile.
- The frontend calls the backend directly using `VITE_API_BASE_URL`; do not route long-running document processing through a Netlify `/api` proxy.

### Netlify settings

Connect this repository to Netlify and use the repository root as the base directory.

- Build command: `npm run build --workspace client`
- Publish directory: `client/dist`
- Environment variable: `VITE_API_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com`

Set `VITE_API_BASE_URL` to the actual Render service URL (no trailing slash), then trigger a new Netlify deploy. The `netlify.toml` file in this repository contains the build and SPA fallback configuration.

### Render settings

Create a Web Service from the same Git repository:

- Runtime: Docker
- Root directory: repository root
- Dockerfile path: `./Dockerfile`
- Health check path: `/api/health`
- Environment variable: `CORS_ORIGIN=https://YOUR-SITE.netlify.app`
- Optional upload limit: `MAX_FILE_BYTES=104857600` (100 MB)

Replace the example URLs with the actual deployment URLs. For a custom frontend domain, include it in `CORS_ORIGIN`; multiple allowed origins can be comma-separated. Do not hard-code Render's `PORT`; the backend reads the platform-provided `PORT` automatically.

After setting `CORS_ORIGIN`, redeploy the Render service. Check `https://YOUR-RENDER-SERVICE.onrender.com/api/health` and then test uploads, compression, conversions, and downloads from the Netlify site.

### Local development with Podman Desktop

```bash
podman machine start
podman compose up --build -d
```

Open `http://localhost:8787`. For local Vite development, `npm run dev` uses the `/api` proxy in `client/vite.config.ts`; native document engines are available when the backend is run in the container.

### Deployment caveats

- Netlify only serves the frontend. PDF processing stays on the Render container.
- The Render backend requires a Docker-compatible service because Ghostscript, qpdf, LibreOffice, Python conversion packages and OCR engines are installed in the Docker image.
- No database is required by this version.
- Configure suitable CPU, memory, request timeouts, concurrency limits and temporary-disk capacity before public launch. OCR and Office conversions can be resource intensive.
- Test representative documents before public use. PDF-to-Word/Excel and PDF-to-PowerPoint results may require manual formatting cleanup.
