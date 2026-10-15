# 결재 자동화 설계 (automation/)

> 2026-09-07. amaranth-check를 "근태 읽기"에서 "휴가 신청·품의 초안 작성"까지 확장한다.
> 원칙: **상신은 사람이 누른다.** 도구의 종착점은 휴가=1단계(또는 2단계) 입력, 품의=`보관`(임시저장).

## 왜 DOM 자동화인가 (API가 아니라)

- 더존 Amaranth 10은 공개 OpenAPI가 없다. 연동 API(`/system/apiUtilEap/SetInterlockSync` 등)는 파트너 계약 대상이며 커뮤니티에서는 기능당 유료로 알려져 있다 — [SharedIT Q&A](https://www.sharedit.co.kr/qnaboards/27429), [더존 제품 페이지](https://www.douzone.com/product/amaranth10.jsp).
- 백엔드 호출은 `wehago-sign`(HMAC)·`transaction-id` 헤더가 필요해 브라우저 밖 리플레이는 서명 구현이 필요하다 → 브라우저 안에서 DOM을 조작하는 편이 단순하고 안전하다.

## 왜 "결정론 스크립트 + LLM은 파라미터만"인가

- 라이브 사이트에서 LLM 웹 에이전트는 성공률이 크게 떨어진다: Online-Mind2Web은 정적 벤치마크 대비 최대 59% 낮은 성능을, WebArena에서는 프론티어 모델도 ~50% 성공에 그치고 실패 대부분이 **작업 중간**에 발생한다고 보고한다 — [Signal-Driven Observation for Long-Horizon Web Agents (arXiv 2606.06708)](https://arxiv.org/html/2606.06708), [WebArena](https://arxiv.org/pdf/2307.13854), [Mind2Web](https://arxiv.org/html/2306.06070v3).
- 접근성 트리 기반 에이전트는 사이트의 접근성 결함(빈 버튼·빈 링크)을 그대로 물려받는다 — [SEJ, 2026](https://www.searchenginejournal.com/the-accessibility-tree-is-how-ai-agents-read-your-site-its-breaking/578171/). Amaranth의 OBT 컴포넌트도 StaticText 클릭이 먹지 않는 등 이 문제가 실측됐다.
- 따라서 반복 업무(휴가·품의)는 **코드로 굳힌 흐름**(`actions/*.mjs`)으로 돌리고, Claude 스킬은 자연어 → CLI 인자 변환만 담당한다. 모르는 양식은 여전히 에이전트(chrome-devtools)가 탐색한 뒤 코드로 굳힌다.

## 셀렉터 드리프트 대응

상용 self-healing 도구의 공통 패턴은 "의도 + 캐시된 로케이터 + 폴백 후보 + 감사 로그"다 — [Shiplight](https://www.shiplight.ai/blog/best-self-healing-test-automation-tools), [testomat.io](https://testomat.io/blog/self-healing-test-automation/). 자동 치유가 조용히 의도에서 벗어나는 것이 더 위험하므로 여기서는:

- `lib/selectors.mjs` = 단일 출처. 항목마다 primary + fallbacks.
- `amaranth doctor` = 라이브 화면과 대조해 ❌를 보고만 한다(자동 수정 없음). 수정은 PR diff로 리뷰.
- 실측 함정을 로케이터 주석에 남긴다 (예: `제 목` 라벨의 nbsp, `#uploadFile`은 무반응).

## 세션

- 로컬 자동화 스크립트에는 `launchPersistentContext`(persistent profile)가 적합하다는 것이 공식 가이드의 입장이다 — [Playwright Authentication](https://playwright.dev/docs/auth), [BrowserStack](https://www.browserstack.com/guide/playwright-persistent-context).
- 프로필은 `~/.amaranth-automation/session`으로 앱 스크레이퍼(`~/.amaranth-session`)와 분리해 SingletonLock 충돌을 없앤다.
- 자격증명은 앱과 같은 `~/.amaranth-check/config.json`을 읽는다. 로그인 폼의 OBT 입력이 잠시 `disabled`였다가 풀리는 특성 때문에 앱 스크레이퍼에서 fill 타임아웃이 반복됐다(error.log 1,400건) → `fillWhenEnabled`로 활성화를 기다린다.
- 비밀번호는 프로세스 밖으로 내보내지 않는다(로그 redact). Claude가 CLI를 부를 때도 비밀번호는 Claude 컨텍스트에 들어가지 않는다.

## 안전장치

| 행동 | 허용 |
|---|---|
| 휴가 `신청완료`(1→2단계) | `--complete` 옵션일 때만 |
| 휴가 `결재상신` | ❌ 코드에 클릭 경로 없음 (`SEL.leave.submitBtn`은 doctor 점검용) |
| 품의 `보관` | 기본 (`--no-save`로 끔) |
| 품의 `상신` | ❌ 코드에 클릭 경로 없음 |
| 지출결의 다이얼로그 `확인`(행 추가)·STEP2 `저장`·상신 | ❌ 코드에 클릭 경로 없음 — 채운 브라우저를 사람에게 넘긴다. `--dry-run`은 `취소`로 닫는다 |

## 화면 실측 (2026-09-07)

- 휴가: `#/HP/HPD0110/HPD0110` → 카드 `연차휴가신청서` → 휴가구분(atCd 연차 1101/시간연차 1104/연차(보상) 1105/시간연차(보상) 1107) → 기간(OBTDatePicker) → 사유 → `신청완료` → 2단계(결재라인 `[부서]SRE팀 휴가 기안` 단일, 제목 자동) → `결재상신`.
- 품의: 결재 HOME 추천양식 `기안서-30만원 이상`(formId=1) → `window.open` 팝업 → 결재선·수신참조·시행자 자동 → 제목/본문(dzEditor 중첩 iframe, `body.innerHTML` 직접 세팅)/첨부(첫 `input[type=file]`) → `보관`=`fnAppDocSave("10")` → URL에 `docID` 부여. `상신`=`fnAppDocSave("20")`.
- 지출결의(경비청구작성 `APA0010`)는 3단계 위저드(카드내역→지출정보등록→청구내역). 값 입력은 아래 2026-10 실측.

## 화면 실측 (2026-10-15)

- 공통: 모듈 공지 팝업(`OBTDialog.open.ERPNoticePop`)이 뜨면 아래 화면 클릭이 전부 막힌다 → `goto()`가 `닫기`로 닫는다(팝업 안의 `삭제`·`수정`은 건드리지 않음).
- 시간연차: 시작/종료는 `OBTTimePicker2` 두 개 = input 6칸(오전/오후·시·분 ×2). 오전/오후 칸은 ArrowUp=오전·ArrowDown=오후, 시는 12시간제 키 입력. `신청시간`(예 `02시간 30분`)·`신청일수`(예 `0.3125`)는 화면이 계산. 기본값 09:00~18:00 그대로 올라가거나 종료 00:00으로 반려된 실제 사례가 있어 시각 생략을 허용하지 않는다.
- 지출정보등록 다이얼로그(`OBTDialog.open.APA0010`):
  - 다이얼로그 루트가 크기 0(hidden)으로 잡힌다 → 안쪽 입력의 visible로 대기.
  - 증빙 구분(라디오)마다 칸 구성이 다르다: 개인현금에는 카드·사업자등록번호·승인번호 칸이 없다. 식대 계열 용도를 고르면 `참석자` 칸이 생긴다.
  - 사용시간은 구형 `OBTTimePicker` — input이 아니라 span 3개. 입력하면 시각 목록(ul)이 열려 아래 칸을 가린다. Tab으로 안 닫혀 다이얼로그 제목을 클릭해 닫는다(Escape는 다이얼로그까지 닫을 위험).
  - 사용일 DatePicker는 근태신청서와 달리 **Tab이면 되돌리고 Enter로 확정**한다 → `setDate`가 Tab→Enter→fill 순으로 시도하고 화면 값으로 판정.
  - 용도 = 코드도움. 옆 아이콘 → `OBTDialog2` 검색 다이얼로그(결과 그리드는 canvas라 행을 DOM으로 못 고름) → 코드 번호로 검색해 첫 행 `확인` → 입력값 `103. 식대 - 기타` 형식으로 검증. 이 `확인`은 입력칸 선택일 뿐 저장이 아니다.
  - 첨부: 다이얼로그의 `input[type=file][multiple]`(`.xlsx` 업로더·`#uploadFile` 제외). 선택 즉시 `첨부파일 N개` 갱신으로 검증.
- 시간연차는 **길이가 1시간 단위**여야 한다("시간연차는 1시간 단위로 신청가능합니다." 토스트, 시작 분은 자유 — 09:14~10:14 승인 사례). 위반 시 `신청완료`가 조용히 1단계에 머문다 → 도구가 입력 전에 거부. 토스트는 금방 사라지므로 `신청완료` 클릭 전 MutationObserver로 문구를 모아 실패 메시지에 싣는다.
- 날짜 입력 flake(headed에서 잦음): ① click+Meta+A가 가끔 선택을 못 해 숫자가 기존 값 사이에 끼어든다(`0261-02-1_`) → `selectText()`로 전체 선택. ② 휴가구분·증빙 구분 클릭 직후 화면이 기본 정보를 다시 받아 날짜를 오늘로 덮는다 → `setDatesStable`이 networkidle 후 전 칸 재확인·재입력(최대 3회).
- 결재 HOME 왼쪽 메뉴 배지 = 문서함 건수(미결·기결(진행)·수신참조·수신·시행). 배지 없음 = 0건.
