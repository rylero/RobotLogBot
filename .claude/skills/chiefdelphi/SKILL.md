---
name: chiefdelphi
description: >-
  Research FRC mechanical and design questions on Chief Delphi using the
  chiefdelphi MCP. Use when the user asks what teams are doing, how to design
  or build a mechanism, or to look something up on Chief Delphi or Open Alliance.
---

# Chief Delphi research

Use the **chiefdelphi** MCP. Do not guess forum contents.

## Tools

| Tool | Use |
| --- | --- |
| `search_knowledge` | Default. Searches inside posts and comments. |
| `get_topic` | Read a full thread after you have a topic ID. |
| `ingest_knowledge` | Pull more full threads, then search again. |
| `search_topics` | Titles only. Weaker. Skip unless you only need a thread list. |
| `list_latest` | Recent activity in one category (`open-alliance`, `cad`, `manufacturing`, …). |

## Search loop

1. Rewrite the user question into a short `search_knowledge` query: mechanism + part + material or failure mode. Set `game_piece` when a game object is involved.
2. Run `search_knowledge`. Leave `include_open_alliance` on (default).
3. If hits are thin or off-topic, `ingest_knowledge` with the same query, then search again. Try one alternate wording (COTS name, material, tag-like noun).
4. `get_topic` on 1–3 useful topic IDs for surrounding posts.
5. Answer only from fetched posts. Cite URL, author, and date. Quote sizes, materials, and failure modes when they appear.

## Open Alliance

Open Alliance build threads are a wealth of design detail. Teams diary CAD, reprints, and field failures in **comments**, so titles rarely name the part you care about.

- Always include them on mechanism/design questions (`search_knowledge` already pulls the Open Alliance category).
- When a hit is an Open Alliance thread, `get_topic` and read the nearby posts — the useful sentence is often not the OP.
- `list_latest` with `category: open-alliance` if you need current-season build blogs first.

## Query shape

Prefer nouns other teams would write:

- `algae ground intake compliant wheels`
- `printed limelight mount petg`
- `cascade elevator 1x1 tubing`

Avoid vague verbs (`make more robust`, `what are teams doing`). Add the part and the constraint instead.

## Quality bar

- Prefer recent / current-season posts unless the user asks for history.
- If comments never mention a key term, say so. Do not invent team numbers or parts.
- If threads disagree, report the disagreement.
