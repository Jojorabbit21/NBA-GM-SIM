-- meta_gms: 30팀 프런트 성향 재평가 (2026-10-20)
--
-- 배경: docs/plan/multi-ai-gm-profile-plan.md 6장. 성향은 사람이 아니라 "구단 프런트" 단위이고,
-- 근거는 최근 1~2년 구단의 실제 결정. 기존 값은 2024년 전후 이미지라 30팀 중 21팀 유형이 바뀜.
-- 출처: ESPN 2026-27 오프시즌 30팀 정리, NBA.com 2025-26 트레이드 트래커(시즌 중 26건),
--       2025년 이전 행보는 기존 지식(profile_basis에 "(2025)"로 표기, 이번에 웹 재확인 안 함).
-- 사용자 결정: 승부욕 0.90 상한 쏠림(6팀) 그대로, CHI는 rebuilder 유지.
-- 영향: meta_gms는 싱글 CPU 트레이드(gmProfiler)와 멀티 AI 단장(aiGmProfile)이 공유.
--
-- 롤백(이전 personality_type / sliders 적극,스타,유스,위험,픽):
--   atl rebuilder 7,4,8,5,3 | bkn rebuilder 5,3,8,4,2 | bos valueTrader 6,6,5,4,5 | cha youthMovement 5,3,9,5,2
--   chi balanced 5,5,6,4,4 | cle balanced 6,6,5,5,5 | dal starHunter 8,9,4,7,8 | den balanced 6,6,5,5,5
--   det youthMovement 6,3,10,6,2 | gs winNow 7,8,4,6,7 | hou youthMovement 7,4,9,5,3 | ind valueTrader 5,5,6,4,4
--   lam starHunter 8,10,3,7,9 | law starHunter 8,9,3,7,8 | mem balanced 6,5,7,5,4 | mia winNow 8,9,3,7,8
--   mil winNow 7,8,3,6,7 | min winNow 8,8,3,7,8 | no starHunter 7,8,4,7,7 | nyk starHunter 8,9,3,7,8
--   okc valueTrader 5,5,8,4,2 | orl balanced 5,5,6,4,4 | phi starHunter 9,10,3,8,9 | phx winNow 8,9,3,8,9
--   por rebuilder 5,3,8,4,2 | sa valueTrader 4,4,7,3,3 | sac balanced 6,6,6,5,5 | tor youthMovement 5,3,9,5,2
--   uta rebuilder 6,4,9,4,2 | was rebuilder 6,3,9,4,2
--   profile_basis는 직전 마이그레이션(meta_gms_front_office_2026_27)의 '기존 유지'/'재평가 필요'로 되돌림.

UPDATE public.meta_gms AS m SET
    personality_type = v.ptype,
    sliders = jsonb_build_object(
        'aggressiveness', v.agg, 'starWillingness', v.star, 'youthBias', v.youth,
        'riskTolerance', v.risk, 'pickWillingness', v.pick),
    profile_basis = v.basis,
    verified_at   = DATE '2026-10-20'
FROM (VALUES
    ('atl', 'valueTrader',   8, 4, 5, 6, 4, '[높음] 트레이 영을 매콜럼·키스퍼트와 교환, 포르징기스→쿠밍가, 2024 1순위 리사셰르→도트·위긴스. 가치 위주로 과감'),
    ('bos', 'valueTrader',   7, 5, 4, 5, 5, '[높음] 제일런 브라운 트레이드, 부체비치 영입·재트레이드, 조지·콘리·로빈슨 영입. 에이프런 관리하며 50승 목표'),
    ('bkn', 'rebuilder',     5, 3, 8, 5, 2, '[높음] 클랙스턴 방출, 6순위 지명, 랜들 영입. 캡 여유·픽 축적 기조'),
    ('cha', 'valueTrader',   7, 2, 7, 4, 2, '[높음] 4팀 트레이드로 라멜로 볼 방출, 브리지스 방출, 연봉 2,500만+ 선수 0명. 픽·캡 유연성 중시(머니볼)'),
    ('chi', 'rebuilder',     5, 4, 7, 5, 3, '[낮음] 신임(2026-05). 4순위 칼렙 윌슨 중심 재편, 파월·클랙스턴 영입. 시즌 중 정리는 전임 체제 결정'),
    ('cle', 'winNow',        8, 8, 3, 7, 8, '[높음] 갈랜드→하든, 르브론 영입 실패 후 웨이드·스트러스·낸스·르버트 정리하고 왓슨 영입. 사치세 감수'),
    ('dal', 'rebuilder',     7, 5, 7, 6, 4, '[보통] 우지리 부임 후 키드 경질, 미들턴 방출, 리사셰르 영입, 9순위 지명. 리셋'),
    ('den', 'valueTrader',   5, 5, 4, 4, 4, '[보통] 리그 유일 2차 에이프런 초과 → 탈출 위해 왓슨·하더웨이·발란추나스 정리'),
    ('det', 'valueTrader',   5, 5, 6, 3, 3, '[보통] 60승에도 단기 베테랑 계약 위주, 듀런 재계약 교착, 2옵션 영입에 소극적'),
    ('gs',  'winNow',        6, 7, 3, 6, 4, '[높음] 쿠밍가·힐드→포르징기스, 오프시즌은 단기 계약으로 픽 보호·유연성. 버틀러 영입(2025)'),
    ('hou', 'balanced',      6, 6, 6, 5, 5, '[보통] 야니스 영입전 불참·내부 성장, 이슨 연장, 스마트·보그다노비치 영입. 듀랜트 영입(2025)'),
    ('ind', 'winNow',        8, 6, 4, 6, 7, '[높음] 마투린+1라운드 2장→주바치. 할리버튼 복귀 시즌 우승 도전'),
    ('lam', 'starHunter',    8, 9, 3, 7, 9, '[높음] 케슬러 사인앤트레이드에 2031·2033 비보호 1R+스왑, 리브스 연장. 루카 영입(2025)'),
    ('law', 'balanced',      6, 5, 6, 6, 5, '[낮음] 대행 체제. 하든→갈랜드, 주바치→마투린+1R 2장, 5순위 지명, 카와이 트레이드 진행. 노장→젊은 쪽 재편'),
    ('mem', 'youthMovement', 8, 2,10, 5, 2, '[높음] 잭슨 주니어→1R 3장, 모란트 방출, 3순위 부저. 전면 유스 무브먼트'),
    ('mia', 'starHunter',    9,10, 2, 8, 8, '[높음] 히로·웨어·하케스·야쿠치오니스·파월로 야니스 영입, 톰프슨·포티스 추가'),
    ('mil', 'rebuilder',     6, 3, 8, 5, 3, '[높음] 야니스를 마이애미로 트레이드, 10순위 지명. 명확한 리빌딩'),
    ('min', 'winNow',        9, 8, 3, 8, 8, '[높음] 랜들·리드·1R로 라멜로 볼 영입(4팀), 도스먼 영입 후 5년 연장'),
    ('no',  'balanced',      5, 4, 6, 6, 6, '[보통] 2026 로스터 14/15 유지·감독 교체만. 2026 비보호 1R로 드래프트 트레이드업(2025). 해마다 엇갈림'),
    ('nyk', 'winNow',        7, 8, 3, 6, 8, '[높음] 2026 우승, 2차 에이프런 회피하며 핵심 시장가 이하 잔류. 브리지스에 1R 5장(2024)'),
    ('okc', 'valueTrader',   6, 5, 8, 4, 4, '[높음] 비용 관리, 도트·위긴스·조 정리, J.윌리엄스·홈그렌 연장, 1R로 매케인 영입'),
    ('orl', 'balanced',      6, 6, 5, 5, 6, '[보통] 플레이오프 탈락 후 감독 교체·소폭 조정. 베인 영입에 1R 4장(2025)'),
    ('phi', 'starHunter',    9, 9, 3, 8, 7, '[보통] 갠지 부임 직후 제일런 브라운 영입(조지·드러먼드·그라임스·우브레 방출), 르브론 서명. 부임 4개월'),
    ('phx', 'balanced',      6, 5, 4, 5, 5, '[보통] 코어 유지·질레스피·윌리엄스·브룩스 재계약, 브리지스 영입. 듀랜트 대가 회수(2025)'),
    ('por', 'winNow',        7, 7, 5, 8, 6, '[보통] 모란트 영입(그랜트·머리·사이불 방출), 릴러드 복귀. 새 구단주 비용 절감 변수'),
    ('sac', 'rebuilder',     5, 4, 7, 5, 3, '[보통] 더로잔·웨스트브룩 정리, 7순위 지명. 젊은 쪽 전환'),
    ('sa',  'balanced',      5, 6, 7, 5, 5, '[보통] 웸반야마 25% 맥스 연장, 해리스 2년. 지속 가능한 경쟁. 팍스 영입(2025)'),
    ('tor', 'winNow',        8, 8, 4, 8, 7, '[높음] 크리스 폴 영입, 잉그램·딕으로 카와이 레너드 영입(조사로 지연). 부상 위험 감수'),
    ('uta', 'youthMovement', 7, 5, 9, 6, 4, '[보통] 1R 3장으로 잭슨 주니어 영입, 케슬러 사인앤트레이드로 1R 2장+스왑 2, 2순위 지명'),
    ('was', 'balanced',      8, 7, 7, 7, 5, '[보통] 트레이 영·앤서니 데이비스 영입, 영 4년 2.12억, 1순위 디반사. 리빌딩→경쟁 전환')
) AS v(team_id, ptype, agg, star, youth, risk, pick, basis)
WHERE m.team_id = v.team_id;
