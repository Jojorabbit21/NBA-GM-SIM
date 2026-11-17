import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';

// [2026-11-17] 글로벌 푸터 자리(슬롯) — 화면이 "자기 세로 스크롤 상자 맨 끝"에 푸터를 직접 둘 수 있게 하는 장치.
//
// 왜 필요한가: 멀티세션 데스크톱 화면 대부분은 머리(배너·탭)를 고정하고 본문만 안쪽 상자에서 스크롤한다. 셸(MultiSeasonLayout)이
// 화면 아래에 푸터를 붙이면 "본문을 다 내린 뒤 → 화면 전체가 푸터 높이만큼 한 번 더 밀려 올라가는" 2단 스크롤이 된다.
// 그래서 본문 스크롤 상자 안, 내용 바로 아래에 푸터를 둔다(사용자 지시: 본문이 내용만큼 이어지고 푸터는 그 아래).
//
// 동작: 셸이 FooterSlotHost로 감싸 푸터 요소를 내려 준다. 화면이 <FooterSlot />을 그리면(= 마운트되면) 셸은 자기 푸터를 숨긴다.
// 어떤 상태에서도 <FooterSlot />을 그리지 않는 화면(로딩 중, 칸이 여러 개라 본문이 하나가 아닌 화면 등)은 예전처럼 셸이 화면 아래에 그린다
// — 그래서 푸터가 빠지는 화면은 없다.
//
// 이 파일은 앱 코드를 import하지 않는다(공용 Table · RosterView 같은 싱글/멀티 공용 컴포넌트가 가져다 쓰므로 순환 임포트를 만들지 않기 위함).
// 호스트 밖(싱글 플레이, 폰·태블릿 셸)에서는 슬롯이 없어 아래 컴포넌트들이 전부 "예전 그대로"로 동작한다.

interface FooterSlotValue {
    /** 셸이 내려 주는 푸터 요소 */
    footer: React.ReactNode;
    /** 슬롯이 마운트되는 동안 셸 푸터를 숨긴다. 반환값 = 해제 함수 */
    claim: () => () => void;
}

const FooterSlotContext = createContext<FooterSlotValue | null>(null);

/** 셸(스크롤 영역 안)에서 본문을 감싼다. 본문 어디에도 슬롯이 없으면 본문 뒤에 푸터를 직접 그린다. DOM 요소를 추가하지 않는다. */
export const FooterSlotHost: React.FC<{ footer: React.ReactNode; children: React.ReactNode }> = ({ footer, children }) => {
    const [claims, setClaims] = useState(0);
    const claim = useCallback(() => {
        setClaims(c => c + 1);
        return () => setClaims(c => c - 1);
    }, []);
    const value = useMemo(() => ({ footer, claim }), [footer, claim]);
    return (
        <FooterSlotContext.Provider value={value}>
            {children}
            {claims === 0 && footer}
        </FooterSlotContext.Provider>
    );
};

/** 이 화면이 푸터를 직접 둘 수 있는 셸(멀티세션 데스크톱) 안에 있는가 */
export const useHasFooterSlot = (): boolean => useContext(FooterSlotContext) !== null;

/**
 * 푸터 자리. 세로 스크롤 상자의 내용 맨 끝에 둔다. 한 화면 상태에 하나만 마운트할 것(둘이면 푸터도 둘 그려진다).
 * 푸터 자체가 mt-auto라, 부모가 flex-col이면 내용이 짧을 때 바닥에 붙는다.
 * useLayoutEffect: 셸 푸터와 슬롯 푸터가 한 프레임이라도 같이 보이지 않게 그리기 전에 알린다.
 */
export const FooterSlot: React.FC = () => {
    const slot = useContext(FooterSlotContext);
    const claim = slot?.claim;
    useLayoutEffect(() => claim?.(), [claim]);
    return slot ? <>{slot.footer}</> : null;
};

/**
 * 높이가 정해진 세로 스크롤 상자 "바로 안"에서 내용 + 푸터를 쌓는다 — 내용이 짧으면 푸터가 상자 바닥에, 길면 내용 끝에.
 * className은 내용 상자에 붙는다(여백 등). 슬롯이 없으면 className을 가진 div 하나(className도 없으면 children 그대로).
 */
export const FooterFlow: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => {
    const has = useHasFooterSlot();
    if (!has) return className ? <div className={className}>{children}</div> : <>{children}</>;
    return (
        <div className="min-h-full flex flex-col">
            <div className={`grow shrink-0 ${className ?? ''}`}>{children}</div>
            <FooterSlot />
        </div>
    );
};

/**
 * 탭마다 본문 형태가 다른 화면의 "세로 스크롤 상자 바로 안"에서 쓰는 래퍼. 슬롯이 없으면 children 그대로.
 * - flow : 본문이 내용 높이만큼 흐르는 탭(표·카드 나열) → FooterFlow(내용 끝 또는 상자 바닥에 푸터)
 * - fill : 좌우로 칸이 나뉘어 칸마다 따로 스크롤하는 탭(h-full 자식) → 칸 영역은 상자 높이를 그대로 채우고 그 아래로 푸터가 이어진다
 *          (칸을 내용 높이로 풀면 칸 하단 고정 요소·칸별 스크롤이 전부 깨진다)
 * - own  : 본문이 자기 안쪽 스크롤 상자에 푸터 자리를 직접 둔다(또는 로딩처럼 둘 곳이 없다) → 손대지 않는다
 */
export const FooterTabBody: React.FC<{ mode: 'flow' | 'fill' | 'own'; children: React.ReactNode }> = ({ mode, children }) => {
    const has = useHasFooterSlot();
    if (!has || mode === 'own') return <>{children}</>;
    if (mode === 'flow') return <FooterFlow>{children}</FooterFlow>;
    return (
        <>
            <div className="h-full">{children}</div>
            <FooterSlot />
        </>
    );
};

/**
 * fill과 같은 일을 하되 스크롤 상자까지 직접 만든다 — 부모가 스크롤 상자가 아니라 높이만 정해진 상자(overflow-hidden)일 때.
 * 슬롯이 없으면 children 그대로.
 */
export const FooterFillScroll: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const has = useHasFooterSlot();
    if (!has) return <>{children}</>;
    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="h-full">{children}</div>
            <FooterSlot />
        </div>
    );
};

/**
 * 가로·세로를 한 상자가 스크롤하는 곳(넓은 표)의 내용 맨 끝에 두는 푸터 자리 — 가로로 스크롤해도 푸터는 왼쪽에 붙어 화면 폭 그대로 보인다.
 * 부모(스크롤 상자)는 flex-col이어야 한다: 폭 = 상자 폭, mt-auto = 내용이 짧으면 바닥.
 */
export const FooterSlotWide: React.FC = () => {
    const has = useHasFooterSlot();
    if (!has) return null;
    return (
        <div className="mt-auto shrink-0 sticky left-0 w-full">
            <FooterSlot />
        </div>
    );
};
