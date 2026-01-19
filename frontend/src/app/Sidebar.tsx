import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  QrCode,
  FileBadge2,
  Search,
  Download,
  Users,
  FileBarChart2,
  ShieldCheck,
  Settings,
  FileSearch,
  Map,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RefreshCcw
} from "lucide-react";

const items = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/qr-generation", label: "QR Generator", icon: QrCode },
  { path: "/activate-qr", label: "Reactivate QR Code", icon: RefreshCcw },
  { path: "/certificate", label: "Certificate Generator", icon: FileBadge2 },
  { path: "/search-qr", label: "Search QR Code", icon: Search },
  { path: "/search-cert", label: "Search Certificate", icon: FileSearch },
  { path: "/download", label: "Download Data", icon: Download },
  { path: "/audit", label: "Audit Logs", icon: ShieldCheck },
  { path: "/settings", label: "Settings", icon: Settings }
];

import { useAuth } from "../auth/AuthContext";

export default function Sidebar() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [openUsers, setOpenUsers] = useState(false);
  const [openReports, setOpenReports] = useState(false);

  const ItemClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-3 rounded-md text-sm ${
      isActive ? "bg-primary/10 text-primary" : "hover:bg-gray-100 text-gray-700"
    }`;

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-64"} border-r bg-white h-[calc(100vh-3.5rem)] sticky top-[3.5rem] z-20 overflow-y-auto transition-all duration-200`}
    >
      <div className="h-full flex flex-col">
        <div className="p-3 flex items-center justify-between">
          {!collapsed && <div className="font-semibold text-sm">Navigation</div>}
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md border px-2 py-1 hover:bg-gray-50"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="px-3 space-y-1 flex-1">
          {/* Top-level items */}
          {items.filter(item => {
            if (user?.role === 'ADMIN') {
              if (item.path === '/settings') return false;
            }
            return true;
          }).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => ItemClass(isActive)}>
                <Icon className="w-5 h-5" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}

          {/* Collapsible: User Management */}
          <button
            className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm hover:bg-gray-100 text-gray-700"
            onClick={() => setOpenUsers((v) => !v)}
            aria-expanded={openUsers}
          >
            <Users className="w-5 h-5" />
            {!collapsed && (
              <>
                <span>User Management</span>
                <span className="ml-auto">{openUsers ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
              </>
            )}
          </button>
          {!collapsed && openUsers && (
            <div className="ml-8 space-y-1">
              {user?.role !== 'ADMIN' && (
                <>
                  <NavLink to="/users/states" className={({ isActive }) => ItemClass(isActive)}>
                    <Map className="w-4 h-4" />
                    <span>States</span>
                  </NavLink>
                  <NavLink to="/users/oems" className={({ isActive }) => ItemClass(isActive)}>
                    <Building2 className="w-4 h-4" />
                    <span>OEMs</span>
                  </NavLink>
                </>
              )}
              <NavLink to="/users/dealers" className={({ isActive }) => ItemClass(isActive)}>
                <Users className="w-4 h-4" />
                <span>Dealers</span>
              </NavLink>
              {user?.role !== 'ADMIN' && (
                <NavLink to="/users/system" className={({ isActive }) => ItemClass(isActive)}>
                  <ShieldCheck className="w-4 h-4" />
                  <span>System Users</span>
                </NavLink>
              )}
            </div>
          )}

          {/* Collapsible: Reports */}
          <button
            className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm hover:bg-gray-100 text-gray-700"
            onClick={() => setOpenReports((v) => !v)}
            aria-expanded={openReports}
          >
            <FileBarChart2 className="w-5 h-5" />
            {!collapsed && (
              <>
                <span>Reports</span>
                <span className="ml-auto">{openReports ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
              </>
            )}
          </button>
          {!collapsed && openReports && (
            <div className="ml-8 space-y-1">
              <NavLink to="/reports/states" className={({ isActive }) => ItemClass(isActive)}>
                <Map className="w-4 h-4" />
                <span>States Reports</span>
              </NavLink>
              <NavLink to="/reports/oems" className={({ isActive }) => ItemClass(isActive)}>
                <Building2 className="w-4 h-4" />
                <span>OEMs Reports</span>
              </NavLink>
              <NavLink to="/reports/material" className={({ isActive }) => ItemClass(isActive)}>
                <FileBadge2 className="w-4 h-4" />
                <span>Material Reports</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="px-3 py-4 mt-auto text-xs text-gray-500">
          {!collapsed && <div>Made with ❤️ By Brand Eagles</div>}
        </div>
      </div>
    </aside>
  );
}
