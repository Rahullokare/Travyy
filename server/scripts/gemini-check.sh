#!/usr/bin/env bash
# Times a few small Gemini requests with your key, to see which model and settings answer.
# Usage: bash server/scripts/gemini-check.sh [model ...]   (asks for the key; it isn't echoed or saved)
set -u
if [ -z "${GEMINI_API_KEY:-}" ]; then
  read -rsp "Paste your Gemini API key (hidden): " GEMINI_API_KEY
  echo
fi

PROMPT='Post text: """3 spots in Lisbon: Cervejaria Ramiro, Miradouro da Senhora do Monte, Pastéis de Belém"""'
SCHEMA='{"type":"OBJECT","properties":{"places":{"type":"ARRAY","items":{"type":"OBJECT","properties":{"name":{"type":"STRING"},"city":{"type":"STRING","nullable":true}},"required":["name","city"]}}},"required":["places"]}'

run() {
  local label=$1 model=$2 config=$3
  local body
  body=$(printf '{"contents":[{"role":"user","parts":[{"text":%s}]}],"generationConfig":%s}' \
    "$(printf '%s' "$PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" "$config")
  local out
  out=$(curl -s --max-time 60 -w '\n%{http_code} %{time_total}' \
    "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent" \
    -H 'Content-Type: application/json' -H "x-goog-api-key: $GEMINI_API_KEY" -d "$body")
  local status=${out##*$'\n'}
  local json=${out%$'\n'*}
  printf '%-34s HTTP %s s  ' "$label" "$status"
  printf '%s' "$json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("(no JSON: timed out or empty)"); sys.exit()
if "error" in d:
    print("error:", d["error"].get("status"), d["error"].get("message", "")[:150]); sys.exit()
c = (d.get("candidates") or [{}])[0]
text = "".join(p.get("text", "") for p in c.get("content", {}).get("parts", []))
u = d.get("usageMetadata", {})
print("finish=%s out=%s thoughts=%s text=%r" % (c.get("finishReason"), u.get("candidatesTokenCount"), u.get("thoughtsTokenCount"), text[:80]))
'
}

# Models to try: arguments, or the free Flash models.
MODELS=("$@")
[ ${#MODELS[@]} -eq 0 ] && MODELS=(gemini-3.8-flash gemini-3.6-flash gemini-3.5-flash-lite gemini-3.1-flash-lite gemini-3-flash-preview)
for model in "${MODELS[@]}"; do
  run "$model json+schema" "$model" "{\"responseMimeType\":\"application/json\",\"responseSchema\":$SCHEMA}"
done
