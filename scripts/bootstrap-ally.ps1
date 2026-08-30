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

    Capture tooling (PresentMon, LibreHardwareMonitor) is deliberately NOT
    installed here - it arrives with allytune phase 1, which pins and verifies
    specific versions.

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

# PATH changes made by installers do not reach the running shell. Rebuild it
# from the registry so later checks in this same run can see new commands.
function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ($machine, $user | Where-Object { $_ }) -join ';'
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

Install-WingetPackage -Id 'Python.Python.3.12' -Label 'Python 3.12' -VerifyCommand 'python' | Out-Null

Install-WingetPackage -Id 'Microsoft.WindowsTerminal' -Label 'Windows Terminal' | Out-Null

if (-not $SkipClaude) {
    if (Test-Command 'claude') {
        Write-Ok "Claude Code already present"
    } else {
        Write-Info "installing Claude Code (native installer)"
        try {
            Invoke-Expression (Invoke-RestMethod 'https://claude.ai/install.ps1')
            Update-SessionPath
            if (Test-Command 'claude') {
                Write-Ok "Claude Code installed"
            } else {
                Write-Warn "installer ran but 'claude' is not on PATH yet - open a new terminal and check"
            }
        } catch {
            Write-Fail "Claude Code install failed: $($_.Exception.Message)"
        }
    }
} else {
    Write-Info "skipping Claude Code (-SkipClaude)"
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
