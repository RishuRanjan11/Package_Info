# Package Intelligence

A standalone hyperDart component that turns an npm package query into a decision brief. It covers the latest package release, comparisons for two or three packages, alternatives to a package, and discovery for a development use case.

## What it does

- Looks up npm package versions, descriptions, release dates, deprecation notices, licenses, repository links, Node.js engine requirements, ESM declarations, TypeScript declarations, and unpacked package size.
- Compares up to three packages in a factual table and plots daily downloads from the last month alongside weekly download totals.
- Finds alternatives using npm's package search relevance and shows each candidate's shared npm keywords and weekly downloads.
- Searches npm for use-case queries such as "date formatting", explains literal query-term matches in package metadata, and preserves npm's relevance order.
- Supports version comparisons such as `express 4 vs 5` (resolving each major to its latest stable release), explicit package versions such as `express@4.21.2`, follow-up actions to explore alternatives, and adding a package to an existing comparison.
- Adds a concise package signal fingerprint, metadata-only version difference highlights, and daily-download momentum annotations.
- Adapts to HyperDart sidebar and mainline layouts and supports light and dark themes.

## Design decisions

The interface is an editorial-style "decision desk," not a copy of a package registry page. A concise summary leads, while a package fingerprint, version-difference highlights, annotated download trends, and package metadata help visitors explore the evidence. Download counts and package footprint are labeled as signals rather than quality judgments; alternative ranking follows npm's own search relevance rather than an invented score. Use-case explanations only identify literal matches in npm descriptions and keywords; they do not claim the package is a verified fit.

HyperDart's global search is the query entry point: when a query matches this component, HyperDart passes the original query, parsed npm entities, and structured `queryProps`; the component renders its brief from that payload. The local sandbox's own global search bar is used to exercise this flow—there is no second search bar inside the component. Registry requests are made from the browser to public npm APIs, with partial failures reported instead of hiding missing data.

## Data sources

- Package version metadata: [npm registry API](https://registry.npmjs.org/)
- Published version dates: npm registry packument `time` data
- Package discovery and npm relevance ranking: [npm search API](https://registry.npmjs.org/-/v1/search)
- Weekly and daily download counts: [npm downloads API](https://api.npmjs.org/)

The component only states compatibility and module support when the package metadata declares it. Package footprint is the registry's unpacked size, not a compressed download or an installed dependency-tree estimate.

## Libraries and platform

- React and the HyperDart `withHD` integration
- Vite and the official HyperDart sandbox/build template
- Browser `fetch` and CSS for npm API access, comparison trends, and responsive styling

No additional runtime dependency was added.

## Local development

```sh
npm install
npm run start
```

The local HyperDart sandbox runs through the Vite development server and starts with a blank bootstrap record, so it can show the component's welcome state without preselecting a package or displaying the empty-query warning. Use its global search bar to try `compare packages express, fastify`, `compare express, fastify, koa`, `compare packages express@4.21.2 and express@5.1.0`, `npm express`, `alternatives to moment`, `library for parsing CSV`, or `npm package-that-does-not-exist-xyz` to verify the not-found state. The sandbox uses `resource.json` to generate query-specific test data; the component uses live host props at runtime. Unrelated greetings do not match the component's global triggers and therefore do not launch it.

Create a production bundle with:

```sh
npm run build
```

Run the package API and intent-handling tests with:

```sh
npm test
```

Before publishing, create the package in the HyperDart Partner Portal, configure the registry token, and add the YouTube demo URL to `hyperdart.config.js`. The GitHub URL is prefilled from the repository's configured public origin. `npm publish` runs the repository's pre-publish validation and requires both links.

## AI assistance

This project was implemented with AI assistance using Copilot SDK in VS Code. The implementation was tailored to this problem statement and the HyperDart template; no package-directory UI was copied. The source, API handling, configuration, sample data, and this documentation were created or adapted specifically for this component.
