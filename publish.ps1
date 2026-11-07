# Publish Hoki to GitHub Pages (https://juw12.github.io/hoki/).
# Run:  powershell -ExecutionPolicy Bypass -File publish.ps1
# Needs: GitHub CLI (gh) logged in as juw12. Safe to run again: it only pushes new commits.

Set-Location $PSScriptRoot
$repo = 'juw12/hoki'

gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Log in first: gh auth login'
    exit 1
}

if (-not ((git remote) -contains 'origin')) {
    gh repo view $repo *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Creating public repo $repo ..."
        gh repo create $repo --public --description 'Hoki: a waving Chinese lucky cat for your home screen and Windows desktop. Tap it for a luck boost.' --homepage 'https://juw12.github.io/hoki/' --source . --remote origin
        if ($LASTEXITCODE -ne 0) {
            exit 1
        }
    } else {
        git remote add origin "https://github.com/$repo.git"
    }
}

Write-Host 'Pushing commits ...'
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    exit 1
}

Write-Host 'Enabling GitHub Pages (branch main, root) ...'
gh api -X POST "repos/$repo/pages" -f 'source[branch]=main' -f 'source[path]=/' *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Pages already enabled (or enable it in Settings -> Pages).'
}

Write-Host ''
Write-Host 'Done. Live in 1-2 minutes at: https://juw12.github.io/hoki/'
