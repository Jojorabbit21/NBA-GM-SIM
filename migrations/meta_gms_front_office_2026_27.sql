-- meta_gms: 2026-27 프런트 수장/단장 갱신 + 직함·근거 컬럼 추가 (2026-10-20)
--
-- 배경: docs/plan/multi-ai-gm-profile-plan.md. 기존 gm_name은 팀마다 기준(GM/사장)이 섞여 있었고
-- 30팀 중 10팀은 이미 사람이 바뀐 상태였다(ATL 이름은 실존 확인 불가). 결정:
--   - 사장(농구 운영 최고 책임자)과 단장을 따로 저장, 성향(personality_type/sliders)은 "프런트" 단위로 하나만
--   - 근거가 약한 이름(위키백과 목록에만 있는 단장 등)은 저장하지 않음(null)
--   - LAC는 프랭크 자격정지 기간의 대행 체제로 입력
--   - 싱글은 표시 이름을 president_name 우선, 없으면 gm_name (gmProfiler.populateGMData)
-- 근거 출처: Hoops Rumors "Longest-Tenured NBA GMs/Presidents"(2026-09) + 2026년 개별 보도.
--
-- 컬럼 의미:
--   president_name/title : 농구 운영 최고 책임자. 겸직이면 title='사장 겸 단장' 등으로 여기에만 저장
--   gm_name/title        : 최고 책임자와 다른 사람이 단장일 때만
--   profile_basis        : 성향 근거 메모. '재평가 필요'는 수장이 바뀌어 기존 성향이 이전 인물 기준인 팀
--   verified_at          : 인물 정보 확인일
--
-- 롤백: 아래 컬럼 drop + gm_name을 원래 값으로 복원 + NOT NULL 재설정.
--   원래 gm_name: atl 랜디스 트래비스, bkn 숀 마크스, bos 브래드 스티븐스, cha 제프 피터슨,
--   chi 아르투라스 카르니소바스, cle 코비 올트먼, dal 니코 해리슨, den 캘빈 부스, det 트로이 위버,
--   gs 마이크 던리비 주니어, hou 라파엘 스톤, ind 채드 뷰캐넌, lam 롭 펠린카, law 로렌스 프랭크,
--   mem 잭 클라이만, mia 앤디 엘리스버그, mil 존 호스트, min 팀 코넬리, no 데이비드 그리핀,
--   nyk 레온 로즈, okc 샘 프레스티, orl 제프 웰트먼, phi 대릴 모리, phx 제임스 존스, por 조 크로닌,
--   sa R.C. 뷰포드, sac 몬테 맥네어, tor 바비 웹스터, uta 대니 에인지, was 윌 도슨
--   (personality_type/sliders는 이 마이그레이션에서 변경하지 않음)

ALTER TABLE public.meta_gms
    ADD COLUMN IF NOT EXISTS president_name  text,
    ADD COLUMN IF NOT EXISTS president_title text,
    ADD COLUMN IF NOT EXISTS gm_title        text,
    ADD COLUMN IF NOT EXISTS profile_basis   text,
    ADD COLUMN IF NOT EXISTS verified_at     date;

ALTER TABLE public.meta_gms ALTER COLUMN gm_name DROP NOT NULL;

UPDATE public.meta_gms AS m SET
    president_name  = v.president_name,
    president_title = v.president_title,
    gm_name         = v.gm_name,
    gm_title        = v.gm_title,
    profile_basis   = v.profile_basis,
    verified_at     = DATE '2026-10-20'
FROM (VALUES
    ('atl', '온시 살레',          '사장',            NULL,             NULL,        '재평가 필요'),
    ('bkn', NULL,                 NULL,              '숀 마크스',      '단장',      '기존 유지'),
    ('bos', '브래드 스티븐스',    '사장',            NULL,             NULL,        '기존 유지'),
    ('cha', '제프 피터슨',        '부사장',          NULL,             NULL,        '기존 유지'),
    ('chi', '브라이슨 그레이엄',  '부사장',          NULL,             NULL,        '재평가 필요'),
    ('cle', '코비 올트먼',        '사장',            '브랜던 윔스',    '단장',      '기존 유지'),
    ('dal', '마사이 우지리',      '사장',            '마이크 슈미츠',  '단장',      '재평가 필요'),
    ('den', NULL,                 NULL,              '벤 텐저',        '단장',      '재평가 필요'),
    ('det', '트레이전 랭던',      '사장',            NULL,             NULL,        '재평가 필요'),
    ('gs',  NULL,                 NULL,              '마이크 던리비 주니어', '단장', '기존 유지'),
    ('hou', NULL,                 NULL,              '라파엘 스톤',    '단장',      '기존 유지'),
    ('ind', '케빈 프리처드',      '사장',            NULL,             NULL,        '기존 유지'),
    ('lam', '롭 펠린카',          '사장 겸 단장',    NULL,             NULL,        '기존 유지'),
    ('law', '트렌트 레든',        '사장 대행',       '마크 휴즈',      '단장 대행', '재평가 필요'),
    ('mem', '잭 클라이만',        '부사장 겸 단장',  NULL,             NULL,        '기존 유지'),
    ('mia', '팻 라일리',          '사장',            NULL,             NULL,        '기존 유지'),
    ('mil', NULL,                 NULL,              '존 호스트',      '단장',      '기존 유지'),
    ('min', '팀 코넬리',          '사장',            '맷 로이드',      '단장',      '기존 유지'),
    ('no',  '조 듀마스',          '부사장',          NULL,             NULL,        '재평가 필요'),
    ('nyk', '레온 로즈',          '사장',            NULL,             NULL,        '기존 유지'),
    ('okc', '샘 프레스티',        '부사장 겸 단장',  NULL,             NULL,        '기존 유지'),
    ('orl', '제프 웰트먼',        '사장',            NULL,             NULL,        '기존 유지'),
    ('phi', '마이크 갠지',        '사장',            NULL,             NULL,        '재평가 필요'),
    ('phx', NULL,                 NULL,              '브라이언 그레고리', '단장',   '재평가 필요'),
    ('por', NULL,                 NULL,              '조 크로닌',      '단장',      '기존 유지'),
    ('sa',  '그렉 포포비치',      '사장',            '브라이언 라이트', '단장',     '기존 유지'),
    ('sac', NULL,                 NULL,              '스콧 페리',      '단장',      '재평가 필요'),
    ('tor', '바비 웹스터',        '부사장 겸 단장',  NULL,             NULL,        '기존 유지'),
    ('uta', '오스틴 에인지',      '사장',            NULL,             NULL,        '재평가 필요'),
    ('was', '마이클 윙어',        '사장',            NULL,             NULL,        '기존 유지')
) AS v(team_id, president_name, president_title, gm_name, gm_title, profile_basis)
WHERE m.team_id = v.team_id;

-- Every team must keep at least one displayable name.
ALTER TABLE public.meta_gms
    ADD CONSTRAINT meta_gms_has_name CHECK (president_name IS NOT NULL OR gm_name IS NOT NULL);
