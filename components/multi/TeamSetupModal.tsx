
import React, { useState, useEffect } from 'react';
import { InlineNotice } from '../../components/common/InlineNotice';
import { setMemberTeam } from '../../services/multi/leagueService';
import { HEX_COLOR_RE, contrastRatio } from '../../utils/colorContrast';
import { ColorField } from './ColorField';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface TeamSetupModalProps {
    open:            boolean;
    roomId:          string;
    userId:          string;
    /** 같은 방의 다른 멤버 team_id slug 목록 (자기 제외) — 중복 방지용 */
    existingTeamIds: string[];
    /** 지정하면 연고지는 고정 표시하고 닉네임만 입력받는다. 저장 시 `연고지 닉네임`으로 합쳐 전달. */
    fixedCity?:      string;
    initial?: {
        name:           string;
        abbr:           string;
        colorPrimary:   string;
        colorSecondary: string;
        colorText:      string;
    } | null;
    onClose: () => void;
    onSaved: () => void;
    /** league_teams 기반으로 저장할 때 setMemberTeam 대신 호출되는 override */
    saveOverride?: (values: {
        name: string; abbr: string;
        colorPrimary: string; colorSecondary: string; colorText: string;
    }) => Promise<{ error: string | null }>;
}

const HEX_RE = HEX_COLOR_RE;
const INPUT_CLASS = 'w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500';
const inputClass = (error?: string) => `${INPUT_CLASS} ${error ? 'border-red-500/60' : 'border-slate-700'}`;

// [2026-10-13] 폼 검증을 입력별로 분리(에러 표시 정책 2차) — 한 문구만 하단에 띄우고 첫 실패에서 끊던 방식 대신
// 모든 입력을 한 번에 훑어 각 입력 아래 sm으로 보인다. 하단 md 슬롯은 서버 저장 실패(saveErr) 전용.
type FieldKey = 'name' | 'abbr' | 'colorPrimary' | 'colorSecondary' | 'colorText';
type FieldErrors = Partial<Record<FieldKey, string>>;
const HEX_FORMAT_MSG = '#RRGGBB 형식이어야 합니다';

export const TeamSetupModal: React.FC<TeamSetupModalProps> = ({
    open, roomId, userId, existingTeamIds, fixedCity, initial, onClose, onSaved, saveOverride,
}) => {
    const [name,           setName]           = useState('');
    const [abbr,           setAbbr]           = useState('');
    const [colorPrimary,   setColorPrimary]   = useState('#e11d48');
    const [colorSecondary, setColorSecondary] = useState('#fbbf24');
    const [colorText,      setColorText]      = useState('#ffffff');
    const [fieldErrors,    setFieldErrors]    = useState<FieldErrors>({});
    const [saveErr,        setSaveErr]        = useState<string | null>(null);
    const [saving,         setSaving]         = useState(false);

    // 모달이 열릴 때마다 초기값으로 리셋
    useEffect(() => {
        if (!open) return;
        const initName = initial?.name ?? '';
        const cityPrefix = fixedCity ? `${fixedCity} ` : '';
        setName(cityPrefix && initName.startsWith(cityPrefix) ? initName.slice(cityPrefix.length) : initName);
        setAbbr(initial?.abbr           ?? '');
        setColorPrimary(initial?.colorPrimary   ?? '#e11d48');
        setColorSecondary(initial?.colorSecondary ?? '#fbbf24');
        setColorText(initial?.colorText ?? '#ffffff');
        setFieldErrors({});
        setSaveErr(null);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const displayAbbr = abbr.trim().toUpperCase();
    const safeP = HEX_RE.test(colorPrimary)   ? colorPrimary   : '#e11d48';
    const safeS = HEX_RE.test(colorSecondary) ? colorSecondary : '#fbbf24';
    const safeT = HEX_RE.test(colorText)      ? colorText      : '#ffffff';

    // 입력이 바뀌면 그 입력의 검증 문구만 즉시 소거(다른 입력의 문구는 유지)
    const clearField = (key: FieldKey) =>
        setFieldErrors(prev => (key in prev ? { ...prev, [key]: undefined } : prev));
    const setField = (key: FieldKey, setter: (v: string) => void) => (v: string) => { setter(v); clearField(key); };

    const handleAbbrChange = (v: string) => { setAbbr(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)); clearField('abbr'); };

    // 모든 입력을 훑어 맵을 채운다 — 첫 실패에서 return하지 않으므로 틀린 입력이 전부 동시에 표시된다.
    const validate = (trimName: string): FieldErrors => {
        const e: FieldErrors = {};
        if (trimName.length < 1 || trimName.length > 16) e.name = '팀명은 1~16자여야 합니다';
        if (!/^[A-Z0-9]{2,4}$/.test(displayAbbr)) e.abbr = '약어는 2~4자 영문/숫자여야 합니다';
        else if (existingTeamIds.includes(displayAbbr.toLowerCase())) e.abbr = `약어 "${displayAbbr}"는 이미 같은 방에서 사용 중입니다`;
        if (!HEX_RE.test(colorPrimary))   e.colorPrimary   = HEX_FORMAT_MSG;
        if (!HEX_RE.test(colorSecondary)) e.colorSecondary = HEX_FORMAT_MSG;
        if (!HEX_RE.test(colorText))      e.colorText      = HEX_FORMAT_MSG;
        return e;
    };

    const handleSave = async () => {
        const trimName = name.trim();
        const fullName = fixedCity ? `${fixedCity} ${trimName}` : trimName;
        const errors = validate(trimName);
        setFieldErrors(errors);
        if (Object.values(errors).some(Boolean)) return;

        setSaving(true);
        setSaveErr(null);
        let saveError: string | null = null;
        if (saveOverride) {
            const res = await saveOverride({ name: fullName, abbr: displayAbbr, colorPrimary, colorSecondary, colorText });
            saveError = res.error;
        } else {
            const res = await setMemberTeam({ roomId, userId, name: fullName, abbr: displayAbbr, colorPrimary, colorSecondary, colorText });
            saveError = res.error;
        }
        setSaving(false);
        if (saveError) { setSaveErr(saveError); return; }
        onSaved();
        onClose();
    };

    // 색상 대비 경고(warning sm)는 같은 자리에 형식 오류(danger sm)가 있으면 숨긴다 — 한 슬롯에 danger/warning 겹치지 않기.
    const showContrastWarning = !fieldErrors.colorPrimary && !fieldErrors.colorText
        && HEX_RE.test(colorPrimary) && HEX_RE.test(colorText) && contrastRatio(colorPrimary, colorText) < 3;

    // [2026-10-13] 직접 구현하던 오버레이/패널/헤더 → 공용 Modal(body 포탈·z-modal·배경 클릭 닫기 포함).
    // 공용 size 최소 단계(sm = max-w-md)보다 좁은 폼이라 className으로 max-w-sm 유지.
    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            size="sm"
            rounded="rounded-2xl"
            backdropClass="bg-black/60"
            className="!max-w-sm"
            title="팀 설정"
            footer={(
                <div className="flex gap-2">
                    <Button variant="secondary" size="xl" shape="xl" onClick={onClose} className="flex-1">
                        취소
                    </Button>
                    <Button
                        variant="primary"
                        size="xl"
                        shape="xl"
                        onClick={handleSave}
                        disabled={saving}
                        isLoading={saving}
                        loadingText="저장 중…"
                        className="flex-1"
                    >
                        저장
                    </Button>
                </div>
            )}
        >
            <div className="p-6 space-y-5">
                {/* 미리보기 */}
                <div className="flex flex-col items-center gap-2">
                    <div
                        className="w-24 h-24 rounded-2xl flex items-center justify-center font-black text-3xl select-none"
                        style={{
                            backgroundColor: safeP,
                            border: `4px solid ${safeS}`,
                            color: safeT,
                        }}
                    >
                        {displayAbbr || '—'}
                    </div>
                    <span className="text-sm text-slate-400 ko-normal">
                        {name.trim() ? (fixedCity ? `${fixedCity} ${name.trim()}` : name.trim()) : '팀명 미입력'}
                    </span>
                </div>

                {/* 입력 필드 */}
                <div className="space-y-3">
                    <div>
                        {fixedCity && (
                            <>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">연고지 (고정)</label>
                                <div className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500 ko-normal truncate mb-3">
                                    {fixedCity}
                                </div>
                            </>
                        )}
                        <label className="text-xs text-slate-400 ko-normal block mb-1">{fixedCity ? '닉네임' : '팀 이름'}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => { setName(e.target.value); clearField('name'); }}
                            maxLength={16}
                            placeholder={fixedCity ? '예: 파이어스' : '예: 서울 파이어스'}
                            className={inputClass(fieldErrors.name)}
                        />
                        {fieldErrors.name && <InlineNotice tone="danger" size="sm" className="mt-1">{fieldErrors.name}</InlineNotice>}
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">약어 (2~4자 영문/숫자)</label>
                        <input
                            type="text"
                            value={abbr}
                            onChange={e => handleAbbrChange(e.target.value)}
                            maxLength={4}
                            placeholder="SFR"
                            className={inputClass(fieldErrors.abbr)}
                        />
                        {fieldErrors.abbr && <InlineNotice tone="danger" size="sm" className="mt-1">{fieldErrors.abbr}</InlineNotice>}
                    </div>

                    {/* 색상 피커 3개 */}
                    <ColorField label="Primary (로고 배경)"  value={colorPrimary}   onChange={setField('colorPrimary', setColorPrimary)}     placeholder="#e11d48" error={fieldErrors.colorPrimary} />
                    <ColorField label="Secondary (로고 보더)" value={colorSecondary} onChange={setField('colorSecondary', setColorSecondary)} placeholder="#fbbf24" error={fieldErrors.colorSecondary} />
                    <ColorField label="Text (배지 글자색)"    value={colorText}      onChange={setField('colorText', setColorText)}           placeholder="#ffffff" error={fieldErrors.colorText} />
                    {showContrastWarning && (
                        <InlineNotice tone="warning" size="sm">배경(Primary)과 텍스트 색상의 대비가 낮아 글자가 잘 안 보일 수 있습니다.</InlineNotice>
                    )}
                </div>

                {/* 서버 저장 실패 전용 — 검증 문구는 각 입력 아래로 */}
                {saveErr && <InlineNotice tone="danger">{saveErr}</InlineNotice>}
            </div>
        </Modal>
    );
};
