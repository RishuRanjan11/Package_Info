import assert from "node:assert/strict";
import test from "node:test";
import hyperdartConfig from "../../hyperdart.config.js";
import {
  addPackageReference,
  fetchJson,
  fetchPackage,
  fetchPackages,
  getDownloadInsights,
  getEntityNames,
  getInitialQuery,
  getQueryMatches,
  getVersionDifferences,
  inferPackageReferences,
  interpretQuery,
  resolveHyperDartRequest,
  searchPackages,
} from "./package-utils.js";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? "Not Found" : "Error",
    json: async () => body,
  };
}

function packageApiFetch({
  metadata = {},
  latest = metadata,
  weekly = { downloads: 42 },
  history = { downloads: [{ day: "2025-01-01", downloads: 6 }] },
  search = { objects: [] },
} = {}) {
  return async (url) => {
    if (url.includes("/downloads/point/")) return response(weekly);
    if (url.includes("/downloads/range/")) return response(history);
    if (url.includes("/-/v1/search")) return response(search);
    if (url.endsWith("/latest")) return response(latest);
    return response(metadata);
  };
}

test("interprets the supported package query examples", () => {
  const cases = [
    ["npm express", "details", ["express"]],
    ["express", "details", ["express"]],
    ["latest version of react", "details", ["react"]],
    ["compare express vs fastify", "compare", ["express", "fastify"]],
    ["compare packages express, fastify", "compare", ["express", "fastify"]],
    ["compare express, fastify, koa", "compare", ["express", "fastify", "koa"]],
    ["compare express 4 vs 5", "compare", ["express@4", "express@5"]],
    ["compare express@4.21.2 and express@5.1.0", "compare", ["express@4.21.2", "express@5.1.0"]],
    ["npm compare express@4.21.2 and express@5.1.0", "compare", ["express@4.21.2", "express@5.1.0"]],
    ["alternatives to moment", "alternatives", ["moment"]],
    ["packages like request", "alternatives", ["request"]],
    ["best npm package for date formatting", "discover", []],
    ["library for parsing CSV", "discover", []],
    ["npm cache", "details", ["cache"]],
    ["@scope/pkg", "details", ["@scope/pkg"]],
    ["hello", "unsupported", []],
    ["Hi how are you", "unsupported", []],
    ["npm package-that-does-not-exist-xyz", "details", ["package-that-does-not-exist-xyz"]],
  ];
  for (const [query, intent, packageRefs] of cases) {
    assert.deepEqual(interpretQuery(query), {
      intent,
      packageRefs,
      discoveryTerm: intent === "discover"
        ? query.startsWith("best") ? "date formatting" : "parsing CSV"
        : "",
    }, query);
  }
  assert.equal(interpretQuery("  ").intent, "empty");
  assert.deepEqual(inferPackageReferences("npm version"), ["version"]);
  assert.deepEqual(inferPackageReferences("npm cache"), ["cache"]);
});

test("preserves scoped, versioned, duplicate, and capped package references", () => {
  assert.deepEqual(inferPackageReferences("@scope/pkg"), ["@scope/pkg"]);
  assert.deepEqual(inferPackageReferences("compare @scope/pkg@4.2.1 and express@5"), [
    "@scope/pkg@4.2.1",
    "express@5",
  ]);
  assert.deepEqual(inferPackageReferences("compare express, express, fastify, koa, hapi"), [
    "express",
    "fastify",
    "koa",
  ]);
  assert.deepEqual(inferPackageReferences("npm version"), ["version"]);
  assert.deepEqual(inferPackageReferences("npm it"), ["it"]);
});

test("configured HyperDart patterns cover supported query and entity-token forms", () => {
  const normalizedPatterns = hyperdartConfig.query_format.regex.map((pattern) => (
    pattern.replaceAll("HD_PACKAGES.NPM_PACKAGES", "HD_PACKAGES__NPM_PACKAGES")
  ));
  const supportedQueries = [
    "npm express",
    "compare packages express, fastify",
    "compare express, fastify, koa",
    "npm compare express@4.21.2 and express@5.1.0",
    "compare packages express@4.21.2 and express@5.1.0",
    "alternatives to HD_PACKAGES__NPM_PACKAGES",
    "latest version of HD_PACKAGES__NPM_PACKAGES",
    "best npm package for date formatting",
    "library for parsing CSV",
    "npm package-that-does-not-exist-xyz",
  ];
  for (const query of supportedQueries) {
    assert.ok(normalizedPatterns.some((pattern) => new RegExp(pattern, "i").test(query)), query);
  }
  assert.ok(!hyperdartConfig.triggers.keywords.some((keyword) => (
    "Hi how are you".toLowerCase().includes(keyword.toLowerCase())
  )));
  assert.ok(!hyperdartConfig.query_format.regex.some((pattern) => (
    new RegExp(pattern.replaceAll("HD_PACKAGES.NPM_PACKAGES", "HD_PACKAGES__NPM_PACKAGES"), "i")
      .test("Hi how are you")
  )), "unrelated greetings should not activate the component");
});

test("does not treat greetings, unsupported input, or stale sandbox entities as package searches", () => {
  assert.equal(interpretQuery("hello").intent, "unsupported");
  assert.equal(interpretQuery("   ").intent, "empty");
  assert.deepEqual(
    interpretQuery("npm cache").packageRefs,
    ["cache"],
    "valid package names that resemble instruction words remain package lookups",
  );
  assert.deepEqual(
    interpretQuery("unrelated query", {
      query: "compare express vs fastify",
      entities: [
        { collectionType: "HD_PACKAGES", word: "express" },
        { collectionType: "HD_PACKAGES", word: "fastify" },
      ],
    }),
    { intent: "unsupported", packageRefs: [], discoveryTerm: "" },
  );
});

test("reads the documented HyperDart searchData and queryProps payloads", () => {
  const searchData = [{
    query: "compare packages express, fastify",
    queryObject: {
      type: "query",
      filters: { intent: "compare", packages: ["express", "fastify"] },
      features: ["metadata"],
    },
    entities: [
      { collectionName: "NPM_PACKAGES", word: "express", sourceID: "registry:express" },
      { collectionName: "NPM_PACKAGES", word: "fastify", sourceID: "fastify" },
    ],
  }];
  assert.equal(getInitialQuery({ searchData }), "compare packages express, fastify");
  assert.deepEqual(getEntityNames(searchData), ["express", "fastify"]);
  assert.deepEqual(
    interpretQuery(getInitialQuery({ searchData }), searchData),
    { intent: "compare", packageRefs: ["express", "fastify"], discoveryTerm: "" },
  );
  assert.deepEqual(resolveHyperDartRequest({ searchData }), {
    query: "compare packages express, fastify",
    entityNames: ["express", "fastify"],
    interpretation: { intent: "compare", packageRefs: ["express", "fastify"], discoveryTerm: "" },
  });
  assert.equal(getInitialQuery({
    queryProps: {
      queryObject: {
        type: "query",
        filters: { intent: "details", packageName: "express" },
        features: ["metadata"],
      },
    },
  }), "npm express");
  assert.equal(getInitialQuery({
    queryProps: {
      type: "list",
      filters: { intent: "discover", useCase: "date formatting" },
      features: ["metadata"],
    },
  }), "date formatting");
  assert.equal(getInitialQuery({
    queryProps: {
      type: "query",
      filters: {
        intent: "package-comparison",
        packages: ["express", "fastify"],
      },
      features: ["metadata"],
    },
  }), "compare express vs fastify");
});

test("resolves initial component intent from HyperDart props without a submission step", async () => {
  const details = resolveHyperDartRequest({ searchQuery: "npm express" });
  assert.deepEqual(details.interpretation, {
    intent: "details",
    packageRefs: ["express"],
    discoveryTerm: "",
  });
  const calls = [];
  const packages = await fetchPackages(details.interpretation.packageRefs, {
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("/downloads/point/")) return response({ downloads: 24 });
      if (url.includes("/downloads/range/")) return response({ downloads: [] });
      if (url.includes("/-/v1/search")) return response({ objects: [] });
      if (url.endsWith("/latest")) return response({ version: "5.0.0", name: "express" });
      return response({ version: "5.0.0", name: "express" });
    },
  });
  assert.equal(packages[0].package.name, "express");
  assert.ok(calls.some((url) => url.endsWith("/express/latest")));

  const alternatives = resolveHyperDartRequest({
    searchData: [{ query: "alternatives to moment", entities: [] }],
  });
  assert.equal(alternatives.interpretation.intent, "alternatives");
  assert.deepEqual(alternatives.interpretation.packageRefs, ["moment"]);
  const discovery = resolveHyperDartRequest({ searchQuery: "library for parsing CSV" });
  assert.equal(discovery.interpretation.intent, "discover");
  assert.equal(discovery.interpretation.discoveryTerm, "parsing CSV");
});

test("uses the current raw query and ignores entities from stale or malformed search data", () => {
  const staleData = [{
    query: "npm express",
    entities: [{ collectionType: "HD_PACKAGES", word: "express" }],
  }];
  assert.equal(getInitialQuery({
    searchQuery: "npm react",
    searchData: staleData,
  }), "npm react");
  assert.deepEqual(getEntityNames(staleData, "npm react"), []);
  assert.deepEqual(
    interpretQuery("npm react", staleData),
    { intent: "details", packageRefs: ["react"], discoveryTerm: "" },
  );
  assert.deepEqual(getEntityNames([
    { query: "npm react", entities: [{ collectionType: "HD_PACKAGES", word: "react" }] },
  ], "npm react"), ["react"]);
  assert.equal(getInitialQuery(null), "");
  assert.equal(getInitialQuery({ searchData: "unexpected", queryProps: { filters: [] } }), "");
  assert.deepEqual(getEntityNames({ entities: [{ word: "express", collectionType: "HD_PACKAGES" }] }), []);
  assert.deepEqual(resolveHyperDartRequest(null), {
    query: "",
    entityNames: [],
    interpretation: { intent: "empty", packageRefs: [], discoveryTerm: "" },
  });
});

test("uses matching HyperDart entities only when query text needs entity resolution", () => {
  const searchData = [{
    query: "compare them",
    entities: [
      { collectionType: "HD_PACKAGES", word: "express" },
      { collectionName: "NPM_PACKAGES", word: "fastify" },
    ],
  }];
  assert.deepEqual(interpretQuery("compare them", searchData), {
    intent: "compare",
    packageRefs: ["express", "fastify"],
    discoveryTerm: "",
  });
  assert.deepEqual(
    interpretQuery("unrelated question", searchData),
    { intent: "unsupported", packageRefs: [], discoveryTerm: "" },
  );
});

test("deduplicates and caps comparison references at three", () => {
  const interpreted = interpretQuery("compare express, fastify, koa, hapi");
  assert.deepEqual(interpreted.packageRefs, ["express", "fastify", "koa"]);
  assert.deepEqual(addPackageReference(["express", "fastify"], "koa"), ["express", "fastify", "koa"]);
  assert.deepEqual(addPackageReference(["express", "fastify", "koa"], "hapi"), ["express", "fastify", "koa"]);
  assert.throws(() => addPackageReference([], "not a package name"), /valid npm package name/);
});

test("summarizes package metadata differences without ranking versions", () => {
  const differences = getVersionDifferences([
    { version: "4.0.0", description: "Old API", license: "MIT", typescript: false, unpackedSize: 2048 },
    { version: "5.0.0", description: "New API", license: "MIT", typescript: true, unpackedSize: 4096 },
  ]);
  assert.deepEqual(differences.map(({ key }) => key), ["description", "typescript", "unpackedSize"]);
  assert.deepEqual(differences.find(({ key }) => key === "unpackedSize").values, [2048, 4096]);
});

test("summarizes daily download momentum from valid history only", () => {
  assert.deepEqual(getDownloadInsights([
    { day: "2026-01-01", downloads: 10 },
    { day: "2026-01-02", downloads: 20 },
    { day: "2026-01-03", downloads: 30 },
    { day: "2026-01-04", downloads: 40 },
    { day: "invalid", downloads: -3 },
  ]), {
    total: 100,
    peakDay: "2026-01-04",
    peakDownloads: 40,
    changePercent: 133,
  });
  assert.equal(getDownloadInsights([]), null);
  assert.equal(getDownloadInsights([{ day: "2026-01-01", downloads: 0 }]).changePercent, null);
});

test("explains use-case matches using literal metadata terms", () => {
  assert.deepEqual(getQueryMatches("date formatting", {
    name: "date-fns",
    description: "Modern JavaScript date utility",
    keywords: ["format"],
  }), ["date"]);
  assert.deepEqual(getQueryMatches("CSV parser", {
    name: "csv-kit",
    description: "Tools to work with delimited files",
    keywords: ["parser", "csv"],
  }), ["csv", "parser"]);
});

test("maps HTTP failures and malformed JSON to explicit npm API errors", async () => {
  await assert.rejects(
    fetchJson("https://registry.npmjs.org/missing", { fetchImpl: async () => response({}, 404) }),
    (error) => error.code === "not-found" && error.status === 404,
  );
  await assert.rejects(
    fetchJson("https://registry.npmjs.org/rate-limited", { fetchImpl: async () => response({}, 429) }),
    (error) => error.code === "rate-limited",
  );
  await assert.rejects(
    fetchJson("https://registry.npmjs.org/unavailable", { fetchImpl: async () => response({}, 500) }),
    (error) => error.code === "server-error" && error.status === 500,
  );
  await assert.rejects(
    fetchJson("https://registry.npmjs.org/broken", {
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad JSON"); } }),
    }),
    (error) => error.code === "invalid-response",
  );
});

test("distinguishes network errors, timeouts, and caller cancellation", async () => {
  await assert.rejects(
    fetchJson("https://registry.npmjs.org/offline", { fetchImpl: async () => { throw new Error("offline"); } }),
    (error) => error.code === "network-error",
  );
  await assert.rejects(
    fetchJson("https://registry.npmjs.org/slow", {
      timeoutMs: 5,
      fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    }),
    (error) => error.code === "timeout",
  );
  const controller = new AbortController();
  const pending = fetchJson("https://registry.npmjs.org/cancelled", {
    signal: controller.signal,
    fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
});

test("loads scoped package metadata and preserves deprecation and version information", async () => {
  const requestedUrls = [];
  const metadata = {
    name: "@scope/pkg",
    version: "2.3.1",
    deprecated: "Use the maintained replacement.",
    dist: { unpackedSize: 1024 },
  };
  const result = await fetchPackage("@scope/pkg@2.3.1", {
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url.includes("/downloads/point/")) return response({ downloads: 42 });
      if (url.includes("/downloads/range/")) return response({ downloads: [] });
      if (url.includes("/-/v1/search")) return response({ objects: [] });
      return response(metadata);
    },
  });
  assert.ok(requestedUrls.some((url) => /%40scope%2Fpkg/.test(url)));
  assert.equal(result.name, "@scope/pkg");
  assert.equal(result.version, "2.3.1");
  assert.equal(result.deprecated, "Use the maintained replacement.");
  assert.equal(result.weeklyDownloads, 42);
});

test("uses the selected release date in version comparisons", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/downloads/point/last-week/express")) return response({ downloads: 4 });
    if (url.endsWith("/downloads/range/last-month/express")) return response({ downloads: [] });
    if (url.includes("/-/v1/search")) {
      return response({ objects: [{ package: { name: "express", date: "2026-05-02T00:00:00.000Z" } }] });
    }
    if (url.endsWith("/express/latest")) return response({ version: "5.0.0" });
    if (url.endsWith("/express/4.0.0")) return response({ version: "4.0.0" });
    if (url.endsWith("/express")) {
      return response({
        versions: { "4.0.0": {}, "5.0.0": {} },
        time: {
          "4.0.0": "2024-01-02T00:00:00.000Z",
          "5.0.0": "2026-05-02T00:00:00.000Z",
          modified: "2026-05-03T00:00:00.000Z",
        },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const result = await fetchPackage("express@4.0.0", { fetchImpl });
  assert.equal(result.releaseTime, "2024-01-02T00:00:00.000Z");
  assert.equal(result.latestReleaseTime, "2026-05-02T00:00:00.000Z");
  assert.deepEqual(result.releaseHistory.map(({ version }) => version), ["4.0.0", "5.0.0"]);
});

test("reports nonexistent packages and malformed metadata instead of fabricating results", async () => {
  await assert.rejects(
    fetchPackage("no-such-package", {
      fetchImpl: async (url) => url.endsWith("/latest") ? response({}, 404) : response({ objects: [] }),
    }),
    (error) => error.code === "not-found" && /Package no-such-package was not found/.test(error.message),
  );
  await assert.rejects(
    fetchPackage("bad-metadata", {
      fetchImpl: packageApiFetch({ metadata: {}, latest: {} }),
    }),
    (error) => error.code === "invalid-response",
  );
});

test("reports an explicitly requested package version that does not exist", async () => {
  await assert.rejects(
    fetchPackage("express@99.0.0", {
      fetchImpl: async (url) => {
        if (url.includes("/downloads/point/")) return response({ downloads: 1 });
        if (url.includes("/downloads/range/")) return response({ downloads: [] });
        if (url.includes("/-/v1/search")) return response({ objects: [] });
        if (url.endsWith("/latest")) return response({ version: "5.0.0" });
        if (url.endsWith("/express")) return response({ versions: {} });
        if (url.endsWith("/express/99.0.0")) return response({}, 404);
        throw new Error(`Unexpected request: ${url}`);
      },
    }),
    (error) => error.code === "not-found" && /Version 99\.0\.0 of express/.test(error.message),
  );
});

test("retains package details when weekly or daily download APIs fail", async (t) => {
  await t.test("partial failure", async () => {
    const result = await fetchPackage("express", {
      fetchImpl: packageApiFetch({
        metadata: { version: "5.0.0" },
        weekly: { downloads: "invalid" },
      }),
    });
    assert.equal(result.version, "5.0.0");
    assert.equal(result.weeklyDownloads, null);
    assert.match(result.weeklyDownloadsError, /invalid weekly statistics/);
    assert.deepEqual(result.downloads, [{ day: "2025-01-01", downloads: 6 }]);
  });
  await t.test("all download endpoints fail", async () => {
    const result = await fetchPackage("express", {
      fetchImpl: packageApiFetch({
        metadata: { version: "5.0.0" },
        weekly: { downloads: -1 },
        history: { downloads: [{ day: "2025-01-01", downloads: "invalid" }] },
      }),
    });
    assert.equal(result.weeklyDownloads, null);
    assert.deepEqual(result.downloads, []);
    assert.equal(result.downloadsUnavailable, true);
  });
});

test("returns an empty discovery list for valid no-results responses", async () => {
  const result = await searchPackages("no matching package", {
    fetchImpl: async () => response({ objects: [] }),
  });
  assert.deepEqual(result, []);
});

test("fetches at most three distinct package references", async () => {
  let requestCount = 0;
  const fetchImpl = async (url) => {
    requestCount += 1;
    if (url.includes("/downloads/point/")) return response({ downloads: 1 });
    if (url.includes("/downloads/range/")) return response({ downloads: [] });
    if (url.includes("/-/v1/search")) return response({ objects: [] });
    return response({ version: "1.0.0" });
  };
  const outcomes = await fetchPackages(["express", "express", "fastify", "koa", "hapi"], { fetchImpl });
  assert.deepEqual(outcomes.map(({ reference }) => reference), ["express", "fastify", "koa"]);
  assert.equal(outcomes.filter(({ package: pkg }) => pkg).length, 3);
  assert.equal(requestCount, 18);
});
