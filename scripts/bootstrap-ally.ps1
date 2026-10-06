#Requires -Version 5.1
<#
.SYNOPSIS
    Prepares a ROG Ally X for agent-driven game tuning.

.DESCRIPTION
    Installs the base toolchain Claude Code needs on the Ally: Git for Windows,
    Python, Windows Terminal and Claude Code itself. Optionally enables the
    OpenSSH server so the device can be driven from another machine while a game
    runs full-screen on the handheld.

    Idempotent. Everything is checked before it is installed, so re-running is
    safe and cheap.

    Capture tooling (PresentMon, LibreHardwareMonitor) is pinned by version and
    SHA-256 hash, and discarded if the hash does not match. PresentMon emits
    different CSV columns per version, so this pinning is load-bearing.

.PARAMETER EnableSsh
    Install and start the Windows OpenSSH server, and open the firewall port.
    Requires Administrator. Strongly recommended - see docs/allytune/01.

.PARAMETER SkipClaude
    Skip the Claude Code install (useful if it is already set up).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-ally.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-ally.ps1 -EnableSsh
#>
[CmdletBinding()]
param(
    [switch]$EnableSsh,
    [switch]$SkipClaude
)

$ErrorActionPreference = 'Stop'

$script:Failures = @()

function Write-Step { param($Message) Write-Host "`n=== $Message" -ForegroundColor Cyan }
function Write-Ok   { param($Message) Write-Host "  [ok]   $Message" -ForegroundColor Green }
function Write-Info { param($Message) Write-Host "  [info] $Message" -ForegroundColor Gray }
function Write-Warn { param($Message) Write-Host "  [warn] $Message" -ForegroundColor Yellow }
function Write-Fail {
    param($Message)
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
    $script:Failures += $Message
}

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Command {
    param($Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# Windows ships zero-byte stub executables for python.exe and python3.exe that
# open the Microsoft Store rather than running anything. They live in
# WindowsApps and satisfy Get-Command perfectly, so a plain Test-Command check
# reports Python as "already present" and the real install gets skipped. This
# happened on this device: python.exe existed, was 0 bytes, and exited 9009.
function Test-RealPython {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $cmd) { return $false }
    if ($cmd.Source -like '*\WindowsApps\*') {
        $file = Get-Item $cmd.Source -ErrorAction SilentlyContinue
        if (-not $file -or $file.Length -eq 0) { return $false }
    }
    try {
        $null = & $cmd.Source --version 2>&1
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

# Downloads a pinned file and refuses to keep it if the hash does not match.
# Pinning matters here beyond the usual supply-chain argument: PresentMon's CSV
# column names change between versions, so an unpinned download would silently
# change the schema the parser sees.
function Get-PinnedFile {
    param(
        [Parameter(Mandatory)] $Url,
        [Parameter(Mandatory)] $Destination,
        [Parameter(Mandatory)] $Sha256,
        [Parameter(Mandatory)] $Label
    )

    if (Test-Path $Destination) {
        $have = (Get-FileHash $Destination -Algorithm SHA256).Hash
        if ($have -eq $Sha256) {
            Write-Ok "$Label already present and verified"
            return $true
        }
        Write-Warn "$Label present but hash differs - re-downloading"
        Remove-Item $Destination -Force
    }

    Write-Info "downloading $Label"
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing -TimeoutSec 300
    } catch {
        Write-Fail "$Label download failed: $($_.Exception.Message)"
        return $false
    }

    $got = (Get-FileHash $Destination -Algorithm SHA256).Hash
    if ($got -ne $Sha256) {
        Remove-Item $Destination -Force
        Write-Fail "$Label hash mismatch - expected $Sha256, got $got. File discarded."
        return $false
    }

    Write-Ok "$Label downloaded and hash verified"
    return $true
}

# PATH changes made by installers do not reach the running shell. Rebuild it
# from the registry so later checks in this same run can see new commands.
function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ($machine, $user | Where-Object { $_ }) -join ';'
}

# The native Claude Code installer drops claude.exe into ~\.local\bin but does
# not always add that directory to the user PATH, so a fresh install can finish
# successfully and still leave `claude` unavailable in every new terminal.
function Add-UserPathEntry {
    param([Parameter(Mandatory)] $Directory)

    $current = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @()
    if ($current) { $entries = $current -split ';' | Where-Object { $_ } }

    if ($entries -contains $Directory) {
        Write-Ok "$Directory already on the user PATH"
        return
    }

    [Environment]::SetEnvironmentVariable('Path', (($entries + $Directory) -join ';'), 'User')
    Write-Ok "added $Directory to the user PATH"
    Update-SessionPath
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory)] $Id,
        [Parameter(Mandatory)] $Label,
        $VerifyCommand
    )

    if ($VerifyCommand -and (Test-Command $VerifyCommand)) {
        Write-Ok "$Label already present"
        return $true
    }

    Write-Info "installing $Label ($Id)"
    # --disable-interactivity keeps winget from stalling on a prompt no one is
    # watching. Exit code 0x8A15002B means "already installed", not an error.
    winget install --id $Id --exact --silent --accept-package-agreements `
        --accept-source-agreements --disable-interactivity 2>&1 | Out-String | Write-Verbose

    $code = $LASTEXITCODE
    Update-SessionPath

    if ($code -eq 0 -or $code -eq -1978335189) {
        Write-Ok "$Label installed"
        return $true
    }

    Write-Fail "$Label install returned exit code $code"
    return $false
}

Write-Host @"

  allytune - Ally X bootstrap
  ---------------------------
  Installs the toolchain Claude Code needs to drive this device.

"@ -ForegroundColor White

# ---------------------------------------------------------------- environment

Write-Step "Checking environment"

$isAdmin = Test-Admin
if ($isAdmin) {
    Write-Ok "running as Administrator"
} else {
    Write-Info "running as a normal user"
    if ($EnableSsh) {
        Write-Fail "-EnableSsh needs Administrator. Re-run this script from an elevated terminal."
        $EnableSsh = $false
    }
}

$os = Get-CimInstance Win32_OperatingSystem
Write-Info "$($os.Caption) build $($os.BuildNumber)"

$sys = Get-CimInstance Win32_ComputerSystem
Write-Info "$($sys.Manufacturer) $($sys.Model)"
if ($sys.Model -notmatch 'RC72|Ally') {
    Write-Warn "this does not look like a ROG Ally - continuing anyway"
}

if (-not (Test-Command 'winget')) {
    Write-Fail "winget not found. Install 'App Installer' from the Microsoft Store, then re-run."
    Write-Host "`nCannot continue without winget.`n" -ForegroundColor Red
    exit 1
}
Write-Ok "winget available"

# ------------------------------------------------------------------ toolchain

Write-Step "Installing toolchain"

# Git for Windows matters more than it looks: it supplies Git Bash, which is
# what gives Claude Code its Bash tool. Without it Claude falls back to
# PowerShell only.
Install-WingetPackage -Id 'Git.Git' -Label 'Git for Windows' -VerifyCommand 'git' | Out-Null

if (Test-RealPython) {
    Write-Ok "Python already present"
} else {
    Write-Info "no working Python (the Microsoft Store stub does not count)"
    Install-WingetPackage -Id 'Python.Python.3.12' -Label 'Python 3.12' | Out-Null
}

Install-WingetPackage -Id 'Microsoft.WindowsTerminal' -Label 'Windows Terminal' | Out-Null

if (-not $SkipClaude) {
    if (Test-Command 'claude') {
        Write-Ok "Claude Code already present"
    } else {
        Write-Info "installing Claude Code (native installer)"
        try {
            Invoke-Expression (Invoke-RestMethod 'https://claude.ai/install.ps1')
            Update-SessionPath
            Write-Ok "Claude Code installed"
        } catch {
            Write-Fail "Claude Code install failed: $($_.Exception.Message)"
        }
    }
} else {
    Write-Info "skipping Claude Code (-SkipClaude)"
}

# Repair PATH regardless of whether this run installed Claude Code - an earlier
# run may have installed it and left PATH untouched.
$claudeBin = Join-Path $env:USERPROFILE '.local\bin'
if (Test-Path (Join-Path $claudeBin 'claude.exe')) {
    Add-UserPathEntry -Directory $claudeBin
    if (Test-Command 'claude') {
        Write-Ok "claude resolves on PATH"
    } else {
        Write-Warn "claude installed and PATH updated - open a NEW terminal to pick it up"
    }
}

# -------------------------------------------------------------- capture tools

Write-Step "Installing capture tools"

# Both versions are pinned. PresentMon in particular emits three different CSV
# column sets depending on how it is invoked, and the names differ between
# releases, so allytune parses against a known version rather than whatever is
# current. Hashes were taken from the files this project actually tested with.
$toolsDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools'
if (-not (Test-Path $toolsDir)) { New-Item -ItemType Directory -Path $toolsDir | Out-Null }

$pmExe = Join-Path $toolsDir 'PresentMon-2.5.1-x64.exe'
Get-PinnedFile `
    -Url 'https://github.com/GameTechDev/PresentMon/releases/download/v2.5.1/PresentMon-2.5.1-x64.exe' `
    -Destination $pmExe `
    -Sha256 '9BEC3083069F58F911E6A512F4806DB51A27BD096103087BC1D05EF54C80A191' `
    -Label 'PresentMon 2.5.1 (CLI)' | Out-Null

# The 0.9 MB console build, not the 150 MB MSI: allytune only drives the CLI.

$lhmZip = Join-Path $toolsDir 'LibreHardwareMonitor-0.9.6.zip'
$lhmDir = Join-Path $toolsDir 'LibreHardwareMonitor'
if (Get-PinnedFile `
        -Url 'https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/download/v0.9.6/LibreHardwareMonitor.zip' `
        -Destination $lhmZip `
        -Sha256 '086D9F1B5A99E643EDC2CFAAAC16051685B551E4C5AC0B32A57C58C0E529C001' `
        -Label 'LibreHardwareMonitor 0.9.6') {

    if (-not (Test-Path (Join-Path $lhmDir 'LibreHardwareMonitor.exe'))) {
        Expand-Archive -Path $lhmZip -DestinationPath $lhmDir -Force
    }
    Write-Ok "LibreHardwareMonitor extracted to tools\LibreHardwareMonitor"

    # Pre-seed the config so the JSON web server is on without anyone having to
    # find it in the GUI on a 7" touchscreen. LHM rewrites this file on exit.
    $lhmConfig = Join-Path $lhmDir 'LibreHardwareMonitor.config'
    if (-not (Test-Path $lhmConfig)) {
        @'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <appSettings>
    <add key="runWebServerMenuItem" value="true" />
    <add key="listenerPort" value="8085" />
    <add key="minTrayMenuItem" value="true" />
  </appSettings>
</configuration>
'@ | Out-File -FilePath $lhmConfig -Encoding utf8
        Write-Ok "LibreHardwareMonitor web server pre-configured on port 8085"
    }

    # LibreHardwareMonitor's manifest REQUIRES elevation - it will not start at
    # all from a normal user session, it just shows a UAC prompt. Verified on
    # this device. PresentMon, by contrast, captures fine unelevated.
    Write-Info "LibreHardwareMonitor must be launched as Administrator to run at all"
}

# ---------------------------------------------------------------------- ssh

if ($EnableSsh) {
    Write-Step "Enabling OpenSSH server"
    try {
        $cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server*' |
               Select-Object -First 1

        if ($cap.State -ne 'Installed') {
            Write-Info "installing the OpenSSH server capability"
            Add-WindowsCapability -Online -Name $cap.Name | Out-Null
        }
        Write-Ok "OpenSSH server present"

        Set-Service -Name sshd -StartupType Automatic
        Start-Service sshd
        Write-Ok "sshd running and set to start automatically"

        if (-not (Get-NetFirewallRule -Name 'sshd-allytune' -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -Name 'sshd-allytune' -DisplayName 'OpenSSH Server (allytune)' `
                -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
        }
        Write-Ok "firewall allows inbound TCP 22"

        # Default shell decides what you land in over SSH. PowerShell is far
        # more useful here than cmd.
        $pwshPath = (Get-Command powershell).Source
        New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell `
            -Value $pwshPath -PropertyType String -Force | Out-Null
        Write-Ok "default SSH shell set to PowerShell"

        $addresses = Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
            Select-Object -ExpandProperty IPAddress
        foreach ($a in $addresses) {
            Write-Info "reachable at: ssh $env:USERNAME@$a"
        }
    } catch {
        Write-Fail "SSH setup failed: $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------------ verify

Write-Step "Verifying"

Update-SessionPath

foreach ($tool in @(
    @{ Name = 'git';    Args = @('--version') },
    @{ Name = 'python'; Args = @('--version') },
    @{ Name = 'claude'; Args = @('--version') }
)) {
    if (Test-Command $tool.Name) {
        try {
            $version = (& $tool.Name @($tool.Args) 2>&1 | Select-Object -First 1)
            Write-Ok "$($tool.Name): $version"
        } catch {
            Write-Warn "$($tool.Name): present but did not report a version"
        }
    } else {
        Write-Warn "$($tool.Name): not on PATH in this shell (may need a new terminal)"
    }
}

# Windows ships stub executables for python.exe and python3.exe that open the
# Microsoft Store instead of running Python. They sit in WindowsApps and shadow
# a real install if they come first on PATH, producing a `python` that exists,
# runs, and reports nothing.
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd -and $pythonCmd.Source -like '*\WindowsApps\*') {
    Write-Warn "python resolves to the Microsoft Store stub at $($pythonCmd.Source)"
    Write-Info "fix: Settings > Apps > Advanced app settings > App execution aliases,"
    Write-Info "     turn OFF 'python.exe' and 'python3.exe', then open a new terminal."
    Write-Info "meanwhile 'py' launches the real Python if one is installed"

    if (Test-Command 'py') {
        try {
            $pyVersion = (& py --version 2>&1 | Select-Object -First 1)
            Write-Ok "py works: $pyVersion"
        } catch {
            Write-Warn "py is present but did not report a version either"
        }
    } else {
        Write-Fail "no working Python found - allytune needs one"
    }
}

# Memory Integrity gates the low-level driver that phase 2 power control needs.
try {
    $hvci = Get-CimInstance -ClassName Win32_DeviceGuard `
        -Namespace 'root\Microsoft\Windows\DeviceGuard' -ErrorAction Stop
    if ($hvci.SecurityServicesRunning -contains 2) {
        Write-Warn "Memory Integrity is ON - phase 2 TDP control will likely be blocked"
    } else {
        Write-Ok "Memory Integrity is off (expected for this device)"
    }
} catch {
    Write-Info "could not read Memory Integrity state"
}

# ------------------------------------------------------------------- summary

Write-Host ""
if ($script:Failures.Count -eq 0) {
    Write-Host "  Bootstrap complete." -ForegroundColor Green
    Write-Host @"

  Next:
    1. Open a NEW terminal so PATH changes take effect.
    2. cd into the repo and run:  claude
    3. Log in when prompted (Pro or Max account required).

"@ -ForegroundColor White
} else {
    Write-Host "  Bootstrap finished with $($script:Failures.Count) problem(s):" -ForegroundColor Yellow
    foreach ($f in $script:Failures) { Write-Host "    - $f" -ForegroundColor Yellow }
    Write-Host ""
    exit 1
}
