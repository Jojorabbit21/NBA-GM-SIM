# 엔진 보관본 v253

커밋 `fd3e395266904ad304818dc5dba8dc2804b4fd52` 의 경기 엔진을 그대로 복사해 둔 것입니다. 엔진 프로필이 이 보관본인 방은 이 폴더의 코드로 경기를 돌립니다
(`server/src/engineProfile.ts`). 운영 중인 세션의 경기 결과가 엔진 개발의 영향을 받지 않게 하려는 장치입니다.

- **이 폴더의 파일은 수정하지 않습니다.** 엔진 작업은 `server/src/shared/` 에서만 합니다.
- 확인: `node scripts/engineSnapshot.mjs verify v253` — 모든 파일이 위 커밋과 바이트 단위로 같은지 검사합니다.
- 다시 만들기: 폴더를 지우고 `node scripts/engineSnapshot.mjs create fd3e3952 v253`.
- 복사하지 않고 운영 서버 모듈을 그대로 쓰는 파일(프로세스 전체가 공유하는 상태·연결): `MANIFEST.json` 의 `shims`.
  이 모듈들이 위 커밋 이후 바뀌면 `verify` 가 알려 줍니다.
- 이 보관본을 쓰는 방이 없어지면 폴더와 `engineProfile.ts` 의 해당 줄을 지웁니다.
