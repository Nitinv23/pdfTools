@echo off
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is required to run PDF Studio locally.
  echo Install it from https://www.docker.com/products/docker-desktop/
  pause
  exit /b 1
)
echo Building and starting PDF Studio. The container includes qpdf.
echo Open http://localhost:8787 when ready.
docker compose up --build
pause
