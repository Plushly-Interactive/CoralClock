# Quote curation — full criteria

TL;DR: the seven curation criteria in full, with the reasoning for each, plus the table of rejected quotes and why they failed. Summary and checklist: `docs/features/enforcement/blocked-page-quotes-curation.md`.

### 1. Author Verification

Every quote must have a verified author. If the quote exists but the author is unknown or unverifiable:

- Search primary sources first: books (Internet Archive, Google Books), transcripts, academic papers, official author pages
- If no author is found after research, replace the quote entirely
- Proverbs are acceptable and encouraged — they carry cultural wisdom without individual attribution

**Proverb sourcing:** Proverbs must be attributed to their cultural origin (e.g., "Irish proverb," "Japanese proverb"), not just labeled "proverb." This respects the cultural lineage and avoids vagueness.

**Apocryphal attribution:** Many quotes widely attributed online have no traceable primary source. If Quote Investigator, academic Rumi scholarship, or similar authoritative debunking sources flag a quote as apocryphal, remove it regardless of how widely it circulates. Internet popularity is not evidence of authenticity.

**Why:** Unattributed or misattributed quotes undermine the app's credibility. If a user clicks the source link and finds no match, the extension loses trust.

### 2. Ethical Vetting

Authors must be ethically sound. Exclude authors with documented:

- Human rights violations or abuse
- Hate speech, bigotry, or discriminatory ideology
- Animal cruelty advocacy
- Plagiarism or intellectual dishonesty
- Tech CEO/executive status (due to concentration of power and algorithmic harm advocacy)
- Antisemitism, slavery defense, or other historical atrocities
- Controversial personal conduct that contradicts their public message

**Background checks:** Before adding an author, research their public history, statements, and conduct. Look for:

- News articles about ethical concerns
- Academic/professional misconduct records
- Public controversies or scandals
- Documented harm to vulnerable populations

**Why:** This app is a wellness tool. Attributing wisdom to ethically compromised figures undermines the message and contradicts our values of care and integrity.

### 3. Tone & Philosophy

Quotes must align with wellbeing and life balance messaging:

- **Favor:** Rest, recovery, intentionality, presence, self-compassion, natural rhythms
- **Reject:** Productivity hustle, scarcity mindset, guilt-inducing framing, time management pressure, artificial urgency
- **Clarity requirement:** Quotes must be self-explanatory and immediately understandable. Avoid obscure metaphors, cryptic phrasing, or references that require context to grasp. A blocked user should "get it" without needing to think hard.

**Why:** Users are blocked because they've exceeded a healthy limit. The quote should reinforce that limit as caring, not punitive. Hustle culture messaging is the opposite of this extension's purpose. Clarity ensures the message lands when users are frustrated or defensive about being blocked.

### 4. Religious Content

Avoid explicit religious language or theology:

- ❌ "holy ground," "blessed," explicit deity references, sectarian doctrine
- ✓ Spiritual or philosophical quotes without explicit religious framing

**Why:** This app serves a global, multi-faith user base. Explicit religious messaging alienates users outside that tradition.

### 5. Author Diversity

Balance across author types and demographics:

- **Proverbs:** ~35% — cultural wisdom, timeless, author-agnostic
- **Scientists/researchers:** ~15% — grounded in evidence (psychology, neuroscience, etc.)
- **Named authors:** ~50% — mix of writers, public figures, thinkers with diverse backgrounds
- **Gender diversity in named authors:** Aim for balanced representation across genders
- **Political & philosophical alignment:** Prioritize authors whose work centers human wellbeing, equity, and collective care over individual wealth accumulation or competitive advantage. Authors should demonstrate values aligned with rest, sustainable living, and systemic care rather than extraction or hustle narratives.

**Why:** Proverbs provide cultural depth without individual bias. Scientists ground the message in evidence. Named authors add relatability. Gender diversity ensures diverse voices are equally represented. Political/philosophical alignment ensures the quotes reinforce the app's core mission: rest and wellbeing are not luxuries but human rights.

### 6. Quote Verification

Every quote must have a `source` URL where the quote itself can be verified. The source must be a **primary or authoritative document** — not a quote aggregator.

**Accepted source types:**

- **Living authors:** Official author site with the quote, publisher excerpt, interview transcript, or the author's own social media post
- **Historical figures:** Internet Archive digitization of the original book, Wikiquote (only if it cites a specific book and page number), academic editions
- **Proverbs:** Institutional or academic sources — university cultural centers, linguist-maintained collections, culturally authentic organizations; never blogs or aggregators without cited origins
- **Scientists/researchers:** The actual research paper or book (Internet Archive, open-access journal)

**Rejected source types:**

- Goodreads, BrainyQuote, AZQuotes, QuoteFancy, or any aggregator that does not explicitly state its own source — treat these as misinformation
- Wikipedia as a source for the quote text itself (Wikipedia is acceptable only for `philosophySource`)
- Any page that does not visibly contain the quote text

**Why:** Users need to verify the quote is real and accurately attributed. If the source link does not contain the actual quote, it fails its purpose.

### 7. Philosophy Context

Every quote should optionally include a `philosophySource` URL that reveals the author's broader work and values:

- **Living authors:** Official website, TED talks, research pages, published books showcasing their philosophy
- **Historical figures:** Wikipedia biography or scholarly sources (secondary source acceptable here, as primary context)
- **Proverbs:** Cultural origin sources, collections explaining the tradition and wisdom lineage
- **Scientists/researchers:** Academic institution pages, lab sites, research centers where their work is displayed

**Why:** After verifying the quote, curious users can explore why this author/tradition matters. The "Learn more ↗" link provides context without cluttering the primary interaction. Users discover the author's values and philosophy, making the wisdom feel relevant and earned, not imposed.

## Examples of Rejected Quotes & Why


| Quote                                                                    | Author                | Reason                                                                                       |
| ------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------- |
| "Time is money"                                                          | Benjamin Franklin     | Productivity scarcity mindset                                                                |
| "Be patient with yourself. Self-growth is tender; it's holy ground."     | Stephen Covey         | Explicit religious language ("holy ground")                                                  |
| "Rest is not idleness. Rest is what lets you do the next hard thing."    | Anonymous             | No verified author                                                                           |
| "Life is a balance between holding on and letting go."                   | Rumi                  | Apocryphal — no Persian manuscript equivalent found; confirmed by Rumi scholars              |
| "The best time to plant a tree was twenty years ago."                    | Chinese proverb       | Not a Chinese proverb — earliest known use is a 1967 American newspaper (Quote Investigator) |
| "Let things flow naturally forward in whatever way they like."           | Lao Tzu               | Not in any classical Tao Te Ching translation; likely a modern paraphrase                    |
| "Procrastination is about managing your emotions, not your time."        | Tamar Gendler         | Misattribution — idea belongs to Tim Pychyl's procrastination research                       |
| "Mindfulness meditation improves emotion regulation and reduces stress." | Neuroscience research | Paraphrase of research findings, not a verbatim quote — not admissible                       |

---

## Original wording kept verbatim

## Overview

The blocked page quotes system displays time-of-day specific quotes to users when they hit a time limit. Quote curation follows a rigorous vetting process to ensure quality, authenticity, and alignment with the app's wellbeing-first philosophy.

**Quality assurance:** While initial quote suggestions may come from AI assistance, every single quote in the system has been manually reviewed for accuracy, tone, ethics, and fit. No quote is added without human verification across all criteria below.
