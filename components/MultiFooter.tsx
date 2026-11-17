import React from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME, APP_YEAR, getLeagueLogoUrl } from '../utils/constants';
import { APP_VERSION, FOOTER_LINKS, getServiceDisclaimer } from '../utils/serviceInfo';
import { useSeasonNavModel, type SeasonNavItem } from './nav/useSeasonNavModel';

/** 서비스 정보 링크(About · Terms of Use · Privacy · Discord) — 세션을 벗어나는 페이지라 새 탭으로 연다(보고 있던 화면을 잃지 않게). */
const ServiceLinks: React.FC<{ className: string; linkClassName: string }> = ({ className, linkClassName }) => (
    <div className={className}>
        {FOOTER_LINKS.map(({ label, path, href }) => (
            <a key={label} href={href ?? path} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                {label}
            </a>
        ))}
    </div>
);

/**
 * [2026-11-17] 멀티세션 글로벌 푸터(데스크톱) — 데스크톱 셸(MultiSeasonLayout) 본문 스크롤 영역의 맨 끝에 놓인다.
 * 구성: 위 = 서비스 정보(로고 · 링크 · 카피라이트 · 버전) + 사이트맵, 아래 = 디스클레이머.
 * - 고정(sticky)하지 않는다(사용자 지시) — 화면을 끝까지 내려야 보인다.
 * - mt-auto: 본문이 화면보다 짧을 때 푸터를 스크롤 영역 바닥으로 민다(부모가 flex-col이어야 한다 — MultiSeasonLayout 참조).
 * - 사이트맵 = 사이드바 메뉴와 같은 항목·순서·노출 조건(useSeasonNavModel), 사이드바 구분선 단위로 열을 나눈다.
 *   메뉴를 추가/숨길 때 여기는 따로 고칠 필요 없다(모델만 고치면 된다). 세션 안 이동이라 같은 탭.
 * - 디스클레이머 줄의 우측 여백 96px = 리그 채팅 버튼(LeagueChatDock, fixed bottom-6 right-6 · 48px) 자리.
 * 폰·태블릿은 아래 MultiFooterPhone을 "더보기" 화면 맨 아래에 둔다.
 */
export const MultiFooter: React.FC = () => {
    const { items } = useSeasonNavModel();
    const columns: SeasonNavItem[][] = [];
    for (const it of items) {
        if (it.dividerBefore || columns.length === 0) columns.push([]);
        columns[columns.length - 1].push(it);
    }

    return (
        <footer className="mt-auto shrink-0 bg-slate-900 border-t border-slate-700">
            <div className="px-4 py-8 flex items-start justify-between gap-12">
                <div className="min-w-0 flex flex-col gap-4">
                    <img src={getLeagueLogoUrl('Main')} alt={APP_NAME} className="h-9 w-auto self-start select-none" draggable={false} />
                    <ServiceLinks
                        className="flex flex-wrap items-center gap-x-4 gap-y-1"
                        linkClassName="text-sm text-slate-400 hover:text-white transition-colors"
                    />
                    <div className="space-y-1">
                        <p className="text-xs text-slate-500 ko-normal">© {APP_YEAR} {APP_NAME}. All rights reserved.</p>
                        <p className="text-xs text-slate-500 tabular-nums">{APP_VERSION}</p>
                    </div>
                </div>

                <nav aria-label="사이트맵" className="shrink-0 flex gap-12">
                    {columns.map(col => (
                        <ul key={col[0].id} className="min-w-[64px] flex flex-col gap-2.5">
                            {col.map(it => (
                                <li key={it.id}>
                                    <Link to={it.path} className="text-sm text-slate-400 hover:text-white transition-colors ko-normal">
                                        {it.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    ))}
                </nav>
            </div>

            <div className="pl-4 pr-[96px] py-4 border-t border-slate-800">
                <p className="max-w-4xl text-2xs text-slate-500">{getServiceDisclaimer()}</p>
            </div>
        </footer>
    );
};

/**
 * [2026-11-17] 멀티세션 글로벌 푸터(폰·태블릿) — "더보기" 화면(MobileMoreView) 맨 아래, 로그아웃 다음에 놓인다(사용자 결정).
 * 하단 탭 바가 고정이라 화면마다 푸터를 둘 자리가 없어 "더보기" 한 곳에만 둔다. 사이트맵은 없다 — "더보기" 목록이 곧 사이트맵.
 * docs/ui/mobile-design-system.md 규칙: 좌우 거터 16 · 간격 4px 그리드(4/12/16/24) · 글자 12/14만(콘텐츠에 10px 금지) ·
 * 폰 캡션 색은 slate-400(slate-500 금지) · 탭 대상 높이 44(링크 h-11, 늘어난 만큼 -my-3으로 보이는 간격은 16 유지).
 */
export const MultiFooterPhone: React.FC = () => (
    <footer className="px-4 pt-6 flex flex-col gap-4">
        <img src={getLeagueLogoUrl('Main')} alt={APP_NAME} className="h-8 w-auto self-start select-none" draggable={false} />
        <ServiceLinks
            className="-my-3 flex flex-wrap items-center gap-x-4"
            linkClassName="h-11 inline-flex items-center text-sm font-medium text-slate-400 active:text-white"
        />
        <div className="space-y-1">
            <p className="text-xs text-slate-400 ko-normal">© {APP_YEAR} {APP_NAME}. All rights reserved.</p>
            <p className="text-xs text-slate-400 tabular-nums">{APP_VERSION}</p>
        </div>
        <p className="text-xs text-slate-400">{getServiceDisclaimer()}</p>
    </footer>
);
