-- Least-privilege runtime login for the API.
-- Run once, AFTER migrations, as an administrator. Replace the password (store it in Key Vault / app settings).
-- The API needs only DML; schema changes are applied by the migration step with a separate admin login.

-- On SQL Server (in master):
--   CREATE LOGIN auraops_app WITH PASSWORD = '<strong-password>';
-- On Azure SQL you can instead create a contained user directly in the AuraOps database:
--   CREATE USER auraops_app WITH PASSWORD = '<strong-password>';

USE AuraOps;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'auraops_app')
    CREATE USER auraops_app FOR LOGIN auraops_app;
GO
ALTER ROLE db_datareader ADD MEMBER auraops_app;
ALTER ROLE db_datawriter ADD MEMBER auraops_app;
-- Maintenance history is append-only: the application never needs to change or remove it.
DENY UPDATE, DELETE ON dbo.MaintenanceHistory TO auraops_app;
GO
