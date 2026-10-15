import { useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { Guard, useAuth } from "./auth";
import { mockMode } from "./api";
import { ErrorNotice, Field, fieldErrors } from "./ui";
import { EmployeeList, EmployeeDetail, EmployeeEditor } from "./employees";
import { Catalog } from "./catalog";
function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  if (auth.user)
    return (
      <Navigate
        to={auth.user.role === "ADMIN" ? "/employees" : "/me"}
        replace
      />
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const user = await auth.login(loginId, password);
      navigate(user.role === "ADMIN" ? "/employees" : "/me", { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  const errors = fieldErrors(error);
  return (
    <main className="login">
      <div className="brand">
        EMS <span>PEOPLE & ORGANIZATION</span>
      </div>
      <h1>함께 일하는 사람들</h1>
      <p className="muted">사원과 조직 정보를 한곳에서 관리하세요.</p>
      <form onSubmit={submit}>
        <ErrorNotice error={error} />
        <Field name="loginId" label="아이디 (사번)" error={errors.loginId}>
          <input
            id="loginId"
            required
            autoComplete="username"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
          />
        </Field>
        <Field name="password" label="비밀번호" error={errors.password}>
          <input
            id="password"
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button className="primary" disabled={pending}>
          {pending ? "로그인 중…" : "로그인"}
        </button>
      </form>
      {mockMode && (
        <aside className="demo">
          <strong>목업 데모 모드</strong>
          <p>
            관리자: admin / 일반 사원: EMP001
            <br />
            공통 데모 비밀번호: demo1234!
          </p>
          <small>새로고침하면 합성 데이터와 로그인 세션이 초기화됩니다.</small>
        </aside>
      )}
    </main>
  );
}
function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          EMS <span>사원관리 시스템</span>
        </Link>
        <nav aria-label="주 메뉴">
          {user?.role === "ADMIN" && (
            <>
              <NavLink to="/employees">사원 관리</NavLink>
              <NavLink to="/departments">부서 관리</NavLink>
              <NavLink to="/positions">직급 관리</NavLink>
            </>
          )}
          <NavLink to="/me">내 정보</NavLink>
        </nav>
        <div className="sidebar-bottom">
          {mockMode ? "합성 데이터 · 목업 모드" : "실제 API 모드"}
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>
            {user?.name}{" "}
            <small>{user?.role === "ADMIN" ? "관리자" : "일반 사원"}</small>
          </span>
          <button onClick={logout}>로그아웃</button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
function Home() {
  const { user } = useAuth();
  return (
    <Navigate to={user?.role === "ADMIN" ? "/employees" : "/me"} replace />
  );
}
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard />}>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/me" element={<EmployeeDetail self />} />
          <Route path="/employees/:id" element={<EmployeeDetail />} />
          <Route element={<Guard admin />}>
            <Route path="/employees" element={<EmployeeList />} />
            <Route path="/employees/new" element={<EmployeeEditor />} />
            <Route path="/employees/:id/edit" element={<EmployeeEditor />} />
            <Route
              path="/departments"
              element={<Catalog kind="departments" key="departments" />}
            />
            <Route
              path="/positions"
              element={<Catalog kind="positions" key="positions" />}
            />
          </Route>
          <Route
            path="*"
            element={
              <section>
                <h1>페이지를 찾을 수 없습니다</h1>
                <Link to="/">홈으로 이동</Link>
              </section>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
