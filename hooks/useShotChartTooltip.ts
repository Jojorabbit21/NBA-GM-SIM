
import { useState, useCallback, useRef } from 'react';
import { ShotEvent } from '../types';
import { HOOP_X_LEFT, HOOP_Y_CENTER, COURT_WIDTH } from '../utils/courtCoordinates';

export interface TooltipState {
    primaryShot: ShotEvent;
    clusterShots: ShotEvent[];  // additional shots in radius (excluding primary)
    mouseX: number;             // px relative to container
    mouseY: number;
    // [Fix 2026-08-04] "우측 코트 호버 시 툴팁이 왼쪽으로 너무 멀리 표시됨" 버그 — 컨테이너 크기를
    // 별도 ResizeObserver state(containerSize)로 트래킹해서 넘겨받으면, 그 state가 최신 렌더 크기를
    // 아직 못 따라잡은 순간(마운트 직후 등)엔 실제 폭보다 훨씬 좁은 값(예: 기본값 940/0)을 기준으로
    // flip 판정을 해버려 우측 호버 시 위치가 크게 어긋난다. mouseX/mouseY를 구하는 것과 정확히 같은
    // getBoundingClientRect() 호출에서 컨테이너 폭/높이도 함께 캡처해 항상 그 순간의 실제 크기를 쓴다.
    containerWidth: number;
    containerHeight: number;
}

type Shot = ShotEvent & { x: number; y: number };

/**
 * Shot chart tooltip hook.
 * Tracks mouse on an SVG-wrapping container, finds nearest shot(s),
 * and returns tooltip data + event handlers.
 *
 * @param shots - array of ShotEvent (already transformed to display coords)
 * @param scale - coordinate multiplier (e.g. 10 for 940x500 viewBox)
 * @param clusterRadius - ft radius to collect nearby shots (default 1.5)
 */
export function useShotChartTooltip(
    shots: Shot[],
    scale: number,
    clusterRadius: number = 1.5
) {
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [highlightShotIds, setHighlightShotIds] = useState<Set<string>>(new Set());
    // 클릭으로 고정된 툴팁 — 고정된 동안은 호버 이동/이탈로 안 바뀌고 스크롤 등 클릭도 가능해진다
    // (도트가 몰린 지점에서 클러스터 리스트를 스크롤하려고 마우스를 움직이면 호버 판정 밖으로
    // 나가 툴팁이 사라져 스크롤이 사실상 불가능했던 문제).
    const [isPinned, setIsPinned] = useState(false);
    const svgRef = useRef<SVGSVGElement | null>(null);

    // 마우스 좌표 → 코트 좌표 변환 + 최근접 슛/클러스터 탐색. handleMouseMove와 handleClick이
    // 공유하는 순수 계산 로직 (SVG 좌표계 변환은 svgRef가 필요해 useCallback 밖으로 못 뺌).
    const findNearest = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const svg = svgRef.current;
        if (!svg || shots.length === 0) return null;

        const ctm = svg.getScreenCTM();
        if (!ctm) return null;

        const svgX = (e.clientX - ctm.e) / ctm.a;
        const svgY = (e.clientY - ctm.f) / ctm.d;
        const courtX = svgX / scale;
        const courtY = svgY / scale;

        let minDist = Infinity;
        let nearest: Shot | null = null;
        for (const shot of shots) {
            const dx = shot.x - courtX;
            const dy = shot.y - courtY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) { minDist = dist; nearest = shot; }
        }
        if (!nearest || minDist > 2) return null;

        const cluster: Shot[] = [];
        for (const shot of shots) {
            if (shot.id === nearest.id) continue;
            const dx = shot.x - nearest.x;
            const dy = shot.y - nearest.y;
            if (Math.sqrt(dx * dx + dy * dy) <= clusterRadius) cluster.push(shot);
        }

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        return { nearest, cluster, mouseX, mouseY, containerWidth: rect.width, containerHeight: rect.height };
    }, [shots, scale, clusterRadius]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (isPinned) return; // 고정된 동안은 호버로 내용이 안 바뀜

        const found = findNearest(e);
        if (!found) {
            if (tooltip !== null) {
                setTooltip(null);
                setHighlightShotIds(new Set());
            }
            return;
        }

        const { nearest, cluster, mouseX, mouseY, containerWidth, containerHeight } = found;
        const ids = new Set([nearest.id, ...cluster.map(s => s.id)]);
        setHighlightShotIds(ids);
        setTooltip({ primaryShot: nearest, clusterShots: cluster, mouseX, mouseY, containerWidth, containerHeight });
    }, [isPinned, findNearest, tooltip]);

    const handleMouseLeave = useCallback(() => {
        if (isPinned) return; // 고정된 동안은 마우스가 나가도 안 사라짐
        setTooltip(null);
        setHighlightShotIds(new Set());
    }, [isPinned]);

    // 슛(또는 클러스터)을 클릭하면 그 시점의 툴팁을 고정한다. 이미 고정된 상태에서의 클릭(다른
    // 도트 포함)은 바로 새로 선택하지 않고 일단 해제만 한다 — 한 번 더 클릭해야 새로 고정된다.
    // (이전엔 고정 상태에서 다른 도트를 클릭하면 그 자리에서 바로 재고정돼, 기존 선택을 눈으로
    // 확인하고 해제할 틈 없이 바로 다음 그룹으로 넘어가버리는 문제가 있었음)
    const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (isPinned) {
            setIsPinned(false);
            setTooltip(null);
            setHighlightShotIds(new Set());
            return;
        }
        const found = findNearest(e);
        if (!found) return;
        const { nearest, cluster, mouseX, mouseY, containerWidth, containerHeight } = found;
        const ids = new Set([nearest.id, ...cluster.map(s => s.id)]);
        setHighlightShotIds(ids);
        setTooltip({ primaryShot: nearest, clusterShots: cluster, mouseX, mouseY, containerWidth, containerHeight });
        setIsPinned(true);
    }, [isPinned, findNearest]);

    const closePinned = useCallback(() => {
        setIsPinned(false);
        setTooltip(null);
        setHighlightShotIds(new Set());
    }, []);

    return { tooltip, highlightShotIds, svgRef, handleMouseMove, handleMouseLeave, handleClick, isPinned, closePinned };
}

/**
 * Calculate shot distance in feet from the nearest hoop.
 */
export function calcShotDistance(x: number, y: number): number {
    // Determine which hoop is closer
    const hoopRightX = COURT_WIDTH - HOOP_X_LEFT;
    const distLeft = Math.sqrt((x - HOOP_X_LEFT) ** 2 + (y - HOOP_Y_CENTER) ** 2);
    const distRight = Math.sqrt((x - hoopRightX) ** 2 + (y - HOOP_Y_CENTER) ** 2);
    return Math.round(Math.min(distLeft, distRight));
}
