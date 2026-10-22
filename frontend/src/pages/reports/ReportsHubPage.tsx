import { useNavigate } from "react-router-dom";
import {
  Map,
  Building2,
  FileBarChart2,
  Users,
  ChevronRight,
  Layers,
  Gauge,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

type ReportCard = {
  title: string;
  description: string;
  path: string;
  icon: typeof FileBarChart2;
};

export default function ReportsHubPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role ? String(user.role) : "";
  const isGhostMode = localStorage.getItem("isGhostMode") === "true";
  const basePath = isGhostMode ? "/control/rp" : "/control";

  const showReflectiveStateOem = role !== "OEM_ADMIN";
  const showSldSection =
    !isGhostMode && (role === "SUPER_ADMIN" || role === "ADMIN");
  const showDealerReport = !isGhostMode;

  const reflectiveReports: ReportCard[] = [
    ...(showReflectiveStateOem
      ? [
          {
            title: "State Report",
            description: "Certificate summary by state and product",
            path: `${basePath}/reports/state`,
            icon: Map,
          },
          {
            title: "OEM Report",
            description: "Certificate and stock summary by Reflective OEM",
            path: `${basePath}/reports/oem`,
            icon: Building2,
          },
        ]
      : []),
    {
      title: "RTO Report",
      description: "Registration RTO wise certificate issuance",
      path: `${basePath}/reports/rto`,
      icon: FileBarChart2,
    },
    {
      title: "Passing RTO Report",
      description: "Passing RTO wise certificate issuance",
      path: `${basePath}/reports/passing-rto`,
      icon: FileBarChart2,
    },
    ...(showDealerReport
      ? [
          {
            title: "Dealer Report",
            description: "Dealer wise fitment and certificate performance",
            path: `${basePath}/reports/dealer`,
            icon: Users,
          },
        ]
      : []),
  ];

  const sldReports: ReportCard[] = [
    {
      title: "State Report",
      description: "SLD certificate summary by state",
      path: `${basePath}/reports/sld/state`,
      icon: Map,
    },
    {
      title: "OEM Report",
      description: "SLD certificate summary by SLD OEM",
      path: `${basePath}/reports/sld/oem`,
      icon: Building2,
    },
    {
      title: "Dealer Report",
      description: "Dealer wise SLD certificate performance",
      path: `${basePath}/reports/sld/dealer`,
      icon: Users,
    },
  ];

  const renderSection = (
    title: string,
    subtitle: string,
    SectionIcon: typeof Layers,
    cards: ReportCard[],
  ) => (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <SectionIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.path}
              type="button"
              onClick={() => navigate(card.path)}
              className="group text-left rounded-xl border bg-white p-5 shadow-sm hover:border-primary/40 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-lg bg-gray-50 p-2.5 text-gray-700 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors mt-1" />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">{card.title}</h3>
              <p className="mt-1 text-sm text-gray-500 leading-snug">{card.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="p-6 space-y-10 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose a report by module. More report types can be added here as modules grow.
        </p>
      </div>

      {renderSection(
        "Reflective Reports",
        "QR / reflective tape certificates and related summaries",
        Layers,
        reflectiveReports,
      )}

      {showSldSection &&
        renderSection(
          "SLD Reports",
          "Speed limiting device certificates and related summaries",
          Gauge,
          sldReports,
        )}
    </div>
  );
}
