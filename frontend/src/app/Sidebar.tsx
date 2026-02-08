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
  RefreshCcw,
  Package
} from "lucide-react";

const items = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/qr-generation", label: "QR Generator", icon: QrCode },
  { path: "/inventory", label: "Inventory", icon: Package },
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

  const hasAccess = (path: string) => {
    const role = user?.role;
    if (!role) return false;
    
    // Ghost Mode Logic
    const isGhostMode = localStorage.getItem('isGhostMode') === 'true';
    if (isGhostMode) {
        // In Ghost Mode, HIDE Dealers, Settings, User Management
        if (path === "/settings") return false;
        if (path === "users-section") return false;
        if (path === "/reports/dealer") return false; // Hide Dealer Report specifically if needed, but "Reports" section is generic.
        // Requirement says "Dealers/Settings remains only with main dashboard".
        // Also "Ghost dashboard Stats, Reports, Inventory only shows certificate...". So Reports/Inventory are allowed.
    }

    // Special handling for DEALER role mapping if needed (DEALER vs DEALER_USER)
    // Assuming 'DEALER' is also a valid role string or mapped to 'DEALER_USER'
    const isDealer = role === 'DEALER_USER' || role === 'DEALER';

    switch (path) {
        case "/": // Dashboard
            return true;
        case "/qr-generation":
            return ["SUPER_ADMIN", "ADMIN"].includes(role);
        case "/inventory":
            return ["SUPER_ADMIN", "ADMIN", "STATE_ADMIN", "OEM_ADMIN", "SUB_ADMIN"].includes(role); // Dealer No Access
        case "/activate-qr":
            return ["SUPER_ADMIN"].includes(role);
        case "/certificate":
            // "Certificate Generator"
            return ["SUPER_ADMIN", "ADMIN"].includes(role) || isDealer;
        case "/search-qr":
            return ["SUPER_ADMIN", "ADMIN", "OEM_ADMIN", "SUB_ADMIN"].includes(role);
        case "/search-cert":
            return ["SUPER_ADMIN", "ADMIN", "OEM_ADMIN", "SUB_ADMIN"].includes(role);
        case "/download":
            // SUB_ADMIN: No Access
            return ["SUPER_ADMIN", "ADMIN", "STATE_ADMIN", "OEM_ADMIN"].includes(role) || isDealer;
        case "/audit":
            return ["SUPER_ADMIN", "ADMIN"].includes(role);
        case "/settings":
            return ["SUPER_ADMIN"].includes(role);
        case "reports-section":
             // SUB_ADMIN, DEALER: No Access
             return ["SUPER_ADMIN", "ADMIN", "STATE_ADMIN", "OEM_ADMIN"].includes(role);
        case "users-section":
             // Only SUPER_ADMIN and ADMIN
             return ["SUPER_ADMIN", "ADMIN"].includes(role);
        default:
            return true;
    }
  };

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
          {items.filter(item => hasAccess(item.path)).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => ItemClass(isActive)}>
                <Icon className="w-5 h-5" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
          
          {/* Collapsible: Reports */}
          {hasAccess("reports-section") && (
              <>
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
                     {/* State Report: Everyone except Dealer/SubAdmin? No, prompt says: 
                        ADMIN: Full
                        STATE_ADMIN: State Specific
                        OEM_ADMIN: Restricted (RTO & DEALER REPORT)
                     */}
                     {user?.role !== 'OEM_ADMIN' && (
                         <>
                            <NavLink to="/reports/state" className={({ isActive }) => ItemClass(isActive)}>
                                <Map className="w-4 h-4" />
                                <span>State Report</span>
                            </NavLink>
                            <NavLink to="/reports/oem" className={({ isActive }) => ItemClass(isActive)}>
                                <Building2 className="w-4 h-4" />
                                <span>OEM Report</span>
                            </NavLink>
                         </>
                     )}
                     <NavLink to="/reports/rto" className={({ isActive }) => ItemClass(isActive)}>
                        <FileBarChart2 className="w-4 h-4" />
                        <span>RTO Report</span>
                    </NavLink>
                    <NavLink to="/reports/dealer" className={({ isActive }) => ItemClass(isActive)}>
                        <Users className="w-4 h-4" />
                        <span>Dealer Report</span>
                    </NavLink>
                    </div>
                )}
              </>
          )}

          {/* Collapsible: User Management */}
          {hasAccess("users-section") && (
              <>
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
                    {/* ADMIN: Only Dealers. SUPER_ADMIN: All */}
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
              </>
          )}

        </nav>

        <div className="px-3 py-4 mt-auto text-xs text-gray-500">
          {!collapsed && <div>Made with ❤️ By Brand Eagles</div>}
        </div>
      </div>
    </aside>
  );
}
