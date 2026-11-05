import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { serverPins } from "@/lib/parent-pin-server";
import { PinForm } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/pin",
  title: "Your PIN",
  description: "Set or change the PIN that lets your child leave their desk.",
  index: false,
});

// The parent's 4-digit PIN (#300): the child's desk asks for it before the child can leave. The row is read on the server
// only (no parent can read it with their own session), so the page asks the PIN module whether one is set.
export default async function Pin({ searchParams }: PageProps<"/account/pin">) {
  const id = await parentId(await sessionClient());
  if (!id) redirect("/sign-in");
  // When the read fails, the page must not offer a first PIN: a parent who has one would see no current-PIN field.
  let isSet: boolean | null = null;
  try {
    isSet = (await serverPins()?.isSet(id)) ?? null;
  } catch (error) {
    console.error("[pin] load failed", error instanceof Error ? error.message : error);
  }
  if (isSet === null) {
    return (
      <SupportPage label="Your account" title="Your PIN.">
        <p className="lead">We cannot load your PIN settings right now. Try again in a moment.</p>
      </SupportPage>
    );
  }
  return (
    <SupportPage label="Your account" title={isSet ? "Change your PIN." : "Set your PIN."}>
      {(await searchParams).desk === "1" && !isSet && <p role="status" className="acct-alert">Set your PIN first. Then you can open the desk.</p>}
      <p className="lead">The PIN is 4 digits. Your child needs it to leave their desk. We keep it as a scrambled code, never as the digits.</p>
      <PinForm isSet={isSet} />
    </SupportPage>
  );
}
