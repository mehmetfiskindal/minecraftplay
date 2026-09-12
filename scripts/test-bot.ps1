$out = "$env:TEMP\opencode\bot.out"
$err = "$env:TEMP\opencode\bot.err"
Remove-Item $out, $err -ErrorAction SilentlyContinue
$p = Start-Process "C:\Program Files\nodejs\node.exe" -ArgumentList "C:\Users\salih\minecraftplay\bot\index.js" -WorkingDirectory "C:\Users\salih\minecraftplay\bot" -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
Start-Sleep 6
$p.Kill()
"=== OUT ==="
Get-Content $out -Tail 4
"=== ERR ==="
Get-Content $err -Tail 4
