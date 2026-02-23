-- =============================================
-- NBA-GM-SIM: Historical SG Players Insert
-- Total: 65 Players
-- Format: Legacy base_attributes structure
-- =============================================

-- 1. Michael Jordan (전성기: 28세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Michael Jordan',
  '{"3c":82,"3t":78,"ft":85,"age":28,"agi":95,"blk":55,"dnk":97,"dur":85,"hus":99,"lay":97,"mid":95,"piq":88,"pot":99,"siq":99,"spd":95,"sta":95,"stl":95,"str":82,"3_45":80,"dcon":95,"draw":90,"dreb":60,"hdef":90,"idef":55,"lock":50,"name":"마이클 조던","ocon":98,"oreb":42,"pacc":82,"pdef":92,"post":90,"pper":92,"pvis":85,"spwb":95,"team":"FA","vert":97,"close":97,"handl":92,"hands":90,"health":"Healthy","height":198,"salary":35.0,"weight":98,"position":"SG","intangibles":99,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":28,"cnr":5,"p45":12,"atb":15},"lateral_bias":2}'::jsonb
);

-- 2. Kobe Bryant (전성기: 28세, 2006-07)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kobe Bryant',
  '{"3c":82,"3t":80,"ft":85,"age":28,"agi":92,"blk":52,"dnk":90,"dur":80,"hus":97,"lay":95,"mid":95,"piq":85,"pot":98,"siq":97,"spd":90,"sta":92,"stl":82,"str":80,"3_45":80,"dcon":90,"draw":85,"dreb":55,"hdef":85,"idef":50,"lock":50,"name":"코비 브라이언트","ocon":95,"oreb":38,"pacc":80,"pdef":88,"post":92,"pper":85,"pvis":82,"spwb":90,"team":"FA","vert":90,"close":95,"handl":92,"hands":88,"health":"Healthy","height":198,"salary":33.0,"weight":96,"position":"SG","intangibles":99,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":30,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 3. Dwyane Wade (전성기: 27세, 2008-09)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Dwyane Wade',
  '{"3c":72,"3t":68,"ft":78,"age":27,"agi":92,"blk":65,"dnk":92,"dur":72,"hus":95,"lay":95,"mid":82,"piq":88,"pot":96,"siq":90,"spd":92,"sta":90,"stl":85,"str":80,"3_45":70,"dcon":85,"draw":92,"dreb":52,"hdef":82,"idef":58,"lock":50,"name":"드웨인 웨이드","ocon":90,"oreb":42,"pacc":85,"pdef":82,"post":78,"pper":85,"pvis":88,"spwb":92,"team":"FA","vert":92,"close":95,"handl":88,"hands":85,"health":"Healthy","height":193,"salary":28.0,"weight":100,"position":"SG","intangibles":97,"contractyears":3}'::jsonb,
  '{"zones":{"ra":38,"itp":12,"mid":22,"cnr":5,"p45":10,"atb":13},"lateral_bias":2}'::jsonb
);

-- 4. Clyde Drexler (전성기: 28세, 1990-91)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Clyde Drexler',
  '{"3c":78,"3t":75,"ft":80,"age":28,"agi":90,"blk":52,"dnk":92,"dur":82,"hus":88,"lay":92,"mid":80,"piq":85,"pot":95,"siq":85,"spd":90,"sta":88,"stl":82,"str":78,"3_45":76,"dcon":80,"draw":82,"dreb":65,"hdef":78,"idef":52,"lock":50,"name":"클라이드 드렉슬러","ocon":85,"oreb":48,"pacc":82,"pdef":78,"post":72,"pper":80,"pvis":85,"spwb":88,"team":"FA","vert":95,"close":90,"handl":85,"hands":85,"health":"Healthy","height":198,"salary":24.0,"weight":100,"position":"SG","intangibles":90,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":2}'::jsonb
);

-- 5. Allen Iverson (전성기: 26세, 2000-01 MVP)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Allen Iverson',
  '{"3c":78,"3t":76,"ft":81,"age":26,"agi":97,"blk":25,"dnk":72,"dur":70,"hus":95,"lay":92,"mid":82,"piq":78,"pot":95,"siq":82,"spd":96,"sta":90,"stl":88,"str":55,"3_45":76,"dcon":68,"draw":85,"dreb":40,"hdef":65,"idef":30,"lock":50,"name":"앨런 아이버슨","ocon":82,"oreb":30,"pacc":78,"pdef":72,"post":52,"pper":72,"pvis":82,"spwb":95,"team":"FA","vert":82,"close":90,"handl":97,"hands":80,"health":"Healthy","height":183,"salary":26.0,"weight":75,"position":"SG","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":10,"mid":25,"cnr":6,"p45":12,"atb":15},"lateral_bias":2}'::jsonb
);

-- 6. Ray Allen (전성기: 30세, 2005-06)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Ray Allen',
  '{"3c":97,"3t":95,"ft":90,"age":30,"agi":82,"blk":28,"dnk":72,"dur":85,"hus":85,"lay":85,"mid":90,"piq":80,"pot":93,"siq":92,"spd":82,"sta":88,"stl":68,"str":68,"3_45":96,"dcon":78,"draw":72,"dreb":45,"hdef":72,"idef":42,"lock":50,"name":"레이 알렌","ocon":90,"oreb":25,"pacc":72,"pdef":72,"post":55,"pper":72,"pvis":72,"spwb":80,"team":"FA","vert":78,"close":85,"handl":78,"hands":82,"health":"Healthy","height":196,"salary":22.0,"weight":93,"position":"SG","intangibles":90,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":5,"mid":18,"cnr":15,"p45":20,"atb":22},"lateral_bias":2}'::jsonb
);

-- 7. Reggie Miller (전성기: 28세, 1993-94)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Reggie Miller',
  '{"3c":95,"3t":94,"ft":90,"age":28,"agi":82,"blk":22,"dnk":55,"dur":88,"hus":88,"lay":80,"mid":88,"piq":78,"pot":93,"siq":92,"spd":82,"sta":88,"stl":68,"str":62,"3_45":94,"dcon":78,"draw":82,"dreb":40,"hdef":72,"idef":38,"lock":50,"name":"레지 밀러","ocon":90,"oreb":22,"pacc":72,"pdef":72,"post":55,"pper":72,"pvis":72,"spwb":78,"team":"FA","vert":72,"close":82,"handl":75,"hands":82,"health":"Healthy","height":201,"salary":22.0,"weight":88,"position":"SG","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":5,"mid":20,"cnr":15,"p45":18,"atb":24},"lateral_bias":2}'::jsonb
);

-- 8. George Gervin (전성기: 28세, 1979-80)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'George Gervin',
  '{"3c":78,"3t":72,"ft":85,"age":28,"agi":85,"blk":42,"dnk":80,"dur":82,"hus":80,"lay":92,"mid":95,"piq":80,"pot":95,"siq":92,"spd":85,"sta":85,"stl":72,"str":68,"3_45":75,"dcon":72,"draw":82,"dreb":45,"hdef":68,"idef":45,"lock":50,"name":"조지 거빈","ocon":92,"oreb":35,"pacc":75,"pdef":68,"post":82,"pper":70,"pvis":78,"spwb":82,"team":"FA","vert":85,"close":95,"handl":82,"hands":88,"health":"Healthy","height":201,"salary":24.0,"weight":84,"position":"SG","intangibles":88,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":12,"mid":32,"cnr":5,"p45":10,"atb":13},"lateral_bias":2}'::jsonb
);

-- 9. Tracy McGrady (전성기: 24세, 2002-03)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tracy McGrady',
  '{"3c":82,"3t":80,"ft":80,"age":24,"agi":90,"blk":55,"dnk":88,"dur":60,"hus":82,"lay":92,"mid":90,"piq":85,"pot":97,"siq":90,"spd":90,"sta":85,"stl":78,"str":75,"3_45":80,"dcon":78,"draw":82,"dreb":60,"hdef":78,"idef":52,"lock":50,"name":"트레이시 맥그레이디","ocon":88,"oreb":38,"pacc":82,"pdef":78,"post":80,"pper":78,"pvis":85,"spwb":90,"team":"FA","vert":90,"close":92,"handl":88,"hands":85,"health":"Healthy","height":203,"salary":28.0,"weight":100,"position":"SG","intangibles":90,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 10. Vince Carter (전성기: 24세, 2000-01)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Vince Carter',
  '{"3c":82,"3t":80,"ft":80,"age":24,"agi":88,"blk":52,"dnk":99,"dur":78,"hus":82,"lay":90,"mid":82,"piq":78,"pot":95,"siq":82,"spd":90,"sta":85,"stl":72,"str":78,"3_45":80,"dcon":75,"draw":78,"dreb":52,"hdef":72,"idef":48,"lock":50,"name":"빈스 카터","ocon":82,"oreb":35,"pacc":75,"pdef":72,"post":72,"pper":72,"pvis":78,"spwb":88,"team":"FA","vert":99,"close":90,"handl":82,"hands":82,"health":"Healthy","height":198,"salary":22.0,"weight":100,"position":"SG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":8,"mid":22,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 11. Mitch Richmond (전성기: 27세, 1994-95)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Mitch Richmond',
  '{"3c":85,"3t":82,"ft":85,"age":27,"agi":80,"blk":28,"dnk":72,"dur":85,"hus":85,"lay":85,"mid":88,"piq":80,"pot":92,"siq":88,"spd":80,"sta":85,"stl":72,"str":78,"3_45":84,"dcon":78,"draw":78,"dreb":42,"hdef":72,"idef":48,"lock":50,"name":"미치 리치먼드","ocon":88,"oreb":28,"pacc":75,"pdef":75,"post":72,"pper":72,"pvis":75,"spwb":78,"team":"FA","vert":75,"close":88,"handl":80,"hands":82,"health":"Healthy","height":196,"salary":18.0,"weight":100,"position":"SG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":28,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 12. Anfernee Hardaway (전성기: 24세, 1995-96)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Anfernee Hardaway',
  '{"3c":78,"3t":75,"ft":78,"age":24,"agi":90,"blk":52,"dnk":85,"dur":60,"hus":85,"lay":90,"mid":80,"piq":90,"pot":95,"siq":85,"spd":90,"sta":85,"stl":82,"str":72,"3_45":76,"dcon":78,"draw":78,"dreb":52,"hdef":78,"idef":55,"lock":50,"name":"앤퍼니 하더웨이","ocon":85,"oreb":35,"pacc":88,"pdef":82,"post":72,"pper":82,"pvis":90,"spwb":90,"team":"FA","vert":88,"close":88,"handl":90,"hands":85,"health":"Healthy","height":201,"salary":22.0,"weight":95,"position":"SG","intangibles":88,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 13. Manu Ginobili (전성기: 28세, 2005-06)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Manu Ginobili',
  '{"3c":82,"3t":80,"ft":82,"age":28,"agi":85,"blk":35,"dnk":78,"dur":72,"hus":92,"lay":88,"mid":82,"piq":88,"pot":90,"siq":88,"spd":82,"sta":82,"stl":82,"str":68,"3_45":80,"dcon":80,"draw":88,"dreb":48,"hdef":78,"idef":48,"lock":50,"name":"마누 지노빌리","ocon":82,"oreb":30,"pacc":85,"pdef":78,"post":62,"pper":80,"pvis":88,"spwb":82,"team":"FA","vert":78,"close":88,"handl":85,"hands":85,"health":"Healthy","height":198,"salary":18.0,"weight":93,"position":"SG","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":16},"lateral_bias":0}'::jsonb
);

-- 14. Victor Oladipo (전성기: 25세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Victor Oladipo',
  '{"3c":80,"3t":78,"ft":78,"age":25,"agi":88,"blk":42,"dnk":82,"dur":60,"hus":90,"lay":85,"mid":78,"piq":80,"pot":90,"siq":82,"spd":90,"sta":85,"stl":90,"str":72,"3_45":78,"dcon":82,"draw":78,"dreb":48,"hdef":82,"idef":48,"lock":50,"name":"빅터 올라디포","ocon":82,"oreb":30,"pacc":78,"pdef":85,"post":55,"pper":85,"pvis":78,"spwb":88,"team":"FA","vert":88,"close":85,"handl":85,"hands":82,"health":"Healthy","height":193,"salary":18.0,"weight":95,"position":"SG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 15. Eddie Jones (전성기: 27세, 1998-99)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Eddie Jones',
  '{"3c":82,"3t":78,"ft":82,"age":27,"agi":85,"blk":38,"dnk":75,"dur":80,"hus":85,"lay":82,"mid":80,"piq":78,"pot":88,"siq":82,"spd":85,"sta":85,"stl":90,"str":68,"3_45":80,"dcon":82,"draw":72,"dreb":42,"hdef":80,"idef":45,"lock":50,"name":"에디 존스","ocon":82,"oreb":25,"pacc":75,"pdef":85,"post":55,"pper":82,"pvis":75,"spwb":82,"team":"FA","vert":80,"close":84,"handl":80,"hands":82,"health":"Healthy","height":198,"salary":14.0,"weight":91,"position":"SG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 16. Rolando Blackman (전성기: 27세, 1986-87)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Rolando Blackman',
  '{"3c":78,"3t":75,"ft":85,"age":27,"agi":80,"blk":28,"dnk":65,"dur":85,"hus":82,"lay":85,"mid":90,"piq":78,"pot":89,"siq":88,"spd":80,"sta":85,"stl":68,"str":72,"3_45":76,"dcon":80,"draw":78,"dreb":42,"hdef":72,"idef":45,"lock":50,"name":"롤란도 블랙먼","ocon":88,"oreb":28,"pacc":72,"pdef":72,"post":72,"pper":72,"pvis":72,"spwb":78,"team":"FA","vert":72,"close":88,"handl":80,"hands":82,"health":"Healthy","height":198,"salary":14.0,"weight":86,"position":"SG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":30,"cnr":5,"p45":12,"atb":18},"lateral_bias":2}'::jsonb
);

-- 17. Kendall Gill (전성기: 26세, 1996-97)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kendall Gill',
  '{"3c":72,"3t":68,"ft":78,"age":26,"agi":85,"blk":42,"dnk":80,"dur":78,"hus":82,"lay":85,"mid":78,"piq":78,"pot":86,"siq":78,"spd":85,"sta":82,"stl":82,"str":72,"3_45":70,"dcon":75,"draw":75,"dreb":48,"hdef":75,"idef":48,"lock":50,"name":"켄달 길","ocon":78,"oreb":32,"pacc":75,"pdef":78,"post":62,"pper":78,"pvis":75,"spwb":82,"team":"FA","vert":85,"close":85,"handl":80,"hands":78,"health":"Healthy","height":196,"salary":10.0,"weight":93,"position":"SG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":25,"cnr":5,"p45":12,"atb":16},"lateral_bias":2}'::jsonb
);

-- 18. Ron Harper (전성기: 26세, 1989-90)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Ron Harper',
  '{"3c":72,"3t":68,"ft":75,"age":26,"agi":85,"blk":45,"dnk":82,"dur":78,"hus":88,"lay":85,"mid":78,"piq":82,"pot":88,"siq":80,"spd":88,"sta":85,"stl":85,"str":78,"3_45":70,"dcon":82,"draw":75,"dreb":52,"hdef":82,"idef":55,"lock":50,"name":"론 하퍼","ocon":80,"oreb":35,"pacc":78,"pdef":82,"post":65,"pper":82,"pvis":80,"spwb":85,"team":"FA","vert":85,"close":85,"handl":80,"hands":82,"health":"Healthy","height":198,"salary":12.0,"weight":100,"position":"SG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":5,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 19. Larry Hughes (전성기: 26세, 2004-05)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Larry Hughes',
  '{"3c":72,"3t":68,"ft":75,"age":26,"agi":85,"blk":42,"dnk":78,"dur":72,"hus":82,"lay":85,"mid":75,"piq":75,"pot":86,"siq":75,"spd":88,"sta":82,"stl":88,"str":75,"3_45":70,"dcon":72,"draw":78,"dreb":48,"hdef":78,"idef":48,"lock":50,"name":"래리 휴즈","ocon":75,"oreb":32,"pacc":72,"pdef":80,"post":55,"pper":78,"pvis":72,"spwb":85,"team":"FA","vert":82,"close":84,"handl":82,"hands":78,"health":"Healthy","height":196,"salary":12.0,"weight":84,"position":"SG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":14},"lateral_bias":2}'::jsonb
);

-- 20. Brandon Roy (전성기: 25세, 2008-09)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Brandon Roy',
  '{"3c":82,"3t":78,"ft":82,"age":25,"agi":82,"blk":32,"dnk":68,"dur":50,"hus":88,"lay":88,"mid":90,"piq":88,"pot":94,"siq":92,"spd":82,"sta":80,"stl":72,"str":72,"3_45":80,"dcon":78,"draw":82,"dreb":48,"hdef":75,"idef":48,"lock":50,"name":"브랜든 로이","ocon":90,"oreb":28,"pacc":85,"pdef":75,"post":68,"pper":78,"pvis":85,"spwb":80,"team":"FA","vert":75,"close":90,"handl":88,"hands":85,"health":"Healthy","height":198,"salary":20.0,"weight":98,"position":"SG","intangibles":92,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":30,"cnr":8,"p45":12,"atb":15},"lateral_bias":2}'::jsonb
);

-- 21. Monta Ellis (전성기: 25세, 2010-11)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Monta Ellis',
  '{"3c":72,"3t":70,"ft":78,"age":25,"agi":90,"blk":28,"dnk":72,"dur":82,"hus":80,"lay":90,"mid":80,"piq":78,"pot":87,"siq":78,"spd":92,"sta":85,"stl":80,"str":62,"3_45":70,"dcon":65,"draw":80,"dreb":38,"hdef":62,"idef":38,"lock":50,"name":"몬타 엘리스","ocon":78,"oreb":28,"pacc":75,"pdef":65,"post":52,"pper":65,"pvis":78,"spwb":92,"team":"FA","vert":82,"close":88,"handl":88,"hands":80,"health":"Healthy","height":190,"salary":12.0,"weight":82,"position":"SG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":35,"itp":12,"mid":22,"cnr":5,"p45":12,"atb":14},"lateral_bias":2}'::jsonb
);

-- 22. Jerry Stackhouse (전성기: 27세, 2000-01)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jerry Stackhouse',
  '{"3c":78,"3t":75,"ft":82,"age":27,"agi":82,"blk":28,"dnk":82,"dur":78,"hus":82,"lay":85,"mid":82,"piq":75,"pot":88,"siq":80,"spd":82,"sta":82,"stl":68,"str":78,"3_45":76,"dcon":72,"draw":88,"dreb":42,"hdef":68,"idef":45,"lock":50,"name":"제리 스택하우스","ocon":80,"oreb":28,"pacc":72,"pdef":68,"post":68,"pper":68,"pvis":72,"spwb":80,"team":"FA","vert":82,"close":85,"handl":82,"hands":78,"health":"Healthy","height":198,"salary":14.0,"weight":100,"position":"SG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 23. Doug Christie (전성기: 30세, 2002-03)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Doug Christie',
  '{"3c":78,"3t":75,"ft":78,"age":30,"agi":80,"blk":38,"dnk":60,"dur":78,"hus":88,"lay":78,"mid":78,"piq":82,"pot":84,"siq":80,"spd":80,"sta":82,"stl":88,"str":72,"3_45":76,"dcon":85,"draw":68,"dreb":48,"hdef":85,"idef":52,"lock":50,"name":"더그 크리스티","ocon":78,"oreb":28,"pacc":78,"pdef":88,"post":55,"pper":85,"pvis":78,"spwb":78,"team":"FA","vert":72,"close":78,"handl":78,"hands":80,"health":"Healthy","height":198,"salary":10.0,"weight":93,"position":"SG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 24. Jamal Crawford (전성기: 29세, 2009-10)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jamal Crawford',
  '{"3c":82,"3t":80,"ft":88,"age":29,"agi":85,"blk":20,"dnk":65,"dur":88,"hus":72,"lay":85,"mid":85,"piq":78,"pot":85,"siq":82,"spd":82,"sta":78,"stl":65,"str":55,"3_45":80,"dcon":55,"draw":82,"dreb":32,"hdef":52,"idef":28,"lock":50,"name":"자말 크로포드","ocon":78,"oreb":18,"pacc":78,"pdef":55,"post":45,"pper":58,"pvis":80,"spwb":82,"team":"FA","vert":72,"close":85,"handl":92,"hands":82,"health":"Healthy","height":196,"salary":10.0,"weight":84,"position":"SG","intangibles":80,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":8,"p45":14,"atb":20},"lateral_bias":2}'::jsonb
);

-- 25. J.R. Smith (전성기: 27세, 2012-13)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'J.R. Smith',
  '{"3c":85,"3t":84,"ft":72,"age":27,"agi":82,"blk":35,"dnk":82,"dur":78,"hus":72,"lay":80,"mid":78,"piq":68,"pot":85,"siq":72,"spd":82,"sta":80,"stl":72,"str":68,"3_45":84,"dcon":65,"draw":68,"dreb":38,"hdef":65,"idef":40,"lock":50,"name":"J.R. 스미스","ocon":70,"oreb":22,"pacc":68,"pdef":68,"post":48,"pper":65,"pvis":72,"spwb":80,"team":"FA","vert":85,"close":82,"handl":78,"hands":75,"health":"Healthy","height":198,"salary":8.0,"weight":100,"position":"SG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":18,"cnr":12,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 26. Kyle Korver (전성기: 33세, 2014-15)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kyle Korver',
  '{"3c":95,"3t":93,"ft":90,"age":33,"agi":72,"blk":25,"dnk":40,"dur":82,"hus":82,"lay":68,"mid":88,"piq":78,"pot":82,"siq":90,"spd":72,"sta":78,"stl":62,"str":62,"3_45":94,"dcon":72,"draw":58,"dreb":38,"hdef":72,"idef":38,"lock":50,"name":"카일 코버","ocon":88,"oreb":15,"pacc":72,"pdef":68,"post":38,"pper":72,"pvis":72,"spwb":70,"team":"FA","vert":62,"close":72,"handl":68,"hands":78,"health":"Healthy","height":201,"salary":8.0,"weight":96,"position":"SG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":12,"itp":3,"mid":15,"cnr":18,"p45":22,"atb":30},"lateral_bias":2}'::jsonb
);

-- 27. Dan Majerle (전성기: 28세, 1993-94)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Dan Majerle',
  '{"3c":85,"3t":82,"ft":80,"age":28,"agi":78,"blk":35,"dnk":72,"dur":82,"hus":90,"lay":78,"mid":80,"piq":75,"pot":86,"siq":80,"spd":78,"sta":85,"stl":72,"str":78,"3_45":84,"dcon":82,"draw":72,"dreb":48,"hdef":80,"idef":50,"lock":50,"name":"댄 마젤리","ocon":80,"oreb":32,"pacc":72,"pdef":82,"post":55,"pper":78,"pvis":72,"spwb":75,"team":"FA","vert":80,"close":80,"handl":72,"hands":78,"health":"Healthy","height":198,"salary":10.0,"weight":98,"position":"SG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":20,"cnr":12,"p45":16,"atb":22},"lateral_bias":2}'::jsonb
);

-- 28. Jeff Hornacek (전성기: 29세, 1991-92)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jeff Hornacek',
  '{"3c":85,"3t":82,"ft":88,"age":29,"agi":78,"blk":22,"dnk":42,"dur":82,"hus":85,"lay":80,"mid":85,"piq":82,"pot":87,"siq":88,"spd":78,"sta":82,"stl":72,"str":65,"3_45":84,"dcon":78,"draw":72,"dreb":42,"hdef":75,"idef":42,"lock":50,"name":"제프 호나세크","ocon":85,"oreb":22,"pacc":80,"pdef":75,"post":52,"pper":75,"pvis":80,"spwb":75,"team":"FA","vert":65,"close":82,"handl":78,"hands":82,"health":"Healthy","height":193,"salary":10.0,"weight":86,"position":"SG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 29. Raja Bell (전성기: 29세, 2005-06)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Raja Bell',
  '{"3c":84,"3t":80,"ft":82,"age":29,"agi":78,"blk":22,"dnk":48,"dur":78,"hus":90,"lay":72,"mid":78,"piq":75,"pot":82,"siq":80,"spd":78,"sta":82,"stl":72,"str":72,"3_45":82,"dcon":85,"draw":68,"dreb":38,"hdef":80,"idef":45,"lock":50,"name":"라자 벨","ocon":78,"oreb":22,"pacc":68,"pdef":85,"post":45,"pper":78,"pvis":68,"spwb":75,"team":"FA","vert":68,"close":75,"handl":72,"hands":75,"health":"Healthy","height":196,"salary":6.0,"weight":95,"position":"SG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":5,"mid":20,"cnr":15,"p45":18,"atb":24},"lateral_bias":2}'::jsonb
);

-- 30. Avery Bradley (전성기: 25세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Avery Bradley',
  '{"3c":78,"3t":75,"ft":78,"age":25,"agi":85,"blk":25,"dnk":55,"dur":75,"hus":88,"lay":78,"mid":78,"piq":72,"pot":82,"siq":78,"spd":85,"sta":82,"stl":78,"str":68,"3_45":76,"dcon":85,"draw":65,"dreb":38,"hdef":85,"idef":42,"lock":50,"name":"에이버리 브래들리","ocon":75,"oreb":25,"pacc":68,"pdef":88,"post":42,"pper":82,"pvis":65,"spwb":82,"team":"FA","vert":72,"close":78,"handl":75,"hands":72,"health":"Healthy","height":188,"salary":8.0,"weight":82,"position":"SG","intangibles":80,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":8,"mid":25,"cnr":10,"p45":14,"atb":15},"lateral_bias":2}'::jsonb
);

-- 31. Patrick Beverley (전성기: 28세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Patrick Beverley',
  '{"3c":78,"3t":75,"ft":82,"age":28,"agi":78,"blk":25,"dnk":42,"dur":72,"hus":95,"lay":72,"mid":72,"piq":78,"pot":80,"siq":78,"spd":78,"sta":85,"stl":82,"str":72,"3_45":76,"dcon":85,"draw":68,"dreb":48,"hdef":85,"idef":45,"lock":50,"name":"패트릭 베벌리","ocon":72,"oreb":30,"pacc":72,"pdef":85,"post":42,"pper":82,"pvis":72,"spwb":75,"team":"FA","vert":68,"close":72,"handl":72,"hands":75,"health":"Healthy","height":185,"salary":6.0,"weight":82,"position":"SG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":22,"cnr":12,"p45":16,"atb":23},"lateral_bias":2}'::jsonb
);

-- 32. Josh Richardson (전성기: 25세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Josh Richardson',
  '{"3c":78,"3t":75,"ft":82,"age":25,"agi":82,"blk":38,"dnk":62,"dur":75,"hus":82,"lay":78,"mid":75,"piq":75,"pot":82,"siq":78,"spd":82,"sta":80,"stl":75,"str":68,"3_45":76,"dcon":78,"draw":72,"dreb":42,"hdef":78,"idef":48,"lock":50,"name":"조시 리처드슨","ocon":75,"oreb":22,"pacc":72,"pdef":80,"post":48,"pper":78,"pvis":72,"spwb":78,"team":"FA","vert":78,"close":78,"handl":78,"hands":75,"health":"Healthy","height":198,"salary":8.0,"weight":91,"position":"SG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 33. Jason Terry (전성기: 31세, 2008-09)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jason Terry',
  '{"3c":88,"3t":85,"ft":85,"age":31,"agi":78,"blk":18,"dnk":48,"dur":88,"hus":78,"lay":78,"mid":82,"piq":82,"pot":85,"siq":85,"spd":78,"sta":82,"stl":72,"str":58,"3_45":86,"dcon":72,"draw":72,"dreb":35,"hdef":68,"idef":35,"lock":50,"name":"제이슨 테리","ocon":82,"oreb":18,"pacc":78,"pdef":68,"post":42,"pper":72,"pvis":80,"spwb":78,"team":"FA","vert":62,"close":80,"handl":80,"hands":80,"health":"Healthy","height":188,"salary":8.0,"weight":82,"position":"SG","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":22,"cnr":12,"p45":16,"atb":23},"lateral_bias":2}'::jsonb
);

-- 34. Garrett Temple (전성기: 30세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Garrett Temple',
  '{"3c":75,"3t":72,"ft":80,"age":30,"agi":75,"blk":28,"dnk":45,"dur":80,"hus":82,"lay":72,"mid":72,"piq":78,"pot":76,"siq":78,"spd":75,"sta":80,"stl":72,"str":68,"3_45":73,"dcon":78,"draw":62,"dreb":40,"hdef":78,"idef":45,"lock":50,"name":"가렛 템플","ocon":72,"oreb":22,"pacc":72,"pdef":78,"post":42,"pper":75,"pvis":72,"spwb":72,"team":"FA","vert":65,"close":72,"handl":72,"hands":75,"health":"Healthy","height":198,"salary":4.0,"weight":88,"position":"SG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 35. Lonnie Walker IV (전성기: 23세, 2021-22)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Lonnie Walker IV',
  '{"3c":76,"3t":74,"ft":78,"age":23,"agi":85,"blk":28,"dnk":78,"dur":75,"hus":75,"lay":80,"mid":75,"piq":70,"pot":82,"siq":72,"spd":88,"sta":78,"stl":68,"str":62,"3_45":74,"dcon":62,"draw":72,"dreb":35,"hdef":62,"idef":38,"lock":50,"name":"로니 워커 IV","ocon":72,"oreb":20,"pacc":68,"pdef":65,"post":42,"pper":62,"pvis":68,"spwb":85,"team":"FA","vert":88,"close":80,"handl":78,"hands":72,"health":"Healthy","height":193,"salary":5.0,"weight":93,"position":"SG","intangibles":70,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":8,"mid":20,"cnr":10,"p45":15,"atb":19},"lateral_bias":2}'::jsonb
);

-- 36. Steve Smith (전성기: 27세, 1996-97)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Steve Smith',
  '{"3c":82,"3t":78,"ft":82,"age":27,"agi":80,"blk":28,"dnk":65,"dur":78,"hus":82,"lay":82,"mid":82,"piq":80,"pot":87,"siq":82,"spd":80,"sta":82,"stl":72,"str":72,"3_45":80,"dcon":78,"draw":75,"dreb":42,"hdef":75,"idef":45,"lock":50,"name":"스티브 스미스","ocon":82,"oreb":25,"pacc":78,"pdef":75,"post":58,"pper":75,"pvis":78,"spwb":78,"team":"FA","vert":72,"close":84,"handl":80,"hands":82,"health":"Healthy","height":203,"salary":12.0,"weight":100,"position":"SG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 37. Terrence Ross (전성기: 26세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Terrence Ross',
  '{"3c":80,"3t":78,"ft":78,"age":26,"agi":82,"blk":30,"dnk":82,"dur":78,"hus":72,"lay":78,"mid":75,"piq":70,"pot":82,"siq":72,"spd":82,"sta":78,"stl":68,"str":62,"3_45":78,"dcon":62,"draw":68,"dreb":38,"hdef":62,"idef":38,"lock":50,"name":"테렌스 로스","ocon":72,"oreb":22,"pacc":68,"pdef":65,"post":42,"pper":62,"pvis":68,"spwb":80,"team":"FA","vert":85,"close":80,"handl":78,"hands":72,"health":"Healthy","height":198,"salary":8.0,"weight":93,"position":"SG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":18,"cnr":12,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 38. Evan Fournier (전성기: 26세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Evan Fournier',
  '{"3c":82,"3t":78,"ft":82,"age":26,"agi":78,"blk":22,"dnk":55,"dur":78,"hus":75,"lay":78,"mid":80,"piq":75,"pot":82,"siq":78,"spd":78,"sta":78,"stl":65,"str":65,"3_45":80,"dcon":65,"draw":72,"dreb":38,"hdef":62,"idef":38,"lock":50,"name":"에반 포니에","ocon":78,"oreb":20,"pacc":72,"pdef":65,"post":48,"pper":65,"pvis":75,"spwb":78,"team":"FA","vert":68,"close":80,"handl":80,"hands":78,"health":"Healthy","height":201,"salary":10.0,"weight":93,"position":"SG","intangibles":75,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":22,"cnr":10,"p45":16,"atb":22},"lateral_bias":2}'::jsonb
);

-- 39. Chris Duarte (전성기: 24세, 2021-22)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Chris Duarte',
  '{"3c":80,"3t":76,"ft":82,"age":24,"agi":78,"blk":22,"dnk":55,"dur":75,"hus":78,"lay":75,"mid":78,"piq":72,"pot":80,"siq":78,"spd":78,"sta":78,"stl":68,"str":68,"3_45":78,"dcon":72,"draw":68,"dreb":38,"hdef":72,"idef":42,"lock":50,"name":"크리스 두아르테","ocon":75,"oreb":20,"pacc":70,"pdef":72,"post":42,"pper":70,"pvis":68,"spwb":75,"team":"FA","vert":72,"close":78,"handl":75,"hands":72,"health":"Healthy","height":198,"salary":4.0,"weight":86,"position":"SG","intangibles":72,"contractyears":4}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":22,"cnr":12,"p45":16,"atb":20},"lateral_bias":2}'::jsonb
);

-- 40. Jarrett Culver (전성기: 22세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jarrett Culver',
  '{"3c":62,"3t":58,"ft":72,"age":22,"agi":75,"blk":32,"dnk":60,"dur":72,"hus":72,"lay":72,"mid":65,"piq":68,"pot":78,"siq":65,"spd":78,"sta":75,"stl":68,"str":68,"3_45":60,"dcon":68,"draw":65,"dreb":42,"hdef":72,"idef":48,"lock":50,"name":"자렛 컬버","ocon":62,"oreb":25,"pacc":65,"pdef":72,"post":48,"pper":68,"pvis":65,"spwb":75,"team":"FA","vert":72,"close":72,"handl":72,"hands":68,"health":"Healthy","height":198,"salary":3.0,"weight":88,"position":"SG","intangibles":65,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":12,"mid":25,"cnr":8,"p45":12,"atb":15},"lateral_bias":2}'::jsonb
);

-- 41. P.J. Dozier (전성기: 24세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'P.J. Dozier',
  '{"3c":70,"3t":65,"ft":75,"age":24,"agi":80,"blk":35,"dnk":65,"dur":68,"hus":75,"lay":78,"mid":68,"piq":72,"pot":76,"siq":70,"spd":82,"sta":78,"stl":72,"str":72,"3_45":68,"dcon":65,"draw":68,"dreb":42,"hdef":72,"idef":48,"lock":50,"name":"P.J. 도지에","ocon":68,"oreb":25,"pacc":72,"pdef":72,"post":48,"pper":72,"pvis":72,"spwb":80,"team":"FA","vert":78,"close":78,"handl":75,"hands":72,"health":"Healthy","height":198,"salary":3.0,"weight":93,"position":"SG","intangibles":70,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":16},"lateral_bias":2}'::jsonb
);

-- 42. Matt Thomas (전성기: 26세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Matt Thomas',
  '{"3c":88,"3t":85,"ft":85,"age":26,"agi":68,"blk":15,"dnk":30,"dur":75,"hus":72,"lay":62,"mid":80,"piq":68,"pot":74,"siq":80,"spd":68,"sta":72,"stl":55,"str":55,"3_45":86,"dcon":58,"draw":55,"dreb":28,"hdef":55,"idef":30,"lock":50,"name":"맷 토마스","ocon":75,"oreb":12,"pacc":65,"pdef":55,"post":32,"pper":55,"pvis":65,"spwb":65,"team":"FA","vert":52,"close":65,"handl":65,"hands":70,"health":"Healthy","height":193,"salary":2.0,"weight":86,"position":"SG","intangibles":65,"contractyears":3}'::jsonb,
  '{"zones":{"ra":12,"itp":3,"mid":18,"cnr":18,"p45":22,"atb":27},"lateral_bias":2}'::jsonb
);

-- 43. Terence Davis (전성기: 23세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Terence Davis',
  '{"3c":75,"3t":72,"ft":78,"age":23,"agi":80,"blk":28,"dnk":68,"dur":72,"hus":75,"lay":78,"mid":72,"piq":68,"pot":78,"siq":72,"spd":82,"sta":78,"stl":68,"str":68,"3_45":73,"dcon":62,"draw":68,"dreb":38,"hdef":65,"idef":42,"lock":50,"name":"테렌스 데이비스","ocon":70,"oreb":22,"pacc":65,"pdef":65,"post":42,"pper":62,"pvis":65,"spwb":80,"team":"FA","vert":82,"close":78,"handl":75,"hands":72,"health":"Healthy","height":193,"salary":3.0,"weight":91,"position":"SG","intangibles":68,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":8,"mid":20,"cnr":10,"p45":14,"atb":20},"lateral_bias":2}'::jsonb
);

-- 44. Langston Galloway (전성기: 26세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Langston Galloway',
  '{"3c":78,"3t":75,"ft":80,"age":26,"agi":78,"blk":22,"dnk":48,"dur":78,"hus":78,"lay":72,"mid":72,"piq":72,"pot":76,"siq":75,"spd":78,"sta":78,"stl":68,"str":62,"3_45":76,"dcon":70,"draw":62,"dreb":35,"hdef":70,"idef":38,"lock":50,"name":"랭스턴 갤러웨이","ocon":72,"oreb":18,"pacc":68,"pdef":72,"post":38,"pper":68,"pvis":68,"spwb":75,"team":"FA","vert":68,"close":72,"handl":72,"hands":72,"health":"Healthy","height":188,"salary":3.0,"weight":82,"position":"SG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":22,"cnr":12,"p45":16,"atb":23},"lateral_bias":2}'::jsonb
);

-- 45. Romeo Langford (전성기: 22세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Romeo Langford',
  '{"3c":68,"3t":65,"ft":72,"age":22,"agi":78,"blk":28,"dnk":62,"dur":65,"hus":72,"lay":75,"mid":68,"piq":68,"pot":78,"siq":68,"spd":80,"sta":75,"stl":68,"str":68,"3_45":66,"dcon":68,"draw":68,"dreb":38,"hdef":72,"idef":45,"lock":50,"name":"로미오 랭포드","ocon":65,"oreb":22,"pacc":65,"pdef":72,"post":45,"pper":68,"pvis":65,"spwb":78,"team":"FA","vert":78,"close":75,"handl":72,"hands":68,"health":"Healthy","height":198,"salary":3.0,"weight":93,"position":"SG","intangibles":65,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":8,"p45":14,"atb":15},"lateral_bias":2}'::jsonb
);

-- 46. Frank Ntilikina (전성기: 23세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Frank Ntilikina',
  '{"3c":70,"3t":65,"ft":72,"age":23,"agi":78,"blk":32,"dnk":48,"dur":72,"hus":78,"lay":68,"mid":65,"piq":75,"pot":78,"siq":70,"spd":78,"sta":78,"stl":72,"str":62,"3_45":68,"dcon":75,"draw":60,"dreb":38,"hdef":78,"idef":48,"lock":50,"name":"프랭크 은틸리키나","ocon":65,"oreb":20,"pacc":72,"pdef":78,"post":42,"pper":75,"pvis":72,"spwb":75,"team":"FA","vert":72,"close":68,"handl":72,"hands":72,"health":"Healthy","height":196,"salary":3.0,"weight":86,"position":"SG","intangibles":70,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 47. Nik Stauskas (전성기: 24세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Nik Stauskas',
  '{"3c":80,"3t":78,"ft":82,"age":24,"agi":72,"blk":18,"dnk":35,"dur":75,"hus":70,"lay":68,"mid":75,"piq":68,"pot":76,"siq":75,"spd":72,"sta":75,"stl":58,"str":55,"3_45":78,"dcon":58,"draw":58,"dreb":30,"hdef":55,"idef":32,"lock":50,"name":"닉 스타우스카스","ocon":70,"oreb":15,"pacc":65,"pdef":55,"post":35,"pper":55,"pvis":68,"spwb":70,"team":"FA","vert":58,"close":68,"handl":72,"hands":70,"health":"Healthy","height":198,"salary":2.0,"weight":93,"position":"SG","intangibles":65,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":5,"mid":20,"cnr":14,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 48. Denzel Valentine (전성기: 24세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Denzel Valentine',
  '{"3c":78,"3t":75,"ft":78,"age":24,"agi":68,"blk":18,"dnk":38,"dur":68,"hus":72,"lay":68,"mid":72,"piq":75,"pot":76,"siq":72,"spd":68,"sta":72,"stl":62,"str":62,"3_45":76,"dcon":60,"draw":62,"dreb":40,"hdef":60,"idef":38,"lock":50,"name":"덴젤 발렌타인","ocon":68,"oreb":22,"pacc":75,"pdef":60,"post":42,"pper":62,"pvis":78,"spwb":68,"team":"FA","vert":58,"close":70,"handl":72,"hands":72,"health":"Healthy","height":196,"salary":2.0,"weight":93,"position":"SG","intangibles":68,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":5,"mid":22,"cnr":12,"p45":18,"atb":23},"lateral_bias":2}'::jsonb
);

-- 49. Carsen Edwards (전성기: 23세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Carsen Edwards',
  '{"3c":78,"3t":78,"ft":80,"age":23,"agi":78,"blk":18,"dnk":42,"dur":72,"hus":75,"lay":68,"mid":72,"piq":65,"pot":75,"siq":68,"spd":80,"sta":75,"stl":62,"str":55,"3_45":76,"dcon":55,"draw":68,"dreb":28,"hdef":55,"idef":28,"lock":50,"name":"카슨 에드워즈","ocon":65,"oreb":15,"pacc":62,"pdef":55,"post":32,"pper":55,"pvis":62,"spwb":78,"team":"FA","vert":72,"close":70,"handl":78,"hands":65,"health":"Healthy","height":180,"salary":2.0,"weight":82,"position":"SG","intangibles":65,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":18,"cnr":12,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 50. Talen Horton-Tucker (전성기: 22세, 2021-22)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Talen Horton-Tucker',
  '{"3c":65,"3t":62,"ft":72,"age":22,"agi":78,"blk":35,"dnk":68,"dur":72,"hus":75,"lay":80,"mid":68,"piq":72,"pot":80,"siq":68,"spd":80,"sta":78,"stl":72,"str":72,"3_45":63,"dcon":65,"draw":75,"dreb":42,"hdef":68,"idef":48,"lock":50,"name":"탈렌 호턴-터커","ocon":65,"oreb":28,"pacc":72,"pdef":68,"post":52,"pper":68,"pvis":72,"spwb":78,"team":"FA","vert":78,"close":80,"handl":78,"hands":72,"health":"Healthy","height":193,"salary":5.0,"weight":98,"position":"SG","intangibles":68,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":22,"cnr":5,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 51. C.J. Miles (전성기: 28세, 2014-15)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'C.J. Miles',
  '{"3c":82,"3t":80,"ft":80,"age":28,"agi":78,"blk":22,"dnk":65,"dur":78,"hus":72,"lay":75,"mid":78,"piq":70,"pot":80,"siq":75,"spd":78,"sta":78,"stl":62,"str":65,"3_45":80,"dcon":62,"draw":65,"dreb":35,"hdef":62,"idef":38,"lock":50,"name":"C.J. 마일스","ocon":72,"oreb":18,"pacc":65,"pdef":62,"post":42,"pper":62,"pvis":65,"spwb":75,"team":"FA","vert":78,"close":78,"handl":72,"hands":72,"health":"Healthy","height":198,"salary":5.0,"weight":100,"position":"SG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":5,"mid":18,"cnr":12,"p45":18,"atb":27},"lateral_bias":2}'::jsonb
);

-- 52. Johnny Davis (전성기: 22세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Johnny Davis',
  '{"3c":65,"3t":62,"ft":75,"age":22,"agi":78,"blk":28,"dnk":62,"dur":75,"hus":78,"lay":75,"mid":70,"piq":68,"pot":80,"siq":68,"spd":78,"sta":78,"stl":68,"str":72,"3_45":63,"dcon":68,"draw":72,"dreb":42,"hdef":72,"idef":48,"lock":50,"name":"조니 데이비스","ocon":65,"oreb":25,"pacc":68,"pdef":72,"post":50,"pper":68,"pvis":68,"spwb":75,"team":"FA","vert":75,"close":75,"handl":72,"hands":72,"health":"Healthy","height":196,"salary":3.0,"weight":88,"position":"SG","intangibles":68,"contractyears":4}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":25,"cnr":5,"p45":12,"atb":16},"lateral_bias":2}'::jsonb
);

-- 53. Furkan Korkmaz (전성기: 24세, 2021-22)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Furkan Korkmaz',
  '{"3c":82,"3t":78,"ft":80,"age":24,"agi":75,"blk":18,"dnk":42,"dur":75,"hus":72,"lay":72,"mid":75,"piq":68,"pot":78,"siq":75,"spd":75,"sta":75,"stl":58,"str":55,"3_45":80,"dcon":60,"draw":60,"dreb":32,"hdef":58,"idef":32,"lock":50,"name":"푸르칸 코르크마즈","ocon":72,"oreb":15,"pacc":65,"pdef":58,"post":35,"pper":58,"pvis":68,"spwb":72,"team":"FA","vert":65,"close":72,"handl":72,"hands":72,"health":"Healthy","height":201,"salary":4.0,"weight":91,"position":"SG","intangibles":68,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":5,"mid":20,"cnr":14,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 54. Rodney McGruder (전성기: 28세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Rodney McGruder',
  '{"3c":72,"3t":68,"ft":75,"age":28,"agi":75,"blk":22,"dnk":48,"dur":75,"hus":78,"lay":72,"mid":70,"piq":72,"pot":74,"siq":72,"spd":75,"sta":78,"stl":68,"str":68,"3_45":70,"dcon":72,"draw":62,"dreb":38,"hdef":72,"idef":45,"lock":50,"name":"로드니 맥그루더","ocon":70,"oreb":22,"pacc":68,"pdef":72,"post":42,"pper":70,"pvis":68,"spwb":72,"team":"FA","vert":68,"close":72,"handl":70,"hands":72,"health":"Healthy","height":193,"salary":2.0,"weight":88,"position":"SG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 55. Wayne Ellington (전성기: 29세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Wayne Ellington',
  '{"3c":88,"3t":85,"ft":82,"age":29,"agi":72,"blk":18,"dnk":38,"dur":78,"hus":75,"lay":68,"mid":78,"piq":70,"pot":78,"siq":78,"spd":72,"sta":75,"stl":58,"str":55,"3_45":86,"dcon":62,"draw":58,"dreb":30,"hdef":58,"idef":32,"lock":50,"name":"웨인 엘링턴","ocon":75,"oreb":12,"pacc":62,"pdef":58,"post":35,"pper":58,"pvis":65,"spwb":70,"team":"FA","vert":58,"close":70,"handl":68,"hands":72,"health":"Healthy","height":193,"salary":4.0,"weight":91,"position":"SG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":14,"itp":3,"mid":16,"cnr":18,"p45":22,"atb":27},"lateral_bias":2}'::jsonb
);

-- 56. Tony Snell (전성기: 26세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tony Snell',
  '{"3c":80,"3t":78,"ft":80,"age":26,"agi":75,"blk":22,"dnk":48,"dur":80,"hus":72,"lay":68,"mid":72,"piq":70,"pot":76,"siq":75,"spd":75,"sta":78,"stl":62,"str":62,"3_45":78,"dcon":68,"draw":55,"dreb":35,"hdef":68,"idef":38,"lock":50,"name":"토니 스넬","ocon":72,"oreb":15,"pacc":62,"pdef":68,"post":35,"pper":65,"pvis":65,"spwb":72,"team":"FA","vert":68,"close":68,"handl":68,"hands":72,"health":"Healthy","height":201,"salary":4.0,"weight":95,"position":"SG","intangibles":68,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":3,"mid":18,"cnr":16,"p45":20,"atb":25},"lateral_bias":2}'::jsonb
);

-- 57. Damion Lee (전성기: 28세, 2020-21)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Damion Lee',
  '{"3c":78,"3t":75,"ft":82,"age":28,"agi":75,"blk":22,"dnk":48,"dur":72,"hus":78,"lay":72,"mid":72,"piq":72,"pot":76,"siq":75,"spd":75,"sta":78,"stl":65,"str":65,"3_45":76,"dcon":68,"draw":65,"dreb":38,"hdef":68,"idef":40,"lock":50,"name":"데이미언 리","ocon":72,"oreb":20,"pacc":68,"pdef":68,"post":40,"pper":68,"pvis":68,"spwb":72,"team":"FA","vert":68,"close":72,"handl":70,"hands":72,"health":"Healthy","height":198,"salary":3.0,"weight":95,"position":"SG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":5,"mid":22,"cnr":12,"p45":16,"atb":23},"lateral_bias":2}'::jsonb
);

-- 58. Keon Johnson (전성기: 21세)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Keon Johnson',
  '{"3c":62,"3t":58,"ft":72,"age":21,"agi":85,"blk":32,"dnk":78,"dur":72,"hus":78,"lay":75,"mid":62,"piq":65,"pot":82,"siq":62,"spd":88,"sta":78,"stl":72,"str":65,"3_45":60,"dcon":62,"draw":68,"dreb":35,"hdef":68,"idef":42,"lock":50,"name":"키온 존슨","ocon":60,"oreb":22,"pacc":62,"pdef":68,"post":42,"pper":65,"pvis":62,"spwb":85,"team":"FA","vert":92,"close":75,"handl":72,"hands":65,"health":"Healthy","height":196,"salary":3.0,"weight":84,"position":"SG","intangibles":65,"contractyears":4}'::jsonb,
  '{"zones":{"ra":35,"itp":12,"mid":20,"cnr":5,"p45":12,"atb":16},"lateral_bias":2}'::jsonb
);

-- 59. Patty Mills (전성기: 30세, 2014-15)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Patty Mills',
  '{"3c":85,"3t":82,"ft":85,"age":30,"agi":80,"blk":15,"dnk":35,"dur":78,"hus":85,"lay":72,"mid":78,"piq":78,"pot":80,"siq":82,"spd":80,"sta":82,"stl":65,"str":52,"3_45":84,"dcon":68,"draw":65,"dreb":28,"hdef":62,"idef":28,"lock":50,"name":"패티 밀스","ocon":80,"oreb":15,"pacc":75,"pdef":62,"post":32,"pper":62,"pvis":78,"spwb":78,"team":"FA","vert":58,"close":72,"handl":78,"hands":78,"health":"Healthy","height":183,"salary":5.0,"weight":82,"position":"SG","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":5,"mid":18,"cnr":14,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 60. Austin Rivers (전성기: 25세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Austin Rivers',
  '{"3c":75,"3t":72,"ft":78,"age":25,"agi":80,"blk":22,"dnk":60,"dur":72,"hus":78,"lay":78,"mid":72,"piq":72,"pot":78,"siq":72,"spd":82,"sta":78,"stl":68,"str":62,"3_45":73,"dcon":65,"draw":72,"dreb":35,"hdef":65,"idef":38,"lock":50,"name":"오스틴 리버스","ocon":70,"oreb":18,"pacc":68,"pdef":68,"post":42,"pper":65,"pvis":68,"spwb":80,"team":"FA","vert":75,"close":78,"handl":78,"hands":72,"health":"Healthy","height":193,"salary":5.0,"weight":91,"position":"SG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":8,"mid":22,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 61. Tomas Satoransky (전성기: 27세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tomas Satoransky',
  '{"3c":72,"3t":68,"ft":78,"age":27,"agi":75,"blk":28,"dnk":48,"dur":78,"hus":78,"lay":75,"mid":72,"piq":80,"pot":78,"siq":78,"spd":75,"sta":80,"stl":72,"str":72,"3_45":70,"dcon":75,"draw":62,"dreb":42,"hdef":75,"idef":48,"lock":50,"name":"토마스 사토란스키","ocon":75,"oreb":22,"pacc":78,"pdef":75,"post":48,"pper":75,"pvis":80,"spwb":72,"team":"FA","vert":68,"close":75,"handl":75,"hands":78,"health":"Healthy","height":201,"salary":5.0,"weight":95,"position":"SG","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":28,"cnr":8,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 62. Bryn Forbes (전성기: 26세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Bryn Forbes',
  '{"3c":85,"3t":82,"ft":85,"age":26,"agi":72,"blk":15,"dnk":30,"dur":78,"hus":72,"lay":68,"mid":78,"piq":70,"pot":76,"siq":78,"spd":72,"sta":75,"stl":55,"str":52,"3_45":84,"dcon":55,"draw":55,"dreb":28,"hdef":52,"idef":28,"lock":50,"name":"브린 포브스","ocon":75,"oreb":12,"pacc":65,"pdef":52,"post":32,"pper":52,"pvis":68,"spwb":70,"team":"FA","vert":55,"close":68,"handl":72,"hands":70,"health":"Healthy","height":190,"salary":3.0,"weight":84,"position":"SG","intangibles":68,"contractyears":3}'::jsonb,
  '{"zones":{"ra":15,"itp":3,"mid":18,"cnr":16,"p45":20,"atb":28},"lateral_bias":2}'::jsonb
);

-- 63. Ben McLemore (전성기: 25세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Ben McLemore',
  '{"3c":80,"3t":78,"ft":78,"age":25,"agi":80,"blk":22,"dnk":72,"dur":72,"hus":72,"lay":75,"mid":72,"piq":65,"pot":80,"siq":70,"spd":82,"sta":78,"stl":62,"str":62,"3_45":78,"dcon":60,"draw":62,"dreb":32,"hdef":60,"idef":35,"lock":50,"name":"벤 맥클레모어","ocon":68,"oreb":18,"pacc":62,"pdef":60,"post":38,"pper":58,"pvis":62,"spwb":80,"team":"FA","vert":85,"close":75,"handl":72,"hands":70,"health":"Healthy","height":196,"salary":3.0,"weight":88,"position":"SG","intangibles":65,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":5,"mid":18,"cnr":14,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 64. Lance Stephenson (전성기: 24세, 2013-14)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Lance Stephenson',
  '{"3c":68,"3t":65,"ft":72,"age":24,"agi":78,"blk":28,"dnk":72,"dur":78,"hus":82,"lay":82,"mid":72,"piq":78,"pot":82,"siq":72,"spd":78,"sta":82,"stl":78,"str":78,"3_45":66,"dcon":72,"draw":75,"dreb":55,"hdef":72,"idef":48,"lock":50,"name":"랜스 스티븐슨","ocon":72,"oreb":35,"pacc":78,"pdef":72,"post":58,"pper":72,"pvis":80,"spwb":78,"team":"FA","vert":78,"close":82,"handl":80,"hands":80,"health":"Healthy","height":196,"salary":6.0,"weight":104,"position":"SG","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":25,"cnr":5,"p45":12,"atb":16},"lateral_bias":2}'::jsonb
);

-- 65. Isaiah Joe (전성기: 23세, 2022-23)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Isaiah Joe',
  '{"3c":82,"3t":80,"ft":82,"age":23,"agi":75,"blk":18,"dnk":38,"dur":75,"hus":75,"lay":68,"mid":75,"piq":70,"pot":78,"siq":78,"spd":75,"sta":75,"stl":65,"str":55,"3_45":80,"dcon":62,"draw":58,"dreb":30,"hdef":62,"idef":32,"lock":50,"name":"이사야 조","ocon":72,"oreb":15,"pacc":65,"pdef":62,"post":32,"pper":62,"pvis":68,"spwb":72,"team":"FA","vert":65,"close":68,"handl":70,"hands":72,"health":"Healthy","height":193,"salary":2.0,"weight":82,"position":"SG","intangibles":68,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":3,"mid":18,"cnr":16,"p45":20,"atb":25},"lateral_bias":2}'::jsonb
);

-- 66. John Konchar (전성기: 26세, 2022-23)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'John Konchar',
  '{"3c":75,"3t":72,"ft":78,"age":26,"agi":75,"blk":22,"dnk":52,"dur":78,"hus":85,"lay":72,"mid":68,"piq":72,"pot":76,"siq":72,"spd":75,"sta":82,"stl":72,"str":68,"3_45":73,"dcon":72,"draw":62,"dreb":48,"hdef":75,"idef":45,"lock":50,"name":"존 콘차","ocon":70,"oreb":32,"pacc":68,"pdef":72,"post":42,"pper":72,"pvis":72,"spwb":72,"team":"FA","vert":72,"close":72,"handl":68,"hands":75,"health":"Healthy","height":196,"salary":3.0,"weight":93,"position":"SG","intangibles":75,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":22,"cnr":12,"p45":15,"atb":18},"lateral_bias":2}'::jsonb
);

-- 67. Shake Milton (전성기: 25세, 2020-21)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Shake Milton',
  '{"3c":78,"3t":75,"ft":82,"age":25,"agi":78,"blk":22,"dnk":48,"dur":75,"hus":72,"lay":75,"mid":78,"piq":72,"pot":78,"siq":75,"spd":78,"sta":78,"stl":62,"str":62,"3_45":76,"dcon":62,"draw":68,"dreb":35,"hdef":62,"idef":38,"lock":50,"name":"셰이크 밀턴","ocon":72,"oreb":18,"pacc":72,"pdef":62,"post":42,"pper":62,"pvis":72,"spwb":78,"team":"FA","vert":68,"close":78,"handl":78,"hands":72,"health":"Healthy","height":198,"salary":4.0,"weight":91,"position":"SG","intangibles":70,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":25,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);
