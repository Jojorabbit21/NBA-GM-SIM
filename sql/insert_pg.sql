-- =============================================
-- NBA-GM-SIM: Historical PG Players Insert
-- Total: 61 Players
-- Format: Legacy base_attributes structure
-- =============================================

-- 1. Magic Johnson (전성기: 27세, 1986-87)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Magic Johnson',
  '{"3c":70,"3t":65,"ft":85,"age":27,"agi":80,"blk":55,"dnk":75,"dur":78,"hus":90,"lay":92,"mid":75,"piq":99,"pot":98,"siq":95,"spd":82,"sta":90,"stl":78,"str":85,"3_45":68,"dcon":78,"draw":80,"dreb":82,"hdef":82,"idef":65,"lock":50,"name":"매직 존슨","ocon":92,"oreb":55,"pacc":97,"pdef":72,"post":88,"pper":85,"pvis":99,"spwb":85,"team":"FA","vert":72,"close":90,"handl":90,"hands":95,"health":"Healthy","height":206,"salary":28.0,"weight":100,"position":"PG","intangibles":99,"contractyears":3}'::jsonb,
  '{"zones":{"ra":35,"itp":15,"mid":20,"cnr":5,"p45":10,"atb":15},"lateral_bias":2}'::jsonb
);

-- 2. Oscar Robertson (전성기: 27세, 1965-66)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Oscar Robertson',
  '{"3c":75,"3t":72,"ft":84,"age":27,"agi":83,"blk":50,"dnk":70,"dur":85,"hus":92,"lay":90,"mid":82,"piq":97,"pot":97,"siq":95,"spd":82,"sta":95,"stl":82,"str":88,"3_45":73,"dcon":82,"draw":82,"dreb":85,"hdef":80,"idef":72,"lock":50,"name":"오스카 로버트슨","ocon":93,"oreb":60,"pacc":95,"pdef":78,"post":85,"pper":84,"pvis":96,"spwb":85,"team":"FA","vert":75,"close":92,"handl":92,"hands":92,"health":"Healthy","height":196,"salary":26.0,"weight":100,"position":"PG","intangibles":97,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":15,"mid":25,"cnr":5,"p45":10,"atb":15},"lateral_bias":2}'::jsonb
);

-- 3. Jerry West (전성기: 27세, 1965-66)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jerry West',
  '{"3c":88,"3t":85,"ft":90,"age":27,"agi":86,"blk":48,"dnk":62,"dur":80,"hus":95,"lay":88,"mid":92,"piq":93,"pot":96,"siq":94,"spd":85,"sta":90,"stl":85,"str":72,"3_45":86,"dcon":85,"draw":85,"dreb":72,"hdef":82,"idef":65,"lock":50,"name":"제리 웨스트","ocon":92,"oreb":45,"pacc":90,"pdef":85,"post":72,"pper":86,"pvis":90,"spwb":84,"team":"FA","vert":78,"close":88,"handl":88,"hands":90,"health":"Healthy","height":190,"salary":25.0,"weight":79,"position":"PG","intangibles":97,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":30,"cnr":8,"p45":12,"atb":15},"lateral_bias":2}'::jsonb
);

-- 4. Isiah Thomas (전성기: 26세, 1987-88)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Isiah Thomas',
  '{"3c":78,"3t":75,"ft":80,"age":26,"agi":93,"blk":35,"dnk":65,"dur":75,"hus":95,"lay":90,"mid":82,"piq":95,"pot":95,"siq":92,"spd":92,"sta":88,"stl":82,"str":65,"3_45":76,"dcon":78,"draw":80,"dreb":52,"hdef":75,"idef":50,"lock":50,"name":"아이제이아 토마스","ocon":88,"oreb":38,"pacc":93,"pdef":78,"post":65,"pper":80,"pvis":93,"spwb":90,"team":"FA","vert":78,"close":88,"handl":94,"hands":90,"health":"Healthy","height":185,"salary":24.0,"weight":82,"position":"PG","intangibles":96,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":25,"cnr":8,"p45":12,"atb":15},"lateral_bias":2}'::jsonb
);

-- 5. John Stockton (전성기: 28세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'John Stockton',
  '{"3c":82,"3t":78,"ft":83,"age":28,"agi":82,"blk":35,"dnk":40,"dur":95,"hus":97,"lay":85,"mid":84,"piq":99,"pot":95,"siq":92,"spd":78,"sta":97,"stl":97,"str":75,"3_45":80,"dcon":90,"draw":78,"dreb":50,"hdef":88,"idef":55,"lock":50,"name":"존 스탁턴","ocon":90,"oreb":35,"pacc":99,"pdef":82,"post":62,"pper":95,"pvis":98,"spwb":80,"team":"FA","vert":62,"close":82,"handl":88,"hands":92,"health":"Healthy","height":185,"salary":23.0,"weight":79,"position":"PG","intangibles":97,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":25,"cnr":10,"p45":15,"atb":15},"lateral_bias":2}'::jsonb
);

-- 6. Steve Nash (전성기: 31세, 2005-06)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Steve Nash',
  '{"3c":90,"3t":87,"ft":92,"age":31,"agi":85,"blk":25,"dnk":35,"dur":72,"hus":82,"lay":85,"mid":88,"piq":98,"pot":94,"siq":95,"spd":80,"sta":88,"stl":65,"str":55,"3_45":88,"dcon":60,"draw":72,"dreb":45,"hdef":62,"idef":42,"lock":50,"name":"스티브 내쉬","ocon":92,"oreb":30,"pacc":97,"pdef":58,"post":55,"pper":70,"pvis":98,"spwb":85,"team":"FA","vert":60,"close":82,"handl":92,"hands":90,"health":"Healthy","height":191,"salary":22.0,"weight":81,"position":"PG","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":5,"mid":20,"cnr":12,"p45":18,"atb":20},"lateral_bias":2}'::jsonb
);

-- 7. Chris Paul (전성기: 27세, 2012-13)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Chris Paul',
  '{"3c":84,"3t":80,"ft":88,"age":27,"agi":85,"blk":32,"dnk":40,"dur":72,"hus":90,"lay":86,"mid":88,"piq":98,"pot":95,"siq":95,"spd":80,"sta":85,"stl":92,"str":68,"3_45":82,"dcon":88,"draw":78,"dreb":55,"hdef":88,"idef":52,"lock":50,"name":"크리스 폴","ocon":92,"oreb":32,"pacc":96,"pdef":85,"post":65,"pper":92,"pvis":96,"spwb":82,"team":"FA","vert":65,"close":85,"handl":92,"hands":92,"health":"Healthy","height":183,"salary":24.0,"weight":79,"position":"PG","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":28,"cnr":10,"p45":14,"atb":15},"lateral_bias":2}'::jsonb
);

-- 8. Gary Payton (전성기: 27세, 1995-96)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Gary Payton',
  '{"3c":76,"3t":72,"ft":75,"age":27,"agi":86,"blk":40,"dnk":60,"dur":88,"hus":95,"lay":88,"mid":80,"piq":90,"pot":94,"siq":88,"spd":85,"sta":90,"stl":93,"str":80,"3_45":74,"dcon":92,"draw":75,"dreb":55,"hdef":90,"idef":60,"lock":50,"name":"게리 페이튼","ocon":85,"oreb":38,"pacc":88,"pdef":96,"post":72,"pper":92,"pvis":88,"spwb":85,"team":"FA","vert":72,"close":85,"handl":88,"hands":88,"health":"Healthy","height":193,"salary":22.0,"weight":82,"position":"PG","intangibles":92,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":25,"cnr":8,"p45":12,"atb":13},"lateral_bias":2}'::jsonb
);

-- 9. Jason Kidd (전성기: 28세, 2001-02)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jason Kidd',
  '{"3c":80,"3t":76,"ft":70,"age":28,"agi":82,"blk":45,"dnk":65,"dur":85,"hus":90,"lay":82,"mid":75,"piq":96,"pot":94,"siq":88,"spd":84,"sta":90,"stl":88,"str":78,"3_45":78,"dcon":85,"draw":72,"dreb":78,"hdef":85,"idef":58,"lock":50,"name":"제이슨 키드","ocon":82,"oreb":48,"pacc":95,"pdef":82,"post":62,"pper":90,"pvis":97,"spwb":82,"team":"FA","vert":72,"close":80,"handl":85,"hands":90,"health":"Healthy","height":193,"salary":22.0,"weight":95,"position":"PG","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":20,"cnr":12,"p45":15,"atb":15},"lateral_bias":2}'::jsonb
);

-- 10. Tim Hardaway (전성기: 26세, 1992-93)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tim Hardaway',
  '{"3c":84,"3t":80,"ft":78,"age":26,"agi":92,"blk":30,"dnk":55,"dur":72,"hus":80,"lay":85,"mid":85,"piq":85,"pot":90,"siq":85,"spd":90,"sta":85,"stl":72,"str":65,"3_45":82,"dcon":68,"draw":72,"dreb":42,"hdef":65,"idef":45,"lock":50,"name":"팀 하더웨이","ocon":82,"oreb":28,"pacc":85,"pdef":70,"post":55,"pper":70,"pvis":82,"spwb":88,"team":"FA","vert":78,"close":82,"handl":90,"hands":82,"health":"Healthy","height":183,"salary":18.0,"weight":79,"position":"PG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 11. Kevin Johnson (전성기: 27세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kevin Johnson',
  '{"3c":70,"3t":65,"ft":84,"age":27,"agi":90,"blk":35,"dnk":72,"dur":70,"hus":85,"lay":92,"mid":75,"piq":88,"pot":90,"siq":85,"spd":92,"sta":88,"stl":75,"str":68,"3_45":68,"dcon":70,"draw":82,"dreb":45,"hdef":68,"idef":48,"lock":50,"name":"케빈 존슨","ocon":85,"oreb":35,"pacc":88,"pdef":72,"post":60,"pper":72,"pvis":85,"spwb":90,"team":"FA","vert":82,"close":90,"handl":88,"hands":85,"health":"Healthy","height":185,"salary":18.0,"weight":82,"position":"PG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":35,"itp":12,"mid":22,"cnr":5,"p45":10,"atb":16},"lateral_bias":2}'::jsonb
);

-- 12. Tony Parker (전성기: 27세, 2009-10)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tony Parker',
  '{"3c":70,"3t":65,"ft":76,"age":27,"agi":90,"blk":28,"dnk":55,"dur":78,"hus":85,"lay":94,"mid":78,"piq":92,"pot":92,"siq":90,"spd":92,"sta":88,"stl":70,"str":62,"3_45":68,"dcon":72,"draw":75,"dreb":40,"hdef":70,"idef":48,"lock":50,"name":"토니 파커","ocon":88,"oreb":30,"pacc":88,"pdef":72,"post":62,"pper":72,"pvis":88,"spwb":92,"team":"FA","vert":72,"close":92,"handl":90,"hands":85,"health":"Healthy","height":188,"salary":20.0,"weight":84,"position":"PG","intangibles":90,"contractyears":3}'::jsonb,
  '{"zones":{"ra":35,"itp":15,"mid":25,"cnr":5,"p45":8,"atb":12},"lateral_bias":2}'::jsonb
);

-- 13. Derrick Rose (전성기: 22세, 2010-11 MVP)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Derrick Rose',
  '{"3c":75,"3t":72,"ft":82,"age":22,"agi":95,"blk":42,"dnk":90,"dur":55,"hus":88,"lay":95,"mid":80,"piq":85,"pot":95,"siq":85,"spd":96,"sta":88,"stl":72,"str":75,"3_45":73,"dcon":70,"draw":82,"dreb":50,"hdef":70,"idef":48,"lock":50,"name":"데릭 로즈","ocon":85,"oreb":40,"pacc":82,"pdef":72,"post":58,"pper":72,"pvis":82,"spwb":95,"team":"FA","vert":95,"close":90,"handl":90,"hands":82,"health":"Healthy","height":190,"salary":22.0,"weight":86,"position":"PG","intangibles":88,"contractyears":4}'::jsonb,
  '{"zones":{"ra":38,"itp":12,"mid":22,"cnr":5,"p45":10,"atb":13},"lateral_bias":2}'::jsonb
);

-- 14. John Wall (전성기: 26세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'John Wall',
  '{"3c":74,"3t":70,"ft":78,"age":26,"agi":94,"blk":45,"dnk":85,"dur":62,"hus":85,"lay":90,"mid":76,"piq":88,"pot":92,"siq":82,"spd":97,"sta":88,"stl":80,"str":78,"3_45":72,"dcon":75,"draw":78,"dreb":48,"hdef":75,"idef":50,"lock":50,"name":"존 월","ocon":82,"oreb":35,"pacc":88,"pdef":76,"post":55,"pper":78,"pvis":88,"spwb":95,"team":"FA","vert":90,"close":85,"handl":90,"hands":82,"health":"Healthy","height":193,"salary":22.0,"weight":95,"position":"PG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":35,"itp":12,"mid":20,"cnr":8,"p45":12,"atb":13},"lateral_bias":2}'::jsonb
);

-- 15. Kemba Walker (전성기: 28세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kemba Walker',
  '{"3c":84,"3t":82,"ft":85,"age":28,"agi":90,"blk":28,"dnk":50,"dur":68,"hus":82,"lay":85,"mid":82,"piq":85,"pot":88,"siq":85,"spd":88,"sta":82,"stl":72,"str":58,"3_45":83,"dcon":62,"draw":78,"dreb":45,"hdef":62,"idef":42,"lock":50,"name":"켐바 워커","ocon":82,"oreb":28,"pacc":82,"pdef":65,"post":50,"pper":68,"pvis":80,"spwb":88,"team":"FA","vert":75,"close":82,"handl":90,"hands":80,"health":"Healthy","height":183,"salary":18.0,"weight":83,"position":"PG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 16. Baron Davis (전성기: 27세, 2006-07)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Baron Davis',
  '{"3c":78,"3t":75,"ft":72,"age":27,"agi":88,"blk":42,"dnk":82,"dur":65,"hus":82,"lay":88,"mid":78,"piq":82,"pot":90,"siq":80,"spd":90,"sta":82,"stl":80,"str":82,"3_45":76,"dcon":72,"draw":78,"dreb":52,"hdef":72,"idef":52,"lock":50,"name":"바론 데이비스","ocon":78,"oreb":38,"pacc":82,"pdef":72,"post":60,"pper":75,"pvis":82,"spwb":88,"team":"FA","vert":88,"close":84,"handl":88,"hands":80,"health":"Healthy","height":190,"salary":18.0,"weight":95,"position":"PG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 17. Chauncey Billups (전성기: 28세, 2004-05)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Chauncey Billups',
  '{"3c":87,"3t":84,"ft":92,"age":28,"agi":78,"blk":32,"dnk":45,"dur":78,"hus":90,"lay":80,"mid":86,"piq":92,"pot":92,"siq":92,"spd":75,"sta":85,"stl":72,"str":78,"3_45":85,"dcon":82,"draw":82,"dreb":48,"hdef":80,"idef":52,"lock":50,"name":"챈시 빌럽스","ocon":90,"oreb":30,"pacc":85,"pdef":78,"post":60,"pper":80,"pvis":85,"spwb":78,"team":"FA","vert":65,"close":80,"handl":82,"hands":85,"health":"Healthy","height":190,"salary":20.0,"weight":91,"position":"PG","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 18. Stephon Marbury (전성기: 26세, 2003-04)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Stephon Marbury',
  '{"3c":80,"3t":76,"ft":80,"age":26,"agi":90,"blk":28,"dnk":70,"dur":82,"hus":72,"lay":90,"mid":82,"piq":82,"pot":90,"siq":80,"spd":92,"sta":85,"stl":70,"str":70,"3_45":78,"dcon":62,"draw":78,"dreb":42,"hdef":60,"idef":42,"lock":50,"name":"스테폰 마버리","ocon":80,"oreb":28,"pacc":82,"pdef":62,"post":55,"pper":65,"pvis":80,"spwb":90,"team":"FA","vert":82,"close":86,"handl":92,"hands":80,"health":"Healthy","height":188,"salary":18.0,"weight":82,"position":"PG","intangibles":75,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":8,"p45":12,"atb":18},"lateral_bias":2}'::jsonb
);

-- 19. Sam Cassell (전성기: 30세, 2003-04)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Sam Cassell',
  '{"3c":82,"3t":78,"ft":85,"age":30,"agi":78,"blk":28,"dnk":42,"dur":78,"hus":85,"lay":85,"mid":86,"piq":90,"pot":88,"siq":92,"spd":75,"sta":82,"stl":72,"str":72,"3_45":80,"dcon":75,"draw":78,"dreb":48,"hdef":72,"idef":48,"lock":50,"name":"샘 캐셀","ocon":88,"oreb":30,"pacc":85,"pdef":72,"post":68,"pper":75,"pvis":85,"spwb":78,"team":"FA","vert":62,"close":85,"handl":85,"hands":85,"health":"Healthy","height":190,"salary":16.0,"weight":84,"position":"PG","intangibles":90,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":28,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 20. Mike Bibby (전성기: 25세, 2002-03)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Mike Bibby',
  '{"3c":86,"3t":82,"ft":85,"age":25,"agi":80,"blk":25,"dnk":38,"dur":80,"hus":78,"lay":78,"mid":84,"piq":85,"pot":87,"siq":85,"spd":78,"sta":82,"stl":68,"str":70,"3_45":84,"dcon":70,"draw":70,"dreb":42,"hdef":68,"idef":45,"lock":50,"name":"마이크 비비","ocon":82,"oreb":25,"pacc":82,"pdef":68,"post":55,"pper":72,"pvis":82,"spwb":78,"team":"FA","vert":62,"close":78,"handl":82,"hands":82,"health":"Healthy","height":185,"salary":15.0,"weight":86,"position":"PG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 21. Nick VanExel (전성기: 27세, 1998-99)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Nick VanExel',
  '{"3c":85,"3t":85,"ft":80,"age":27,"agi":85,"blk":25,"dnk":50,"dur":78,"hus":75,"lay":80,"mid":82,"piq":80,"pot":87,"siq":78,"spd":85,"sta":82,"stl":68,"str":62,"3_45":84,"dcon":58,"draw":72,"dreb":38,"hdef":58,"idef":40,"lock":50,"name":"닉 밴엑셀","ocon":78,"oreb":25,"pacc":80,"pdef":60,"post":48,"pper":62,"pvis":78,"spwb":82,"team":"FA","vert":72,"close":78,"handl":85,"hands":78,"health":"Healthy","height":185,"salary":15.0,"weight":79,"position":"PG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":20,"cnr":10,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 22. Terrell Brandon (전성기: 27세, 1996-97)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Terrell Brandon',
  '{"3c":78,"3t":75,"ft":82,"age":27,"agi":88,"blk":30,"dnk":48,"dur":68,"hus":82,"lay":85,"mid":80,"piq":88,"pot":87,"siq":85,"spd":88,"sta":85,"stl":82,"str":60,"3_45":76,"dcon":72,"draw":75,"dreb":42,"hdef":72,"idef":45,"lock":50,"name":"테렐 브랜든","ocon":82,"oreb":28,"pacc":85,"pdef":75,"post":52,"pper":78,"pvis":85,"spwb":85,"team":"FA","vert":72,"close":82,"handl":88,"hands":82,"health":"Healthy","height":180,"salary":14.0,"weight":78,"position":"PG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 23. Damon Stoudamire (전성기: 24세, 1997-98)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Damon Stoudamire',
  '{"3c":82,"3t":78,"ft":80,"age":24,"agi":88,"blk":22,"dnk":40,"dur":78,"hus":78,"lay":80,"mid":80,"piq":82,"pot":85,"siq":78,"spd":88,"sta":82,"stl":72,"str":55,"3_45":80,"dcon":62,"draw":70,"dreb":42,"hdef":60,"idef":38,"lock":50,"name":"데이먼 스타우더마이어","ocon":78,"oreb":25,"pacc":80,"pdef":62,"post":45,"pper":68,"pvis":80,"spwb":82,"team":"FA","vert":68,"close":78,"handl":85,"hands":78,"health":"Healthy","height":178,"salary":12.0,"weight":77,"position":"PG","intangibles":75,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 24. Rod Strickland (전성기: 28세, 1997-98)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Rod Strickland',
  '{"3c":65,"3t":60,"ft":75,"age":28,"agi":88,"blk":28,"dnk":55,"dur":78,"hus":78,"lay":90,"mid":72,"piq":88,"pot":86,"siq":82,"spd":85,"sta":82,"stl":78,"str":68,"3_45":62,"dcon":65,"draw":78,"dreb":48,"hdef":65,"idef":45,"lock":50,"name":"로드 스트릭랜드","ocon":80,"oreb":32,"pacc":88,"pdef":65,"post":58,"pper":75,"pvis":88,"spwb":85,"team":"FA","vert":72,"close":88,"handl":90,"hands":85,"health":"Healthy","height":185,"salary":12.0,"weight":79,"position":"PG","intangibles":80,"contractyears":3}'::jsonb,
  '{"zones":{"ra":35,"itp":15,"mid":22,"cnr":5,"p45":10,"atb":13},"lateral_bias":1}'::jsonb
);

-- 25. Dana Barros (전성기: 28세, 1994-95)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Dana Barros',
  '{"3c":90,"3t":87,"ft":88,"age":28,"agi":82,"blk":18,"dnk":30,"dur":78,"hus":75,"lay":75,"mid":85,"piq":78,"pot":82,"siq":82,"spd":82,"sta":78,"stl":62,"str":48,"3_45":88,"dcon":55,"draw":65,"dreb":32,"hdef":52,"idef":32,"lock":50,"name":"데이나 배로스","ocon":80,"oreb":20,"pacc":78,"pdef":55,"post":38,"pper":58,"pvis":75,"spwb":78,"team":"FA","vert":62,"close":72,"handl":82,"hands":75,"health":"Healthy","height":178,"salary":8.0,"weight":75,"position":"PG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":5,"mid":22,"cnr":12,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 26. Gilbert Arenas (전성기: 25세, 2006-07)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Gilbert Arenas',
  '{"3c":90,"3t":90,"ft":85,"age":25,"agi":85,"blk":35,"dnk":72,"dur":55,"hus":78,"lay":88,"mid":88,"piq":80,"pot":92,"siq":82,"spd":88,"sta":85,"stl":72,"str":75,"3_45":88,"dcon":60,"draw":82,"dreb":48,"hdef":60,"idef":42,"lock":50,"name":"길버트 아레나스","ocon":82,"oreb":32,"pacc":78,"pdef":62,"post":58,"pper":65,"pvis":78,"spwb":85,"team":"FA","vert":82,"close":84,"handl":88,"hands":78,"health":"Healthy","height":191,"salary":20.0,"weight":93,"position":"PG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":20,"cnr":8,"p45":15,"atb":24},"lateral_bias":2}'::jsonb
);

-- 27. Deron Williams (전성기: 24세, 2008-09)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Deron Williams',
  '{"3c":84,"3t":80,"ft":82,"age":24,"agi":85,"blk":35,"dnk":62,"dur":72,"hus":80,"lay":85,"mid":82,"piq":90,"pot":92,"siq":85,"spd":85,"sta":85,"stl":72,"str":80,"3_45":82,"dcon":72,"draw":75,"dreb":48,"hdef":72,"idef":48,"lock":50,"name":"데론 윌리엄스","ocon":85,"oreb":30,"pacc":88,"pdef":72,"post":65,"pper":75,"pvis":88,"spwb":85,"team":"FA","vert":72,"close":84,"handl":90,"hands":85,"health":"Healthy","height":190,"salary":18.0,"weight":93,"position":"PG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":25,"cnr":10,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 28. Rajon Rondo (전성기: 26세, 2011-12)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Rajon Rondo',
  '{"3c":52,"3t":48,"ft":62,"age":26,"agi":88,"blk":38,"dnk":62,"dur":72,"hus":88,"lay":85,"mid":60,"piq":96,"pot":90,"siq":88,"spd":88,"sta":85,"stl":88,"str":68,"3_45":50,"dcon":80,"draw":68,"dreb":58,"hdef":82,"idef":52,"lock":50,"name":"라존 론도","ocon":78,"oreb":42,"pacc":95,"pdef":80,"post":55,"pper":88,"pvis":97,"spwb":88,"team":"FA","vert":72,"close":82,"handl":88,"hands":88,"health":"Healthy","height":185,"salary":16.0,"weight":82,"position":"PG","intangibles":88,"contractyears":3}'::jsonb,
  '{"zones":{"ra":38,"itp":15,"mid":22,"cnr":5,"p45":10,"atb":10},"lateral_bias":1}'::jsonb
);

-- 29. Goran Dragic (전성기: 28세, 2013-14)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Goran Dragic',
  '{"3c":78,"3t":75,"ft":80,"age":28,"agi":85,"blk":28,"dnk":65,"dur":78,"hus":80,"lay":88,"mid":78,"piq":82,"pot":87,"siq":82,"spd":85,"sta":82,"stl":70,"str":68,"3_45":76,"dcon":65,"draw":78,"dreb":42,"hdef":65,"idef":45,"lock":50,"name":"고란 드라기치","ocon":80,"oreb":28,"pacc":80,"pdef":65,"post":55,"pper":68,"pvis":80,"spwb":85,"team":"FA","vert":72,"close":85,"handl":85,"hands":80,"health":"Healthy","height":190,"salary":15.0,"weight":86,"position":"PG","intangibles":80,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":1}'::jsonb
);

-- 30. Ricky Rubio (전성기: 26세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Ricky Rubio',
  '{"3c":72,"3t":68,"ft":85,"age":26,"agi":80,"blk":28,"dnk":35,"dur":72,"hus":85,"lay":78,"mid":70,"piq":92,"pot":85,"siq":82,"spd":78,"sta":82,"stl":82,"str":62,"3_45":70,"dcon":78,"draw":72,"dreb":50,"hdef":78,"idef":45,"lock":50,"name":"리키 루비오","ocon":78,"oreb":25,"pacc":90,"pdef":78,"post":48,"pper":82,"pvis":92,"spwb":78,"team":"FA","vert":62,"close":72,"handl":82,"hands":85,"health":"Healthy","height":190,"salary":12.0,"weight":86,"position":"PG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":22,"cnr":10,"p45":15,"atb":15},"lateral_bias":2}'::jsonb
);

-- 31. Jeff Teague (전성기: 27세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jeff Teague',
  '{"3c":74,"3t":70,"ft":82,"age":27,"agi":85,"blk":30,"dnk":60,"dur":80,"hus":78,"lay":85,"mid":75,"piq":82,"pot":85,"siq":80,"spd":88,"sta":82,"stl":72,"str":65,"3_45":72,"dcon":68,"draw":75,"dreb":40,"hdef":68,"idef":42,"lock":50,"name":"제프 티그","ocon":78,"oreb":25,"pacc":80,"pdef":68,"post":50,"pper":72,"pvis":78,"spwb":85,"team":"FA","vert":75,"close":80,"handl":82,"hands":78,"health":"Healthy","height":188,"salary":12.0,"weight":84,"position":"PG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 32. Eric Bledsoe (전성기: 26세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Eric Bledsoe',
  '{"3c":72,"3t":68,"ft":78,"age":26,"agi":88,"blk":42,"dnk":75,"dur":75,"hus":82,"lay":88,"mid":72,"piq":78,"pot":86,"siq":78,"spd":90,"sta":85,"stl":80,"str":80,"3_45":70,"dcon":72,"draw":78,"dreb":48,"hdef":72,"idef":52,"lock":50,"name":"에릭 블레드소","ocon":78,"oreb":35,"pacc":78,"pdef":75,"post":55,"pper":75,"pvis":75,"spwb":85,"team":"FA","vert":82,"close":84,"handl":82,"hands":78,"health":"Healthy","height":185,"salary":14.0,"weight":93,"position":"PG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":2}'::jsonb
);

-- 33. Darren Collison (전성기: 28세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Darren Collison',
  '{"3c":82,"3t":78,"ft":85,"age":28,"agi":85,"blk":22,"dnk":42,"dur":80,"hus":80,"lay":80,"mid":78,"piq":82,"pot":82,"siq":82,"spd":85,"sta":82,"stl":72,"str":60,"3_45":80,"dcon":70,"draw":68,"dreb":38,"hdef":68,"idef":40,"lock":50,"name":"대런 콜리슨","ocon":80,"oreb":22,"pacc":80,"pdef":68,"post":45,"pper":72,"pvis":78,"spwb":80,"team":"FA","vert":65,"close":75,"handl":80,"hands":78,"health":"Healthy","height":183,"salary":8.0,"weight":79,"position":"PG","intangibles":80,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":17},"lateral_bias":2}'::jsonb
);

-- 34. Mark Jackson (전성기: 27세, 1992-93)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Mark Jackson',
  '{"3c":70,"3t":65,"ft":78,"age":27,"agi":72,"blk":28,"dnk":35,"dur":85,"hus":85,"lay":78,"mid":72,"piq":92,"pot":85,"siq":85,"spd":68,"sta":85,"stl":78,"str":78,"3_45":68,"dcon":75,"draw":72,"dreb":52,"hdef":75,"idef":50,"lock":50,"name":"마크 잭슨","ocon":82,"oreb":32,"pacc":90,"pdef":72,"post":68,"pper":80,"pvis":92,"spwb":72,"team":"FA","vert":58,"close":78,"handl":82,"hands":85,"health":"Healthy","height":190,"salary":10.0,"weight":88,"position":"PG","intangibles":88,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":12,"mid":28,"cnr":5,"p45":10,"atb":17},"lateral_bias":2}'::jsonb
);

-- 35. Terry Porter (전성기: 27세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Terry Porter',
  '{"3c":82,"3t":78,"ft":85,"age":27,"agi":80,"blk":30,"dnk":42,"dur":82,"hus":85,"lay":78,"mid":82,"piq":85,"pot":87,"siq":85,"spd":78,"sta":85,"stl":78,"str":72,"3_45":80,"dcon":75,"draw":72,"dreb":45,"hdef":75,"idef":48,"lock":50,"name":"테리 포터","ocon":82,"oreb":28,"pacc":85,"pdef":75,"post":55,"pper":78,"pvis":85,"spwb":78,"team":"FA","vert":68,"close":78,"handl":82,"hands":82,"health":"Healthy","height":190,"salary":12.0,"weight":88,"position":"PG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 36. George Hill (전성기: 28세, 2013-14)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'George Hill',
  '{"3c":80,"3t":76,"ft":82,"age":28,"agi":80,"blk":35,"dnk":55,"dur":82,"hus":80,"lay":80,"mid":78,"piq":80,"pot":84,"siq":82,"spd":80,"sta":82,"stl":72,"str":72,"3_45":78,"dcon":78,"draw":68,"dreb":45,"hdef":75,"idef":48,"lock":50,"name":"조지 힐","ocon":80,"oreb":25,"pacc":78,"pdef":78,"post":52,"pper":75,"pvis":75,"spwb":78,"team":"FA","vert":72,"close":78,"handl":78,"hands":78,"health":"Healthy","height":190,"salary":10.0,"weight":84,"position":"PG","intangibles":80,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":17},"lateral_bias":2}'::jsonb
);

-- 37. Kirk Hinrich (전성기: 26세, 2007-08)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kirk Hinrich',
  '{"3c":80,"3t":76,"ft":82,"age":26,"agi":78,"blk":28,"dnk":38,"dur":78,"hus":85,"lay":75,"mid":78,"piq":80,"pot":83,"siq":80,"spd":78,"sta":85,"stl":75,"str":72,"3_45":78,"dcon":80,"draw":68,"dreb":42,"hdef":78,"idef":48,"lock":50,"name":"커크 힌리치","ocon":78,"oreb":25,"pacc":78,"pdef":80,"post":48,"pper":78,"pvis":78,"spwb":75,"team":"FA","vert":65,"close":72,"handl":78,"hands":78,"health":"Healthy","height":190,"salary":9.0,"weight":86,"position":"PG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 38. Brevin Knight (전성기: 26세, 2001-02)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Brevin Knight',
  '{"3c":65,"3t":60,"ft":75,"age":26,"agi":88,"blk":22,"dnk":35,"dur":75,"hus":85,"lay":75,"mid":68,"piq":85,"pot":78,"siq":78,"spd":88,"sta":82,"stl":82,"str":50,"3_45":62,"dcon":75,"draw":65,"dreb":38,"hdef":75,"idef":38,"lock":50,"name":"브레빈 나이트","ocon":75,"oreb":22,"pacc":82,"pdef":75,"post":38,"pper":80,"pvis":85,"spwb":80,"team":"FA","vert":65,"close":68,"handl":82,"hands":80,"health":"Healthy","height":178,"salary":5.0,"weight":75,"position":"PG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":25,"cnr":8,"p45":12,"atb":13},"lateral_bias":2}'::jsonb
);

-- 39. Reggie Jackson (전성기: 27세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Reggie Jackson',
  '{"3c":78,"3t":75,"ft":78,"age":27,"agi":82,"blk":30,"dnk":62,"dur":72,"hus":75,"lay":82,"mid":78,"piq":78,"pot":83,"siq":78,"spd":82,"sta":80,"stl":68,"str":72,"3_45":76,"dcon":62,"draw":72,"dreb":42,"hdef":60,"idef":42,"lock":50,"name":"레지 잭슨","ocon":75,"oreb":28,"pacc":75,"pdef":62,"post":52,"pper":65,"pvis":75,"spwb":82,"team":"FA","vert":72,"close":80,"handl":80,"hands":75,"health":"Healthy","height":190,"salary":10.0,"weight":93,"position":"PG","intangibles":75,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":22,"cnr":10,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 40. Mario Chalmers (전성기: 26세, 2012-13)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Mario Chalmers',
  '{"3c":80,"3t":76,"ft":78,"age":26,"agi":82,"blk":28,"dnk":48,"dur":75,"hus":80,"lay":78,"mid":76,"piq":78,"pot":80,"siq":78,"spd":82,"sta":80,"stl":75,"str":65,"3_45":78,"dcon":72,"draw":68,"dreb":38,"hdef":72,"idef":40,"lock":50,"name":"마리오 찰머스","ocon":75,"oreb":22,"pacc":75,"pdef":72,"post":42,"pper":72,"pvis":72,"spwb":78,"team":"FA","vert":68,"close":75,"handl":78,"hands":75,"health":"Healthy","height":185,"salary":6.0,"weight":86,"position":"PG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":12,"p45":15,"atb":18},"lateral_bias":2}'::jsonb
);

-- 41. Steve Kerr (전성기: 30세, 1995-96)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Steve Kerr',
  '{"3c":95,"3t":93,"ft":90,"age":30,"agi":65,"blk":15,"dnk":20,"dur":75,"hus":82,"lay":60,"mid":88,"piq":82,"pot":78,"siq":90,"spd":62,"sta":75,"stl":58,"str":48,"3_45":94,"dcon":65,"draw":55,"dreb":30,"hdef":65,"idef":32,"lock":50,"name":"스티브 커","ocon":85,"oreb":15,"pacc":75,"pdef":60,"post":35,"pper":68,"pvis":75,"spwb":62,"team":"FA","vert":45,"close":62,"handl":68,"hands":78,"health":"Healthy","height":183,"salary":5.0,"weight":82,"position":"PG","intangibles":90,"contractyears":3}'::jsonb,
  '{"zones":{"ra":12,"itp":3,"mid":18,"cnr":18,"p45":22,"atb":27},"lateral_bias":2}'::jsonb
);

-- 42. Isaiah Thomas (아이티, 전성기: 27세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Isaiah Thomas',
  '{"3c":88,"3t":85,"ft":88,"age":27,"agi":90,"blk":15,"dnk":42,"dur":60,"hus":90,"lay":88,"mid":86,"piq":82,"pot":88,"siq":88,"spd":88,"sta":85,"stl":62,"str":55,"3_45":86,"dcon":42,"draw":82,"dreb":35,"hdef":40,"idef":25,"lock":50,"name":"이사야 토마스","ocon":85,"oreb":22,"pacc":78,"pdef":42,"post":42,"pper":50,"pvis":78,"spwb":85,"team":"FA","vert":65,"close":85,"handl":90,"hands":78,"health":"Healthy","height":175,"salary":12.0,"weight":84,"position":"PG","intangibles":90,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":8,"mid":20,"cnr":10,"p45":14,"atb":20},"lateral_bias":2}'::jsonb
);

-- 43. Lou Williams (전성기: 31세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Lou Williams',
  '{"3c":82,"3t":78,"ft":88,"age":31,"agi":80,"blk":18,"dnk":38,"dur":82,"hus":72,"lay":85,"mid":84,"piq":82,"pot":84,"siq":85,"spd":78,"sta":78,"stl":62,"str":55,"3_45":80,"dcon":48,"draw":85,"dreb":35,"hdef":48,"idef":30,"lock":50,"name":"루 윌리엄스","ocon":82,"oreb":20,"pacc":78,"pdef":48,"post":45,"pper":55,"pvis":78,"spwb":78,"team":"FA","vert":58,"close":82,"handl":85,"hands":78,"health":"Healthy","height":185,"salary":10.0,"weight":79,"position":"PG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 44. Kendrick Nunn (전성기: 24세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kendrick Nunn',
  '{"3c":78,"3t":75,"ft":82,"age":24,"agi":80,"blk":28,"dnk":55,"dur":72,"hus":72,"lay":78,"mid":76,"piq":72,"pot":80,"siq":75,"spd":82,"sta":78,"stl":65,"str":68,"3_45":76,"dcon":58,"draw":68,"dreb":40,"hdef":58,"idef":38,"lock":50,"name":"켄드릭 넌","ocon":72,"oreb":22,"pacc":70,"pdef":58,"post":45,"pper":62,"pvis":68,"spwb":78,"team":"FA","vert":72,"close":75,"handl":78,"hands":72,"health":"Healthy","height":188,"salary":5.0,"weight":86,"position":"PG","intangibles":70,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 45. Emmanuel Mudiay (전성기: 22세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Emmanuel Mudiay',
  '{"3c":65,"3t":60,"ft":70,"age":22,"agi":80,"blk":35,"dnk":65,"dur":75,"hus":72,"lay":80,"mid":68,"piq":72,"pot":80,"siq":68,"spd":82,"sta":78,"stl":65,"str":75,"3_45":62,"dcon":58,"draw":70,"dreb":42,"hdef":58,"idef":42,"lock":50,"name":"이매뉴얼 무디에이","ocon":65,"oreb":28,"pacc":72,"pdef":58,"post":50,"pper":62,"pvis":72,"spwb":80,"team":"FA","vert":78,"close":75,"handl":78,"hands":70,"health":"Healthy","height":196,"salary":4.0,"weight":93,"position":"PG","intangibles":68,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":2}'::jsonb
);

-- 46. Monte Morris (전성기: 26세, 2021-22)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Monte Morris',
  '{"3c":76,"3t":72,"ft":82,"age":26,"agi":78,"blk":22,"dnk":35,"dur":80,"hus":78,"lay":75,"mid":75,"piq":82,"pot":78,"siq":80,"spd":75,"sta":78,"stl":68,"str":60,"3_45":74,"dcon":68,"draw":62,"dreb":38,"hdef":65,"idef":38,"lock":50,"name":"몬테 모리스","ocon":78,"oreb":20,"pacc":78,"pdef":65,"post":42,"pper":70,"pvis":78,"spwb":75,"team":"FA","vert":60,"close":72,"handl":78,"hands":78,"health":"Healthy","height":185,"salary":5.0,"weight":82,"position":"PG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":17},"lateral_bias":2}'::jsonb
);

-- 47. Devonte' Graham (전성기: 24세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Devonte'' Graham',
  '{"3c":80,"3t":78,"ft":82,"age":24,"agi":80,"blk":20,"dnk":35,"dur":78,"hus":72,"lay":72,"mid":78,"piq":78,"pot":80,"siq":75,"spd":78,"sta":78,"stl":65,"str":55,"3_45":78,"dcon":58,"draw":65,"dreb":38,"hdef":55,"idef":35,"lock":50,"name":"디본테 그레이엄","ocon":72,"oreb":18,"pacc":75,"pdef":58,"post":38,"pper":60,"pvis":75,"spwb":78,"team":"FA","vert":62,"close":68,"handl":80,"hands":72,"health":"Healthy","height":185,"salary":5.0,"weight":82,"position":"PG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":5,"mid":20,"cnr":12,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 48. Facundo Campazzo (전성기: 30세, 2020-21)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Facundo Campazzo',
  '{"3c":72,"3t":68,"ft":78,"age":30,"agi":82,"blk":18,"dnk":25,"dur":78,"hus":88,"lay":68,"mid":70,"piq":85,"pot":76,"siq":78,"spd":80,"sta":82,"stl":78,"str":52,"3_45":70,"dcon":72,"draw":65,"dreb":35,"hdef":72,"idef":32,"lock":50,"name":"파쿤도 캄파초","ocon":72,"oreb":18,"pacc":82,"pdef":72,"post":35,"pper":78,"pvis":88,"spwb":75,"team":"FA","vert":55,"close":62,"handl":82,"hands":78,"health":"Healthy","height":178,"salary":4.0,"weight":79,"position":"PG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":12,"p45":15,"atb":18},"lateral_bias":2}'::jsonb
);

-- 49. D.J. Augustin (전성기: 27세, 2014-15)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'D.J. Augustin',
  '{"3c":82,"3t":78,"ft":85,"age":27,"agi":80,"blk":18,"dnk":30,"dur":80,"hus":72,"lay":72,"mid":78,"piq":78,"pot":78,"siq":78,"spd":78,"sta":78,"stl":62,"str":52,"3_45":80,"dcon":58,"draw":65,"dreb":35,"hdef":55,"idef":32,"lock":50,"name":"D.J. 오거스틴","ocon":75,"oreb":18,"pacc":75,"pdef":55,"post":38,"pper":60,"pvis":75,"spwb":75,"team":"FA","vert":58,"close":68,"handl":78,"hands":72,"health":"Healthy","height":183,"salary":5.0,"weight":82,"position":"PG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":22,"cnr":12,"p45":16,"atb":23},"lateral_bias":2}'::jsonb
);

-- 50. Michael Adams (전성기: 27세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Michael Adams',
  '{"3c":82,"3t":84,"ft":85,"age":27,"agi":85,"blk":18,"dnk":35,"dur":78,"hus":78,"lay":72,"mid":78,"piq":78,"pot":80,"siq":72,"spd":85,"sta":82,"stl":68,"str":48,"3_45":82,"dcon":52,"draw":72,"dreb":35,"hdef":50,"idef":30,"lock":50,"name":"마이클 아담스","ocon":72,"oreb":20,"pacc":78,"pdef":52,"post":35,"pper":58,"pvis":78,"spwb":80,"team":"FA","vert":65,"close":68,"handl":82,"hands":72,"health":"Healthy","height":178,"salary":6.0,"weight":75,"position":"PG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":5,"mid":18,"cnr":12,"p45":18,"atb":27},"lateral_bias":2}'::jsonb
);

-- 51. Cat Barber (전성기: 24세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Cat Barber',
  '{"3c":58,"3t":52,"ft":72,"age":24,"agi":85,"blk":25,"dnk":55,"dur":72,"hus":72,"lay":75,"mid":62,"piq":65,"pot":72,"siq":65,"spd":88,"sta":75,"stl":65,"str":60,"3_45":55,"dcon":52,"draw":65,"dreb":35,"hdef":52,"idef":35,"lock":50,"name":"캣 바버","ocon":62,"oreb":22,"pacc":65,"pdef":55,"post":40,"pper":55,"pvis":62,"spwb":80,"team":"FA","vert":72,"close":72,"handl":75,"hands":65,"health":"Healthy","height":188,"salary":2.0,"weight":84,"position":"PG","intangibles":60,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":2}'::jsonb
);

-- 52. Matthew Dellavedova (전성기: 26세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Matthew Dellavedova',
  '{"3c":75,"3t":70,"ft":80,"age":26,"agi":70,"blk":20,"dnk":25,"dur":78,"hus":90,"lay":65,"mid":70,"piq":80,"pot":75,"siq":78,"spd":68,"sta":85,"stl":68,"str":65,"3_45":72,"dcon":72,"draw":62,"dreb":38,"hdef":72,"idef":38,"lock":50,"name":"매튜 델라베도바","ocon":72,"oreb":20,"pacc":78,"pdef":72,"post":40,"pper":72,"pvis":78,"spwb":65,"team":"FA","vert":52,"close":62,"handl":72,"hands":75,"health":"Healthy","height":193,"salary":4.0,"weight":88,"position":"PG","intangibles":80,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":22,"cnr":12,"p45":18,"atb":21},"lateral_bias":2}'::jsonb
);

-- 53. Shaun Livingston (전성기: 29세, 2014-15)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Shaun Livingston',
  '{"3c":35,"3t":30,"ft":72,"age":29,"agi":78,"blk":42,"dnk":55,"dur":62,"hus":82,"lay":82,"mid":82,"piq":85,"pot":80,"siq":85,"spd":75,"sta":78,"stl":72,"str":72,"3_45":32,"dcon":78,"draw":68,"dreb":48,"hdef":78,"idef":55,"lock":50,"name":"숀 리빙스턴","ocon":82,"oreb":30,"pacc":82,"pdef":78,"post":72,"pper":78,"pvis":82,"spwb":75,"team":"FA","vert":65,"close":85,"handl":78,"hands":82,"health":"Healthy","height":201,"salary":6.0,"weight":84,"position":"PG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":15,"mid":40,"cnr":2,"p45":8,"atb":10},"lateral_bias":2}'::jsonb
);

-- 54. Malachi Flynn (전성기: 24세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Malachi Flynn',
  '{"3c":74,"3t":70,"ft":80,"age":24,"agi":78,"blk":22,"dnk":35,"dur":75,"hus":72,"lay":70,"mid":72,"piq":72,"pot":76,"siq":72,"spd":78,"sta":75,"stl":65,"str":55,"3_45":72,"dcon":58,"draw":62,"dreb":35,"hdef":58,"idef":35,"lock":50,"name":"말라카이 플린","ocon":68,"oreb":18,"pacc":72,"pdef":60,"post":38,"pper":62,"pvis":70,"spwb":72,"team":"FA","vert":62,"close":65,"handl":75,"hands":68,"health":"Healthy","height":185,"salary":3.0,"weight":82,"position":"PG","intangibles":68,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":22,"cnr":12,"p45":16,"atb":20},"lateral_bias":2}'::jsonb
);

-- 55. Killian Hayes (전성기: 22세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Killian Hayes',
  '{"3c":62,"3t":58,"ft":72,"age":22,"agi":78,"blk":35,"dnk":52,"dur":72,"hus":78,"lay":72,"mid":62,"piq":78,"pot":80,"siq":68,"spd":80,"sta":78,"stl":70,"str":68,"3_45":60,"dcon":70,"draw":65,"dreb":42,"hdef":72,"idef":48,"lock":50,"name":"킬리안 헤이즈","ocon":62,"oreb":25,"pacc":75,"pdef":72,"post":48,"pper":72,"pvis":78,"spwb":75,"team":"FA","vert":68,"close":65,"handl":78,"hands":72,"health":"Healthy","height":196,"salary":4.0,"weight":88,"position":"PG","intangibles":70,"contractyears":4}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":8,"p45":14,"atb":15},"lateral_bias":0}'::jsonb
);

-- 56. Theo Maledon (전성기: 21세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Theo Maledon',
  '{"3c":70,"3t":65,"ft":78,"age":21,"agi":78,"blk":25,"dnk":40,"dur":78,"hus":70,"lay":68,"mid":68,"piq":72,"pot":76,"siq":70,"spd":78,"sta":75,"stl":62,"str":58,"3_45":68,"dcon":58,"draw":60,"dreb":38,"hdef":58,"idef":38,"lock":50,"name":"테오 말레동","ocon":65,"oreb":20,"pacc":72,"pdef":58,"post":42,"pper":62,"pvis":72,"spwb":72,"team":"FA","vert":65,"close":62,"handl":75,"hands":68,"health":"Healthy","height":193,"salary":2.0,"weight":84,"position":"PG","intangibles":65,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 57. Saben Lee (전성기: 23세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Saben Lee',
  '{"3c":58,"3t":52,"ft":72,"age":23,"agi":85,"blk":28,"dnk":62,"dur":75,"hus":75,"lay":78,"mid":60,"piq":68,"pot":74,"siq":65,"spd":88,"sta":78,"stl":68,"str":62,"3_45":55,"dcon":55,"draw":68,"dreb":35,"hdef":55,"idef":38,"lock":50,"name":"세이벤 리","ocon":62,"oreb":22,"pacc":68,"pdef":58,"post":40,"pper":58,"pvis":65,"spwb":82,"team":"FA","vert":75,"close":72,"handl":75,"hands":65,"health":"Healthy","height":188,"salary":2.0,"weight":84,"position":"PG","intangibles":62,"contractyears":3}'::jsonb,
  '{"zones":{"ra":35,"itp":12,"mid":20,"cnr":8,"p45":12,"atb":13},"lateral_bias":2}'::jsonb
);

-- 58. Kira Lewis Jr. (전성기: 21세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kira Lewis Jr.',
  '{"3c":72,"3t":68,"ft":78,"age":21,"agi":88,"blk":25,"dnk":55,"dur":68,"hus":72,"lay":75,"mid":70,"piq":72,"pot":80,"siq":68,"spd":92,"sta":78,"stl":68,"str":55,"3_45":70,"dcon":55,"draw":65,"dreb":35,"hdef":55,"idef":35,"lock":50,"name":"키라 루이스 주니어","ocon":65,"oreb":20,"pacc":70,"pdef":58,"post":38,"pper":58,"pvis":70,"spwb":85,"team":"FA","vert":72,"close":68,"handl":78,"hands":68,"health":"Healthy","height":188,"salary":3.0,"weight":79,"position":"PG","intangibles":65,"contractyears":4}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":20,"cnr":10,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 59. Raul Neto (전성기: 27세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Raul Neto',
  '{"3c":72,"3t":68,"ft":82,"age":27,"agi":80,"blk":22,"dnk":35,"dur":78,"hus":75,"lay":72,"mid":72,"piq":75,"pot":75,"siq":75,"spd":82,"sta":78,"stl":65,"str":58,"3_45":70,"dcon":62,"draw":62,"dreb":35,"hdef":62,"idef":38,"lock":50,"name":"라울 네토","ocon":72,"oreb":18,"pacc":72,"pdef":62,"post":40,"pper":65,"pvis":72,"spwb":78,"team":"FA","vert":62,"close":68,"handl":75,"hands":72,"health":"Healthy","height":185,"salary":3.0,"weight":82,"position":"PG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":17},"lateral_bias":2}'::jsonb
);

-- 60. Brandon Knight (전성기: 24세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Brandon Knight',
  '{"3c":78,"3t":75,"ft":82,"age":24,"agi":82,"blk":25,"dnk":55,"dur":65,"hus":75,"lay":78,"mid":78,"piq":75,"pot":80,"siq":75,"spd":82,"sta":78,"stl":65,"str":65,"3_45":76,"dcon":58,"draw":72,"dreb":38,"hdef":55,"idef":38,"lock":50,"name":"브랜든 나이트","ocon":72,"oreb":22,"pacc":72,"pdef":58,"post":45,"pper":60,"pvis":72,"spwb":78,"team":"FA","vert":72,"close":75,"handl":80,"hands":72,"health":"Healthy","height":190,"salary":6.0,"weight":86,"position":"PG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 61. Tyler Johnson (전성기: 25세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tyler Johnson',
  '{"3c":72,"3t":68,"ft":78,"age":25,"agi":82,"blk":35,"dnk":60,"dur":75,"hus":80,"lay":78,"mid":72,"piq":72,"pot":78,"siq":72,"spd":82,"sta":80,"stl":72,"str":68,"3_45":70,"dcon":68,"draw":68,"dreb":42,"hdef":68,"idef":42,"lock":50,"name":"타일러 존슨","ocon":70,"oreb":25,"pacc":68,"pdef":68,"post":45,"pper":68,"pvis":68,"spwb":78,"team":"FA","vert":78,"close":75,"handl":75,"hands":72,"health":"Healthy","height":193,"salary":5.0,"weight":84,"position":"PG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":10,"p45":14,"atb":14},"lateral_bias":2}'::jsonb
);
