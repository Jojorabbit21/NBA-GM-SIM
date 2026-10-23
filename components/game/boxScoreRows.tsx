import React from 'react';
import { TableRow, TableCell } from '../common/Table';

// [2026-10-23] standalone(멀티 좌우 분할) 표 열 폭 — table-layout: fixed + colgroup 퍼센트. 값이 바뀌어도(라이브 폴링) 열이 흔들리지
// 않고, 카드 폭에 맞춰 같은 비율로 늘고 준다(게임 센터 간소 박스 PlayerBoxPanel과 같은 방식). 바닥 폭(minWidth)보다 좁으면 가로 스크롤.
// 세 표가 공유하는 PLAYER/POS/OVR 3열은 같은 비율이라 한 팀이 Traditional↔Advanced↔Defense를 바꿔도 이름 열이 움직이지 않는다.
// PLAYER 20%(한국어 최장 이름 ≈150px + px-4 패딩이 900px 카드에서 들어가는 폭). 2026-10-23 사용자 결정.
export const IDENTITY_COL_PCTS = [20, 5, 5];
/** OVR 열 생략 시(라이브) — PLAYER는 그대로 20%, 남는 폭은 스탯 열이 비율대로 나눠 갖는다 */
export const IDENTITY_COL_PCTS_NO_OVR = [20, 5];
/** 아래 스탯 열 값은 "가중치" — BoxColGroup이 (100 − 정체성 열 합)에 맞춰 비율대로 정규화한다(합이 100이 아니어도 됨). */
/** Traditional 13열: MIN PTS OREB DREB AST / STL BLK TOV PF / FG 3P FT / +/- */
export const TRAD_STAT_COL_PCTS = [5, 5, 5, 5, 5, 4.5, 4.5, 4.5, 4.5, 7, 6.5, 6.5, 5];
/** Advanced 10열: MIN / TS% EFG% USG% AST% TOV% OREB% DREB% TRB% / PIE */
export const ADV_STAT_COL_PCTS = [6, 7, 7, 7, 7, 7, 7, 7, 7, 6];
/** Defense 8열: MIN STL BLK DREB PF / DFGA DFGM / DFG% */
export const DEF_STAT_COL_PCTS = [8, 8, 8, 8, 8, 9, 9, 10];

export const BoxColGroup: React.FC<{ statPcts: number[]; hideOvr?: boolean }> = ({ statPcts, hideOvr }) => {
    const identity = hideOvr ? IDENTITY_COL_PCTS_NO_OVR : IDENTITY_COL_PCTS;
    const rest = 100 - identity.reduce((a, b) => a + b, 0);
    const sum = statPcts.reduce((a, b) => a + b, 0);
    const widths = [...identity, ...statPcts.map(w => (w / sum) * rest)];
    return (
        <colgroup>
            {widths.map((w, i) => <col key={i} style={{ width: `${w.toFixed(2)}%` }} />)}
        </colgroup>
    );
};

/** standalone 표의 <Table tableStyle> — 고정 레이아웃 + 바닥 폭 */
export const fixedBoxTableStyle = (minWidthPx: number): React.CSSProperties => ({ tableLayout: 'fixed', minWidth: minWidthPx });
import { Skeleton } from '../common/Skeleton';

// 멀티플레이어 종료 화면(standalone) 박스스코어 공용 행 — Traditional/Advanced/Defense 세 표가 같이 쓴다.
// 본문 행 높이는 OVR 배지(h-6) + TableCell 패딩(py-2)이 정하므로, 빈 행도 h-6 스페이서로 같은 높이를 만든다.

/** 선수 정체성 3열(PLAYER/POS/OVR) 뒤에 이어지는 스탯 열 전체를 덮는 "Did Not Play" 셀. label로 문구 교체(라이브: "출전 대기") */
export const DnpCell: React.FC<{ colSpan: number; standalone?: boolean; label?: string }> = ({ colSpan, standalone, label = 'Did Not Play' }) => (
    <TableCell align="left" colSpan={colSpan} className={`${standalone ? 'text-sm' : 'text-xs'} font-semibold text-slate-500`}>
        {label}
    </TableCell>
);

/** 양 팀 박스스코어 높이를 맞추기 위한 빈 행. totalCols = 표 전체 열 수(정체성 3열 포함) */
/** skeleton이면 빈 칸 대신 회색 펄스 바 — 데이터 로딩 중 표 높이를 미리 확보해 행이 뒤늦게 생기며 레이아웃이 밀리는 것을 막는다 */
export const BlankBoxRows: React.FC<{ count: number; totalCols: number; skeleton?: boolean }> = ({ count, totalCols, skeleton }) => (
    <>
        {Array.from({ length: Math.max(0, count) }, (_, i) => (
            <TableRow key={`blank-${i}`} className="pointer-events-none" aria-hidden="true">
                {Array.from({ length: totalCols }, (_, c) => (
                    <TableCell key={c} align={c === 0 ? 'left' : 'center'} className={c === 0 ? 'px-4' : undefined}>
                        {c === 0
                            ? <div className="h-6 flex items-center">{skeleton && <Skeleton className="h-3 w-24" />}</div>
                            : skeleton ? <Skeleton className="h-3 w-5" /> : null}
                    </TableCell>
                ))}
            </TableRow>
        ))}
    </>
);
