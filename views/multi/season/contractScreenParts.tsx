import React from 'react';
import { Button } from '../../../components/common/Button';
import { useIsPhone } from '../../../hooks/useViewportClass';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { PlayerHoverCard } from '../../../components/common/PlayerHoverCard';
import { KeyValueRow } from '../../../components/common/KeyValueRow';
import { Money } from '../../../components/common/Money';
import { calculatePlayerOvr } from '../../../utils/constants';
import { formatMoneyFull } from '../../../utils/formatMoney';
import { getArchetypeDisplayInfo, getTraitTagDisplayInfo } from '../../../services/playerDevelopment/archetypeEvaluator';
import { getLocalPopularityLabel, getNationalPopularityLabel } from '../../../services/playerPopularity';
import { getMoraleLabel } from '../../../services/moraleService';
import type { Player, SaveTendencies } from '../../../types/player';
import type { PlayerArchetypeState } from '../../../types/archetype';
import type { ScoutReportSentence } from '../../../utils/scoutReport';

// 협상(MultiNegotiationView) · 방출(MultiReleaseView) 두 화면이 복붙으로 공유하던 표시 블록.
// 2026-10-13 추출(docs/plan/ui-consolidation.md 6장 3번). 계산 로직은 각 화면에 남기고 표시만 둔다.

/** 상단 "← 뒤로 · 제목" 바 */
export const SubPageBar: React.FC<{ title?: string; onBack: () => void }> = ({ title, onBack }) => (
    <div className="flex-shrink-0 h-12 px-5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
        <Button variant="link" onClick={onBack}>
            <span>←</span><span>뒤로</span>
        </Button>
        {title && <span className="text-sm font-bold text-white ko-tight">{title}</span>}
    </div>
);

/** 좌(선수 정보) · 중(대화) · 우(폼) 3단 레이아웃 — flex-[2]/[3]/[5] */
export const ContractThreePane: React.FC<{
    left: React.ReactNode;
    center: React.ReactNode;
    right: React.ReactNode;
    /** 우측 패널 추가 클래스 (잠금 시 opacity 등) */
    rightClassName?: string;
}> = ({ left, center, right, rightClassName = '' }) => (
    <div className="flex-1 flex divide-x divide-slate-800 bg-slate-950 overflow-hidden min-h-0">
        <div className="flex-[2] min-w-0 bg-slate-900 flex flex-col overflow-hidden">{left}</div>
        <div className="flex-[3] min-w-0 bg-slate-900 flex flex-col overflow-hidden">{center}</div>
        <div className={`flex-[5] min-w-0 flex flex-col overflow-hidden bg-slate-900 ${rightClassName}`}>{right}</div>
    </div>
);

// ── 좌측 선수 정보 패널 ─────────────────────────────────────────

const Section: React.FC<{ title: string; bordered?: boolean; children: React.ReactNode }> = ({ title, bordered = true, children }) => (
    <div className={`px-4 py-3 ${bordered ? 'border-t border-slate-800 ' : ''}space-y-1`}>
        <div className="text-sm font-bold text-white mb-1.5">{title}</div>
        {children}
    </div>
);

/** "요구 조건" 같이 화면 전용으로 끼워 넣는 섹션 */
export const SidePanelSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Section title={title} bordered={false}>{children}</Section>
);

interface PlayerInfoSidePanelProps {
    player: Player;
    playerYos: number;
    onViewProfile: () => void;
    archetypeState: PlayerArchetypeState | null;
    tendencies: SaveTendencies | null;
    moraleScore: number;
    scoutReport: ScoutReportSentence[];
    /** 기본 kv 5행 바로 아래 (협상: 요구 조건) */
    extraSections?: React.ReactNode;
}

const SCOUT_ORDER = { positive: 0, negative: 1, neutral: 2 } as const;
const NEUTRAL = { text: '보통', color: 'text-slate-400' };

export const PlayerInfoSidePanel: React.FC<PlayerInfoSidePanelProps> = ({
    player, playerYos, onViewProfile, archetypeState, tendencies, moraleScore, scoutReport, extraSections,
}) => {
    const basicRows: { label: string; value: string }[] = [
        { label: '포지션', value: player.position },
        { label: '나이', value: `${player.age}세` },
        { label: '키', value: `${player.height}cm` },
        { label: '몸무게', value: `${player.weight}kg` },
        { label: '연차', value: `${playerYos}년` },
    ];

    let personalityRows: { label: string; text: string; color: string }[] = [];
    if (tendencies) {
        const t = tendencies;
        const moraleColor = moraleScore >= 70 ? 'text-emerald-400' : moraleScore >= 40 ? 'text-amber-400' : 'text-red-400';
        const egoLbl = t.ego > 0.35 ? { text: '오만', color: 'text-amber-400' } : t.ego < -0.35 ? { text: '겸손', color: 'text-sky-400' } : NEUTRAL;
        const finLbl = t.financialAmbition > 0.68 ? { text: '탐욕적', color: 'text-amber-400' } : t.financialAmbition < 0.32 ? { text: '검소', color: 'text-sky-400' } : NEUTRAL;
        const loyLbl = t.loyalty > 0.65 ? { text: '충성', color: 'text-emerald-400' } : t.loyalty < 0.35 ? { text: '이적욕 강함', color: 'text-red-400' } : NEUTRAL;
        const winLbl = t.winDesire > 0.65 ? { text: '우승 집착', color: 'text-emerald-400' } : t.winDesire < 0.35 ? { text: '역할 우선', color: 'text-slate-400' } : NEUTRAL;
        const tmpLbl = t.temperament > 0.45 ? { text: '다혈질', color: 'text-red-400' } : t.temperament < -0.40 ? { text: '냉정', color: 'text-sky-400' } : NEUTRAL;
        personalityRows = [
            { label: '현재 기분', text: getMoraleLabel(moraleScore), color: moraleColor },
            { label: '자존심', ...egoLbl },
            { label: '금전욕', ...finLbl },
            { label: '팀 충성도', ...loyLbl },
            { label: '우승욕', ...winLbl },
            { label: '기질', ...tmpLbl },
        ];
    }

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <OvrBadge value={calculatePlayerOvr(player)} size="md" />
                <PlayerHoverCard player={player}>
                    <div
                        onClick={onViewProfile}
                        className="text-base font-black text-white ko-tight leading-tight cursor-pointer hover:underline hover:text-indigo-400"
                    >
                        {player.name}
                    </div>
                </PlayerHoverCard>
            </div>
            <div className="px-4 pb-3 space-y-1">
                {basicRows.map(({ label, value }) => (
                    <KeyValueRow key={label} label={label}>{value}</KeyValueRow>
                ))}
            </div>

            {extraSections}

            {archetypeState && (
                <Section title="선수 유형">
                    <KeyValueRow label="아키타입">{getArchetypeDisplayInfo(archetypeState.primary).label}</KeyValueRow>
                    {archetypeState.secondary && (
                        <KeyValueRow label="보조 유형" tone="muted">{getArchetypeDisplayInfo(archetypeState.secondary).label}</KeyValueRow>
                    )}
                    {archetypeState.tags.slice(0, 4).map((tag, i) => (
                        <KeyValueRow key={tag} label={i === 0 ? '특성' : ''} tone="muted">{getTraitTagDisplayInfo(tag).label}</KeyValueRow>
                    ))}
                </Section>
            )}

            <Section title="인기도">
                <KeyValueRow label="지역적인 인기">{getLocalPopularityLabel(player.popularity?.local ?? 0)}</KeyValueRow>
                <KeyValueRow label="전국적인 인기">{getNationalPopularityLabel(player.popularity?.national ?? 0)}</KeyValueRow>
            </Section>

            {tendencies && (
                <Section title="성격 & 기분">
                    {personalityRows.map(({ label, text, color }) => (
                        <KeyValueRow key={label} label={label} tone="none" valueClassName={color}>{text}</KeyValueRow>
                    ))}
                </Section>
            )}

            {scoutReport.length > 0 && (
                <Section title="스카우팅 리포트">
                    {[...scoutReport].sort((a, b) => SCOUT_ORDER[a.sentiment] - SCOUT_ORDER[b.sentiment]).map((s, i) => (
                        <div
                            key={i}
                            className={`text-sm ${
                                s.sentiment === 'positive' ? 'text-emerald-400'
                                    : s.sentiment === 'negative' ? 'text-rose-400'
                                    : 'text-slate-200'
                            }`}
                        >
                            {s.sentiment === 'positive' ? '+ ' : s.sentiment === 'negative' ? '- ' : ''}{s.text}
                        </div>
                    ))}
                </Section>
            )}
        </div>
    );
};

// ── 팀 샐러리캡 현황 ─────────────────────────────────────────────

export interface CapStatusInfo {
    capAmount: number;
    luxuryTaxAmount: number | null;
    apron1Amount: number | null;
    apron2Amount: number | null;
    beforePayroll: number;
    afterPayroll: number;
}

/** afterLabel: "계약 후 예상 페이롤" / "방출 후 예상 페이롤" */
export const CapStatusPanel: React.FC<{ capInfo: CapStatusInfo; afterLabel: string }> = ({ capInfo, afterLabel }) => (
    <div className="flex-shrink-0 space-y-1">
        <div className="text-sm font-bold text-slate-400 mb-1">팀 샐러리캡 현황</div>
        <KeyValueRow label="캡 스페이스 여유" numeric>
            <Money value={capInfo.capAmount - capInfo.beforePayroll} format="full" signed className="font-bold" />
        </KeyValueRow>
        <KeyValueRow label="현재 페이롤" numeric>{formatMoneyFull(capInfo.beforePayroll)}</KeyValueRow>
        <KeyValueRow label="샐러리캡" numeric>{formatMoneyFull(capInfo.capAmount)}</KeyValueRow>
        {capInfo.luxuryTaxAmount !== null && (
            <KeyValueRow label="럭셔리 택스 라인" numeric>{formatMoneyFull(capInfo.luxuryTaxAmount)}</KeyValueRow>
        )}
        {capInfo.apron1Amount !== null && (
            <KeyValueRow label="1차 에이프런" numeric>{formatMoneyFull(capInfo.apron1Amount)}</KeyValueRow>
        )}
        {capInfo.apron2Amount !== null && (
            <KeyValueRow label="2차 에이프런" numeric>{formatMoneyFull(capInfo.apron2Amount)}</KeyValueRow>
        )}

        <div className="pt-2 mt-1 border-t border-slate-800 space-y-1">
            <KeyValueRow label={afterLabel} numeric labelClassName="font-semibold" valueClassName="font-bold">
                {formatMoneyFull(capInfo.afterPayroll)}
            </KeyValueRow>
            <KeyValueRow label="캡 대비" numeric>
                <Money value={capInfo.capAmount - capInfo.afterPayroll} format="full" signed className="font-bold" />
            </KeyValueRow>
        </div>
    </div>
);

// ── 채팅 말풍선 ──────────────────────────────────────────────────

export interface ChatBubbleMessage {
    role: 'player' | 'gm' | 'status';
    text: string;
    subText?: string;
    isSuccess?: boolean;
}

/** status = 가운데 작은 안내줄 / gm = 우측 인디고 버블 / player = 좌측 슬레이트 버블(playerName 필요) */
export const ChatBubble: React.FC<{ msg: ChatBubbleMessage; playerName?: string }> = ({ msg, playerName }) => {
    if (msg.role === 'status') {
        return (
            <div className="flex justify-center py-1">
                <span className={`text-xs italic ${msg.isSuccess ? 'text-emerald-400' : 'text-slate-500'}`}>{msg.text}</span>
            </div>
        );
    }
    if (msg.role === 'gm') {
        return (
            <div className="flex flex-col items-end gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <span className="text-xs font-bold text-indigo-400 px-1">GM</span>
                <div className="max-w-[85%] bg-indigo-600/20 border border-indigo-500/30 rounded-2xl rounded-br-sm px-4 py-3">
                    <p className="text-sm text-white leading-relaxed whitespace-pre-line">{msg.text}</p>
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-col items-start gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
            <span className="text-xs font-bold text-slate-400 px-1">{playerName}</span>
            <div className="max-w-[85%] bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-sm text-slate-100 leading-relaxed">&ldquo;{msg.text}&rdquo;</p>
                {msg.subText && (
                    <p className="text-sm text-slate-100 leading-relaxed mt-1">&ldquo;{msg.subText}&rdquo;</p>
                )}
            </div>
        </div>
    );
};

// ── 숫자 스텝퍼 (연수 / 캡% / 변동률) ─────────────────────────────

export interface StepSpec {
    label: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
}

interface ContractStepperProps {
    label: React.ReactNode;
    /** 라벨 줄 우측 보조 문구 (예: 최대 가능 캡% : 30%) */
    hint?: React.ReactNode;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
    inputMode: 'numeric' | 'decimal';
    suffix: string;
    disabled?: boolean;
    /** 입력칸 왼쪽 / 오른쪽 버튼 묶음 */
    leftSteps: StepSpec[];
    rightSteps: StepSpec[];
    /** 버튼 간격 — 연수 행은 md(gap-2), 캡%/변동률 행은 sm(gap-1.5) */
    gap?: 'sm' | 'md';
    /** 바깥 래퍼 클래스 (캡%/변동률: pt-1.5 space-y-1, 연수: space-y-1.5) */
    className?: string;
    /** 행 아래 부가 안내 */
    footer?: React.ReactNode;
}

export const ContractStepper: React.FC<ContractStepperProps> = ({
    label, hint, value, onChange, onBlur, inputMode, suffix, disabled, leftSteps, rightSteps, gap = 'sm', className = 'pt-1.5 space-y-1', footer,
}) => {
    // [2026-10-28] 폰(§9-1-15): 버튼 44 · 입력 48 · 16px(iOS 자동 줌 방지)
    const phone = useIsPhone();
    const renderStep = (s: StepSpec, i: number) => (
        <Button key={i} variant="secondary" className={`flex-1 ${phone ? '!h-11 !px-0' : ''}`} onClick={s.onClick} disabled={s.disabled ?? disabled}>
            {s.label}
        </Button>
    );
    return (
        <div className={className}>
            <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-400">{label}</span>
                {hint}
            </div>
            <div className={`flex items-center ${gap === 'md' ? 'gap-2' : 'gap-1.5'}`}>
                {leftSteps.map(renderStep)}
                <div className="relative flex-[2]">
                    <input
                        type="text"
                        inputMode={inputMode}
                        value={value}
                        onChange={onChange}
                        onBlur={onBlur}
                        disabled={disabled}
                        className={`w-full bg-slate-950 border border-slate-600 rounded-lg pl-3 pr-7 ${phone ? 'h-12 text-base' : 'py-2 text-sm'} text-center font-bold text-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300 pointer-events-none">{suffix}</span>
                </div>
                {rightSteps.map(renderStep)}
            </div>
            {footer}
        </div>
    );
};
