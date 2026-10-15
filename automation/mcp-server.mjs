#!/usr/bin/env node
// Amaranth MCP 서버 (stdio) — 에이전트가 근태/전자결재를 도구로 다룬다.
// 브라우저 세션은 서버 프로세스가 유지한다. 사람이 마무리해야 하는 작업(휴가 결재상신)은 headed 창을 열어둔 채 반환한다.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openSession, ensureLoggedIn } from "./lib/session.mjs";
import { applyLeave, KINDS } from "./actions/leave.mjs";
import { draftProposal } from "./actions/proposal.mjs";
import { status } from "./actions/status.mjs";
import { fillExpense, listUsage, EVIDENCE } from "./actions/expense.mjs";
import { doctor } from "./actions/doctor.mjs";
import { buildProposalBody, textToHtml } from "./lib/body.mjs";
import { log } from "./lib/log.mjs";

log.json = true; // stdout은 MCP 전용 — 로그는 stderr로만
let session = null; // { context, page, headed }

async function getPage({ headed = false } = {}) {
  if (session && session.headed !== headed) { await session.context.close().catch(() => {}); session = null; }
  if (!session) {
    const { context, page } = await openSession({ headed });
    session = { context, page, headed };
    context.on("close", () => { session = null; });
  }
  await ensureLoggedIn(session.page);
  return session.page;
}
const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: `error: ${e.message}` }] });

const server = new McpServer({ name: "amaranth", version: "0.1.0" });

server.registerTool("amaranth_status", {
  description: "Amaranth 읽기 전용 현황: 오늘 출퇴근 시각, 연차 부여/사용/잔여, 최근 상신문서 상태(진행/반려/종결), 결재 문서함 건수(미결·진행·수신참조·수신·시행). 부작용 없음.",
  inputSchema: { include: z.array(z.enum(["attendance", "leave", "approvals", "boxes"])).optional().describe("생략 시 전부") },
}, async ({ include }) => { try { return ok(await status(await getPage(), include ? { include } : {})); } catch (e) { return fail(e); } });

server.registerTool("amaranth_leave_apply", {
  description: `휴가(근태신청서) 입력. 휴가구분·기간·사유를 채우고, complete=true면 '신청완료'로 2단계(결재라인·제목 자동)까지 진행한다. ` +
    `'결재상신'은 절대 누르지 않는다 — 브라우저 창을 열어둔 채 반환하므로 사람이 그 창에서 결재상신을 눌러야 한다. 끝나면 amaranth_close_browser 호출.`,
  inputSchema: {
    kind: z.enum(KINDS).default("연차"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("시작일 YYYY-MM-DD"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("종료일, 생략 시 from"),
    start: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("시간연차 시작 HH:MM(24시). 시간연차·시간연차(보상)이면 필수"),
    end: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("시간연차 종료 HH:MM(24시). 시작보다 늦어야 함"),
    reason: z.string().default(""),
    complete: z.boolean().default(true).describe("신청완료(2단계)까지 진행"),
    screenshot: z.string().optional().describe("저장할 스크린샷 경로(.png)"),
  },
}, async (a) => {
  try {
    const page = await getPage({ headed: true });
    const r = await applyLeave(page, { ...a, to: a.to || a.from, handoffMode: false });
    return ok({ ...r, humanNext: r.step === 2 ? "열린 브라우저에서 내용 확인 후 '결재상신' 클릭" : "열린 브라우저에서 '신청완료' → '결재상신' 클릭", browserOpen: true });
  } catch (e) { return fail(e); }
});

server.registerTool("amaranth_proposal_draft", {
  description: "품의(기안서-30만원 이상) 초안을 작성해 '보관'(임시저장)한다. 결재선·수신참조·시행자는 양식이 자동 세팅. 본문은 회사 관례 구조(제목줄→대상→비용 내역→결제 정보→담당자)로 생성. '상신'은 절대 누르지 않는다 — 사람이 Amaranth 전자결재 임시보관함에서 확인 후 상신.",
  inputSchema: {
    title: z.string().min(1),
    headline: z.string().optional().describe("본문 첫 줄, 예: 'ISO 27001 인증심사 비용 품의'"),
    target: z.array(z.string()).default([]).describe("대상 정보 줄들, 예: ['심사기관: ...','심사 일정: ...']"),
    costs: z.array(z.string()).default([]).describe("예: ['현장심사비: 3,000,000원','부가세: 300,000원','합계: 3,300,000원 (VAT 포함)']"),
    payment: z.array(z.string()).default([]).describe("예: ['입금은행: ...','계좌번호: ...','예금주: ...','결제 기한: ...']"),
    contact: z.array(z.string()).default([]).describe("예: ['홍길동 팀장','연락처: ...','이메일: ...']"),
    bodyText: z.string().optional().describe("구조화 필드 대신 본문 평문을 직접 줄 때 (줄바꿈=단락)"),
    attachments: z.array(z.string()).default([]).describe("첨부 파일 절대경로(견적서 PDF, 사업자등록증 등)"),
    save: z.boolean().default(true).describe("false면 입력만 하고 저장하지 않음(검증용)"),
    screenshot: z.string().optional(),
  },
}, async (a) => {
  try {
    const html = a.bodyText ? textToHtml(a.bodyText) : buildProposalBody(a);
    const r = await draftProposal(await getPage(), { title: a.title, html, attachments: a.attachments, save: a.save, screenshot: a.screenshot });
    return ok({ ...r, humanNext: r.saved ? "Amaranth 전자결재 → 상신/보관함(임시보관)에서 문서 확인 후 '상신'" : "저장하지 않음" });
  } catch (e) { return fail(e); }
});

server.registerTool("amaranth_expense_usage", {
  description: "지출결의(업무경비청구서) 용도 코드 목록. 읽기 전용 — amaranth_expense_fill의 usage 값을 고를 때 쓴다.",
  inputSchema: {},
}, async () => { try { return ok({ usage: await listUsage(await getPage()) }); } catch (e) { return fail(e); } });

server.registerTool("amaranth_expense_fill", {
  description: "지출결의(업무경비청구서 → 지출정보등록 '신규' 다이얼로그) 한 건을 채운다. 다이얼로그 '확인'(행 추가)·'저장'·상신은 절대 누르지 않는다 — " +
    "브라우저 창을 열어둔 채 반환하므로 사람이 내용을 확인하고 '확인' → '저장' → STEP3 상신을 누른다. 끝나면 amaranth_close_browser 호출. dryRun=true면 입력·검증 후 취소(헤드리스, 아무것도 남지 않음).",
  inputSchema: {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("사용일 YYYY-MM-DD"),
    time: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("사용시간 HH:MM(24시), 생략 시 화면 기본값"),
    place: z.string().min(1).describe("사용처(가맹점명)"),
    amount: z.number().int().positive().describe("청구금액(원)"),
    usage: z.string().min(1).describe("용도 코드(예 '103') 또는 이름(예 '식대 - 기타'). amaranth_expense_usage로 목록 확인"),
    evidence: z.enum(EVIDENCE).default("개인신용카드").describe("증빙 구분. 개인현금 등은 카드·사업자등록번호·승인번호 칸이 없다"),
    memo: z.string().default("").describe("내용"),
    attendees: z.string().optional().describe("참석자 — 식대 계열 용도에서만 칸이 나타난다"),
    bizNo: z.string().optional().describe("사업자등록번호"),
    approvalNo: z.string().optional().describe("카드 승인번호"),
    attachments: z.array(z.string()).default([]).describe("영수증 등 첨부 파일 절대경로"),
    dryRun: z.boolean().default(false),
    screenshot: z.string().optional(),
  },
}, async (a) => {
  try {
    const page = await getPage({ headed: !a.dryRun });
    const r = await fillExpense(page, { ...a, handoffMode: false });
    return ok(a.dryRun ? r : { ...r, humanNext: "열린 브라우저에서 내용 확인 후 다이얼로그 '확인' → '저장' → STEP3에서 상신", browserOpen: true });
  } catch (e) { return fail(e); }
});

server.registerTool("amaranth_doctor", {
  description: "화면 로케이터 드리프트 점검(읽기 전용). 실패 항목이 있으면 selectors.mjs 수정이 필요하다는 뜻.",
  inputSchema: {},
}, async () => { try { const rep = await doctor(await getPage()); return ok({ ok: rep.every((r) => r.ok), report: rep }); } catch (e) { return fail(e); } });

server.registerTool("amaranth_close_browser", {
  description: "열어둔 브라우저 세션을 닫는다(휴가 결재상신·지출결의 저장을 사람이 마친 뒤 호출).",
  inputSchema: {},
}, async () => { if (session) { await session.context.close().catch(() => {}); session = null; } return ok({ closed: true }); });

const transport = new StdioServerTransport();
await server.connect(transport);
process.on("SIGINT", async () => { if (session) await session.context.close().catch(() => {}); process.exit(0); });
