import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — SupraTeam",
};

export default function PrivacyPage() {
  const lastUpdated = "March 29, 2026";
  const contactEmail = "privacy@suprateam.xyz";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="text-sm text-primary hover:underline mb-8 inline-block"
        >
          &larr; Back to SupraTeam
        </Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: {lastUpdated}
        </p>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <Section title="1. Introduction">
            <p>
              SupraTeam (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is an
              internal CRM tool operated by Supra. This policy explains how we
              collect, use, store, and protect your data — including data
              accessed through Google APIs.
            </p>
          </Section>

          <Section title="2. Data We Collect">
            <p>When you use SupraTeam, we may collect:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Account data:</strong> GitHub profile information (name,
                email, avatar) via OAuth login.
              </li>
              <li>
                <strong>CRM data:</strong> Deals, contacts, pipeline stages,
                notes, and tags you create within the application.
              </li>
              <li>
                <strong>Telegram data:</strong> Group membership, message
                metadata, and bot interactions when you connect a Telegram bot.
              </li>
              <li>
                <strong>Gmail data:</strong> Email threads, messages, labels,
                and contact information when you connect your Gmail account
                (see Section 5 for details).
              </li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Data">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Providing CRM features: deal management, pipeline tracking,
                contact organization, and team collaboration.
              </li>
              <li>
                Sending automated messages through connected Telegram bots on
                pipeline stage changes.
              </li>
              <li>
                Reading, sending, and managing email on your behalf when you
                connect your Gmail account.
              </li>
              <li>
                AI-powered features: email drafting, summarization, and
                categorization using Anthropic&apos;s Claude API.
              </li>
            </ul>
          </Section>

          <Section title="4. Data Storage and Security">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                All data is stored in a Supabase (PostgreSQL) database with
                row-level security policies.
              </li>
              <li>
                OAuth tokens (Gmail, Telegram) are encrypted at rest using
                AES-256-GCM before database storage. Tokens are never stored in
                plaintext.
              </li>
              <li>
                All connections use HTTPS/TLS in transit. Database connections
                use SSL.
              </li>
              <li>
                Access to data is restricted to authenticated team members via
                GitHub OAuth.
              </li>
            </ul>
          </Section>

          <Section title="5. Google API Services — Limited Use Disclosure">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mt-2">
              <p className="font-medium text-foreground mb-3">
                SupraTeam&apos;s use of information received from Google APIs
                adheres to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>

              <p className="mb-3">
                When you connect your Gmail account, SupraTeam accesses the
                following scopes:
              </p>
              <ul className="list-disc pl-6 space-y-1 mb-3">
                <li>
                  <code className="text-xs bg-white/5 px-1 rounded">gmail.readonly</code> — Read
                  email threads and messages to display your inbox within
                  SupraTeam.
                </li>
                <li>
                  <code className="text-xs bg-white/5 px-1 rounded">gmail.send</code> — Send
                  emails and replies on your behalf from within the CRM.
                </li>
                <li>
                  <code className="text-xs bg-white/5 px-1 rounded">gmail.modify</code> — Archive,
                  trash, star, and mark emails as read/unread.
                </li>
                <li>
                  <code className="text-xs bg-white/5 px-1 rounded">gmail.labels</code> — Read and
                  manage your Gmail labels for organization.
                </li>
                <li>
                  <code className="text-xs bg-white/5 px-1 rounded">userinfo.email</code> — Identify
                  your Google account email address.
                </li>
              </ul>

              <p className="font-medium text-foreground mb-2">
                Limited Use compliance:
              </p>
              <ol className="list-decimal pl-6 space-y-2">
                <li>
                  <strong>Purpose limitation:</strong> Gmail data is only used
                  to provide the email management features visible in the
                  SupraTeam interface — reading your inbox, sending/replying to
                  emails, and organizing messages.
                </li>
                <li>
                  <strong>No transfer:</strong> We do not sell, lease, or
                  transfer your Gmail data to any third party, except as
                  necessary to provide or improve SupraTeam, for security
                  purposes, or as required by law.
                </li>
                <li>
                  <strong>No human reading:</strong> No SupraTeam employee or
                  contractor reads your emails unless you have given explicit
                  consent to view a specific message, or it is necessary for
                  security investigation or legal compliance.
                </li>
                <li>
                  <strong>No advertising:</strong> Gmail data is never used for
                  advertising, ad targeting, market research, creditworthiness
                  assessment, or sale to data brokers.
                </li>
              </ol>
            </div>
          </Section>

          <Section title="6. AI Processing">
            <p>
              When you use AI features (email drafting, summarization,
              categorization), relevant email content is sent to Anthropic&apos;s
              Claude API for processing. This data is:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                Sent only when you explicitly trigger an AI action (never
                automatically).
              </li>
              <li>
                Not stored by Anthropic beyond the API request lifecycle
                (per Anthropic&apos;s API data policy).
              </li>
              <li>Not used to train AI models.</li>
            </ul>
          </Section>

          <Section title="7. Data Sharing">
            <p>We do not sell your data. We share data only:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                With infrastructure providers (Supabase, Railway) as necessary
                to operate the service.
              </li>
              <li>
                With Anthropic for AI features, only when explicitly triggered
                by you.
              </li>
              <li>When required by law or valid legal process.</li>
            </ul>
          </Section>

          <Section title="8. Data Retention and Deletion">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                CRM data is retained as long as your account is active.
              </li>
              <li>
                Email data is fetched on-demand from Gmail and cached
                temporarily. We do not maintain a permanent copy of your email
                content.
              </li>
              <li>
                You can disconnect your Gmail account at any time from Settings
                &gt; Integrations. Disconnecting revokes our access and deletes
                all stored tokens.
              </li>
              <li>
                You can request full account deletion from Settings &gt;
                Privacy. This permanently removes all your data including CRM
                records, tokens, and audit logs.
              </li>
              <li>
                You can export all your data from Settings &gt; Privacy at any
                time.
              </li>
            </ul>
          </Section>

          <Section title="9. Your Rights">
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Access:</strong> Export all data we hold about you
                (Settings &gt; Privacy).
              </li>
              <li>
                <strong>Deletion:</strong> Request permanent deletion of your
                data (Settings &gt; Privacy).
              </li>
              <li>
                <strong>Revocation:</strong> Disconnect any integration and
                revoke access at any time.
              </li>
              <li>
                <strong>Portability:</strong> Export your data in JSON format.
              </li>
            </ul>
          </Section>

          <Section title="10. Cookies">
            <p>
              SupraTeam uses only essential session cookies for authentication.
              We do not use tracking cookies, analytics cookies, or third-party
              advertising cookies.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>
              For privacy inquiries, data requests, or concerns, contact us at:{" "}
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
