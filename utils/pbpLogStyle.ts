// pbpLogStyle.ts — PBP 로그 표시 규칙 (2026-11-05, 사용자 결정 4갈래)
//
// 세 화면(멀티 라이브·게임 센터 MultiGamePbpView / 경기 기록 탭 GamePbpTab / 싱글 라이브 LiveGameView)이 같은 규칙을 쓴다.
// 기준은 "놓이는 자리": 가운데 공통 줄(SYSTEM) = 안내, 교체 줄 = 교체, 부상 줄 = 부상, 그 밖에 팀 칸에 놓이는 모든 줄 = 플레이
// (득점·실패·리바운드·파울·자유투·턴오버·블록·테크니컬·플래그런트·싸움·버저비터 해설·타임아웃·점프볼).
// 글씨 굵기는 모두 보통, 배경·아이콘 없음. 득점은 득점 팀 점수 숫자만 흰색으로 강조.
import type { PbpLog } from '../types';

export type PbpLogCategory = 'system' | 'sub' | 'injury' | 'play';

export function pbpLogCategory(log: Pick<PbpLog, 'teamId' | 'type' | 'text'>): PbpLogCategory {
    if (log.teamId === 'SYSTEM') return 'system';
    if (log.text.startsWith('교체:')) return 'sub';
    if (log.type === 'injury') return 'injury';
    return 'play';
}

/** 글자색 — 교체는 PBP_SUB_COLOR(머리·IN·OUT)로 따로 */
export const PBP_TEXT_COLOR: Record<Exclude<PbpLogCategory, 'sub'>, string> = {
    play: 'text-slate-200',
    system: 'text-slate-400',
    injury: 'text-red-400',
};

/** 교체 블록 — "약어 선수교체" 머리 / IN 이름 / OUT 이름 */
export const PBP_SUB_COLOR = {
    header: 'text-slate-400',
    in: 'text-emerald-400',
    out: 'text-red-400',
} as const;

/** 득점 팀 점수 숫자 강조 */
export const PBP_SCORE_HIGHLIGHT = 'text-white';

/** 이 줄에서 점수가 났는지 — 야투 득점 또는 1개 이상 성공한 자유투 */
export function pbpScored(log: Pick<PbpLog, 'type' | 'points'>): boolean {
    return log.type === 'score' || (log.type === 'freethrow' && (log.points ?? 0) > 0);
}

/** 화면 표시 문장 — 옛 경기의 부상 줄 앞 "🚨 " 아이콘을 뗀다(새 경기는 엔진이 붙이지 않음) */
export function pbpDisplayText(text: string): string {
    return text.replace(/^🚨\s*/, '');
}
