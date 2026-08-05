
import React from 'react';
import { X } from 'lucide-react';
import { ShotEvent } from '../../types';
import { TooltipState, calcShotDistance } from '../../hooks/useShotChartTooltip';

interface ShotTooltipProps {
    tooltip: TooltipState;
    /** 클릭으로 고정된 상태 — 고정되면 pointer-events가 열려서 클러스터 리스트 스크롤이 가능해지고,
     *  닫기(X) 버튼이 붙는다. 바깥(코트) 클릭 시 닫히는 로직은 부모 컨테이너의 onClick(handleClick)이
     *  전담한다 — 여기서 별도 document 리스너로 감지하면 "다른 도트 클릭 시 바로 재고정"과 순서가
     *  꼬여서, 고정 해제 후 한 번 더 클릭해야 재고정되는 동작이 깨졌었다. */
    isPinned?: boolean;
    onClose?: () => void;
}

function formatGameClock(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Single shot detail row (primary) */
function PrimaryShotInfo({ shot }: { shot: ShotEvent }) {
    const dist = calcShotDistance(shot.x, shot.y);
    const isMake = shot.isMake;

    return (
        <div className="space-y-0.5 text-[11px]">
            {/* Row 1: Quarter + Time | Result */}
            <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400 font-mono">
                    Q{shot.quarter} {formatGameClock(shot.gameClock)}
                </span>
                {isMake ? (
                    <span className="font-black text-emerald-400">
                        +{shot.points || 2}
                    </span>
                ) : (
                    <span className="font-black text-red-400">
                        {shot.isBlock ? 'BLOCK' : 'MISS'}
                    </span>
                )}
            </div>

            {/* Row 2: Player + ShotType + Distance */}
            <div className="flex items-center gap-1.5">
                <span className="font-bold text-white truncate max-w-[120px]">
                    {shot.playerName || 'Unknown'}
                </span>
                {shot.shotType && (
                    <span className="text-slate-300">{shot.shotType}</span>
                )}
                <span className="text-slate-300 font-mono">{dist}ft</span>
            </div>

            {/* Row 3: Assist or Blocker */}
            {isMake && shot.assistPlayerName && (
                <div className="text-indigo-400 font-medium">
                    AST {shot.assistPlayerName}
                </div>
            )}
            {!isMake && shot.isBlock && shot.defenderName && (
                <div className="text-red-400 font-medium">
                    BLK {shot.defenderName}
                </div>
            )}
        </div>
    );
}

/** Compact cluster shot row */
function ClusterShotRow({ shot }: { shot: ShotEvent }) {
    const dist = calcShotDistance(shot.x, shot.y);
    return (
        <div className="flex items-center gap-1.5 text-[11px]">
            <span className={shot.isMake ? 'text-emerald-400' : 'text-red-400'}>
                {shot.isMake ? '●' : '✕'}
            </span>
            <span className="text-slate-300 font-medium truncate max-w-[100px]">
                {shot.playerName || 'Unknown'}
            </span>
            {shot.shotType && (
                <span className="text-slate-400">{shot.shotType}</span>
            )}
            <span className="text-slate-400 font-mono">{dist}ft</span>
            {!shot.isMake && shot.isBlock && (
                <span className="text-red-400/70 font-bold">BLK</span>
            )}
        </div>
    );
}

export const ShotTooltip: React.FC<ShotTooltipProps> = ({
    tooltip,
    isPinned = false,
    onClose,
}) => {
    const { primaryShot, clusterShots, mouseX, mouseY, containerWidth, containerHeight } = tooltip;
    const hasCluster = clusterShots.length > 0;

    // 고정 상태에서는 클러스터 전체를 스크롤로 보여준다(호버 프리뷰는 기존처럼 5개+요약).
    const visibleClusterShots = isPinned ? clusterShots : clusterShots.slice(0, 5);
    const remainingCount = isPinned ? 0 : Math.max(0, clusterShots.length - 5);

    // Position tooltip near cursor, clamped to container
    // [2026-08-04] 폰트 11px 통일로 실제 렌더 크기가 커져서 클램프 추정치도 같이 키움
    const tooltipW = 240;
    const tooltipH = hasCluster ? 155 : 90;
    const offsetY = 12;

    // [Fix 2026-08-04 v3] v1(반대편 점프)→v2(우측 경계 클램프)로도 여전히 문제가 남았음 — 코트
    // 컨테이너가 툴팁 폭(240px)에 비해 좁으면(라이브 뷰 중앙 컬럼 등, 400~700px대) "우측 경계
    // 클램프"가 적용되는 구간 자체가 코트 폭의 상당 부분을 차지해서, 그 구간 안에서는 mouseX가
    // 어디든 항상 같은 고정 좌표로 스냅됐다 — 커서를 따라가지 않고 한 자리(대략 컨테이너 중앙
    // 부근)에 박혀있는 것처럼 보였던 원인. "커서 오른쪽에 오프셋 배치 후 넘치면 경계로 밀기"
    // 대신, 항상 커서를 수평 중심으로 두고 그 중심을 컨테이너 안쪽으로 클램프하는 방식으로 전환
    // — 이러면 클램프가 걸려도 툴팁 중심이 mouseX를 계속 따라 움직여서 "박혀있다"는 느낌이 없다.
    let left = mouseX - tooltipW / 2;
    if (left < 4) left = 4;
    if (left + tooltipW > containerWidth - 4) left = containerWidth - 4 - tooltipW;

    let top = mouseY + offsetY;
    if (top + tooltipH > containerHeight - 8) {
        top = mouseY - tooltipH - offsetY;
    }
    if (top < 4) top = 4;

    return (
        <div
            className={`absolute z-50 ${isPinned ? '' : 'pointer-events-none'}`}
            style={{ left, top }}
            // 고정 상태에서 툴팁 내부(리스트 스크롤, 닫기 버튼 등) 클릭이 부모 컨테이너의
            // onClick(handleClick)까지 버블링되면 "고정 해제" 로직이 같이 발동해버리므로 차단.
            onClick={isPinned ? (e) => e.stopPropagation() : undefined}
        >
            <div
                className={`relative bg-slate-900/95 border rounded-xl shadow-2xl backdrop-blur-sm px-3 py-2 min-w-[190px] max-w-[260px] ${
                    isPinned ? 'border-indigo-500/60 pr-6' : 'border-slate-700'
                }`}
            >
                {isPinned && onClose && (
                    <button
                        onClick={onClose}
                        className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                        aria-label="닫기"
                    >
                        <X size={10} />
                    </button>
                )}
                <PrimaryShotInfo shot={primaryShot} />

                {hasCluster && (
                    <>
                        <div className="border-t border-slate-700/50 my-1.5" />
                        <div className={`space-y-0.5 overflow-y-auto custom-scrollbar ${isPinned ? 'max-h-[180px]' : 'max-h-[80px]'}`}>
                            {visibleClusterShots.map(shot => (
                                <ClusterShotRow key={shot.id} shot={shot} />
                            ))}
                            {remainingCount > 0 && (
                                <span className="text-[11px] text-slate-600">
                                    +{remainingCount} more
                                </span>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
