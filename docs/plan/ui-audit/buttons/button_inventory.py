#!/usr/bin/env python3
"""멀티 세션 스코프의 모든 <button …>…</button> 추출(멀티라인) → CSV + 분포 요약.
사용: python3 button_inventory.py <repo> <out_dir>
"""
import os, re, sys, csv
from collections import Counter, defaultdict

ROOT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
SCOPE_DIRS = ['views/multi/season', 'components/leaderboard', 'components/roster', 'components/multi', 'components/dashboard',
              'components/game', 'components/draft', 'components/common']
SCOPE_FILES = ['pages/MultiSeasonPage.tsx', 'views/RosterView.tsx', 'views/PlayerDetailView.tsx', 'views/LeaderboardView.tsx',
               'components/MultiHeader.tsx', 'components/MultiSidebar.tsx', 'views/multi/league/MultiDraftView.tsx',
               'views/multi/league/PersonalDraftView.tsx', 'views/multi/league/LeagueLayout.tsx']
EXCLUDE_SUB = ('legacy', 'AdminTradePanel', 'DashboardHeader', 'HeaderNavMenu.tsx', 'GlobalSearch.tsx', 'DateSkipDropdown',
               'ActionButton', 'RotationManager', 'TacticsHistory', 'OpponentScoutPanel', 'CoachStaffTable', 'RotationMatrix',
               'CreateLeagueModal', 'PersonalDraftFormatEditor', 'DraftPoolSettings', 'DraftSalaryScaleSettings')

files = []
for d in SCOPE_DIRS:
    for dp, _, fs in os.walk(os.path.join(ROOT, d)):
        for f in fs:
            if f.endswith('.tsx'):
                rel = os.path.relpath(os.path.join(dp, f), ROOT)
                if not any(x in rel for x in EXCLUDE_SUB): files.append(rel)
for f in SCOPE_FILES:
    if os.path.exists(os.path.join(ROOT, f)): files.append(f)
files = sorted(set(files))

def find_tag_end(src, i):
    """src[i:] starts with '<button'. return index just after the closing '>' of the opening tag (brace/quote aware)."""
    depth = 0; q = None; j = i
    while j < len(src):
        c = src[j]
        if q:
            if c == q and src[j-1] != '\\': q = None
        elif c in ('"', "'", '`'): q = c
        elif c == '{': depth += 1
        elif c == '}': depth -= 1
        elif c == '>' and depth == 0: return j + 1
        j += 1
    return j

STR = re.compile(r'["\'`]([^"\'`]*)["\'`]')
def classes_from(attr_src):
    m = re.search(r'className=(\{[\s\S]*?\}(?=\s+\w+=|\s*$|\s*/?>)|"[^"]*")', attr_src)
    if not m: return '', False
    raw = m.group(1)
    dynamic = raw.startswith('{') and ('?' in raw or '${' in raw)
    toks = []
    for s in STR.findall(raw):
        toks += s.split()
    toks = [t for t in toks if t and not t.startswith('${')]
    return ' '.join(dict.fromkeys(toks)), dynamic

rows = []
for rel in files:
    src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
    for m in re.finditer(r'<button\b', src):
        i = m.start(); tag_end = find_tag_end(src, i)
        attrs = src[i:tag_end]
        close = src.find('</button>', tag_end)
        inner = src[tag_end:close] if close != -1 and close - tag_end < 4000 else ''
        line = src.count('\n', 0, i) + 1
        cls, dyn = classes_from(attrs)
        text = re.sub(r'\{[^}]*\}', ' ', re.sub(r'<[^>]+>', ' ', inner))
        text = re.sub(r'\s+', ' ', text).strip()
        has_icon = bool(re.search(r'<[A-Z][A-Za-z]+\s[^>]*size=', inner))
        has_text = bool(re.search(r'[가-힣A-Za-z0-9]', text))
        onclick = 'onClick' in attrs
        aria = bool(re.search(r'aria-label|title=', attrs))
        disabled = 'disabled' in attrs
        t = cls
        def has(p): return re.search(p, t) is not None
        # 역할 분류(1차 휴리스틱)
        if rel.endswith('common/TabBar.tsx') or has(r'\bborder-b-2\b') or 'aria-pressed' in attrs or 'role="tab"' in attrs: role = 'tab'
        elif has(r'bg-gradient-to'): role = 'cta-gradient'
        elif has(r'bg-indigo-(500|600)\b') and not has(r'hover:bg-indigo-600/'): role = 'primary'
        elif has(r'bg-(red|rose)-(600|700|900)'): role = 'danger'
        elif has(r'bg-emerald-(500|600)\b'): role = 'success'
        elif has(r'bg-amber-(500|600)\b|bg-orange-(500|600)\b'): role = 'warning'
        elif has(r'\bunderline\b|hover:underline'): role = 'link'
        elif has_icon and not has_text: role = 'icon-only'
        elif has(r'\bw-full\b') and has(r'text-left'): role = 'menu-item/row'
        elif has(r'bg-slate-(700|800)\b|border border-slate-(600|700|800)'): role = 'secondary'
        elif has(r'bg-transparent|hover:bg-(slate|white)') and not has(r'\bbg-(slate|indigo|red|emerald)-\d'): role = 'ghost'
        elif has(r'rounded-l\b|rounded-r\b|rounded-l-|rounded-r-'): role = 'segment'
        elif not cls: role = 'unstyled'
        else: role = 'other'
        size_txt = (re.search(r'\btext-(xs|sm|base|lg|\[\d+px\])\b', t) or [None, '-'])[1]
        px = (re.search(r'\bpx-([\d.]+)\b', t) or [None, '-'])[1]; py = (re.search(r'\bpy-([\d.]+)\b', t) or [None, '-'])[1]
        p_all = (re.search(r'\bp-([\d.]+)\b', t) or [None, '-'])[1]
        radius = (re.search(r'\brounded(-(?:sm|md|lg|xl|2xl|3xl|full|none))?\b', t) or [None, None])[0] or '-'
        weight = (re.search(r'\bfont-(medium|semibold|bold|black|normal)\b', t) or [None, '-'])[1]
        rows.append(dict(file=rel, line=line, role=role, text=text[:40], icon=int(has_icon), has_text=int(has_text), onClick=int(onclick),
                         aria=int(aria), disabled=int(disabled), dynamic=int(dyn), size_txt=size_txt, px=px, py=py, p=p_all,
                         radius=radius, weight=weight, classes=cls[:400]))

with open(os.path.join(OUT, 'buttons.csv'), 'w', newline='', encoding='utf-8') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

def top(counter, n=8): return ', '.join(f'`{k}`×{v}' for k, v in counter.most_common(n))
by_role = defaultdict(list)
for r in rows: by_role[r['role']].append(r)
with open(os.path.join(OUT, 'buttons-summary.md'), 'w', encoding='utf-8') as fh:
    fh.write(f'# 버튼 인벤토리 (기계 추출)\n\n- 파일 {len(files)}개, `<button>` {len(rows)}개\n\n## 역할별 건수\n\n| 역할 | 건수 | 파일 수 | 텍스트 크기 | 패딩(px/py) | 라운드 | 굵기 |\n|---|---|---|---|---|---|---|\n')
    for role, rs in sorted(by_role.items(), key=lambda x: -len(x[1])):
        fh.write(f"| {role} | {len(rs)} | {len(set(r['file'] for r in rs))} | {top(Counter(r['size_txt'] for r in rs),4)} | {top(Counter(r['px']+'/'+r['py'] for r in rs),4)} | {top(Counter(r['radius'] for r in rs),4)} | {top(Counter(r['weight'] for r in rs),4)} |\n")
    fh.write('\n## 전체 분포\n\n')
    for name, key in [('텍스트 크기','size_txt'),('라운드','radius'),('굵기','weight'),('패딩 px/py',None)]:
        c = Counter((r['px']+'/'+r['py']) if key is None else r[key] for r in rows)
        fh.write(f'- **{name}**: {top(c, 10)}\n')
    fh.write(f"- **아이콘 포함**: {sum(r['icon'] for r in rows)} · **텍스트 없음(아이콘 전용 후보)**: {sum(1 for r in rows if r['icon'] and not r['has_text'])} · **aria-label/title 없는 아이콘 전용**: {sum(1 for r in rows if r['icon'] and not r['has_text'] and not r['aria'])}\n")
    fh.write(f"- **동적 className(삼항/템플릿)**: {sum(r['dynamic'] for r in rows)}\n")
    fh.write('\n## 파일별 건수 (상위 25)\n\n| 파일 | 건수 | 역할 분포 |\n|---|---|---|\n')
    byf = defaultdict(list)
    for r in rows: byf[r['file']].append(r)
    for f, rs in sorted(byf.items(), key=lambda x: -len(x[1]))[:25]:
        fh.write(f"| {f} | {len(rs)} | {top(Counter(r['role'] for r in rs),6)} |\n")
    fh.write('\n## 역할별 대표 클래스 (각 역할 상위 5 조합)\n\n')
    for role, rs in sorted(by_role.items(), key=lambda x: -len(x[1])):
        fh.write(f'### {role} ({len(rs)})\n\n')
        c = Counter(r['classes'] for r in rs)
        for k, v in c.most_common(5):
            fh.write(f'- ×{v} `{k[:160]}`\n')
        fh.write('\n')
print(f'files={len(files)} buttons={len(rows)}')
