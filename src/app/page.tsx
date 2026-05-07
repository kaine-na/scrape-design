"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  elapsed?: string;
  status?: "running" | "done" | "failed";
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
/* Fun analysis stages with personality                                 */
/* ------------------------------------------------------------------ */

const intermediateStages = [
  { tag: "info" as const, msg: "Spinning up headless browser in the cloud", fun: "Did you know? Headless Chrome can render pages 3x faster than your browser" },
  { tag: "info" as const, msg: "Navigating to target URL", fun: "Imagine your website being analyzed by a robot with really good taste" },
  { tag: "info" as const, msg: "Waiting for JavaScript to finish doing its thing", fun: "Fun fact: the average webpage runs 17 JavaScript files before paint" },
  { tag: "info" as const, msg: "Extracting computed styles from live DOM", fun: "Your CSS has 847 rules but only uses like 200 of them. We all do it." },
  { tag: "info" as const, msg: "Collecting color tokens and palette", fun: "Every shade of gray has a name. We will find them all." },
  { tag: "info" as const, msg: "Sampling typography: fonts, sizes, weights", fun: "The average website uses 6 fonts. The recommended amount is 2. Oops." },
  { tag: "info" as const, msg: "Detecting shadows, gradients, and glass effects", fun: "Modern web design: making things look like they float. We see through it." },
  { tag: "info" as const, msg: "Mapping components: buttons, cards, forms, nav", fun: "A button is just a div with confidence and a cursor pointer." },
  { tag: "info" as const, msg: "Packaging analysis for the LLM brain", fun: "Feeding your website's soul into an AI. What could go wrong?" },
  { tag: "info" as const, msg: "LLM is writing your DESIGN.md now", fun: "The AI has opinions about your border-radius choices. Brace yourself." },
];

const stageDelays = [500, 400, 600, 350, 300, 250, 250, 200, 150, 150, 300];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function now(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function normalizeHttpUrl(rawUrl: string): string {
  const cleaned = rawUrl.trim();
  try {
    return new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`).toString();
  } catch {
    return cleaned;
  }
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
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
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
  const [showMiMoModal, setShowMiMoModal] = useState(false);
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

    const clearRipple = () => {
      button.style.removeProperty("--ripple-x");
      button.style.removeProperty("--ripple-y");
    };

    const fallbackTimer = setTimeout(clearRipple, 1000);
    const cleanup = () => {
      clearTimeout(fallbackTimer);
      clearRipple();
      button.removeEventListener("transitionend", cleanup);
    };
    button.addEventListener("transitionend", cleanup, { once: true });
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
    analyzedUrlRef.current = normalizeHttpUrl(targetUrl);
    setLogs([]);
    setIsLoading(true);

    const startTime = Date.now();

    function elapsed(): string {
      const ms = Date.now() - startTime;
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    }

    /* Schedule intermediate logs with fun facts */
    let stageIdx = 0;
    let timerId: ReturnType<typeof setTimeout>;

    function scheduleLog() {
      if (stageIdx >= intermediateStages.length) return;
      const stage = intermediateStages[stageIdx];
      const delay = stageDelays[stageIdx] ?? 300;
      timerId = setTimeout(() => {
        setLogs((prev) => [
          ...prev.map((entry) => entry.status === "running" ? { ...entry, status: "done" as const } : entry),
          { id: prev.length, tag: stage.tag, message: stage.msg, timestamp: now(), elapsed: elapsed(), status: "running" }
        ]);
        /* Show fun fact as a second log entry */
        if (stage.fun) {
          setLogs((prev) => [
            ...prev,
            { id: prev.length, tag: "info" as const, message: stage.fun, timestamp: now(), elapsed: elapsed(), status: undefined }
          ]);
        }
        stageIdx++;
        scheduleLog();
      }, delay);
    }

    setLogs([{ id: 0, tag: "info", message: intermediateStages[0].msg, timestamp: now(), elapsed: elapsed(), status: "running" }]);
    stageIdx = 1;
    timerId = setTimeout(scheduleLog, stageDelays[0] ?? 600);

    try {
      /* Mark previous stages as done when real progress happens */
      const markPreviousDone = () => {
        setLogs((prev) => prev.map((l) => l.status === "running" ? { ...l, status: "done" as const } : l));
      };

      setLogs((prev) => [
        ...prev.map((entry) => entry.status === "running" ? { ...entry, status: "done" as const } : entry),
        { id: prev.length, tag: "info", message: "Starting high-fidelity Browserless extraction", timestamp: now(), elapsed: elapsed(), status: "running" }
      ]);
      console.info("[client] requesting high-fidelity extraction for", targetUrl);

      /* Call /api/extract with retry on concurrency limit (429) */
      let analysis: AnalysisResult | undefined;
      const MAX_RETRIES = 8;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const extractResponse = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl, mode: "high-fidelity" })
        });
        const extractedBody = (await extractResponse.json()) as ExtractApiResponse;

        if (extractResponse.status === 429) {
          const waitSec = Math.min(3 * attempt, 15);
          setLogs((prev) => [
            ...prev,
            { id: prev.length, tag: "warn", message: `Browserless busy, retrying in ${waitSec}s (attempt ${attempt}/${MAX_RETRIES})`, timestamp: now(), elapsed: elapsed(), status: "running" }
          ]);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }

        if (extractResponse.ok && extractedBody.analysis) {
          const validation = analysisResultSchema.safeParse(extractedBody.analysis);
          if (validation.success) {
            analysis = validation.data;
            console.info("[client] high-fidelity extraction complete", extractedBody.meta ?? {});
            markPreviousDone();
            setLogs((prev) => [
              ...prev,
              { id: prev.length, tag: "success", message: "High-fidelity Browserless extraction completed", timestamp: now(), elapsed: elapsed(), status: "done" }
            ]);
          } else {
            throw new Error("Browserless returned malformed analysis data.");
          }
        } else {
          const reason = extractedBody.code ?? `HTTP_${extractResponse.status}`;
          const detail = extractedBody.error ?? "";
          throw new Error(`Extraction failed (${reason}): ${detail}`);
        }
        break;
      }

      if (!analysis) {
        throw new Error("Browserless extraction timed out after maximum retries. Please try again.");
      }

      /* Step 2: Stream DESIGN.md from /api/generate (SSE) */
      setLogs((prev) => [
        ...prev.map((entry) => entry.status === "running" ? { ...entry, status: "done" as const } : entry),
        { id: prev.length, tag: "info", message: "Streaming DESIGN.md generation started", timestamp: now(), elapsed: elapsed(), status: "running" }
      ]);

      const genResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis })
      });

      if (!genResponse.ok) {
        let errorMsg = `Generation failed (HTTP ${genResponse.status}).`;
        try {
          const errorBody = await genResponse.json() as { error?: string };
          if (errorBody.error) errorMsg = errorBody.error;
        } catch { /* non-JSON error body */ }
        throw new Error(errorMsg);
      }

      if (!genResponse.body) {
        throw new Error("Generation response missing body.");
      }

      const reader = genResponse.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let accumulated = "";
      setShowPreview(true);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() ?? "";

        for (const event of events) {
          const lines = event.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();

            try {
              const parsed = JSON.parse(data) as { type: string; content?: string; message?: string };
              if (parsed.type === "chunk" && parsed.content) {
                accumulated += parsed.content;
                setMarkdown(accumulated);
              } else if (parsed.type === "error") {
                throw new Error(parsed.message ?? "Generation error");
              }
              /* type: "done" — no action needed, loop will end */
            } catch (e) {
              if (e instanceof SyntaxError) continue; /* skip malformed JSON */
              throw e;
            }
          }
        }
      }

      if (!accumulated) {
        throw new Error("LLM returned empty response.");
      }

      setLogs((prev) => [
        ...prev.map((entry) => entry.status === "running" ? { ...entry, status: "done" as const } : entry),
        { id: prev.length, tag: "success", message: `DESIGN.md streamed successfully (${accumulated.length.toLocaleString()} chars)`, timestamp: now(), elapsed: elapsed(), status: "done" }
      ]);
      setShowPreview(true);
    } catch (caught) {
      setLogs((prev) => [
        ...prev.map((entry) => entry.status === "running" ? { ...entry, status: "failed" as const } : entry),
        { id: prev.length, tag: "error", message: "Analysis stopped. See error details below.", timestamp: now(), elapsed: elapsed(), status: "failed" }
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
                <div key={entry.id} className={`log-entry ${entry.status === "done" ? "log-done" : ""} ${entry.status === "failed" ? "log-failed" : ""} ${!entry.status && entry.tag === "info" ? "log-fun" : ""}`}>
                  <span className="log-timestamp">
                    {entry.timestamp}
                    {entry.elapsed && <span className="log-elapsed">+{entry.elapsed}</span>}
                  </span>
                  <span className={`log-tag ${entry.tag}`}>[{entry.tag.toUpperCase()}]</span>
                  <span className="log-msg">
                    {entry.message}
                    {entry.status === "running" && <span className="log-cursor" />}
                    {entry.status === "done" && <span className="log-check">&#10003;</span>}
                    {entry.status === "failed" && <span className="log-x">&#10007;</span>}
                  </span>
                </div>
              ))}
              {isLoading && logs.every((l) => l.status !== "running") && (
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
        <span className="footer-divider" />
        <button
          type="button"
          className="mimo-link"
          onClick={() => setShowMiMoModal(true)}
          aria-label="API support by Xiaomi MiMo"
        >
          <span className="mimo-api-dot" />
          <span>API support by</span>
          <span className="mimo-wordmark">MiMo</span>
        </button>
      </footer>

      {/* ---- MiMo Modal ---- */}
      {showMiMoModal && (
        <div className="mimo-modal-overlay" onClick={() => setShowMiMoModal(false)}>
          <div className="mimo-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="mimo-modal-close" onClick={() => setShowMiMoModal(false)} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div className="mimo-modal-header">
              <div className="mimo-modal-mark">
                <span className="mimo-api-dot" />
                <span>MiMo</span>
              </div>
              <div>
                <h3 className="mimo-modal-title">API support by Xiaomi MiMo</h3>
                <p className="mimo-modal-subtitle">Xiaomi&apos;s MiMo Open Platform for flagship MiMo V2.5 and the rest of the model lineup.</p>
              </div>
            </div>
            <div className="mimo-modal-body">
              <div className="mimo-credits-badge">
                <span className="mimo-credits-amount">$2</span>
                <span className="mimo-credits-label">in API credits</span>
              </div>
              <p className="mimo-instructions">
                Sign up with the code below and you&apos;ll instantly get <strong>$2 in API credits</strong> (valid 40 days).
                After signup, enter the code at the <strong>bottom-left of the console</strong>.
              </p>
              <div className="mimo-code-block">
                <span className="mimo-code-label">Referral Code</span>
                <code className="mimo-code-value">XB8KDV</code>
              </div>
            </div>
            <div className="mimo-modal-footer">
              <a
                href="https://platform.xiaomimimo.com?ref=XB8KDV"
                target="_blank"
                rel="noopener noreferrer"
                className="mimo-cta"
              >
                Sign up with code
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
              <a
                href="https://platform.xiaomimimo.com/console"
                target="_blank"
                rel="noopener noreferrer"
                className="mimo-secondary-link"
              >
                Go to Console →
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
