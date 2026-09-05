#Requires -Version 5.1
<#
.SYNOPSIS
    Let the allytune dashboard be reached from a phone on the same WiFi.

.DESCRIPTION
    Two things stop it by default on this machine:

    1. Two explicit inbound BLOCK rules for python.exe on the Private profile.
       These get created when the "Allow Python to communicate on networks?"
       prompt is dismissed or denied. Windows Firewall gives Block rules
       priority over Allow rules, so adding an allow rule alone does nothing --
       the blocks have to be disabled first.

    2. No allow rule for the dashboard port.

    The allow rule added here is deliberately narrow: TCP 8777 only, the Private
    profile only, and only from devices on the local subnet. The dashboard is
    read-only -- it has no route that writes anything -- and it is not exposed to
    the internet.

    Needs Administrator. Firewall changes always do.

.PARAMETER Undo
    Reverse everything: remove the allow rule and re-enable the python blocks.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\allow-dashboard-firewall.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\allow-dashboard-firewall.ps1 -Undo
#>
[CmdletBinding()]
param(
    [switch]$Undo,
    [int]$Port = 8777
)

$ErrorActionPreference = 'Stop'
$RuleName = 'allytune dashboard'

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $admin) {
    Write-Host ""
    Write-Host "  This needs Administrator." -ForegroundColor Red
    Write-Host "  Firewall rules cannot be changed from a normal terminal, and the" -ForegroundColor Gray
    Write-Host "  commands fail quietly rather than telling you." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Re-run it elevated with:" -ForegroundColor White
    Write-Host "    Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy','Bypass','-File','$PSCommandPath'" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

function Get-PythonBlockRules {
    Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue |
        Where-Object { $_.Program -like '*Python*' } |
        ForEach-Object { $_ | Get-NetFirewallRule -ErrorAction SilentlyContinue } |
        Where-Object { $_.Action -eq 'Block' -and $_.Direction -eq 'Inbound' }
}

if ($Undo) {
    Write-Host "`n  Reversing`n" -ForegroundColor Cyan

    $rule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    if ($rule) {
        Remove-NetFirewallRule -DisplayName $RuleName
        Write-Host "  [ok]   removed the '$RuleName' allow rule" -ForegroundColor Green
    } else {
        Write-Host "  [info] no '$RuleName' rule to remove" -ForegroundColor Gray
    }

    $blocked = Get-PythonBlockRules | Where-Object { -not $_.Enabled }
    if ($blocked) {
        $blocked | Enable-NetFirewallRule
        Write-Host "  [ok]   re-enabled $(@($blocked).Count) python block rule(s)" -ForegroundColor Green
    } else {
        Write-Host "  [info] no disabled python block rules to restore" -ForegroundColor Gray
    }
    Write-Host ""
    exit 0
}

Write-Host "`n  Opening port $Port for the allytune dashboard`n" -ForegroundColor Cyan

# 1. Disable the blocks. Block wins over Allow in Windows Firewall, so this
#    must happen first or the allow rule below is inert.
$blocks = Get-PythonBlockRules | Where-Object { $_.Enabled }
if ($blocks) {
    $blocks | Disable-NetFirewallRule
    Write-Host "  [ok]   disabled $(@($blocks).Count) inbound BLOCK rule(s) for python" -ForegroundColor Green
} else {
    Write-Host "  [info] no active python block rules found" -ForegroundColor Gray
}

# 2. Narrow allow rule.
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  [info] '$RuleName' rule already exists" -ForegroundColor Gray
} else {
    New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol TCP `
        -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet -Action Allow | Out-Null
    Write-Host "  [ok]   allowed TCP $Port inbound, Private profile, local subnet only" -ForegroundColor Green
}

# 3. Report the address to actually type into the phone.
$ip = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Sort-Object -Property @{ E = { $_.InterfaceAlias -eq 'Wi-Fi' } } -Descending |
      Select-Object -First 1

Write-Host ""
Write-Host "  On your phone, on the same WiFi, open:" -ForegroundColor White
Write-Host "    http://$($ip.IPAddress):$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "  The dashboard must be running: python -m allytune dashboard" -ForegroundColor Gray
Write-Host "  To undo:  ...\allow-dashboard-firewall.ps1 -Undo" -ForegroundColor Gray
Write-Host ""
