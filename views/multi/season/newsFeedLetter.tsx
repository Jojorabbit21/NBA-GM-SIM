// newsFeedLetter.tsx — 뉴스피드 "레터" 카드 29종이 복붙하던 골격·조각을 한 곳에 모음. [2026-10-13]
// (docs/plan/ui-consolidation.md 6장 2번, docs/plan/ui-audit/01-newsfeed.md P1~P15)
// - LetterShell: 마스트헤드(BrandMark) + 제목 h1 + 날짜 + 구분선 + 본문 문단(blurb) + children — 29회 복붙하던 골격
// - ClickableText: onClick이 있을 때만 cursor/hover 효과가 붙는 span — 같은 클래스 문자열 42회
// - LetterSectionTitle: 표/구획 제목(h3 소제목, h4 본문 제목)
// - LetterPlayerCell / LetterTeamCell / LetterRankCell: 공용 Table 안에서 쓰는 선수·팀·순위 셀
// - LetterLink: "경기 다시보기 →" 같은 이동 링크(Button link + ArrowRight)
// - LetterHero: 수상/우승 레터의 그라디언트 히어로 박스
// - BoxScoreWaitNote: "박스스코어는 경기 종료 후 최대 10분 뒤 공개됩니다."
import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { EmptyState } from '../../../components/common/EmptyState';
import { TableCell } from '../../../components/common/Table';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { PlayerHoverCard, type PlayerCardEntry } from '../../../components/common/PlayerHoverCard';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';

/** 가상 언론사 The Basketball Chronicle 마스트헤드(public/images/bc2.svg). 레터 헤더 최상단 h-4, 피드 상단 h-5. */
export const BrandMark: React.FC<{ className?: string }> = ({ className = 'h-4 w-auto' }) => (
    <img src="/images/bc2.svg" alt="The Basketball Chronicle" className={className} />
);

/** 이벤트 레터 본문 최상단의 이벤트 로고(올스타/라이징스타/3점/덩크) — 64px 정사각 */
export const EventLetterLogo: React.FC<{ src: string; alt: string }> = ({ src, alt }) => (
    <img src={src} alt={alt} className="h-16 w-16" />
);

/** onClick이 있을 때만 클릭 가능 스타일(cursor + hover 인디고 + 밑줄). 없으면 평문.
 *  [2026-10-14] forwardRef — PlayerHoverCard가 cloneElement로 anchor ref와 hover 핸들러를 자식에 얹으므로,
 *  ref를 span까지 전달해야 팝업 위치 계산이 되고 "Function components cannot be given refs" 경고가 안 난다.
 *  onMouseEnter 등 PlayerHoverCard가 주입하는 나머지 핸들러도 rest로 span에 전달. */
export const ClickableText = React.forwardRef<HTMLSpanElement, {
    onClick?: () => void;
    children: React.ReactNode;
    className?: string;
    /** 본문 문장 속 링크처럼 밑줄 없이 색만 바뀌게 */
    noUnderline?: boolean;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'onClick' | 'className' | 'children'>>(
    ({ onClick, children, className = '', noUnderline = false, ...rest }, ref) => (
        <span
            ref={ref}
            {...rest}
            className={`${className} ${onClick ? `cursor-pointer hover:text-indigo-400 ${noUnderline ? '' : 'hover:underline'}` : ''}`.trim()}
            onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
        >
            {children}
        </span>
    ),
);
ClickableText.displayName = 'ClickableText';

const WIDTH = { '5xl': 'max-w-5xl', '3xl': 'max-w-3xl' } as const;
const SPACING = { 6: 'space-y-6', 8: 'space-y-8' } as const;

interface LetterShellProps {
    /** 본문 레터 5xl(기본) / 플레이오프·우승 레터 3xl */
    width?: keyof typeof WIDTH;
    /** 히어로형(우승·FMVP) 레터만 8 */
    spacing?: keyof typeof SPACING;
    /** h1 내용 — 클릭 가능한 접두(팀명/선수명)는 호출부가 ClickableText로 감싸 넘긴다. null이면 헤더 블록 생략(히어로형) */
    title?: React.ReactNode;
    /** 날짜 줄(인게임 날짜 또는 상대 시각) */
    date?: React.ReactNode;
    /** 마스트헤드와 헤더 사이에 끼울 요소(예: 시리즈 결과 레터의 팀 로고 줄) */
    beforeHeader?: React.ReactNode;
    /** 본문 첫 문단 묶음 — buildNewsBlurb() 결과 */
    blurb?: string[] | null;
    children?: React.ReactNode;
    className?: string;
}

/** 레터 골격 — BrandMark + [beforeHeader] + (h1 · 날짜 · 구분선) + blurb + children */
export const LetterShell: React.FC<LetterShellProps> = ({ width = '5xl', spacing = 6, title, date, beforeHeader, blurb, children, className = '' }) => (
    <div className={`${WIDTH[width]} ${SPACING[spacing]} ko-normal relative ${className}`}>
        <BrandMark />
        {beforeHeader}
        {title != null && (
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{title}</h1>
                {date != null && <p className="text-sm text-slate-500">{date}</p>}
                <div className="border-t border-slate-700" />
            </div>
        )}
        {blurb && blurb.length > 0 && (
            <div className="space-y-2">
                {blurb.map((line, idx) => <p key={idx} className="text-sm text-slate-300 leading-relaxed">{line}</p>)}
            </div>
        )}
        {children}
    </div>
);

/** 구획 제목. h4 = 본문 제목(16px 흰색), h3 = 표 소제목(14px slate-300). 왼쪽에 작은 로고/아이콘 옵션. */
export const LetterSectionTitle: React.FC<{
    level?: 'h3' | 'h4';
    children: React.ReactNode;
    logoSrc?: string;
    icon?: React.ReactNode;
    className?: string;
}> = ({ level = 'h3', children, logoSrc, icon, className = '' }) => {
    const Tag = level;
    const base = level === 'h4' ? 'text-base font-black text-white' : 'text-sm font-black text-slate-300';
    return (
        <Tag className={`flex items-center gap-1.5 ${base} ${className}`}>
            {logoSrc && <img src={logoSrc} alt="" className="h-5 w-5" />}
            {icon}
            {children}
        </Tag>
    );
};

/** 공용 Table 안의 선수 이름 셀 — PlayerHoverCard + 클릭. 표 17개가 10줄씩 복붙하던 조각. */
export const LetterPlayerCell: React.FC<{
    name: string;
    entry?: PlayerCardEntry;
    onClick?: () => void;
    /** 박스스코어처럼 흐린 톤 */
    muted?: boolean;
    className?: string;
}> = ({ name, entry, onClick, muted = false, className = '' }) => (
    <TableCell align="left" className={className}>
        <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
            <ClickableText onClick={onClick} className={`text-sm font-bold ${muted ? 'text-slate-300' : 'text-slate-100'}`}>{name}</ClickableText>
        </PlayerHoverCard>
    </TableCell>
);

/** 공용 Table 안의 팀 셀 — 약어(클릭) + 선택적 로고. 로고 폴백은 TeamLogo가 처리. */
export const LetterTeamCell: React.FC<{
    slug: string;
    team?: LeagueTeamRow;
    onOpenTeam?: (slug: string) => void;
    logo?: boolean;
    className?: string;
}> = ({ slug, team, onOpenTeam, logo = false, className = '' }) => (
    <TableCell align="left" className={className}>
        <span className="flex items-center gap-1.5 min-w-0">
            {logo && <TeamLogo teamId={slug} teamName={team?.team_abbr ?? slug} size="custom" className="w-5 h-5 shrink-0" shadow={false} />}
            <ClickableText onClick={onOpenTeam ? () => onOpenTeam(slug) : undefined} className="text-sm text-slate-300">
                {team?.team_abbr ?? slug}
            </ClickableText>
        </span>
    </TableCell>
);

/** 순위 셀 — 가운데 정렬, 흐린 굵은 숫자 */
export const LetterRankCell: React.FC<{ rank: number; className?: string }> = ({ rank, className = '' }) => (
    <TableCell className={`font-bold text-slate-400 tabular-nums ${className}`}>{rank}</TableCell>
);

/** "경기 다시보기 →" 류 이동 링크 */
export const LetterLink: React.FC<{ onClick: () => void; children: React.ReactNode; className?: string }> = ({ onClick, children, className }) => (
    <Button variant="link" underline onClick={onClick} iconRight={<ArrowRight size={14} />} className={className}>
        {children}
    </Button>
);

/** 수상/우승 레터의 히어로 박스(앰버 그라디언트) */
export const LetterHero: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`flex flex-col items-center text-center gap-3 py-4 px-6 rounded-2xl bg-gradient-to-b from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/20 ${className}`}>
        {children}
    </div>
);

/** 박스스코어가 아직 공개되지 않았을 때 */
export const BoxScoreWaitNote: React.FC = () => (
    <EmptyState padding="sm" title="박스스코어는 경기 종료 후 최대 10분 뒤 공개됩니다." />
);
