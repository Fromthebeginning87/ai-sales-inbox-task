import { useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Lead, Message } from "./types";

const path = window.location.pathname.replace(/\/+$/, "") || "/inbox";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Layout({ children }: { children: ReactNode }) {
  const isPipeline = path === "/pipeline";
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/inbox" aria-label="InboxIQ home"><span className="brand-mark">IQ</span><span>InboxIQ</span></a>
        <nav aria-label="Primary navigation">
          <a className={!isPipeline ? "nav-link active" : "nav-link"} href="/inbox" aria-current={!isPipeline ? "page" : undefined}>Inbox</a>
          <a className={isPipeline ? "nav-link active" : "nav-link"} href="/pipeline" aria-current={isPipeline ? "page" : undefined}>Pipeline</a>
        </nav>
        <span className="status-pill"><span className="status-dot" /> Local workspace</span>
      </header>
      {children}
    </div>
  );
}

function StateMessage({ children }: { children: ReactNode }) {
  return <p className="state-message">{children}</p>;
}

function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    api.listMessages().then((result) => {
      if (active) { setMessages(result); setState("ready"); }
    }).catch(() => active && setState("error"));
    return () => { active = false; };
  }, []);

  return (
    <main className="page-container">
      <section className="page-heading"><div><p className="eyebrow">Sales workspace</p><h1>Inbox</h1><p className="muted">Review inbound conversations and decide what deserves a follow-up.</p></div><div className="metric-card"><strong>{messages.length}</strong><span>messages</span></div></section>
      <section className="panel" aria-labelledby="messages-heading">
        <div className="panel-heading"><h2 id="messages-heading">Latest messages</h2><span className="muted">Deterministic demo data</span></div>
        {state === "loading" && <StateMessage>Loading inbox…</StateMessage>}
        {state === "error" && <StateMessage>Could not load the inbox. Check that the API is running.</StateMessage>}
        {state === "ready" && <ul className="message-list">{messages.map((message) => <MessageRow key={message.id} message={message} />)}</ul>}
      </section>
    </main>
  );
}

function MessageRow({ message }: { message: Message }) {
  return (
    <li>
      <a className="message-row" href={`/inbox/${message.id}`}>
        <span className="avatar">{message.senderName.slice(0, 1)}</span>
        <span className="message-copy">
          <span className="message-meta"><strong>{message.senderName}</strong><span>{formatDate(message.createdAt)}</span></span>
          <span className="message-subject">{message.subject}</span>
          <span className="message-preview">{message.company} · {message.body}</span>
        </span>
        <span className="row-arrow" aria-hidden="true">→</span>
      </a>
    </li>
  );
}

function DetailPage({ messageId }: { messageId: string }) {
  const [message, setMessage] = useState<Message | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // form state
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState<string>("");
  const [material, setMaterial] = useState<string>("");
  const [budget, setBudget] = useState<string>("");

  const [touched, setTouched] = useState({ product: false, quantity: false, material: false, budget: false });

  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getMessage(messageId).then((result) => {
      if (active) { setMessage(result); setState("ready"); }
    }).catch(() => active && setState("error"));
    return () => { active = false; };
  }, [messageId]);

  if (state === "loading") return <main className="page-container"><StateMessage>Loading message…</StateMessage></main>;
  if (state === "error" || !message) return <main className="page-container"><StateMessage>Message not found.</StateMessage></main>;

  async function handleExtract() {
    setError(null);
    setExtracting(true);
    try {
      const extracted = await api.aiExtract(messageId);
      // Merge: only fill empty fields that were not touched by user
      if (!touched.product && (!product || product.trim() === "") && typeof extracted.product === "string") setProduct(String(extracted.product));
      if (!touched.quantity && (!quantity || quantity.trim() === "") && typeof extracted.quantity === "number") setQuantity(String(extracted.quantity));
      if (!touched.material && (!material || material.trim() === "") && (typeof extracted.material === "string" || extracted.material === null)) setMaterial(extracted.material === null ? "" : String(extracted.material));
      if (!touched.budget && (!budget || budget.trim() === "") && typeof extracted.budget === "number") setBudget(String(extracted.budget));
    } catch (err) {
      setError("AI extraction failed. You can still fill the form manually.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        sourceMessageId: messageId,
        product,
        quantity: Number(quantity),
        material: material === "" ? undefined : material,
        budget: budget === "" ? undefined : Number(budget),
      } as const;
      await api.createLead(payload as any);
      // navigate to pipeline after save
      window.location.href = "/pipeline";
    } catch (err) {
      setError("Could not save lead. Check the form and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-container detail-layout">
      <a className="back-link" href="/inbox">← Back to inbox</a>
      <section className="detail-grid">
        <article className="panel message-detail">
          <p className="eyebrow">Inbound message</p>
          <h1>{message.subject}</h1>
          <dl className="message-facts">
            <div><dt>Sender</dt><dd>{message.senderName} · {message.senderEmail}</dd></div>
            <div><dt>Company</dt><dd>{message.company}</dd></div>
          </dl>
          <div className="message-body">{message.body}</div>
        </article>
        <aside className="panel" aria-label="Lead extraction">
          <p className="eyebrow">Lead extraction</p>
          <form onSubmit={handleSave}>
            <div className="form-row">
              <label htmlFor="product">Product</label>
              <input id="product" value={product} onChange={(e) => { setProduct(e.target.value); setTouched((t) => ({ ...t, product: true })); }} />
            </div>
            <div className="form-row">
              <label htmlFor="quantity">Quantity</label>
              <input id="quantity" value={quantity} onChange={(e) => { setQuantity(e.target.value); setTouched((t) => ({ ...t, quantity: true })); }} inputMode="numeric" />
            </div>
            <div className="form-row">
              <label htmlFor="material">Material</label>
              <input id="material" value={material} onChange={(e) => { setMaterial(e.target.value); setTouched((t) => ({ ...t, material: true })); }} />
            </div>
            <div className="form-row">
              <label htmlFor="budget">Budget</label>
              <input id="budget" value={budget} onChange={(e) => { setBudget(e.target.value); setTouched((t) => ({ ...t, budget: true })); }} inputMode="decimal" />
            </div>

            {error && <div role="alert" className="error">{error}</div>}

            <div className="form-actions">
              <button type="button" onClick={handleExtract} disabled={extracting || saving}>Extract with AI</button>
              <button type="submit" disabled={saving || extracting}>{saving ? "Saving…" : "Save lead"}</button>
            </div>
          </form>
        </aside>
      </section>
    </main>
  );
}

function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listLeads().then((result) => {
      if (active) { setLeads(result); setState("ready"); }
    }).catch(() => active && setState("error"));
    return () => { active = false; };
  }, []);

  async function markContacted(leadId: string) {
    setError(null);
    setLoadingMap((m) => ({ ...m, [leadId]: true }));
    try {
      const updated = await api.patchLeadStatus(leadId, "CONTACTED");
      setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l));
    } catch (err) {
      setError("Could not update status.");
    } finally {
      setLoadingMap((m) => ({ ...m, [leadId]: false }));
    }
  }

  return (
    <main className="page-container">
      <section className="page-heading"><div><p className="eyebrow">Revenue view</p><h1>Pipeline</h1><p className="muted">Saved leads will appear here.</p></div><div className="metric-card"><strong>{leads.length}</strong><span>leads</span></div></section>
      <section className="panel" aria-labelledby="pipeline-heading">
        <div className="panel-heading"><h2 id="pipeline-heading">Leads</h2></div>
        {state === "loading" && <StateMessage>Loading pipeline…</StateMessage>}
        {state === "error" && <StateMessage>Could not load the pipeline.</StateMessage>}
        {state === "ready" && (leads.length === 0 ? <p className="state-message">No leads yet.</p> : <ul className="lead-list">{leads.map((lead) => <LeadCard key={lead.id} lead={lead} loading={!!loadingMap[lead.id]} onMarkContacted={() => markContacted(lead.id)} />)}</ul>)}
        {error && <div role="alert" className="error">{error}</div>}
      </section>
    </main>
  );
}

function LeadCard({ lead, loading, onMarkContacted }: { lead: Lead; loading?: boolean; onMarkContacted?: () => void }) {
  return (
    <li className="lead-card">
      <div>
        <h3>{lead.product}</h3>
        <p>{lead.quantity} unit{lead.quantity === 1 ? "" : "s"}{lead.material ? ` · ${lead.material}` : ""}</p>
        <span className="muted">{lead.status} · {lead.budget === null ? "Budget unknown" : `${lead.budget}`}</span>
      </div>
      {lead.status === "NEW" && onMarkContacted && <div className="card-actions"><button disabled={loading} onClick={onMarkContacted}>{loading ? "…" : "Mark as contacted"}</button></div>}
    </li>
  );
}

export function App() {
  const content = path === "/pipeline" ? <PipelinePage /> : path.startsWith("/inbox/") ? <DetailPage messageId={decodeURIComponent(path.slice("/inbox/".length))} /> : <InboxPage />;
  return <Layout>{content}</Layout>;
}
