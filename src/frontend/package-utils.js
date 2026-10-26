const STOP_WORDS = new Set([
  "a", "an", "and", "alternatives", "alternative", "best", "compare", "comparison",
  "current", "details", "different", "for", "hi", "hello", "hey", "how", "are",
  "info", "information", "latest", "like", "find", "is", "it", "libraries", "library",
  "me", "npm", "of", "package", "packages", "please", "recommend", "show", "similar",
  "to", "them", "these", "those", "version", "vs", "versus", "what", "which",
  "with", "you",
]);

const ACTION_PATTERN = /\b(?:analy[sz](?:e|ing)|bundle|build|cache|compile|compress|convert|create|decode|decrypt|encode|encrypt|format(?:ting)?|generate|hash|import|integrate|lint|load|migrate|optimi[sz](?:e|ing)|parse|process|render|save|serialize|sort|store|stream|test|transform|transpile|validate|write)\b/i;
const REQUEST_PATTERN = /\b(?:best|find|looking for|need|recommend|suggest|want|library|libraries|module|modules|npm|package|packages|plugin|plugins|tool|tools|utility|utilities|dependency|dependencies)\b/i;
const DISCOVERY_CONNECTOR_PATTERN = /\b(?:for|to|using|with)\s+\S+/i;
const GREETING_PATTERN = /^(?:(?:hi|hello|hey|yo|howdy|good morning|good afternoon|good evening)[\s,!.?]*)+(?:(?:how are you|how's it going|what's up|how do you do)[\s,!.?]*)*$/i;
const PACKAGE_NAME_PATTERN = /^(?:@[a-z\d][a-z\d._-]*\/)?[a-z\d][a-z\d._-]*$/i;
const VERSION_SUFFIX_PATTERN = /@(\d+(?:\.\d+){0,2})$/;

export class NpmApiError extends Error {
  constructor(code, message, status = null, cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = "NpmApiError";
    this.code = code;
    this.status = status;
  }
}

function getSearchRecords(value) {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

export function getInitialQuery(props = {}) {
  const safeProps = isRecord(props) ? props : {};
  if (typeof safeProps.searchQuery === "string" && safeProps.searchQuery.trim()) {
    return safeProps.searchQuery.trim();
  }

  const searchDataQuery = getSearchRecords(safeProps.searchData)
    .find((record) => typeof record.query === "string" && record.query.trim())?.query;
  if (searchDataQuery) return searchDataQuery.trim();
  if (typeof safeProps.queryProps?.query === "string" && safeProps.queryProps.query.trim()) {
    return safeProps.queryProps.query.trim();
  }

  const queryObject = isRecord(safeProps.queryProps?.queryObject)
    ? safeProps.queryProps.queryObject : safeProps.queryProps;
  const filters = isRecord(queryObject?.filters) ? queryObject.filters : queryObject;
  if (!isRecord(filters)) return "";
  const packages = Array.isArray(filters.packages)
    ? filters.packages
    : Array.isArray(filters.packageNames) ? filters.packageNames
      : typeof filters.name === "string" ? [filters.name] : [];
  const packageNames = packages.filter((name) => typeof name === "string" && name.trim())
    .map((name) => name.trim()).slice(0, 3);
  const rawPackageName = filters.packageName || packageNames[0] || filters.name;
  const packageName = typeof rawPackageName === "string" ? rawPackageName.trim() : "";
  const intentValue = filters.intent || filters.action || queryObject?.intent;
  const intent = typeof intentValue === "string" ? intentValue.toLowerCase() : "";
  if ((intent === "compare" || intent === "package-comparison") && packageNames.length >= 2) {
    return `compare ${packageNames.join(" vs ")}`;
  }
  if ((intent === "alternatives" || intent === "package-alternatives") && packageName) {
    return `alternatives to ${packageName}`;
  }
  if ((intent === "details" || intent === "package-details") && packageName) {
    return `npm ${packageName}`;
  }
  if ((intent === "discover" || intent === "use-case-discovery")
    && typeof filters.useCase === "string" && filters.useCase.trim()) {
    return filters.useCase.trim();
  }
  if (typeof filters.useCase === "string" && filters.useCase.trim()) return filters.useCase.trim();
  if (typeof packageName === "string" && packageName.trim()) return `npm ${packageName.trim()}`;
  return "";
}

export function getEntityNames(searchData, query) {
  const records = getSearchRecords(searchData);
  const currentQuery = typeof query === "string"
    ? query.trim().toLowerCase()
    : records.find((record) => typeof record.query === "string")?.query?.trim().toLowerCase();
  if (!currentQuery) return [];
  const matchingRecord = records.find((record) => (
    typeof record.query === "string" && record.query.trim().toLowerCase() === currentQuery
  ));
  if (!matchingRecord || !Array.isArray(matchingRecord.entities)) return [];
  const names = matchingRecord.entities
    .filter((record) => isRecord(record))
    .filter((record) => record.collectionName === "NPM_PACKAGES"
      || record.collectionType === "HD_PACKAGES")
    .map((record) => typeof record.word === "string" && record.word.trim()
      ? record.word : record.sourceID)
    .filter((name) => typeof name === "string" && name.trim())
    .map((name) => name.trim());
  return uniquePackageReferences(names);
}

export function parsePackageReference(reference) {
  if (typeof reference !== "string") return { name: "", requestedVersion: null };
  const candidate = reference.trim();
  const match = candidate.match(/^(.*)@(\d+(?:\.\d+){0,2})$/);
  const name = match ? match[1] : candidate;
  return {
    name,
    requestedVersion: match ? match[2] : null,
  };
}

function isPackageReference(reference) {
  const { name } = parsePackageReference(reference);
  return name.length <= 214 && PACKAGE_NAME_PATTERN.test(name);
}

function uniquePackageReferences(references) {
  const seen = new Set();
  return references.filter((reference) => {
    if (!isPackageReference(reference)) return false;
    const normalized = reference.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 3);
}

export function inferPackageReferences(query) {
  if (typeof query !== "string") return [];
  const normalizedQuery = query.trim();
  if (isPackageReference(normalizedQuery)) return [normalizedQuery];

  const repeatedVersionComparison = query.match(/(?:^|\s)((?:@[\w.-]+\/)?[\w.-]+)\s+v?(\d+(?:\.\d+)*)\s+(?:and|vs|versus)\s+\1\s+v?(\d+(?:\.\d+)*)\b/i);
  if (repeatedVersionComparison) {
    return uniquePackageReferences([
      `${repeatedVersionComparison[1]}@${repeatedVersionComparison[2]}`,
      `${repeatedVersionComparison[1]}@${repeatedVersionComparison[3]}`,
    ]);
  }
  const versionComparison = query.match(/(?:^|\s)((?:@[\w.-]+\/)?[\w.-]+)\s+v?(\d+(?:\.\d+)*)\s+(?:vs|versus)\s+v?(\d+(?:\.\d+)*)\b/i);
  if (versionComparison) {
    return uniquePackageReferences([
      `${versionComparison[1]}@${versionComparison[2]}`,
      `${versionComparison[1]}@${versionComparison[3]}`,
    ]);
  }

  const detailTarget = normalizedQuery.match(/^(?:npm(?:\s+package)?|package(?:\s+info)?|(?:latest|current)\s+version\s+of)\s+(.+)$/i)?.[1]?.trim();
  if (detailTarget && isPackageReference(detailTarget)) return [detailTarget];

  const alternativeTarget = normalizedQuery.match(/^(?:alternatives?(?:\s+(?:to|for))?|similar\s+to|packages?\s+like)\s+(.+)$/i)?.[1]?.trim();
  if (alternativeTarget && isPackageReference(alternativeTarget)) return [alternativeTarget];

  if (/\b(?:compare|comparison|versus|vs)\b/i.test(normalizedQuery)) {
    const comparisonText = normalizedQuery
      .replace(/^\s*(?:please\s+)?(?:compare|comparison)\s+(?:(?:npm\s+)?packages?\s*:?\s*)?(?:of\s+)?/i, "")
      .replace(/^\s*(?:npm\s+)?packages?\s+/i, "");
    const targets = comparisonText
      .split(/\s+(?:and|vs|versus)\s+|,/i)
      .map((target) => target.trim());
    if (targets.length >= 2 && targets.every(isPackageReference)) {
      return uniquePackageReferences(targets);
    }
  }

  const candidates = normalizedQuery.match(/@?[a-z\d][a-z\d._-]*(?:\/[a-z\d][a-z\d._-]*)?(?:@\d+(?:\.\d+){0,2})?/gi) || [];
  return uniquePackageReferences(candidates.filter((candidate) => {
    const { name } = parsePackageReference(candidate);
    return !STOP_WORDS.has(name.toLowerCase()) && !/^\d/.test(name);
  }));
}

export function getPackageReferences(query, entityNames = []) {
  const inferred = inferPackageReferences(query);
  if (inferred.length) return inferred;
  const names = Array.isArray(entityNames) ? entityNames : [];
  return uniquePackageReferences(names.length ? names : inferred);
}

export function getDiscoveryTerm(query) {
  if (typeof query !== "string") return "";
  return query
    .replace(/\b(?:best|npm|package|packages|library|libraries|module|modules|tool|tools|utility|utilities|plugin|plugins|dependency|dependencies|for|to|find|show|me|a|an|the|which|what|use|case|looking|need|recommend|suggest|want|using|with)\b/gi, " ")
    .replace(/[?!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function interpretQueryWithEntities(query, entityNames) {
  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  if (!normalizedQuery) return { intent: "empty", packageRefs: [], discoveryTerm: "" };
  if (GREETING_PATTERN.test(normalizedQuery)) {
    return { intent: "unsupported", packageRefs: [], discoveryTerm: "" };
  }

  let packageRefs = getPackageReferences(normalizedQuery, entityNames);
  const normalized = normalizedQuery.toLowerCase();
  const alternativeIntent = /\b(?:alternatives?|similar to|packages? like)\b/i.test(normalized);
  const comparisonIntent = /\b(?:compare|comparison|versus|vs)\b/i.test(normalized);
  const detailIntent = /^(?:npm(?:\s+package)?|package(?:\s+info)?|(?:latest|current)\s+version\s+of)\s+/i.test(normalizedQuery);
  const barePackageName = isPackageReference(normalizedQuery);

  if (!entityNames.length) {
    const detailTarget = normalizedQuery.match(/^(?:npm(?:\s+package)?|package(?:\s+info)?|(?:latest|current)\s+version\s+of)\s+(.+)$/i)?.[1]?.trim();
    const alternativeTarget = normalizedQuery.match(/^(?:alternatives?(?:\s+(?:to|for))?|similar\s+to|packages?\s+like)\s+(.+)$/i)?.[1]?.trim();
    if (barePackageName) {
      packageRefs = [normalizedQuery];
    } else if (detailTarget && isPackageReference(detailTarget)) {
      packageRefs = [detailTarget];
    } else if (alternativeTarget && isPackageReference(alternativeTarget)) {
      packageRefs = [alternativeTarget];
    } else if (comparisonIntent) {
      const comparisonTargets = normalizedQuery
        .replace(/^\s*(?:please\s+)?(?:compare|comparison)\s+(?:packages?\s*:?\s*)?/i, "")
        .split(/\s+(?:and|vs|versus)\s+|,/i)
        .map((target) => target.trim());
      if (comparisonTargets.length >= 2 && comparisonTargets.every(isPackageReference)) {
        packageRefs = uniquePackageReferences(comparisonTargets);
      }
    }
  }

  if (alternativeIntent) {
    return packageRefs.length
      ? { intent: "alternatives", packageRefs: packageRefs.slice(0, 1), discoveryTerm: "" }
      : { intent: "unsupported", packageRefs: [], discoveryTerm: "" };
  }
  if ((detailIntent && !comparisonIntent) || barePackageName) {
    return packageRefs.length
      ? { intent: "details", packageRefs: packageRefs.slice(0, 1), discoveryTerm: "" }
      : { intent: "unsupported", packageRefs: [], discoveryTerm: "" };
  }
  if (comparisonIntent || (packageRefs.length > 1 && /\b(?:and|versus|vs)\b|,/.test(normalized))) {
    return packageRefs.length >= 2
      ? { intent: "compare", packageRefs: packageRefs.slice(0, 3), discoveryTerm: "" }
      : { intent: "unsupported", packageRefs: [], discoveryTerm: "" };
  }

  const discoveryTerm = getDiscoveryTerm(normalizedQuery);
  const isDiscoveryRequest = REQUEST_PATTERN.test(normalizedQuery)
    || DISCOVERY_CONNECTOR_PATTERN.test(normalizedQuery)
    || ACTION_PATTERN.test(normalizedQuery)
    || entityNames.length > 1;
  if (isDiscoveryRequest && discoveryTerm) {
    return { intent: "discover", packageRefs: [], discoveryTerm };
  }
  return { intent: "unsupported", packageRefs: [], discoveryTerm: "" };
}

export function interpretQuery(query, searchData) {
  return interpretQueryWithEntities(query, getEntityNames(searchData, query));
}

export function resolveHyperDartRequest(props = {}) {
  const safeProps = isRecord(props) ? props : {};
  const query = getInitialQuery(safeProps);
  const entityNames = getEntityNames(safeProps.searchData, query);
  return {
    query,
    entityNames,
    interpretation: interpretQueryWithEntities(query, entityNames),
  };
}

export function addPackageReference(references, candidate) {
  if (!isPackageReference(candidate)) throw new Error("Enter a valid npm package name, optionally followed by a version.");
  const current = uniquePackageReferences(Array.isArray(references) ? references : []);
  if (current.some((reference) => reference.toLowerCase() === candidate.trim().toLowerCase())) return current;
  if (current.length >= 3) return current;
  return [...current, candidate.trim()];
}

export function compareVersions(left, right) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateDownloadCount(data) {
  if (!isRecord(data) || typeof data.downloads !== "number"
    || !Number.isFinite(data.downloads) || data.downloads < 0) {
    throw new NpmApiError("invalid-response", "The npm downloads API returned invalid weekly statistics.");
  }
  return data.downloads;
}

export async function fetchWeeklyDownloads(packageName, options = {}) {
  const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`;
  return validateDownloadCount(await fetchJson(url, options));
}

function validateDownloadHistory(data) {
  if (!isRecord(data) || !Array.isArray(data.downloads)
    || data.downloads.some((day) => !isRecord(day)
      || typeof day.day !== "string"
      || typeof day.downloads !== "number"
      || !Number.isFinite(day.downloads)
      || day.downloads < 0)) {
    throw new NpmApiError("invalid-response", "The npm downloads API returned invalid daily statistics.");
  }
  return data.downloads;
}

function validatePackageMetadata(data, packageName) {
  if (!isRecord(data) || typeof data.version !== "string" || !data.version) {
    throw new NpmApiError("invalid-response", `The npm registry returned invalid metadata for ${packageName}.`);
  }
  return data;
}

function createHttpError(response) {
  if (response.status === 404) {
    return new NpmApiError("not-found", "The requested package or version was not found on npm.", 404);
  }
  if (response.status === 429) {
    return new NpmApiError("rate-limited", "The npm API rate limit was reached. Please try again shortly.", 429);
  }
  if (response.status >= 500) {
    return new NpmApiError("server-error", `The npm API is temporarily unavailable (${response.status}).`, response.status);
  }
  return new NpmApiError("http-error", `The npm API request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`, response.status);
}

export async function fetchJson(url, {
  signal,
  accept = "application/json",
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abortRequest = () => controller.abort(signal.reason);
  if (signal?.aborted) abortRequest();
  else signal?.addEventListener("abort", abortRequest, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: accept },
        signal: controller.signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timedOut) throw new NpmApiError("timeout", "The npm API request timed out. Please try again.", null, error);
      throw new NpmApiError("network-error", "Could not reach the npm API. Check your connection and try again.", null, error);
    }
    if (!response.ok) throw createHttpError(response);
    try {
      return await response.json();
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new NpmApiError("invalid-response", "The npm API returned malformed JSON.", response.status, error);
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }
}

function getPackageErrorMessage(reference, error) {
  if (error?.code === "not-found" || error?.status === 404) {
    const { name, requestedVersion } = parsePackageReference(reference);
    return requestedVersion
      ? `Version ${requestedVersion} of ${name} was not found on npm.`
      : `Package ${name} was not found on npm.`;
  }
  return error?.message || "The npm registry request failed. Please try again.";
}

function getDownloadError(result, label) {
  return result.status === "rejected"
    ? `${label}: ${result.reason?.message || "statistics unavailable"}`
    : null;
}

export async function fetchPackage(reference, {
  signal,
  fetchImpl = globalThis.fetch,
  timeoutMs,
} = {}) {
  const { name, requestedVersion } = parsePackageReference(reference);
  if (!isPackageReference(reference)) {
    throw new NpmApiError("invalid-package-name", `“${reference}” is not a valid npm package name.`);
  }
  const encodedName = encodeURIComponent(name);
  const requestedParts = requestedVersion?.split(".");
  const isPartialVersion = requestedParts && requestedParts.length < 3;
  const jsonOptions = { signal, fetchImpl, timeoutMs };
  const packumentRequest = fetchJson(`https://registry.npmjs.org/${encodedName}`, {
    ...jsonOptions,
    accept: "application/json",
  }).then((packument) => {
    if (!isRecord(packument) || !isRecord(packument.versions)) {
      throw new NpmApiError("invalid-response", `The npm registry returned invalid release history for ${name}.`);
    }
    return packument;
  });
  const versionRequest = isPartialVersion
    ? packumentRequest.then((packument) => {
      const selected = Object.values(packument.versions)
        .filter((version) => {
          if (!isRecord(version) || typeof version.version !== "string" || version.version.includes("-")) return false;
          return version.version.split(".").slice(0, requestedParts.length).join(".") === requestedVersion;
        })
        .sort((left, right) => compareVersions(right.version, left.version))[0];
      if (!selected) {
        throw new NpmApiError("version-not-found", `${name} has no stable release matching version ${requestedVersion}.`);
      }
      return validatePackageMetadata(selected, name);
    })
    : fetchJson(requestedVersion
      ? `https://registry.npmjs.org/${encodedName}/${encodeURIComponent(requestedVersion)}`
      : `https://registry.npmjs.org/${encodedName}/latest`, jsonOptions)
      .then((metadata) => validatePackageMetadata(metadata, name));

  const [versionResult, latestResult, weeklyResult, historyResult, releaseResult, packumentResult] = await Promise.allSettled([
    versionRequest,
    fetchJson(`https://registry.npmjs.org/${encodedName}/latest`, jsonOptions)
      .then((metadata) => validatePackageMetadata(metadata, name)),
    fetchJson(`https://api.npmjs.org/downloads/point/last-week/${encodedName}`, jsonOptions)
      .then(validateDownloadCount),
    fetchJson(`https://api.npmjs.org/downloads/range/last-month/${encodedName}`, jsonOptions)
      .then(validateDownloadHistory),
    fetchJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(name)}&size=20`, jsonOptions)
      .then((data) => {
        if (!isRecord(data) || !Array.isArray(data.objects)) {
          throw new NpmApiError("invalid-response", "The npm search API returned invalid package metadata.");
        }
        return data.objects.find((result) => result?.package?.name === name);
      }),
    packumentRequest,
  ]);

  if (versionResult.status === "rejected") {
    if (versionResult.reason?.code === "not-found") {
      throw new NpmApiError("not-found", getPackageErrorMessage(reference, versionResult.reason), 404, versionResult.reason);
    }
    throw versionResult.reason;
  }
  const metadata = versionResult.value;
  const latestMetadata = latestResult.status === "fulfilled" ? latestResult.value : null;
  const exactSearchResult = releaseResult.status === "fulfilled" ? releaseResult.value : null;
  const releaseTimes = packumentResult.status === "fulfilled" && isRecord(packumentResult.value.time)
    ? packumentResult.value.time : {};
  const releaseHistory = Object.entries(releaseTimes)
    .filter(([version, timestamp]) => /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(version)
      && typeof timestamp === "string"
      && Number.isFinite(Date.parse(timestamp)))
    .sort((left, right) => Date.parse(left[1]) - Date.parse(right[1]))
    .slice(-5)
    .map(([version, timestamp]) => ({ version, timestamp }));
  const weeklyError = getDownloadError(weeklyResult, "Weekly downloads unavailable");
  const historyError = getDownloadError(historyResult, "Daily downloads unavailable");
  const downloadsError = [weeklyError, historyError].filter(Boolean).join(" ");

  return {
    name,
    requestedVersion,
    version: metadata.version,
    latestVersion: latestMetadata?.version || metadata.version,
    description: typeof metadata.description === "string" && metadata.description
      ? metadata.description : "No description provided.",
    keywords: Array.isArray(metadata.keywords)
      ? metadata.keywords.filter((keyword) => typeof keyword === "string") : [],
    license: typeof metadata.license === "string" ? metadata.license : metadata.license?.type,
    repository: typeof metadata.repository === "string"
      ? metadata.repository
      : metadata.repository?.url,
    homepage: metadata.homepage,
    deprecated: metadata.deprecated,
    unpackedSize: typeof metadata.dist?.unpackedSize === "number"
      && Number.isFinite(metadata.dist.unpackedSize) && metadata.dist.unpackedSize >= 0
      ? metadata.dist.unpackedSize : null,
    weeklyDownloads: weeklyResult.status === "fulfilled" ? weeklyResult.value : null,
    downloads: historyResult.status === "fulfilled" ? historyResult.value : [],
    weeklyDownloadsError: weeklyError,
    downloadsHistoryError: historyError,
    downloadsUnavailable: Boolean(downloadsError),
    downloadsError,
    typescript: Boolean(metadata.types || metadata.typings),
    esm: supportsEsm(metadata),
    node: typeof metadata.engines?.node === "string" ? metadata.engines.node : null,
    releaseTime: releaseTimes[metadata.version]
      || metadata.time
      || (metadata.version === latestMetadata?.version ? exactSearchResult?.package?.date : null)
      || null,
    releaseHistory,
    latestReleaseTime: latestMetadata
      ? releaseTimes[latestMetadata.version] || latestMetadata.time || exactSearchResult?.package?.date || null
      : null,
    latestLookupUnavailable: latestResult.status === "rejected",
  };
}

function supportsEsm(metadata) {
  const exportsValue = metadata.exports;
  if (typeof metadata.module === "string" || metadata.type === "module") return true;
  if (exportsValue && typeof exportsValue === "object") {
    if ("import" in exportsValue || "module" in exportsValue) return true;
    return Object.values(exportsValue).some((entry) => entry && typeof entry === "object"
      && ("import" in entry || "module" in entry));
  }
  return false;
}

export async function searchPackages(term, { signal, fetchImpl, timeoutMs } = {}) {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(term)}&size=8`;
  const result = await fetchJson(url, { signal, fetchImpl, timeoutMs });
  if (!isRecord(result) || !Array.isArray(result.objects)) {
    throw new NpmApiError("invalid-response", "The npm search API returned an invalid response.");
  }
  return result.objects.flatMap((entry) => {
    const pkg = entry?.package;
    if (!isRecord(pkg) || typeof pkg.name !== "string" || !isPackageReference(pkg.name)) return [];
    return [{
      name: pkg.name,
      version: typeof pkg.version === "string" ? pkg.version : "Version unavailable",
      description: typeof pkg.description === "string" && pkg.description
        ? pkg.description : "No description provided.",
      keywords: Array.isArray(pkg.keywords)
        ? pkg.keywords.filter((keyword) => typeof keyword === "string") : [],
      releaseTime: typeof pkg.date === "string" ? pkg.date : null,
      score: typeof entry.score?.final === "number" ? entry.score.final : null,
    }];
  });
}

export function getPackageErrorMessageForDisplay(reference, error) {
  return getPackageErrorMessage(reference, error);
}

export function getVersionDifferences(packages) {
  if (!Array.isArray(packages) || packages.length < 2) return [];
  const fields = [
    ["description", "Description"],
    ["license", "License"],
    ["node", "Node.js requirement"],
    ["typescript", "TypeScript declarations"],
    ["esm", "ES modules"],
    ["unpackedSize", "Unpacked footprint"],
    ["deprecated", "Deprecation notice"],
  ];
  return fields.flatMap(([key, label]) => {
    const values = packages.map((pkg) => {
      if (key === "typescript") return pkg.typescript ? "Declared" : "Not declared";
      if (key === "esm") return pkg.esm ? "Available" : "Not declared";
      if (key === "unpackedSize") return Number.isFinite(pkg.unpackedSize) ? pkg.unpackedSize : null;
      if (key === "deprecated") return pkg.deprecated || null;
      return typeof pkg[key] === "string" && pkg[key].trim() ? pkg[key].trim() : null;
    });
    const normalized = values.map((value) => value === null ? "" : String(value).toLowerCase());
    return new Set(normalized).size > 1 ? [{ key, label, values }] : [];
  });
}

export function getDownloadInsights(downloads) {
  if (!Array.isArray(downloads)) return null;
  const validDownloads = downloads.filter((day) => day
    && typeof day.day === "string"
    && typeof day.downloads === "number"
    && Number.isFinite(day.downloads)
    && day.downloads >= 0);
  if (!validDownloads.length) return null;

  const peak = validDownloads.reduce((highest, day) => (
    day.downloads > highest.downloads ? day : highest
  ));
  const midpoint = Math.floor(validDownloads.length / 2);
  const earlierTotal = validDownloads.slice(0, midpoint)
    .reduce((total, day) => total + day.downloads, 0);
  const recentTotal = validDownloads.slice(midpoint)
    .reduce((total, day) => total + day.downloads, 0);
  const changePercent = midpoint > 0 && earlierTotal > 0
    ? Math.round(((recentTotal - earlierTotal) / earlierTotal) * 100)
    : null;

  return {
    total: validDownloads.reduce((total, day) => total + day.downloads, 0),
    peakDay: peak.day,
    peakDownloads: peak.downloads,
    changePercent,
  };
}

export function getQueryMatches(query, packageResult) {
  if (typeof query !== "string" || !packageResult || typeof packageResult !== "object") return [];
  const terms = query.toLowerCase().match(/[a-z\d][a-z\d+.#-]*/g) || [];
  const searchableWords = new Set([
    packageResult.name,
    packageResult.description,
    ...(Array.isArray(packageResult.keywords) ? packageResult.keywords : []),
  ].filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase()
    .match(/[a-z\d][a-z\d+.#-]*/g) || []);
  return [...new Set(terms.filter((term) => term.length > 1 && searchableWords.has(term)))];
}

export async function fetchPackages(references, options = {}) {
  const uniqueReferences = uniquePackageReferences(Array.isArray(references) ? references : []);
  const outcomes = await Promise.all(uniqueReferences.map(async (reference) => {
    try {
      return { reference, package: await fetchPackage(reference, options), error: null };
    } catch (error) {
      if (options.signal?.aborted) return { reference, package: null, error };
      return { reference, package: null, error };
    }
  }));
  return outcomes;
}
