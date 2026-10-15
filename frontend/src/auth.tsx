import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Outlet } from "react-router-dom";
import { request, send, TOKEN_KEY } from "./api";
import type { User } from "./types";
interface Auth {
  user: User | null;
  loading: boolean;
  error: string;
  login: (loginId: string, password: string) => Promise<User>;
  logout: () => void;
  retry: () => void;
}
const Context = createContext<Auth>(null!);
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const clear = () => {
      setUser(null);
      setError("");
    };
    window.addEventListener("ems:unauthorized", clear);
    return () => window.removeEventListener("ems:unauthorized", clear);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    request<User>("/auth/me")
      .then((u) => {
        if (active) setUser(u);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setError("");
  };
  const login = async (loginId: string, password: string) => {
    const result = await send<{ accessToken: string; user: User }>(
      "/auth/login",
      "POST",
      { loginId, password },
    );
    sessionStorage.setItem(TOKEN_KEY, result.accessToken);
    setUser(result.user);
    setError("");
    return result.user;
  };
  return (
    <Context.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        retry: () => setRevision((n) => n + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function Guard({ admin = false }: { admin?: boolean }) {
  const auth = useAuth();
  if (auth.loading)
    return <p role="status">로그인 정보를 확인하고 있습니다…</p>;
  if (auth.error && sessionStorage.getItem(TOKEN_KEY))
    return (
      <section role="alert">
        <p>{auth.error}</p>
        <button onClick={auth.retry}>다시 시도</button>
        <button onClick={auth.logout}>로그아웃</button>
      </section>
    );
  if (!auth.user) return <Navigate to="/login" replace />;
  if (admin && auth.user.role !== "ADMIN")
    return (
      <section role="alert">
        <h1>권한이 없습니다</h1>
        <p>이 화면은 관리자만 사용할 수 있습니다.</p>
      </section>
    );
  return <Outlet />;
}
