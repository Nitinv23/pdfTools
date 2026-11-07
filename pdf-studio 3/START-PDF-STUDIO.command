#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo ""
echo "  PDF Studio — Podman launcher"
echo ""
if ! command -v podman >/dev/null 2>&1; then
  echo "Podman is required. Install Podman Desktop, then retry."
  exit 1
fi
# On macOS, ensure the Podman virtual machine is available.
podman machine start >/dev/null 2>&1 || true
if ! podman compose version >/dev/null 2>&1; then
  echo "Podman Compose provider is not configured."
  echo "Open Podman Desktop Settings and install/enable Compose, then run this script again."
  exit 1
fi
echo "Building and starting PDF Studio. Document engines are installed inside the container."
podman compose up --build -d
echo ""
echo "PDF Studio should be available at: http://localhost:8787"
echo "Health check: http://localhost:8787/api/health"
echo "View logs: podman compose logs -f pdf-studio"
echo "Stop: podman compose down"
if command -v open >/dev/null 2>&1; then open http://localhost:8787 || true; fi
