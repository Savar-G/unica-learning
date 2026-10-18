import { pageMetadata } from "@/lib/metadata";
import { SupportPage } from "@/components/support-page";
import { ContactForm } from "@/components/contact-form";

export const metadata = pageMetadata({
  path: "/contact",
  title: "Contact us",
  description: "Questions about the free math assessment, plans or your account? Send us a message and we will reply by email.",
});

// The contact page (D-130, round r25 option 2A). The FAQ header links here.
export default function Contact() {
  return (
    <SupportPage label="Contact" title="Get in touch.">
      <p className="lead">Questions about the free test, plans or your account? Send us a message and we will reply by email.</p>
      <ContactForm />
    </SupportPage>
  );
}
