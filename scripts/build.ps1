param([string]$DevEcoPath = 'D:\school-2026\DevEco Studio')
$ErrorActionPreference = 'Stop'
$previousJava = $env:JAVA_HOME
$previousSdk = $env:DEVECO_SDK_HOME
try {
  $env:JAVA_HOME = Join-Path $DevEcoPath 'jbr'
  $env:DEVECO_SDK_HOME = Join-Path $DevEcoPath 'sdk'
  Push-Location (Split-Path $PSScriptRoot -Parent)
  try {
    & (Join-Path $DevEcoPath 'tools\node\node.exe') (Join-Path $DevEcoPath 'tools\hvigor\bin\hvigorw.js') --mode module -p product=default -p module=entry@default assembleHap --no-daemon
    $result = $LASTEXITCODE
  } finally { Pop-Location }
} finally {
  $env:JAVA_HOME = $previousJava
  $env:DEVECO_SDK_HOME = $previousSdk
}
exit $result
