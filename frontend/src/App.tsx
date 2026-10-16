import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { Guard, useAuth } from "./auth";
import { mockMode } from "./api";
import { ErrorNotice, Field, fieldErrors } from "./ui";
import { EmployeeList, EmployeeDetail, EmployeeEditor } from "./employees";
import { Catalog } from "./catalog";
import { Dashboard } from "./dashboard";
import { ImportEmployees } from "./files";
import { AuditLogs } from "./audit";
import { Attendance } from "./attendance";
import { Leaves, LeaveDetail } from "./leaves";
import { NotificationBell } from "./notifications";
import { Organization } from "./organization";
import { SalarySettings, PayrollList, PayrollMonthDetail, MyPayslips, PayslipDetail } from "./payroll";
import { EvaluationCycles, EvaluationCycleCreate, EvaluationCycleDetail, EvaluationList, AssignedEvaluations, EvaluationDetail } from "./evaluations";
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
        to={auth.user.role === "ADMIN" ? "/dashboard" : "/me"}
        replace
      />
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const user = await auth.login(loginId, password);
      navigate(user.role === "ADMIN" ? "/dashboard" : "/me", { replace: true });
    } catch (e) {
      setError(e);
      setPassword("");
      document.getElementById("password")?.focus();
    } finally {
      setPending(false);
    }
  }
  const errors = fieldErrors(error);
  return (
    <main className="login">
      <div className="brand">
        EMS <span>사원관리 시스템</span>
      </div>
      <h1>EMS 로그인</h1>
      <p className="muted">사번과 비밀번호로 로그인하세요.</p>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const group = pathname.startsWith("/admin/") || ["/job-titles","/departments","/positions","/dashboard","/audit-logs"].includes(pathname) || pathname.startsWith("/employees") ? "관리" : "내 업무";
  const pageName = pathname === "/organization" ? "조직도"
    : pathname === "/job-titles" ? "직책 관리"
    : pathname.startsWith("/admin/payroll") ? "데모 급여 관리"
    : pathname.startsWith("/my/payslips") ? "내 급여명세서"
    : pathname.startsWith("/admin/reviews") ? "평가 주기 관리"
    : pathname.startsWith("/evaluations/") ? "평가서"
    : pathname.startsWith("/my/evaluations") ? "내 평가"
    : pathname.startsWith("/assigned-evaluations") ? "담당 평가"
    : pathname.startsWith("/my/attendance")
    ? "출퇴근·근태"
    : pathname === "/admin/attendance"
      ? "근태 관리"
      : pathname === "/my/leaves"
        ? "내 휴가"
        : pathname === "/admin/leaves"
          ? "휴가 결재"
          : pathname.startsWith("/leaves/")
            ? "휴가 신청 상세"
            : pathname === "/dashboard"
              ? "대시보드"
              : pathname === "/audit-logs"
                ? "감사 로그"
                : pathname === "/employees/import"
                  ? "엑셀 가져오기"
                  : pathname.startsWith("/employees")
                    ? "사원 관리"
                    : pathname === "/departments"
                      ? "부서 관리"
                      : pathname === "/positions"
                        ? "직급 관리"
                        : "내 정보";
  useEffect(() => {
    document.title = `${pageName} · EMS`;
    setMenuOpen(false);
    document.getElementById("main")?.focus({ preventScroll: true });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname, pageName]);
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/">
          EMS <span>사원관리 시스템</span>
        </Link>
        <button
          className="mobile-menu"
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          메뉴 {menuOpen ? "접기" : "펼치기"}
        </button>
        <nav
          id="main-nav"
          className={menuOpen ? "is-open" : ""}
          aria-label="주 메뉴"
        >
          <div role="group" aria-labelledby="my-work-label">
            <p className="nav-group" id="my-work-label">
              내 업무
            </p>
            <NavLink to="/my/attendance">출퇴근·근태</NavLink>
            <NavLink to="/my/leaves">휴가 신청·내 휴가</NavLink>
            <NavLink to="/me">내 정보</NavLink>
            <NavLink to="/organization">조직도</NavLink>
            <NavLink to="/my/payslips">내 급여명세서</NavLink>
            <NavLink to="/my/evaluations">내 평가</NavLink>
          </div>
          {user?.role === "ADMIN" && (
            <>
              <p className="nav-group">관리</p>
              <NavLink to="/admin/attendance">근태 관리</NavLink>
              <NavLink to="/admin/leaves">휴가 결재</NavLink>
              <NavLink to="/dashboard">대시보드</NavLink>
              <NavLink to="/employees">사원 관리</NavLink>
              <NavLink to="/departments">부서 관리</NavLink>
              <NavLink to="/positions">직급 관리</NavLink>
              <NavLink to="/job-titles">직책 관리</NavLink>
              <NavLink to="/admin/payroll">데모 급여 관리</NavLink>
              <NavLink to="/admin/reviews">평가 주기 관리</NavLink>
              <NavLink to="/assigned-evaluations">담당 평가</NavLink>
              <NavLink to="/audit-logs">감사 로그</NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          {mockMode ? "합성 데이터 · 목업 모드" : "실제 API 모드"}
        </div>
      </aside>
      <div className="workspace">
        <header>
          <nav className="breadcrumb" aria-label="현재 위치">
            <Link to="/">홈</Link> / {group} / {pageName}
            {/^\/employees\/\d+/.test(pathname) && (
              <> / 사원 상세{pathname.endsWith("/edit") && " / 정보 수정"}</>
            )}
          </nav>
          <span>
            {user?.name}{" "}
            <small className="badge">
              {user?.role === "ADMIN" ? "관리자" : "일반 사원"}
            </small>
          </span>
          <NotificationBell key={user?.id} />
          <button onClick={logout}>로그아웃</button>
        </header>
        <main className="content" id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
function Home() {
  const { user } = useAuth();
  return (
    <Navigate to={user?.role === "ADMIN" ? "/dashboard" : "/me"} replace />
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
          <Route path="/organization" element={<Organization />} />
          <Route path="/my/payslips" element={<MyPayslips />} />
          <Route path="/my/payslips/:id" element={<PayslipDetail />} />
          <Route path="/my/evaluations" element={<EvaluationList />} />
          <Route path="/evaluations/:id" element={<EvaluationDetail />} />
          <Route path="/my/attendance" element={<Attendance />} />
          <Route path="/my/leaves" element={<Leaves />} />
          <Route path="/leaves/:id" element={<LeaveDetail />} />
          <Route path="/employees/:id" element={<EmployeeDetail />} />
          <Route element={<Guard admin />}>
            <Route path="/assigned-evaluations" element={<AssignedEvaluations />} />
            <Route path="/admin/payroll" element={<PayrollList />} />
            <Route path="/admin/payroll/settings" element={<SalarySettings />} />
            <Route path="/admin/payroll/:month" element={<PayrollMonthDetail />} />
            <Route path="/admin/reviews" element={<EvaluationCycles />} />
            <Route path="/admin/reviews/new" element={<EvaluationCycleCreate />} />
            <Route path="/admin/reviews/:id" element={<EvaluationCycleDetail />} />
            <Route path="/job-titles" element={<Catalog kind="job-titles" key="job-titles" />} />
            <Route path="/admin/attendance" element={<Attendance admin />} />
            <Route path="/admin/leaves" element={<Leaves admin />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/employees/import" element={<ImportEmployees />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
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
