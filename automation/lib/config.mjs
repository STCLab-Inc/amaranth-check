import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// amaranth-check 앱과 같은 설정 파일을 공유한다 (company/userId/password).
export const CONFIG_DIR = join(homedir(), ".amaranth-check");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
// 앱 스크레이퍼(~/.amaranth-session)와 프로필을 나눠 SingletonLock 충돌을 피한다.
export const SESSION_DIR = join(homedir(), ".amaranth-automation", "session");
export const BASE_URL = "https://gw.stclab.com";

export function loadCredentials() {
  if (!existsSync(CONFIG_FILE)) throw new Error(`설정 없음: ${CONFIG_FILE} — 'amaranth-check --setup' 먼저 실행`);
  const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  const { company, userId, password } = cfg;
  if (!company || !userId || !password) throw new Error("config.json에 company/userId/password가 비어 있음");
  return { company, userId, password };
}
