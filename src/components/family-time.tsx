/** Keep the server's text through hydration, even when the browser has different time-zone data. */
export function FamilyTime({ at, text }: { at: number; text: string }) {
  return <time dateTime={new Date(at).toISOString()}>{text}</time>;
}
