-- =============================================
-- NBA-GM-SIM: Historical SF Players Insert
-- Total: 55 Players
-- Format: Legacy base_attributes structure
-- =============================================

-- 1. LeBron James (전성기: 28세, 2012-13 MVP)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'LeBron James',
  '{"3c":78,"3t":75,"ft":74,"age":28,"agi":90,"blk":60,"dnk":95,"dur":97,"hus":95,"lay":97,"mid":78,"piq":99,"pot":99,"siq":99,"spd":90,"sta":97,"stl":80,"str":92,"3_45":76,"dcon":88,"draw":88,"dreb":72,"hdef":85,"idef":65,"lock":50,"name":"르브론 제임스","ocon":95,"oreb":42,"pacc":95,"pdef":82,"post":90,"pper":90,"pvis":97,"spwb":92,"team":"FA","vert":92,"close":95,"handl":88,"hands":88,"health":"Healthy","height":206,"salary":38.0,"weight":113,"position":"SF","intangibles":99,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":12,"mid":18,"cnr":8,"p45":12,"atb":18},"lateral_bias":2}'::jsonb
);

-- 2. Larry Bird (전성기: 29세, 1985-86)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Larry Bird',
  '{"3c":92,"3t":88,"ft":90,"age":29,"agi":68,"blk":55,"dnk":52,"dur":65,"hus":95,"lay":88,"mid":92,"piq":99,"pot":98,"siq":99,"spd":68,"sta":82,"stl":78,"str":82,"3_45":90,"dcon":88,"draw":82,"dreb":88,"hdef":82,"idef":68,"lock":50,"name":"래리 버드","ocon":95,"oreb":55,"pacc":92,"pdef":78,"post":92,"pper":88,"pvis":97,"spwb":90,"team":"FA","vert":62,"close":92,"handl":82,"hands":92,"health":"Healthy","height":206,"salary":32.0,"weight":100,"position":"SF","intangibles":99,"contractyears":3}'::jsonb,
  '{"zones":{"ra":15,"itp":8,"mid":28,"cnr":12,"p45":15,"atb":22},"lateral_bias":2}'::jsonb
);

-- 3. Kevin Durant (전성기: 25세, 2013-14 MVP)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kevin Durant',
  '{"3c":88,"3t":85,"ft":88,"age":25,"agi":82,"blk":72,"dnk":82,"dur":75,"hus":85,"lay":90,"mid":95,"piq":85,"pot":98,"siq":90,"spd":82,"sta":85,"stl":72,"str":68,"3_45":86,"dcon":80,"draw":82,"dreb":68,"hdef":75,"idef":72,"lock":50,"name":"케빈 듀란트","ocon":90,"oreb":30,"pacc":82,"pdef":75,"post":85,"pper":82,"pvis":82,"spwb":88,"team":"FA","vert":80,"close":92,"handl":88,"hands":85,"health":"Healthy","height":211,"salary":35.0,"weight":109,"position":"SF","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":8,"mid":28,"cnr":10,"p45":15,"atb":21},"lateral_bias":2}'::jsonb
);

-- 4. Julius Erving (전성기: 27세, 1980-81)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Julius Erving',
  '{"3c":62,"3t":58,"ft":78,"age":27,"agi":92,"blk":68,"dnk":97,"dur":82,"hus":90,"lay":95,"mid":78,"piq":88,"pot":97,"siq":90,"spd":88,"sta":88,"stl":80,"str":78,"3_45":60,"dcon":82,"draw":82,"dreb":72,"hdef":80,"idef":62,"lock":50,"name":"줄리어스 어빙","ocon":88,"oreb":55,"pacc":82,"pdef":78,"post":85,"pper":82,"pvis":88,"spwb":90,"team":"FA","vert":97,"close":92,"handl":85,"hands":88,"health":"Healthy","height":201,"salary":28.0,"weight":95,"position":"SF","intangibles":97,"contractyears":3}'::jsonb,
  '{"zones":{"ra":38,"itp":15,"mid":20,"cnr":4,"p45":8,"atb":15},"lateral_bias":2}'::jsonb
);

-- 5. Scottie Pippen (전성기: 27세, 1993-94)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Scottie Pippen',
  '{"3c":75,"3t":72,"ft":72,"age":27,"agi":88,"blk":62,"dnk":85,"dur":80,"hus":92,"lay":90,"mid":78,"piq":90,"pot":95,"siq":88,"spd":88,"sta":90,"stl":88,"str":75,"3_45":73,"dcon":92,"draw":78,"dreb":72,"hdef":92,"idef":65,"lock":50,"name":"스코티 피펜","ocon":85,"oreb":48,"pacc":88,"pdef":95,"post":72,"pper":85,"pvis":90,"spwb":85,"team":"FA","vert":85,"close":88,"handl":85,"hands":88,"health":"Healthy","height":203,"salary":25.0,"weight":101,"position":"SF","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":18},"lateral_bias":2}'::jsonb
);

-- 6. Kawhi Leonard (전성기: 26세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Kawhi Leonard',
  '{"3c":85,"3t":82,"ft":88,"age":26,"agi":82,"blk":58,"dnk":80,"dur":62,"hus":92,"lay":88,"mid":90,"piq":88,"pot":97,"siq":88,"spd":80,"sta":82,"stl":90,"str":82,"3_45":84,"dcon":95,"draw":78,"dreb":68,"hdef":95,"idef":62,"lock":50,"name":"카와이 레너드","ocon":88,"oreb":38,"pacc":78,"pdef":95,"post":78,"pper":82,"pvis":75,"spwb":85,"team":"FA","vert":78,"close":90,"handl":82,"hands":95,"health":"Healthy","height":201,"salary":32.0,"weight":102,"position":"SF","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":28,"cnr":10,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 7. Carmelo Anthony (전성기: 28세, 2012-13)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Carmelo Anthony',
  '{"3c":82,"3t":78,"ft":82,"age":28,"agi":78,"blk":40,"dnk":80,"dur":78,"hus":75,"lay":85,"mid":92,"piq":72,"pot":95,"siq":82,"spd":78,"sta":82,"stl":62,"str":82,"3_45":80,"dcon":68,"draw":80,"dreb":68,"hdef":62,"idef":55,"lock":50,"name":"카멜로 앤서니","ocon":82,"oreb":48,"pacc":72,"pdef":60,"post":90,"pper":78,"pvis":72,"spwb":88,"team":"FA","vert":78,"close":92,"handl":85,"hands":82,"health":"Healthy","height":201,"salary":26.0,"weight":106,"position":"SF","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":10,"mid":30,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 8. Paul Pierce (전성기: 28세, 2005-06)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Paul Pierce',
  '{"3c":85,"3t":82,"ft":85,"age":28,"agi":72,"blk":35,"dnk":62,"dur":80,"hus":85,"lay":82,"mid":88,"piq":82,"pot":93,"siq":90,"spd":72,"sta":82,"stl":72,"str":82,"3_45":83,"dcon":78,"draw":85,"dreb":62,"hdef":72,"idef":52,"lock":50,"name":"폴 피어스","ocon":85,"oreb":35,"pacc":78,"pdef":72,"post":85,"pper":80,"pvis":82,"spwb":85,"team":"FA","vert":68,"close":90,"handl":82,"hands":85,"health":"Healthy","height":201,"salary":24.0,"weight":106,"position":"SF","intangibles":92,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":8,"mid":28,"cnr":10,"p45":14,"atb":20},"lateral_bias":2}'::jsonb
);

-- 9. Dominique Wilkins (전성기: 28세, 1987-88)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Dominique Wilkins',
  '{"3c":75,"3t":72,"ft":81,"age":28,"agi":90,"blk":45,"dnk":99,"dur":78,"hus":85,"lay":90,"mid":85,"piq":72,"pot":96,"siq":82,"spd":88,"sta":88,"stl":72,"str":82,"3_45":73,"dcon":70,"draw":82,"dreb":60,"hdef":65,"idef":52,"lock":50,"name":"도미니크 윌킨스","ocon":78,"oreb":42,"pacc":72,"pdef":65,"post":78,"pper":75,"pvis":72,"spwb":92,"team":"FA","vert":98,"close":90,"handl":82,"hands":82,"health":"Healthy","height":203,"salary":25.0,"weight":104,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":25,"cnr":6,"p45":12,"atb":15},"lateral_bias":2}'::jsonb
);

-- 10. Elgin Baylor (전성기: 27세, 1961-62)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Elgin Baylor',
  '{"3c":55,"3t":52,"ft":80,"age":27,"agi":90,"blk":52,"dnk":90,"dur":72,"hus":92,"lay":95,"mid":85,"piq":85,"pot":96,"siq":88,"spd":85,"sta":85,"stl":75,"str":85,"3_45":53,"dcon":78,"draw":85,"dreb":85,"hdef":75,"idef":62,"lock":50,"name":"엘진 베일러","ocon":88,"oreb":72,"pacc":82,"pdef":72,"post":90,"pper":82,"pvis":85,"spwb":88,"team":"FA","vert":92,"close":92,"handl":85,"hands":85,"health":"Healthy","height":196,"salary":26.0,"weight":102,"position":"SF","intangibles":92,"contractyears":3}'::jsonb,
  '{"zones":{"ra":35,"itp":15,"mid":25,"cnr":3,"p45":8,"atb":14},"lateral_bias":2}'::jsonb
);

-- 11. Rick Barry (전성기: 28세, 1974-75)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Rick Barry',
  '{"3c":82,"3t":78,"ft":90,"age":28,"agi":80,"blk":40,"dnk":68,"dur":78,"hus":88,"lay":88,"mid":88,"piq":85,"pot":95,"siq":88,"spd":80,"sta":85,"stl":82,"str":75,"3_45":80,"dcon":82,"draw":82,"dreb":62,"hdef":78,"idef":55,"lock":50,"name":"릭 배리","ocon":88,"oreb":45,"pacc":85,"pdef":75,"post":80,"pper":82,"pvis":85,"spwb":85,"team":"FA","vert":78,"close":88,"handl":82,"hands":85,"health":"Healthy","height":201,"salary":22.0,"weight":93,"position":"SF","intangibles":88,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":10,"mid":28,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 12. James Worthy (전성기: 27세, 1987-88)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'James Worthy',
  '{"3c":55,"3t":52,"ft":78,"age":27,"agi":88,"blk":50,"dnk":88,"dur":78,"hus":85,"lay":92,"mid":78,"piq":82,"pot":92,"siq":85,"spd":88,"sta":85,"stl":72,"str":78,"3_45":53,"dcon":78,"draw":78,"dreb":58,"hdef":72,"idef":55,"lock":50,"name":"제임스 워디","ocon":85,"oreb":42,"pacc":78,"pdef":72,"post":80,"pper":78,"pvis":78,"spwb":85,"team":"FA","vert":85,"close":90,"handl":82,"hands":82,"health":"Healthy","height":206,"salary":20.0,"weight":102,"position":"SF","intangibles":88,"contractyears":3}'::jsonb,
  '{"zones":{"ra":35,"itp":15,"mid":22,"cnr":4,"p45":8,"atb":16},"lateral_bias":2}'::jsonb
);

-- 13. Tracy McGrady (전성기: 23세, 2002-03)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tracy McGrady',
  '{"3c":82,"3t":78,"ft":80,"age":23,"agi":88,"blk":60,"dnk":88,"dur":58,"hus":78,"lay":90,"mid":88,"piq":78,"pot":97,"siq":85,"spd":88,"sta":82,"stl":75,"str":78,"3_45":80,"dcon":72,"draw":78,"dreb":65,"hdef":72,"idef":60,"lock":50,"name":"트레이시 맥그레디","ocon":82,"oreb":35,"pacc":78,"pdef":72,"post":78,"pper":78,"pvis":82,"spwb":92,"team":"FA","vert":88,"close":92,"handl":88,"hands":82,"health":"Healthy","height":203,"salary":28.0,"weight":101,"position":"SF","intangibles":88,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":8,"mid":28,"cnr":8,"p45":13,"atb":18},"lateral_bias":2}'::jsonb
);

-- 14. Paul George (전성기: 28세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Paul George',
  '{"3c":85,"3t":82,"ft":85,"age":28,"agi":82,"blk":45,"dnk":78,"dur":68,"hus":85,"lay":82,"mid":85,"piq":82,"pot":94,"siq":85,"spd":82,"sta":85,"stl":82,"str":78,"3_45":83,"dcon":85,"draw":78,"dreb":62,"hdef":85,"idef":55,"lock":50,"name":"폴 조지","ocon":82,"oreb":32,"pacc":78,"pdef":88,"post":72,"pper":80,"pvis":78,"spwb":88,"team":"FA","vert":82,"close":88,"handl":82,"hands":85,"health":"Healthy","height":203,"salary":30.0,"weight":100,"position":"SF","intangibles":88,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 15. Jimmy Butler (전성기: 28세, 2017-18)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jimmy Butler',
  '{"3c":72,"3t":68,"ft":87,"age":28,"agi":80,"blk":42,"dnk":72,"dur":78,"hus":95,"lay":85,"mid":82,"piq":85,"pot":93,"siq":92,"spd":80,"sta":88,"stl":82,"str":82,"3_45":70,"dcon":90,"draw":88,"dreb":58,"hdef":88,"idef":55,"lock":50,"name":"지미 버틀러","ocon":88,"oreb":38,"pacc":78,"pdef":88,"post":78,"pper":82,"pvis":78,"spwb":82,"team":"FA","vert":75,"close":88,"handl":78,"hands":85,"health":"Healthy","height":201,"salary":28.0,"weight":104,"position":"SF","intangibles":95,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":25,"cnr":6,"p45":10,"atb":17},"lateral_bias":2}'::jsonb
);

-- 16. Grant Hill (전성기: 25세, 1996-97)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Grant Hill',
  '{"3c":72,"3t":68,"ft":78,"age":25,"agi":88,"blk":52,"dnk":85,"dur":55,"hus":88,"lay":92,"mid":82,"piq":85,"pot":96,"siq":88,"spd":88,"sta":82,"stl":78,"str":78,"3_45":70,"dcon":82,"draw":80,"dreb":65,"hdef":80,"idef":58,"lock":50,"name":"그랜트 힐","ocon":88,"oreb":42,"pacc":85,"pdef":80,"post":78,"pper":82,"pvis":88,"spwb":85,"team":"FA","vert":85,"close":90,"handl":88,"hands":88,"health":"Healthy","height":203,"salary":26.0,"weight":102,"position":"SF","intangibles":92,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":12,"mid":25,"cnr":7,"p45":12,"atb":16},"lateral_bias":2}'::jsonb
);

-- 17. Jayson Tatum (전성기: 26세, 2023-24)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jayson Tatum',
  '{"3c":85,"3t":82,"ft":83,"age":26,"agi":80,"blk":52,"dnk":82,"dur":82,"hus":85,"lay":85,"mid":85,"piq":82,"pot":96,"siq":85,"spd":80,"sta":85,"stl":72,"str":80,"3_45":83,"dcon":82,"draw":82,"dreb":68,"hdef":78,"idef":58,"lock":50,"name":"제이슨 테이텀","ocon":85,"oreb":35,"pacc":78,"pdef":78,"post":78,"pper":80,"pvis":78,"spwb":88,"team":"FA","vert":80,"close":88,"handl":85,"hands":82,"health":"Healthy","height":203,"salary":32.0,"weight":95,"position":"SF","intangibles":88,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 18. Vince Carter (전성기: 24세, 2000-01)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Vince Carter',
  '{"3c":80,"3t":78,"ft":80,"age":24,"agi":88,"blk":55,"dnk":99,"dur":78,"hus":78,"lay":88,"mid":82,"piq":75,"pot":95,"siq":78,"spd":88,"sta":82,"stl":72,"str":78,"3_45":78,"dcon":72,"draw":75,"dreb":55,"hdef":72,"idef":55,"lock":50,"name":"빈스 카터","ocon":78,"oreb":35,"pacc":72,"pdef":72,"post":68,"pper":72,"pvis":75,"spwb":92,"team":"FA","vert":99,"close":88,"handl":82,"hands":82,"health":"Healthy","height":198,"salary":25.0,"weight":100,"position":"SF","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 19. Bernard King (전성기: 28세, 1984-85)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Bernard King',
  '{"3c":62,"3t":58,"ft":82,"age":28,"agi":85,"blk":35,"dnk":85,"dur":60,"hus":82,"lay":92,"mid":88,"piq":72,"pot":94,"siq":82,"spd":85,"sta":80,"stl":68,"str":80,"3_45":60,"dcon":68,"draw":85,"dreb":52,"hdef":62,"idef":48,"lock":50,"name":"버나드 킹","ocon":78,"oreb":42,"pacc":68,"pdef":60,"post":82,"pper":72,"pvis":72,"spwb":88,"team":"FA","vert":88,"close":95,"handl":82,"hands":82,"health":"Healthy","height":201,"salary":22.0,"weight":93,"position":"SF","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":14,"mid":28,"cnr":4,"p45":8,"atb":14},"lateral_bias":2}'::jsonb
);

-- 20. Adrian Dantley (전성기: 28세, 1983-84)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Adrian Dantley',
  '{"3c":55,"3t":52,"ft":85,"age":28,"agi":78,"blk":30,"dnk":65,"dur":78,"hus":82,"lay":92,"mid":82,"piq":78,"pot":93,"siq":82,"spd":75,"sta":82,"stl":62,"str":80,"3_45":53,"dcon":72,"draw":92,"dreb":48,"hdef":60,"idef":50,"lock":50,"name":"에이드리안 댄틀리","ocon":82,"oreb":55,"pacc":72,"pdef":58,"post":88,"pper":78,"pvis":72,"spwb":82,"team":"FA","vert":72,"close":90,"handl":78,"hands":82,"health":"Healthy","height":196,"salary":20.0,"weight":95,"position":"SF","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":32,"itp":18,"mid":25,"cnr":3,"p45":8,"atb":14},"lateral_bias":2}'::jsonb
);

-- 21. Alex English (전성기: 29세, 1985-86)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Alex English',
  '{"3c":62,"3t":58,"ft":80,"age":29,"agi":80,"blk":38,"dnk":72,"dur":85,"hus":82,"lay":88,"mid":88,"piq":78,"pot":92,"siq":82,"spd":80,"sta":88,"stl":68,"str":75,"3_45":60,"dcon":72,"draw":78,"dreb":52,"hdef":65,"idef":50,"lock":50,"name":"알렉스 잉글리쉬","ocon":82,"oreb":40,"pacc":75,"pdef":62,"post":78,"pper":75,"pvis":78,"spwb":82,"team":"FA","vert":78,"close":88,"handl":80,"hands":80,"health":"Healthy","height":201,"salary":18.0,"weight":86,"position":"SF","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":12,"mid":28,"cnr":5,"p45":10,"atb":17},"lateral_bias":2}'::jsonb
);

-- 22. Chris Mullin (전성기: 28세, 1991-92)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Chris Mullin',
  '{"3c":88,"3t":85,"ft":88,"age":28,"agi":72,"blk":30,"dnk":55,"dur":78,"hus":85,"lay":85,"mid":90,"piq":82,"pot":92,"siq":85,"spd":72,"sta":82,"stl":72,"str":72,"3_45":86,"dcon":78,"draw":78,"dreb":48,"hdef":72,"idef":45,"lock":50,"name":"크리스 멀린","ocon":85,"oreb":32,"pacc":80,"pdef":68,"post":75,"pper":78,"pvis":82,"spwb":85,"team":"FA","vert":65,"close":88,"handl":82,"hands":88,"health":"Healthy","height":201,"salary":20.0,"weight":93,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":15,"itp":8,"mid":28,"cnr":12,"p45":15,"atb":22},"lateral_bias":2}'::jsonb
);

-- 23. Khris Middleton (전성기: 28세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Khris Middleton',
  '{"3c":85,"3t":82,"ft":88,"age":28,"agi":72,"blk":30,"dnk":55,"dur":65,"hus":82,"lay":80,"mid":90,"piq":80,"pot":88,"siq":85,"spd":72,"sta":78,"stl":72,"str":75,"3_45":83,"dcon":80,"draw":78,"dreb":52,"hdef":75,"idef":48,"lock":50,"name":"크리스 미들턴","ocon":82,"oreb":28,"pacc":78,"pdef":75,"post":72,"pper":78,"pvis":80,"spwb":82,"team":"FA","vert":65,"close":85,"handl":82,"hands":82,"health":"Healthy","height":201,"salary":24.0,"weight":101,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":8,"mid":28,"cnr":10,"p45":15,"atb":21},"lateral_bias":2}'::jsonb
);

-- 24. Mark Aguirre (전성기: 25세, 1983-84)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Mark Aguirre',
  '{"3c":72,"3t":68,"ft":78,"age":25,"agi":75,"blk":32,"dnk":72,"dur":75,"hus":78,"lay":85,"mid":85,"piq":72,"pot":91,"siq":78,"spd":75,"sta":80,"stl":62,"str":82,"3_45":70,"dcon":68,"draw":78,"dreb":52,"hdef":62,"idef":50,"lock":50,"name":"마크 아귀레","ocon":78,"oreb":42,"pacc":72,"pdef":58,"post":85,"pper":72,"pvis":72,"spwb":82,"team":"FA","vert":72,"close":85,"handl":78,"hands":78,"health":"Healthy","height":201,"salary":18.0,"weight":104,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":14,"mid":28,"cnr":5,"p45":10,"atb":15},"lateral_bias":2}'::jsonb
);

-- 25. Jaylen Brown (전성기: 27세, 2023-24)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Jaylen Brown',
  '{"3c":78,"3t":75,"ft":72,"age":27,"agi":85,"blk":48,"dnk":88,"dur":80,"hus":88,"lay":85,"mid":78,"piq":78,"pot":93,"siq":82,"spd":85,"sta":88,"stl":72,"str":82,"3_45":76,"dcon":82,"draw":78,"dreb":58,"hdef":82,"idef":55,"lock":50,"name":"제일런 브라운","ocon":82,"oreb":35,"pacc":72,"pdef":82,"post":72,"pper":78,"pvis":72,"spwb":85,"team":"FA","vert":88,"close":85,"handl":78,"hands":82,"health":"Healthy","height":198,"salary":30.0,"weight":101,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 26. Brandon Ingram (전성기: 26세, 2023-24)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Brandon Ingram',
  '{"3c":78,"3t":75,"ft":82,"age":26,"agi":78,"blk":52,"dnk":72,"dur":68,"hus":75,"lay":85,"mid":85,"piq":72,"pot":92,"siq":78,"spd":78,"sta":78,"stl":62,"str":68,"3_45":76,"dcon":68,"draw":78,"dreb":55,"hdef":65,"idef":52,"lock":50,"name":"브랜든 잉그램","ocon":78,"oreb":28,"pacc":72,"pdef":65,"post":72,"pper":72,"pvis":78,"spwb":82,"team":"FA","vert":75,"close":85,"handl":82,"hands":78,"health":"Healthy","height":206,"salary":25.0,"weight":86,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":30,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 27. Andrew Wiggins (전성기: 27세, 2021-22)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Andrew Wiggins',
  '{"3c":75,"3t":72,"ft":72,"age":27,"agi":82,"blk":52,"dnk":85,"dur":78,"hus":72,"lay":82,"mid":78,"piq":68,"pot":90,"siq":72,"spd":82,"sta":82,"stl":68,"str":78,"3_45":73,"dcon":72,"draw":72,"dreb":55,"hdef":75,"idef":52,"lock":50,"name":"앤드류 위긴스","ocon":72,"oreb":30,"pacc":65,"pdef":78,"post":65,"pper":68,"pvis":65,"spwb":82,"team":"FA","vert":88,"close":82,"handl":75,"hands":78,"health":"Healthy","height":201,"salary":22.0,"weight":89,"position":"SF","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":22,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 28. Rudy Gay (전성기: 27세, 2013-14)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Rudy Gay',
  '{"3c":72,"3t":68,"ft":78,"age":27,"agi":82,"blk":52,"dnk":82,"dur":75,"hus":72,"lay":82,"mid":78,"piq":68,"pot":89,"siq":72,"spd":82,"sta":80,"stl":68,"str":78,"3_45":70,"dcon":68,"draw":72,"dreb":55,"hdef":68,"idef":52,"lock":50,"name":"루디 게이","ocon":72,"oreb":32,"pacc":65,"pdef":68,"post":72,"pper":68,"pvis":68,"spwb":82,"team":"FA","vert":85,"close":82,"handl":78,"hands":78,"health":"Healthy","height":203,"salary":18.0,"weight":104,"position":"SF","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":10,"mid":25,"cnr":7,"p45":12,"atb":18},"lateral_bias":2}'::jsonb
);

-- 29. Luol Deng (전성기: 27세, 2012-13)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Luol Deng',
  '{"3c":75,"3t":72,"ft":78,"age":27,"agi":78,"blk":42,"dnk":65,"dur":72,"hus":88,"lay":78,"mid":78,"piq":78,"pot":88,"siq":82,"spd":78,"sta":85,"stl":72,"str":78,"3_45":73,"dcon":82,"draw":72,"dreb":58,"hdef":82,"idef":52,"lock":50,"name":"루올 뎅","ocon":80,"oreb":32,"pacc":72,"pdef":82,"post":72,"pper":78,"pvis":72,"spwb":78,"team":"FA","vert":72,"close":78,"handl":72,"hands":78,"health":"Healthy","height":206,"salary":16.0,"weight":100,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":25,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 30. Chet Holmgren (전성기: 22세, 2024-25)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Chet Holmgren',
  '{"3c":78,"3t":75,"ft":80,"age":22,"agi":78,"blk":88,"dnk":72,"dur":60,"hus":82,"lay":78,"mid":78,"piq":78,"pot":95,"siq":78,"spd":78,"sta":75,"stl":62,"str":58,"3_45":76,"dcon":78,"draw":68,"dreb":72,"hdef":78,"idef":82,"lock":50,"name":"쳇 홀름그렌","ocon":75,"oreb":42,"pacc":68,"pdef":78,"post":72,"pper":72,"pvis":72,"spwb":78,"team":"FA","vert":82,"close":75,"handl":72,"hands":78,"health":"Healthy","height":213,"salary":12.0,"weight":88,"position":"SF","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":8,"mid":22,"cnr":12,"p45":18,"atb":22},"lateral_bias":2}'::jsonb
);

-- 31. Harrison Barnes (전성기: 27세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Harrison Barnes',
  '{"3c":78,"3t":75,"ft":78,"age":27,"agi":75,"blk":38,"dnk":72,"dur":82,"hus":78,"lay":78,"mid":78,"piq":72,"pot":86,"siq":78,"spd":75,"sta":82,"stl":62,"str":78,"3_45":76,"dcon":75,"draw":72,"dreb":52,"hdef":72,"idef":48,"lock":50,"name":"해리슨 반스","ocon":75,"oreb":28,"pacc":68,"pdef":72,"post":72,"pper":72,"pvis":68,"spwb":78,"team":"FA","vert":72,"close":78,"handl":72,"hands":78,"health":"Healthy","height":203,"salary":18.0,"weight":102,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 32. Tobias Harris (전성기: 28세, 2020-21)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tobias Harris',
  '{"3c":78,"3t":75,"ft":82,"age":28,"agi":72,"blk":35,"dnk":68,"dur":82,"hus":78,"lay":78,"mid":82,"piq":72,"pot":87,"siq":78,"spd":72,"sta":80,"stl":62,"str":78,"3_45":76,"dcon":72,"draw":75,"dreb":55,"hdef":72,"idef":48,"lock":50,"name":"토비아스 해리스","ocon":78,"oreb":30,"pacc":68,"pdef":72,"post":78,"pper":72,"pvis":72,"spwb":78,"team":"FA","vert":68,"close":82,"handl":75,"hands":78,"health":"Healthy","height":201,"salary":20.0,"weight":102,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":10,"mid":28,"cnr":8,"p45":14,"atb":20},"lateral_bias":2}'::jsonb
);

-- 33. Bojan Bogdanovic (전성기: 30세, 2019-20)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Bojan Bogdanovic',
  '{"3c":88,"3t":85,"ft":85,"age":30,"agi":68,"blk":25,"dnk":48,"dur":75,"hus":78,"lay":78,"mid":85,"piq":72,"pot":85,"siq":78,"spd":68,"sta":78,"stl":58,"str":75,"3_45":86,"dcon":72,"draw":75,"dreb":42,"hdef":62,"idef":42,"lock":50,"name":"보얀 보그다노비치","ocon":78,"oreb":22,"pacc":68,"pdef":60,"post":72,"pper":72,"pvis":68,"spwb":82,"team":"FA","vert":62,"close":82,"handl":72,"hands":78,"health":"Healthy","height":201,"salary":16.0,"weight":100,"position":"SF","intangibles":75,"contractyears":3}'::jsonb,
  '{"zones":{"ra":15,"itp":5,"mid":25,"cnr":14,"p45":18,"atb":23},"lateral_bias":2}'::jsonb
);

-- 34. Gordon Hayward (전성기: 27세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Gordon Hayward',
  '{"3c":80,"3t":78,"ft":82,"age":27,"agi":78,"blk":38,"dnk":68,"dur":55,"hus":82,"lay":82,"mid":82,"piq":78,"pot":90,"siq":82,"spd":78,"sta":82,"stl":68,"str":78,"3_45":78,"dcon":78,"draw":78,"dreb":52,"hdef":75,"idef":50,"lock":50,"name":"고든 헤이워드","ocon":82,"oreb":28,"pacc":78,"pdef":75,"post":72,"pper":78,"pvis":78,"spwb":82,"team":"FA","vert":75,"close":82,"handl":78,"hands":82,"health":"Healthy","height":201,"salary":22.0,"weight":100,"position":"SF","intangibles":82,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 35. Michael Porter Jr. (전성기: 25세, 2023-24)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Michael Porter Jr.',
  '{"3c":85,"3t":82,"ft":80,"age":25,"agi":75,"blk":45,"dnk":72,"dur":55,"hus":68,"lay":78,"mid":80,"piq":65,"pot":92,"siq":72,"spd":75,"sta":72,"stl":55,"str":72,"3_45":83,"dcon":62,"draw":68,"dreb":65,"hdef":60,"idef":52,"lock":50,"name":"마이클 포터 주니어","ocon":68,"oreb":42,"pacc":62,"pdef":60,"post":68,"pper":65,"pvis":62,"spwb":82,"team":"FA","vert":78,"close":78,"handl":68,"hands":78,"health":"Healthy","height":208,"salary":25.0,"weight":96,"position":"SF","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":5,"mid":22,"cnr":14,"p45":18,"atb":23},"lateral_bias":2}'::jsonb
);

-- 36. Peja Stojakovic (전성기: 27세, 2003-04)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Peja Stojakovic',
  '{"3c":92,"3t":90,"ft":88,"age":27,"agi":68,"blk":28,"dnk":52,"dur":72,"hus":78,"lay":75,"mid":88,"piq":72,"pot":90,"siq":80,"spd":68,"sta":78,"stl":62,"str":72,"3_45":90,"dcon":72,"draw":72,"dreb":52,"hdef":62,"idef":42,"lock":50,"name":"페자 스토야코비치","ocon":78,"oreb":25,"pacc":72,"pdef":60,"post":68,"pper":72,"pvis":72,"spwb":85,"team":"FA","vert":65,"close":82,"handl":72,"hands":82,"health":"Healthy","height":208,"salary":18.0,"weight":104,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":12,"itp":5,"mid":22,"cnr":15,"p45":20,"atb":26},"lateral_bias":2}'::jsonb
);

-- 37. Rashard Lewis (전성기: 28세, 2007-08)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Rashard Lewis',
  '{"3c":85,"3t":82,"ft":80,"age":28,"agi":72,"blk":42,"dnk":68,"dur":78,"hus":75,"lay":78,"mid":82,"piq":72,"pot":88,"siq":78,"spd":72,"sta":80,"stl":62,"str":78,"3_45":83,"dcon":68,"draw":72,"dreb":55,"hdef":68,"idef":48,"lock":50,"name":"래샤드 루이스","ocon":75,"oreb":30,"pacc":68,"pdef":68,"post":72,"pper":72,"pvis":68,"spwb":82,"team":"FA","vert":72,"close":78,"handl":72,"hands":78,"health":"Healthy","height":208,"salary":18.0,"weight":100,"position":"SF","intangibles":75,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":5,"mid":22,"cnr":14,"p45":18,"atb":23},"lateral_bias":2}'::jsonb
);

-- 38. Shawn Marion (전성기: 27세, 2004-05)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Shawn Marion',
  '{"3c":72,"3t":68,"ft":72,"age":27,"agi":88,"blk":62,"dnk":88,"dur":82,"hus":90,"lay":85,"mid":72,"piq":78,"pot":90,"siq":82,"spd":85,"sta":88,"stl":82,"str":78,"3_45":70,"dcon":85,"draw":68,"dreb":75,"hdef":85,"idef":62,"lock":50,"name":"숀 매리언","ocon":78,"oreb":55,"pacc":68,"pdef":85,"post":62,"pper":75,"pvis":72,"spwb":80,"team":"FA","vert":90,"close":78,"handl":72,"hands":82,"health":"Healthy","height":201,"salary":18.0,"weight":99,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":20,"cnr":8,"p45":12,"atb":18},"lateral_bias":2}'::jsonb
);

-- 39. Shane Battier (전성기: 28세, 2006-07)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Shane Battier',
  '{"3c":82,"3t":78,"ft":78,"age":28,"agi":72,"blk":55,"dnk":48,"dur":82,"hus":92,"lay":68,"mid":72,"piq":88,"pot":82,"siq":88,"spd":72,"sta":82,"stl":72,"str":78,"3_45":80,"dcon":90,"draw":65,"dreb":55,"hdef":88,"idef":55,"lock":50,"name":"셰인 배티어","ocon":82,"oreb":28,"pacc":68,"pdef":88,"post":62,"pper":78,"pvis":72,"spwb":75,"team":"FA","vert":68,"close":68,"handl":65,"hands":82,"health":"Healthy","height":203,"salary":10.0,"weight":100,"position":"SF","intangibles":92,"contractyears":3}'::jsonb,
  '{"zones":{"ra":12,"itp":5,"mid":18,"cnr":18,"p45":20,"atb":27},"lateral_bias":2}'::jsonb
);

-- 40. Ron Artest / Metta World Peace (전성기: 24세, 2003-04 DPOY)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Ron Artest',
  '{"3c":72,"3t":68,"ft":72,"age":24,"agi":78,"blk":42,"dnk":68,"dur":78,"hus":95,"lay":78,"mid":78,"piq":82,"pot":89,"siq":82,"spd":78,"sta":88,"stl":85,"str":88,"3_45":70,"dcon":92,"draw":72,"dreb":58,"hdef":92,"idef":55,"lock":50,"name":"론 아테스트","ocon":78,"oreb":42,"pacc":65,"pdef":95,"post":78,"pper":80,"pvis":68,"spwb":78,"team":"FA","vert":75,"close":78,"handl":72,"hands":78,"health":"Healthy","height":201,"salary":14.0,"weight":118,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":12,"mid":25,"cnr":8,"p45":12,"atb":18},"lateral_bias":2}'::jsonb
);

-- 41. Tayshaun Prince (전성기: 26세, 2005-06)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Tayshaun Prince',
  '{"3c":72,"3t":68,"ft":78,"age":26,"agi":75,"blk":55,"dnk":62,"dur":82,"hus":85,"lay":78,"mid":75,"piq":82,"pot":84,"siq":82,"spd":75,"sta":82,"stl":72,"str":72,"3_45":70,"dcon":85,"draw":68,"dreb":52,"hdef":85,"idef":55,"lock":50,"name":"테이션 프린스","ocon":78,"oreb":25,"pacc":68,"pdef":85,"post":65,"pper":78,"pvis":72,"spwb":72,"team":"FA","vert":72,"close":75,"handl":72,"hands":78,"health":"Healthy","height":206,"salary":12.0,"weight":96,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 42. Danny Granger (전성기: 26세, 2008-09)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Danny Granger',
  '{"3c":82,"3t":78,"ft":82,"age":26,"agi":78,"blk":48,"dnk":72,"dur":58,"hus":82,"lay":78,"mid":82,"piq":72,"pot":89,"siq":78,"spd":78,"sta":78,"stl":72,"str":78,"3_45":80,"dcon":75,"draw":78,"dreb":52,"hdef":75,"idef":48,"lock":50,"name":"대니 그레인저","ocon":78,"oreb":28,"pacc":72,"pdef":75,"post":72,"pper":72,"pvis":72,"spwb":85,"team":"FA","vert":78,"close":82,"handl":75,"hands":78,"health":"Healthy","height":203,"salary":16.0,"weight":101,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":25,"cnr":10,"p45":15,"atb":20},"lateral_bias":2}'::jsonb
);

-- 43. Trevor Ariza (전성기: 28세, 2013-14)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Trevor Ariza',
  '{"3c":78,"3t":75,"ft":72,"age":28,"agi":78,"blk":42,"dnk":65,"dur":82,"hus":82,"lay":72,"mid":72,"piq":78,"pot":82,"siq":78,"spd":78,"sta":82,"stl":78,"str":75,"3_45":76,"dcon":82,"draw":65,"dreb":52,"hdef":82,"idef":48,"lock":50,"name":"트레버 아리자","ocon":75,"oreb":25,"pacc":65,"pdef":82,"post":58,"pper":72,"pvis":68,"spwb":75,"team":"FA","vert":75,"close":72,"handl":68,"hands":78,"health":"Healthy","height":203,"salary":12.0,"weight":96,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":5,"mid":20,"cnr":14,"p45":18,"atb":25},"lateral_bias":2}'::jsonb
);

-- 44. Wilson Chandler (전성기: 27세, 2013-14)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Wilson Chandler',
  '{"3c":72,"3t":68,"ft":75,"age":27,"agi":78,"blk":38,"dnk":72,"dur":68,"hus":75,"lay":78,"mid":78,"piq":68,"pot":83,"siq":72,"spd":78,"sta":78,"stl":62,"str":78,"3_45":70,"dcon":68,"draw":68,"dreb":52,"hdef":68,"idef":48,"lock":50,"name":"윌슨 챈들러","ocon":72,"oreb":32,"pacc":65,"pdef":68,"post":72,"pper":68,"pvis":68,"spwb":78,"team":"FA","vert":78,"close":78,"handl":72,"hands":75,"health":"Healthy","height":201,"salary":11.0,"weight":102,"position":"SF","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":25,"cnr":8,"p45":14,"atb":18},"lateral_bias":2}'::jsonb
);

-- 45. Danilo Gallinari (전성기: 28세, 2016-17)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Danilo Gallinari',
  '{"3c":82,"3t":78,"ft":88,"age":28,"agi":68,"blk":32,"dnk":52,"dur":55,"hus":75,"lay":78,"mid":82,"piq":72,"pot":87,"siq":78,"spd":68,"sta":75,"stl":55,"str":75,"3_45":80,"dcon":68,"draw":82,"dreb":48,"hdef":60,"idef":42,"lock":50,"name":"다닐로 갈리나리","ocon":75,"oreb":25,"pacc":72,"pdef":58,"post":72,"pper":72,"pvis":72,"spwb":82,"team":"FA","vert":65,"close":82,"handl":72,"hands":78,"health":"Healthy","height":208,"salary":16.0,"weight":104,"position":"SF","intangibles":75,"contractyears":3}'::jsonb,
  '{"zones":{"ra":15,"itp":8,"mid":25,"cnr":12,"p45":18,"atb":22},"lateral_bias":2}'::jsonb
);

-- 46. Nicolas Batum (전성기: 27세, 2015-16)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Nicolas Batum',
  '{"3c":78,"3t":75,"ft":78,"age":27,"agi":75,"blk":48,"dnk":62,"dur":72,"hus":78,"lay":72,"mid":75,"piq":78,"pot":85,"siq":80,"spd":75,"sta":78,"stl":68,"str":75,"3_45":76,"dcon":78,"draw":68,"dreb":58,"hdef":78,"idef":52,"lock":50,"name":"니콜라스 바툼","ocon":78,"oreb":28,"pacc":78,"pdef":78,"post":65,"pper":75,"pvis":80,"spwb":75,"team":"FA","vert":72,"close":72,"handl":72,"hands":78,"health":"Healthy","height":203,"salary":14.0,"weight":95,"position":"SF","intangibles":80,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":8,"mid":22,"cnr":12,"p45":18,"atb":22},"lateral_bias":2}'::jsonb
);

-- 47. Hedo Turkoglu (전성기: 29세, 2007-08)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Hedo Turkoglu',
  '{"3c":82,"3t":78,"ft":80,"age":29,"agi":68,"blk":32,"dnk":52,"dur":78,"hus":75,"lay":78,"mid":82,"piq":78,"pot":87,"siq":82,"spd":68,"sta":78,"stl":62,"str":78,"3_45":80,"dcon":72,"draw":72,"dreb":55,"hdef":68,"idef":48,"lock":50,"name":"히도 터코글루","ocon":78,"oreb":28,"pacc":78,"pdef":68,"post":72,"pper":75,"pvis":82,"spwb":78,"team":"FA","vert":65,"close":78,"handl":78,"hands":78,"health":"Healthy","height":208,"salary":16.0,"weight":100,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":8,"mid":25,"cnr":10,"p45":18,"atb":21},"lateral_bias":2}'::jsonb
);

-- 48. DeMar DeRozan (전성기: 29세, 2018-19)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'DeMar DeRozan',
  '{"3c":62,"3t":58,"ft":85,"age":29,"agi":80,"blk":30,"dnk":78,"dur":82,"hus":82,"lay":88,"mid":92,"piq":78,"pot":91,"siq":85,"spd":78,"sta":85,"stl":68,"str":78,"3_45":60,"dcon":75,"draw":88,"dreb":48,"hdef":68,"idef":48,"lock":50,"name":"드마 드로잔","ocon":82,"oreb":28,"pacc":78,"pdef":68,"post":82,"pper":78,"pvis":82,"spwb":85,"team":"FA","vert":78,"close":92,"handl":85,"hands":82,"health":"Healthy","height":198,"salary":24.0,"weight":100,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":12,"mid":32,"cnr":4,"p45":10,"atb":14},"lateral_bias":2}'::jsonb
);

-- 49. OG Anunoby (전성기: 26세, 2023-24)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'OG Anunoby',
  '{"3c":80,"3t":78,"ft":75,"age":26,"agi":78,"blk":52,"dnk":72,"dur":65,"hus":88,"lay":75,"mid":72,"piq":82,"pot":88,"siq":82,"spd":78,"sta":82,"stl":78,"str":82,"3_45":78,"dcon":88,"draw":68,"dreb":52,"hdef":90,"idef":55,"lock":50,"name":"OG 아누노비","ocon":78,"oreb":32,"pacc":62,"pdef":90,"post":62,"pper":78,"pvis":62,"spwb":75,"team":"FA","vert":78,"close":72,"handl":68,"hands":82,"health":"Healthy","height":201,"salary":22.0,"weight":106,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":20,"itp":8,"mid":18,"cnr":14,"p45":18,"atb":22},"lateral_bias":2}'::jsonb
);

-- 50. Mikal Bridges (전성기: 27세, 2023-24)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Mikal Bridges',
  '{"3c":80,"3t":78,"ft":82,"age":27,"agi":80,"blk":40,"dnk":65,"dur":90,"hus":85,"lay":78,"mid":78,"piq":82,"pot":87,"siq":82,"spd":80,"sta":88,"stl":78,"str":72,"3_45":78,"dcon":85,"draw":72,"dreb":45,"hdef":85,"idef":48,"lock":50,"name":"미칼 브릿지스","ocon":80,"oreb":22,"pacc":68,"pdef":85,"post":55,"pper":78,"pvis":72,"spwb":78,"team":"FA","vert":75,"close":78,"handl":75,"hands":82,"health":"Healthy","height":198,"salary":22.0,"weight":95,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":18,"itp":8,"mid":22,"cnr":12,"p45":18,"atb":22},"lateral_bias":2}'::jsonb
);

-- 51. Keldon Johnson (전성기: 24세, 2023-24)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Keldon Johnson',
  '{"3c":72,"3t":68,"ft":78,"age":24,"agi":80,"blk":35,"dnk":78,"dur":78,"hus":85,"lay":82,"mid":72,"piq":68,"pot":85,"siq":72,"spd":82,"sta":82,"stl":62,"str":82,"3_45":70,"dcon":68,"draw":75,"dreb":48,"hdef":68,"idef":48,"lock":50,"name":"켈든 존슨","ocon":72,"oreb":35,"pacc":62,"pdef":68,"post":65,"pper":65,"pvis":62,"spwb":78,"team":"FA","vert":82,"close":75,"handl":68,"hands":75,"health":"Healthy","height":196,"salary":14.0,"weight":102,"position":"SF","intangibles":72,"contractyears":3}'::jsonb,
  '{"zones":{"ra":30,"itp":12,"mid":22,"cnr":7,"p45":12,"atb":17},"lateral_bias":2}'::jsonb
);

-- 52. Herbert Jones (전성기: 26세, 2024-25)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Herb Jones',
  '{"3c":70,"3t":65,"ft":72,"age":26,"agi":82,"blk":55,"dnk":68,"dur":80,"hus":92,"lay":75,"mid":68,"piq":82,"pot":85,"siq":82,"spd":82,"sta":85,"stl":85,"str":78,"3_45":68,"dcon":90,"draw":62,"dreb":55,"hdef":92,"idef":55,"lock":50,"name":"허브 존스","ocon":78,"oreb":30,"pacc":62,"pdef":92,"post":58,"pper":78,"pvis":68,"spwb":68,"team":"FA","vert":80,"close":68,"handl":65,"hands":78,"health":"Healthy","height":201,"salary":12.0,"weight":93,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":25,"itp":10,"mid":22,"cnr":10,"p45":14,"atb":19},"lateral_bias":2}'::jsonb
);

-- 53. Dillon Brooks (전성기: 27세, 2022-23)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Dillon Brooks',
  '{"3c":72,"3t":68,"ft":78,"age":27,"agi":78,"blk":35,"dnk":62,"dur":78,"hus":90,"lay":72,"mid":72,"piq":75,"pot":82,"siq":78,"spd":78,"sta":82,"stl":72,"str":82,"3_45":70,"dcon":85,"draw":72,"dreb":42,"hdef":85,"idef":48,"lock":50,"name":"딜런 브룩스","ocon":72,"oreb":25,"pacc":62,"pdef":82,"post":65,"pper":72,"pvis":62,"spwb":75,"team":"FA","vert":72,"close":72,"handl":68,"hands":72,"health":"Healthy","height":198,"salary":12.0,"weight":100,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":22,"itp":8,"mid":28,"cnr":8,"p45":14,"atb":20},"lateral_bias":2}'::jsonb
);

-- 54. Josh Hart (전성기: 28세, 2023-24)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Josh Hart',
  '{"3c":72,"3t":68,"ft":75,"age":28,"agi":75,"blk":32,"dnk":58,"dur":82,"hus":92,"lay":75,"mid":68,"piq":78,"pot":82,"siq":82,"spd":75,"sta":85,"stl":68,"str":78,"3_45":70,"dcon":78,"draw":72,"dreb":72,"hdef":78,"idef":48,"lock":50,"name":"조쉬 하트","ocon":78,"oreb":55,"pacc":65,"pdef":78,"post":58,"pper":75,"pvis":75,"spwb":72,"team":"FA","vert":72,"close":72,"handl":68,"hands":82,"health":"Healthy","height":196,"salary":14.0,"weight":96,"position":"SF","intangibles":85,"contractyears":3}'::jsonb,
  '{"zones":{"ra":28,"itp":12,"mid":22,"cnr":8,"p45":12,"atb":18},"lateral_bias":2}'::jsonb
);

-- 55. Dorian Finney-Smith (전성기: 29세, 2022-23)
INSERT INTO meta_players (name, base_attributes, tendencies) VALUES (
  'Dorian Finney-Smith',
  '{"3c":78,"3t":75,"ft":72,"age":29,"agi":75,"blk":42,"dnk":58,"dur":82,"hus":85,"lay":68,"mid":68,"piq":78,"pot":80,"siq":78,"spd":75,"sta":82,"stl":72,"str":78,"3_45":76,"dcon":82,"draw":62,"dreb":52,"hdef":82,"idef":52,"lock":50,"name":"도리안 피니-스미스","ocon":75,"oreb":25,"pacc":62,"pdef":82,"post":55,"pper":72,"pvis":62,"spwb":72,"team":"FA","vert":72,"close":68,"handl":62,"hands":78,"health":"Healthy","height":201,"salary":12.0,"weight":100,"position":"SF","intangibles":78,"contractyears":3}'::jsonb,
  '{"zones":{"ra":15,"itp":5,"mid":20,"cnr":15,"p45":20,"atb":25},"lateral_bias":2}'::jsonb
);
