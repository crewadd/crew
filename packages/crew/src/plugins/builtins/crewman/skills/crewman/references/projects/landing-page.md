# Landing Page / Marketing Site

Reference template for building marketing websites, product landing pages, and content-driven sites with sections, animations, forms, and SEO optimization.

## Typical Tech Stack

| Layer | Common Choices |
|-------|---------------|
| Framework | Next.js (App Router), Astro, Nuxt |
| CMS | Contentlayer, Sanity, Keystatic, MDX |
| Styling | Tailwind CSS, Framer Motion, GSAP |
| Forms | React Hook Form, Formspree, ConvertKit |
| Analytics | Vercel Analytics, Plausible, PostHog |
| Email | Resend, ConvertKit, Mailchimp |
| UI | shadcn/ui, Radix, Headless UI |
| Hosting | Vercel, Netlify, Cloudflare Pages |

## Standard Epic Progression

```
1. Setup & Config        — Project init, fonts, colors, layout shell
2. Hero & Navigation     — Hero section, navbar, mobile menu
3. Content Sections      — Features, testimonials, pricing, FAQ, stats
4. Interactive Elements  — Animations, scroll effects, modals
5. Forms & CTA           — Contact form, newsletter signup, waitlist
6. Legal & Footer        — Privacy policy, terms, footer, sitemap
7. SEO & Performance     — Meta tags, OG images, structured data, Core Web Vitals
8. Analytics & Launch    — Tracking setup, A/B test prep, deployment
```

## Epic Patterns

### Hero & Navigation

```typescript
const hero = ctx.createEpic('hero', 'Hero & Navigation');

hero.addTask(ctx.createTask('hero:navbar', 'Navigation Bar')
  .type('coding')
  .outputs(['src/components/navbar.tsx', 'src/components/mobile-menu.tsx'])
  .promptFrom('./prompts/landing-navbar.md')
  .check('build'));

hero.addTask(ctx.createTask('hero:section', 'Hero Section')
  .type('coding')
  .deps(['hero:navbar'])
  .outputs(['src/components/hero.tsx'])
  .promptFrom('./prompts/landing-hero.md')
  .check('build'));

hero.addTask(ctx.createTask('hero:cta', 'Primary CTA')
  .type('coding')
  .deps(['hero:section'])
  .outputs(['src/components/cta-button.tsx'])
  .promptFrom('./prompts/landing-cta.md')
  .check('build'));
```

### Content Sections (Factory)

```typescript
export function createSectionEpics(ctx: CrewContext, sections: SectionDef[]) {
  const epic = ctx.createEpic('sections', 'Content Sections');

  for (const section of sections) {
    epic.addTask(ctx.createTask(`section:${section.id}`, `${section.label} Section`)
      .type('coding')
      .deps(['hero:navbar'])
      .outputs([`src/components/sections/${section.id}.tsx`])
      .promptFrom('./prompts/landing-section.md', { section })
      .check('build'));
  }

  return epic;
}

// Common sections
const sections = [
  { id: 'features', label: 'Features', layout: 'grid' },
  { id: 'testimonials', label: 'Testimonials', layout: 'carousel' },
  { id: 'pricing', label: 'Pricing', layout: 'cards' },
  { id: 'faq', label: 'FAQ', layout: 'accordion' },
  { id: 'stats', label: 'Stats / Social Proof', layout: 'counters' },
  { id: 'how-it-works', label: 'How It Works', layout: 'steps' },
];
```

### Forms & CTA

```typescript
const forms = ctx.createEpic('forms', 'Forms & CTA');

forms.addTask(ctx.createTask('forms:contact', 'Contact Form')
  .type('coding')
  .outputs(['src/components/contact-form.tsx', 'src/app/api/contact/route.ts'])
  .promptFrom('./prompts/landing-contact.md')
  .check('build'));

forms.addTask(ctx.createTask('forms:newsletter', 'Newsletter Signup')
  .type('coding')
  .outputs(['src/components/newsletter.tsx'])
  .promptFrom('./prompts/landing-newsletter.md')
  .check('build'));

forms.addTask(ctx.createTask('forms:waitlist', 'Waitlist / Early Access')
  .type('coding')
  .outputs(['src/components/waitlist.tsx', 'src/app/api/waitlist/route.ts'])
  .promptFrom('./prompts/landing-waitlist.md')
  .check('build'));
```

### Animations

```typescript
const animations = ctx.createEpic('animations', 'Interactive Elements');

animations.addTask(ctx.createTask('anim:scroll', 'Scroll Animations')
  .type('coding')
  .outputs(['src/lib/animations.ts', 'src/hooks/use-scroll-reveal.ts'])
  .promptFrom('./prompts/landing-scroll-anim.md')
  .check('tsc'));

animations.addTask(ctx.createTask('anim:transitions', 'Page Transitions')
  .type('coding')
  .deps(['anim:scroll'])
  .outputs(['src/components/transition-wrapper.tsx'])
  .promptFrom('./prompts/landing-transitions.md')
  .check('build'));

animations.addTask(ctx.createTask('anim:counters', 'Animated Counters')
  .type('coding')
  .deps(['anim:scroll'])
  .outputs(['src/components/animated-counter.tsx'])
  .promptFrom('./prompts/landing-counters.md')
  .check('build'));
```

### SEO & Performance

```typescript
const seo = ctx.createEpic('seo', 'SEO & Performance');

seo.addTask(ctx.createTask('seo:meta', 'Meta Tags & OG')
  .type('coding')
  .outputs(['src/app/layout.tsx', 'src/lib/metadata.ts'])
  .promptFrom('./prompts/landing-meta.md')
  .check('build'));

seo.addTask(ctx.createTask('seo:structured', 'Structured Data')
  .type('coding')
  .deps(['seo:meta'])
  .outputs(['src/components/json-ld.tsx'])
  .promptFrom('./prompts/landing-structured-data.md')
  .check('build'));

seo.addTask(ctx.createTask('seo:sitemap', 'Sitemap & Robots')
  .type('coding')
  .outputs(['src/app/sitemap.ts', 'src/app/robots.ts'])
  .promptFrom('./prompts/landing-sitemap.md')
  .check('build'));

seo.addTask(ctx.createTask('seo:perf', 'Performance Optimization')
  .type('coding')
  .outputs(['next.config.ts'])
  .promptFrom('./prompts/landing-perf.md')
  .check('build'));
```

## Dependency Graph

```
hero:navbar ──→ hero:section ──→ hero:cta
     │
     ├→ section:features
     ├→ section:testimonials    (all sections parallel)
     ├→ section:pricing
     ├→ section:faq
     └→ section:stats

forms:contact
forms:newsletter            (forms parallel)
forms:waitlist

anim:scroll ──→ anim:transitions
       │
       └→ anim:counters

seo:meta ──→ seo:structured
seo:sitemap
seo:perf
```

## Plan Variables

```typescript
plan.vars({
  framework: 'nextjs',            // 'nextjs' | 'astro' | 'nuxt'
  styling: 'tailwind',
  animations: 'framer-motion',    // 'framer-motion' | 'gsap' | 'css-only'
  cms: 'none',                    // 'none' | 'sanity' | 'contentlayer' | 'mdx'
  formProvider: 'api-route',      // 'api-route' | 'formspree' | 'convertkit'
  sections: ['hero', 'features', 'pricing', 'testimonials', 'faq', 'cta'],
  hasNewsletter: true,
  hasBlog: false,
  analytics: 'vercel',            // 'vercel' | 'plausible' | 'posthog'
});
```

## PRD Mapping Hints

| PRD Section | Maps To |
|-------------|---------|
| Hero / above-the-fold | `hero` epic |
| Features / benefits | `section:features` task |
| Pricing / plans | `section:pricing` task |
| Testimonials / social proof | `section:testimonials` task |
| FAQ | `section:faq` task |
| Contact / support | `forms:contact` task |
| Newsletter / mailing list | `forms:newsletter` task |
| Waitlist / early access | `forms:waitlist` task |
| Blog / content | Dedicated `blog` epic |
| SEO requirements | `seo` epic |
| Animations / interactions | `animations` epic |

## Checks Strategy

- `build` on all sections and pages
- Lighthouse CI for Core Web Vitals (LCP < 2.5s, CLS < 0.1)
- Meta tag validation (OG preview check)
- Mobile responsiveness (viewport tests)
- Accessibility audit (axe-core)
- Form submission E2E test
