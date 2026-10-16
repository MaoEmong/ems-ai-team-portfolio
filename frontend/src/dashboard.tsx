import { useEffect, useState } from "react";
import type { DashboardData } from "./types";
import { ErrorNotice, useResource } from "./ui";
function Distribution({
  title,
  items,
  total,
}: {
  title: string;
  items: { name: string; count: number }[];
  total: number;
}) {
  const max = Math.max(1, ...items.map((x) => x.count));
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p className="muted">
        재직·휴직 인원의 현재 {title.includes("직급") ? "직급" : "소속"} 기준 ·
        과거 시점 분포 아님
      </p>
      {total === 0 ? (
        <p className="empty">재직 중인 사원이 없습니다.</p>
      ) : (
        <div
          className="distribution"
          role="img"
          aria-label={`${title}, 아래 수치 표 참고`}
        >
          {items.map((item, i) => (
            <div className="bar-row" key={i}>
              <span>{item.name}</span>
              <span className="bar-track">
                <span
                  className="bar-value"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </span>
              <strong>{item.count}명</strong>
            </div>
          ))}
        </div>
      )}
      <details>
        <summary>수치 표로 보기</summary>
        <div className="table-wrap">
          <table>
            <caption>{title} 수치</caption>
            <thead>
              <tr>
                <th scope="col">구분</th>
                <th scope="col">인원</th>
                <th scope="col">비율</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td>{item.count}</td>
                  <td>
                    {total
                      ? `${((item.count / total) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
export function Dashboard() {
  const [compact, setCompact] = useState(window.innerWidth < 720);
  useEffect(() => {
    const resize = () => setCompact(window.innerWidth < 720);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const step = compact ? 24 : 60;
  const barWidth = compact ? 8 : 17;
  const { data, error, loading, reload } =
    useResource<DashboardData>("/dashboard");
  const max = Math.max(
    1,
    ...(data?.monthly.flatMap((m) => [m.hires, m.retirements]) || []),
  );
  const top = Math.max(4, Math.ceil(max / 4) * 4);
  return (
    <>
      <div className="title-row">
        <div>
          <h1>대시보드</h1>
          <p className="muted">인원 현황과 최근 입사·퇴사 추이</p>
        </div>
        <div className="actions">
          {data && <span className="muted">기준일 {data.asOfDate} (KST)</span>}
          <button disabled={loading} onClick={reload}>
            새로고침
          </button>
        </div>
      </div>
      <ErrorNotice error={error} />
      {error && <button onClick={reload}>다시 시도</button>}
      {loading && <p role="status">대시보드를 불러오는 중…</p>}
      {data && (
        <div className="dashboard" aria-busy={loading}>
          <dl className="kpi-grid">
            {[
              ["재직 인원", data.headcount.employed, "재직 + 휴직 합계"],
              ["재직", data.headcount.active, "현재 재직 상태"],
              ["휴직", data.headcount.onLeave, "현재 휴직 상태"],
              ["퇴사", data.headcount.retired, "퇴사 상태 누적"],
            ].map(([title, value, description]) => (
              <div className="kpi panel" key={title}>
                <dt>{title}</dt>
                <dd>
                  {value} <small>명</small>
                </dd>
                <p className="muted">{description}</p>
              </div>
            ))}
          </dl>
          <div className="notice info month-summary">
            <strong>
              이번 달 입사 {data.thisMonth.hires}건 · 퇴사{" "}
              {data.thisMonth.retirements}건
            </strong>
            <span>
              {data.asOfDate.slice(0, 7)}-01 ~ {data.asOfDate} · 오늘까지 발생한
              날짜만 셉니다.
            </span>
          </div>
          <section className="panel">
            <h2>최근 12개월 월별 입사·퇴사 건수</h2>
            <p className="muted">
              {data.monthly[0]?.month} ~ {data.monthly.at(-1)?.month} · 월별
              건수(월말 인원 아님) · 미래 날짜 제외
            </p>
            <div className="legend">
              <span>
                <i className="hire-dot" />
                입사
              </span>
              <span>
                <i className="retire-dot" />
                퇴사
              </span>
            </div>
            {data.monthly.every((m) => !m.hires && !m.retirements) ? (
              <p className="empty">최근 12개월 입사·퇴사가 없습니다.</p>
            ) : (
              <svg
                className="monthly-chart"
                viewBox={`0 0 ${compact ? 340 : 780} 260`}
                role="img"
                aria-label="최근 12개월 월별 입사·퇴사 건수, 아래 수치 표 참고"
              >
                {[0, 1, 2, 3, 4].map((t) => (
                  <g key={t}>
                    <line
                      x1="38"
                      x2={compact ? 335 : 770}
                      y1={215 - t * 45}
                      y2={215 - t * 45}
                      className="chart-grid"
                    />
                    <text x="30" y={219 - t * 45} textAnchor="end">
                      {(top * t) / 4}
                    </text>
                  </g>
                ))}
                {data.monthly.map((m, i) => (
                  <g key={m.month}>
                    <rect
                      x={42 + i * step}
                      y={215 - (m.hires / top) * 180}
                      width={barWidth}
                      height={(m.hires / top) * 180}
                      className="chart-hire"
                    >
                      <title>
                        {m.month} 입사 {m.hires}건
                      </title>
                    </rect>
                    <rect
                      x={42 + barWidth + 2 + i * step}
                      y={215 - (m.retirements / top) * 180}
                      width={barWidth}
                      height={(m.retirements / top) * 180}
                      className="chart-retire"
                    >
                      <title>
                        {m.month} 퇴사 {m.retirements}건
                      </title>
                    </rect>
                    {(!compact || i % 2 === 0 || m.month.endsWith("-01")) && (
                      <text
                        x={43 + barWidth + i * step}
                        y={compact && m.month.endsWith("-01") ? 257 : 242}
                        textAnchor="middle"
                      >
                        {m.month.endsWith("-01")
                          ? `${m.month.slice(0, 4)}.1`
                          : `${Number(m.month.slice(5))}월`}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            )}
            <details>
              <summary>월별 수치 표로 보기</summary>
              <div className="table-wrap">
                <table>
                  <caption>월별 입사·퇴사 건수</caption>
                  <thead>
                    <tr>
                      <th scope="col">월</th>
                      <th scope="col">입사</th>
                      <th scope="col">퇴사</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map((m) => (
                      <tr key={m.month}>
                        <td>{m.month}</td>
                        <td>{m.hires}</td>
                        <td>{m.retirements}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">합계</th>
                      <td>{data.monthly.reduce((s, m) => s + m.hires, 0)}</td>
                      <td>
                        {data.monthly.reduce((s, m) => s + m.retirements, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          </section>
          <div className="distribution-grid">
            <Distribution
              title="재직자 현재 부서별 분포"
              total={data.headcount.employed}
              items={[...data.byDepartment].sort(
                (a, b) => b.count - a.count || a.name.localeCompare(b.name),
              )}
            />
            <Distribution
              title="재직자 현재 직급별 분포"
              total={data.headcount.employed}
              items={[...data.byPosition].sort((a, b) => a.level - b.level)}
            />
          </div>
          <p className="muted">
            상태별 인원은 현재 상태 기준입니다. 입사·퇴사 건수는 기준일까지의
            날짜 기록을 집계하므로 상태 인원과 다를 수 있습니다.
          </p>
        </div>
      )}
    </>
  );
}
