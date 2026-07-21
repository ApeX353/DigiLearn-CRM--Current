# Starts the local MySQL server that holds the restored live dump.
# 100% local: binds to 127.0.0.1 only. Data lives in C:\Users\8Y14\mysql-local\data
$base = "C:\Users\8Y14\mysql-local\PFiles64\MySQL\MySQL Server 8.0"
$data = "C:\Users\8Y14\mysql-local\data"

$conn = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -WarningAction SilentlyContinue
if ($conn.TcpTestSucceeded) { Write-Host "MySQL already listening on 127.0.0.1:3306"; return }

Start-Process -FilePath "$base\bin\mysqld.exe" `
  -ArgumentList "--basedir=`"$base`"", "--datadir=`"$data`"", "--port=3306", "--bind-address=127.0.0.1", "--local-infile=ON", "--console" `
  -WindowStyle Hidden
Start-Sleep -Seconds 6
$conn = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -WarningAction SilentlyContinue
Write-Host "MySQL listening on 127.0.0.1:3306 : $($conn.TcpTestSucceeded)"
# To stop: & "$base\bin\mysqladmin.exe" -u root shutdown
