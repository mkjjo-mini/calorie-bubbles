# AI 비상 차단/해제 절차

> **언제 보는 문서**: Gemini 비용 폭주·API 장애·abuse 발견·심사 사유로 AI 기능을 즉시 끄거나 다시 켜야 할 때
>
> **관련 코드**: `src/server/api/ai-food.ts:160-168` (env 체크 위치) · `src/server/auth/env.ts` (Env 인터페이스)
> **관련 PRD**: `products/tandanji-bubble/prd/v1-steps/step-17-entitlements.md` §10 작업 14

---

## 환경별 토글 위치 (가장 헷갈리는 부분)

| 환경 | 적용 방법 | 적용 시간 |
|---|---|---|
| **dev (로컬 vite)** | `calorie-bubbles/.env.local`에 `AI_FEATURE_ENABLED=false` + `npm run dev` 재시작 | 재시작 즉시 |
| **prod (Cloudflare Worker)** | `npx wrangler secret put AI_FEATURE_ENABLED` | 보통 30초~1분, **재배포 불필요** |

> **prod는 wrangler secret이 유일한 진실 원천.** `.env.local`은 dev에서만 읽힘. 운영 서버는 `.env.local`을 본 적도 없음. `wrangler.jsonc`의 `vars`에 적는 것도 금지(4.x에서 빈값 처리 이슈).

---

## 🚨 비상 차단 (prod)

```bash
cd calorie-bubbles
echo "false" | npx wrangler secret put AI_FEATURE_ENABLED
```

또는 대화형:
```bash
npx wrangler secret put AI_FEATURE_ENABLED
# 프롬프트에 `false` 입력 후 Enter
```

**즉시 효과**: 모든 `/api/ai-food/analyze` 호출이 503 `AI_DISABLED` 응답. Gemini 비호출 → **비용 즉시 정지**.

클라이언트엔 친절 메시지 노출됨 — `src/components/AiAddSheet.tsx`의 `translateAiError` FRIENDLY set에 `AI_DISABLED` 포함.

---

## ✅ 차단 확인

```bash
curl -s https://tandanjibubble.app/api/ai-food/analyze \
  -X POST -H "content-type: application/json" \
  -d '{"mode":"text","text":"테스트"}' -w "\n%{http_code}\n"
# 기대: 503 + { "code": "AI_DISABLED", ... }
```

`wrangler secret list`로 secret 등록 자체도 확인 가능 (값은 표시되지 않음).

---

## 🟢 차단 해제

```bash
# 옵션 A: secret 자체 삭제 (env 미설정 = 활성 — 코드 분기 if env.AI_FEATURE_ENABLED === "false")
npx wrangler secret delete AI_FEATURE_ENABLED

# 옵션 B: "true"로 덮어쓰기 (분기상 동일)
echo "true" | npx wrangler secret put AI_FEATURE_ENABLED
```

해제도 즉시 반영. 위 curl이 정상 응답(또는 인증 에러 401)이 돌아오면 정상.

---

## 비상 사태별 대응 표

| 시나리오 | 1차 조치 | 2차 조치 |
|---|---|---|
| Gemini 비용 폭주 / abuse | 즉시 차단 | `wrangler tail` + `ai_usage` 테이블에서 폭주 user_id 식별 |
| Gemini API 장애 | 즉시 차단 | Gemini Status 확인 후 복구되면 해제 |
| 클라이언트 무한 retry 버그 | 즉시 차단 | hotfix deploy 후 해제 |
| Apple 심사 사유 임시 비활성 | 즉시 차단 | 필요 시 메시지를 안내성으로 변경 (`src/server/api/ai-food.ts:165`) |

---

## 추가 안전망

### 빠른 롤백 (코드 자체 문제 시)
```bash
npx wrangler deployments list
npx wrangler rollback <이전-version-id>
```
secret과 무관하게 이전 코드로 즉시 복귀.

### Worker tail (실시간 로그)
```bash
npx wrangler tail --format pretty
```
비상 차단 후 호출 시도 패턴 관찰.

### Supabase에서 abuse user_id 식별
```sql
SELECT user_id, used_on, count
FROM ai_usage
WHERE used_on = CURRENT_DATE
ORDER BY count DESC
LIMIT 20;
```

---

## ❌ 절대 하지 말 것

- `.env.local`에 `AI_FEATURE_ENABLED=false` 추가 후 `npm run deploy` — `.env.local`은 `.gitignore`되고 wrangler는 별도 secret만 봄. **prod에 안 들어감**.
- `wrangler.jsonc`의 `vars`에 `AI_FEATURE_ENABLED` 추가 — `wrangler.jsonc` 코멘트(line 12)에 명시된 대로 wrangler 4.x에서 빈값 처리 이슈.
- 차단만 하고 사용자 안내 없음 — 사용자가 "고장 났나?" 오해. 차단 시 Toss DM·공지 채널 활용 권장.

---

## 참고: 코드 분기

```typescript
// src/server/api/ai-food.ts:160-168
if (env.AI_FEATURE_ENABLED === "false") {
  return jsonError(
    503,
    "AI_DISABLED",
    "AI 기능을 일시 점검 중이에요. 잠시 후 다시 시도하거나 직접 입력으로 등록해주세요.",
  );
}
```

- 정확히 문자열 `"false"`만 차단. `"FALSE"`, `"0"`, `false`(boolean) 등은 차단 X.
- 인증(`withUser`)보다 먼저 동작 → 미로그인 호출도 즉시 503.
