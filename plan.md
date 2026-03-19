# Plan: Knowledge Graph Dashboard ("Graph View")

## Overview

Add an Obsidian-style knowledge graph view to SupraCRM that visualizes relationships between deals, contacts, companies, TG groups, and slugs. Includes a docs/notes system for creating rich notes linked to any CRM entity.

---

## Part 1: Database — Notes/Docs System

### Migration: `crm_docs` table

```sql
create table crm_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  created_by uuid references auth.users(id) not null,
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Junction: link a doc to any entity
create table crm_doc_links (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references crm_docs(id) on delete cascade not null,
  entity_type text not null, -- 'deal' | 'contact' | 'group'
  entity_id uuid not null,
  created_at timestamptz default now(),
  unique(doc_id, entity_type, entity_id)
);
```

- `crm_docs`: standalone notes/docs that can be linked to multiple entities
- `crm_doc_links`: junction table connecting docs to deals, contacts, or groups
- RLS: authenticated users can CRUD

---

## Part 2: API Routes

### `/api/docs`
- `GET` — list docs (optional `?entity_type=deal&entity_id=xxx` filter)
- `POST` — create doc `{ title, content, links: [{ entity_type, entity_id }] }`

### `/api/docs/[id]`
- `GET` — single doc with linked entities
- `PATCH` — update title/content/links
- `DELETE` — delete doc

### `/api/graph`
- `GET` — returns nodes and edges for the knowledge graph
  - Nodes: deals, contacts, groups, docs (with type, label, metadata)
  - Edges: deal→contact, deal→group, doc→entity, contact→group (via deals), slug connections
  - Filters via query params: `?types=deal,contact&board=BD`

---

## Part 3: Frontend — Graph Dashboard Page

### New route: `/graph`

**Page layout:**
- Full-width canvas with Cytoscape.js graph
- Left sidebar panel (collapsible): filters by entity type, board, slug, search
- Right panel (slide-over): entity detail on node click, or doc editor on doc node click
- Top toolbar: layout toggle (force/grid/circle), zoom controls, "New Doc" button

**Graph nodes:**
| Entity | Shape | Color |
|--------|-------|-------|
| Deal | rectangle | primary (teal) |
| Contact | ellipse | blue |
| TG Group | diamond | purple |
| Doc | round-rectangle | amber |

**Graph edges:**
| Relationship | Style |
|-------------|-------|
| deal→contact | solid |
| deal→group | dashed |
| doc→any entity | dotted (amber) |
| shared slug | thin gray |

**Interactions:**
- Hover: tooltip with entity name + key info
- Click: open detail in right panel
- Double-click doc node: open doc editor
- Right-click: context menu (go to entity page, create linked doc, etc.)
- Filter checkboxes dim/hide node types
- Search highlights matching nodes

### New route: `/docs`

Simple docs list page:
- Table of all docs with title, linked entities (as badges), updated_at, created_by
- Click row → opens doc editor (full page or slide-over)
- "New Doc" button → create modal

### Doc Editor Component

- Title input (large, inline-editable)
- Textarea for content (plain text/markdown — keep it simple, no WYSIWYG)
- Entity links section: chips showing linked entities, "Link Entity" button with search dropdown
- Auto-save on blur or after 2s debounce

---

## Part 4: Navigation

Add to sidebar (`desktop-sidebar.tsx`):
- "Graph" — `/graph` (icon: `Network` from lucide-react)
- "Docs" — `/docs` (icon: `FileText` from lucide-react)

Position: after "Access" in the main nav section.

---

## Part 5: Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | DB migration for `crm_docs` + `crm_doc_links` | `supabase/migrations/20260319_crm_docs.sql` |
| 2 | API routes: `/api/docs`, `/api/docs/[id]` | `app/api/docs/` |
| 3 | API route: `/api/graph` | `app/api/graph/route.ts` |
| 4 | Install cytoscape + react-cytoscapejs | `package.json` |
| 5 | Graph page + Cytoscape component | `app/graph/page.tsx`, `components/graph/` |
| 6 | Docs page + doc editor | `app/docs/page.tsx`, `components/docs/` |
| 7 | Sidebar nav update | `app/_components/shell/desktop-sidebar.tsx` |
| 8 | Wire doc links into existing detail panels | `components/pipeline/deal-detail-panel.tsx`, `components/contacts/contact-detail-panel.tsx` |

---

## Dependencies to Add

- `cytoscape` (~90 kB gzip, MIT) — graph rendering engine
- `react-cytoscapejs` — thin React wrapper (or DIY with useRef if React 19 issues)

No other new deps needed. Markdown rendering for docs can use a simple regex-based approach or just render as preformatted text initially.

---

## What This Does NOT Include

- WYSIWYG editor (keep it simple — textarea with markdown)
- Real-time collaboration on docs
- Graph persistence (layout positions) — always computed fresh
- AI features on docs (can add later)
- Doc versioning/history
