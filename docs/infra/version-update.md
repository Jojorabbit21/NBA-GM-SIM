# 버전 업데이트 알림 시스템

## 개요

Vercel에 새 버전이 배포되었을 때, 이미 열려있는 브라우저 탭의 사용자에게 업데이트 알림을 표시하고 새로고침을 유도하는 시스템.

---

## 동작 흐름

```
Vercel 배포 (vite build)
  → build/version.json 생성 (타임스탬프)
  → JS 번들에 __BUILD_VERSION__ 주입 (동일 타임스탬프)

사용자 브라우저
  → useUpdateChecker 훅이 주기적으로 /version.json 폴링
  → __BUILD_VERSION__과 비교
  → 불일치 감지 → 우측 하단 UpdateToast 표시
  → "새로고침" 클릭 → location.reload() → 새 에셋 로드
```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `vite.config.ts` | `build-version` 플러그인 (version.json 생성 + `__BUILD_VERSION__` define) |
| `hooks/useUpdateChecker.ts` | 버전 폴링 훅 (5분 간격 + 탭 복귀 시 체크) |
| `components/UpdateToast.tsx` | 우측 하단 알림 UI |
| `App.tsx` | 훅 + 컴포넌트 연동 |

---

## 폴링 정책

- **첫 체크**: 페이지 로드 30초 후 (초기 부하 방지)
- **주기**: 5분 간격 (`setInterval`)
- **탭 복귀**: `visibilitychange` 이벤트로 즉시 체크
- **캐시 회피**: `fetch('/version.json', { cache: 'no-store' })`
- **Dev 모드**: 비활성화 (`import.meta.env.DEV` 체크)

---

## 캐시 전략 & 새로고침

### Vite + Vercel의 캐시 구조

| 파일 | 캐시 정책 | 비고 |
|------|-----------|------|
| `index.html` | `no-cache` (Vercel 기본) | reload 시 항상 새로 받음 |
| `*.js` / `*.css` | 영구 캐시 (`immutable`, 1년) | 파일명에 content hash 포함 (예: `index-Dk3f8a2B.js`) |
| `version.json` | 훅에서 `cache: 'no-store` 강제 | 항상 최신 |

### 왜 `location.reload()`만으로 충분한가

1. Vite 빌드 산출물의 JS/CSS 파일명에 **content hash**가 포함됨
2. 코드가 변경되면 해시도 변경 → 브라우저 입장에서 완전히 새로운 URL
3. `reload()` → `index.html`을 새로 fetch → 새 해시 파일명의 JS/CSS 참조 → 새 에셋 로드
4. **강제 캐시 삭제 (`caches.delete()` 등) 불필요**

### Service Worker를 사용하지 않는 이유

- Service Worker가 있으면 `location.reload()`를 해도 SW가 캐시된 파일을 반환할 수 있음
- 이 경우 새 배포가 적용되지 않는 문제 발생 → `caches.delete()` 등 추가 처리 필요
- **이 프로젝트는 Service Worker를 사용하지 않으므로** 위 문제가 발생하지 않음

### Service Worker란?

브라우저가 백그라운드에서 실행하는 JavaScript 스크립트. 웹페이지와 네트워크 사이에서 **프록시** 역할을 한다.

주요 기능:
- **오프라인 캐싱**: 네트워크 요청을 가로채 캐시된 응답 반환 → 인터넷 없이도 앱 작동
- **푸시 알림**: 앱이 닫혀있어도 서버에서 알림 수신
- **백그라운드 동기화**: 오프라인 작업을 네트워크 복구 시 자동 전송

PWA(Progressive Web App)의 핵심 기술이지만, 캐시 관리가 복잡해지는 단점이 있어 현재 프로젝트에서는 도입하지 않음.

---

## UX 동작

- **"나중에"** 클릭 → 토스트 숨김, 다음 폴링 주기에 재표시되지 않음 (세션 내 dismiss)
- **"새로고침"** 클릭 → `window.location.reload()` 실행
- 페이지를 수동으로 새로고침하면 자연스럽게 새 버전 적용 (토스트 표시 전이라도)
