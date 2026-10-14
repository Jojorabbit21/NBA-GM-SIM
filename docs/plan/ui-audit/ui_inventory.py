#!/usr/bin/env python3
"""멀티 세션 화면 UI 인벤토리 — className/패턴을 파일:라인 단위로 전수 추출.

출력:
  <out>/inventory.csv   : file,line,role,token,snippet   (모든 매치, 1행 1매치)
  <out>/summary.md      : 역할별 건수, 파일별 공용 import 매트릭스, 구분선/hover/헤더 변형표, 파일별 체크리스트 수
  <out>/by_file/<slug>.md : 파일별 매치 목록 (에이전트 정독 체크리스트용)
"""
import csv, os, re, sys
from collections import Counter, defaultdict

ROOT = sys.argv[1]
OUT  = sys.argv[2]
os.makedirs(os.path.join(OUT, 'by_file'), exist_ok=True)

TARGET_DIRS = [
    'views/multi/season', 'components/roster', 'components/multi', 'components/dashboard',
    'components/dashboard/tactics', 'components/dashboard/tactics/insights', 'components/common',
]
TARGET_FILES = [
    'views/RosterView.tsx', 'views/PlayerDetailView.tsx', 'pages/MultiSeasonPage.tsx',
    'components/MultiHeader.tsx', 'components/MultiSidebar.tsx',
]
EXCLUDE = {'MultiGamePbpView.legacy.tsx'}

files = []
for d in TARGET_DIRS:
    p = os.path.join(ROOT, d)
    if not os.path.isdir(p): continue
    for f in sorted(os.listdir(p)):
        if f.endswith('.tsx') and f not in EXCLUDE:
            files.append(os.path.join(d, f))
for f in TARGET_FILES:
    if os.path.exists(os.path.join(ROOT, f)): files.append(f)
files = sorted(set(files))

COMMON = ['Table','TabBar','Button','Badge','Card','Modal','Dropdown','PageHeader','Skeleton','OvrBadge',
          'StarRating','TeamLogo','TeamBadge','TeamMark','InjuryStatusBadge','PlayerHoverCard','PlayerAwardBadges',
          'SliderControl','SliderGroupNotes','NotificationCenter','DirectionBadge']

# (role, regex) — 라인 단위 매치. 한 라인에 여러 role 가능.
PATTERNS = [
    ('divider_v',     re.compile(r'border-r(?:-\d)?\s+border-(slate|zinc|white|black)-?[\w/.\[\]]*|border-r-(slate|zinc)-[\w/]+')),
    ('divider_b',     re.compile(r'border-b(?:-\d)?\s+border-(slate|zinc|white)-?[\w/.\[\]]*|border-b-(slate|zinc)-[\w/]+')),
    ('divider_t',     re.compile(r'border-t(?:-\d)?\s+border-(slate|zinc|white)-?[\w/.\[\]]*')),
    ('row_hover',     re.compile(r'hover:bg-(white|slate|zinc)[\w/\[\].]*')),
    ('header_text',   re.compile(r'text-(?:xs|sm|\[1[01]px\]|\[9px\])\s+font-(?:bold|black|semibold)\s+uppercase\s+tracking-\w+|font-(?:bold|black)\s+uppercase\s+tracking-\w+')),
    ('badge_inline',  re.compile(r'text-\[(?:8|9|10)px\]\s+font-(?:bold|black|semibold)|font-(?:bold|black)\s+text-\[(?:8|9|10)px\]')),
    ('pill_rounded',  re.compile(r'rounded-full[^"`]*(?:px-\d|text-\[)|(?:px-\d[^"`]*)rounded-full')),
    ('button_raw',    re.compile(r'<button\b')),
    ('spinner',       re.compile(r'animate-spin')),
    ('overlay_fixed', re.compile(r'fixed inset-0')),
    ('table_raw',     re.compile(r'<table\b')),
    ('th_raw',        re.compile(r'<th\b')),
    ('td_raw',        re.compile(r'<td\b')),
    ('logo_fallback', re.compile(r'dataset\.fallback')),
    ('placehold',     re.compile(r'placehold\.co')),
    ('money_short',   re.compile(r'\bformatMoney\(')),
    ('money_full',    re.compile(r'\bformatMoneyFull\(')),
    ('money_locale',  re.compile(r'toLocaleString\(')),
    ('tabular',       re.compile(r'tabular-nums')),
    ('tab_underline', re.compile(r'border-b-2')),
    ('segment_ctrl',  re.compile(r'rounded-(?:md|lg)\s+p-1\b|p-1\s+rounded-(?:md|lg)\b')),
    ('live_dot',      re.compile(r'rounded-full bg-red-500 animate-pulse|animate-ping')),
    ('select_raw',    re.compile(r'<select\b')),
    ('input_raw',     re.compile(r'<input\b')),
    ('range_input',   re.compile(r'type="range"')),
    ('card_box',      re.compile(r'bg-slate-9(?:00|50)(?:/\d+)?\s+(?:rounded-\w+\s+)?border\s+border-slate-(?:700|800)')),
    ('empty_state',   re.compile(r'없습니다|없음|No data|비어')),
    ('important_ovr', re.compile(r'!w-\d+\s+!h-\d+')),
    ('zindex',        re.compile(r'z-\[\d+\]|z-\d{2,}')),
    ('sticky',        re.compile(r'position:\s*[\'"]sticky|\bsticky\b')),
    ('ovr_calc',      re.compile(r'calculatePlayerOvr\(')),
]
IMPORT_RE = re.compile(r"import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+'[^']*common/(\w+)'")

rows = []
role_counter = Counter()
file_role = defaultdict(Counter)
file_lines = {}
file_imports = defaultdict(set)
divider_tokens = defaultdict(Counter)   # role -> token -> count
file_divider = defaultdict(Counter)     # file -> token -> count
hover_tokens = Counter(); header_tokens = Counter()

for rel in files:
    with open(os.path.join(ROOT, rel), encoding='utf-8') as fh:
        lines = fh.read().split('\n')
    file_lines[rel] = len(lines)
    for i, ln in enumerate(lines, 1):
        m = IMPORT_RE.search(ln)
        if m:
            file_imports[rel].add(m.group(2))
        for role, rx in PATTERNS:
            for mm in rx.finditer(ln):
                tok = mm.group(0).strip()
                snippet = ln.strip()[:160]
                rows.append((rel, i, role, tok, snippet))
                role_counter[role] += 1
                file_role[rel][role] += 1
                if role in ('divider_v','divider_b','divider_t'):
                    divider_tokens[role][tok] += 1
                    if role == 'divider_v': file_divider[rel][tok] += 1
                if role == 'row_hover': hover_tokens[tok] += 1
                if role == 'header_text': header_tokens[tok] += 1

with open(os.path.join(OUT, 'inventory.csv'), 'w', newline='', encoding='utf-8') as fh:
    w = csv.writer(fh); w.writerow(['file','line','role','token','snippet']); w.writerows(rows)

def slug(rel): return rel.replace('/', '__').replace('.tsx','')
for rel in files:
    fr = [r for r in rows if r[0] == rel]
    with open(os.path.join(OUT, 'by_file', slug(rel) + '.md'), 'w', encoding='utf-8') as fh:
        fh.write(f'# {rel}\n\n줄 수: {file_lines[rel]} · 매치: {len(fr)} · 공용 import: {", ".join(sorted(file_imports[rel])) or "없음"}\n\n')
        fh.write('| line | role | token | snippet |\n|---|---|---|---|\n')
        for (_, ln, role, tok, sn) in fr:
            tok_s = tok.replace('|', '\\|')
            sn_s = sn.replace('|', '\\|').replace('`', '')
            fh.write(f'| {ln} | {role} | `{tok_s}` | `{sn_s}` |\n')

with open(os.path.join(OUT, 'summary.md'), 'w', encoding='utf-8') as fh:
    fh.write('# UI 인벤토리 요약 (기계 추출)\n\n')
    fh.write(f'- 대상 파일 {len(files)}개, 총 {sum(file_lines.values()):,}줄, 매치 {len(rows):,}건\n\n')
    fh.write('## 역할별 건수\n\n| role | count | 파일 수 |\n|---|---|---|\n')
    for role, c in role_counter.most_common():
        nf = sum(1 for f in files if file_role[f][role])
        fh.write(f'| {role} | {c} | {nf} |\n')
    fh.write('\n## 세로 구분선(divider_v) 토큰 변형\n\n| token | count |\n|---|---|\n')
    for t, c in divider_tokens['divider_v'].most_common(): fh.write(f'| `{t}` | {c} |\n')
    fh.write('\n## 가로 구분선(divider_b) 토큰 변형 (상위 15)\n\n| token | count |\n|---|---|\n')
    for t, c in divider_tokens['divider_b'].most_common(15): fh.write(f'| `{t}` | {c} |\n')
    fh.write('\n## 행 hover 토큰 변형\n\n| token | count |\n|---|---|\n')
    for t, c in hover_tokens.most_common(): fh.write(f'| `{t}` | {c} |\n')
    fh.write('\n## 헤더 글자 스타일 변형\n\n| token | count |\n|---|---|\n')
    for t, c in header_tokens.most_common(): fh.write(f'| `{t}` | {c} |\n')
    fh.write('\n## 파일별 공용 import 매트릭스\n\n| file | 줄 | ' + ' | '.join(COMMON) + ' |\n|---|---|' + '---|'*len(COMMON) + '\n')
    for rel in files:
        if rel.startswith('components/common/'): continue
        fh.write(f'| {rel} | {file_lines[rel]} | ' + ' | '.join('●' if c in file_imports[rel] else '' for c in COMMON) + ' |\n')
    fh.write('\n## 파일별 세로 구분선 토큰 (어떤 파일이 어떤 색을 쓰는지)\n\n| file | tokens |\n|---|---|\n')
    for rel in files:
        if file_divider[rel]:
            fh.write(f'| {rel} | ' + ', '.join(f'`{t}`×{c}' for t, c in file_divider[rel].most_common()) + ' |\n')
    fh.write('\n## 파일별 매치 수 (정독 체크리스트 크기)\n\n| file | 줄 | 매치 | button_raw | table_raw | spinner | logo_fallback | overlay_fixed |\n|---|---|---|---|---|---|---|---|\n')
    for rel in files:
        c = file_role[rel]
        fh.write(f'| {rel} | {file_lines[rel]} | {sum(c.values())} | {c["button_raw"]} | {c["table_raw"]} | {c["spinner"]} | {c["logo_fallback"]} | {c["overlay_fixed"]} |\n')
print(f'files={len(files)} lines={sum(file_lines.values())} matches={len(rows)}')
