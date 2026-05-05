"use client";

import { useState } from "react";

const progressSteps = [
  "Fetching page",
  "Rendering website",
  "Extracting visual system",
  "Analyzing components",
  "Writing DESIGN.md"
];

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMarkdown("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "The design analysis failed.");
      }
      setMarkdown(body.markdown);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The design analysis failed."
      );
    } finally {
      setIsLoading(false);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "DESIGN.md";
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Single-page Visual + DOM Analyzer</p>
        <h1 id="hero-title">
          Generate an AI-ready DESIGN.md from any public website.
        </h1>
        <p className="intro">
          Paste one URL. Get tokens, components, interactions, motion,
          responsive notes, and implementation guidance.
        </p>
        <form className="url-form" onSubmit={handleSubmit}>
          <label htmlFor="website-url">Website URL</label>
          <div className="input-row">
            <input
              id="website-url"
              name="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              required
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Analyzing..." : "Generate DESIGN.md"}
            </button>
          </div>
        </form>
      </section>

      {isLoading ? (
        <section className="panel" aria-live="polite">
          <h2>Analyzing website</h2>
          <ol className="steps">
            {progressSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {error ? (
        <section className="error" role="alert">
          {error}
        </section>
      ) : null}

      {markdown ? (
        <section className="result">
          <div className="result-actions">
            <h2>Generated DESIGN.md</h2>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(markdown)}
            >
              Copy
            </button>
            <button type="button" onClick={downloadMarkdown}>
              Download
            </button>
          </div>
          <pre>{markdown}</pre>
        </section>
      ) : null}
    </main>
  );
}
