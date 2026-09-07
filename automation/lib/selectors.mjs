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
};

export const FORMS = {
  proposal: { name: "기안서-30만원 이상", formId: 1 },
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
