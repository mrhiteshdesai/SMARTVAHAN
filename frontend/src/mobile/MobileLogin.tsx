import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export default function MobileLogin() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logo, setLogo] = useState("");

  useEffect(() => {
    try {
      const settings = JSON.parse(localStorage.getItem("sv_settings") || "{}");
      if (settings.systemLogo) {
        setLogo(settings.systemLogo);
      }
    } catch {
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const ok = await signIn(phone, password);
      if (ok) {
        navigate("/app/home");
      } else {
        setError("Invalid credentials");
      }
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-slate-900 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {logo ? (
            <img src={logo} alt="Logo" className="h-20 w-auto object-contain drop-shadow-md" />
          ) : (
            <div className="w-16 h-16 bg-white/10 rounded-2xl border border-white/20" />
          )}
          <div className="mt-3 text-xl font-semibold text-white tracking-wide">SMARTVAHAN</div>
          <div className="text-xs text-indigo-100 mt-1">Dealer Login</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-5 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                className="mt-1 w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                placeholder="Enter phone number"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="mt-1 w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                placeholder="Enter password"
                required
              />
            </div>
            {error && <div className="text-red-600 text-xs">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-medium shadow-md active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
