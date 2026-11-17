import { APP_NAME } from './constants';

// [2026-11-17] 서비스 정보 — 홈 화면 푸터(views/home/StartScreen.tsx)와 멀티세션 푸터(components/MultiFooter.tsx)가 같이 쓴다.
// 원래 StartScreen 안 로컬 상수였다. 두 푸터가 서로를 import하지 않도록 별도 파일로 뺐다.
export const APP_VERSION = 'v1.0.7';
// [2026-11-09] About/Terms/Privacy 는 pages/LegalPage.tsx 라우트로 연결.
// [2026-11-11] Discord 는 외부 초대 링크(새 탭). 링크가 비어 있으면 클릭해도 동작 없음(표시만).
// 초대 링크는 "만료 없음 · 사용 횟수 무제한"으로 만든 영구 링크여야 한다(기본 링크는 7일 뒤 만료).
export const DISCORD_INVITE_URL = 'https://discord.gg/fjAFxEtZKH';
export const FOOTER_LINKS: { label: string; path?: string; href?: string }[] = [
    { label: 'About',        path: '/about' },
    { label: 'Terms of Use', path: '/terms' },
    { label: 'Privacy',      path: '/privacy' },
    { label: 'Discord',      href: DISCORD_INVITE_URL },
];

/**
 * 상표 디스클레이머(nominative fair use) — 법적 고지라 대상 상표명을 그대로 적는다. 일반 UI 문구에는 쓰지 않는다.
 * 모듈 최상위 상수가 아니라 함수인 이유: 호출 시점에 APP_NAME을 읽게 해 import 순서(TDZ)에 묶이지 않게 한다.
 */
export function getServiceDisclaimer(): string {
    return `Disclaimer: ${APP_NAME} is not sponsored by or endorsed by the National Basketball Association, `
        + 'the National Basketball Players Association, any individual NBA players, or any of their affiliates. '
        + 'All league trademarks are property of their respective owners and are used under the doctrine of trademark nominative fair use.';
}
