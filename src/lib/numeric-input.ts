/**
 * 문자열 state로 관리하는 숫자 입력값 정리(sanitize).
 *
 * 목적: 초기값 "0" 뒤에 이어서 입력할 때 "0200"처럼 선행 0이 남는 문제 방지.
 * (예: 200을 원하는데 "0200"으로 보임)
 *
 * 규칙:
 *  - 숫자와 소수점만 허용
 *  - 소수점은 하나만
 *  - 선행 0 제거 — 단 "0", "0.5" 처럼 의미 있는 0은 유지
 *  - 빈 문자열 허용(사용자가 지웠을 때)
 */
export function sanitizeDecimalInput(raw: string): string {
  // 숫자·소수점만
  let v = raw.replace(/[^\d.]/g, "");
  // 소수점 하나만 유지 (첫 번째 이후의 점 제거)
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
  }
  // 선행 0 제거: "0200"→"200", "007"→"7". "0"·"0.5"는 유지(0 뒤가 숫자일 때만 제거).
  v = v.replace(/^0+(?=\d)/, "");
  return v;
}
