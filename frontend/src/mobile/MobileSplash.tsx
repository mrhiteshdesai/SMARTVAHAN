import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function MobileSplash() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        navigate("/app/home", { replace: true });
      } else {
        navigate("/app/login", { replace: true });
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [navigate, isAuthenticated]);
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-20 h-20 bg-blue-600 rounded-xl"></div>
        <div className="text-xl font-bold">SMARTVAHAN</div>
        <div className="text-sm text-gray-500">Dealer Certificate App</div>
      </div>
    </div>
  );
}
