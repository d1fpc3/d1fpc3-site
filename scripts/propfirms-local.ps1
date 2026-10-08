# Prop firm prices from D1's PC (10/8/26).
#
# GitHub's runners are walled out of Apex and Lucid: Cloudflare turns datacenter IPs away even for a real
# Chrome, while this PC's home connection gets through. Task Scheduler ("Echelon propfirms refresh") runs this
# at 06:40 on weekdays, before the 07:20 ET Actions run, from a dedicated clone outside OneDrive so it never
# touches a working tree. The Actions run after it keeps these reads (a walled firm read here in the last three
# days is left alone there).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\propfirms-local.ps1
$ErrorActionPreference = 'Continue'
$root = Join-Path $env:USERPROFILE '.propfirms'
$repo = Join-Path $root 'd1fpc3-site'
$log = Join-Path $root ('logs\' + (Get-Date -Format 'yyyy-MM-dd') + '.log')
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
Start-Transcript -Path $log -Append | Out-Null
$code = 0
try {
  if (-not (Test-Path (Join-Path $repo '.git'))) { git clone --depth 30 https://github.com/d1fpc3/d1fpc3-site.git $repo }
  git -C $repo fetch --depth 30 origin main
  git -C $repo reset --hard origin/main
  Push-Location $repo
  node scripts/propfirms-refresh.mjs
  $code = $LASTEXITCODE
  git diff --quiet -- echelon/propfirms/propfirms.json
  if ($LASTEXITCODE -ne 0) {
    git add echelon/propfirms/propfirms.json
    git commit -m "propfirms: prices refreshed from the firms' pages (home PC)"
    git push origin HEAD:main
    if ($LASTEXITCODE -ne 0) { git pull --rebase origin main; git push origin HEAD:main }
    # a push with D1's own credentials starts deploy.yml by itself (only a GITHUB_TOKEN push needs a dispatch)
  }
  Pop-Location
} finally {
  Stop-Transcript | Out-Null
}
exit $code
