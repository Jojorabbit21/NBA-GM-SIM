import React from 'react';
import { TableRow, TableCell } from '../common/Table';

// 멀티플레이어 종료 화면(standalone) 박스스코어 공용 행 — Traditional/Advanced/Defense 세 표가 같이 쓴다.
// 본문 행 높이는 OVR 배지(h-6) + TableCell 패딩(py-2)이 정하므로, 빈 행도 h-6 스페이서로 같은 높이를 만든다.

/** 선수 정체성 3열(PLAYER/POS/OVR) 뒤에 이어지는 스탯 열 전체를 덮는 "Did Not Play" 셀 */
export const DnpCell: React.FC<{ colSpan: number; standalone?: boolean }> = ({ colSpan, standalone }) => (
    <TableCell align="left" colSpan={colSpan} className={`${standalone ? 'text-sm' : 'text-xs'} font-semibold text-slate-500`}>
        Did Not Play
    </TableCell>
);

/** 양 팀 박스스코어 높이를 맞추기 위한 빈 행. totalCols = 표 전체 열 수(정체성 3열 포함) */
export const BlankBoxRows: React.FC<{ count: number; totalCols: number }> = ({ count, totalCols }) => (
    <>
        {Array.from({ length: Math.max(0, count) }, (_, i) => (
            <TableRow key={`blank-${i}`} className="pointer-events-none" aria-hidden="true">
                {Array.from({ length: totalCols }, (_, c) => (
                    <TableCell key={c}>{c === 0 ? <div className="h-6" /> : null}</TableCell>
                ))}
            </TableRow>
        ))}
    </>
);
