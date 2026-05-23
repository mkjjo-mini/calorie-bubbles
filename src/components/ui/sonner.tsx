import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // 기본: 상단 가운데 + 1.5s (콘텐츠 가리지 않음 + 자명한 변화는 짧게)
      // 되돌리기 토스트는 호출 시 position="bottom-center" + duration:5000 명시.
      position="top-center"
      duration={1500}
      // 여러 개 삭제(undo) 누적 시 모두 펼쳐 보이도록 — 새 토스트가 위쪽에 쌓이고
      // 오래된 토스트가 아래로 밀려남(top-center 기준). bottom-center도 동일하게 펼침.
      expand
      visibleToasts={5}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
