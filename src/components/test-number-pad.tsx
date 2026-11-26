const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

export function NumberPad({ value, signed, onPress }: { value: string; signed: boolean; onPress: (key: string) => void }) {
  return (
    <div className="test-num">
      <output className="test-display" aria-live="polite" aria-label="Your answer">{value || <i>Type your answer</i>}</output>
      <div className="test-pad" role="group" aria-label="Number pad">
        {PAD_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => onPress(k)} aria-label={k === "." ? "Decimal point" : undefined}>{k}</button>
        ))}
        {signed && <button type="button" onClick={() => onPress("-")} aria-label="Minus">−</button>}
        <button type="button" onClick={() => onPress("back")} aria-label="Delete">⌫</button>
      </div>
    </div>
  );
}
