/** Fixed marketing-site notice. The year does not follow the calendar. */
export function MarketingCopyright({ className }: { className?: string }) {
  return (
    <p
      dir="ltr"
      className={className}
      style={{
        margin: "0.7rem 0 0.45rem",
        padding: 0,
        textAlign: "center",
        fontSize: "13px",
        fontWeight: 400,
        lineHeight: 1,
        color: "#7b8ea3"
      }}
    >
      © 2026 AnyNanny
    </p>
  );
}
