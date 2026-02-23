-- =============================================
-- NBA-GM-SIM: Historical PG Players Insert
-- Total: 61 Players
-- =============================================

-- 1. Magic Johnson (전성기: 27세, 1986-87)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Magic Johnson',
  '{"name":"매직 존슨","team":"FA","position":"PG","age":27,"height":206,"weight":100,"health":"Healthy","salary":28.0,"contractyears":3,"pot":98,"ins":88,"out":72,"ath":85,"plm":99,"def":75,"reb":80,"close":90,"mid":75,"3c":70,"3_45":68,"3t":65,"ft":85,"siq":95,"ocon":92,"lay":92,"dnk":75,"post":88,"draw":80,"hands":95,"pacc":97,"handl":90,"spwb":85,"piq":99,"pvis":99,"idef":65,"pdef":72,"stl":78,"blk":55,"hdef":82,"pper":85,"dcon":78,"oreb":55,"dreb":82,"spd":82,"agi":80,"str":85,"vert":72,"sta":90,"hus":90,"dur":78,"intangibles":99}'::jsonb,
  '{"zones":{"ra":35,"itp":15,"mid":20,"cnr":5,"p45":10,"atb":15},"lateral_bias":2}'::jsonb
);

-- 2. Oscar Robertson (전성기: 27세, 1965-66)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Oscar Robertson',
  '{"name":"오스카 로버트슨","team":"FA","position":"PG","age":27,"height":196,"weight":100,"health":"Healthy","salary":26.0,"contractyears":3,"pot":97,"ins":90,"out":78,"ath":84,"plm":97,"def":80,"reb":82,"close":92,"mid":82,"3c":75,"3_45":73,"3t":72,"ft":84,"siq":95,"ocon":93,"lay":90,"dnk":70,"post":85,"draw":82,"hands":92,"pacc":95,"handl":92,"spwb":85,"piq":97,"pvis":96,"idef":72,"pdef":78,"stl":82,"blk":50,"hdef":80,"pper":84,"dcon":82,"oreb":60,"dreb":85,"spd":82,"agi":83,"str":88,"vert":75,"sta":95,"hus":92,"dur":85,"intangibles":97}'::jsonb,
  '{"zones":{"ra":30,"itp":15,"mid":25,"cnr":5,"p45":10,"atb":15},"lateral_bias":2}'::jsonb
);

-- 3. Jerry West (전성기: 27세, 1965-66)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jerry West',
  '{"name":"제리 웨스트","team":"FA","position":"PG","age":27,"height":190,"weight":79,"health":"Healthy","salary":25.0,"contractyears":3,"pot":96,"ins":85,"out":90,"ath":82,"plm":92,"def":82,"reb":68,"close":88,"mid":92,"3c":88,"3_45":86,"3t":85,"ft":90,"siq":94,"ocon":92,"lay":88,"dnk":62,"post":72,"draw":85,"hands":90,"pacc":90,"handl":88,"spwb":84,"piq":93,"pvis":90,"idef":65,"pdef":85,"stl":85,"blk":48,"hdef":82,"pper":86,"dcon":85,"oreb":45,"dreb":72,"spd":85,"agi":86,"str":72,"vert":78,"sta":90,"hus":95,"dur":80,"intangibles":97}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":30,"cnr":8,"p45":12,"atb":15},"lateral_bias":2}'::jsonb
);

-- 4. Isiah Thomas (전성기: 26세, 1987-88)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Isiah Thomas',
  '{"name":"아이제이아 토마스","team":"FA","position":"PG","age":26,"height":185,"weight":82,"health":"Healthy","salary":24.0,"contractyears":3,"pot":95,"ins":85,"out":80,"ath":86,"plm":95,"def":75,"reb":55,"close":88,"mid":82,"3c":78,"3_45":76,"3t":75,"ft":80,"siq":92,"ocon":88,"lay":90,"dnk":65,"post":65,"draw":80,"hands":90,"pacc":93,"handl":94,"spwb":90,"piq":95,"pvis":93,"idef":50,"pdef":78,"stl":82,"blk":35,"hdef":75,"pper":80,"dcon":78,"oreb":38,"dreb":52,"spd":92,"agi":93,"str":65,"vert":78,"sta":88,"hus":95,"dur":75,"intangibles":96}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":25,"cnr":8,"p45":12,"atb":15},"lateral_bias":2}'::jsonb
);

-- 5. John Stockton (전성기: 28세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'John Stockton',
  '{"name":"존 스탁턴","team":"FA","position":"PG","age":28,"height":185,"weight":79,"health":"Healthy","salary":23.0,"contractyears":3,"pot":95,"ins":78,"out":82,"ath":75,"plm":99,"def":85,"reb":52,"close":82,"mid":84,"3c":82,"3_45":80,"3t":78,"ft":83,"siq":92,"ocon":90,"lay":85,"dnk":40,"post":62,"draw":78,"hands":92,"pacc":99,"handl":88,"spwb":80,"piq":99,"pvis":98,"idef":55,"pdef":82,"stl":97,"blk":35,"hdef":88,"pper":95,"dcon":90,"oreb":35,"dreb":50,"spd":78,"agi":82,"str":75,"vert":62,"sta":97,"hus":97,"dur":95,"intangibles":97}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":25,"cnr":10,"p45":15,"atb":15},"lateral_bias":2}'::jsonb
);

-- 6. Steve Nash (전성기: 31세, 2005-06)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Steve Nash',
  '{"name":"스티브 내쉬","team":"FA","position":"PG","age":31,"height":191,"weight":81,"health":"Healthy","salary":22.0,"contractyears":3,"pot":94,"ins":75,"out":90,"ath":72,"plm":98,"def":60,"reb":48,"close":82,"mid":88,"3c":90,"3_45":88,"3t":87,"ft":92,"siq":95,"ocon":92,"lay":85,"dnk":35,"post":55,"draw":72,"hands":90,"pacc":97,"handl":92,"spwb":85,"piq":98,"pvis":98,"idef":42,"pdef":58,"stl":65,"blk":25,"hdef":62,"pper":70,"dcon":60,"oreb":30,"dreb":45,"spd":80,"agi":85,"str":55,"vert":60,"sta":88,"hus":82,"dur":72,"intangibles":95}'::jsonb,
  '{"zones":{"ra":25,"itp":5,"mid":20,"cnr":12,"p45":18,"atb":20},"lateral_bias":2}'::jsonb
);

-- 7. Chris Paul (전성기: 27세, 2012-13)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Chris Paul',
  '{"name":"크리스 폴","team":"FA","position":"PG","age":27,"height":183,"weight":79,"health":"Healthy","salary":24.0,"contractyears":3,"pot":95,"ins":80,"out":85,"ath":78,"plm":97,"def":85,"reb":55,"close":85,"mid":88,"3c":84,"3_45":82,"3t":80,"ft":88,"siq":95,"ocon":92,"lay":86,"dnk":40,"post":65,"draw":78,"hands":92,"pacc":96,"handl":92,"spwb":82,"piq":98,"pvis":96,"idef":52,"pdef":85,"stl":92,"blk":32,"hdef":88,"pper":92,"dcon":88,"oreb":32,"dreb":55,"spd":80,"agi":85,"str":68,"vert":65,"sta":85,"hus":90,"dur":72,"intangibles":95}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":28,"cnr":10,"p45":14,"atb":15},"lateral_bias":2}'::jsonb
);

-- 8. Gary Payton (전성기: 27세, 1995-96)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Gary Payton',
  '{"name":"게리 페이튼","team":"FA","position":"PG","age":27,"height":193,"weight":82,"health":"Healthy","salary":22.0,"contractyears":3,"pot":94,"ins":82,"out":78,"ath":82,"plm":90,"def":95,"reb":55,"close":85,"mid":80,"3c":76,"3_45":74,"3t":72,"ft":75,"siq":88,"ocon":85,"lay":88,"dnk":60,"post":72,"draw":75,"hands":88,"pacc":88,"handl":88,"spwb":85,"piq":90,"pvis":88,"idef":60,"pdef":96,"stl":93,"blk":40,"hdef":90,"pper":92,"dcon":92,"oreb":38,"dreb":55,"spd":85,"agi":86,"str":80,"vert":72,"sta":90,"hus":95,"dur":88,"intangibles":92}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":25,"cnr":8,"p45":12,"atb":13},"lateral_bias":2}'::jsonb
);

-- 9. Jason Kidd (전성기: 28세, 2001-02)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jason Kidd',
  '{"name":"제이슨 키드","team":"FA","position":"PG","age":28,"height":193,"weight":95,"health":"Healthy","salary":22.0,"contractyears":3,"pot":94,"ins":78,"out":78,"ath":82,"plm":96,"def":85,"reb":75,"close":80,"mid":75,"3c":80,"3_45":78,"3t":76,"ft":70,"siq":88,"ocon":82,"lay":82,"dnk":65,"post":62,"draw":72,"hands":90,"pacc":95,"handl":85,"spwb":82,"piq":96,"pvis":97,"idef":58,"pdef":82,"stl":88,"blk":45,"hdef":85,"pper":90,"dcon":85,"oreb":48,"dreb":78,"spd":84,"agi":82,"str":78,"vert":72,"sta":90,"hus":90,"dur":85,"intangibles":95}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":20,"cnr":12,"p45":15,"atb":15},"lateral_bias":2}'::jsonb
);

-- 10. Tim Hardaway (전성기: 26세, 1992-93)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tim Hardaway',
  '{"name":"팀 하더웨이","team":"FA","position":"PG","age":26,"height":183,"weight":79,"health":"Healthy","salary":18.0,"contractyears":3,"pot":90,"ins":80,"out":85,"ath":85,"plm":88,"def":68,"reb":45,"close":82,"mid":85,"3c":84,"3_45":82,"3t":80,"ft":78,"siq":85,"ocon":82,"lay":85,"dnk":55,"post":55,"draw":72,"hands":82,"pacc":85,"handl":90,"spwb":88,"piq":85,"pvis":82,"idef":45,"pdef":70,"stl":72,"blk":30,"hdef":65,"pper":70,"dcon":68,"oreb":28,"dreb":42,"spd":90,"agi":92,"str":65,"vert":78,"sta":85,"hus":80,"dur":72,"intangibles":82}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 11. Kevin Johnson (전성기: 27세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kevin Johnson',
  '{"name":"케빈 존슨","team":"FA","position":"PG","age":27,"height":185,"weight":82,"health":"Healthy","salary":18.0,"contractyears":3,"pot":90,"ins":88,"out":72,"ath":88,"plm":90,"def":70,"reb":48,"close":90,"mid":75,"3c":70,"3_45":68,"3t":65,"ft":84,"siq":85,"ocon":85,"lay":92,"dnk":72,"post":60,"draw":82,"hands":85,"pacc":88,"handl":88,"spwb":90,"piq":88,"pvis":85,"idef":48,"pdef":72,"stl":75,"blk":35,"hdef":68,"pper":72,"dcon":70,"oreb":35,"dreb":45,"spd":92,"agi":90,"str":68,"vert":82,"sta":88,"hus":85,"dur":70,"intangibles":85}'::jsonb,
  '{"zones":{"ra":35,"itp":12,"mid":22,"cnr":5,"p45":10,"atb":16},"lateral_bias":2}'::jsonb
);

-- 12. Tony Parker (전성기: 27세, 2009-10)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tony Parker',
  '{"name":"토니 파커","team":"FA","position":"PG","age":27,"height":188,"weight":84,"health":"Healthy","salary":20.0,"contractyears":3,"pot":92,"ins":90,"out":72,"ath":85,"plm":90,"def":72,"reb":42,"close":92,"mid":78,"3c":70,"3_45":68,"3t":65,"ft":76,"siq":90,"ocon":88,"lay":94,"dnk":55,"post":62,"draw":75,"hands":85,"pacc":88,"handl":90,"spwb":92,"piq":92,"pvis":88,"idef":48,"pdef":72,"stl":70,"blk":28,"hdef":70,"pper":72,"dcon":72,"oreb":30,"dreb":40,"spd":92,"agi":90,"str":62,"vert":72,"sta":88,"hus":85,"dur":78,"intangibles":90}'::jsonb,
  '{"zones":{"ra":35,"itp":15,"mid":25,"cnr":5,"p45":8,"atb":12},"lateral_bias":2}'::jsonb
);

-- 13. Derrick Rose (전성기: 22세, 2010-11 MVP)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Derrick Rose',
  '{"name":"데릭 로즈","team":"FA","position":"PG","age":22,"height":190,"weight":86,"health":"Healthy","salary":22.0,"contractyears":4,"pot":95,"ins":92,"out":78,"ath":96,"plm":88,"def":72,"reb":50,"close":90,"mid":80,"3c":75,"3_45":73,"3t":72,"ft":82,"siq":85,"ocon":85,"lay":95,"dnk":90,"post":58,"draw":82,"hands":82,"pacc":82,"handl":90,"spwb":95,"piq":85,"pvis":82,"idef":48,"pdef":72,"stl":72,"blk":42,"hdef":70,"pper":72,"dcon":70,"oreb":40,"dreb":50,"spd":96,"agi":95,"str":75,"vert":95,"sta":88,"hus":88,"dur":55,"intangibles":88}'::jsonb,
  '{"zones":{"ra":38,"itp":12,"mid":22,"cnr":5,"p45":10,"atb":13},"lateral_bias":2}'::jsonb
);

-- 14. John Wall (전성기: 26세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'John Wall',
  '{"name":"존 월","team":"FA","position":"PG","age":26,"height":193,"weight":95,"health":"Healthy","salary":22.0,"contractyears":3,"pot":92,"ins":85,"out":75,"ath":95,"plm":90,"def":75,"reb":50,"close":85,"mid":76,"3c":74,"3_45":72,"3t":70,"ft":78,"siq":82,"ocon":82,"lay":90,"dnk":85,"post":55,"draw":78,"hands":82,"pacc":88,"handl":90,"spwb":95,"piq":88,"pvis":88,"idef":50,"pdef":76,"stl":80,"blk":45,"hdef":75,"pper":78,"dcon":75,"oreb":35,"dreb":48,"spd":97,"agi":94,"str":78,"vert":90,"sta":88,"hus":85,"dur":62,"intangibles":85}'::jsonb,
  '{"zones":{"ra":35,"itp":12,"mid":20,"cnr":8,"p45":12,"atb":13},"lateral_bias":2}'::jsonb
);

-- 15. Kemba Walker (전성기: 28세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kemba Walker',
  '{"name":"켐바 워커","team":"FA","position":"PG","age":28,"height":183,"weight":83,"health":"Healthy","salary":18.0,"contractyears":3,"pot":88,"ins":80,"out":85,"ath":82,"plm":85,"def":65,"reb":45,"close":82,"mid":82,"3c":84,"3_45":83,"3t":82,"ft":85,"siq":85,"ocon":82,"lay":85,"dnk":50,"post":50,"draw":78,"hands":80,"pacc":82,"handl":90,"spwb":88,"piq":85,"pvis":80,"idef":42,"pdef":65,"stl":72,"blk":28,"hdef":62,"pper":68,"dcon":62,"oreb":28,"dreb":45,"spd":88,"agi":90,"str":58,"vert":75,"sta":82,"hus":82,"dur":68,"intangibles":85}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 16. Baron Davis (전성기: 27세, 2006-07)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Baron Davis',
  '{"name":"바론 데이비스","team":"FA","position":"PG","age":27,"height":190,"weight":95,"health":"Healthy","salary":18.0,"contractyears":3,"pot":90,"ins":82,"out":80,"ath":90,"plm":85,"def":72,"reb":52,"close":84,"mid":78,"3c":78,"3_45":76,"3t":75,"ft":72,"siq":80,"ocon":78,"lay":88,"dnk":82,"post":60,"draw":78,"hands":80,"pacc":82,"handl":88,"spwb":88,"piq":82,"pvis":82,"idef":52,"pdef":72,"stl":80,"blk":42,"hdef":72,"pper":75,"dcon":72,"oreb":38,"dreb":52,"spd":90,"agi":88,"str":82,"vert":88,"sta":82,"hus":82,"dur":65,"intangibles":82}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 17. Chauncey Billups (전성기: 28세, 2004-05)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Chauncey Billups',
  '{"name":"챈시 빌럽스","team":"FA","position":"PG","age":28,"height":190,"weight":91,"health":"Healthy","salary":20.0,"contractyears":3,"pot":92,"ins":78,"out":88,"ath":75,"plm":88,"def":78,"reb":48,"close":80,"mid":86,"3c":87,"3_45":85,"3t":84,"ft":92,"siq":92,"ocon":90,"lay":80,"dnk":45,"post":60,"draw":82,"hands":85,"pacc":85,"handl":82,"spwb":78,"piq":92,"pvis":85,"idef":52,"pdef":78,"stl":72,"blk":32,"hdef":80,"pper":80,"dcon":82,"oreb":30,"dreb":48,"spd":75,"agi":78,"str":78,"vert":65,"sta":85,"hus":90,"dur":78,"intangibles":95}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 18. Stephon Marbury (전성기: 26세, 2003-04)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Stephon Marbury',
  '{"name":"스테폰 마버리","team":"FA","position":"PG","age":26,"height":188,"weight":82,"health":"Healthy","salary":18.0,"contractyears":3,"pot":90,"ins":85,"out":82,"ath":88,"plm":85,"def":62,"reb":42,"close":86,"mid":82,"3c":80,"3_45":78,"3t":76,"ft":80,"siq":80,"ocon":80,"lay":90,"dnk":70,"post":55,"draw":78,"hands":80,"pacc":82,"handl":92,"spwb":90,"piq":82,"pvis":80,"idef":42,"pdef":62,"stl":70,"blk":28,"hdef":60,"pper":65,"dcon":62,"oreb":28,"dreb":42,"spd":92,"agi":90,"str":70,"vert":82,"sta":85,"hus":72,"dur":82,"intangibles":75}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":8,"p45":12,"atb":18},"lateral_bias":2}'::jsonb
);

-- 19. Sam Cassell (전성기: 30세, 2003-04)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Sam Cassell',
  '{"name":"샘 캐셀","team":"FA","position":"PG","age":30,"height":190,"weight":84,"health":"Healthy","salary":16.0,"contractyears":3,"pot":88,"ins":82,"out":84,"ath":75,"plm":88,"def":70,"reb":48,"close":85,"mid":86,"3c":82,"3_45":80,"3t":78,"ft":85,"siq":92,"ocon":88,"lay":85,"dnk":42,"post":68,"draw":78,"hands":85,"pacc":85,"handl":85,"spwb":78,"piq":90,"pvis":85,"idef":48,"pdef":72,"stl":72,"blk":28,"hdef":72,"pper":75,"dcon":75,"oreb":30,"dreb":48,"spd":75,"agi":78,"str":72,"vert":62,"sta":82,"hus":85,"dur":78,"intangibles":90}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":28,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 20. Mike Bibby (전성기: 25세, 2002-03)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Mike Bibby',
  '{"name":"마이크 비비","team":"FA","position":"PG","age":25,"height":185,"weight":86,"health":"Healthy","salary":15.0,"contractyears":3,"pot":87,"ins":75,"out":85,"ath":75,"plm":85,"def":68,"reb":42,"close":78,"mid":84,"3c":86,"3_45":84,"3t":82,"ft":85,"siq":85,"ocon":82,"lay":78,"dnk":38,"post":55,"draw":70,"hands":82,"pacc":82,"handl":82,"spwb":78,"piq":85,"pvis":82,"idef":45,"pdef":68,"stl":68,"blk":25,"hdef":68,"pper":72,"dcon":70,"oreb":25,"dreb":42,"spd":78,"agi":80,"str":70,"vert":62,"sta":82,"hus":78,"dur":80,"intangibles":82}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 21. Nick VanExel (전성기: 27세, 1998-99)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Nick VanExel',
  '{"name":"닉 밴엑셀","team":"FA","position":"PG","age":27,"height":185,"weight":79,"health":"Healthy","salary":15.0,"contractyears":3,"pot":87,"ins":75,"out":85,"ath":80,"plm":82,"def":60,"reb":40,"close":78,"mid":82,"3c":85,"3_45":84,"3t":85,"ft":80,"siq":78,"ocon":78,"lay":80,"dnk":50,"post":48,"draw":72,"hands":78,"pacc":80,"handl":85,"spwb":82,"piq":80,"pvis":78,"idef":40,"pdef":60,"stl":68,"blk":25,"hdef":58,"pper":62,"dcon":58,"oreb":25,"dreb":38,"spd":85,"agi":85,"str":62,"vert":72,"sta":82,"hus":75,"dur":78,"intangibles":78}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":20,"cnr":10,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 22. Terrell Brandon (전성기: 27세, 1996-97)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Terrell Brandon',
  '{"name":"테렐 브랜든","team":"FA","position":"PG","age":27,"height":180,"weight":78,"health":"Healthy","salary":14.0,"contractyears":3,"pot":87,"ins":80,"out":80,"ath":82,"plm":88,"def":72,"reb":45,"close":82,"mid":80,"3c":78,"3_45":76,"3t":75,"ft":82,"siq":85,"ocon":82,"lay":85,"dnk":48,"post":52,"draw":75,"hands":82,"pacc":85,"handl":88,"spwb":85,"piq":88,"pvis":85,"idef":45,"pdef":75,"stl":82,"blk":30,"hdef":72,"pper":78,"dcon":72,"oreb":28,"dreb":42,"spd":88,"agi":88,"str":60,"vert":72,"sta":85,"hus":82,"dur":68,"intangibles":82}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 23. Damon Stoudamire (전성기: 24세, 1997-98)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Damon Stoudamire',
  '{"name":"데이먼 스타우더마이어","team":"FA","position":"PG","age":24,"height":178,"weight":77,"health":"Healthy","salary":12.0,"contractyears":3,"pot":85,"ins":75,"out":82,"ath":80,"plm":82,"def":62,"reb":42,"close":78,"mid":80,"3c":82,"3_45":80,"3t":78,"ft":80,"siq":78,"ocon":78,"lay":80,"dnk":40,"post":45,"draw":70,"hands":78,"pacc":80,"handl":85,"spwb":82,"piq":82,"pvis":80,"idef":38,"pdef":62,"stl":72,"blk":22,"hdef":60,"pper":68,"dcon":62,"oreb":25,"dreb":42,"spd":88,"agi":88,"str":55,"vert":68,"sta":82,"hus":78,"dur":78,"intangibles":75}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 24. Rod Strickland (전성기: 28세, 1997-98)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Rod Strickland',
  '{"name":"로드 스트릭랜드","team":"FA","position":"PG","age":28,"height":185,"weight":79,"health":"Healthy","salary":12.0,"contractyears":3,"pot":86,"ins":85,"out":68,"ath":82,"plm":88,"def":65,"reb":48,"close":88,"mid":72,"3c":65,"3_45":62,"3t":60,"ft":75,"siq":82,"ocon":80,"lay":90,"dnk":55,"post":58,"draw":78,"hands":85,"pacc":88,"handl":90,"spwb":85,"piq":88,"pvis":88,"idef":45,"pdef":65,"stl":78,"blk":28,"hdef":65,"pper":75,"dcon":65,"oreb":32,"dreb":48,"spd":85,"agi":88,"str":68,"vert":72,"sta":82,"hus":78,"dur":78,"intangibles":80}'::jsonb,
  '{"zones":{"ra":35,"itp":15,"mid":22,"cnr":5,"p45":10,"atb":13},"lateral_bias":1}'::jsonb
);

-- 25. Dana Barros (전성기: 28세, 1994-95)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Dana Barros',
  '{"name":"데이나 배로스","team":"FA","position":"PG","age":28,"height":178,"weight":75,"health":"Healthy","salary":8.0,"contractyears":3,"pot":82,"ins":68,"out":88,"ath":72,"plm":78,"def":55,"reb":35,"close":72,"mid":85,"3c":90,"3_45":88,"3t":87,"ft":88,"siq":82,"ocon":80,"lay":75,"dnk":30,"post":38,"draw":65,"hands":75,"pacc":78,"handl":82,"spwb":78,"piq":78,"pvis":75,"idef":32,"pdef":55,"stl":62,"blk":18,"hdef":52,"pper":58,"dcon":55,"oreb":20,"dreb":32,"spd":82,"agi":82,"str":48,"vert":62,"sta":78,"hus":75,"dur":78,"intangibles":72}'::jsonb,
  '{"zones":{"ra":18,"itp":5,"mid":22,"cnr":12,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 26. Gilbert Arenas (전성기: 25세, 2006-07)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Gilbert Arenas',
  '{"name":"길버트 아레나스","team":"FA","position":"PG","age":25,"height":191,"weight":93,"health":"Healthy","salary":20.0,"contractyears":3,"pot":92,"ins":82,"out":90,"ath":85,"plm":82,"def":62,"reb":48,"close":84,"mid":88,"3c":90,"3_45":88,"3t":90,"ft":85,"siq":82,"ocon":82,"lay":88,"dnk":72,"post":58,"draw":82,"hands":78,"pacc":78,"handl":88,"spwb":85,"piq":80,"pvis":78,"idef":42,"pdef":62,"stl":72,"blk":35,"hdef":60,"pper":65,"dcon":60,"oreb":32,"dreb":48,"spd":88,"agi":85,"str":75,"vert":82,"sta":85,"hus":78,"dur":55,"intangibles":78}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":20,"cnr":8,"p45":15,"atb":24},"lateral_bias":2}'::jsonb
);

-- 27. Deron Williams (전성기: 24세, 2008-09)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Deron Williams',
  '{"name":"데론 윌리엄스","team":"FA","position":"PG","age":24,"height":190,"weight":93,"health":"Healthy","salary":18.0,"contractyears":3,"pot":92,"ins":82,"out":84,"ath":82,"plm":90,"def":72,"reb":48,"close":84,"mid":82,"3c":84,"3_45":82,"3t":80,"ft":82,"siq":85,"ocon":85,"lay":85,"dnk":62,"post":65,"draw":75,"hands":85,"pacc":88,"handl":90,"spwb":85,"piq":90,"pvis":88,"idef":48,"pdef":72,"stl":72,"blk":35,"hdef":72,"pper":75,"dcon":72,"oreb":30,"dreb":48,"spd":85,"agi":85,"str":80,"vert":72,"sta":85,"hus":80,"dur":72,"intangibles":82}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":25,"cnr":10,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 28. Rajon Rondo (전성기: 26세, 2011-12)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Rajon Rondo',
  '{"name":"라존 론도","team":"FA","position":"PG","age":26,"height":185,"weight":82,"health":"Healthy","salary":16.0,"contractyears":3,"pot":90,"ins":78,"out":55,"ath":85,"plm":95,"def":82,"reb":58,"close":82,"mid":60,"3c":52,"3_45":50,"3t":48,"ft":62,"siq":88,"ocon":78,"lay":85,"dnk":62,"post":55,"draw":68,"hands":88,"pacc":95,"handl":88,"spwb":88,"piq":96,"pvis":97,"idef":52,"pdef":80,"stl":88,"blk":38,"hdef":82,"pper":88,"dcon":80,"oreb":42,"dreb":58,"spd":88,"agi":88,"str":68,"vert":72,"sta":85,"hus":88,"dur":72,"intangibles":88}'::jsonb,
  '{"zones":{"ra":38,"itp":15,"mid":22,"cnr":5,"p45":10,"atb":10},"lateral_bias":1}'::jsonb
);

-- 29. Goran Dragic (전성기: 28세, 2013-14)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Goran Dragic',
  '{"name":"고란 드라기치","team":"FA","position":"PG","age":28,"height":190,"weight":86,"health":"Healthy","salary":15.0,"contractyears":3,"pot":87,"ins":82,"out":78,"ath":82,"plm":82,"def":65,"reb":45,"close":85,"mid":78,"3c":78,"3_45":76,"3t":75,"ft":80,"siq":82,"ocon":80,"lay":88,"dnk":65,"post":55,"draw":78,"hands":80,"pacc":80,"handl":85,"spwb":85,"piq":82,"pvis":80,"idef":45,"pdef":65,"stl":70,"blk":28,"hdef":65,"pper":68,"dcon":65,"oreb":28,"dreb":42,"spd":85,"agi":85,"str":68,"vert":72,"sta":82,"hus":80,"dur":78,"intangibles":80}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":1}'::jsonb
);

-- 30. Ricky Rubio (전성기: 26세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Ricky Rubio',
  '{"name":"리키 루비오","team":"FA","position":"PG","age":26,"height":190,"weight":86,"health":"Healthy","salary":12.0,"contractyears":3,"pot":85,"ins":68,"out":72,"ath":75,"plm":90,"def":78,"reb":50,"close":72,"mid":70,"3c":72,"3_45":70,"3t":68,"ft":85,"siq":82,"ocon":78,"lay":78,"dnk":35,"post":48,"draw":72,"hands":85,"pacc":90,"handl":82,"spwb":78,"piq":92,"pvis":92,"idef":45,"pdef":78,"stl":82,"blk":28,"hdef":78,"pper":82,"dcon":78,"oreb":25,"dreb":50,"spd":78,"agi":80,"str":62,"vert":62,"sta":82,"hus":85,"dur":72,"intangibles":85}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":22,"cnr":10,"p45":15,"atb":15},"lateral_bias":2}'::jsonb
);

-- 31. Jeff Teague (전성기: 27세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jeff Teague',
  '{"name":"제프 티그","team":"FA","position":"PG","age":27,"height":188,"weight":84,"health":"Healthy","salary":12.0,"contractyears":3,"pot":85,"ins":78,"out":75,"ath":82,"plm":82,"def":68,"reb":42,"close":80,"mid":75,"3c":74,"3_45":72,"3t":70,"ft":82,"siq":80,"ocon":78,"lay":85,"dnk":60,"post":50,"draw":75,"hands":78,"pacc":80,"handl":82,"spwb":85,"piq":82,"pvis":78,"idef":42,"pdef":68,"stl":72,"blk":30,"hdef":68,"pper":72,"dcon":68,"oreb":25,"dreb":40,"spd":88,"agi":85,"str":65,"vert":75,"sta":82,"hus":78,"dur":80,"intangibles":78}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 32. Eric Bledsoe (전성기: 26세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Eric Bledsoe',
  '{"name":"에릭 블레드소","team":"FA","position":"PG","age":26,"height":185,"weight":93,"health":"Healthy","salary":14.0,"contractyears":3,"pot":86,"ins":82,"out":72,"ath":88,"plm":80,"def":75,"reb":48,"close":84,"mid":72,"3c":72,"3_45":70,"3t":68,"ft":78,"siq":78,"ocon":78,"lay":88,"dnk":75,"post":55,"draw":78,"hands":78,"pacc":78,"handl":82,"spwb":85,"piq":78,"pvis":75,"idef":52,"pdef":75,"stl":80,"blk":42,"hdef":72,"pper":75,"dcon":72,"oreb":35,"dreb":48,"spd":90,"agi":88,"str":80,"vert":82,"sta":85,"hus":82,"dur":75,"intangibles":78}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":2}'::jsonb
);

-- 33. Darren Collison (전성기: 28세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Darren Collison',
  '{"name":"대런 콜리슨","team":"FA","position":"PG","age":28,"height":183,"weight":79,"health":"Healthy","salary":8.0,"contractyears":3,"pot":82,"ins":72,"out":80,"ath":78,"plm":80,"def":68,"reb":38,"close":75,"mid":78,"3c":82,"3_45":80,"3t":78,"ft":85,"siq":82,"ocon":80,"lay":80,"dnk":42,"post":45,"draw":68,"hands":78,"pacc":80,"handl":80,"spwb":80,"piq":82,"pvis":78,"idef":40,"pdef":68,"stl":72,"blk":22,"hdef":68,"pper":72,"dcon":70,"oreb":22,"dreb":38,"spd":85,"agi":85,"str":60,"vert":65,"sta":82,"hus":80,"dur":80,"intangibles":80}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":17},"lateral_bias":2}'::jsonb
);

-- 34. Mark Jackson (전성기: 27세, 1992-93)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Mark Jackson',
  '{"name":"마크 잭슨","team":"FA","position":"PG","age":27,"height":190,"weight":88,"health":"Healthy","salary":10.0,"contractyears":3,"pot":85,"ins":75,"out":72,"ath":68,"plm":90,"def":72,"reb":52,"close":78,"mid":72,"3c":70,"3_45":68,"3t":65,"ft":78,"siq":85,"ocon":82,"lay":78,"dnk":35,"post":68,"draw":72,"hands":85,"pacc":90,"handl":82,"spwb":72,"piq":92,"pvis":92,"idef":50,"pdef":72,"stl":78,"blk":28,"hdef":75,"pper":80,"dcon":75,"oreb":32,"dreb":52,"spd":68,"agi":72,"str":78,"vert":58,"sta":85,"hus":85,"dur":85,"intangibles":88}'::jsonb,
  '{"zones":{"ra":28,"itp":12,"mid":28,"cnr":5,"p45":10,"atb":17},"lateral_bias":2}'::jsonb
);

-- 35. Terry Porter (전성기: 27세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Terry Porter',
  '{"name":"테리 포터","team":"FA","position":"PG","age":27,"height":190,"weight":88,"health":"Healthy","salary":12.0,"contractyears":3,"pot":87,"ins":75,"out":82,"ath":75,"plm":85,"def":75,"reb":45,"close":78,"mid":82,"3c":82,"3_45":80,"3t":78,"ft":85,"siq":85,"ocon":82,"lay":78,"dnk":42,"post":55,"draw":72,"hands":82,"pacc":85,"handl":82,"spwb":78,"piq":85,"pvis":85,"idef":48,"pdef":75,"stl":78,"blk":30,"hdef":75,"pper":78,"dcon":75,"oreb":28,"dreb":45,"spd":78,"agi":80,"str":72,"vert":68,"sta":85,"hus":85,"dur":82,"intangibles":85}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 36. George Hill (전성기: 28세, 2013-14)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'George Hill',
  '{"name":"조지 힐","team":"FA","position":"PG","age":28,"height":190,"weight":84,"health":"Healthy","salary":10.0,"contractyears":3,"pot":84,"ins":75,"out":80,"ath":78,"plm":78,"def":78,"reb":45,"close":78,"mid":78,"3c":80,"3_45":78,"3t":76,"ft":82,"siq":82,"ocon":80,"lay":80,"dnk":55,"post":52,"draw":68,"hands":78,"pacc":78,"handl":78,"spwb":78,"piq":80,"pvis":75,"idef":48,"pdef":78,"stl":72,"blk":35,"hdef":75,"pper":75,"dcon":78,"oreb":25,"dreb":45,"spd":80,"agi":80,"str":72,"vert":72,"sta":82,"hus":80,"dur":82,"intangibles":80}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":17},"lateral_bias":2}'::jsonb
);

-- 37. Kirk Hinrich (전성기: 26세, 2007-08)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kirk Hinrich',
  '{"name":"커크 힌리치","team":"FA","position":"PG","age":26,"height":190,"weight":86,"health":"Healthy","salary":9.0,"contractyears":3,"pot":83,"ins":70,"out":78,"ath":75,"plm":78,"def":80,"reb":42,"close":72,"mid":78,"3c":80,"3_45":78,"3t":76,"ft":82,"siq":80,"ocon":78,"lay":75,"dnk":38,"post":48,"draw":68,"hands":78,"pacc":78,"handl":78,"spwb":75,"piq":80,"pvis":78,"idef":48,"pdef":80,"stl":75,"blk":28,"hdef":78,"pper":78,"dcon":80,"oreb":25,"dreb":42,"spd":78,"agi":78,"str":72,"vert":65,"sta":85,"hus":85,"dur":78,"intangibles":82}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 38. Brevin Knight (전성기: 26세, 2001-02)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Brevin Knight',
  '{"name":"브레빈 나이트","team":"FA","position":"PG","age":26,"height":178,"weight":75,"health":"Healthy","salary":5.0,"contractyears":3,"pot":78,"ins":65,"out":68,"ath":78,"plm":82,"def":75,"reb":38,"close":68,"mid":68,"3c":65,"3_45":62,"3t":60,"ft":75,"siq":78,"ocon":75,"lay":75,"dnk":35,"post":38,"draw":65,"hands":80,"pacc":82,"handl":82,"spwb":80,"piq":85,"pvis":85,"idef":38,"pdef":75,"stl":82,"blk":22,"hdef":75,"pper":80,"dcon":75,"oreb":22,"dreb":38,"spd":88,"agi":88,"str":50,"vert":65,"sta":82,"hus":85,"dur":75,"intangibles":78}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":25,"cnr":8,"p45":12,"atb":13},"lateral_bias":2}'::jsonb
);

-- 39. Reggie Jackson (전성기: 27세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Reggie Jackson',
  '{"name":"레지 잭슨","team":"FA","position":"PG","age":27,"height":190,"weight":93,"health":"Healthy","salary":10.0,"contractyears":3,"pot":83,"ins":78,"out":78,"ath":80,"plm":78,"def":62,"reb":42,"close":80,"mid":78,"3c":78,"3_45":76,"3t":75,"ft":78,"siq":78,"ocon":75,"lay":82,"dnk":62,"post":52,"draw":72,"hands":75,"pacc":75,"handl":80,"spwb":82,"piq":78,"pvis":75,"idef":42,"pdef":62,"stl":68,"blk":30,"hdef":60,"pper":65,"dcon":62,"oreb":28,"dreb":42,"spd":82,"agi":82,"str":72,"vert":72,"sta":80,"hus":75,"dur":72,"intangibles":75}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":22,"cnr":10,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 40. Mario Chalmers (전성기: 26세, 2012-13)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Mario Chalmers',
  '{"name":"마리오 찰머스","team":"FA","position":"PG","age":26,"height":185,"weight":86,"health":"Healthy","salary":6.0,"contractyears":3,"pot":80,"ins":72,"out":78,"ath":78,"plm":75,"def":72,"reb":40,"close":75,"mid":76,"3c":80,"3_45":78,"3t":76,"ft":78,"siq":78,"ocon":75,"lay":78,"dnk":48,"post":42,"draw":68,"hands":75,"pacc":75,"handl":78,"spwb":78,"piq":78,"pvis":72,"idef":40,"pdef":72,"stl":75,"blk":28,"hdef":72,"pper":72,"dcon":72,"oreb":22,"dreb":38,"spd":82,"agi":82,"str":65,"vert":68,"sta":80,"hus":80,"dur":75,"intangibles":82}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":12,"p45":15,"atb":18},"lateral_bias":2}'::jsonb
);

-- 41. Steve Kerr (전성기: 30세, 1995-96)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Steve Kerr',
  '{"name":"스티브 커","team":"FA","position":"PG","age":30,"height":183,"weight":82,"health":"Healthy","salary":5.0,"contractyears":3,"pot":78,"ins":55,"out":92,"ath":55,"plm":72,"def":60,"reb":32,"close":62,"mid":88,"3c":95,"3_45":94,"3t":93,"ft":90,"siq":90,"ocon":85,"lay":60,"dnk":20,"post":35,"draw":55,"hands":78,"pacc":75,"handl":68,"spwb":62,"piq":82,"pvis":75,"idef":32,"pdef":60,"stl":58,"blk":15,"hdef":65,"pper":68,"dcon":65,"oreb":15,"dreb":30,"spd":62,"agi":65,"str":48,"vert":45,"sta":75,"hus":82,"dur":75,"intangibles":90}'::jsonb,
  '{"zones":{"ra":12,"itp":3,"mid":18,"cnr":18,"p45":22,"atb":27},"lateral_bias":2}'::jsonb
);

-- 42. Isaiah Thomas (아이티, 전성기: 27세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Isaiah Thomas',
  '{"name":"이사야 토마스","team":"FA","position":"PG","age":27,"height":175,"weight":84,"health":"Healthy","salary":12.0,"contractyears":3,"pot":88,"ins":82,"out":88,"ath":78,"plm":82,"def":45,"reb":35,"close":85,"mid":86,"3c":88,"3_45":86,"3t":85,"ft":88,"siq":88,"ocon":85,"lay":88,"dnk":42,"post":42,"draw":82,"hands":78,"pacc":78,"handl":90,"spwb":85,"piq":82,"pvis":78,"idef":25,"pdef":42,"stl":62,"blk":15,"hdef":40,"pper":50,"dcon":42,"oreb":22,"dreb":35,"spd":88,"agi":90,"str":55,"vert":65,"sta":85,"hus":90,"dur":60,"intangibles":90}'::jsonb,
  '{"zones":{"ra":28,"itp":8,"mid":20,"cnr":10,"p45":14,"atb":20},"lateral_bias":2}'::jsonb
);

-- 43. Lou Williams (전성기: 31세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Lou Williams',
  '{"name":"루 윌리엄스","team":"FA","position":"PG","age":31,"height":185,"weight":79,"health":"Healthy","salary":10.0,"contractyears":3,"pot":84,"ins":80,"out":85,"ath":72,"plm":80,"def":50,"reb":35,"close":82,"mid":84,"3c":82,"3_45":80,"3t":78,"ft":88,"siq":85,"ocon":82,"lay":85,"dnk":38,"post":45,"draw":85,"hands":78,"pacc":78,"handl":85,"spwb":78,"piq":82,"pvis":78,"idef":30,"pdef":48,"stl":62,"blk":18,"hdef":48,"pper":55,"dcon":48,"oreb":20,"dreb":35,"spd":78,"agi":80,"str":55,"vert":58,"sta":78,"hus":72,"dur":82,"intangibles":82}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 44. Kendrick Nunn (전성기: 24세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kendrick Nunn',
  '{"name":"켄드릭 넌","team":"FA","position":"PG","age":24,"height":188,"weight":86,"health":"Healthy","salary":5.0,"contractyears":3,"pot":80,"ins":72,"out":78,"ath":78,"plm":72,"def":60,"reb":40,"close":75,"mid":76,"3c":78,"3_45":76,"3t":75,"ft":82,"siq":75,"ocon":72,"lay":78,"dnk":55,"post":45,"draw":68,"hands":72,"pacc":70,"handl":78,"spwb":78,"piq":72,"pvis":68,"idef":38,"pdef":58,"stl":65,"blk":28,"hdef":58,"pper":62,"dcon":58,"oreb":22,"dreb":40,"spd":82,"agi":80,"str":68,"vert":72,"sta":78,"hus":72,"dur":72,"intangibles":70}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 45. Emmanuel Mudiay (전성기: 22세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Emmanuel Mudiay',
  '{"name":"이매뉴얼 무디에이","team":"FA","position":"PG","age":22,"height":196,"weight":93,"health":"Healthy","salary":4.0,"contractyears":3,"pot":80,"ins":72,"out":68,"ath":80,"plm":72,"def":58,"reb":42,"close":75,"mid":68,"3c":65,"3_45":62,"3t":60,"ft":70,"siq":68,"ocon":65,"lay":80,"dnk":65,"post":50,"draw":70,"hands":70,"pacc":72,"handl":78,"spwb":80,"piq":72,"pvis":72,"idef":42,"pdef":58,"stl":65,"blk":35,"hdef":58,"pper":62,"dcon":58,"oreb":28,"dreb":42,"spd":82,"agi":80,"str":75,"vert":78,"sta":78,"hus":72,"dur":75,"intangibles":68}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":2}'::jsonb
);

-- 46. Monte Morris (전성기: 26세, 2021-22)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Monte Morris',
  '{"name":"몬테 모리스","team":"FA","position":"PG","age":26,"height":185,"weight":82,"health":"Healthy","salary":5.0,"contractyears":3,"pot":78,"ins":68,"out":75,"ath":72,"plm":78,"def":65,"reb":38,"close":72,"mid":75,"3c":76,"3_45":74,"3t":72,"ft":82,"siq":80,"ocon":78,"lay":75,"dnk":35,"post":42,"draw":62,"hands":78,"pacc":78,"handl":78,"spwb":75,"piq":82,"pvis":78,"idef":38,"pdef":65,"stl":68,"blk":22,"hdef":65,"pper":70,"dcon":68,"oreb":20,"dreb":38,"spd":75,"agi":78,"str":60,"vert":60,"sta":78,"hus":78,"dur":80,"intangibles":78}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":17},"lateral_bias":2}'::jsonb
);

-- 47. Devonte' Graham (전성기: 24세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Devonte'' Graham',
  '{"name":"디본테 그레이엄","team":"FA","position":"PG","age":24,"height":185,"weight":82,"health":"Healthy","salary":5.0,"contractyears":3,"pot":80,"ins":65,"out":80,"ath":72,"plm":78,"def":58,"reb":38,"close":68,"mid":78,"3c":80,"3_45":78,"3t":78,"ft":82,"siq":75,"ocon":72,"lay":72,"dnk":35,"post":38,"draw":65,"hands":72,"pacc":75,"handl":80,"spwb":78,"piq":78,"pvis":75,"idef":35,"pdef":58,"stl":65,"blk":20,"hdef":55,"pper":60,"dcon":58,"oreb":18,"dreb":38,"spd":78,"agi":80,"str":55,"vert":62,"sta":78,"hus":72,"dur":78,"intangibles":72}'::jsonb,
  '{"zones":{"ra":20,"itp":5,"mid":20,"cnr":12,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 48. Facundo Campazzo (전성기: 30세, 2020-21)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Facundo Campazzo',
  '{"name":"파쿤도 캄파초","team":"FA","position":"PG","age":30,"height":178,"weight":79,"health":"Healthy","salary":4.0,"contractyears":3,"pot":76,"ins":58,"out":72,"ath":68,"plm":82,"def":72,"reb":35,"close":62,"mid":70,"3c":72,"3_45":70,"3t":68,"ft":78,"siq":78,"ocon":72,"lay":68,"dnk":25,"post":35,"draw":65,"hands":78,"pacc":82,"handl":82,"spwb":75,"piq":85,"pvis":88,"idef":32,"pdef":72,"stl":78,"blk":18,"hdef":72,"pper":78,"dcon":72,"oreb":18,"dreb":35,"spd":80,"agi":82,"str":52,"vert":55,"sta":82,"hus":88,"dur":78,"intangibles":78}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":12,"p45":15,"atb":18},"lateral_bias":2}'::jsonb
);

-- 49. D.J. Augustin (전성기: 27세, 2014-15)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'D.J. Augustin',
  '{"name":"D.J. 오거스틴","team":"FA","position":"PG","age":27,"height":183,"weight":82,"health":"Healthy","salary":5.0,"contractyears":3,"pot":78,"ins":65,"out":80,"ath":72,"plm":75,"def":58,"reb":35,"close":68,"mid":78,"3c":82,"3_45":80,"3t":78,"ft":85,"siq":78,"ocon":75,"lay":72,"dnk":30,"post":38,"draw":65,"hands":72,"pacc":75,"handl":78,"spwb":75,"piq":78,"pvis":75,"idef":32,"pdef":55,"stl":62,"blk":18,"hdef":55,"pper":60,"dcon":58,"oreb":18,"dreb":35,"spd":78,"agi":80,"str":52,"vert":58,"sta":78,"hus":72,"dur":80,"intangibles":72}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":22,"cnr":12,"p45":16,"atb":23},"lateral_bias":2}'::jsonb
);

-- 50. Michael Adams (전성기: 27세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Michael Adams',
  '{"name":"마이클 아담스","team":"FA","position":"PG","age":27,"height":178,"weight":75,"health":"Healthy","salary":6.0,"contractyears":3,"pot":80,"ins":65,"out":82,"ath":78,"plm":78,"def":52,"reb":35,"close":68,"mid":78,"3c":82,"3_45":82,"3t":84,"ft":85,"siq":72,"ocon":72,"lay":72,"dnk":35,"post":35,"draw":72,"hands":72,"pacc":78,"handl":82,"spwb":80,"piq":78,"pvis":78,"idef":30,"pdef":52,"stl":68,"blk":18,"hdef":50,"pper":58,"dcon":52,"oreb":20,"dreb":35,"spd":85,"agi":85,"str":48,"vert":65,"sta":82,"hus":78,"dur":78,"intangibles":72}'::jsonb,
  '{"zones":{"ra":20,"itp":5,"mid":18,"cnr":12,"p45":18,"atb":27},"lateral_bias":2}'::jsonb
);

-- 51. Cat Barber (전성기: 24세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Cat Barber',
  '{"name":"캣 바버","team":"FA","position":"PG","age":24,"height":188,"weight":84,"health":"Healthy","salary":2.0,"contractyears":3,"pot":72,"ins":68,"out":62,"ath":80,"plm":68,"def":55,"reb":35,"close":72,"mid":62,"3c":58,"3_45":55,"3t":52,"ft":72,"siq":65,"ocon":62,"lay":75,"dnk":55,"post":40,"draw":65,"hands":65,"pacc":65,"handl":75,"spwb":80,"piq":65,"pvis":62,"idef":35,"pdef":55,"stl":65,"blk":25,"hdef":52,"pper":55,"dcon":52,"oreb":22,"dreb":35,"spd":88,"agi":85,"str":60,"vert":72,"sta":75,"hus":72,"dur":72,"intangibles":60}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":2}'::jsonb
);

-- 52. Matthew Dellavedova (전성기: 26세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Matthew Dellavedova',
  '{"name":"매튜 델라베도바","team":"FA","position":"PG","age":26,"height":193,"weight":88,"health":"Healthy","salary":4.0,"contractyears":3,"pot":75,"ins":58,"out":72,"ath":62,"plm":75,"def":72,"reb":38,"close":62,"mid":70,"3c":75,"3_45":72,"3t":70,"ft":80,"siq":78,"ocon":72,"lay":65,"dnk":25,"post":40,"draw":62,"hands":75,"pacc":78,"handl":72,"spwb":65,"piq":80,"pvis":78,"idef":38,"pdef":72,"stl":68,"blk":20,"hdef":72,"pper":72,"dcon":72,"oreb":20,"dreb":38,"spd":68,"agi":70,"str":65,"vert":52,"sta":85,"hus":90,"dur":78,"intangibles":80}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":22,"cnr":12,"p45":18,"atb":21},"lateral_bias":2}'::jsonb
);

-- 53. Shaun Livingston (전성기: 29세, 2014-15)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Shaun Livingston',
  '{"name":"숀 리빙스턴","team":"FA","position":"PG","age":29,"height":201,"weight":84,"health":"Healthy","salary":6.0,"contractyears":3,"pot":80,"ins":82,"out":52,"ath":75,"plm":80,"def":78,"reb":48,"close":85,"mid":82,"3c":35,"3_45":32,"3t":30,"ft":72,"siq":85,"ocon":82,"lay":82,"dnk":55,"post":72,"draw":68,"hands":82,"pacc":82,"handl":78,"spwb":75,"piq":85,"pvis":82,"idef":55,"pdef":78,"stl":72,"blk":42,"hdef":78,"pper":78,"dcon":78,"oreb":30,"dreb":48,"spd":75,"agi":78,"str":72,"vert":65,"sta":78,"hus":82,"dur":62,"intangibles":85}'::jsonb,
  '{"zones":{"ra":25,"itp":15,"mid":40,"cnr":2,"p45":8,"atb":10},"lateral_bias":2}'::jsonb
);

-- 54. Malachi Flynn (전성기: 24세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Malachi Flynn',
  '{"name":"말라카이 플린","team":"FA","position":"PG","age":24,"height":185,"weight":82,"health":"Healthy","salary":3.0,"contractyears":3,"pot":76,"ins":62,"out":72,"ath":72,"plm":72,"def":60,"reb":35,"close":65,"mid":72,"3c":74,"3_45":72,"3t":70,"ft":80,"siq":72,"ocon":68,"lay":70,"dnk":35,"post":38,"draw":62,"hands":68,"pacc":72,"handl":75,"spwb":72,"piq":72,"pvis":70,"idef":35,"pdef":60,"stl":65,"blk":22,"hdef":58,"pper":62,"dcon":58,"oreb":18,"dreb":35,"spd":78,"agi":78,"str":55,"vert":62,"sta":75,"hus":72,"dur":75,"intangibles":68}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":22,"cnr":12,"p45":16,"atb":20},"lateral_bias":2}'::jsonb
);

-- 55. Killian Hayes (전성기: 22세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Killian Hayes',
  '{"name":"킬리안 헤이즈","team":"FA","position":"PG","age":22,"height":196,"weight":88,"health":"Healthy","salary":4.0,"contractyears":4,"pot":80,"ins":62,"out":62,"ath":75,"plm":75,"def":72,"reb":42,"close":65,"mid":62,"3c":62,"3_45":60,"3t":58,"ft":72,"siq":68,"ocon":62,"lay":72,"dnk":52,"post":48,"draw":65,"hands":72,"pacc":75,"handl":78,"spwb":75,"piq":78,"pvis":78,"idef":48,"pdef":72,"stl":70,"blk":35,"hdef":72,"pper":72,"dcon":70,"oreb":25,"dreb":42,"spd":80,"agi":78,"str":68,"vert":68,"sta":78,"hus":78,"dur":72,"intangibles":70}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":8,"p45":14,"atb":15},"lateral_bias":0}'::jsonb
);

-- 56. Theo Maledon (전성기: 21세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Theo Maledon',
  '{"name":"테오 말레동","team":"FA","position":"PG","age":21,"height":193,"weight":84,"health":"Healthy","salary":2.0,"contractyears":3,"pot":76,"ins":60,"out":68,"ath":72,"plm":72,"def":58,"reb":38,"close":62,"mid":68,"3c":70,"3_45":68,"3t":65,"ft":78,"siq":70,"ocon":65,"lay":68,"dnk":40,"post":42,"draw":60,"hands":68,"pacc":72,"handl":75,"spwb":72,"piq":72,"pvis":72,"idef":38,"pdef":58,"stl":62,"blk":25,"hdef":58,"pper":62,"dcon":58,"oreb":20,"dreb":38,"spd":78,"agi":78,"str":58,"vert":65,"sta":75,"hus":70,"dur":78,"intangibles":65}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 57. Saben Lee (전성기: 23세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Saben Lee',
  '{"name":"세이벤 리","team":"FA","position":"PG","age":23,"height":188,"weight":84,"health":"Healthy","salary":2.0,"contractyears":3,"pot":74,"ins":68,"out":60,"ath":82,"plm":68,"def":58,"reb":35,"close":72,"mid":60,"3c":58,"3_45":55,"3t":52,"ft":72,"siq":65,"ocon":62,"lay":78,"dnk":62,"post":40,"draw":68,"hands":65,"pacc":68,"handl":75,"spwb":82,"piq":68,"pvis":65,"idef":38,"pdef":58,"stl":68,"blk":28,"hdef":55,"pper":58,"dcon":55,"oreb":22,"dreb":35,"spd":88,"agi":85,"str":62,"vert":75,"sta":78,"hus":75,"dur":75,"intangibles":62}'::jsonb,
  '{"zones":{"ra":35,"itp":12,"mid":20,"cnr":8,"p45":12,"atb":13},"lateral_bias":2}'::jsonb
);

-- 58. Kira Lewis Jr. (전성기: 21세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kira Lewis Jr.',
  '{"name":"키라 루이스 주니어","team":"FA","position":"PG","age":21,"height":188,"weight":79,"health":"Healthy","salary":3.0,"contractyears":4,"pot":80,"ins":65,"out":72,"ath":85,"plm":72,"def":58,"reb":35,"close":68,"mid":70,"3c":72,"3_45":70,"3t":68,"ft":78,"siq":68,"ocon":65,"lay":75,"dnk":55,"post":38,"draw":65,"hands":68,"pacc":70,"handl":78,"spwb":85,"piq":72,"pvis":70,"idef":35,"pdef":58,"stl":68,"blk":25,"hdef":55,"pper":58,"dcon":55,"oreb":20,"dreb":35,"spd":92,"agi":88,"str":55,"vert":72,"sta":78,"hus":72,"dur":68,"intangibles":65}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":20,"cnr":10,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 59. Raul Neto (전성기: 27세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Raul Neto',
  '{"name":"라울 네토","team":"FA","position":"PG","age":27,"height":185,"weight":82,"health":"Healthy","salary":3.0,"contractyears":3,"pot":75,"ins":65,"out":72,"ath":75,"plm":72,"def":62,"reb":35,"close":68,"mid":72,"3c":72,"3_45":70,"3t":68,"ft":82,"siq":75,"ocon":72,"lay":72,"dnk":35,"post":40,"draw":62,"hands":72,"pacc":72,"handl":75,"spwb":78,"piq":75,"pvis":72,"idef":38,"pdef":62,"stl":65,"blk":22,"hdef":62,"pper":65,"dcon":62,"oreb":18,"dreb":35,"spd":82,"agi":80,"str":58,"vert":62,"sta":78,"hus":75,"dur":78,"intangibles":72}'::jsonb,
  '{"zones":{"ra":28,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":17},"lateral_bias":2}'::jsonb
);

-- 60. Brandon Knight (전성기: 24세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Brandon Knight',
  '{"name":"브랜든 나이트","team":"FA","position":"PG","age":24,"height":190,"weight":86,"health":"Healthy","salary":6.0,"contractyears":3,"pot":80,"ins":72,"out":78,"ath":78,"plm":75,"def":58,"reb":38,"close":75,"mid":78,"3c":78,"3_45":76,"3t":75,"ft":82,"siq":75,"ocon":72,"lay":78,"dnk":55,"post":45,"draw":72,"hands":72,"pacc":72,"handl":80,"spwb":78,"piq":75,"pvis":72,"idef":38,"pdef":58,"stl":65,"blk":25,"hdef":55,"pper":60,"dcon":58,"oreb":22,"dreb":38,"spd":82,"agi":82,"str":65,"vert":72,"sta":78,"hus":75,"dur":65,"intangibles":72}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 61. Tyler Johnson (전성기: 25세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tyler Johnson',
  '{"name":"타일러 존슨","team":"FA","position":"PG","age":25,"height":193,"weight":84,"health":"Healthy","salary":5.0,"contractyears":3,"pot":78,"ins":72,"out":72,"ath":80,"plm":70,"def":68,"reb":42,"close":75,"mid":72,"3c":72,"3_45":70,"3t":68,"ft":78,"siq":72,"ocon":70,"lay":78,"dnk":60,"post":45,"draw":68,"hands":72,"pacc":68,"handl":75,"spwb":78,"piq":72,"pvis":68,"idef":42,"pdef":68,"stl":72,"blk":35,"hdef":68,"pper":68,"dcon":68,"oreb":25,"dreb":42,"spd":82,"agi":82,"str":68,"vert":78,"sta":80,"hus":80,"dur":75,"intangibles":72}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":10,"p45":14,"atb":14},"lateral_bias":2}'::jsonb
);
