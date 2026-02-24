#!/bin/bash
# Design System Compliance Hook
# PostToolUse hook: Edit/Write 후 .tsx 파일의 디자인 시스템 위반사항 감지
# 참조: docs/design-system.md

set -uo pipefail

# stdin에서 JSON 파싱
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

# .tsx 파일이 아니면 종료
if [[ ! "$FILE_PATH" =~ \.tsx$ ]]; then
  exit 0
fi

# components/common/ 디렉토리는 제외 (디자인 시스템 자체)
if [[ "$FILE_PATH" =~ components/common/ ]]; then
  exit 0
fi

# components/ 또는 views/ 내 파일만 검사
if [[ ! "$FILE_PATH" =~ (components/|views/) ]]; then
  exit 0
fi

# 파일 존재 확인
if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

WARNINGS=""

# grep -c 헬퍼: 매치 없으면 0 반환 (grep -c는 매치 없을 때 exit 1 + "0" 출력)
count() {
  grep -cE "$1" "$2" 2>/dev/null || true
}

# === CHECK 1: Raw <button> with action-button patterns ===
RAW_BTN=$(count '<button\s[^>]*(px-[0-9]+ py-[0-9]+|py-[0-9]+ px-[0-9]+)' "$FILE_PATH")
if [[ "$RAW_BTN" -gt 0 ]]; then
  WARNINGS="${WARNINGS}- RAW_BUTTON: ${RAW_BTN}개의 raw <button>에 패딩 스타일 적용됨. <Button> 공용 컴포넌트 사용 권장 (components/common/Button.tsx, variants: primary|secondary|danger|ghost|outline|brand)\n"
fi

# === CHECK 2: Light backgrounds (다크 테마 위반) ===
LIGHT_BG=$(count 'bg-(white|gray-[0-9]|zinc-[1-4][0-9]{2}|neutral-[1-4][0-9]{2}|stone-[1-4][0-9]{2})\b' "$FILE_PATH")
LIGHT_BG_OK=$(count 'bg-white/[0-9]' "$FILE_PATH")
LIGHT_BG_REAL=$((LIGHT_BG - LIGHT_BG_OK))
if [[ "$LIGHT_BG_REAL" -gt 0 ]]; then
  WARNINGS="${WARNINGS}- LIGHT_BG: ${LIGHT_BG_REAL}개의 밝은 배경 클래스. bg-surface(slate-950) 또는 bg-surface-card(slate-900) 사용 권장\n"
fi

# === CHECK 3: Off-palette accent colors ===
OFF_ACCENT=$(count '(bg|text|border)-(purple|violet|pink|lime|sky)-[0-9]' "$FILE_PATH")
if [[ "$OFF_ACCENT" -gt 0 ]]; then
  WARNINGS="${WARNINGS}- OFF_PALETTE: ${OFF_ACCENT}개의 비표준 액센트 색상. 허용 팔레트: indigo(브랜드), emerald(성공), red(위험), amber(경고), blue(정보)\n"
fi

# === CHECK 4: green-* → emerald-* ===
GREEN=$(count '(bg|text|border)-green-[0-9]' "$FILE_PATH")
if [[ "$GREEN" -gt 0 ]]; then
  WARNINGS="${WARNINGS}- COLOR_ALIAS: ${GREEN}개의 green-* 사용. emerald-*로 교체 권장 (emerald-500=성공, emerald-600=호버)\n"
fi

# === CHECK 5: yellow-* → amber-* (그라데이션 제외) ===
YELLOW_ALL=$(grep -E '(bg|text|border)-yellow-[0-9]' "$FILE_PATH" 2>/dev/null || true)
if [[ -n "$YELLOW_ALL" ]]; then
  YELLOW_STANDALONE=$(echo "$YELLOW_ALL" | grep -cvE 'from-|via-|to-' || true)
  if [[ "$YELLOW_STANDALONE" -gt 0 ]]; then
    WARNINGS="${WARNINGS}- COLOR_ALIAS: ${YELLOW_STANDALONE}개의 standalone yellow-* 사용. amber-*로 교체 권장 (amber-500=경고)\n"
  fi
fi

# 위반사항이 있으면 Claude에 피드백
if [[ -n "$WARNINGS" ]]; then
  MSG="[DESIGN-SYSTEM] $(basename "$FILE_PATH") 위반사항:\\n${WARNINGS}Ref: docs/design-system.md | 공용 컴포넌트: components/common/{Button,Card,Badge,Modal,Table,OvrBadge}.tsx"
  ESCAPED_MSG=$(echo -e "$MSG" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null)
  echo "{\"hookSpecificOutput\":{\"additionalContext\":${ESCAPED_MSG}}}"
fi

exit 0
