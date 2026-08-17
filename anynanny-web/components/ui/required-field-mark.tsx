export const REQUIRED_FIELD_SYMBOL = "✱";

type Props = {
  className?: string;
};

/** Six-spoke required-field marker (U+2731). Size/color live in `.anynanny-required-mark`. */
export function RequiredFieldMark({ className = "" }: Props) {
  return (
    <span className={["anynanny-required-mark", className].filter(Boolean).join(" ")} aria-hidden="true">
      {REQUIRED_FIELD_SYMBOL}
    </span>
  );
}
