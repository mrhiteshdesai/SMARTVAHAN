# SmartVahan V2 Deployment Guide (EC2 / Windows Server)

This guide covers the steps to deploy the latest code to your live server, including automated backups.

## Prerequisites
- **PowerShell** (Run as Administrator recommended)
- **Node.js & npm** installed
- **Git** installed
- **PostgreSQL** installed (and `pg_dump` accessible)
- **PM2** installed globally (`npm install -g pm2`)

---

## Quick Deployment (Recommended)

We have provided a PowerShell script `server_backup_and_deploy.ps1` that handles:
1.  **Backup**: Database, Uploads, and Code.
2.  **Update**: Git pull.
3.  **Build**: Backend and Frontend.
4.  **Deploy**: Database migrations and PM2 restart.

### How to use:

1.  **First Time Setup**:
    Open `server_backup_and_deploy.ps1` in a text editor and update the **CONFIGURATION** section at the top:
    ```powershell
    $ProjectRoot = "C:\path\to\SMARTVAHAN_V2"
    $BackupRoot  = "C:\Backups\SmartVahan"
    $DbUser      = "postgres"
    ```

2.  **Run Deployment**:
    Open PowerShell, navigate to your project folder, and run:
    ```powershell
    .\server_backup_and_deploy.ps1
    ```

---

## Manual Deployment Steps

If you prefer to run commands manually, follow these steps.

### 1. Pre-Deployment Backup

**Backup Database:**
```powershell
pg_dump -U postgres -d smartvahan_db -f "C:\Backups\db_backup_$(Get-Date -Format 'yyyyMMdd').sql"
```

**Backup Critical Files (Uploads):**
```powershell
Robocopy "C:\path\to\project\backend\uploads" "C:\Backups\uploads_backup" /E
```

### 2. Pull Latest Code
```powershell
cd C:\path\to\SMARTVAHAN_V2
git pull origin main
```

### 3. Backend Deployment
```powershell
cd backend
npm install
npm run build
npx prisma migrate deploy
pm2 restart backend
```

### 4. Frontend Deployment
```powershell
cd ../frontend
npm install
npm run build
```
*The build output is in `frontend/dist`. Ensure IIS points to this folder.*

---

## Troubleshooting

-   **Database Password**: If `pg_dump` fails due to password, set the environment variable before running the script:
    ```powershell
    $env:PGPASSWORD='your_db_password'
    .\server_backup_and_deploy.ps1
    ```
-   **PM2 Not Found**: Ensure PM2 is in your system PATH. If not, use the full path to `pm2.cmd`.
