"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

const pageStyle = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: 0,
  padding: "2rem",
  background: "#0b0f14",
  color: "#f4f7f5",
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: "36rem",
  border: "1px solid #26322b",
  borderRadius: "1rem",
  background: "#111813",
  padding: "2.5rem 2rem",
  textAlign: "center" as const,
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.35)",
};

const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "2.75rem",
  padding: "0 1.25rem",
  borderRadius: "0.6rem",
  border: "1px solid #2f7d4c",
  background: "#1f9d55",
  color: "#04120a",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

const linkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "2.75rem",
  padding: "0 1.25rem",
  borderRadius: "0.6rem",
  border: "1px solid #33413a",
  color: "#d7e2dc",
  fontSize: "0.9rem",
  fontWeight: 600,
  textDecoration: "none",
};

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "global" },
    });
  }, [error]);

  return (
    <html lang="en" style={{ background: "#0b0f14" }}>
      <body style={pageStyle}>
        <main style={cardStyle}>
          <p
            style={{
              margin: 0,
              color: "#34d399",
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            BetApp
          </p>
          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.8rem" }}>
            Something went wrong.
          </h1>
          <p
            style={{
              margin: "0.75rem auto 0",
              maxWidth: "28rem",
              color: "#9fb0a7",
              fontSize: "0.9rem",
              lineHeight: 1.65,
            }}
          >
            The app could not finish loading. Your wallet and bets are safe.
            Try again, or return to the lobby.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.6rem",
              marginTop: "1.5rem",
            }}
          >
            <button
              type="button"
              style={buttonStyle}
              onClick={() => retry()}
            >
              Try again
            </button>
            <Link href="/" style={linkStyle}>
              Back to lobby
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
