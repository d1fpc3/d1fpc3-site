# Echelon Landing Page Redesign

## Purpose

Redesign the root page of `d1fpc3.com` to sell Echelon to warm visitors arriving from D1's Instagram and free Discord. The page should convert existing familiarity into a confident $200 purchase without behaving like a generic course funnel.

The page has one primary job: sell Echelon. Personal projects and unrelated products remain off the root landing page.

## Positioning

Echelon is a written operating standard for trading NQ: defined preparation, selective execution, controlled risk, and consistent review. It is not signals, an introduction to futures, or a promise of trading results.

The page should communicate three ideas in this order:

1. Echelon turns D1's trading approach into a repeatable standard.
2. The purchase includes a real members product, ongoing recaps, and a private Discord—not merely a PDF.
3. Access costs $200 once, includes future updates, and does not require a subscription.

## Visual Direction: The Dossier

The page should resemble a precise institutional NQ operating document rather than a luxury template or high-energy trading advertisement.

### Palette

- Night Watch `#081018`: page background
- Gunmetal `#14202A`: raised surfaces and product frames
- Frost `#F2F5F6`: primary text
- Steel `#94A3AD`: secondary text and supporting labels
- Brass `#B98B46`: primary actions and meaningful status markers only
- Signal Red `#C75B4A`: risk and stop-state details only

Avoid gradients as general decoration. A subtle directional glow may be used behind the hero product surface if it improves depth. Avoid generic black-and-gold luxury styling, glassmorphism, excessive rounded cards, candlestick wallpaper, and fabricated market dashboards.

### Typography

- Display: a condensed industrial sans for the hero thesis and major section statements
- Body: a neutral but warm sans optimized for long-form readability
- Utility: a monospaced face for market labels, price details, session times, and status information

The display face should appear in short, deliberate bursts. Body copy remains mixed case. Uppercase utility text is reserved for true labels.

### Signature Element

The signature visual is the **NQ session spine**: a precise horizontal timeline representing the behavioral sequence of preparing, waiting, executing, and stopping. It should appear in or immediately beneath the hero and return subtly at the final purchase section.

The spine communicates that Echelon governs an entire session, not a single setup. It must not reveal paid entry rules, levels, or exact trading windows.

## Page Structure

### 1. Navigation

- Echelon wordmark at left
- Links to `The standard`, `Inside`, and `Access`
- `Members sign in` as the quiet secondary action
- Compact mobile navigation without a complex menu

### 2. Hero

Use a wide two-column composition on desktop and a single-column composition on mobile.

Left side:

- Eyebrow establishing the product as an NQ trading standard
- Thesis: **Trade NQ with a written standard.**
- Short explanation connecting the product to D1's actual method
- Primary CTA: `Get Echelon — $200`
- Secondary link: `See what's inside`
- Purchase facts: one payment, lifetime access, updates included

Right side:

- A designed Echelon operating brief, not a generic browser mockup
- Fields such as market, objective, access, updates, and community
- A small view into the members experience without disclosing paid content

The session spine closes the hero and creates the transition into the page body.

### 3. The Standard

Explain the operating sequence in its real order:

- Prepare: enter the session with conditions and risk already defined
- Wait: trade only approved windows and conditions
- Execute: use named setups with explicit invalidation
- Stop: respect daily limits and stand-down rules

Because this is a real sequence, the structure may use connected stages. Copy should focus on the behavior the buyer gains, not vague course benefits.

### 4. Inside Echelon

Show that Echelon is a functioning members product. Present a credible preview based on the existing members area:

- Structured lesson pages
- Course progress
- Published trade recaps
- Private Discord access
- Ongoing updates

Use a large product surface with restrained annotations. If an authentic logged-in screenshot cannot be produced without exposing private material, construct the preview from the existing interface language and use clearly non-sensitive placeholder lesson titles.

### 5. Free Discord Versus Echelon

Warm visitors need a direct explanation of what the purchase adds.

- Free Discord: community discussion and general access to D1
- Echelon: the complete written standard, organized lessons, paid recaps, progress tracking, and the private member room

This comparison should be concise and respectful. It must not diminish the free community.

### 6. Credibility

Use only verifiable trust signals:

- Live Discord member count when the public Discord API succeeds
- D1's TradingView profile
- Actual product capabilities visible in the repository
- Real testimonials or member quotes only if supplied or already stored in an approved public source

Do not invent testimonials, performance statistics, win rates, profits, or urgency.

### 7. Access

Make the offer explicit:

- `$200`
- Paid once
- Lifetime course access
- Future course updates included
- Private member access
- D1 Engine remains separate and is not required

Use one strong CTA label consistently: `Get Echelon — $200`. Members receive a separate sign-in link.

### 8. FAQ and Disclosure

Keep the FAQ focused on buying objections:

- Exact contents
- Required experience
- Signals versus education
- D1 Engine requirement
- Access after purchase
- Refund policy

Retain the futures-risk and educational-product disclosure. The disclosure should remain readable without visually competing with the purchase decision.

## Interaction and Motion

- One coordinated page-load moment: the hero type, operating brief, and session spine settle into place in sequence
- Subtle spine progress or marker movement as the hero enters view
- Small hover and focus responses on controls
- No continuous chart animation, parallax, or scattered scroll effects
- Respect `prefers-reduced-motion`

## Technical Approach

Keep the site static and dependency-free. Replace the root `index.html` with semantic HTML, scoped CSS, and minimal vanilla JavaScript. The existing deployment model, canonical URL, SeenRank pixel, schema metadata, Discord integration, and members sign-in route remain intact.

The page should be composed from clearly bounded sections and reusable classes rather than a collection of one-off inline styles. The old root `styles.css` belongs to a retired personal-profile design and should not influence the new page; it may remain untouched unless repository cleanup is separately approved.

## Data and Failure Behavior

- Discord member count loads progressively and falls back to non-numeric community copy when the API is unavailable.
- A configured checkout URL navigates directly to checkout.
- If checkout is not configured, the CTA must not pretend a purchase can complete. It should be visibly disabled and explain that checkout is not connected.
- Members sign-in always remains available.
- The page remains complete and readable with JavaScript disabled, except for dynamic member count and checkout behavior.

## Responsive and Accessibility Requirements

- Support desktop, tablet, and small mobile screens without horizontal overflow
- Collapse the hero and comparisons into a logical reading order on mobile
- Maintain visible keyboard focus
- Use semantic headings, navigation, links, buttons, and disclosure controls
- Meet WCAG AA text contrast
- Preserve at least 44px touch targets for primary interactive controls
- Avoid conveying plan stages or risk states through color alone

## Verification

- Validate HTML structure and internal anchors
- Test checkout configured and unconfigured states
- Test Discord API success and failure states
- Check desktop and mobile layouts visually
- Verify keyboard navigation and focus visibility
- Verify reduced-motion behavior
- Confirm no console errors
- Confirm the SeenRank pixel, canonical metadata, product schema, Discord invite, TradingView link, and `/echelon/app/` sign-in route remain present

## Out of Scope

- Changing Echelon's $200 price or refund policy
- Redesigning the members or admin applications
- Publishing paid course details on the landing page
- Adding fabricated testimonials or performance claims
- Connecting Stripe if a production checkout URL has not been supplied
- Redesigning unrelated subdirectories on `d1fpc3.com`
