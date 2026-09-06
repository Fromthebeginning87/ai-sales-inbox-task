import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

type Message = {
  id: string;
  senderName: string;
  senderEmail: string;
  company: string;
  subject: string;
  body: string;
  createdAt: string;
};

// Deterministic demo messages
const MESSAGES: Message[] = [
  {
    id: "msg-1",
    senderName: "Alice",
    senderEmail: "alice@example.com",
    company: "Acme Co",
    subject: "Inquiry about widgets",
    body: "Hi, we are looking for 100 steel widgets. Our budget is $1500.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "msg-2",
    senderName: "Bob",
    senderEmail: "bob@example.com",
    company: "Beta LLC",
    subject: "Need 5 units of model X",
    body: "Hello, please quote 5 units of model X, material: aluminum, budget 2000",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

app.get("/api/messages", (_req, res) => {
  res.json(MESSAGES);
});

app.get("/api/messages/:id", (req, res) => {
  const msg = MESSAGES.find((m) => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: "Message not found" });
  res.json(msg);
});

// Simple AI extraction mock: heuristics over message body/subject
app.post("/api/ai/extract", (req, res) => {
  const bodySchema = z.object({ messageId: z.string() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "messageId is required" });
  const { messageId } = parsed.data;
  const msg = MESSAGES.find((m) => m.id === messageId);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  const text = `${msg.subject} ${msg.body}`;

  // quantity: first integer >0
  const qtyMatch = text.match(/(\d+)\b/);
  const quantity = qtyMatch && qtyMatch[1] ? parseInt(qtyMatch[1], 10) : undefined;

  // budget: look for $number or number preceded by budget
  const budgetMatch = text.match(/\$\s*(\d+(?:\.\d+)?)/) || text.match(/budget[^0-9]*(\d+(?:\.\d+)?)/i);
  const budget = budgetMatch ? Number(budgetMatch[1]) : undefined;

  // material: simple keywords
  const materialMatch = text.match(/\b(steel|aluminum|aluminium|plastic)\b/i);
  const material = materialMatch ? materialMatch[1] : undefined;

  // product: pick a noun-like token from subject (first word after inquiry words)
  let product: string | undefined;
  const prodMatch = msg.subject.match(/(?:about|need|for|of)\s+([A-Za-z0-9 \-]+)/i);
  const prodCapture = prodMatch?.[1];
  if (prodCapture) product = prodCapture.split(/[\.|,|\n]/)[0]!.trim();
  if (!product) {
    const parts = msg.subject.split(/[:\-–]/).pop()?.trim();
    if (parts) product = parts.split(" ").slice(0, 3).join(" ");
  }

  const result: Record<string, unknown> = {};
  if (product) result.product = product;
  if (quantity !== undefined) result.quantity = quantity;
  if (material !== undefined) result.material = material;
  if (budget !== undefined) result.budget = budget;

  res.json(result);
});

// Zod schema for lead creation
const createLeadSchema = z.object({
  sourceMessageId: z.string(),
  product: z.string().transform((s) => s.trim()).refine((s) => s.length > 0, { message: "product is required" }),
  quantity: z.number().int().positive(),
  material: z.union([z.string(), z.null()]).optional(),
  budget: z.number().finite().nonnegative().optional(),
});

app.post("/api/leads", async (req, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const { sourceMessageId, product, quantity, material, budget } = parsed.data;

  const msg = MESSAGES.find((m) => m.id === sourceMessageId);
  if (!msg) return res.status(400).json({ error: "sourceMessageId does not exist" });

  try {
    const lead = await prisma.lead.create({
      data: {
        id: crypto.randomUUID(),
        sourceMessageId,
        product,
        quantity,
        material: material === undefined || material === "" ? null : material,
        budget: budget === undefined ? null : budget,
        status: "NEW",
      },
    });
    res.json(lead);
  } catch (err: any) {
    console.error("LEAD CREATION ERROR:", err);
    res.status(500).json({ error: err?.message ?? "Could not create lead", details: String(err) });
  }
});

app.get("/api/leads", async (_req, res) => {
  try {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not list leads" });
  }
});

const patchStatusSchema = z.object({ status: z.literal("CONTACTED") });

app.patch("/api/leads/:leadId/status", async (req, res) => {
  const parsed = patchStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Only { status: 'CONTACTED' } is allowed" });
  const { leadId } = req.params;
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (lead.status !== "NEW") return res.status(400).json({ error: "Can only change status from NEW to CONTACTED" });
    const updated = await prisma.lead.update({ where: { id: leadId }, data: { status: "CONTACTED" } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update lead status" });
  }
});

const port = Number(process.env.PORT ?? 3001);

app.listen(port, "0.0.0.0", () => {
  console.log(`InboxIQ listening on http://localhost:${port}`);
});
