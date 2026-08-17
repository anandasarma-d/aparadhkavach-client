import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  askQuery,
  askVoice,
  searchRecordsQuery,
  type FollowUpContext,
  type QueryResult,
  type RelatedEntity,
} from "./api/queryClient";
import { DEMO_ACCUSED } from "./lib/demoAccused";
import { DEMO_FIRS } from "./lib/demoFirs";

type SeedMode = "accused" | "fir" | "records";
type BusyKind = "ask" | "followUp" | "voice";
/** Which ChatPanel composer owns the active MediaRecorder. */
type VoiceTarget = "seed" | "followUp";

/** One officer ask + assistant answer in the visible thread (mvp2/12 Step E). */
type ThreadTurn = {
  id: string;
  officerText: string;
  result: QueryResult;
};

const ACCUSED_ID_PATTERN = /^ACC-[A-Za-z0-9_-]+$/i;
const FIR_ID_PATTERN = /^FIR-[A-Za-z0-9_-]+$/i;

/** Demo narrative prompts for Records NL (mvp2/20) — not ACC-/FIR- seeds. */
const DEMO_RECORDS_PROMPTS = [
  "vehicle theft near parking lot",
  "robbery at night involving two accused",
  "chain snatching near bus stand",
] as const;

/**
 * Citation Q&A (mvp2/11) + Graph-RAC A–H + mvp2/20 Records NL discovery.
 */
export function QaPage() {
  const [mode, setMode] = useState<SeedMode>("accused");
  const [query, setQuery] = useState(DEMO_ACCUSED[5]?.accusedId ?? "ACC-00040");
  const [followUp, setFollowUp] = useState("");
  /** Stacked Q&A turns for this browser session (not a full ChatGPT product). */
  const [turns, setTurns] = useState<ThreadTurn[]>([]);
  /** Last successful answer citations — kept across loads/errors for follow-up hydrate. */
  const [citationSnapshot, setCitationSnapshot] = useState<FollowUpContext | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKind | null>(null);
  /** Officer text shown while the current ask is in flight. */
  const [pendingOfficer, setPendingOfficer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<VoiceTarget | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const voiceTargetRef = useRef<VoiceTarget>("followUp");
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const loading = busy != null;
  const latestResult = turns.length > 0 ? turns[turns.length - 1].result : null;

  useEffect(() => {
    if (turns.length === 0 && !pendingOfficer) return;
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, pendingOfficer, loading]);

  async function runAsk(
    input: Parameters<typeof askQuery>[0],
    options: { kind: BusyKind; officerText: string; clearFollowUp?: boolean },
  ) {
    setBusy(options.kind);
    setError(null);
    setPendingOfficer(options.officerText);
    try {
      const data = await askQuery(input);
      setConversationId(data.conversationId);
      setTurns((prev) => [
        ...prev,
        {
          id: data.queryId || `${data.conversationId}-${prev.length + 1}`,
          officerText: options.officerText,
          result: data,
        },
      ]);
      setCitationSnapshot(toFollowUpContext(data, mode, query));
      if (options.clearFollowUp) setFollowUp("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingOfficer(null);
      setBusy(null);
    }
  }

  async function runRecordsSearch(officerText: string) {
    setBusy("ask");
    setError(null);
    setPendingOfficer(officerText);
    try {
      const data = await searchRecordsQuery({ q: officerText, conversationId, limit: 5 });
      setConversationId(data.conversationId);
      setTurns((prev) => [
        ...prev,
        {
          id: data.queryId || `${data.conversationId}-${prev.length + 1}`,
          officerText: officerText,
          result: data,
        },
      ]);
      setCitationSnapshot(toFollowUpContext(data, "records", officerText));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingOfficer(null);
      setBusy(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const seed = query.trim();
    if (!seed || loading) return;

    if (mode === "records") {
      await runRecordsSearch(seed);
      return;
    }

    const mismatch = validateSeedForMode(mode, seed);
    if (mismatch) {
      setError(mismatch);
      return;
    }

    await runAsk(
      mode === "accused"
        ? { accusedId: seed, firId: null, conversationId }
        : { accusedId: null, firId: seed, conversationId },
      {
        kind: "ask",
        officerText: mode === "accused" ? `Ask about accused ${seed}` : `Ask about ${seed}`,
      },
    );
  }

  async function submitFollowUp() {
    const text = followUp.trim();
    if (!text || !conversationId || loading) return;
    const ctx =
      citationSnapshot ??
      (latestResult ? toFollowUpContext(latestResult, mode, query) : null);
    await runAsk(
      {
        accusedId: null,
        firId: null,
        conversationId,
        followUp: text,
        followUpContext: ctx,
      },
      { kind: "followUp", officerText: text, clearFollowUp: true },
    );
  }

  async function submitVoiceBlob(audio: Blob, target: VoiceTarget) {
    if (loading) return;
    const ctx =
      citationSnapshot ??
      (latestResult ? toFollowUpContext(latestResult, mode, query) : null);
    setBusy("voice");
    setError(null);
    setPendingOfficer(
      target === "seed" ? "Transcribing seed ask…" : "Transcribing follow-up…",
    );
    try {
      const data = await askVoice({
        conversationId,
        audio,
        followUpContext: target === "followUp" ? ctx : null,
        languageHint: "en",
      });
      const officerText = data.transcription?.trim() || "Voice ask";
      const spokenId = extractSpokenSeedId(officerText);
      if (spokenId) {
        setQuery(spokenId);
        setMode(spokenId.startsWith("FIR-") ? "fir" : "accused");
      }
      setConversationId(data.conversationId);
      setTurns((prev) => [
        ...prev,
        {
          id: data.queryId || `${data.conversationId}-${prev.length + 1}`,
          officerText,
          result: data,
        },
      ]);
      setCitationSnapshot(
        toFollowUpContext(
          data,
          spokenId?.startsWith("FIR-") ? "fir" : "accused",
          spokenId || query,
        ),
      );
      setFollowUp("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingOfficer(null);
      setBusy(null);
    }
  }

  async function toggleVoiceCapture(target: VoiceTarget) {
    if (loading && !recording) return;
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot capture the microphone. Type your question instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : MediaRecorder.isTypeSupported("audio/aac")
              ? "audio/aac"
              : "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      voiceTargetRef.current = target;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setVoiceTarget(null);
        mediaRecorderRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        void submitVoiceBlob(blob, voiceTargetRef.current);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setVoiceTarget(target);
      setError(null);
    } catch {
      setError("Microphone permission denied. Type your question instead.");
      setRecording(false);
      setVoiceTarget(null);
    }
  }

  function onFollowUpKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void submitFollowUp();
    }
  }

  function askAboutCitedId(id: string) {
    if (!conversationId || loading) {
      setFollowUp(`Tell me about ${id}`);
      return;
    }
    const officerText = `Tell me about ${id}`;
    const ctx =
      citationSnapshot ??
      (latestResult ? toFollowUpContext(latestResult, mode, query) : null);
    void runAsk(
      {
        accusedId: null,
        firId: null,
        conversationId,
        followUp: officerText,
        followUpContext: ctx,
      },
      { kind: "followUp", officerText, clearFollowUp: true },
    );
  }

  function resetThreadLocal() {
    setConversationId(null);
    setTurns([]);
    setCitationSnapshot(null);
    setPendingOfficer(null);
    setFollowUp("");
    setError(null);
  }

  function pickAccused(id: string) {
    setMode("accused");
    setQuery(id);
    resetThreadLocal();
  }

  function pickFir(id: string) {
    setMode("fir");
    setQuery(id);
    resetThreadLocal();
  }

  function pickRecordsPrompt(prompt: string) {
    setMode("records");
    setQuery(prompt);
    resetThreadLocal();
  }

  function selectMode(next: SeedMode) {
    setMode(next);
    resetThreadLocal();
    if (next === "records") {
      setQuery(DEMO_RECORDS_PROMPTS[0]);
      setError(null);
      return;
    }
    const seed = query.trim();
    if (seed && (next === "accused" || next === "fir")) {
      const mismatch = validateSeedForMode(next, seed);
      if (mismatch) {
        setQuery(next === "accused" ? (DEMO_ACCUSED[5]?.accusedId ?? "ACC-00040") : "FIR-003276");
        setError(null);
      }
    }
  }

  function startNewThread() {
    resetThreadLocal();
  }

  return (
    <div
      className={`mx-auto max-w-3xl px-7 py-8 ${conversationId ? (error ? "pb-44" : "pb-28") : ""}`}
    >
      <header className="mb-6">
        <p className="section-label">Investigator assist</p>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] tracking-tight text-[var(--ink)]">
          Q&amp;A with citations
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--ink-muted)]">
          Seed with an accused or FIR id, or use <strong>Records</strong> for a plain-English
          narrative question over FIR embeddings (Claude answer + citations). After the first
          answer, follow up in plain language — the resolver maps it to a cited ACC-/FIR-.
        </p>
        <p className="mt-2 text-[12.5px] font-medium text-[var(--accent-ink)]">
          Graph-RAC A–H + Records NL (mvp2/20). Records uses the same similarity floor as typed
          Similar — not a crime-type SQL filter. Mic stays on Accused/FIR seed modes.
        </p>
      </header>

      <form onSubmit={onSubmit} noValidate className="mb-5 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Seed type">
          <ModeChip active={mode === "accused"} onClick={() => selectMode("accused")}>
            Accused
          </ModeChip>
          <ModeChip active={mode === "fir"} onClick={() => selectMode("fir")}>
            FIR
          </ModeChip>
          <ModeChip active={mode === "records"} onClick={() => selectMode("records")}>
            Records
          </ModeChip>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === "accused"
                ? "ACC-00040"
                : mode === "fir"
                  ? "FIR-003276"
                  : "vehicle theft near parking lot"
            }
            className={`min-w-[16rem] flex-1 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)] ${
              mode === "records"
                ? "font-[family-name:var(--font-body)]"
                : "font-[family-name:var(--font-mono)]"
            }`}
            aria-label={
              mode === "accused"
                ? "Accused id"
                : mode === "fir"
                  ? "FIR id"
                  : "Plain-English records question"
            }
            disabled={loading}
          />
          {mode !== "records" && (
            <button
              type="button"
              onClick={() => void toggleVoiceCapture("seed")}
              disabled={loading && !recording}
              className={`rounded border px-4 py-2.5 font-[family-name:var(--font-mono)] text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                recording && voiceTarget === "seed"
                  ? "border-[var(--risk-high)] bg-[var(--risk-high-soft)] text-[var(--risk-high)]"
                  : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--accent)]"
              }`}
              aria-pressed={recording && voiceTarget === "seed"}
              aria-label={
                recording && voiceTarget === "seed" ? "Stop recording" : "Record voice seed ask"
              }
              title="Speak an ACC-/FIR- id (English, under ~30s). Click again to stop and ask."
            >
              {recording && voiceTarget === "seed" ? "Stop mic" : "Mic"}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
          >
            {busy === "ask" || (busy === "voice" && !conversationId)
              ? mode === "records"
                ? "Searching…"
                : "Asking…"
              : mode === "records"
                ? "Search"
                : "Ask"}
          </button>
          {conversationId && (
            <button
              type="button"
              onClick={startNewThread}
              disabled={loading}
              className="rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-50"
            >
              New thread
            </button>
          )}
        </div>
        <p className="text-[11.5px] text-[var(--ink-faint)]">
          {mode === "records"
            ? "Prefer a short modus phrase. Weak crime-label queries may return empty (floor 0.50). For a ranked table without Claude, use the Similar page Narrative mode."
            : "Mic is always available next to the ChatPanel input (Design §11). Speak the id clearly, e.g. “ACC-00040”. If speech-to-text is down, type instead."}
        </p>
      </form>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {mode === "records"
          ? DEMO_RECORDS_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => pickRecordsPrompt(prompt)}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                  query === prompt
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                    : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
                }`}
              >
                {prompt}
              </button>
            ))
          : (mode === "accused" ? DEMO_ACCUSED : DEMO_FIRS).map((item) => {
              const id = "accusedId" in item ? item.accusedId : item.firId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => ("accusedId" in item ? pickAccused(id) : pickFir(id))}
                  className={`rounded-full border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11.5px] transition-colors ${
                    query === id
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
                  }`}
                >
                  {id}
                </button>
              );
            })}
      </div>

      {error && !conversationId && (
        <p
          className="mb-4 rounded border border-[var(--risk-high)] bg-[var(--risk-high-soft)] px-3.5 py-3 text-[13.5px] text-[var(--risk-high)]"
          role="alert"
        >
          {error}
        </p>
      )}

      {(turns.length > 0 || pendingOfficer) && (
        <div className="mb-4 space-y-6" aria-label="Conversation thread">
          {turns.map((turn, index) => (
            <ThreadExchange
              key={turn.id}
              turn={turn}
              turnIndex={index + 1}
              onCiteClick={askAboutCitedId}
            />
          ))}
          {pendingOfficer && (
            <div className="space-y-3" aria-busy="true">
              <OfficerBubble text={pendingOfficer} />
              <p className="text-[13.5px] text-[var(--ink-muted)]" role="status">
                {busy === "followUp"
                  ? "Resolving follow-up and assembling the answer…"
                  : busy === "voice"
                    ? "Transcribing and assembling the answer…"
                    : "Assembling context and generating the answer…"}
              </p>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>
      )}

      {turns.length === 0 && !pendingOfficer && !loading && !error && (
        <p className="text-[13.5px] text-[var(--ink-faint)]">
          Try ACC-00040 or FIR-003276 for a rehearsed Lane B demo seed.
        </p>
      )}

      {conversationId && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--surface)]/95 shadow-[0_-4px_16px_rgba(24,36,55,0.06)] backdrop-blur-sm"
          role="region"
          aria-label="Follow-up composer"
        >
          <div className="mx-auto max-w-3xl space-y-2 px-7 py-3">
            {error && (
              <p
                className="rounded border border-[var(--risk-high)] bg-[var(--risk-high-soft)] px-3.5 py-3 text-[13.5px] text-[var(--risk-high)]"
                role="alert"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                onKeyDown={onFollowUpKeyDown}
                placeholder='Follow-up — e.g. “What about the vehicle?”, “Tell me about FIR-…”, or “Find similar cases”'
                className="min-w-[16rem] flex-1 rounded border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                aria-label="Follow-up question"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => void toggleVoiceCapture("followUp")}
                disabled={loading && !recording}
                className={`rounded border px-4 py-2.5 font-[family-name:var(--font-mono)] text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                  recording && voiceTarget === "followUp"
                    ? "border-[var(--risk-high)] bg-[var(--risk-high-soft)] text-[var(--risk-high)]"
                    : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--accent)]"
                }`}
                aria-pressed={recording && voiceTarget === "followUp"}
                aria-label={
                  recording && voiceTarget === "followUp"
                    ? "Stop recording"
                    : "Record voice follow-up"
                }
                title="Speak a short English follow-up (under ~30s). Click again to stop and ask."
              >
                {recording && voiceTarget === "followUp" ? "Stop mic" : "Mic"}
              </button>
              <button
                type="button"
                onClick={() => void submitFollowUp()}
                disabled={loading || !followUp.trim()}
                className="rounded border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--surface)] disabled:opacity-50"
              >
                {busy === "followUp" || busy === "voice" ? "Asking…" : "Ask follow-up"}
              </button>
            </div>
            <p className="text-[11.5px] text-[var(--ink-faint)]">
              Tip: tap an ACC-/FIR- citation chip under any answer. Ask “find similar cases” after an
              FIR. Mic works on seed and follow-up — if speech-to-text is down, type instead.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function OfficerBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] rounded-2xl rounded-br-md bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[var(--accent-ink)]">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-ink)]/80">
          You
        </p>
        <p>{text}</p>
      </div>
    </div>
  );
}

function ThreadExchange({
  turn,
  turnIndex,
  onCiteClick,
}: {
  turn: ThreadTurn;
  turnIndex: number;
  onCiteClick: (id: string) => void;
}) {
  return (
    <div className="space-y-3" aria-label={`Turn ${turnIndex}`}>
      <OfficerBubble text={turn.officerText} />
      <QueryAnswerCard result={turn.result} onCiteClick={onCiteClick} />
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-[var(--accent-soft)] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[12px] font-medium text-[var(--accent-ink)]"
          : "rounded-md px-3 py-1.5 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)]"
      }
    >
      {children}
    </button>
  );
}

/** Build citation snapshot from the last answer so follow-ups survive store misses. */
function toFollowUpContext(
  result: QueryResult,
  mode: SeedMode,
  seedInput: string,
): FollowUpContext {
  const seed = seedInput.trim();
  const fromMode =
    mode === "accused"
      ? { accusedId: ACCUSED_ID_PATTERN.test(seed) ? seed : null, firId: null as string | null }
      : mode === "fir"
        ? { accusedId: null as string | null, firId: FIR_ID_PATTERN.test(seed) ? seed : null }
        : { accusedId: null as string | null, firId: null as string | null };

  // Prefer an ACC-/FIR- evidence id when the form seed no longer matches the last ask.
  let accusedId = fromMode.accusedId;
  let firId = fromMode.firId;
  if (!accusedId && !firId) {
    for (const id of [...(result.relatedFirs ?? []), ...(result.evidenceSources ?? [])]) {
      const upper = id.toUpperCase();
      if (upper.startsWith("ACC-")) {
        accusedId = id;
        break;
      }
      if (upper.startsWith("FIR-")) {
        firId = id;
        break;
      }
    }
  }

  return {
    accusedId,
    firId,
    evidenceSources: result.evidenceSources ?? [],
    relatedFirs: result.relatedFirs ?? [],
    relatedEntities: result.relatedEntities ?? [],
  };
}

/** First ACC-/FIR- id in a transcript (ChatPanel voice seed). */
export function extractSpokenSeedId(text: string): string | null {
  const match = text.match(/\b((?:ACC|FIR)-[A-Za-z0-9_-]+)\b/i);
  return match ? match[1].toUpperCase() : null;
}

/** Returns an officer-facing error, or null when the id matches the selected tab. */
export function validateSeedForMode(mode: SeedMode, seed: string): string | null {
  const id = seed.trim();
  if (!id) return "Enter an id to ask.";

  if (mode === "records") {
    return null;
  }

  if (mode === "accused") {
    if (FIR_ID_PATTERN.test(id)) {
      return `“${id}” is an FIR id. Switch to the FIR tab, or enter an accused id (ACC-…).`;
    }
    if (!ACCUSED_ID_PATTERN.test(id)) {
      return `Accused id must look like ACC-00040 (got “${id}”).`;
    }
    return null;
  }

  if (ACCUSED_ID_PATTERN.test(id)) {
    return `“${id}” is an accused id. Switch to the Accused tab, or enter an FIR id (FIR-…).`;
  }
  if (!FIR_ID_PATTERN.test(id)) {
    return `FIR id must look like FIR-003276 (got “${id}”).`;
  }
  return null;
}

function QueryAnswerCard({
  result,
  onCiteClick,
}: {
  result: QueryResult;
  onCiteClick?: (id: string) => void;
}) {
  const softFail =
    result.confidenceScore === 0 &&
    /unusable|not configured|timed out|generation failed|interrupted|could not produce/i.test(
      result.answer,
    );
  const briefingParas = useMemo(() => toParagraphs(result.answer), [result.answer]);
  const reasoningParas = useMemo(
    () => toParagraphs(humanizeOfficerProse(result.reasoningSummary)),
    [result.reasoningSummary],
  );
  const entityGroups = useMemo(
    () => groupRelatedEntities(result.relatedEntities),
    [result.relatedEntities],
  );

  return (
    <div className="space-y-5">
      <article className="card overflow-hidden">
        <SectionBand title="Case briefing" tone="primary" />
        <div className="space-y-3 px-5 py-4">
          <div className="space-y-3">
            {briefingParas.map((para, i) => (
              <p
                key={i}
                className="text-[14.5px] leading-relaxed text-[var(--ink)]"
              >
                {humanizeOfficerProse(para)}
              </p>
            ))}
          </div>
          {!softFail && reasoningParas.length > 0 && (
            <div className="space-y-2 border-t border-[var(--line)] pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                Why this reading
              </p>
              {reasoningParas.map((para, i) => (
                <p key={i} className="text-[13px] leading-relaxed text-[var(--ink-muted)]">
                  {para}
                </p>
              ))}
            </div>
          )}
          <QueryMetaBand result={result} softFail={softFail} />
        </div>
      </article>

      {result.evidenceSources.length > 0 && (
        <section>
          <SectionBand title="Evidence sources" tone="evidence" />
          <p className="mb-2 mt-2 text-[12px] text-[var(--ink-faint)]">
            Queried id and other cited ids not already listed under Related FIRs / people &amp;
            places. Tap a chip to follow up.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.evidenceSources.map((id) => (
              <CiteChip key={id} id={id} onClick={onCiteClick} />
            ))}
          </div>
        </section>
      )}

      {result.relatedFirs.length > 0 && (
        <section>
          <SectionBand title="Related FIRs" tone="firs" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.relatedFirs.map((id) => (
              <CiteChip key={id} id={id} onClick={onCiteClick} muted />
            ))}
          </div>
        </section>
      )}

      {entityGroups.length > 0 && (
        <section>
          <SectionBand title="Related people & places" tone="entities" />
          <div className="mt-3 space-y-4">
            {entityGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 text-[12px] font-semibold text-[var(--accent-ink)]">
                  {group.title}
                </p>
                <ul className="space-y-1.5 text-[13px]">
                  {group.items.map((e) => (
                    <li key={e.id} className="text-[var(--ink-muted)]">
                      {onCiteClick &&
                      (e.id.toUpperCase().startsWith("ACC-") ||
                        e.id.toUpperCase().startsWith("FIR-")) ? (
                        <button
                          type="button"
                          onClick={() => onCiteClick(e.id)}
                          className="font-[family-name:var(--font-mono)] text-[var(--ink)] underline-offset-2 hover:underline hover:text-[var(--accent-ink)]"
                        >
                          {e.id}
                        </button>
                      ) : (
                        <span className="font-[family-name:var(--font-mono)] text-[var(--ink)]">
                          {e.id}
                        </span>
                      )}
                      {e.label ? ` · ${humanizeLabel(e.label)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CiteChip({
  id,
  onClick,
  muted = false,
}: {
  id: string;
  onClick?: (id: string) => void;
  muted?: boolean;
}) {
  const base =
    muted
      ? "rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink-muted)]"
      : "rounded border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink)]";
  if (!onClick) {
    return <span className={base}>{id}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`${base} transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)]`}
      title={`Ask about ${id}`}
    >
      {id}
    </button>
  );
}

type BandTone = "primary" | "evidence" | "firs" | "entities";

function SectionBand({ title, tone }: { title: string; tone: BandTone }) {
  const barClass =
    tone === "primary"
      ? "border-l-[var(--accent)]"
      : tone === "evidence"
        ? "border-l-[#9a7340]"
        : tone === "firs"
          ? "border-l-[#3d5a80]"
          : "border-l-[#4a6741]";

  return (
    <div
      className={`rounded-md border border-[var(--line)] border-l-4 bg-[var(--surface-2)] px-3.5 py-2 ${barClass}`}
      role="heading"
      aria-level={2}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-ink)]">
        {title}
      </p>
    </div>
  );
}

function QueryMetaBand({ result, softFail }: { result: QueryResult; softFail: boolean }) {
  const latencySec = (result.latencyMs / 1000).toFixed(1);
  const confidencePct = Math.round(result.confidenceScore * 100);

  return (
    <div
      className="mt-1 flex flex-wrap gap-2 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2.5"
      aria-label="Response metadata"
    >
      <MetaChip label="Confidence" value={softFail ? "—" : `${confidencePct}%`} emphasize />
      <MetaChip label="Time" value={`${latencySec}s`} />
      <MetaChip label="Session" value={result.conversationId} mono />
    </div>
  );
}

function MetaChip({
  label,
  value,
  emphasize = false,
  mono = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="min-w-[7rem] flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-ink)]">
        {label}
      </p>
      <p
        className={`mt-0.5 text-[13px] font-semibold text-[var(--ink)] ${
          mono ? "font-[family-name:var(--font-mono)] text-[12px]" : ""
        } ${emphasize ? "text-[15px] text-[var(--accent-ink)]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

/** Split model text into readable paragraphs (blank lines, else ~2 sentences each). */
export function toParagraphs(text: string): string[] {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return [];
  const byBlank = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;

  const single = byBlank[0] ?? trimmed;
  const sentences = single.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  if (!sentences || sentences.length <= 2) return [single];

  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    groups.push(
      sentences
        .slice(i, i + 2)
        .map((s) => s.trim())
        .join(" "),
    );
  }
  return groups;
}

/** Turn SCREAMING_SNAKE / InvestigationOfficer into officer-friendly wording. */
export function humanizeLabel(raw: string): string {
  if (!raw) return raw;
  return raw
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return token;
      if (token.includes("_") || /^[A-Z]{2,}[A-Z0-9_]*$/.test(token)) {
        return token
          .split("_")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      }
      if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(token)) {
        return token.replace(/([a-z])([A-Z])/g, "$1 $2");
      }
      return token;
    })
    .join("");
}

/** Soften stack jargon the model sometimes echoes into officer-facing prose. */
export function humanizeOfficerProse(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/\bCONTEXT graph\b/gi, "linked case records")
    .replace(/\bCONTEXT block\b/gi, "linked case records")
    .replace(/\bCONTEXT\b/g, "linked case records")
    .replace(/\b1-hop(?:\s+graph)?\s+neighborhood\b/gi, "immediate linked records")
    .replace(/\bneo4j\b/gi, "case graph")
    .replace(/\bpgvector\b/gi, "vector search")
    .replace(/\bclaude\b/gi, "the model")
    .replace(/\banthropic\b/gi, "the model")
    .replace(/\bquickml\b/gi, "the risk model")
    .replace(/\bsarvam\b/gi, "speech recognition")
    .replace(/\bMARKET_AREA\b/g, "market area")
    .replace(/\bATM_VICINITY\b/g, "ATM vicinity")
    .replace(/\b([A-Z]{2,}(?:_[A-Z0-9]+)+)\b/g, (_, code: string) => humanizeLabel(code));
}

type EntityGroup = { title: string; items: RelatedEntity[] };

const ENTITY_GROUP_ORDER: { title: string; match: (type: string, id: string) => boolean }[] = [
  {
    title: "Accused",
    match: (t, id) => /^accused$/i.test(t) || id.toUpperCase().startsWith("ACC-"),
  },
  {
    title: "Victims",
    match: (t, id) => /^victim/i.test(t) || id.toUpperCase().startsWith("VIC-"),
  },
  {
    title: "Witnesses",
    match: (t, id) => /^witness/i.test(t) || id.toUpperCase().startsWith("WIT-"),
  },
  {
    title: "Locations",
    match: (t, id) => /^location/i.test(t) || id.toUpperCase().startsWith("LOC-"),
  },
  {
    title: "Investigation officers",
    match: (t, id) =>
      /officer|investigation/i.test(t) || id.toUpperCase().startsWith("OFF-"),
  },
  {
    title: "FIRs",
    match: (t, id) => /^fir$/i.test(t) || id.toUpperCase().startsWith("FIR-"),
  },
];

export function groupRelatedEntities(entities: RelatedEntity[]): EntityGroup[] {
  const remaining = [...entities];
  const groups: EntityGroup[] = [];

  for (const def of ENTITY_GROUP_ORDER) {
    const items: RelatedEntity[] = [];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const e = remaining[i];
      if (def.match(e.type ?? "", e.id)) {
        items.unshift(e);
        remaining.splice(i, 1);
      }
    }
    if (items.length > 0) {
      groups.push({ title: def.title, items });
    }
  }

  if (remaining.length > 0) {
    groups.push({ title: "Other", items: remaining });
  }
  return groups;
}
