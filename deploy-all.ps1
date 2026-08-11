# TrustEngine — Auto Deploy All Edge Functions
# Save as: C:\Users\THE PRO ONE\TrustEngine\deploy-all.ps1
# Right-click → Run with PowerShell

$ErrorActionPreference = "Continue"
$projectRoot = "C:\Users\THE PRO ONE\TrustEngine"

Write-Host "🚀 TrustEngine Edge Function Deployer" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# List of functions to deploy
$functions = @(
    "create-qr-session",
    "submit-feedback",
    "validate-qr-session",
    "get-feedback",
    "send-sms-alert",
    "send-email",
    "invite-staff",
    "create-checkout-session",
    "stripe-webhook"
)

$failed = @()
$success = @()

Set-Location $projectRoot

foreach ($func in $functions) {
    Write-Host "Deploying $func..." -ForegroundColor Yellow -NoNewline
    try {
        $output = npx supabase functions deploy $func 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✅ DONE" -ForegroundColor Green
            $success += $func
        } else {
            Write-Host " ❌ FAILED" -ForegroundColor Red
            Write-Host "   Error: $output" -ForegroundColor DarkRed
            $failed += $func
        }
    } catch {
        Write-Host " ❌ FAILED" -ForegroundColor Red
        Write-Host "   Error: $_" -ForegroundColor DarkRed
        $failed += $func
    }
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "DEPLOY SUMMARY:" -ForegroundColor Cyan
Write-Host "Success: $($success.Count)" -ForegroundColor Green
Write-Host "Failed:  $($failed.Count)" -ForegroundColor Red

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "FAILED FUNCTIONS:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Run individually to see full error:" -ForegroundColor Yellow
    $failed | ForEach-Object { Write-Host "  npx supabase functions deploy $_" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "Done! Press any key to exit..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
