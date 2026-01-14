# SYSTEM STATE LOG - 2026-01-12

## Current Architecture
- **Frontend**: React (Vite) + TypeScript + Tailwind CSS
- **Backend**: NestJS (Basic shell, no DB connected)
- **Data Persistence**: `localStorage` (Browser-side only)
- **Authentication**: 
  - Frontend checks `localStorage` for `sv_auth`.
  - Backend has a mock `AuthService` with hardcoded Super Admin (`8888320669` / `123456`).
- **Role-Based Access Control (RBAC)**:
  - Frontend: UI hiding based on logic.
  - Backend: None.

## Key Files & State
### Frontend (`/frontend/src`)
- **Auth**: `auth/AuthContext.tsx` - Manages `user` and `token` state from `localStorage`.
- **Navigation**: `App.tsx` - Contains Routes and `ProtectedRoute` (checks `isAuthenticated` only).
- **Pages**:
  - `Login.tsx`: Calls `/api/auth/login`.
  - `Dashboard.tsx`: Static/Mock data.
  - `states/StatesPage.tsx`: CRUD using `localStorage.getItem("sv_states")`.
  - `dealers/DealersPage.tsx`: CRUD using `localStorage.getItem("sv_dealers")`.
  - `users/SystemUsersPage.tsx`: CRUD using `localStorage.getItem("sv_system_users")`.
- **Config**: `vite.config.ts` - Proxy `/api` to `http://localhost:3000`.

### Backend (`/backend/src`)
- **Auth**: `auth/auth.service.ts` - Hardcoded validation.
- **Main**: `main.ts` - Bootstrap on port 3000.

## Functional Status
- Login works with hardcoded credentials.
- State/Dealer/User management works but data is local to the browser.
- No real security or data relationships enforced.

## Restore Point
To restore this state:
1. Revert `AuthContext.tsx` to read from `localStorage`.
2. Revert Page components to read/write `localStorage`.
3. Remove Prisma and Database connection code from Backend.
