# EveryonePR DESIGN.md

Design system document for `everyonepr.com`.
This file exists to help coding and design agents produce consistent, high-quality UI across the public site, guides, insights, member flows, and future landing experiments.

This is the visual authority for new UI work unless the user explicitly asks to preserve a page's current appearance exactly.

## 1. Visual Theme & Atmosphere

EveryonePR should feel like a trustworthy Korean PR platform for small teams and operators, not a flashy startup toy and not a generic enterprise dashboard.

The visual identity is:

- trust-first
- clean and legible
- soft-blue and white
- structured, not sterile
- confident, not loud
- helpful, not playful-chaotic

The product helps users make high-stakes decisions about press release writing, review, and distribution. The design must therefore communicate:

- clarity before decoration
- authority before novelty
- actionability before entertainment

### Core mood

- White and pale-blue surfaces
- Deep navy text
- One strong brand blue for action
- Light atmospheric gradients, never heavy neon
- Cards that feel precise and calm
- Rounded but controlled geometry

### Design personality

- More Airtable/Coinbase trust than Dribbble-style spectacle
- More Korean service readability than Western landing-page drama
- More editorial clarity than dashboard density

### Product-specific interpretation

EveryonePR is not a media magazine and not a dark AI product.
It is a guided conversion platform around:

- self-serve PR
- draft review
- media selection
- order confidence

The design should always support those flows.

## 2. Color Palette & Roles

Use a restrained blue system. Avoid introducing extra bright brand colors unless the user explicitly requests a campaign look.

### Primary palette

| Token | Hex | Role |
|------|------|------|
| Brand Blue | `#0038B8` | Primary CTA, active states, strongest brand moments |
| Brand Blue Hover | `#0A4ACC` | Hover/secondary active blue |
| Brand Deep | `#002878` | Deep emphasis, strong contrast sections, pressed states |
| Accent Sky | `#0890F8` | Small highlights, soft glow, secondary emphasis |
| Ink Navy | `#111A2E` | Primary headline/body anchor |
| Ink Blue Gray | `#12203A` | Alternate deep text for content-heavy pages |
| Body Subtext | `#5F6B84` | Secondary text |
| Body Subtext Alt | `#61718D` | Muted descriptive text |
| Background Base | `#EFF4FC` | Page background |
| Background Soft | `#F8FBFF` | Elevated light backdrop |
| Surface White | `#FFFFFF` | Primary cards and panels |
| Surface Blue Soft | `#F4F8FF` | Soft card tint, info panels |
| Surface Blue Alt | `#EAF2FF` | Badge fill, light emphasis |
| Border Soft | `#D7E0F0` | Default border |
| Border Strong | `#BFD0EB` | Stronger active/section border |
| Success | `#0F9D58` | Positive state only |
| Danger | `#C5221F` | Error/critical state only |

### Color rules

- Blue is the only primary accent family.
- Do not add purple as a default accent.
- Do not introduce black-heavy or dark-mode-first styling unless explicitly asked.
- Gradients should stay low-contrast and airy.
- Decorative blue should never compete with CTA blue.

### Usage guidance

- Headlines: `#111A2E` or `#12203A`
- Body: `#5F6B84`
- Primary buttons: `#0038B8`
- Secondary buttons: white or pale blue with blue border/text
- Card borders: `#D7E0F0`
- Soft fills: `#F4F8FF` or `#EAF2FF`

## 3. Typography Rules

EveryonePR is Korean-first. Typography must prioritize Korean readability over trendy compression.

### Font families

- Primary Korean UI: `"Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", sans-serif`
- Accent / display support: `"Montserrat", "Noto Sans KR", sans-serif`

### Typography character

- Korean text should feel stable, readable, and calm
- English display moments can use Montserrat, but never at the expense of Korean rhythm
- Tight tracking is acceptable for English display, but do not aggressively compress Korean headlines

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing |
|------|------|------|--------|-------------|----------------|
| Hero Display | Montserrat + Noto Sans KR | `48px-56px` desktop | 700 | `1.12-1.18` | `-0.02em` max |
| Section H1 | Montserrat + Noto Sans KR | `36px-44px` | 700 | `1.18-1.24` | `-0.02em` |
| Section H2 | Montserrat + Noto Sans KR | `28px-34px` | 700 | `1.22-1.28` | `-0.015em` |
| Card Title | Noto Sans KR | `20px-24px` | 700 | `1.3-1.4` | normal |
| Emphasis Label | Noto Sans KR | `14px-16px` | 700 | `1.35` | normal |
| Body Large | Noto Sans KR | `18px` | 400-500 | `1.65-1.72` | normal |
| Body | Noto Sans KR | `16px` | 400-500 | `1.65-1.72` | normal |
| Secondary Body | Noto Sans KR | `14px-15px` | 400-500 | `1.6-1.7` | normal |
| Button | Noto Sans KR | `14px-16px` | 700 | `1.2-1.3` | normal |
| Micro Label | Montserrat or Noto Sans KR | `11px-12px` | 700 | `1.2` | `0.04em-0.08em` |

### Typography guardrails

- Never crush Korean headlines with extreme negative tracking.
- Never use ultra-light weights for core business copy.
- Avoid oversized all-caps styles for Korean UI.
- Body copy should remain readable at first glance on desktop and mobile.

## 4. Component Stylings

### 4.1 Header / Navigation

- Sticky, lightly translucent white background
- Thin cool-blue border
- Soft blur allowed
- Nav links should feel precise and calm, not bubbly or cartoonish
- Auth buttons may use soft pills, but functional content cards should not all become pill-shaped

### 4.2 Buttons

#### Primary CTA

- Background: `#0038B8`
- Text: white
- Radius: `12px-14px`
- Shadow: blue-tinted but restrained
- Hover: slightly darker or richer blue, tiny lift

#### Secondary CTA

- Background: white or `#F4F8FF`
- Text: `#0038B8` or deep navy
- Border: `1px solid #D7E0F0`
- Radius: `12px-14px`

#### Text/ghost actions

- Use sparingly
- Must still read as intentional, not invisible

### 4.3 Cards

Cards are the main structural language of EveryonePR.
They should feel:

- calm
- clean
- lightly elevated
- slightly blue-tinted

#### Card system

- Background: white or very pale blue
- Border: `#D7E0F0`
- Radius:
  - standard card: `18px-20px`
  - small card/panel: `12px-14px`
  - large section shell: `24px-28px`
- Shadows:
  - subtle blue-gray multi-layer shadows
  - never muddy black shadows
  - never glassmorphism-heavy blur unless explicitly requested

### 4.4 Hero

The hero must convert, not entertain.

#### Hero rules

- Strong information hierarchy: headline first, CTA second, support card third
- Background may use soft atmospheric gradients
- Decorative elements must never beat the headline in visual priority
- Hero should feel like a product entry point, not an ad creative

#### Hero composition guidance

- One dominant copy area
- One supporting visual or info panel
- Strong CTA cluster
- Clear whitespace around headline

### 4.5 Mascot / Character Usage

The mascot is supportive branding, not the hero content.

#### Allowed usage

- Top-center accent above a card or section shell
- Small corner support in onboarding, guide, or empty states
- Friendly reinforcement near low-risk surfaces

#### Not allowed by default

- Large mascot blocking title or CTA
- Mascot as the most visually dominant object in a conversion hero
- Mascot used with heavy glow, sticker outline, or loud 3D framing
- Mascot inside dense content cards where it competes with reading flow

#### Mascot priority rule

Headline > CTA > trust structure > mascot

### 4.6 Forms / Modals

- White or very pale-blue surfaces
- Strong input borders, clear focus rings
- Functional spacing over decorative density
- Modal layout should feel operational and trustworthy, not trendy

### 4.7 Guide / Insight / Pricing Blocks

- Use repeated card rhythm
- Keep labels, titles, and summary copy visually consistent
- CTA should be obvious but not oversized
- Avoid over-designed background treatments in knowledge sections

## 5. Layout Principles

EveryonePR should feel structured and breathable.

### Spacing scale

Use an 8px-based system with support values:

- `4`
- `8`
- `12`
- `16`
- `20`
- `24`
- `32`
- `40`
- `48`
- `56`
- `64`
- `80`
- `96`

### Containers

- Public pages: `1140px-1160px` max-width
- Use generous left/right breathing room
- Prefer stable two-column hero layouts on desktop
- Collapse to one-column clearly and early on mobile

### Whitespace philosophy

- Dense information belongs inside clearly separated cards
- Leave breathing room around headings and CTA groups
- Do not compress multiple competing surfaces into one viewport

## 6. Depth & Elevation

Depth should come from:

- surface contrast
- border clarity
- subtle blue-tinted shadows

Not from:

- extreme blur
- oversized glow
- dark dramatic overlays

### Shadow system

| Level | Use | Example character |
|------|------|-------------------|
| Low | small cards, chips | `0 6px 20px rgba(16,35,72,0.07)` |
| Mid | section cards, panels | `0 14px 36px rgba(16,35,72,0.12)` |
| High | key hero shells only | `0 24px 54px rgba(10,31,95,0.20)` |

### Elevation rules

- Use high elevation only once per hero/section cluster
- Nested cards should reduce shadow, not increase it
- If a section shell is strong, internal cards must become quieter

## 7. Do's and Don'ts

### Do

- Do use blue as the main trust/action signal
- Do keep Korean readability high
- Do use white and pale-blue surfaces generously
- Do make CTA states obvious
- Do let layout hierarchy drive the design
- Do keep cards consistent across landing, guides, pricing, and insight pages
- Do use the mascot carefully and sparingly

### Don't

- Don't add purple by default
- Don't push the product into dark-mode aesthetics without explicit request
- Don't create decorative gradients that overpower the content
- Don't make every component pill-shaped
- Don't stack multiple loud effects in one hero
- Don't let decorative assets outrank the headline or CTA
- Don't use generic startup-purple-on-white styling
- Don't produce interchangeable SaaS UI with no brand character

## 8. Responsive Behavior

### Breakpoints

- `1280px+` wide desktop
- `992px-1279px` desktop / compact desktop
- `768px-991px` tablet
- `480px-767px` mobile
- `<480px` small mobile

### Responsive rules

- Hero should switch to one column before the layout feels squeezed
- CTA buttons should stack cleanly on mobile
- Cards must keep readable padding on small screens
- Headline must remain the first readable element in first viewport
- Mascot or decorative art must shrink before headline and CTA do
- Avoid horizontal clipping of decorative assets on mobile

## 9. Agent Prompt Guide

### Quick summary

Build EveryonePR like a Korean trust-first SaaS for self-serve PR and press release distribution.
Use soft blue and white surfaces, deep navy text, structured cards, restrained gradients, and clear conversion hierarchy.
Favor readability and confidence over visual spectacle.

### Quick color reference

- Primary CTA: `#0038B8`
- Hover blue: `#0A4ACC`
- Accent sky: `#0890F8`
- Main text: `#111A2E`
- Secondary text: `#5F6B84`
- Page background: `#EFF4FC`
- Soft surface: `#F4F8FF`
- Border: `#D7E0F0`

### Example prompts

- "Create a trust-first marketing section for EveryonePR. Use white and pale-blue cards, deep navy text, restrained blue shadows, and clear Korean readability."
- "Design a hero for a Korean PR platform. Headline and CTA must dominate. Decorative character is secondary and cannot overpower the content."
- "Build guide cards for EveryonePR using calm blue-white surfaces, consistent 18px-20px card radius, subtle borders, and concise hierarchy."
- "Create a pricing or insight block that feels operational and credible, not playful or experimental."

### Final quality bar

If a result feels:

- too playful
- too dark
- too generic
- too decorative
- too purple
- or harder to read than the current production site

then it is off-brand for EveryonePR.
