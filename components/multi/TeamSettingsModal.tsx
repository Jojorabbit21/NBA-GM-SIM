
import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { useLeagueContext } from '../../views/multi/league/LeagueLayout';
import { useGame } from '../../hooks/useGameContext';
import { updateTeamProfile, DEFAULT_COURT_COLORS } from '../../services/multi/leagueService';
import { TEAM_DATA } from '../../data/teamData';
import { VIRTUAL_TEAMS } from '../../data/virtualTeams';
import { HEX_COLOR_RE, contrastRatio } from '../../utils/colorContrast';
import { CourtPreview } from './CourtPreview';
import { ColorField } from './ColorField';

const HEX_RE = HEX_COLOR_RE;

// team_slug는 실제 NBA 팀(TEAM_DATA) 또는 가상 확장팀(VIRTUAL_TEAMS) 둘 중 하나 — 연고지는
// 어느 쪽이든 항상 고정값이라 유저가 바꿀 수 없다(약어와 동일 원칙).
function resolveCity(teamSlug: string): string {
    return TEAM_DATA[teamSlug]?.city ?? VIRTUAL_TEAMS.find(t => t.team_slug === teamSlug)?.city ?? '';
}

interface TeamSettingsModalProps {
    open: boolean;
    onClose: () => void;
}

// [2026-08-05] "별도 화면 이동이 아니라 세션 내부 화면 위에서" 요청 — TeamSettingsView(페이지)를
// 이 모달로 대체. 라우팅 없이 사이드바에서 바로 열고 닫는다(뒤로가기 대신 X 닫기).
// [Fix 2026-08-05] "Primary/Secondary/Tertiary/Text 4종 + 좌우 2컬럼(우측은 코트 색상, 선택
// 즉시 코트에 반영되는 미리보기)" 요청으로 대규모 확장 — 팀 컬러 4종 + 코트 컬러 3종(배경/
// 페인트존/라인), 우측 컬럼에 CourtPreview로 실시간 미리보기.
export const TeamSettingsModal: React.FC<TeamSettingsModalProps> = ({ open, onClose }) => {
    const { session }  = useGame();
    const { league, leagueTeams, reload } = useLeagueContext();

    const userId  = session?.user?.id ?? null;
    const myTeam  = leagueTeams.find(t => t.user_id === userId);
    const city    = myTeam ? resolveCity(myTeam.team_slug) : '';
    // [Fix 2026-08-05] "드래프트 진행 중에만 잠그고, 그 전/후엔 자유롭게" 요청 — 기존엔
    // recruiting 상태에서만 허용(RPC 원래 제약)했으나, 팀명/컬러는 순수 취향 요소라 드래프트가
    // 실제로 진행되는 동안(다른 참가자가 드래프트 보드에서 팀 배지를 보고 있는 시점)만 막고
    // 그 외(recruiting/in_progress/finished)엔 언제든 변경 가능하게 완화.
    const canEditIdentity = league?.status !== 'drafting';

    const [nickname,       setNickname]       = useState('');
    const [colorPrimary,   setColorPrimary]   = useState('#e11d48');
    const [colorSecondary, setColorSecondary] = useState('#fbbf24');
    const [colorTertiary,  setColorTertiary]  = useState('#0f172a');
    const [colorText,      setColorText]      = useState('#ffffff');
    const [courtBackground, setCourtBackground] = useState(DEFAULT_COURT_COLORS.background);
    const [courtPaint,      setCourtPaint]      = useState(DEFAULT_COURT_COLORS.paint);
    const [courtLine,       setCourtLine]       = useState(DEFAULT_COURT_COLORS.line);
    const [saving,  setSaving]  = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [saved,   setSaved]   = useState(false);

    useEffect(() => {
        if (!open || !myTeam) return;
        const prefix = city ? `${city} ` : '';
        setNickname(myTeam.team_name.startsWith(prefix) ? myTeam.team_name.slice(prefix.length) : myTeam.team_name);
        setColorPrimary(myTeam.color_primary ?? '#e11d48');
        setColorSecondary(myTeam.color_secondary ?? '#fbbf24');
        setColorTertiary(myTeam.color_tertiary ?? '#0f172a');
        setColorText(myTeam.color_text ?? '#ffffff');
        setCourtBackground(myTeam.court_background ?? DEFAULT_COURT_COLORS.background);
        setCourtPaint(myTeam.court_paint ?? DEFAULT_COURT_COLORS.paint);
        setCourtLine(myTeam.court_line ?? DEFAULT_COURT_COLORS.line);
        setSaveErr(null);
        setSaved(false);
    }, [open, myTeam?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const safeP = HEX_RE.test(colorPrimary)   ? colorPrimary   : '#e11d48';
    const safeS = HEX_RE.test(colorSecondary) ? colorSecondary : '#fbbf24';
    const safeT = HEX_RE.test(colorText)      ? colorText      : '#ffffff';
    const safeCourtBg    = HEX_RE.test(courtBackground) ? courtBackground : DEFAULT_COURT_COLORS.background;
    const safeCourtPaint = HEX_RE.test(courtPaint)      ? courtPaint      : DEFAULT_COURT_COLORS.paint;
    const safeCourtLine  = HEX_RE.test(courtLine)       ? courtLine       : DEFAULT_COURT_COLORS.line;

    const teamColorFields = [
        { key: 'primary',   label: 'Primary (배경)',       value: colorPrimary,   setter: setColorPrimary },
        { key: 'secondary', label: 'Secondary (보더)',      value: colorSecondary, setter: setColorSecondary },
        { key: 'tertiary',  label: 'Tertiary (포인트)',     value: colorTertiary,  setter: setColorTertiary },
        { key: 'text',      label: 'Text (배지 글자색)',    value: colorText,      setter: setColorText },
    ];
    const courtColorFields = [
        { key: 'background', label: '코트 배경',   value: courtBackground, setter: setCourtBackground },
        { key: 'paint',      label: '페인트존',    value: courtPaint,      setter: setCourtPaint },
        { key: 'line',       label: '라인',        value: courtLine,       setter: setCourtLine },
    ];

    const handleSave = async () => {
        if (!myTeam || !userId) return;
        const trimNick = nickname.trim();
        if (trimNick.length < 1 || trimNick.length > 20) { setSaveErr('닉네임은 1~20자여야 합니다'); return; }
        for (const [label, val] of [
            ['Primary', colorPrimary], ['Secondary', colorSecondary], ['Tertiary', colorTertiary], ['Text', colorText],
            ['코트 배경', courtBackground], ['페인트존', courtPaint], ['라인', courtLine],
        ]) {
            if (!HEX_RE.test(val)) { setSaveErr(`${label} 색상은 #RRGGBB 형식이어야 합니다`); return; }
        }

        setSaving(true);
        setSaveErr(null);
        setSaved(false);
        const fullName = city ? `${city} ${trimNick}` : trimNick;
        const { error } = await updateTeamProfile(
            myTeam.id, userId, fullName, myTeam.team_abbr,
            colorPrimary, colorSecondary, colorTertiary, colorText,
            courtBackground, courtPaint, courtLine,
        );
        setSaving(false);
        if (error) { setSaveErr(error); return; }
        setSaved(true);
        reload();
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 pt-6">
                    <h2 className="text-base font-black text-white ko-tight">팀 설정</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {!myTeam ? (
                    <p className="text-sm text-slate-400 ko-normal px-6 pb-6 pt-4">아직 선점한 팀이 없습니다. 로비에서 먼저 팀을 선택해주세요.</p>
                ) : (
                    <>
                        <div className="px-6 pt-4">
                            {!canEditIdentity && (
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4">
                                    <p className="text-xs text-amber-300 ko-normal leading-relaxed">
                                        드래프트가 진행되는 동안에는 팀 설정을 변경할 수 없습니다.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* 좌/우 2컬럼 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 pb-6">

                            {/* ── 좌: 팀 이름 + 팀 컬러 ── */}
                            <div className="space-y-5">
                                {/* 미리보기 배지 */}
                                <div className="flex flex-col items-center gap-2 bg-slate-800/40 border border-slate-800 rounded-xl py-5">
                                    <div
                                        className="w-20 h-20 rounded-2xl flex items-center justify-center font-black text-2xl select-none"
                                        style={{ backgroundColor: safeP, border: `4px solid ${safeS}`, color: safeT }}
                                    >
                                        {myTeam.team_abbr}
                                    </div>
                                    <span className="text-sm text-slate-400 ko-normal">
                                        {city} {nickname.trim() || '닉네임 미입력'}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">팀 이름</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs text-slate-400 ko-normal block mb-1">연고지 (고정)</label>
                                            <div className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500 ko-normal truncate">
                                                {city || '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 ko-normal block mb-1">약어 (고정)</label>
                                            <div className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500 font-mono">
                                                {myTeam.team_abbr}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400 ko-normal block mb-1">닉네임 (1~20자)</label>
                                        <input
                                            type="text"
                                            value={nickname}
                                            disabled={!canEditIdentity}
                                            onChange={e => setNickname(e.target.value)}
                                            maxLength={20}
                                            placeholder="예: 파이어스"
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">팀 컬러</h3>
                                    {teamColorFields.map(({ key, label, value, setter }) => (
                                        <ColorField key={key} label={label} value={value} onChange={setter} disabled={!canEditIdentity} />
                                    ))}
                                    {HEX_RE.test(colorPrimary) && HEX_RE.test(colorText) && contrastRatio(colorPrimary, colorText) < 3 && (
                                        <p className="text-xs text-amber-400 ko-normal">
                                            ⚠ 배경(Primary)과 텍스트 색상의 대비가 낮아 글자가 잘 안 보일 수 있습니다.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* ── 우: 코트 색상 + 실시간 미리보기 ── */}
                            <div className="space-y-5">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">코트 미리보기</h3>
                                    <div className="rounded-xl overflow-hidden border border-slate-800">
                                        <svg viewBox="0 0 940 500" className="w-full">
                                            <CourtPreview background={safeCourtBg} paint={safeCourtPaint} line={safeCourtLine} />
                                        </svg>
                                    </div>
                                    <p className="text-[11px] text-slate-500 ko-normal mt-1.5 leading-relaxed">
                                        멀티플레이어 라이브 경기 화면에서, 이 팀이 홈팀일 때만 적용됩니다. 경기 종료 후 결과 화면은 기존 색상을 유지합니다.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">코트 컬러</h3>
                                    {courtColorFields.map(({ key, label, value, setter }) => (
                                        <ColorField key={key} label={label} value={value} onChange={setter} disabled={!canEditIdentity} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {saveErr && <p className="text-xs text-red-400 ko-normal px-6">{saveErr}</p>}

                        <div className="flex gap-2 px-6 pb-6 pt-1">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
                            >
                                닫기
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !canEditIdentity}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {saving
                                    ? <Loader2 size={14} className="animate-spin" />
                                    : saved
                                    ? '저장됨'
                                    : <><Save size={14} />저장</>
                                }
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
