# Blocked page quotes — curation

TL;DR: every quote is manually vetted against seven criteria before it ships. AI may suggest a quote; no quote enters the system without human verification of accuracy, tone, ethics and fit. Full criteria with reasoning, and the rejected-quote table: [appendix](../appendix/quotes-curation-criteria.md).

## The seven criteria

1. **Author verification** — a verified author, or a proverb attributed to its culture, never a bare "proverb". Anything authoritative sources flag as apocryphal is removed however widely it circulates.
2. **Ethical vetting** — no authors with documented human rights abuses, hate speech, animal cruelty advocacy, plagiarism, or conduct contradicting their public message. Tech executives are excluded as a class.
3. **Tone and philosophy** — favour rest, recovery, intentionality and self-compassion; reject hustle, scarcity, guilt and artificial urgency. The line must land without effort for someone who is frustrated at being blocked.
4. **Religious content** — no explicit deity references, sectarian doctrine or wording like "holy ground". Spiritual or philosophical framing is fine.
5. **Author diversity** — roughly 35% proverbs, 15% scientists and researchers, 50% named authors, with balanced gender representation and values centred on wellbeing and collective care.
6. **Quote verification** — a `source` URL on a primary or authoritative document that visibly contains the quote text. Aggregators (Goodreads, BrainyQuote, AZQuotes and similar) are treated as misinformation unless they cite their own source.
7. **Philosophy context** — an optional `philosophySource` URL showing the author's broader work, where a secondary source such as Wikipedia is acceptable.

## Time-of-Day Buckets

Quotes are grouped by local time to match user context:


| Bucket        | Hours | Purpose                            |
| ------------- | ----- | ---------------------------------- |
| **morning**   | 6–10  | Intentional start, setting tone    |
| **afternoon** | 11–16 | Mid-day awareness, pacing          |
| **evening**   | 17–22 | Winding down, reflection           |
| **night**     | 23–5  | Sleep importance, rest, letting go |


## Site-Specific Quotes

Site-specific quotes (e.g., YouTube, Reddit) are original content crafted by the team. They do not require author attribution or sourcing because they are contextual nudges written in the app's voice, addressing friction points specific to each platform (algorithms, comment sections, autoplay, scrolling patterns). They reinforce the app's wellbeing-first philosophy without leveraging external authority — the message comes from the app's understanding of these platforms' behavioral design.

## Signature Quotes

Signature quotes are mascot character quotes written by the team, marked with `signature: true`. They have a 10% draw chance across all time slots and are filtered by `timeOfDay` like regular quotes.

**Current mascots:**

- **PwetPwet 🦈** — a tiny shark plushie. Funny, lighthearted, playful, wholesome. Themes: ocean life, shark duty, small-but-serious authority, ocean-as-bed metaphors for sleep.
- **Toot 🦊** — a tiny fox plushie. Serious, philosophical, self-improvement mindset. Themes: deep forest (= deep sleep), driving a bus (Toot as guide taking you somewhere better), forest stillness, clearing metaphors for distraction.

**Authorship rules for signature quotes:**

- `author` is required and must be the character's name with emoji (e.g., `"PwetPwet 🦈"`, `"Toot 🦊"`)
- `source` and `philosophySource` are omitted — these are original content
- IDs follow the pattern `sig-[character]-[timeOfDay]-[n]` (e.g., `sig-toot-n-1`, `sig-m-3` for PwetPwet)
- Tone must stay in character — do not mix PwetPwet's playfulness with Toot's gravity

## Audit Checklist

Before finalizing any new quote batch:

- All general (non-site) quotes have a verified author or confirmed cultural attribution
- No quote is retained if its attribution is flagged as apocryphal by authoritative sources
- All quotes have a `source` field pointing to a primary or authoritative document (not an aggregator)
- `source` links visibly contain the actual quote text — generic author pages or biography pages do not qualify
- Aggregator sites (Goodreads, BrainyQuote, AZQuotes, etc.) are not used as sources unless they explicitly cite their own primary source
- All quotes optionally have a `philosophySource` field; secondary sources (Wikipedia, publisher pages) are acceptable there
- No explicit religious language in quote text
- No quotes from ethically compromised authors
- No productivity/hustle messaging; all favor wellbeing/rest
- All quotes are clear and self-explanatory (no obscure metaphors)
- Author diversity is balanced (scientists, named authors, proverbs)
- Gender diversity in named authors is balanced
- Political/philosophical alignment centers human wellbeing and equity
- Proverb sources are institutional or academic — not blogs or articles written by authors outside the culture
- Signature quotes (`signature: true`) are exempt from source/philosophySource requirements — they are original content attributed to mascot characters with emoji (e.g., `"PwetPwet 🦈"`, `"Toot 🦊"`)

## Future Maintenance

- **Adding quotes:** Run through all seven criteria before committing
- **Signature quotes:** Team-authored mascot content — add to the `// SIGNATURE` section in `quotes.data.js` with a stable ID following the `sig-[character]-[timeOfDay]-[n]` pattern
- **Seasonal updates:** Consider rotating quotes by season if user feedback suggests stagnation
- **Author updates:** If an author's background reveals ethical issues post-publication, remove and replace their quotes

