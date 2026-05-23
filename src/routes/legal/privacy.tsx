import { createFileRoute } from "@tanstack/react-router";
// privacy/v1.html 원본을 그대로 가져와 iframe srcDoc으로 렌더링.
// 원본 파일 수정 시 자동 반영되므로 사본 동기화 이슈 X.
import privacyHtml from "../../../privacy/v1.html?raw";

export const Route = createFileRoute("/legal/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <iframe
      title="개인정보처리방침"
      srcDoc={privacyHtml}
      className="w-full h-screen border-0"
    />
  );
}
