---
title: bevmaq.com, the public site
description: What the public site exposes to machines and agents: listing pages, structured data, llms.txt, sitemap, quote forms
tags: [platform, site, seo]
---

# bevmaq.com, the public site

Observed 2026-09-06. The marketplace front end for buyers; the listings come from the
product API.

## Listing pages

`https://www.bevmaq.com/buy/<slug>/` where the slug ends in the SKU, e.g.
`gai-mle-661_HR-FIL-GAI-2016-00001`. Each page carries the full product record in
`__NEXT_DATA__` (`props.pageProps.productData`, plus `relatedProducts` and the
`accountManager` shown on the page) and a schema.org `Product` and `Offer` JSON-LD block
(price, currency, `valueAddedTaxIncluded: false`, `itemCondition: UsedCondition`,
eligible regions, images). Every listing page has the official quote request form, a
WhatsApp link, and the account manager's phone and email.

## Catalogue browsing

`/buy/` lists twelve machines per page with filters for category, price range, country,
manufacturer and year, and a sort control. Category pages live at
`/buy/category/<slug>/`. There is no free-text search on the site; capacity, container
and closure are not filterable there (the buyer agent adds that).

## Machine-readable surfaces

- `/llms.txt` (about 70 KB): the site summary with links per section and per listing.
- `/llms-full.txt` (about 200 KB): a structured card per available listing (title, SKU,
  category and type, manufacturer and model, country, year, price) with the generation
  time and locale in the header. A cheap way to learn what is listed without the API.
- `/sitemap.xml`: every listing URL ever published (1,040 on 2026-09-06), the 16 category
  pages, and the info pages (company, team, jobs, press, faq, contact, services, imprint,
  privacy, terms-and-conditions, now-with-bevmaq), with hreflang alternates for the
  country domains (.de, .fr, .es, .pl, .it, .cz, .co.uk, .at, .ae).
- `robots.txt` allows everything except `/migration/` and explicitly allows the AI
  search and training crawlers (OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot,
  GPTBot, Google-Extended, Applebot-Extended, CCBot).

## Related domains

- `product.bevmaq.com`: the product API (see the product API document).
- `bmi.bevmaq.com`: BMi, BEVMAQ Intelligence; the roadmap page at `/de/bmintelligence/`
  is blocked for crawlers by robots.txt.
- `mother.bevmaq.com`: the internal wiki.
