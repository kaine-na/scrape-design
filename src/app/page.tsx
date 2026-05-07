"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractFromUrl } from "@/lib/analyzer/client-extractor";
import { analysisResultSchema, type AnalysisResult } from "@/lib/analysis/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface LogEntry {
  id: number;
  tag: "info" | "success" | "warn" | "error";
  message: string;
  timestamp: string;
}

interface ExtractApiResponse {
  analysis?: AnalysisResult;
  error?: string;
  code?: string;
  meta?: {
    provider?: string;
    browser?: string;
    region?: string;
    timedOut?: boolean;
  };
}

interface AnalyzeApiResponse {
  markdown?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Analysis stages (intermediate only - "success" is API-driven)       */
/* ------------------------------------------------------------------ */

const intermediateStages = [
  { tag: "info" as const, msg: "Connecting to Browserless headless browser" },
  { tag: "info" as const, msg: "Loading page in high-fidelity browser session" },
  { tag: "info" as const, msg: "Extracting computed styles from rendered DOM" },
  { tag: "info" as const, msg: "Collecting design tokens: colors, typography, spacing" },
  { tag: "info" as const, msg: "Capturing shadow layers, gradients, glass effects" },
  { tag: "info" as const, msg: "Detecting component families and interaction states" },
  { tag: "info" as const, msg: "Parsing motion, animations, and transition curves" },
  { tag: "info" as const, msg: "Compacting Browserless analysis payload for LLM context window" },
  { tag: "info" as const, msg: "Calling LLM provider to generate DESIGN.md" }
];

const stageDelays = [600, 300, 400, 250, 250, 200, 180, 150, 400];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function now(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function domain(rawUrl: string): string {
  const cleaned = rawUrl.trim();
  try {
    const u = new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
    return u.hostname || cleaned.slice(0, 50);
  } catch {
    return cleaned.slice(0, 50) || "example.com";
  }
}

/* ------------------------------------------------------------------ */
/* SVG icons                                                           */
/* ------------------------------------------------------------------ */

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1l2.8 6.6L21 9l-5 4.9 1.2 7.1L12 17.7l-5.2 3.3L8 13.9 3 9l6.2-1.4L12 1z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/* Strip YAML front matter and LLM instruction comments for clean rendering */
function cleanMarkdown(raw: string): string {
  return raw
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/<!--\s*LLM:[\s\S]*?-->/g, "")
    .trim();
}

/* Memoized markdown components for stable renders */
const MARKDOWN_COMPONENTS = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pre: (props: any) => <pre {...props} />,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: ({ href, children, ...props }: any) => {
    const external = href?.startsWith("http");
    return (
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} {...props}>
        {children}
      </a>
    );
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  li: ({ node, checked, children, ...props }: any) => {
    const isTaskItem = node?.properties?.className?.includes?.("task-list-item");
    if (isTaskItem) {
      return (
        <li className="task-list-item" {...props}>
          <input type="checkbox" checked={checked ?? false} disabled readOnly />
          <span>{children}</span>
        </li>
      );
    }
    return <li {...props}>{children}</li>;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ul: ({ node, children, ...props }: any) => {
    const isTaskList = node?.properties?.className?.includes?.("contains-task-list");
    if (isTaskList) {
      return <ul className="contains-task-list" {...props}>{children}</ul>;
    }
    return <ul {...props}>{children}</ul>;
  }
};

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [showPreview, setShowPreview] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const analyzedUrlRef = useRef("");

  /* Mouse tracking for interactive polygon background */
  useEffect(() => {
    function trackMouse(event: MouseEvent) {
      const x = (event.clientX / window.innerWidth) * 100;
      const y = (event.clientY / window.innerHeight) * 100;
      document.body.style.setProperty("--mouse-x", x.toFixed(2));
      document.body.style.setProperty("--mouse-y", y.toFixed(2));
    }
    window.addEventListener("mousemove", trackMouse, { passive: true });
    return () => window.removeEventListener("mousemove", trackMouse);
  }, []);

  /* Auto-scroll logs */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  /* Ripple on buttons with cleanup */
  const addRipple = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    button.style.setProperty("--ripple-x", `${x}%`);
    button.style.setProperty("--ripple-y", `${y}%`);
    /* Clean up after animation completes */
    const cleanup = () => {
      button.style.removeProperty("--ripple-x");
      button.style.removeProperty("--ripple-y");
      button.removeEventListener("transitionend", cleanup);
    };
    button.addEventListener("transitionend", cleanup, { once: true });
    /* Fallback: clear after 1s if transitionend never fires */
    setTimeout(() => {
      button.style.removeProperty("--ripple-x");
      button.style.removeProperty("--ripple-y");
    }, 1000);
  }, []);

  /* Submit */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetUrl = url.trim();
    if (!targetUrl) return;

    setError("");
    setMarkdown("");
    setShowPreview(false);
    setIframeFailed(false);
    analyzedUrlRef.current = targetUrl;
    setLogs([]);
    setIsLoading(true);

    /* Schedule intermediate logs */
    let stageIdx = 0;
    let timerId: ReturnType<typeof setTimeout>;

    function scheduleLog() {
      if (stageIdx >= intermediateStages.length) return;
      const stage = intermediateStages[stageIdx];
      const delay = stageDelays[stageIdx] ?? 300;
      timerId = setTimeout(() => {
        setLogs((prev) => [
          ...prev,
          { id: prev.length, tag: stage.tag, message: stage.msg, timestamp: now() }
        ]);
        stageIdx++;
        scheduleLog();
      }, delay);
    }

    setLogs([{ id: 0, tag: "info", message: intermediateStages[0].msg, timestamp: now() }]);
    stageIdx = 1;
    timerId = setTimeout(scheduleLog, stageDelays[0] ?? 600);

    try {
      setLogs((prev) => [
        ...prev,
        { id: prev.length, tag: "info", message: "Starting high-fidelity Browserless extraction", timestamp: now() }
      ]);
      console.info("[client] requesting high-fidelity extraction for", targetUrl);

      let analysis: AnalysisResult | undefined;
      let fallbackMessage = "High-fidelity extraction failed; using fast fallback";
      try {
        const extractResponse = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl, mode: "high-fidelity" })
        });
        const extractedBody = (await extractResponse.json()) as ExtractApiResponse;

        if (extractResponse.ok && extractedBody.analysis) {
          const validation = analysisResultSchema.safeParse(extractedBody.analysis);
          if (validation.success) {
            analysis = validation.data;
            console.info("[client] high-fidelity extraction complete", extractedBody.meta ?? {});
            setLogs((prev) => [
              ...prev,
              { id: prev.length, tag: "success", message: "High-fidelity Browserless extraction completed", timestamp: now() }
            ]);
          } else {
            fallbackMessage = "High-fidelity extraction returned malformed analysis; using fast fallback";
            console.warn(
              "[client] high-fidelity extraction returned malformed analysis; using fast fallback",
              validation.error
            );
          }
        } else {
          console.warn(
            "[client] high-fidelity extraction unavailable; using fast fallback",
            extractedBody.code ?? extractResponse.status
          );
        }
      } catch (extractError) {
        console.warn("[client] high-fidelity extraction failed; using fast fallback", extractError);
      }

      if (!analysis) {
        setLogs((prev) => [
          ...prev,
          { id: prev.length, tag: "warn", message: fallbackMessage, timestamp: now() }
        ]);

        /* Client-side fallback extraction */
        console.info("[client] extracting styles from", targetUrl);
        const extracted = await extractFromUrl(targetUrl);
        console.info("[client] extraction complete:", extracted.tokens.colors.length, "colors,", extracted.components.length, "components");

        analysis = analysisResultSchema.parse({
          source: { url: targetUrl, analyzedAt: new Date().toISOString(), scanType: "single-page" as const },
          confidence: { overall: "medium" as const },
          page: { title: extracted.title, description: extracted.description, sections: extracted.sections },
          tokens: extracted.tokens,
          components: extracted.components,
          evidence: extracted.evidence,
          assumptions: extracted.assumptions,
          gaps: extracted.gaps
        });
      }

      /* Send to LLM API */
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, url: targetUrl })
      });
      const body = (await response.json()) as AnalyzeApiResponse;
      if (!response.ok || !body.markdown) {
        throw new Error(body.error || "The design analysis failed.");
      }

      setLogs((prev) => [
        ...prev,
        { id: prev.length, tag: "success", message: "DESIGN.md generated successfully", timestamp: now() }
      ]);
      setMarkdown(body.markdown);
      setShowPreview(true);
    } catch (caught) {
      setLogs((prev) => [
        ...prev,
        { id: prev.length, tag: "error", message: caught instanceof Error ? caught.message : "Analysis failed", timestamp: now() }
      ]);
      setError(caught instanceof Error ? caught.message : "The design analysis failed.");
    } finally {
      clearTimeout(timerId);
      setIsLoading(false);
    }
  }

  /* Copy */
  const copyMarkdown = useCallback(async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [markdown]);

  /* Download */
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
    <>
      <main className="shell">
        {/* ---- Hero ---- */}
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">
            <SparkleIcon />
            Design System Extractor
          </p>
          <h1 id="hero-title">
            Turn any website into an{" "}
            <span className="highlight">AI-ready</span> design document.
          </h1>
          <p className="intro">
            Paste a public URL. Get a structured DESIGN.md with tokens, components,
            shadows, gradients, effects, motion specs, and implementation guidance
            your coding agent can use immediately.
          </p>

          <form ref={formRef} className="url-form" onSubmit={handleSubmit}>
            <label htmlFor="website-url">Website URL</label>
            <div className="input-row">
              <div className="input-wrapper">
                <span className="icon"><LinkIcon /></span>
                <input
                  id="website-url"
                  name="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com"
                  autoComplete="url"
                  required
                />
              </div>
              <button type="submit" disabled={isLoading} onMouseDown={addRipple}>
                {isLoading ? "Analyzing" : <><span>Generate</span><ArrowRightIcon /></>}
              </button>
            </div>
          </form>

          {/* ---- Demo CTA ---- */}
          <a
            href="https://kaine-na.github.io/testcloneweb-scpdesign/"
            target="_blank"
            rel="noopener noreferrer"
            className="demo-cta"
          >
            <span className="demo-badge">Demo</span>
            <span className="demo-label">
              See scraped result from{" "}
              <strong>pawbytes.io</strong>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          {url.trim() && (
            <div className={`preview-card ${isLoading ? "loading" : ""}`}>
              <div className="preview-favicon"><GlobeIcon /></div>
              <div className="preview-info">
                <div className="preview-domain">{domain(url)}</div>
                <div className="preview-path">single-page visual + DOM scan</div>
              </div>
              <span className={`preview-status ${isLoading ? "analyzing" : "done"}`}>
                {isLoading ? "Scanning" : "Ready"}
              </span>
            </div>
          )}
        </section>

        {/* ---- Log Panel ---- */}
        {(isLoading || logs.length > 0) && (
          <section className="log-panel" aria-live="polite">
            <div className="log-header">
              <div className="log-dots">
                <span className="log-dot red" />
                <span className="log-dot yellow" />
                <span className="log-dot green" />
              </div>
              <span className="log-title">Analysis Log &mdash; {domain(analyzedUrlRef.current || url)}</span>
            </div>
            <div className="log-body">
              {logs.map((entry) => (
                <div key={entry.id} className="log-entry">
                  <span className="log-timestamp">{entry.timestamp}</span>
                  <span className={`log-tag ${entry.tag}`}>[{entry.tag.toUpperCase()}]</span>
                  <span className="log-msg">{entry.message}</span>
                </div>
              ))}
              {isLoading && (
                <div className="log-entry">
                  <span className="log-timestamp">{now()}</span>
                  <span className="log-tag info">[INFO]</span>
                  <span className="log-msg">
                    Awaiting LLM response
                    <span className="log-cursor" />
                  </span>
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          </section>
        )}

        {/* ---- Error ---- */}
        {error && (
          <section className="error-panel" role="alert">
            <span className="icon"><AlertIcon /></span>
            <span>{error}</span>
          </section>
        )}

        {/* ---- Web Preview ---- */}
        {showPreview && analyzedUrlRef.current && (
          <section className="web-preview">
            <div className="web-preview-header">
              <EyeIcon />
              <span>Live Preview</span>
              <span className="web-preview-url">{domain(analyzedUrlRef.current)}</span>
              {iframeFailed && (
                <span className="web-preview-badge">Blocked by site</span>
              )}
            </div>
            <div className="web-preview-frame">
              {iframeFailed ? (
                <div className="web-preview-fallback">
                  <GlobeIcon />
                  <p>This website blocks embedded previews.</p>
                  <a href={analyzedUrlRef.current} target="_blank" rel="noopener noreferrer">
                    Open in new tab
                  </a>
                </div>
              ) : (
                <iframe
                  src={analyzedUrlRef.current}
                  title={`Preview of ${domain(analyzedUrlRef.current)}`}
                  sandbox="allow-scripts allow-same-origin"
                  loading="lazy"
                  onError={() => setIframeFailed(true)}
                  onLoad={(e) => {
                    /* Detect if iframe is empty/blocked */
                    try {
                      const iframe = e.currentTarget;
                      if (iframe.contentDocument?.body?.innerHTML === "") {
                        setIframeFailed(true);
                      }
                    } catch {
                      setIframeFailed(true);
                    }
                  }}
                />
              )}
            </div>
          </section>
        )}

        {/* ---- Result ---- */}
        {markdown && (
          <section className="result">
            <div className="result-header">
              <h2>DESIGN.md</h2>
              <div className="view-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${viewMode === "rendered" ? "active" : ""}`}
                  onClick={() => setViewMode("rendered")}
                >
                  <EyeIcon />
                  Preview
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${viewMode === "raw" ? "active" : ""}`}
                  onClick={() => setViewMode("raw")}
                >
                  <CodeIcon />
                  Source
                </button>
              </div>
              <div className="result-meta">
                <span className="dot" />
                <span>{markdown.length.toLocaleString()} chars</span>
                <span>&middot;</span>
                <span>{markdown.split("\n").length.toLocaleString()} lines</span>
              </div>
              <div className="result-actions">
                <button type="button" className="secondary" onClick={copyMarkdown} onMouseDown={addRipple}>
                  {copied ? <><CheckIcon />Copied</> : <><CopyIcon />Copy</>}
                </button>
                <button type="button" onClick={downloadMarkdown} onMouseDown={addRipple}>
                  <DownloadIcon />Download
                </button>
              </div>
            </div>

            <div className="result-body">
              {viewMode === "raw" ? (
                <pre>{markdown}</pre>
              ) : (
                <div className="markdown-render">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={MARKDOWN_COMPONENTS}
                  >
                    {cleanMarkdown(markdown)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ---- Footer ---- */}
      <footer className="site-footer">
        <a
          href="https://github.com/kaine-na/scrape-design"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
          aria-label="View source on GitHub"
        >
          <GitHubIcon />
          <span>scrape-design</span>
        </a>
        <span className="footer-divider" />
        <span className="footer-text">Open-source design system extraction</span>
      </footer>
    </>
  );
}
