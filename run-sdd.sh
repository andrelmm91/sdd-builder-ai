#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-sdd.sh  —  Sweep .sdd.md spec files and send each to GitHub Copilot CLI
#               for development, one at a time, with a y/n gateway between each.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── USER CONFIG (edit these if needed) ──────────────────────────────────────

SPECS_DIR=".specs"           # Directory containing *.sdd.md files
LOG_DIR=".sdd/logs/runs"     # Where per-run logs are stored

# Path to the Copilot CLI binary. The script auto-detects it; override here
# if needed. Alternatively set to "claude" to use the Claude CLI instead.
COPILOT_BIN=$(which copilot 2>/dev/null || echo "copilot")

# Extra flags always appended to every run.
#   --yolo        = allow all tools, paths, and URLs (no confirmations)
#   -p            = non-interactive mode (prompt passed as argument)
# For Claude CLI use: COPILOT_FLAGS="--dangerously-skip-permissions --print"
COPILOT_FLAGS="--yolo --model claude-sonnet-4.6"

# Set to "done" values (space-separated) to automatically skip those statuses
# without prompting.  E.g. SKIP_STATUSES="done"  or  SKIP_STATUSES=""
SKIP_STATUSES="done"

# ─── COLORS & SYMBOLS ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

SYM_OK="✔"
SYM_SKIP="⊘"
SYM_RUN="▶"
SYM_WAIT="◆"
SYM_LOG="📄"
SYM_DONE="🎉"

# ─── HELPERS ─────────────────────────────────────────────────────────────────

# print_banner <spec_id> <title> <status> <index> <total>
print_banner() {
  local spec_id="$1" title="$2" status="$3" index="$4" total="$5"
  local line
  line=$(printf '%.0s─' {1..70})
  echo ""
  echo -e "${BOLD}${BLUE}${line}${RESET}"
  printf "${BOLD}${CYAN}  %s / %s  ${RESET}${BOLD}${MAGENTA}%s${RESET}  —  %s\n" \
    "$index" "$total" "$spec_id" "$title"
  printf "  Status: "
  case "$status" in
    done)      printf "${GREEN}%s${RESET}\n" "$status" ;;
    in_progress) printf "${YELLOW}%s${RESET}\n" "$status" ;;
    review)    printf "${MAGENTA}%s${RESET}\n" "$status" ;;
    *)         printf "${DIM}%s${RESET}\n" "$status" ;;
  esac
  echo -e "${BOLD}${BLUE}${line}${RESET}"
}

# extract_field <field> <file>  — reads a YAML frontmatter field value
extract_field() {
  local field="$1" file="$2"
  # Read between first pair of --- delimiters, then grep for the field
  awk '/^---/{f++; next} f==1' "$file" \
    | grep -E "^${field}:" \
    | head -1 \
    | sed "s/^${field}:[[:space:]]*//" \
    | tr -d '"' \
    | tr -d "'"
}

# ask_range  — prompts for start/end SDD numbers; sets RANGE_START and RANGE_END
ask_range() {
  local all_ids=()
  for f in "${SPECS_DIR}"/*.sdd.md; do
    local id
    id=$(extract_field "spec_id" "$f")
    [[ -n "$id" ]] && all_ids+=("$id")
  done
  local first_id="${all_ids[0]:-SDD-001}"
  local last_idx=$(( ${#all_ids[@]} - 1 ))
  local last_id="${all_ids[$last_idx]:-SDD-001}"

  echo ""
  echo -e "  ${DIM}Available range: ${first_id}  →  ${last_id}  (${#all_ids[@]} specs)${RESET}"
  echo ""

  while true; do
    printf "  ${BOLD}${CYAN}Start from (e.g. 001, 010):${RESET} "
    read -r start_raw </dev/tty
    start_raw=$(echo "$start_raw" | tr -d '[:space:]')
    # Accept bare number or full SDD-NNN
    if [[ "$start_raw" =~ ^[0-9]+$ ]]; then
      RANGE_START=$(printf 'SDD-%03d' "$((10#$start_raw))")
    elif [[ "$start_raw" =~ ^[Ss][Dd][Dd]-([0-9]+)$ ]]; then
      RANGE_START=$(printf 'SDD-%03d' "$((10#${BASH_REMATCH[1]}))")
    else
      echo -e "  ${RED}Invalid — enter a number like 001 or SDD-010.${RESET}"
      continue
    fi

    printf "  ${BOLD}${CYAN}End at     (e.g. 025, 046):${RESET} "
    read -r end_raw </dev/tty
    end_raw=$(echo "$end_raw" | tr -d '[:space:]')
    if [[ "$end_raw" =~ ^[0-9]+$ ]]; then
      RANGE_END=$(printf 'SDD-%03d' "$((10#$end_raw))")
    elif [[ "$end_raw" =~ ^[Ss][Dd][Dd]-([0-9]+)$ ]]; then
      RANGE_END=$(printf 'SDD-%03d' "$((10#${BASH_REMATCH[1]}))")
    else
      echo -e "  ${RED}Invalid — enter a number like 025 or SDD-046.${RESET}"
      continue
    fi

    if [[ "$RANGE_START" > "$RANGE_END" ]]; then
      echo -e "  ${RED}Start must be ≤ End. Try again.${RESET}"
      continue
    fi

    break
  done
}

# ask_yn <question>  — returns 0 for yes, 1 for no
ask_yn() {
  local question="$1"
  while true; do
    printf "\n${BOLD}${YELLOW}${SYM_WAIT}  %s ${DIM}[y/n]${RESET} " "$question"
    read -r reply </dev/tty
    reply=$(echo "$reply" | tr '[:upper:]' '[:lower:]')
    case "$reply" in
      y|yes) return 0 ;;
      n|no)  return 1 ;;
      *)     printf "  ${RED}Please answer y or n.${RESET}\n" ;;
    esac
  done
}

# run_copilot <spec_file> <spec_id> <log_file>
run_copilot() {
  local spec_file="$1" spec_id="$2" log_file="$3"
  local spec_content task_prompt
  spec_content=$(cat "$spec_file")

  # Standard task prompt — spec_id is injected so every run is self-describing.
  task_prompt="lets implement ${spec_id} in #file:.specs .Update the open tasks in the spec document after completion. Add unit tests if necessary. Make a commit and push it to the main branch with only the name of the SDD file.

---

${spec_content}"

  echo ""
  echo -e "${BOLD}${GREEN}${SYM_RUN}  Launching Copilot CLI — fresh context, all permissions enabled${RESET}"
  echo -e "${DIM}    Binary: ${COPILOT_BIN} ${COPILOT_FLAGS}${RESET}"
  echo -e "${DIM}    Prompt prefix: lets implement ${spec_id} in #file:.specs ...${RESET}"
  echo -e "${DIM}    Log: ${log_file}${RESET}"
  echo ""

  # Run the command — stdout is duplicated to both terminal and log file.
  # Each invocation is a fresh process with no session state carried over.
  {
    echo "=== SPEC FILE: $spec_file ==="
    echo "=== SPEC ID:   $spec_id ==="
    echo "=== RUN DATE:  $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="
    echo "=== PROMPT: ==="
    echo "$task_prompt"
    echo "============================================================"
  } >> "$log_file"

  # Execute Copilot CLI; tee to log while streaming to terminal in real time.
  # We intentionally start a fresh sub-process each iteration (no --continue /
  # --resume flags) so context never bleeds between specs.
  set +e
  "$COPILOT_BIN" $COPILOT_FLAGS -p "$task_prompt" 2>&1 | tee -a "$log_file"
  local exit_code=${PIPESTATUS[0]}
  set -e

  echo "" >> "$log_file"
  echo "=== EXIT CODE: $exit_code ===" >> "$log_file"
  echo "" >> "$log_file"

  return "$exit_code"
}

# ─── PREFLIGHT ───────────────────────────────────────────────────────────────

# Validate specs directory
if [[ ! -d "$SPECS_DIR" ]]; then
  echo -e "${RED}Error: specs directory '${SPECS_DIR}' not found.${RESET}"
  echo -e "Run this script from the project root."
  exit 1
fi

# Validate Copilot CLI is available (check just the first word of the command)
if ! command -v "$COPILOT_BIN" &>/dev/null; then
  echo -e "${RED}Error: Copilot CLI not found at '${COPILOT_BIN}'.${RESET}"
  echo -e "Install GitHub Copilot CLI and ensure it is authenticated, then retry."
  exit 1
fi

# ── Model activation preflight ───────────────────────────────────────────────
# The Copilot CLI requires a one-time interactive opt-in per model.
# Test with a cheap -p call; if it returns the "enable this model" error,
# launch an interactive session so the user can accept, then continue.
echo -e "${DIM}Checking model availability (${COPILOT_FLAGS})...${RESET}"
model_check=$("$COPILOT_BIN" $COPILOT_FLAGS -p "ping" 2>&1 || true)
if echo "$model_check" | grep -qi "enable this model"; then
  echo ""
  echo -e "${YELLOW}⚠  Model not yet activated in interactive mode.${RESET}"
  echo -e "   The Copilot CLI requires a one-time opt-in for this model."
  echo -e "   ${BOLD}An interactive session will open now — type anything, then /exit.${RESET}"
  echo ""
  printf "   Press ENTER to open the activation session... "
  read -r </dev/tty
  "$COPILOT_BIN" $COPILOT_FLAGS </dev/tty
  echo ""
  echo -e "${GREEN}${SYM_OK}  Interactive session closed. Resuming script...${RESET}"
fi

mkdir -p "$LOG_DIR"

# ─── COLLECT ALL SPEC FILES ──────────────────────────────────────────────────

all_spec_files=()
while IFS= read -r line; do
  all_spec_files+=("$line")
done < <(ls -1 "${SPECS_DIR}"/*.sdd.md 2>/dev/null | sort)

if [[ ${#all_spec_files[@]} -eq 0 ]]; then
  echo -e "${YELLOW}No *.sdd.md files found in '${SPECS_DIR}'.${RESET}"
  exit 0
fi

# ─── SESSION HEADER ──────────────────────────────────────────────────────────

clear
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║         SDD Agentic — Copilot CLI Runner             ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Total specs:${RESET}  ${#all_spec_files[@]}"
echo -e "  ${BOLD}CLI command:${RESET}  ${CYAN}${COPILOT_BIN} ${COPILOT_FLAGS} -p <prompt>${RESET}"
echo -e "  ${BOLD}Log output:${RESET}   ${LOG_DIR}/"
echo -e "  ${BOLD}Skip status:${RESET}  ${SKIP_STATUSES:-"(none)"}"
echo ""
echo -e "  ${BOLD}${YELLOW}Select the range of specs to run:${RESET}"

# Populate RANGE_START / RANGE_END globals
RANGE_START=""
RANGE_END=""
ask_range

echo ""
echo -e "  ${BOLD}Run range:${RESET}    ${GREEN}${RANGE_START}${RESET}  →  ${GREEN}${RANGE_END}${RESET}"
echo ""

# ─── FILTER SPEC FILES BY RANGE ──────────────────────────────────────────────

spec_files=()
# Extract numeric part of RANGE_START/END for arithmetic comparison
range_start_num=$(( 10#${RANGE_START#SDD-} ))
range_end_num=$(( 10#${RANGE_END#SDD-} ))
for f in "${all_spec_files[@]}"; do
  fid=$(extract_field "spec_id" "$f")
  fid_num=$(( 10#${fid#SDD-} ))
  if (( fid_num >= range_start_num && fid_num <= range_end_num )); then
    spec_files+=("$f")
  fi
done

total=${#spec_files[@]}

if [[ $total -eq 0 ]]; then
  echo -e "${YELLOW}No specs found in range ${RANGE_START} → ${RANGE_END}.${RESET}"
  exit 0
fi

echo -e "  ${BOLD}Specs in range:${RESET} ${total}"
echo ""

if ! ask_yn "Ready to start? Proceed with SDD run (${RANGE_START} → ${RANGE_END})?"; then
  echo -e "\n${YELLOW}Aborted.${RESET}"
  exit 0
fi

# ─── MAIN LOOP ───────────────────────────────────────────────────────────────

index=0
skipped=0
processed=0
failed=0
session_log="${LOG_DIR}/session-$(date '+%Y%m%d-%H%M%S').log"

for spec_file in "${spec_files[@]}"; do
  index=$(( index + 1 ))
  filename=$(basename "$spec_file" .sdd.md)

  # Extract frontmatter metadata
  spec_id=$(extract_field "spec_id" "$spec_file")
  title=$(extract_field "title"    "$spec_file")
  status=$(extract_field "status"  "$spec_file")

  # Fallback if extraction failed
  spec_id="${spec_id:-$filename}"
  title="${title:-unknown}"
  status="${status:-unknown}"

  print_banner "$spec_id" "$title" "$status" "$index" "$total"

  # ── Auto-skip by status ───────────────────────────────────────────────────
  for skip_status in $SKIP_STATUSES; do
    if [[ "$status" == "$skip_status" ]]; then
      echo -e "  ${DIM}${SYM_SKIP}  Skipping (status = ${status})${RESET}"
      skipped=$(( skipped + 1 ))
      echo "$spec_id  [SKIPPED — status=$status]" >> "$session_log"
      continue 2  # jump to next spec_file iteration
    fi
  done

  # ── Ask before each spec ─────────────────────────────────────────────────
  if ! ask_yn "Develop ${spec_id} — \"${title}\"?"; then
    echo -e "  ${YELLOW}${SYM_SKIP}  Skipped by user.${RESET}"
    skipped=$(( skipped + 1 ))
    echo "$spec_id  [SKIPPED — user choice]" >> "$session_log"
    continue
  fi

  # ── Run Copilot CLI ──────────────────────────────────────────────────────
  run_log="${LOG_DIR}/${spec_id}-$(date '+%Y%m%d-%H%M%S').log"
  echo "$spec_id  [STARTED]" >> "$session_log"

  exit_code=0
  run_copilot "$spec_file" "$spec_id" "$run_log" || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    echo -e "\n  ${GREEN}${SYM_OK}  Copilot finished successfully.${RESET}"
    echo -e "  ${DIM}${SYM_LOG}  Log saved: ${run_log}${RESET}"
    echo "$spec_id  [OK]" >> "$session_log"
    processed=$(( processed + 1 ))
  else
    echo -e "\n  ${RED}⚠  Copilot exited with code ${exit_code}.${RESET}"
    echo -e "  ${DIM}${SYM_LOG}  Log saved: ${run_log}${RESET}"
    echo "$spec_id  [FAILED — exit=$exit_code]" >> "$session_log"
    failed=$(( failed + 1 ))
  fi

  # ── Gateway: proceed to next? ─────────────────────────────────────────────
  if [[ $index -lt $total ]]; then
    next_file="${spec_files[$index]}"   # next index (0-based already advanced)
    next_id=$(extract_field "spec_id" "$next_file")
    next_title=$(extract_field "title" "$next_file")
    if ! ask_yn "Proceed to next spec: ${next_id} — \"${next_title}\"?"; then
      echo -e "\n${YELLOW}Session stopped by user after ${spec_id}.${RESET}"
      break
    fi
  fi

done

# ─── SESSION SUMMARY ─────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║                   Session Complete                  ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${GREEN}${SYM_OK}  Developed  : ${processed}${RESET}"
echo -e "  ${DIM}${SYM_SKIP}  Skipped    : ${skipped}${RESET}"
if [[ $failed -gt 0 ]]; then
  echo -e "  ${RED}⚠   Failed     : ${failed}${RESET}"
fi
echo ""
echo -e "  ${BOLD}Session log:${RESET} ${session_log}"
echo ""
echo -e "${BOLD}${GREEN}${SYM_DONE}  All done!${RESET}"
echo ""
