import { createFileRoute } from "@tanstack/react-router";
// terms/v1.html 원본을 그대로 가져와 iframe srcDoc으로 렌더링.
// 원본 파일 수정 시 자동 반영되므로 사본 동기화 이슈 X.
import termsHtml from "../../../terms/v1.html?raw";

export const Route = createFileRoute("/legal/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <iframe
      title="이용약관"
      srcDoc={termsHtml}
      className="w-full h-screen border-0"
    />
  );
}
