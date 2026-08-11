# TrustEngine: Fix Deploy (run this in PowerShell at project root)
Write-Host "Deploying create-qr-session..." -ForegroundColor Cyan
npx supabase functions deploy create-qr-session

Write-Host "`nDeploying get-feedback..." -ForegroundColor Cyan
npx supabase functions deploy get-feedback

Write-Host "`n✅ Done!" -ForegroundColor Green
