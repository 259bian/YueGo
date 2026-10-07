<#
  运行全部逻辑测试与后端接口测试（Windows / PowerShell）
  需要系统 Node.js；其中的 App 端逻辑测试还需要 DevEco Studio 自带的 TypeScript 模块。
#>
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$failed = 0

$suites = @(
  @{ Name = '商品查询'; Script = 'test-catalog.cjs' },
  @{ Name = '购物逻辑'; Script = 'test-shopping.cjs' },
  @{ Name = '用户与地址'; Script = 'test-user.cjs' },
  @{ Name = '订单与支付'; Script = 'test-order.cjs' },
  @{ Name = '数据同步映射'; Script = 'test-sync.cjs' },
  @{ Name = '后端接口'; Script = 'test-api.cjs' }
)

foreach ($suite in $suites) {
  Write-Host ''
  Write-Host ("=== " + $suite.Name + " ===") -ForegroundColor Cyan
  node (Join-Path $root ('scripts\' + $suite.Script))
  if ($LASTEXITCODE -ne 0) { $failed = $failed + 1 }
}

Write-Host ''
if ($failed -eq 0) {
  Write-Host '全部测试通过。' -ForegroundColor Green
  exit 0
}
Write-Host ("有 " + $failed + " 个测试套件失败，请查看上方输出。") -ForegroundColor Red
exit 1
