#!/usr/bin/env node
// amaranth — Amaranth 근태/전자결재 자동화 CLI. 상신·결재상신은 절대 누르지 않는다.
import { readFileSync } from "fs";
import { resolve } from "path";
import { openSession, ensureLoggedIn } from "./lib/session.mjs";
import { applyLeave, KINDS } from "./actions/leave.mjs";
import { draftProposal } from "./actions/proposal.mjs";
import { doctor } from "./actions/doctor.mjs";
import { status } from "./actions/status.mjs";
import { textToHtml, buildProposalBody } from "./lib/body.mjs";
import { log } from "./lib/log.mjs";

const HELP = `사용법: amaranth <command> [옵션]

  login                         세션 확인/로그인만 수행 (config.json 자격증명 사용)
  leave   --from YYYY-MM-DD [--to YYYY-MM-DD] [--type ${KINDS.join("|")}] [--reason "..."]
          [--complete]          '신청완료'로 2단계(상신정보)까지 진행. 결재상신은 사람이 누른다
          [--handoff]           브라우저를 띄운 채 사람에게 넘김 (headed 강제)
  proposal --title "..." (--body-file 본문.txt | --json spec.json) [--attach 파일 ...] [--no-save]
          기안서-30만원 이상 팝업에 제목·본문·첨부를 채우고 '보관'(임시저장). --no-save면 입력만
  status  [--only attendance,leave,approvals]  오늘 출퇴근·연차 현황·최근 상신문서 상태 (읽기 전용)
  doctor                        로케이터 드리프트 점검 (자동 수정 없음)

공통: --headed  브라우저 표시 / --json  결과를 JSON으로 / --screenshot 경로.png / --session-dir 경로
JSON spec 예: {"title":"...","headline":"...","target":["심사기관: ..."],"costs":["현장심사비: 3,000,000원"],
               "payment":["입금은행: ..."],"contact":["홍길동 팀장"],"attachments":["/path/a.pdf"]}`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { args._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (key === "attach") { (args.attach ||= []).push(next); i++; continue; }
    if (next === undefined || next.startsWith("--")) { args[key] = true; continue; }
    args[key] = next; i++;
  }
  return args;
}
export { parseArgs };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  log.json = !!args.json;
  if (!cmd || args.help) { console.log(HELP); return; }
  const headed = !!args.headed || !!args.handoff;
  const { context, page } = await openSession({ headed, sessionDir: args["session-dir"] });
  try {
    await ensureLoggedIn(page);
    if (cmd === "login") { log.result({ ok: true, url: page.url() }); return; }
    if (cmd === "leave") {
      const r = await applyLeave(page, {
        kind: args.type || "연차", from: args.from, to: args.to || args.from, reason: args.reason || "",
        complete: !!args.complete, screenshot: args.screenshot, handoffMode: !!args.handoff,
      });
      log.result(r); return;
    }
    if (cmd === "proposal") {
      let title = args.title, html, attachments = args.attach || [];
      if (args.json && typeof args.json === "string") {
        const spec = JSON.parse(readFileSync(args.json, "utf8"));
        title = title || spec.title; html = buildProposalBody(spec); attachments = attachments.length ? attachments : (spec.attachments || []);
        log.json = false;
      } else if (args["body-file"]) {
        html = textToHtml(readFileSync(args["body-file"], "utf8"));
      }
      const r = await draftProposal(page, { title, html, attachments: attachments.map((p) => resolve(p)), save: !args["no-save"], screenshot: args.screenshot });
      log.result(r); return;
    }
    if (cmd === "status") {
      const include = args.only ? String(args.only).split(",") : undefined;
      log.result(await status(page, include ? { include } : {})); return;
    }
    if (cmd === "doctor") {
      const rep = await doctor(page);
      const bad = rep.filter((r) => !r.ok);
      log.result({ ok: bad.length === 0, checked: rep.length, failed: bad.map((b) => `${b.group}.${b.name} (${b.primary})`) });
      if (!log.json) for (const r of rep) console.error(`  ${r.ok ? "✅" : "❌"} ${r.group}.${r.name}${r.matched && r.matched !== r.primary ? `  (fallback: ${r.matched})` : ""}`);
      process.exitCode = bad.length ? 1 : 0; return;
    }
    console.log(HELP); process.exitCode = 2;
  } catch (e) {
    log.error(e.message); process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main();
