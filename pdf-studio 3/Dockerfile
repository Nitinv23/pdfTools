# Build frontend and Node.js API.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm install --include=dev
COPY . .
RUN npm run build

# Runtime includes all server-side conversion engines. Website visitors need no local installs.
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       qpdf ocrmypdf tesseract-ocr poppler-utils \
       libreoffice-writer libreoffice-calc libreoffice-impress \
       python3 python3-venv python3-pip \
       fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/pdfstudio-venv \
    && /opt/pdfstudio-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/pdfstudio-venv/bin/pip install --no-cache-dir pdf2docx==0.5.8 pdfplumber==0.11.4 openpyxl==3.1.5 pdf2image==1.17.0 python-pptx==1.0.2

# Added as a separate layer so existing qpdf/LibreOffice/OCR layers remain cacheable.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ghostscript \
    && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/pdfstudio-venv/bin:${PATH}"
ENV PDFSTUDIO_PYTHON="/opt/pdfstudio-venv/bin/python"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/client/package.json ./client/package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/scripts ./server/scripts
EXPOSE 8787
CMD ["npm", "start"]
