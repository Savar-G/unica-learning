import Link from "next/link";
import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { GETTING_STARTED_CAPTIONS_SRC, GETTING_STARTED_POSTER_SRC, GETTING_STARTED_VIDEO_PATH, GETTING_STARTED_VIDEO_SRC } from "@/lib/getting-started-video";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: GETTING_STARTED_VIDEO_PATH, title: "Getting started", description: "A short video for parents about getting started with Unica Learning.", index: false });

export default function GettingStarted() {
  return (
    <SupportPage label="For parents" title="Getting started" wide>
      <p className="lead">How to get set up, what each day looks like, and what happens next. About 3 minutes.</p>
      <video
        controls
        playsInline
        preload="metadata"
        poster={GETTING_STARTED_POSTER_SRC}
        aria-label="Getting started with Unica Learning"
        style={{ display: "block", width: "100%", aspectRatio: "16 / 9", borderRadius: 6, background: "var(--ink)" }}
      >
        <source src={GETTING_STARTED_VIDEO_SRC} type="video/mp4" />
        <track kind="captions" src={GETTING_STARTED_CAPTIONS_SRC} srcLang="en" label="English" />
        <a href={GETTING_STARTED_VIDEO_SRC}>Open the getting-started video</a>
      </video>
      <p><Link className="btn" href="/account">Go to your account</Link></p>
      <p className="small">Video not playing? <a href={GETTING_STARTED_VIDEO_SRC}>Open the video directly</a>.</p>
      <p className="small">Need help? Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>
    </SupportPage>
  );
}
