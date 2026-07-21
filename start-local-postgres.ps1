# Starts the portable local PostgreSQL 16 (no system install). All local.
# Binaries: C:\Users\8Y14\pgsql-local\pgsql   Data: C:\Users\8Y14\pgsql-local\data
# Superuser: postgres / localdev   Port: 5433 (5432 is taken by a system postgresql-x64-18 service)
# Stop with:  & "C:\Users\8Y14\pgsql-local\pgsql\bin\pg_ctl.exe" -D "C:\Users\8Y14\pgsql-local\data" stop
$pg   = "C:\Users\8Y14\pgsql-local\pgsql"
$data = "C:\Users\8Y14\pgsql-local\data"
& "$pg\bin\pg_ctl.exe" -D $data -l "C:\Users\8Y14\pgsql-local\postgres.log" start
