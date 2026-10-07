<#
  启动悦购后端服务（Windows / PowerShell）
  用法：
    powershell -ExecutionPolicy Bypass -File .\scripts\server.ps1
    powershell -ExecutionPolicy Bypass -File .\scripts\server.ps1 -Port 8899
  说明：使用系统 Node.js。若未安装 Node，请先安装 Node 18 或更高版本。
#>
param(
  [int]$Port = 8787,
  [string]$Database = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$entry = Join-Path $root 'server\server.js'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host '未找到 Node.js。请先安装 Node 18+ 后重试。' -ForegroundColor Red
  exit 1
}

$env:YUEGO_PORT = "$Port"
if ($Database -ne '') { $env:YUEGO_DB = $Database }

Write-Host "正在启动悦购后端： http://localhost:$Port/api/health" -ForegroundColor Green
if ($Database -ne '') { Write-Host "数据库文件：$Database" } else { Write-Host "数据库文件：$root\server\data\yuego.json" }
Write-Host '按 Ctrl+C 停止服务。'
& $node.Source $entry
