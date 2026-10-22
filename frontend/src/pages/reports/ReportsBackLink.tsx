import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function ReportsBackLink() {
  const basePath = localStorage.getItem("isGhostMode") === "true" ? "/control/rp" : "/control";
  return (
    <Link
      to={`${basePath}/reports`}
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-3"
    >
      <ArrowLeft className="w-4 h-4" />
      All Reports
    </Link>
  );
}
