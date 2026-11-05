import React, { useMemo } from 'react';
import { PLAYER_COLUMNS, TEAM_COLUMNS, ViewMode, StatCategory } from '../../data/leaderboardConfig';

// [2026-11-05] 리더보드 하단 용어집 — 지금 보고 있는 탭(모드 × 스탯 카테고리)에 나오는 열 약어만 보여준다.
// 열 라벨(ColumnDef.label)과 그룹 헤더(attrGroup)를 키로 찾는다. 능력치 탭은 같은 약어(STL·BLK·MID 등)가
// 기록이 아니라 능력치를 뜻하므로 별도 사전을 쓴다. 사전에 없는 라벨(#·PLAYER·TEAM 등 식별 열)은 표시하지 않는다.

const STAT_TERMS: Record<string, string> = {
    // 공통
    OVR: '종합 능력치',
    W: '승',
    L: '패',
    'WIN%': '승률',
    G: '출전 경기 수',
    // 기본 기록 (경기당)
    MIN: '경기당 출전 시간(분)',
    PTS: '경기당 득점',
    PA: '경기당 실점',
    OREB: '경기당 공격 리바운드',
    DREB: '경기당 수비 리바운드',
    REB: '경기당 리바운드',
    AST: '경기당 어시스트',
    STL: '경기당 스틸',
    BLK: '경기당 블록',
    TOV: '경기당 턴오버',
    PF: '경기당 파울',
    FGM: '야투 성공',
    FGA: '야투 시도',
    'FG%': '야투 성공률',
    '3PM': '3점슛 성공',
    '3PA': '3점슛 시도',
    '3P%': '3점슛 성공률',
    FTM: '자유투 성공',
    FTA: '자유투 시도',
    'FT%': '자유투 성공률',
    '+/-': '코트에 있는 동안의 득실차',
    // 슈팅 존
    RIM: '림 근처(제한 구역)',
    PAINT: '페인트존(림 근처 제외)',
    'MID LEFT': '미드레인지 왼쪽',
    'MID CENTER': '미드레인지 정면',
    'MID RIGHT': '미드레인지 오른쪽',
    'LEFT CORNER': '왼쪽 코너 3점',
    'RIGHT CORNER': '오른쪽 코너 3점',
    'LEFT 45': '왼쪽 45도 3점',
    'RIGHT 45': '오른쪽 45도 3점',
    ATB: '정면 3점(Above the Break)',
    RA: '제한 구역',
    ITP: '페인트존(제한 구역 제외)',
    MID: '미드레인지',
    CNR: '코너 3점',
    WING: '45도 3점',
    // 고급 기록
    PER: '선수 효율 지수 — 분당 생산성을 리그 평균 15로 맞춘 값',
    OWS: '공격 윈셰어 — 공격으로 만든 승리 기여',
    DWS: '수비 윈셰어 — 수비로 만든 승리 기여',
    WS: '윈셰어 — 공격·수비 승리 기여 합계',
    'WS/48': '48분당 윈셰어',
    'TS%': '트루 슈팅 — 자유투·3점을 반영한 득점 효율',
    'eFG%': '유효 야투율 — 3점슛을 1.5개로 계산한 야투율',
    'TOV%': '공격 기회(야투·자유투·턴오버) 대비 턴오버 비율',
    'USG%': '코트에 있는 동안 팀 공격을 끝낸 비율',
    'AST%': '야투 성공 중 어시스트 비율',
    'ORB%': '잡을 수 있는 공격 리바운드 중 확보 비율',
    'DRB%': '잡을 수 있는 수비 리바운드 중 확보 비율',
    'TRB%': '잡을 수 있는 전체 리바운드 중 확보 비율',
    'STL%': '상대 포제션 대비 스틸 비율',
    'BLK%': '상대 2점슛 시도 대비 블록 비율',
    '3PAr': '야투 시도 중 3점슛 비율',
    FTr: '야투 시도 대비 자유투 시도 비율',
    'SCRN%': '스크린 성공률 — 판정된 스크린 중 깔끔하게 걸린 비율',
    TF: '테크니컬 파울',
    FF: '플래그런트 파울',
    ORTG: '100포제션당 득점',
    DRTG: '100포제션당 실점',
    NRTG: '100포제션당 득실차(ORTG − DRTG)',
    POSS: '경기당 포제션',
    PACE: '48분당 포제션',
    POTV: '상대 턴오버 직후 첫 공격 득점(경기당)',
    FBPS: '속공 득점(경기당)',
    PITP: '페인트존 득점(경기당)',
    SPTS: '공격 리바운드 이후 득점(경기당)',
    // 수비
    TOVF: '경기당 유도한 상대 턴오버',
    DFGM: '수비하며 허용한 상대 야투 성공',
    DFGA: '수비한 상대 야투 시도',
    'DFG%': '수비한 상대 야투 성공률',
    // 상대 기록 (팀)
    'Opp PTS': '상대 경기당 득점',
    'Opp FG%': '상대 야투 성공률',
    'Opp 3P%': '상대 3점슛 성공률',
    'Opp AST': '상대 경기당 어시스트',
    'Opp REB': '상대 경기당 리바운드',
    'Opp OREB': '상대 경기당 공격 리바운드',
    'Opp STL': '상대 경기당 스틸',
    'Opp BLK': '상대 경기당 블록',
    'Opp TOV': '상대 경기당 턴오버',
    'Opp PF': '상대 경기당 파울',
};

const ATTRIBUTE_TERMS: Record<string, string> = {
    OVR: '종합 능력치',
    W: '승',
    L: '패',
    'WIN%': '승률',
    INSIDE: '골밑 득점',
    OUTSIDE: '외곽 슛',
    PLAYMAKING: '플레이메이킹',
    DEFENSE: '수비',
    REBOUND: '리바운드',
    ATHLETIC: '운동 능력',
    INS: '골밑 마무리(레이업·근거리 슛 종합)',
    DUNK: '덩크',
    POST: '포스트 플레이',
    MID: '미드레인지 슛',
    '3PT': '3점슛(종합)',
    FT: '자유투',
    SIQ: '슛 셀렉션(Shot IQ)',
    PASS: '패스 정확도',
    HNDL: '볼 핸들링',
    PIQ: '패스 판단(Pass IQ)',
    INTD: '골밑 수비',
    PERD: '외곽 수비',
    STL: '스틸 능력',
    BLK: '블록 능력',
    DCON: '수비 집중력',
    OREB: '공격 리바운드 능력',
    DREB: '수비 리바운드 능력',
    SPD: '스피드(종합)',
    STR: '힘',
    VERT: '점프력',
    STA: '체력',
};

export const LeaderboardGlossary: React.FC<{
    mode: ViewMode;
    statCategory: StatCategory;
    /** LeaderboardTable과 같은 값 — 멀티 전용 열(POTV 등) 포함 여부 */
    showMultiColumns?: boolean;
}> = ({ mode, statCategory, showMultiColumns = false }) => {
    const terms = useMemo(() => {
        const dict = statCategory === 'Attributes' ? ATTRIBUTE_TERMS : STAT_TERMS;
        const cols = (mode === 'Players' ? PLAYER_COLUMNS : TEAM_COLUMNS)
            .filter(c => (!c.multiOnly || showMultiColumns) && (c.category === 'Common' || c.category === statCategory));
        const seen = new Set<string>();
        const out: { term: string; desc: string }[] = [];
        const push = (label: string | undefined) => {
            if (!label || seen.has(label) || !dict[label]) return;
            seen.add(label);
            out.push({ term: label, desc: dict[label] });
        };
        for (const c of cols) {
            push(c.attrGroup);
            push(c.label);
        }
        return out;
    }, [mode, statCategory, showMultiColumns]);

    if (terms.length === 0) return null;

    return (
        <div className="px-6 py-5 bg-slate-950 border-t border-slate-800">
            <h3 className="text-sm font-bold text-slate-300 mb-3">용어</h3>
            <dl className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-8 gap-y-2">
                {terms.map(({ term, desc }) => (
                    <div key={term} className="flex items-baseline gap-3 min-w-0">
                        <dt className="w-24 shrink-0 text-xs font-bold text-slate-300 tabular-nums">{term}</dt>
                        <dd className="min-w-0 text-xs text-slate-400">{desc}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
};
