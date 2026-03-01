$ErrorActionPreference = "Stop"

$Repo = "Stoffberg/relay"
$InstallDir = if ($env:RELAY_INSTALL_DIR) { $env:RELAY_INSTALL_DIR } else { "$env:USERPROFILE\.local\bin" }

$Target = "x86_64-pc-windows-msvc"
$Asset = "relay-$Target.zip"

Write-Host "Detected platform: $Target"

try {
    $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    $Tag = $Release.tag_name
} catch {
    Write-Host "Error: could not determine latest release."
    Write-Host "Check https://github.com/$Repo/releases for available versions."
    exit 1
}

$Url = "https://github.com/$Repo/releases/download/$Tag/$Asset"

Write-Host "Downloading Relay $Tag for $Target..."

$TmpDir = Join-Path $env:TEMP "relay-install-$(Get-Random)"
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

try {
    Invoke-WebRequest -Uri $Url -OutFile "$TmpDir\$Asset" -UseBasicParsing
} catch {
    Write-Host ""
    Write-Host "Error: download failed."
    Write-Host "There may not be a pre-built binary for your platform yet."
    Write-Host ""
    Write-Host "You can build from source instead:"
    Write-Host "  cargo install --git https://github.com/$Repo relay-agent"
    Write-Host ""
    Write-Host "Or check available releases at:"
    Write-Host "  https://github.com/$Repo/releases"
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
    exit 1
}

Expand-Archive -Path "$TmpDir\$Asset" -DestinationPath $TmpDir -Force

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Move-Item -Path "$TmpDir\relay.exe" -Destination "$InstallDir\relay.exe" -Force

Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Relay $Tag installed to $InstallDir\relay.exe"

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    Write-Host ""
    Write-Host "Adding $InstallDir to your PATH..."
    [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$UserPath", "User")
    $env:Path = "$InstallDir;$env:Path"
    Write-Host "Done. Restart your terminal for PATH changes to take effect."
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "  relay setup    # connect to your Relay account"
Write-Host "  relay start    # start the agent in your project"
