import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logo, setLogo] = useState("");

  useEffect(() => {
    try {
      const settings = JSON.parse(localStorage.getItem("sv_settings") || "{}");
      if (settings.systemLogo) {
        setLogo(settings.systemLogo);
      }
    } catch (e) {
      console.error("Failed to load branding", e);
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await signIn(phone, password);
    setLoading(false);
    if (ok) navigate("/", { replace: true });
    else setError("Invalid credentials");
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div
        className="hidden md:block bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1549921296-3b4a72fefe5e?q=80&w=1600&auto=format&fit=crop')"
        }}
      >
        <div className="w-full h-full bg-gradient-to-t from-black/40 to-black/10"></div>
      </div>
      <div className="flex items-center justify-center p-8 bg-white">
        <form onSubmit={onSubmit} className="w-full max-w-md space-y-6">
          <div className="space-y-1">
            <div className="flex flex-col items-center gap-2 mb-4">
              {logo ? (
                <img src={logo} alt="Logo" className="h-32 w-auto object-contain" />
              ) : (
                <div className="w-20 h-20 bg-primary rounded-sm"></div>
              )}
              <div className="text-2xl font-semibold mt-2">SMARTVAHAN</div>
            </div>
            <p className="text-sm text-gray-600 text-center">Sign in to continue</p>
          </div>
          <div className="space-y-2">
            <label className="block text-sm">Mobile Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Enter mobile number"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Enter password"
              required
            />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary text-white py-2.5 font-medium hover:bg-indigo-600 transition disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <div className="text-xs text-gray-500">
            By continuing, you agree to the Terms and acknowledge the Privacy Policy.
          </div>
        </form>
      </div>
    </div>
  );
}
