import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Legal & responsible play",
};

export default function LegalPage() {
  return (
    <div className="page-shell py-12 sm:py-16">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="eyebrow">Draft for beta review</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Legal & responsible play
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            These pages are placeholders for the private beta and require review
            by Nigerian counsel before public launch. They are written to
            describe a closed-loop, play-money product with no cash value.
          </p>
        </div>

        <Card id="terms" className="scroll-mt-24 border-border/80 bg-card/80">
          <CardHeader>
            <CardTitle>Terms of use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              BetApp is an entertainment product for adults aged 18 and over.
              Access is by invitation or beta approval and may be limited to 100
              active players.
            </p>
            <p>
              BET coins are virtual game credits. They cannot be purchased, sold,
              transferred, withdrawn, redeemed for cash, or exchanged for prizes
              or anything of monetary value. Balances and bets may be adjusted or
              reset to correct errors, abuse, or technical faults.
            </p>
            <p>
              You are responsible for keeping your login secure. Automated
              access, multi-accounting, collusion, and attempts to exploit the
              game are prohibited.
            </p>
          </CardContent>
        </Card>

        <Card id="privacy" className="scroll-mt-24 border-border/80 bg-card/80">
          <CardHeader>
            <CardTitle>Privacy notice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              We collect the minimum needed to run the beta: email address,
              display name, date of birth, country, and game activity. We use
              Supabase for authentication and database services, Resend for
              transactional email, and privacy-conscious analytics.
            </p>
            <p>
              We do not sell personal data. We retain ledger and bet records for
              integrity and audit. You can request account deletion; we will
              anonymize personal details and disable login while retaining
              records needed for audit and fraud prevention.
            </p>
            <p>
              This notice will be updated with a full NDPA-aligned privacy policy
              before public launch.
            </p>
          </CardContent>
        </Card>

        <Card id="credits" className="scroll-mt-24 border-border/80 bg-card/80">
          <CardHeader>
            <CardTitle>Asset credits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Club crests identify the teams in fixtures and remain the
              intellectual property of their respective clubs. The Premier
              League crest images used in this private beta are sourced from{" "}
              <a
                href="https://www.footylogos.com/"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                FootyLogos.com
              </a>
              .
            </p>
            <p>
              These marks are used for identification only and do not imply any
              affiliation with or endorsement by the clubs or the Premier
              League.
            </p>
          </CardContent>
        </Card>

        <Card
          id="responsible-play"
          className="scroll-mt-24 border-border/80 bg-card/80"
        >
          <CardHeader>
            <CardTitle>Responsible play</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              This is a play-money game, but habits can still matter. Take
              breaks, set your own limits, and do not use BetApp to escape
              stress. Because there is no cash value, there is nothing to chase.
            </p>
            <p>
              If gambling or gaming is affecting your life, speak to a qualified
              local support service. BetApp is not a gambling operator and does
              not offer real-money wagering.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
