// PersonalDraftCard.tsx — 개인 팩 드래프트 카드 1장(승인된 시안 v49 기준).
// [OVR 배지 ··· 시즌] / 원팀 로고 / 이름 / 팀명 · POS / 아키타입 / 나이·키·몸무게 / OFF DEF PLM ATH 바.
// 배경은 원팀(meta_players.base_team_id) 테마 컬러 그라데이션(TEAM_COLORS), 로고는 getRealTeamLogoUrl.
// 은퇴 레전드처럼 base_team_id가 없는 선수는 중립 그라데이션 + 로고 자리 빈 채로 둔다.
import React from 'react';
import { OvrBadge } from '../common/OvrBadge';
import { getAttrBarColor, getAttrColor } from '../../utils/attrRatingColor';
import { getRealTeamLogoUrl, resolveTeamId } from '../../utils/constants';
import { TEAM_COLORS, TEAM_DATA } from '../../data/teamData';
import type { PersonalDraftPlayer } from '../../hooks/usePersonalDraft';

interface PersonalDraftCardProps {
    player: PersonalDraftPlayer;
    /** 카드 우상단에 찍는 시즌 라벨(rooms.season, 예: '2025-26'). */
    season: string;
    selected: boolean;
    disabled?: boolean;
    onSelect: (sourcePlayerId: string) => void;
}

const NEUTRAL_GRADIENT = ['#334155', '#0f172a'] as const;

const TOP_OVERLAY =
    'repeating-linear-gradient(135deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px),' +
    'linear-gradient(180deg, rgba(2,6,23,.15) 0%, rgba(2,6,23,.45) 100%)';

const SELECTED_SHADOW = '0 0 0 1px rgba(16,185,129,.6), 0 0 18px rgba(16,185,129,.35)';

function resolveTeamVisual(baseTeamId: string | null) {
    if (!baseTeamId) return { teamId: null, teamName: null, colors: NEUTRAL_GRADIENT };
    const teamId = resolveTeamId(baseTeamId);
    if (teamId === 'unknown') return { teamId: null, teamName: null, colors: NEUTRAL_GRADIENT };
    const data = TEAM_DATA[teamId];
    const colors = TEAM_COLORS[teamId];
    return {
        teamId,
        teamName: data ? `${data.city} ${data.name}` : null,
        colors: colors ? ([colors.primary, colors.secondary] as const) : NEUTRAL_GRADIENT,
    };
}

export const PersonalDraftCard: React.FC<PersonalDraftCardProps> = ({ player, season, selected, disabled = false, onSelect }) => {
    const { teamId, teamName, colors } = resolveTeamVisual(player.baseTeamId);
    const off = Math.round(((player.ins ?? 0) + (player.out ?? 0)) / 2);
    const groups: Array<[string, number]> = [
        ['OFF', off],
        ['DEF', player.def ?? 0],
        ['PLM', player.plm ?? 0],
        ['ATH', player.ath ?? 0],
    ];
    const subline = [teamName, player.position].filter(Boolean).join(' · ');

    return (
        <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-pressed={selected}
            aria-disabled={disabled}
            onClick={() => { if (!disabled) onSelect(player.id); }}
            onKeyDown={e => {
                if (disabled) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(player.id); }
            }}
            className={`relative rounded-xl border overflow-hidden flex flex-col select-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                selected ? 'border-emerald-500' : 'border-slate-700'
            } ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
            style={{
                background: `linear-gradient(165deg, ${colors[0]} 0%, ${colors[1]} 100%)`,
                boxShadow: selected ? SELECTED_SHADOW : undefined,
            }}
        >
            {/* 상단: [OVR ··· 시즌] / 로고 / 이름 / 팀 · POS / 아키타입 */}
            <div className="relative px-2.5 pt-2.5 pb-2 flex flex-col items-center" style={{ background: TOP_OVERLAY }}>
                <div className="w-full flex items-start justify-between">
                    <OvrBadge value={player.ovr} size="md" textClassName="text-base" />
                    <div className="text-base font-semibold text-white/80 tabular-nums leading-none pt-1">{season}</div>
                </div>
                {teamId ? (
                    <img
                        src={getRealTeamLogoUrl(teamId)}
                        alt=""
                        draggable={false}
                        className="w-[40%] aspect-square object-contain mt-3 mb-3"
                        style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.6))' }}
                    />
                ) : (
                    <div className="w-[40%] aspect-square mt-3 mb-3" aria-hidden="true" />
                )}
                <div className="text-lg font-black text-white truncate leading-tight max-w-full text-center">{player.name}</div>
                <div className="text-sm text-white/70 mt-0.5 text-center truncate max-w-full">{subline}</div>
                <div className="text-sm font-semibold mt-0.5 text-center truncate max-w-full text-white/75 tracking-wide">
                    {player.archetype ?? ''}
                </div>
            </div>

            {/* 하단: 나이·키·몸무게 + OFF/DEF/PLM/ATH 바 */}
            <div className="px-2.5 py-2 pb-2.5 flex flex-col gap-1.5 border-t border-white/10" style={{ background: 'rgba(2,6,23,.78)' }}>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-300 tabular-nums mb-0.5">
                    <span>{player.age}세</span>
                    <span className="text-slate-600">·</span>
                    <span>{player.height}cm</span>
                    <span className="text-slate-600">·</span>
                    <span>{player.weight}kg</span>
                </div>
                {groups.map(([label, value]) => (
                    <div key={label} className="flex items-center gap-1.5">
                        <span className="w-8 text-sm font-semibold uppercase text-white">{label}</span>
                        <span className={`w-7 text-right text-sm font-bold tabular-nums leading-none ${getAttrColor(value)}`}>{value}</span>
                        <span className="flex-1 h-[9px] rounded-full bg-slate-800 overflow-hidden">
                            <span
                                className="block h-full rounded-full"
                                style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: getAttrBarColor(value) }}
                            />
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
