#!/usr/bin/env bash
set -euo pipefail

API_URL="${RELAY_API_URL:-https://code-api.stoff.dev}"
API_KEY="${RELAY_API_KEY:-Ns_hyu-hm9PsaXJTUSSrzTcQKIVgAAFVNjvOoOHwNN8}"
OWNER_TOKEN="${RELAY_OWNER_TOKEN:-24ee1063-4da4-4408-bd0c-773b5d0c7ccf}"
SPACETIME_CLI="${SPACETIME_CLI:-$HOME/.local/bin/spacetime}"
RUN_ID="bench-$(date +%s)"
RESULTS_DIR="$(dirname "$0")/../benchmarks"
mkdir -p "$RESULTS_DIR"
RESULTS_FILE="$RESULTS_DIR/$RUN_ID.jsonl"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

declare -a PROMPTS=(
	"simple|What is the capital of France?"
	"simple-math|What is 47 * 23?"
	"severity|Find the relay project what is the highest severity task?"
	"file-find|Find the relay project and list the files in the apps directory"
	"grep-code|Find the relay project and search for where dispatch_tool_call is defined"
	"read-file|Find the relay project and show me the first 20 lines of Cargo.toml"
	"multi-tool|Find the relay project, list the top level directories, then show the contents of package.json"
	"explain|What tools do you have access to? List them briefly."
	"summarize|Find the relay project and give me a one sentence summary of what it does based on the package.json"
	"shell|Run the command 'echo hello from relay benchmark' and show me the output"
	"trace-flow|In the relay project, trace how a chat message flows from the HTTP handler to the LLM response. Show me the function call chain with file paths and line numbers."
	"cross-ref|In the relay project, list every tool name defined in the server's tool_definitions function, then check which of those tools actually have implementation files in apps/agent/src/tools/. Are any missing or mismatched?"
	"env-audit|In the relay project server, find every environment variable it reads (look for std::env::var calls), and tell me which ones have defaults and which are required. Show the actual default values."
	"count-code|In the relay project, how many .rs files are there vs .ts/.tsx files? And roughly how many total lines of code in each language? Use shell commands to count."
	"debug-path|In the relay project, what happens when a tool execution times out? Trace the error handling from the timeout in tools.rs through to what the user sees in the frontend. Show the actual code path."
)

run_single_bench() {
	local label="$1"
	local prompt="$2"
	local session_id="${RUN_ID}-${label}"
	local out_file="$TMP_DIR/${label}.result"

	local start_ms
	start_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')

	local raw_response
	raw_response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/chat" \
		-H "Content-Type: application/json" \
		-H "x-api-key: $API_KEY" \
		-d "{\"message\": $(printf '%s' "$prompt" | jq -Rs .), \"session_id\": \"$session_id\", \"owner_token\": \"$OWNER_TOKEN\"}" 2>/dev/null || echo -e "\n000")

	local http_code
	http_code=$(echo "$raw_response" | tail -1)

	if [[ "$http_code" != "200" ]]; then
		local end_ms
		end_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')
		local elapsed=$((end_ms - start_ms))
		echo "{\"label\":\"$label\",\"session_id\":\"$session_id\",\"status\":\"http_error\",\"http_code\":$http_code,\"elapsed_ms\":$elapsed,\"answer_len\":0,\"tools\":0,\"answer\":\"\"}" >"$out_file"
		return
	fi

	local timeout=90
	local start_s
	start_s=$(date +%s)
	local final_status="timeout"

	while true; do
		local now_s
		now_s=$(date +%s)
		if ((now_s - start_s >= timeout)); then
			break
		fi
		local status
		status=$(PATH="$HOME/.cargo/bin:$PATH" "$SPACETIME_CLI" sql relay \
			"SELECT status FROM session WHERE id = '$session_id'" 2>/dev/null | grep -oE '(idle|streaming|waiting_for_tool|error)' | head -1 || echo "")
		if [[ "$status" == "idle" || "$status" == "error" ]]; then
			final_status="$status"
			break
		fi
		sleep 1
	done

	local end_ms
	end_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')
	local elapsed=$((end_ms - start_ms))

	local assistant_id
	assistant_id=$(PATH="$HOME/.cargo/bin:$PATH" "$SPACETIME_CLI" sql relay \
		"SELECT id FROM message WHERE session_id = '$session_id' AND role = 'assistant'" 2>/dev/null | grep -oE '[0-9a-f-]{36}' | tail -1 || echo "")

	local answer=""
	if [[ -n "$assistant_id" ]]; then
		local raw_parts
		raw_parts=$(PATH="$HOME/.cargo/bin:$PATH" "$SPACETIME_CLI" sql relay \
			"SELECT content FROM message_part WHERE message_id = '$assistant_id'" 2>/dev/null || echo "")
		answer=$(echo "$raw_parts" | sed '1,2d' | sed '/^$/d')
	fi

	local tool_info
	tool_info=$(PATH="$HOME/.cargo/bin:$PATH" "$SPACETIME_CLI" sql relay \
		"SELECT tool_name, status FROM tool_command WHERE session_id = '$session_id'" 2>/dev/null || echo "")
	local tool_count
	tool_count=$(echo "$tool_info" | grep -c "completed" 2>/dev/null || true)
	tool_count=${tool_count:-0}

	local answer_len=${#answer}
	local answer_json
	answer_json=$(echo "$answer" | jq -Rs . 2>/dev/null || echo '""')

	echo "{\"label\":\"$label\",\"session_id\":\"$session_id\",\"status\":\"$final_status\",\"elapsed_ms\":$elapsed,\"answer_len\":$answer_len,\"tools\":$tool_count,\"answer\":$answer_json}" >"$out_file"
}

echo "========================================================"
echo "  Relay Benchmark: $RUN_ID"
echo "  API: $API_URL"
echo "  Mode: parallel (all tests at once)"
echo "  Results: $RESULTS_FILE"
echo "========================================================"
echo ""

wall_start=$(python3 -c 'import time; print(int(time.time() * 1000))')

pids=()
labels=()
for entry in "${PROMPTS[@]}"; do
	label="${entry%%|*}"
	prompt="${entry#*|}"
	labels+=("$label")
	run_single_bench "$label" "$prompt" &
	pids+=($!)
done

echo "Launched ${#pids[@]} tests in parallel, waiting..."
echo ""

for pid in "${pids[@]}"; do
	wait "$pid" 2>/dev/null || true
done

wall_end=$(python3 -c 'import time; print(int(time.time() * 1000))')
wall_total=$((wall_end - wall_start))

printf "%-15s %-8s %8s %6s  %s\n" "TEST" "STATUS" "TIME" "TOOLS" "ANSWER"
printf "%-15s %-8s %8s %6s  %s\n" "----" "------" "----" "-----" "------"

total_pass=0
total_fail=0
total_empty=0
sum_ms=0

for label in "${labels[@]}"; do
	local_file="$TMP_DIR/${label}.result"
	if [[ ! -f "$local_file" ]]; then
		printf "%-15s %-8s %8s %6s  %s\n" "$label" "MISSING" "" "" "(no result file)"
		total_fail=$((total_fail + 1))
		continue
	fi

	result=$(cat "$local_file")
	cat "$local_file" >>"$RESULTS_FILE"

	status=$(echo "$result" | jq -r '.status')
	elapsed=$(echo "$result" | jq -r '.elapsed_ms')
	answer_len=$(echo "$result" | jq -r '.answer_len')
	tool_count=$(echo "$result" | jq -r '.tools')
	answer_preview=$(echo "$result" | jq -r '.answer' | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-65)

	sum_ms=$((sum_ms + elapsed))

	status_tag=""
	if [[ "$status" == "timeout" ]]; then
		status_tag="TIMEOUT"
		total_fail=$((total_fail + 1))
	elif [[ "$status" == "http_error" ]]; then
		status_tag="ERROR"
		total_fail=$((total_fail + 1))
	elif [[ "$answer_len" -lt 3 ]]; then
		status_tag="EMPTY"
		total_empty=$((total_empty + 1))
	else
		status_tag="OK"
		total_pass=$((total_pass + 1))
	fi

	tools_str=""
	if [[ "$tool_count" -gt 0 ]]; then
		tools_str="$tool_count"
	fi

	printf "%-15s %-8s %7dms %6s  %s\n" "$label" "$status_tag" "$elapsed" "$tools_str" "$answer_preview"
done

count=$((total_pass + total_empty + total_fail))
avg=0
if ((count > 0)); then
	avg=$((sum_ms / count))
fi

echo ""
echo "========================================================"
echo "  TOTALS: $total_pass ok, $total_empty empty, $total_fail failed"
echo "  Wall clock: ${wall_total}ms"
echo "  Sum of tests: ${sum_ms}ms  |  Avg per test: ${avg}ms"
echo "  Results saved: $RESULTS_FILE"
echo "========================================================"
