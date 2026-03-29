import Link from "next/link";

export const metadata = {
  title: "Terms of Service — SupraCRM",
};

export default function TermsPage() {
  const lastUpdated = "March 29, 2026";
  const contactEmail = "legal@suprateam.xyz";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="text-sm text-primary hover:underline mb-8 inline-block"
        >
          &larr; Back to SupraCRM
        </Link>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: {lastUpdated}
        </p>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <Section title="1. Acceptance">
            <p>
              By accessing or using SupraCRM (&quot;the Service&quot;), you
              agree to be bound by these Terms of Service. If you do not agree,
              do not use the Service.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              SupraCRM is an internal customer relationship management tool
              operated by Supra for its business development, marketing, and
              administration teams. The Service integrates with Telegram, Gmail,
              and AI services to provide deal pipeline management, communication
              tools, and workflow automation.
            </p>
          </Section>

          <Section title="3. Accounts and Access">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Access requires authentication via GitHub OAuth through
                Supabase.
              </li>
              <li>
                You are responsible for maintaining the security of your account
                credentials and connected integrations.
              </li>
              <li>
                You must notify administrators immediately of any unauthorized
                access to your account.
              </li>
            </ul>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                Use the Service for any unlawful purpose or in violation of any
                applicable laws or regulations.
              </li>
              <li>
                Attempt to gain unauthorized access to any part of the Service,
                other accounts, or connected systems.
              </li>
              <li>
                Send spam, phishing, or unsolicited messages through the
                Service&apos;s email or Telegram integrations.
              </li>
              <li>
                Reverse-engineer, decompile, or attempt to extract the source
                code of the Service.
              </li>
              <li>
                Interfere with or disrupt the Service or its infrastructure.
              </li>
            </ul>
          </Section>

          <Section title="5. Third-Party Integrations">
            <p>
              The Service connects to third-party platforms including Google
              (Gmail), Telegram, Anthropic (Claude AI), and Supabase. Your use
              of these integrations is subject to their respective terms:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <a
                  href="https://policies.google.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Google Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="https://telegram.org/tos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Telegram Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="https://www.anthropic.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Anthropic Terms of Service
                </a>
              </li>
            </ul>
          </Section>

          <Section title="6. Data and Privacy">
            <p>
              Your use of the Service is also governed by our{" "}
              <Link href="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              , which describes how we collect, use, store, and protect your
              data, including data from connected Google APIs.
            </p>
          </Section>

          <Section title="7. Intellectual Property">
            <p>
              The Service, including its code, design, and documentation, is the
              property of Supra. You retain ownership of the data you input into
              the Service.
            </p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>
              The Service is provided &quot;as is&quot; without warranties of
              any kind, express or implied. Supra shall not be liable for any
              indirect, incidental, special, or consequential damages arising
              from your use of the Service, including but not limited to data
              loss, business interruption, or unauthorized access by third
              parties.
            </p>
          </Section>

          <Section title="9. Termination">
            <p>
              We may suspend or terminate your access at any time for violation
              of these Terms or for any other reason at our discretion. You may
              stop using the Service at any time. Upon termination, you may
              request deletion of your data per our Privacy Policy.
            </p>
          </Section>

          <Section title="10. Changes to Terms">
            <p>
              We may update these Terms from time to time. Continued use of the
              Service after changes constitutes acceptance of the updated Terms.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>
              For questions about these Terms, contact us at:{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="text-primary underline"
              >
                {contactEmail}
              </a>
            </p>
          </Section>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 text-xs text-muted-foreground">
          <p>
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>
            {" | "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}
