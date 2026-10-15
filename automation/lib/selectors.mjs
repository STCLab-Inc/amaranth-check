// 단일 출처 로케이터. 각 항목은 primary + fallbacks(순서대로 시도) — 화면 변경 시 여기만 고친다.
// doctor 명령이 이 표를 라이브 화면에 대조해 드리프트를 보고한다 (자동 치유 대신 리뷰 가능한 diff).
export const ROUTES = {
  home: "/",
  login: "/#/login",
  attendanceForm: "/#/HP/HPD0110/HPD0110",      // 근태신청서
  attendanceStatus: "/#/HP/HPD0120/HPD0120",    // 개인근태신청현황
  eapHome: "/#/UB/UB/UBA0000?specialLnb=Y&moduleCode=UB&menuCode=UBA&pageCode=UBA7000", // 결재 HOME
};

export const SEL = {
  common: {
    noticePopup: ["[data-orbit-component=OBTDialog].open.ERPNoticePop"],   // 모듈 공지 — 아래 화면 클릭을 가로막음
    noticeClose: ["role=button[name=/^\\s*닫기\\s*$/]"],
  },
  login: {
    company: ["#reqCompCd"],
    userId: ["#reqLoginId"],
    nextBtn: ["button:has-text('다음')"],
    password: ["#reqLoginPw"],
    loginBtn: ["button:has-text('로그인')"],
  },
  leave: {
    formCard: ["li:has-text('연차휴가신청서')", "text=연차휴가신청서"],
    // 휴가구분 버튼: 정확한 텍스트 매칭 (연차 vs 연차(보상) 구분)
    kindBtn: (kind) => [`role=button[name=/^\\s*${kind.replace(/[()]/g, "\\$&")}\\s*$/]`, `button:has-text('${kind}')`],
    // OBTDatePicker 입력 2개(시작/종료). 신청정보 영역의 첫 두 개.
    dateInputs: ["input[class*='OBTDatePickerRebuild_inputYMD']"],
    // 비고(사유): 라벨 다음의 첫 활성 text input
    reason: ["xpath=//*[normalize-space(text())='비고(사유)']/following::input[@type='text'][not(@disabled)][1]"],
    days: ["xpath=//*[normalize-space(text())='신청일수']/following::input[1]"],
    // 시간연차: OBTTimePicker2 두 개 = 입력 6칸(시작 오전/오후·시·분, 종료 오전/오후·시·분). 소요시간은 화면이 계산(disabled)
    timeInputs: ["input[class*='OBTTimePicker2_input']"],
    duration: ["xpath=//*[normalize-space(text())='시작/종료시간']/following::input[@disabled][1]"],
    completeBtn: ["role=button[name=/^\\s*신청완료\\s*$/]", "button:has-text('신청완료')"],   // 1단계→2단계 (제출 아님)
    step2Marker: ["text=상신정보"],
    submitBtn: ["role=button[name=/^\\s*결재상신\\s*$/]"],     // ❌ 절대 클릭하지 않는다
    cancelBtn: ["role=button[name=/^\\s*신청취소\\s*$/]", "button:has-text('신청취소')"],
    prevBtn: ["role=button[name=/^\\s*이전단계\\s*$/]", "button:has-text('이전단계')"],
    toast: [".OBTSnackbar", "[class*='snackbar']"],
  },
  proposal: {
    formCard: (name) => [`text=${name}`],
    // 라벨 "제         목"은 nbsp 포함 → 정규식 매칭 후 다음 text input
    title: ["td:text-matches('^\\s*제[\\s\\u00a0]*목\\s*$') >> xpath=following::input[@type='text'][1]", "xpath=//*[normalize-space(translate(text(),'\u00a0',' '))='제 목']/following::input[@type='text'][1]"],
    editorOuter: ["iframe#editorView_UBAP001", "iframe[id^='editorView']"],
    editorInner: ["iframe#dzeditor_0", "iframe[id^='dzeditor_']"],
    fileInput: ["input[type=file] >> nth=0"],   // 첫 번째 file input이 실제 업로더 (#uploadFile은 무반응)
    attachCount: ["xpath=//*[contains(normalize-space(.),'첨부파일') and contains(normalize-space(.),'개')]"],
    saveBtn: ["text=보관"],                      // 임시저장 = 도구의 종착점
    submitBtn: ["text=상신"],                    // ❌ 절대 클릭하지 않는다
    deleteBtn: ["text=삭제"],
  },
  // 지출결의 = 업무경비청구서(경비청구작성 APA0010). 결재 HOME 카드 → 같은 탭 이동 → STEP2 '지출정보등록' → '신규' 다이얼로그
  expense: {
    formCard: ["text=업무경비청구서"],
    step2Btn: ["role=button[name=/^\\s*지출정보등록\\s*$/]"],
    newBtn: ["role=button[name=/^\\s*신규\\s*$/]"],
    claimMonth: ["input[placeholder='청구년월(경비청구)코드도움']"],
    dialog: ["[data-orbit-component=OBTDialog].open.APA0010"],
    // 다이얼로그 안 (dialog 기준 상대 로케이터)
    title: ["text='지출정보등록'"],                       // 빈 영역 클릭용(열린 시각 목록 닫기)
    evidence: (label) => [`label:text-is('${label}')`, `text='${label}'`],
    useTime: ["[data-orbit-component=OBTTimePicker]"],   // 구형 피커: input이 아니라 span 3개
    useDate: ["input[class*='OBTDatePickerRebuild_inputYMD']"],
    place: ["input[placeholder='사용처를 입력해주세요']"],
    amount: ["input[placeholder='청구금액을 입력해주세요']"],
    usage: ["input[placeholder='용도(경비청구) 코드도움']"],
    memo: ["input[placeholder='내용을 입력해주세요']"],
    bizNo: ["xpath=.//*[normalize-space(text())='사업자등록번호']/following::input[@type='text'][1]"],
    approvalNo: ["xpath=.//*[normalize-space(text())='승인번호']/following::input[@type='text'][1]"],
    fileInput: ["input[type=file][multiple]:not(#uploadFile)", "input[type=file]:not([accept='.xlsx'])"],
    // "첨부파일 N개 0 Bytes"가 여러 span으로 쪼개져 있다 → 둘 다 포함하는 가장 안쪽 요소
    attachCount: ["xpath=.//*[contains(normalize-space(.),'첨부파일') and contains(normalize-space(.),'Bytes')][not(.//*[contains(normalize-space(.),'첨부파일') and contains(normalize-space(.),'Bytes')])]"],
    attendees: ["input[placeholder^='참석자']"],          // 식대 계열 용도를 고르면 나타난다
    cancelBtn: ["role=button[name=/^\\s*취소\\s*$/]"],
    confirmBtn: ["role=button[name=/^\\s*확인\\s*$/]"],     // 다이얼로그 확인 = 그리드 행 추가. 도구는 누르지 않는다(사람이 확인·저장)
    saveBtn: ["role=button[name=/^\\s*저장\\s*$/]"],        // ❌ 절대 클릭하지 않는다
    // 용도 코드도움 다이얼로그 (OBTDialog2, 결과 그리드는 canvas)
    codeHelp: { dialog: "[class*=OBTDialog2_dialogRootOpen]", search: "input[type=text]", confirm: "role=button[name=/^\\s*확인\\s*$/]", cancel: "role=button[name=/^\\s*취소\\s*$/]" },
  },
};

export const FORMS = {
  proposal: { name: "기안서-30만원 이상", formId: 1 },
  expense: { name: "업무경비청구서", formId: 19 },
};

/** 후보 로케이터를 순서대로 시도해 첫 번째로 존재하는 것을 돌려준다. */
export async function pick(scope, candidates, { timeout = 8000 } = {}) {
  const list = typeof candidates === "function" ? candidates() : candidates;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const c of list) {
      const loc = scope.locator(c).first();
      if ((await loc.count().catch(() => 0)) > 0) return loc;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`로케이터 없음: ${JSON.stringify(list)} — 'amaranth doctor'로 드리프트 확인`);
}
