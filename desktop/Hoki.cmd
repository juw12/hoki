@echo off
rem Start the Hoki lucky cat on your desktop (no install needed).
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0hoki-widget.ps1"
