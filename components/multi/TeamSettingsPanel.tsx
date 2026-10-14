
import React, { useState, useEffect } from 'react';
import { InlineNotice } from '../../components/common/InlineNotice';
import { Save } from 'lucide-react';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { useLeagueContext } from '../../views/multi/league/LeagueLayout';
import { useGame } from '../../hooks/useGameContext';
import { updateTeamProfile } from '../../services/multi/leagueService';
import { useCourtDefaults } from '../../services/multi/courtDefaults';
import { TEAM_DATA } from '../../data/teamData';
import { VIRTUAL_TEAMS } from '../../data/virtualTeams';
import { HEX_COLOR_RE, contrastRatio } from '../../utils/colorContrast';
import { CourtPreview } from './CourtPreview';
import { getTeamLogoUrl } from '../../utils/constants';
import { ColorField } from './ColorField';

const HEX_RE = HEX_COLOR_RE;
const HEX_FORMAT_MSG = '#RRGGBB 형식이어야 합니다';

// 입력별 검증 키 — 닉네임 + 팀 컬러 4 + 코트 컬러 4. 각 입력 아래 sm으로 표시(에러 표시 정책 2차, 2026-10-13).
type FieldKey = 'nickname' | 'primary' | 'secondary' | 'tertiary' | 'text' | 'background' | 'three' | 'paint' | 'line';
type FieldErrors = Partial<Record<FieldKey, string>>;
type ColorFieldDef = { key: Exclude<FieldKey, 'nickname'>; label: string; value: string; setter: (v: string) => void };

// team_slug는 실제 NBA 팀(TEAM_DATA) 또는 가상 확장팀(VIRTUAL_TEAMS) 둘 중 하나 — 연고지는
// 어느 쪽이든 항상 고정값이라 유저가 바꿀 수 없다(약어와 동일 원칙).
function resolveCity(teamSlug: string): string {
    return TEAM_DATA[teamSlug]?.city ?? VIRTUAL_TEAMS.find(t => t.team_slug === teamSlug)?.city ?? '';
}

// [2026-09-04] "탭 그룹에서 직접 수정 + 모달이 아니라 바디 스왑 방식" 요청 — 기존
// TeamSettingsModal(오버레이 모달)의 폼 로직을 그대로 가져오되, fixed/오버레이/닫기 버튼을
// 제거하고 RosterView의 "팀 설정" 탭 컨텐츠로 그대로 꽂을 수 있는 패널 형태로 재구성.
// 로스터 헤더의 팀 전환 드롭다운으로 다른 팀을 보고 있을 때는 RosterView가 이 탭 자체를
// 숨기므로(hideTabs), 여기서는 항상 "내 팀" 기준으로만 동작한다고 가정해도 안전하다.
export const TeamSettingsPanel: React.FC = () => {
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
    // null = team follows the admin-configured global default; shown value falls back to it.
    const courtDefaults = useCourtDefaults(myTeam?.team_slug);
    const [courtBgOverride,    setCourtBgOverride]    = useState<string | null>(null);
    const [courtPaintOverride, setCourtPaintOverride] = useState<string | null>(null);
    const [courtLineOverride,  setCourtLineOverride]  = useState<string | null>(null);
    const [courtThreeOverride, setCourtThreeOverride] = useState<string | null>(null);
    const courtBackground = courtBgOverride    ?? courtDefaults.background;
    const courtPaint      = courtPaintOverride ?? courtDefaults.paint;
    const courtLine       = courtLineOverride  ?? courtDefaults.line;
    const [courtShowLogo, setCourtShowLogo] = useState(true);
    const [courtLogoScale, setCourtLogoScale] = useState(100);
    // 3점 안쪽: 개별 지정이 없으면 (팀이 코트 배경을 직접 바꿨다면 그 배경색, 아니면 기본값의 3점색)
    const defaultThree = courtBgOverride ?? courtDefaults.three;
    const courtThree = courtThreeOverride ?? defaultThree;
    const setCourtBackground = setCourtBgOverride;
    const setCourtPaint      = setCourtPaintOverride;
    const setCourtLine       = setCourtLineOverride;
    const [saving,  setSaving]  = useState(false);
    // saveErr = 서버 저장 실패(하단 md) / fieldErrors = 입력별 검증(각 입력 아래 sm). [2026-10-13] 에러 표시 정책 2차.
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saved,   setSaved]   = useState(false);
    const clearField = (key: FieldKey) =>
        setFieldErrors(prev => (key in prev ? { ...prev, [key]: undefined } : prev));
    const setField = (key: FieldKey, setter: (v: string) => void) => (v: string) => { setter(v); clearField(key); };

    useEffect(() => {
        if (!myTeam) return;
        const prefix = city ? `${city} ` : '';
        setNickname(myTeam.team_name.startsWith(prefix) ? myTeam.team_name.slice(prefix.length) : myTeam.team_name);
        setColorPrimary(myTeam.color_primary ?? '#e11d48');
        setColorSecondary(myTeam.color_secondary ?? '#fbbf24');
        setColorTertiary(myTeam.color_tertiary ?? '#0f172a');
        setColorText(myTeam.color_text ?? '#ffffff');
        setCourtBgOverride(myTeam.court_background || null);
        setCourtPaintOverride(myTeam.court_paint || null);
        setCourtLineOverride(myTeam.court_line || null);
        setCourtThreeOverride(myTeam.court_three || null);
        setCourtShowLogo(myTeam.court_show_logo ?? true);
        setCourtLogoScale(myTeam.court_logo_scale ?? 100);
        setSaveErr(null);
        setFieldErrors({});
        setSaved(false);
    }, [myTeam?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!myTeam) {
        return <EmptyState title="아직 선점한 팀이 없습니다. 로비에서 먼저 팀을 선택해주세요." />;
    }

    const safeP = HEX_RE.test(colorPrimary)   ? colorPrimary   : '#e11d48';
    const safeS = HEX_RE.test(colorSecondary) ? colorSecondary : '#fbbf24';
    const safeT = HEX_RE.test(colorText)      ? colorText      : '#ffffff';
    const safeCourtBg    = HEX_RE.test(courtBackground) ? courtBackground : courtDefaults.background;
    const safeCourtThree = HEX_RE.test(courtThree) ? courtThree : safeCourtBg;
    const safeCourtPaint = HEX_RE.test(courtPaint)      ? courtPaint      : courtDefaults.paint;
    const safeCourtLine  = HEX_RE.test(courtLine)       ? courtLine       : courtDefaults.line;

    const teamColorFields: ColorFieldDef[] = [
        { key: 'primary',   label: 'Primary (배경)',       value: colorPrimary,   setter: setColorPrimary },
        { key: 'secondary', label: 'Secondary (보더)',      value: colorSecondary, setter: setColorSecondary },
        { key: 'tertiary',  label: 'Tertiary (포인트)',     value: colorTertiary,  setter: setColorTertiary },
        { key: 'text',      label: 'Text (배지 글자색)',    value: colorText,      setter: setColorText },
    ];
    const courtColorFields: ColorFieldDef[] = [
        { key: 'background', label: '코트 배경',   value: courtBackground, setter: setCourtBackground },
        { key: 'three',      label: '3점 라인 안쪽', value: courtThree,     setter: setCourtThreeOverride },
        { key: 'paint',      label: '페인트존',    value: courtPaint,      setter: setCourtPaint },
        { key: 'line',       label: '라인',        value: courtLine,       setter: setCourtLine },
    ];

    const sameHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

    // 모든 입력을 한 번에 훑어 맵 반환 — 첫 실패에서 끊지 않으므로 틀린 입력 전부 동시에 표시된다.
    const validate = (trimNick: string): FieldErrors => {
        const e: FieldErrors = {};
        if (trimNick.length < 1 || trimNick.length > 20) e.nickname = '닉네임은 1~20자여야 합니다';
        for (const f of [...teamColorFields, ...courtColorFields]) {
            if (!HEX_RE.test(f.value)) e[f.key] = HEX_FORMAT_MSG;
        }
        return e;
    };

    const handleSave = async () => {
        if (!myTeam || !userId) return;
        const trimNick = nickname.trim();
        const errors = validate(trimNick);
        setFieldErrors(errors);
        if (Object.values(errors).some(Boolean)) return;

        setSaving(true);
        setSaveErr(null);
        setSaved(false);
        const fullName = city ? `${city} ${trimNick}` : trimNick;
        const { error } = await updateTeamProfile(
            myTeam.id, userId, fullName, myTeam.team_abbr,
            colorPrimary, colorSecondary, colorTertiary, colorText,
            // Same as the global default -> store NULL so the team keeps following future default changes.
            sameHex(courtBackground, courtDefaults.background) ? null : courtBackground,
            sameHex(courtPaint,      courtDefaults.paint)      ? null : courtPaint,
            sameHex(courtLine,       courtDefaults.line)       ? null : courtLine,
            courtShowLogo,
            courtLogoScale,
            sameHex(courtThree, defaultThree) ? null : courtThree,
        );
        setSaving(false);
        if (error) { setSaveErr(error); return; }
        setSaved(true);
        reload();
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="max-w-4xl mx-auto px-6 py-6">
            {!canEditIdentity && (
                <InlineNotice tone="info" className="mb-4">드래프트가 진행되는 동안에는 팀 설정을 변경할 수 없습니다.</InlineNotice>
            )}

            {/* 좌/우 2컬럼 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

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
                        <h3 className="text-xs font-bold text-slate-500">팀 이름</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">연고지 (고정)</label>
                                <div className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500 ko-normal truncate">
                                    {city || '—'}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">약어 (고정)</label>
                                <div className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500">
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
                                onChange={e => { setNickname(e.target.value); clearField('nickname'); }}
                                maxLength={20}
                                placeholder="예: 파이어스"
                                className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${fieldErrors.nickname ? 'border-red-500/60' : 'border-slate-700'}`}
                            />
                            {fieldErrors.nickname && <InlineNotice tone="danger" size="sm" className="mt-1">{fieldErrors.nickname}</InlineNotice>}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-500">팀 컬러</h3>
                        {teamColorFields.map(({ key, label, value, setter }) => (
                            <ColorField key={key} label={label} value={value} onChange={setField(key, setter)} disabled={!canEditIdentity} error={fieldErrors[key]} />
                        ))}
                        {/* 대비 경고(warning sm)는 같은 자리에 형식 오류(danger sm)가 있으면 숨김 — 한 슬롯에 danger/warning 겹치지 않기 */}
                        {!fieldErrors.primary && !fieldErrors.text && HEX_RE.test(colorPrimary) && HEX_RE.test(colorText) && contrastRatio(colorPrimary, colorText) < 3 && (
                            <InlineNotice tone="warning" size="sm">배경(Primary)과 텍스트 색상의 대비가 낮아 글자가 잘 안 보일 수 있습니다.</InlineNotice>
                        )}
                    </div>
                </div>

                {/* ── 우: 코트 색상 + 실시간 미리보기 ── */}
                <div className="space-y-5">
                    <div>
                        <h3 className="text-xs font-bold text-slate-500 mb-2">코트 미리보기</h3>
                        <div className="rounded-xl overflow-hidden border border-slate-800">
                            <svg viewBox="0 0 940 500" className="w-full">
                                <CourtPreview background={safeCourtBg} paint={safeCourtPaint} line={safeCourtLine} three={safeCourtThree} logoUrl={courtShowLogo ? getTeamLogoUrl(myTeam.team_slug) : null} logoScale={courtLogoScale} />
                            </svg>
                        </div>
                        <p className="text-[11px] text-slate-500 ko-normal mt-1.5 leading-relaxed">
                            멀티플레이어 라이브 경기 화면에서, 이 팀이 홈팀일 때만 적용됩니다. 경기 종료 후 결과 화면은 기존 색상을 유지합니다.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-500">코트 컬러</h3>
                        {courtColorFields.map(({ key, label, value, setter }) => (
                            <ColorField key={key} label={label} value={value} onChange={setField(key, setter)} disabled={!canEditIdentity} error={fieldErrors[key]} />
                        ))}
                        <label className="flex items-center justify-between gap-3 pt-1 cursor-pointer">
                            <span className="text-sm text-slate-300 ko-normal">코트 중앙에 팀 로고 표시</span>
                            <input
                                type="checkbox"
                                checked={courtShowLogo}
                                onChange={e => setCourtShowLogo(e.target.checked)}
                                disabled={!canEditIdentity}
                                className="w-4 h-4 accent-indigo-500"
                            />
                        </label>
                        <div className={`flex items-center gap-3 ${courtShowLogo ? '' : 'opacity-50'}`}>
                            <span className="text-sm text-slate-300 ko-normal shrink-0">로고 크기</span>
                            <input
                                type="range" min={50} max={200} step={5}
                                value={courtLogoScale}
                                onChange={e => setCourtLogoScale(Number(e.target.value))}
                                disabled={!canEditIdentity || !courtShowLogo}
                                className="flex-1 accent-indigo-500"
                            />
                            <span className="text-xs text-slate-400 w-10 text-right">{courtLogoScale}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 서버 저장 실패 전용 — 검증 문구는 각 입력 아래로 */}
            {saveErr && <InlineNotice tone="danger" className="mt-4">{saveErr}</InlineNotice>}

            <div className="pt-4">
                <Button
                    variant="primary"
                    size="lg"
                    shape="xl"
                    fullWidth
                    onClick={handleSave}
                    disabled={saving || !canEditIdentity}
                    isLoading={saving}
                >
                    {saved
                        ? '저장됨'
                        : <><Save size={14} />저장</>
                    }
                </Button>
            </div>
        </div>
    );
};
