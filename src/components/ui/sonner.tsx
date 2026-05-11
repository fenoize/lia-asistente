import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="bottom-right"
      duration={2500}
      visibleToasts={3}
      className="toaster group"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group alfred-toast flex items-center gap-2.5 !rounded-[var(--radius-md)] !border !border-[var(--border)] !bg-[var(--bg-elevated)] !text-[var(--text-primary)] !shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)]",
          title: "!text-[13px] !font-medium",
          description: "!text-[12px] !text-[var(--text-secondary)]",
          success:
            "before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[#34d399] before:flex-shrink-0",
          error:
            "before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[#f87171] before:flex-shrink-0",
          info: "before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[var(--accent-color)] before:flex-shrink-0",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
        style: {
          padding: "10px 16px",
          fontSize: 13,
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
