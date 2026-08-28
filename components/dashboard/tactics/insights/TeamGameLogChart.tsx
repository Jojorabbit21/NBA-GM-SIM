
import React, { useMemo, useState } from 'react';

export interface GameLogEntry {
    id: string;
    /** false면 아직 안 치른 경기 — myScore/oppScore/win은 undefined, 스파크라인엔 빈 슬롯으로만 자리 차지 */
    played: boolean;
    myScore?: number;
    oppScore?: number;
    win?: boolean;
    isHome: boolean;
    isPlayoff: boolean;
    /** 플레이오프 경기일 때만: "1라운드"/"준결승"/"결승" 등 */
    roundLabel?: string;
    /** 경기 날짜(YYYY-MM-DD 또는 ISO) — 툴팁 표시용 */
    date: string;
    /** 원본 홈/원정 스코어(팀 관점 아님) — 툴팁의 "{약어} - 00" 표시용 */
    homeScore?: number;
    awayScore?: number;
    /** 홈/원정 팀 약어(예: LAL/BOS) — 툴팁에서 "AWAY"/"HOME" 대신 팀 약어로 표시 */
    homeTeamAbbr?: string;
    awayTeamAbbr?: string;
    /** 상대팀 컨퍼런스 — "vs ECF"/"vs WCF" 분할 통계용(호출부에서 league_teams.conference로 계산) */
    oppConference?: 'East' | 'West';
    /** 상대팀이 우리 팀과 같은 디비전인지 — "vs DIV" 분할 통계용(호출부에서 실제 30팀 TEAM_DATA
     *  기준으로 계산 — 가상/커스텀 팀은 division 정보가 없어 항상 false) */
    vsDivision?: boolean;
}

// Game.date는 "YYYY-MM-DD" 문자열 또는 ISO 타임스탬프 둘 다 올 수 있어 앞 10자만 잘라 사용.
function formatDate(date: string): string {
    return date.slice(0, 10);
}

interface Segment {
    label: string;
    startIdx: number;
    endIdx: number;
}

// 시간순 games 배열을 "정규시즌" / 플레이오프 라운드별로 연속 구간 분할 — 스파크라인의
// 구분선·구간 라벨용. played 여부와 무관하게 스케줄 전체(미래 경기 포함)를 기준으로 나눈다.
function buildSegments(games: GameLogEntry[]): Segment[] {
    const segs: Segment[] = [];
    let curLabel: string | null = null;
    let start = 0;
    games.forEach((g, i) => {
        const label = g.isPlayoff ? (g.roundLabel ?? '플레이오프') : '정규시즌';
        if (label !== curLabel) {
            if (curLabel !== null) segs.push({ label: curLabel, startIdx: start, endIdx: i - 1 });
            curLabel = label;
            start = i;
        }
    });
    if (curLabel !== null) segs.push({ label: curLabel, startIdx: start, endIdx: games.length - 1 });
    return segs;
}

function histogramBins(values: number[], binWidth: number, range?: [number, number]): { x0: number; count: number }[] {
    let min: number, max: number;
    if (range) {
        [min, max] = range;
    } else {
        if (values.length === 0) return [];
        min = Math.floor(Math.min(...values) / binWidth) * binWidth;
        max = Math.ceil(Math.max(...values) / binWidth) * binWidth;
    }
    const bins: { x0: number; count: number }[] = [];
    for (let x = min; x < max; x += binWidth) bins.push({ x0: x, count: 0 });
    if (bins.length === 0) bins.push({ x0: min, count: 0 });
    for (const v of values) {
        const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((v - min) / binWidth)));
        bins[idx].count++;
    }
    return bins;
}

// y축 "예쁜" 눈금 간격(1/2/5×10^n) 계산 — 레퍼런스 이미지처럼 0부터 최댓값까지 촘촘한
// 눈금 라벨을 전부 표시하기 위함(예전엔 x축 라벨 3개만 찍었는데, 사용자가 준 레퍼런스는
// x/y축 전부에 촘촘한 눈금+숫자가 있어서 그대로 맞춤).
function niceStep(maxVal: number, targetTicks = 6): number {
    if (maxVal <= 0) return 1;
    const rough = maxVal / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return step * mag;
}

// 히스토그램 막대 색상 — 값(빈도)이 높을수록 밝은 인디고(indigo-500이 최댓값)가 되도록
// indigo-900(어두움)~indigo-500(밝음) 사이를 선형보간. t=0(최소)→indigo-900, t=1(최대bin)→indigo-500.
const INDIGO_MIN = '#312e81'; // indigo-900
const INDIGO_MAX = '#6366f1'; // indigo-500

// 승/패 로그 스파크라인과 동일한 색 — 득점/실점/득실차 히스토그램에서도 재사용해 톤을 통일.
const WIN_COLOR = '#10b981';  // emerald-500
const LOSS_COLOR = '#ef4444'; // red-500
function lerpColor(hexA: string, hexB: string, t: number): string {
    const clamp = Math.max(0, Math.min(1, t));
    const a = parseInt(hexA.slice(1), 16);
    const b = parseInt(hexB.slice(1), 16);
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * clamp);
    const g = Math.round(ag + (bg - ag) * clamp);
    const bl = Math.round(ab + (bb - ab) * clamp);
    return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

// 경기당 득실차(win=초록/loss=빨강) 바를 시간순으로 나열하는 스파크라인. 아직 안 치른 경기도
// games 배열에 포함되어 전체 슬롯 수(정규시즌 82경기 등)만큼 폭을 차지하되 막대는 그리지 않음
// — "치른 경기 수만큼만 폭이 좁아지는" 문제 방지. SVG viewBox 스케일링 대신 %기반 CSS 절대
// 위치로 막대를 그려서, 컨테이너 폭에 맞춰 자연스럽게 늘어나되 텍스트/막대가 비율 왜곡 없이
// 항상 원래 비율 그대로 렌더링된다(드래그 확대/축소 없이 전체 시즌을 고정 슬롯 수로 표시하는
// 단순 버전 — 브러시 인터랙션은 스코프 제외).
const GameLogSparkline: React.FC<{ games: GameLogEntry[]; onBarClick?: (gameId: string) => void }> = ({ games, onBarClick }) => {
    const segments = useMemo(() => buildSegments(games), [games]);
    const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);
    const n = games.length;
    if (n === 0) return null;

    const H = 110;
    // 하단 축 영역 — 레퍼런스 이미지처럼 가로 축 라인 + 짧은 틱 마크 + 그 아래 라벨(정규시즌 구간엔
    // 10경기 단위 숫자, 플레이오프 구간엔 라운드 이름)을 한 줄로 통일. 틱 위치는 막대와 동일한
    // 좌표계(index/n*100%)를 써서 정확히 정렬된다.
    const AXIS_Y = H + 6;
    const TICK_H = 4;
    const LABEL_TOP = AXIS_Y + TICK_H + 2;
    const TOTAL_H = LABEL_TOP + 14;

    const maxAbsDiff = Math.max(
        10,
        ...games.filter(g => g.played).map(g => Math.abs((g.myScore ?? 0) - (g.oppScore ?? 0))),
    );

    const regularSeg = segments.find(s => s.label === '정규시즌');
    const REGULAR_TICK_STEP = 10;
    const regularTicks: number[] = [];
    if (regularSeg) {
        const segLen = regularSeg.endIdx - regularSeg.startIdx + 1;
        for (let t = REGULAR_TICK_STEP; t <= segLen; t += REGULAR_TICK_STEP) {
            regularTicks.push(regularSeg.startIdx + t);
        }
    }
    const playoffSegs = segments.filter(s => s.label !== '정규시즌');

    return (
        <div className="relative w-full" style={{ height: TOTAL_H }}>
            {/* 기준선(득실차 0) */}
            <div className="absolute left-0 right-0 border-t border-slate-700" style={{ top: H / 2 }} />

            {/* 막대 — 슬롯 전체 높이를 차지하는 투명 히트박스로 감싸서(막대 자체가 아주 얇을 때도)
                호버/클릭이 안정적으로 잡히게 함. 호버 시 툴팁(경기 날짜·홈/원정 스코어), 클릭 시
                해당 경기 박스스코어 화면 이동(onBarClick). */}
            {games.map((g, i) => {
                if (!g.played) return null;
                const diff = (g.myScore ?? 0) - (g.oppScore ?? 0);
                const barH = Math.max(1, (Math.abs(diff) / maxAbsDiff) * (H / 2 - 4));
                const slotWidthPct = (1 / n) * 100;
                return (
                    <div
                        key={g.id}
                        className="absolute cursor-pointer"
                        style={{ left: `${(i / n) * 100}%`, width: `${slotWidthPct}%`, top: 0, height: H }}
                        onMouseEnter={(e) => setHover({ idx: i, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e) => setHover(h => (h && h.idx === i ? { idx: i, x: e.clientX, y: e.clientY } : h))}
                        onMouseLeave={() => setHover(h => (h && h.idx === i ? null : h))}
                        onClick={() => onBarClick?.(g.id)}
                    >
                        <div
                            className="absolute left-[15%] w-[70%]"
                            style={{
                                top: diff >= 0 ? H / 2 - barH : H / 2,
                                height: barH,
                                backgroundColor: g.win ? WIN_COLOR : LOSS_COLOR,
                            }}
                        />
                    </div>
                );
            })}

            {/* 호버 툴팁 — position:fixed로 커서 좌표를 그대로 따라가 카드의 overflow-hidden에
                영향받지 않음(정규시즌/플레이오프 라벨 + 날짜 + 홈/원정 스코어). */}
            {hover && games[hover.idx]?.played && (() => {
                const g = games[hover.idx];
                const stage = g.isPlayoff ? (g.roundLabel ?? '플레이오프') : '정규시즌';
                return (
                    <div
                        className="fixed z-50 pointer-events-none bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 shadow-lg"
                        style={{ left: hover.x, top: hover.y - 10, transform: 'translate(-50%, -100%)' }}
                    >
                        <div className="font-bold text-white whitespace-nowrap">{stage}</div>
                        <div className="text-slate-400 whitespace-nowrap">{formatDate(g.date)}</div>
                        <div className="border-t border-slate-700 my-1" />
                        <div className="tabular-nums whitespace-nowrap">{g.awayTeamAbbr ?? 'AWAY'} - {g.awayScore ?? 0}</div>
                        <div className="tabular-nums whitespace-nowrap">{g.homeTeamAbbr ?? 'HOME'} - {g.homeScore ?? 0}</div>
                    </div>
                );
            })()}

            {/* 플레이오프 라운드 경계 구분선(막대 영역) */}
            {segments.map((seg, i) => i > 0 && (
                <div
                    key={`divider-${i}`}
                    className="absolute border-l border-dashed border-slate-800"
                    style={{ left: `${(seg.startIdx / n) * 100}%`, top: 0, height: H }}
                />
            ))}

            {/* 하단 가로 축 라인 */}
            <div className="absolute left-0 right-0 border-t border-slate-600" style={{ top: AXIS_Y }} />

            {/* 정규시즌 라벨 — 세그먼트 시작점에 좌측 정렬 */}
            {regularSeg && (
                <div
                    className="absolute text-xs font-bold text-slate-400 whitespace-nowrap"
                    style={{ left: `${(regularSeg.startIdx / n) * 100}%`, top: LABEL_TOP }}
                >
                    정규시즌
                </div>
            )}

            {/* 정규시즌 구간 10경기 단위 눈금 + 숫자 */}
            {regularTicks.map((idx, k) => (
                <React.Fragment key={`tick-${k}`}>
                    <div
                        className="absolute border-l border-slate-600"
                        style={{ left: `${(idx / n) * 100}%`, top: AXIS_Y, height: TICK_H }}
                    />
                    <div
                        className="absolute text-xs font-bold text-slate-400 whitespace-nowrap"
                        style={{ left: `${(idx / n) * 100}%`, top: LABEL_TOP, transform: 'translateX(-50%)' }}
                    >
                        {idx - (regularSeg?.startIdx ?? 0)}
                    </div>
                </React.Fragment>
            ))}

            {/* 플레이오프 구간 — 경계 눈금 + 라운드 이름(가운데 정렬) */}
            {playoffSegs.map((seg, i) => {
                const leftPct = (seg.startIdx / n) * 100;
                const widthPct = ((seg.endIdx - seg.startIdx + 1) / n) * 100;
                return (
                    <React.Fragment key={`po-${i}`}>
                        <div
                            className="absolute border-l border-slate-600"
                            style={{ left: `${leftPct}%`, top: AXIS_Y, height: TICK_H }}
                        />
                        <div
                            className="absolute text-center text-xs font-bold text-slate-400 truncate px-1"
                            style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: LABEL_TOP }}
                        >
                            {seg.label}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// 레퍼런스 이미지와 동일하게: y축은 0부터 "예쁜" 간격으로 촘촘히 눈금+숫자, x축도 bin
// 경계마다 전부 눈금+숫자, 축마다 짧은 틱 마크(perpendicular dash) 표시.
//
// [중요] 틱 숫자/제목은 SVG <text>가 아니라 HTML <div>를 %로 절대위치시켜서 그린다 — SVG
// <text>를 쓰면 viewBox(300×210 고정 단위)가 실제 렌더 폭(flex-1이라 화면 크기에 따라
// 훨씬 넓게 늘어남, 이력의 경우 500~700px+)으로 스케일링될 때 fontSize도 막대/선과 함께
// 통째로 배율만큼 커져버려서(예: 렌더폭이 viewBox의 2배면 fontSize=12가 실제로는 24px로
// 나옴) text-xs/text-sm 값을 넣어도 그대로 반영되지 않는 버그가 있었다(스파크라인에서 겪은
// 것과 동일한 종류의 "SVG 스케일링이 텍스트까지 끌고 가는" 문제). 막대/축선은 SVG로 그리되
// (모양만 있고 텍스트가 없어 스케일링돼도 무방), 텍스트만 별도로 부모 div 위에 %좌표로
// 겹쳐그려서 실제 CSS px(text-xs=12px/text-sm=14px)가 항상 그대로 적용되게 한다.
const HistogramChart: React.FC<{
    title: string;
    values: number[];
    binWidth: number;
    range?: [number, number];
    /** 막대 색 결정 함수 — 안 넘기면 예전처럼 빈도(count)에 따른 인디고 그라데이션 유지 */
    barColor?: (bin: { x0: number; count: number }, rawMaxCount: number) => string;
}> = ({ title, values, binWidth, range, barColor }) => {
    const bins = useMemo(() => histogramBins(values, binWidth, range), [values, binWidth, range]);
    const W = 300, H = 210, padL = 34, padT = 26, padR = 8, padB = 28;
    const rawMaxCount = Math.max(1, ...bins.map(b => b.count));
    const yStep = niceStep(rawMaxCount);
    const yMax = Math.max(yStep, Math.ceil(rawMaxCount / yStep) * yStep);
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += yStep) yTicks.push(v);

    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const barW = bins.length > 0 ? innerW / bins.length : 0;
    const xTicks = bins.length > 0 ? [...bins.map(b => b.x0), bins[bins.length - 1].x0 + binWidth] : [];

    const xToPx = (tickIdx: number) => padL + tickIdx * barW;
    const yToPx = (v: number) => padT + innerH - (v / yMax) * innerH;
    const pctX = (px: number) => (px / W) * 100;
    const pctY = (py: number) => (py / H) * 100;

    return (
        <div className="flex-1 min-w-[220px] bg-slate-700/25 p-2">
            <div className="relative w-full">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
                    {/* y축 */}
                    <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#1e293b" strokeWidth="1" />
                    {yTicks.map((v, k) => (
                        <line key={k} x1={padL - 4} y1={yToPx(v)} x2={padL} y2={yToPx(v)} stroke="#1e293b" strokeWidth="1" />
                    ))}
                    {/* x축 */}
                    <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#1e293b" strokeWidth="1" />
                    {xTicks.map((v, k) => (
                        <line key={k} x1={xToPx(k)} y1={H - padB} x2={xToPx(k)} y2={H - padB + 4} stroke="#1e293b" strokeWidth="1" />
                    ))}
                    {/* 막대 — barColor가 있으면 그걸로, 없으면 예전처럼 값(빈도)이 높을수록
                        밝은 인디고(indigo-500이 최대) */}
                    {bins.map((b, i) => {
                        const h = (b.count / yMax) * innerH;
                        const x = xToPx(i);
                        const y = H - padB - h;
                        const fill = barColor
                            ? barColor(b, rawMaxCount)
                            : lerpColor(INDIGO_MIN, INDIGO_MAX, rawMaxCount > 0 ? b.count / rawMaxCount : 0);
                        return <rect key={i} x={x + 1} y={y} width={Math.max(0, barW - 2)} height={h} fill={fill} />;
                    })}
                </svg>

                {/* y축 눈금 숫자 — 우측 정렬, 세로 중앙 정렬 */}
                {yTicks.map((v, k) => (
                    <div
                        key={k}
                        className="absolute text-xs text-slate-400 tabular-nums whitespace-nowrap"
                        style={{ left: `${pctX(padL - 7)}%`, top: `${pctY(yToPx(v))}%`, transform: 'translate(-100%, -50%)' }}
                    >
                        {v}
                    </div>
                ))}
                {/* x축 눈금 숫자 — 가운데 정렬 */}
                {xTicks.map((v, k) => (
                    <div
                        key={k}
                        className="absolute text-xs text-slate-400 tabular-nums whitespace-nowrap"
                        style={{ left: `${pctX(xToPx(k))}%`, top: `${pctY(H - padB + 8)}%`, transform: 'translate(-50%, 0)' }}
                    >
                        {v}
                    </div>
                ))}
                {/* 제목 — 차트 상단(y축 위 여백 중앙) */}
                <div
                    className="absolute text-sm font-bold text-slate-200 whitespace-nowrap"
                    style={{ left: `${pctX(padL + innerW / 2)}%`, top: `${pctY(padT / 2)}%`, transform: 'translate(-50%, -50%)' }}
                >
                    {title}
                </div>
            </div>
        </div>
    );
};

interface SplitStatsRow {
    label: string;
    win: number;
    loss: number;
    scored: number;
    allowed: number;
}

function computeSplitStats(gms: GameLogEntry[]): { win: number; loss: number; scored: number; allowed: number } {
    const win = gms.filter(g => g.win).length;
    const loss = gms.length - win;
    const scored  = gms.length > 0 ? gms.reduce((s, g) => s + (g.myScore ?? 0), 0) / gms.length : 0;
    const allowed = gms.length > 0 ? gms.reduce((s, g) => s + (g.oppScore ?? 0), 0) / gms.length : 0;
    return { win, loss, scored, allowed };
}

// 홈/원정·승/패 요약을 "전체/홈/원정/vs DIV/vs ECF/vs WCF × 전적/득점/실점" 4열 테이블로
// 세분화한 위젯. 헤더 행은 slate-700/50, 1열(라벨 칸)은 slate-700/25로 구분. 각 셀이 자체
// padding을 갖는 구조라야 배경색이 gap 없이 이어져 칼럼/행 전체가 매끄럽게 칠해진다(grid gap을
// 쓰면 이음새가 생김). grid-cols는 auto로 둬서 폭이 내용에 맞게 줄어들도록(content-fit) 함 —
// 부모에서 w-full/flex-1 없이 이 컴포넌트를 감싸야 실제로 좁아진다.
// 승/패는 별도 컬럼 대신 "19-21" 한 칸으로 합치고, 나머지 값 컬럼(득점/실점)과 동일하게
// 흰색·일반 굵기로 표시(라벨 칸만 slate-400/bold로 구분). 전적/득점/실점 값 컬럼은 좌측 정렬.
const SplitStatsTable: React.FC<{ rows: SplitStatsRow[] }> = ({ rows }) => (
    <div className="inline-block bg-slate-900/40 border border-slate-700 overflow-hidden">
        <div className="grid grid-cols-[repeat(4,auto)]">
            <div className="bg-slate-700/50 px-3 py-2 border-b border-slate-700" />
            <div className="bg-slate-700/50 px-3 py-2 border-b border-l border-slate-700 text-sm font-bold text-slate-300 uppercase tracking-wider text-left">전적</div>
            <div className="bg-slate-700/50 px-3 py-2 border-b border-l border-slate-700 text-sm font-bold text-slate-300 uppercase tracking-wider text-left">득점</div>
            <div className="bg-slate-700/50 px-3 py-2 border-b border-l border-slate-700 text-sm font-bold text-slate-300 uppercase tracking-wider text-left">실점</div>

            {rows.map((r, i) => {
                const bCls = i < rows.length - 1 ? 'border-b border-slate-700' : '';
                return (
                    <React.Fragment key={r.label}>
                        <div className={`bg-slate-700/25 px-3 py-2.5 text-sm font-bold text-slate-400 text-left whitespace-nowrap ${bCls}`}>{r.label}</div>
                        <div className={`px-3 py-2.5 border-l border-slate-700 text-sm font-normal text-white tabular-nums text-left whitespace-nowrap ${bCls}`}>{r.win}-{r.loss}</div>
                        <div className={`px-3 py-2.5 border-l border-slate-700 text-sm font-normal text-white tabular-nums text-left ${bCls}`}>{r.scored.toFixed(1)}</div>
                        <div className={`px-3 py-2.5 border-l border-slate-700 text-sm font-normal text-white tabular-nums text-left ${bCls}`}>{r.allowed.toFixed(1)}</div>
                    </React.Fragment>
                );
            })}
        </div>
    </div>
);

/** 인사이트 탭 최상단 — 우리 팀의 시즌 경기 로그. 경기당 득실차 스파크라인(정규시즌+플레이오프
 *  라운드 구간 라벨 포함, 아직 안 치른 경기도 빈 슬롯으로 폭에 반영, 호버 시 툴팁·클릭 시
 *  onBarClick) + 득점/실점/득실차 히스토그램 3종 + 홈·원정/승·패 요약 바(전부 치른 경기 기준). */
export const TeamGameLogChart: React.FC<{ games: GameLogEntry[]; onBarClick?: (gameId: string) => void }> = ({ games, onBarClick }) => {
    if (games.length === 0) {
        return (
            <div className="w-full bg-slate-900/40 border border-slate-800 p-6 text-center text-sm text-slate-500">
                아직 시즌 일정이 없습니다.
            </div>
        );
    }

    const playedGames = games.filter(g => g.played);
    const scoredValues = playedGames.map(g => g.myScore ?? 0);
    const allowedValues = playedGames.map(g => g.oppScore ?? 0);
    const diffValues = playedGames.map(g => (g.myScore ?? 0) - (g.oppScore ?? 0));

    const splitRows: SplitStatsRow[] = [
        { label: '전체',   ...computeSplitStats(playedGames) },
        { label: '홈',     ...computeSplitStats(playedGames.filter(g => g.isHome)) },
        { label: '원정',   ...computeSplitStats(playedGames.filter(g => !g.isHome)) },
        { label: 'vs DIV', ...computeSplitStats(playedGames.filter(g => g.vsDivision)) },
        { label: 'vs ECF', ...computeSplitStats(playedGames.filter(g => g.oppConference === 'East')) },
        { label: 'vs WCF', ...computeSplitStats(playedGames.filter(g => g.oppConference === 'West')) },
    ];

    return (
        <div className="w-full bg-slate-900/40 border border-slate-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800">
                <h4 className="text-sm font-black text-white uppercase tracking-widest">시즌 경기 로그</h4>
            </div>
            <div className="p-4 bg-slate-700/25">
                <GameLogSparkline games={games} onBarClick={onBarClick} />
            </div>
            {playedGames.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">아직 완료된 경기가 없습니다.</div>
            ) : (
                <div className="flex flex-col lg:flex-row gap-4 p-4">
                    <div className="flex-none flex flex-col justify-center">
                        <SplitStatsTable rows={splitRows} />
                    </div>
                    <div className="flex-1 flex flex-wrap gap-4">
                        <HistogramChart title="득점" values={scoredValues} binWidth={10} range={[60, 160]} barColor={() => WIN_COLOR} />
                        <HistogramChart title="실점" values={allowedValues} binWidth={10} range={[60, 160]} barColor={() => LOSS_COLOR} />
                        <HistogramChart
                            title="득실차"
                            values={diffValues}
                            binWidth={10}
                            range={[-50, 50]}
                            barColor={(bin) => (bin.x0 + 5 >= 0 ? WIN_COLOR : LOSS_COLOR)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
