import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/client";

type User = {
  id: string;
  name: string;
  role: "SUPER_ADMIN" | "STATE_ADMIN" | "OEM_ADMIN" | "DEALER_USER";
  phone: string;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  signIn: (phone: string, password: string) => Promise<boolean>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("sv_auth");
      return stored ? JSON.parse(stored).user : null;
    } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem("sv_auth");
      return stored ? JSON.parse(stored).token : null;
    } catch { return null; }
  });

  const signIn = async (phone: string, password: string) => {
    try {
      const res = await api.post("/auth/login", {
        phone: phone.trim(),
        password: password.trim()
      });
      
      const data = res.data;
      if (!data?.ok) return false;

      setUser(data.user);
      setToken(data.accessToken);
      localStorage.setItem("sv_auth", JSON.stringify({ user: data.user, token: data.accessToken }));
      return true;
    } catch (err) {
      console.error("Login error:", err);
      return false;
    }
  };

  const signOut = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("sv_auth");
  };

  const value = useMemo(
    () => ({ user, token, isAuthenticated: !!user && !!token, signIn, signOut }),
    [user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext missing");
  return ctx;
}
