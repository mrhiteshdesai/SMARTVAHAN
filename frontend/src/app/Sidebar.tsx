import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
  Package,
  Gauge,
  Layers,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const reflectiveMisItems = [
  { path: "/qr-generation", label: "QR Generator", icon: QrCode },
  { path: "/ghost-qr", label: "Ghost QR Manager", icon: ShieldCheck },
  { path: "/inventory", label: "QR Inventory", icon: Package },
  { path: "/certificate", label: "Certificate Generator", icon: FileBadge2 },
  { path: "/search-qr", label: "Search QR Code", icon: Search },
  { path: "/search-cert", label: "Search Certificate", icon: FileSearch },
  { path: "/download", label: "Download Data", icon: Download },
];

const sldMisItems = [
  { path: "/sld/oems", label: "SLD OEMs", icon: Building2 },
  { path: "/sld/inventory", label: "SLD Inventory", icon: Gauge },
  { path: "/sld/certificates", label: "SLD Certificates", icon: FileBadge2 },
];

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [openReflective, setOpenReflective] = useState(false);
  const [openSld, setOpenSld] = useState(false);
  const [openReports, setOpenReports] = useState(false);
  const [openUsers, setOpenUsers] = useState(false);
  const basePath = localStorage.getItem("isGhostMode") === "true" ? "/control/rp" : "/control";

  useEffect(() => {
    const p = location.pathname;
    if (
      p.includes("/qr-generation") ||
      p.includes("/ghost-qr") ||
      p.includes("/inventory") ||
      p.includes("/certificate") ||
      p.includes("/search-qr") ||
      p.includes("/search-cert") ||
      p.includes("/download")
    ) {
      setOpenReflective(true);
    }
    if (p.includes("/sld/")) {
      setOpenSld(true);
    }
    if (p.includes("/reports/")) {
      setOpenReports(true);
    }
    if (p.includes("/users/")) {
      setOpenUsers(true);
    }
  }, [location.pathname]);

  const ItemClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-3 rounded-md text-sm ${
      isActive ? "bg-primary/10 text-primary" : "hover:bg-gray-100 text-gray-700"
    }`;

  const hasAccess = (path: string) => {
    const role = user?.role;
    if (!role) return false;
    const roleValue = role as string;
    const isGhostMode = localStorage.getItem("isGhostMode") === "true";
    const isDealer = roleValue === "DEALER_USER" || roleValue === "DEALER";
    const isSldAdmin = roleValue === "SLD_ADMIN";
    const hasReflective =
      user?.hasReflectiveAccess === true ||
      (typeof user?.oems === "string" && user.oems.trim().length > 0);
    const hasSld =
      user?.hasSldAccess === true ||
      (Array.isArray(user?.sldOems) && user.sldOems.length > 0);

    if (isGhostMode) {
      if (roleValue !== "GHOST_ADMIN") return false;
      if (path === "/settings") return false;
      if (path === "users-section") return false;
      if (path === "sld-section") return false;
      if (path === "/reports/dealer") return false;
    }

    switch (path) {
      case "":
        return true;
      case "/qr-generation":
        return isGhostMode ? roleValue === "GHOST_ADMIN" : ["SUPER_ADMIN", "ADMIN", "GHOST_ADMIN"].includes(roleValue);
      case "/ghost-qr":
        return isGhostMode ? roleValue === "GHOST_ADMIN" : false;
      case "/inventory":
        return ["SUPER_ADMIN", "ADMIN", "STATE_ADMIN", "OEM_ADMIN", "SUB_ADMIN", "GHOST_ADMIN"].includes(roleValue);
      case "/certificate":
        // Reflective Certificate Generator is admin-only (not for dealers)
        return ["SUPER_ADMIN", "ADMIN", "GHOST_ADMIN"].includes(roleValue);
      case "/search-qr":
        return ["SUPER_ADMIN", "ADMIN", "OEM_ADMIN", "SUB_ADMIN", "GHOST_ADMIN"].includes(roleValue);
      case "/search-cert":
        return ["SUPER_ADMIN", "ADMIN", "OEM_ADMIN", "SUB_ADMIN", "GHOST_ADMIN"].includes(roleValue);
      case "/download":
        if (["SUPER_ADMIN", "ADMIN", "STATE_ADMIN", "OEM_ADMIN", "GHOST_ADMIN"].includes(roleValue)) return true;
        return isDealer && hasReflective;
      case "/settings":
        return ["SUPER_ADMIN"].includes(roleValue);
      case "reports-section":
        return ["SUPER_ADMIN", "ADMIN", "STATE_ADMIN", "OEM_ADMIN", "GHOST_ADMIN"].includes(roleValue);
      case "users-section":
        return ["SUPER_ADMIN", "ADMIN"].includes(roleValue);
      case "sld-section":
        if (isGhostMode) return false;
        if (["SUPER_ADMIN", "ADMIN"].includes(roleValue)) return true;
        if (isSldAdmin) return hasSld;
        return isDealer && hasSld;
      case "/sld/oems":
        return ["SUPER_ADMIN", "ADMIN"].includes(roleValue);
      case "/sld/inventory":
        if (["SUPER_ADMIN", "ADMIN"].includes(roleValue)) return true;
        return isDealer && hasSld;
      case "/sld/certificates":
        if (["SUPER_ADMIN", "ADMIN"].includes(roleValue)) return true;
        if (isSldAdmin) return hasSld;
        return isDealer && hasSld;
      default:
        return true;
    }
  };

  const visibleReflectiveItems = reflectiveMisItems.filter((item) => hasAccess(item.path));
  const showReflectiveSection = visibleReflectiveItems.length > 0;
  const visibleSldItems = sldMisItems.filter((item) => hasAccess(item.path));
  const showSldSection = hasAccess("sld-section") && visibleSldItems.length > 0;

  const firstReflectivePath = visibleReflectiveItems[0]?.path ?? "/qr-generation";
  const firstSldPath = visibleSldItems[0]?.path ?? "/sld/inventory";

  const renderCollapsibleSection = (
    title: string,
    icon: typeof Layers,
    open: boolean,
    setOpen: (v: boolean) => void,
    collapsedNavigate: string,
    children: ReactNode,
  ) => {
    const Icon = icon;
    return (
      <>
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm hover:bg-gray-100 text-gray-700"
          onClick={() => {
            if (collapsed) {
              navigate(`${basePath}${collapsedNavigate}`);
              return;
            }
            setOpen(!open);
          }}
          aria-expanded={open}
        >
          <Icon className="w-5 h-5" />
          {!collapsed && (
            <>
              <span>{title}</span>
              <span className="ml-auto">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
            </>
          )}
        </button>
        {!collapsed && open && <div className="ml-8 space-y-1">{children}</div>}
      </>
    );
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
          {/* 1. Dashboard */}
          <NavLink to={`${basePath}`} end className={({ isActive }) => ItemClass(isActive)}>
            <LayoutDashboard className="w-5 h-5" />
            {!collapsed && <span>Dashboard</span>}
          </NavLink>

          {/* 2. Reflective MIS */}
          {showReflectiveSection &&
            renderCollapsibleSection(
              "Reflective MIS",
              Layers,
              openReflective,
              setOpenReflective,
              firstReflectivePath,
              visibleReflectiveItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <NavLink key={item.path} to={`${basePath}${item.path}`} className={({ isActive }) => ItemClass(isActive)}>
                    <ItemIcon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              }),
            )}

          {/* 3. SLD MIS */}
          {showSldSection &&
            renderCollapsibleSection(
              "SLD MIS",
              Gauge,
              openSld,
              setOpenSld,
              firstSldPath,
              visibleSldItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <NavLink key={item.path} to={`${basePath}${item.path}`} className={({ isActive }) => ItemClass(isActive)}>
                    <ItemIcon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              }),
            )}

          {/* 4. Reports */}
          {hasAccess("reports-section") &&
            renderCollapsibleSection(
              "Reports",
              FileBarChart2,
              openReports,
              setOpenReports,
              "/reports/state",
              <>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Ref. Reports
                </div>
                {user?.role !== "OEM_ADMIN" && (
                  <>
                    <NavLink to={`${basePath}/reports/state`} className={({ isActive }) => ItemClass(isActive)}>
                      <Map className="w-4 h-4" />
                      <span>Ref. State Report</span>
                    </NavLink>
                    <NavLink to={`${basePath}/reports/oem`} className={({ isActive }) => ItemClass(isActive)}>
                      <Building2 className="w-4 h-4" />
                      <span>Ref. OEM Report</span>
                    </NavLink>
                  </>
                )}
                <NavLink to={`${basePath}/reports/rto`} className={({ isActive }) => ItemClass(isActive)}>
                  <FileBarChart2 className="w-4 h-4" />
                  <span>Ref. Reg. RTO Report</span>
                </NavLink>
                <NavLink to={`${basePath}/reports/passing-rto`} className={({ isActive }) => ItemClass(isActive)}>
                  <FileBarChart2 className="w-4 h-4" />
                  <span>Ref. Passing RTO Report</span>
                </NavLink>
                <NavLink to={`${basePath}/reports/dealer`} className={({ isActive }) => ItemClass(isActive)}>
                  <Users className="w-4 h-4" />
                  <span>Ref. Dealer Report</span>
                </NavLink>
                {hasAccess("sld-section") && (
                  <>
                    <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      SLD Reports
                    </div>
                    <NavLink to={`${basePath}/reports/sld/state`} className={({ isActive }) => ItemClass(isActive)}>
                      <FileBarChart2 className="w-4 h-4" />
                      <span>SLD State Report</span>
                    </NavLink>
                    <NavLink to={`${basePath}/reports/sld/oem`} className={({ isActive }) => ItemClass(isActive)}>
                      <FileBarChart2 className="w-4 h-4" />
                      <span>SLD OEM Report</span>
                    </NavLink>
                    <NavLink to={`${basePath}/reports/sld/dealer`} className={({ isActive }) => ItemClass(isActive)}>
                      <Users className="w-4 h-4" />
                      <span>SLD Dealer Report</span>
                    </NavLink>
                  </>
                )}
              </>,
            )}

          {/* 5. User Management */}
          {hasAccess("users-section") &&
            renderCollapsibleSection(
              "User Management",
              Users,
              openUsers,
              setOpenUsers,
              "/users/dealers",
              <>
                {user?.role !== "ADMIN" && (
                  <>
                    <NavLink to={`${basePath}/users/states`} className={({ isActive }) => ItemClass(isActive)}>
                      <Map className="w-4 h-4" />
                      <span>States</span>
                    </NavLink>
                    <NavLink to={`${basePath}/users/oems`} className={({ isActive }) => ItemClass(isActive)}>
                      <Building2 className="w-4 h-4" />
                      <span>OEMs</span>
                    </NavLink>
                  </>
                )}
                <NavLink to={`${basePath}/users/dealers`} className={({ isActive }) => ItemClass(isActive)}>
                  <Users className="w-4 h-4" />
                  <span>Dealers</span>
                </NavLink>
                {user?.role !== "ADMIN" && (
                  <NavLink to={`${basePath}/users/system`} className={({ isActive }) => ItemClass(isActive)}>
                    <ShieldCheck className="w-4 h-4" />
                    <span>System Users</span>
                  </NavLink>
                )}
              </>,
            )}

          {/* 6. Settings */}
          {hasAccess("/settings") && (
            <NavLink to={`${basePath}/settings`} className={({ isActive }) => ItemClass(isActive)}>
              <Settings className="w-5 h-5" />
              {!collapsed && <span>Settings</span>}
            </NavLink>
          )}
        </nav>

        <div className="px-3 py-4 mt-auto text-xs text-gray-500">
          {!collapsed && <div>Made with ❤️ By Brand Eagles</div>}
        </div>
      </div>
    </aside>
  );
}
