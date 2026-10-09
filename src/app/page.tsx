import { Landing } from "@/components/landing";
import { homeMetadata } from "@/lib/metadata";

export const metadata = homeMetadata;

export default function Home() {
  return <Landing look="warm" />;
}
