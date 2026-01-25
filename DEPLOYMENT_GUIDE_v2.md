# SMARTVAHAN V2 - Deployment Guide (v2.0)

This guide details the steps to deploy the latest changes (RBAC, PDF Naming, Dashboard Stats) to the live EC2 server.
**Note:** This deployment includes a database migration (`SUB_ADMIN` role). Follow steps carefully.

## 1. Backup Existing System (CRITICAL)

Before pulling new code, create a full backup of the database and uploaded files.

### 1.1 Database Backup
Open PowerShell/Command Prompt on the Server and run:

```powershell
# Create a backup directory if it doesn't exist
New-Item -ItemType Directory -Force -Path "C:\Backups\Deployment_$(Get-Date -Format 'yyyyMMdd')"

# Dump the PostgreSQL database (Adjust username/db name if different)
# You may be prompted for the postgres password
pg_dump -U postgres -h localhost -d smartvahan > "C:\Backups\Deployment_$(Get-Date -Format 'yyyyMMdd')\db_backup.sql"
```

### 1.2 File Backup (Uploads)
Copy the `uploads` folder to the backup directory.

```powershell
Copy-Item -Path "C:\path\to\project\backend\uploads" -Destination "C:\Backups\Deployment_$(Get-Date -Format 'yyyyMMdd')\uploads" -Recurse
```

---

## 2. Deploy Fresh Code

We will use `git reset --hard` to ensure the local code matches `origin/main` exactly, removing any local conflicts.

### 2.1 Pull Latest Code
Navigate to the project root directory.

```powershell
cd "C:\path\to\project\SMARTVAHAN V2"

# Fetch all latest changes from remote
git fetch --all

# HARD RESET to match remote main branch (Warning: Discards local changes)
git reset --hard origin/main
```

---

## 3. Backend Deployment

### 3.1 Install Dependencies & Build
```powershell
cd backend

# Install new dependencies (if any)
npm install

# Build the NestJS application
npm run build
```

### 3.2 Database Migration (REQUIRED)
This deployment adds the `SUB_ADMIN` role to the `UserRole` enum.

```powershell
# Run migrations against the production database
npx prisma migrate deploy
```

### 3.3 Restart Backend Service
Restart the PM2 process to apply changes.

```powershell
# Restart all PM2 processes
pm2 restart all

# OR restart specific process
# pm2 restart smartvahan-backend
```

---

## 4. Frontend Deployment

### 4.1 Install & Build
```powershell
cd ../frontend

# Install dependencies
npm install

# Build the React application (Vite)
npm run build
```

### 4.2 Update IIS / Web Server
Copy the built files from `frontend/dist` to your IIS hosting directory.

```powershell
# Example: Copy dist to IIS wwwroot
# Adjust destination path to your actual IIS site folder
Copy-Item -Path ".\dist\*" -Destination "C:\inetpub\wwwroot\smartvahan" -Recurse -Force
```

---

## 5. Verification Checklist

1.  **Login**: Try logging in as `SUPER_ADMIN`.
2.  **Dashboard**: Verify that stats are visible.
3.  **RBAC**:
    *   Login as `DEALER`: Check that "Total QR Issued" and "Active Dealers" widgets are HIDDEN.
    *   Login as `ADMIN`: Check that "QR Generation" menu is visible but "Generate Batch" button is HIDDEN/Disabled.
4.  **Certificate**: Generate a test certificate and verify the PDF filename format is `{VehicleNumber}-{RTO}{QR}.pdf`.
