import React, { useEffect, useMemo, useRef, useState } from "react";
import "./package-info.css";
import {
  addPackageReference,
  fetchJson,
  fetchPackages,
  fetchWeeklyDownloads,
  getDownloadInsights,
  getPackageErrorMessageForDisplay,
  getQueryMatches,
  getVersionDifferences,
  interpretQuery,
  resolveHyperDartRequest,
  searchPackages,
} from "./package-utils";

function getThemeMode(theme, platformMode) {
  const themeMode = typeof theme === "string"
    ? theme
    : theme?.mode || theme?.colorScheme || theme?.palette?.mode;
  const declaredMode = [platformMode, themeMode]
    .find((mode) => typeof mode === "string" && /dark|light|bright/i.test(mode));
  if (declaredMode) {
    return /dark|lightsout/i.test(declaredMode) ? "dark" : "light";
  }

  const background = typeof theme === "object" && theme
    ? theme.backgroundColor || theme.background || theme.colors?.background
      || theme.palette?.background?.default || theme.palette?.background?.paper
    : null;
  if (typeof background !== "string") return "auto";
  if (background.toLowerCase() === "black") return "dark";
  if (background.toLowerCase() === "white") return "light";
  const hex = background.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  const rgb = background.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i);
  const channels = hex
    ? (hex[1].length === 3
      ? hex[1].split("").map((channel) => parseInt(channel + channel, 16))
      : [0, 2, 4].map((index) => parseInt(hex[1].slice(index, index + 2), 16)))
    : rgb ? rgb.slice(1, 4).map(Number) : null;
  if (!channels) return "auto";
  const luminance = (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255;
  return luminance < 0.5 ? "dark" : "light";
}

function packageLabel(pkg) {
  return `${pkg.name}${pkg.requestedVersion && pkg.requestedVersion !== pkg.latestVersion
    ? ` @ ${pkg.requestedVersion}` : ""}`;
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatBytes(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[index]}`;
}

function humanizeDate(value) {
  if (!value) return "Release date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Release date unavailable"
    : `Released ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)}`;
}

function PackageFingerprint({ pkg }) {
  const signals = [
    {
      label: "Weekly reach",
      value: typeof pkg.weeklyDownloads === "number" ? `${formatNumber(pkg.weeklyDownloads)} downloads` : "Unavailable",
      state: typeof pkg.weeklyDownloads === "number" ? "known" : "unknown",
    },
    {
      label: "Unpacked size",
      value: formatBytes(pkg.unpackedSize),
      state: typeof pkg.unpackedSize === "number" ? "known" : "unknown",
    },
    {
      label: "Latest release",
      value: humanizeDate(pkg.latestReleaseTime || pkg.releaseTime).replace(/^Released /, ""),
      state: pkg.latestReleaseTime || pkg.releaseTime ? "known" : "unknown",
    },
    {
      label: "Developer signals",
      value: [pkg.typescript && "TypeScript", pkg.esm && "ESM"].filter(Boolean).join(" · ") || "No declarations",
      state: pkg.typescript || pkg.esm ? "present" : "unknown",
    },
  ];

  return (
    <section className="pi-fingerprint" aria-label={`${pkg.name} package signal fingerprint`}>
      <div className="pi-fingerprint-heading">
        <span className="pi-eyebrow">Package fingerprint</span>
        <span>Signals, not a score</span>
      </div>
      <div className="pi-fingerprint-grid">
        {signals.map((signal, index) => (
          <div className="pi-fingerprint-signal" key={signal.label}>
            <span className={`pi-fingerprint-mark pi-fingerprint-mark-${index} pi-fingerprint-${signal.state}`} aria-hidden="true">
              <i /><i /><i /><i />
            </span>
            <span className="pi-fingerprint-label">{signal.label}</span>
            <strong>{signal.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DownloadChart({ packages }) {
  const series = packages.filter((pkg) => pkg.downloads.length > 0);
  const unavailable = packages.filter((pkg) => pkg.downloadsHistoryError);
  const releasePackages = [...new Map(packages.map((pkg) => [pkg.name, pkg])).values()];
  if (series.length === 0 && unavailable.length === 0) return null;
  const max = Math.max(1, ...series.flatMap((pkg) => pkg.downloads.map((day) => day.downloads)));
  const days = Math.max(0, ...series.map((pkg) => pkg.downloads.length));
  return (
    <section className="pi-panel pi-chart-panel" aria-label="Daily downloads over the last month">
      <div className="pi-panel-heading">
        <div>
          <p className="pi-eyebrow">Momentum / last 30 days</p>
          <h2>Daily downloads</h2>
        </div>
        <span className="pi-chart-caption">npm downloads API</span>
      </div>
      <div className="pi-chart">
        {unavailable.length > 0 && (
          <p className="pi-inline-note" role="status">
            Daily download history unavailable for {unavailable.map((pkg) => pkg.name).join(", ")}.
          </p>
        )}
        {series.map((pkg, packageIndex) => (
          <div className="pi-chart-series" key={`${pkg.name}-${pkg.version}`}>
            <div className="pi-chart-label">
              <span className={`pi-dot pi-dot-${packageIndex % 3}`} />
              <span>{packageLabel(pkg)}</span>
            </div>
            <div className="pi-bars" role="img" aria-label={`${packageLabel(pkg)} daily downloads`}>
              {pkg.downloads.slice(-days).map((day) => {
              const height = day.downloads === 0 ? 0 : Math.max(3, (day.downloads / max) * 100);
                return (
                  <span
                    className={`pi-bar pi-bar-${packageIndex % 3}`}
                    key={day.day}
                    style={{ height: `${height}%` }}
                    title={`${day.day}: ${formatNumber(day.downloads)} downloads`}
                  />
                );
              })}
            </div>
            {(() => {
              const insights = getDownloadInsights(pkg.downloads);
              if (!insights) return null;
              return (
                <div className="pi-momentum-notes">
                  <span><strong>{formatNumber(insights.total)}</strong> downloads / 30 days</span>
                  <span>Peak {humanizeDate(insights.peakDay).replace(/^Released /, "")} · {formatNumber(insights.peakDownloads)}</span>
                  {insights.changePercent !== null && (
                    <span className={insights.changePercent > 0 ? "pi-trend-up" : insights.changePercent < 0 ? "pi-trend-down" : ""}>
                      {insights.changePercent > 0 ? "↑" : insights.changePercent < 0 ? "↓" : "→"} {Math.abs(insights.changePercent)}% vs previous half
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
        <div className="pi-release-history">
          <div className="pi-release-history-heading">
            <strong>Recent stable releases</strong>
            <span>npm registry dates</span>
          </div>
          {releasePackages.map((pkg) => (
            <div className="pi-release-track" key={`${pkg.name}-${pkg.version}`}>
              <span className="pi-release-track-name">{packageLabel(pkg)}</span>
              {pkg.releaseHistory?.length ? (
                <ol>
                  {pkg.releaseHistory.map((release) => (
                    <li key={release.version} title={`${release.version} · ${humanizeDate(release.timestamp)}`}>
                      <span>{release.version}</span>
                      <time dateTime={release.timestamp}>{new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(new Date(release.timestamp))}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <span className="pi-release-history-unavailable">Release history unavailable</span>
              )}
            </div>
          ))}
        </div>
        <div className="pi-chart-axis"><span>30 days ago</span><span>Today</span></div>
      </div>
    </section>
  );
}

function VersionDifferencePanel({ packages }) {
  if (packages.length < 2
    || packages.some((pkg) => pkg.name !== packages[0].name)
    || new Set(packages.map((pkg) => pkg.version)).size < 2) return null;

  const differences = getVersionDifferences(packages);
  const formatValue = (key, value) => {
    if (key === "unpackedSize") return formatBytes(value);
    if (key === "deprecated") return value || "Not deprecated";
    return value || "Not specified";
  };

  return (
    <section className="pi-panel pi-version-differences" aria-label="Metadata differences between selected versions">
      <div className="pi-panel-heading">
        <div>
          <p className="pi-eyebrow">Version lens / same package</p>
          <h2>What changed in the metadata?</h2>
        </div>
        <span className="pi-chart-caption">Only observable differences</span>
      </div>
      {differences.length ? (
        <div className="pi-difference-list">
          {differences.map((difference) => (
            <div className="pi-difference-row" key={difference.key}>
              <strong>{difference.label}</strong>
              <div>
                {packages.map((pkg, index) => (
                  <span key={`${pkg.name}-${pkg.version}`}>
                    <small>{pkg.version}</small>
                    {formatValue(difference.key, difference.values[index])}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="pi-no-differences">No differences found in the available metadata signals.</p>
      )}
      <p className="pi-source-note">This compares registry metadata, not source-code changes or a compatibility guarantee.</p>
    </section>
  );
}

function PackageCard({ pkg, onAlternatives, compact }) {
  return (
    <article className={`pi-package-card${compact ? " pi-package-card-compact" : ""}`}>
      <div className="pi-card-topline">
        <span className="pi-version">{pkg.version}</span>
        {pkg.deprecated
          ? <span className="pi-badge pi-badge-warning">Deprecated</span>
          : <span className="pi-badge pi-badge-live">On npm</span>}
      </div>
      <h2 className="pi-package-name">{packageLabel(pkg)}</h2>
      <p className="pi-description">{pkg.description}</p>
      {pkg.deprecated && <p className="pi-deprecation">{pkg.deprecated}</p>}
      <p className="pi-release">{humanizeDate(pkg.releaseTime)}</p>

      <PackageFingerprint pkg={pkg} />

      <div className="pi-metric-row">
        <div className="pi-metric">
          <span className="pi-metric-value">{formatNumber(pkg.weeklyDownloads)}</span>
          <span className="pi-metric-label">downloads / week</span>
        </div>
        <div className="pi-metric">
          <span className="pi-metric-value">{formatBytes(pkg.unpackedSize)}</span>
          <span className="pi-metric-label">unpacked footprint</span>
        </div>
      </div>

      <div className="pi-capabilities">
        <span className={pkg.typescript ? "pi-capability pi-capability-on" : "pi-capability"}>
          TS {pkg.typescript ? "Declared" : "No declarations"}
        </span>
        <span className={pkg.esm ? "pi-capability pi-capability-on" : "pi-capability"}>
          ESM {pkg.esm ? "Available" : "Not declared"}
        </span>
        <span className="pi-capability">Node {pkg.node || "Unspecified"}</span>
        <span className="pi-capability">{pkg.license || "License unspecified"}</span>
      </div>

      {pkg.downloadsUnavailable && (
        <p className="pi-inline-note">
          {pkg.weeklyDownloadsError && pkg.downloadsHistoryError
            ? `Download statistics unavailable. ${pkg.downloadsError}`
            : pkg.weeklyDownloadsError
              ? pkg.weeklyDownloadsError
              : pkg.downloadsHistoryError}
        </p>
      )}
      {!compact && pkg.keywords.length > 0 && (
        <div className="pi-keywords" aria-label="Package keywords">
          {pkg.keywords.slice(0, 5).map((keyword) => <span key={keyword}>{keyword}</span>)}
        </div>
      )}
      <div className="pi-card-footer">
        {pkg.repository && (
          <a href={pkg.repository.replace(/^git\+/, "").replace(/\.git$/, "")} target="_blank" rel="noreferrer">
            Source repository ↗
          </a>
        )}
        {pkg.homepage && <a href={pkg.homepage} target="_blank" rel="noreferrer">Homepage ↗</a>}
        <button className="pi-alternatives-action" type="button" onClick={() => onAlternatives(pkg.name)}>
          Explore alternatives <span>→</span>
        </button>
      </div>
    </article>
  );
}

function sharedKeywords(sourceKeywords, alternativeKeywords) {
  const source = new Set(sourceKeywords.map((keyword) => keyword.toLowerCase()));
  return alternativeKeywords.filter((keyword) => source.has(keyword.toLowerCase()));
}

function ComparisonTable({ packages }) {
  const rows = [
    ["Selected version", (pkg) => pkg.version],
    ["Latest version", (pkg) => pkg.latestLookupUnavailable ? "Unavailable" : pkg.latestVersion],
    ["Downloads / week", (pkg) => formatNumber(pkg.weeklyDownloads)],
    ["Unpacked footprint", (pkg) => formatBytes(pkg.unpackedSize)],
    ["TypeScript declarations", (pkg) => pkg.typescript ? "Declared" : "Not declared"],
    ["ES modules", (pkg) => pkg.esm ? "Available" : "Not declared"],
    ["Node.js requirement", (pkg) => pkg.node || "Not specified"],
    ["License", (pkg) => pkg.license || "Not specified"],
  ];
  return (
    <section className="pi-panel pi-comparison">
      <div className="pi-panel-heading">
        <div>
          <p className="pi-eyebrow">Side by side / {packages.length} packages</p>
          <h2>Compare the trade-offs</h2>
        </div>
        <span className="pi-chart-caption">Facts, not a winner</span>
      </div>
      <div className="pi-table-scroll">
        <table>
          <thead>
            <tr><th scope="col">Signal</th>{packages.map((pkg) => <th scope="col" key={pkg.name + pkg.version}>{packageLabel(pkg)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(([label, getValue]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {packages.map((pkg) => <td key={pkg.name + pkg.version}>{getValue(pkg)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NewComponent(props) {
  const initialRequest = resolveHyperDartRequest(props);
  const initialQuery = initialRequest.query;
  const initialInterpretation = initialRequest.interpretation;
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [mode, setMode] = useState(initialInterpretation.intent);
  const [packageRefs, setPackageRefs] = useState(initialInterpretation.packageRefs);
  const [packages, setPackages] = useState([]);
  const [results, setResults] = useState([]);
  const [sourceKeywords, setSourceKeywords] = useState([]);
  const [sourceKeywordsLoaded, setSourceKeywordsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [lookupComplete, setLookupComplete] = useState(false);
  const [compareInput, setCompareInput] = useState("");
  const loadedRef = useRef(false);
  const initialNames = initialRequest.entityNames;
  const initialHostSignature = `${initialQuery}\u0000${initialNames.join("\u0000")}`;
  const hostSignatureRef = useRef(initialHostSignature);
  const [resolvedHostSignature, setResolvedHostSignature] = useState(initialHostSignature);

  const themeMode = getThemeMode(props.theme, props.UIOptions?.themeName);
  const discoveryTerm = useMemo(
    () => interpretQuery(submittedQuery, props.searchData).discoveryTerm,
    [submittedQuery, props.searchData],
  );

  const clearLookup = () => {
    setLoading(true);
    setError(null);
    setSearchError("");
    setPackages([]);
    setResults([]);
    setSourceKeywords([]);
    setSourceKeywordsLoaded(false);
    setLookupComplete(false);
  };

  useEffect(() => {
    const { query: hostQuery, entityNames: hostNames, interpretation } = resolveHyperDartRequest(props);
    const signature = `${hostQuery}\u0000${hostNames.join("\u0000")}`;
    if (signature === hostSignatureRef.current) return;
    hostSignatureRef.current = signature;
    clearLookup();
    setSubmittedQuery(hostQuery);
    setPackageRefs(interpretation.packageRefs);
    setMode(interpretation.intent);
    setResolvedHostSignature(signature);
  }, [props.searchData, props.searchQuery, props.queryProps]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (resolvedHostSignature !== hostSignatureRef.current) {
      return () => {
        active = false;
        controller.abort();
      };
    }
    const load = async () => {
      setLoading(true);
      setLookupComplete(false);
      try {
        if (mode === "empty") {
          return;
        }
        if (mode === "unsupported") {
          return;
        }
        if (mode === "discover" || mode === "alternatives") {
          const term = mode === "alternatives" && packageRefs[0]
            ? `${packageRefs[0]} alternatives`
            : discoveryTerm;
          if (!term) {
            setSearchError("Describe a package or development use case to search npm.");
            return;
          }
          const found = await searchPackages(term, { signal: controller.signal });
          if (!active) return;
          const filtered = mode === "alternatives"
            ? found.filter((result) => result.name !== packageRefs[0])
            : found;
          if (mode === "alternatives" && packageRefs[0]) {
            try {
              const source = await fetchJson(
                `https://registry.npmjs.org/${encodeURIComponent(packageRefs[0])}/latest`,
                { signal: controller.signal },
              );
              if (!source || typeof source !== "object" || Array.isArray(source)) {
                throw new Error("The npm registry returned invalid source package metadata.");
              }
              setSourceKeywords(Array.isArray(source.keywords)
                ? source.keywords.filter((keyword) => typeof keyword === "string") : []);
              setSourceKeywordsLoaded(true);
            } catch (sourceError) {
              if (!active || sourceError.name === "AbortError") return;
              setError({
                code: sourceError.code,
                message: sourceError.code === "not-found"
                  ? `Package ${packageRefs[0]} was not found on npm.`
                  : sourceError.message || "Could not load source package metadata.",
              });
              return;
            }
          }
          const fetched = await Promise.allSettled([
            ...filtered.map(async (result) => {
              try {
                return {
                  ...result,
                  weeklyDownloads: await fetchWeeklyDownloads(result.name, { signal: controller.signal }),
                };
              } catch (downloadError) {
                if (downloadError.name === "AbortError") throw downloadError;
                return { ...result, weeklyDownloads: null, weeklyError: downloadError.message };
              }
            }),
          ]);
          if (!active) return;
          const searchResults = fetched
            .filter((entry) => entry.status === "fulfilled")
            .map((entry) => entry.value);
          setResults(searchResults);
          const downloadFailures = searchResults.filter((result) => result.weeklyError).length;
          if (downloadFailures) {
            setSearchError(`Weekly download data is unavailable for ${downloadFailures} result${downloadFailures === 1 ? "" : "s"}.`);
          }
          if (filtered.length === 0) {
            setResults([]);
          }
        } else {
          if (packageRefs.length === 0) {
            setError({
              code: "unsupported",
              message: "No package name was detected. Try a package name or describe a development need.",
            });
            return;
          }
          const fetched = await fetchPackages(packageRefs.slice(0, 3), { signal: controller.signal });
          if (!active) return;
          setPackages(fetched.filter((entry) => entry.package).map((entry) => entry.package));
          const failures = fetched.filter((entry) => entry.error && entry.error.name !== "AbortError");
          if (failures.length) {
            const messages = failures.map(({ reference, error: requestError }) => (
              getPackageErrorMessageForDisplay(reference, requestError)
            ));
            setError({
              code: failures.length === 1 ? failures[0].error.code : "partial-failure",
              message: messages.join(" "),
            });
          }
        }
      } catch (requestError) {
        if (active && requestError.name !== "AbortError") {
          setError({
            code: requestError.code || "request-failed",
            message: requestError.message || "The npm registry request failed. Please try again.",
          });
        }
      } finally {
        if (active) {
          setLoading(false);
          setLookupComplete(true);
        }
      }
    };
    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [mode, packageRefs, submittedQuery, discoveryTerm, resolvedHostSignature]);

  useEffect(() => {
    if (!loading && !loadedRef.current) {
      loadedRef.current = true;
      props.messageHandlers?.componentLoaded?.();
    }
  }, [loading, props.messageHandlers]);

  const showAlternatives = (name) => {
    clearLookup();
    setPackageRefs([name]);
    setSubmittedQuery(name);
    setMode("alternatives");
  };

  const addComparison = (event) => {
    event.preventDefault();
    const reference = compareInput.trim();
    if (!reference || packageRefs.length >= 3) return;
    let nextReferences;
    try {
      nextReferences = addPackageReference(packageRefs, reference);
    } catch (validationError) {
      setSearchError(validationError.message);
      return;
    }
    if (nextReferences.length === packageRefs.length) {
      setSearchError("That package is already in the comparison.");
      return;
    }
    clearLookup();
    setPackageRefs(nextReferences);
    setMode("compare");
    setSubmittedQuery(nextReferences.join(" vs "));
    setCompareInput("");
    setSearchError("");
  };

  const chooseSearchResult = (name) => {
    clearLookup();
    setPackageRefs([name]);
    setSubmittedQuery(name);
    setMode("details");
  };

  const orderedPackages = mode === "alternatives" ? results.slice(0, 5) : packages;
  const isSidebar = (props.UIOptions?.format || props.format) === "sidebar";
  const heading = mode === "compare" ? "Choose your next dependency."
    : mode === "alternatives" ? "Find your next dependency."
      : mode === "discover" ? "Name the problem, not the package."
        : mode === "unsupported" ? "npm package questions only."
          : mode === "empty" ? "Find the right npm package."
          : "Know what you’re installing.";

  return (
    <main className={`pi-app pi-theme-${themeMode}${isSidebar ? " pi-sidebar" : ""}`}>
      <div className="pi-shell">
        <header className="pi-header">
          <a className="pi-brand" href="https://www.npmjs.com/" target="_blank" rel="noreferrer" aria-label="npm registry">
            <span className="pi-brand-mark">npm</span><span className="pi-brand-divider" /><span className="pi-brand-label">package intelligence</span>
          </a>
          <span className="pi-live-indicator"><i /> Live registry data</span>
        </header>

        <section className="pi-intro">
          <p className="pi-eyebrow">An npm decision desk</p>
          <h1>{heading}</h1>
          <p className="pi-intro-copy">A clearer read on versions, momentum and the trade-offs behind your next install. Search from HyperDart to see your package brief here.</p>
        </section>

        <div className="pi-result-heading">
          <div>
            <p className="pi-eyebrow">{mode === "alternatives" ? "A considered shortlist" : mode === "discover" ? "From the npm catalogue" : mode === "unsupported" ? "Unsupported query" : "Your package brief"}</p>
            <h2>{mode === "compare" ? "The comparison" : mode === "alternatives" ? "Alternatives worth a look" : mode === "discover" ? "Packages for your use case" : mode === "unsupported" ? "That isn’t an npm package question." : "Package details"}</h2>
          </div>
          <span className="pi-result-query">{submittedQuery || "Waiting for a HyperDart search"}</span>
        </div>

        {loading && (
          <div className="pi-loading" role="status"><span className="pi-spinner" /> Looking up live npm metadata and download trends…</div>
        )}
        {!loading && error && (
          <div className="pi-error" role="alert">
            <strong>{error.code === "not-found" ? "Package not found on npm." : "We couldn’t complete that lookup."}</strong>
            <span>{error.message}</span>
          </div>
        )}
        {!loading && searchError && <p className="pi-inline-note" role="status">{searchError}</p>}
        {!loading && mode === "discover" && results.length > 0 && (
          <section className="pi-discovery-list">
            {results.map((result, index) => {
              const matchedTerms = getQueryMatches(discoveryTerm, result);
              return (
                <article className="pi-discovery-item" key={result.name}>
                  <span className="pi-rank">{String(index + 1).padStart(2, "0")}</span>
                  <div className="pi-discovery-copy">
                    <h3>{result.name} <span>{result.version}</span></h3>
                    <p>{result.description}</p>
                    <div className="pi-fit-note">
                      <strong>Why it appeared</strong>
                      {matchedTerms.length > 0
                        ? (
                          <span>
                            Query terms in npm metadata:{" "}
                            <span className="pi-fit-matches">
                              {matchedTerms.map((term) => <em key={term}>{term}</em>)}
                            </span>
                          </span>
                        )
                        : <span>Ranked by npm search relevance; no query terms found in its description or keywords.</span>}
                    </div>
                    {result.keywords.length > 0 && (
                      <div className="pi-keywords">{result.keywords.slice(0, 4).map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
                    )}
                  </div>
                  <div className="pi-discovery-stats">
                    <span>{result.weeklyError ? "Downloads unavailable" : `${formatNumber(result.weeklyDownloads)} / wk`}</span>
                    <button type="button" onClick={() => chooseSearchResult(result.name)}>Open brief →</button>
                  </div>
                </article>
              );
            })}
            <p className="pi-source-note">Ranked by npm’s search relevance; install momentum is shown separately.</p>
          </section>
        )}

        {!loading && mode === "alternatives" && orderedPackages.length > 0 && (
          <section className="pi-alternative-list">
            {orderedPackages.map((pkg, index) => (
              <article className="pi-alternative" key={`${pkg.name}-${pkg.version}`}>
                <div className="pi-alternative-rank">{String(index + 1).padStart(2, "0")}</div>
                <div className="pi-alternative-content">
                  <div className="pi-alternative-title"><h3>{pkg.name}</h3><span className="pi-version">{pkg.version}</span></div>
                  <p>{pkg.description}</p>
                  <div className="pi-keywords">
                    {sharedKeywords(sourceKeywords, pkg.keywords).slice(0, 5).map((keyword) => <span key={keyword}>{keyword}</span>)}
                    {!sourceKeywordsLoaded && <span>Source keywords unavailable</span>}
                    {sourceKeywordsLoaded && sharedKeywords(sourceKeywords, pkg.keywords).length === 0 && <span>No shared keywords</span>}
                  </div>
                </div>
                <div className="pi-alternative-stats">
                  <strong>{pkg.weeklyError ? "—" : formatNumber(pkg.weeklyDownloads)}</strong>
                  <span>{pkg.weeklyError ? "Downloads unavailable" : "downloads / week"}</span>
                  <button type="button" onClick={() => chooseSearchResult(pkg.name)}>Compare / details →</button>
                </div>
              </article>
            ))}
            <p className="pi-source-note">Shortlist follows npm search relevance. Shared keywords and weekly downloads help you evaluate fit; they are not a compatibility guarantee.</p>
          </section>
        )}

        {!loading && mode !== "discover" && mode !== "alternatives" && orderedPackages.length > 0 && (
          <>
            {mode === "compare" && (
              <div className="pi-compare-tools">
                <p>Compare up to three packages. Add an exact version with <code>name@version</code>.</p>
                <form onSubmit={addComparison}>
                  <input
                    aria-label="Package name to compare"
                    onChange={(event) => setCompareInput(event.target.value)}
                    placeholder="Add a package, e.g. koa"
                    value={compareInput}
                  />
                  <button type="submit" disabled={packageRefs.length >= 3 || !compareInput.trim()}>+ Add</button>
                </form>
              </div>
            )}
            {mode === "compare" ? (
              <>
                <VersionDifferencePanel packages={orderedPackages} />
                <ComparisonTable packages={orderedPackages} />
                <DownloadChart packages={orderedPackages} />
                <div className="pi-takeaways">
                  <p className="pi-eyebrow">What the data says</p>
                  <h2>Signals, not verdicts.</h2>
                  <div className="pi-takeaway-grid">
                    {orderedPackages.map((pkg) => (
                    <p key={pkg.name + pkg.version}><strong className="pi-takeaway-package">{packageLabel(pkg)}</strong> has {formatNumber(pkg.weeklyDownloads)} weekly downloads and a {formatBytes(pkg.unpackedSize)} unpacked footprint.</p>
                    ))}
                  </div>
                  <p className="pi-source-note">Download volume and unpacked size are context, not a measure of quality or runtime performance.</p>
                </div>
                <div className={`pi-card-grid pi-card-grid-${orderedPackages.length}`}>
                  {orderedPackages.map((pkg) => <PackageCard key={pkg.name + pkg.version} pkg={pkg} onAlternatives={showAlternatives} compact={isSidebar} />)}
                </div>
              </>
            ) : (
              <div className="pi-card-grid">
                {orderedPackages.map((pkg) => <PackageCard key={pkg.name + pkg.version} pkg={pkg} onAlternatives={showAlternatives} compact={isSidebar} />)}
              </div>
            )}
          </>
        )}

        {!loading && mode === "empty" && (
          <div className="pi-empty">
            <span className="pi-empty-mark">↗</span>
            <h3>Search HyperDart to get started.</h3>
            <p>Ask about an npm package, compare up to three packages, find alternatives, or describe a development use case.</p>
          </div>
        )}
        {!loading && mode === "unsupported" && (
          <div className="pi-empty" role="status">
            <span className="pi-empty-mark">?</span>
            <h3>Unsupported or invalid question</h3>
            <p>I can help with npm package details, comparisons, alternatives, and package discovery. Try “npm express”, “compare express vs fastify”, or “library for parsing CSV”.</p>
          </div>
        )}
        {!loading && lookupComplete && !error
          && (mode === "discover" || mode === "alternatives") && results.length === 0 && (
          <div className="pi-empty" role="status">
            <span className="pi-empty-mark">↗</span>
            <h3>{mode === "alternatives" ? "No alternatives found." : "No npm packages matched that use case."}</h3>
            <p>{mode === "alternatives"
              ? "npm did not return candidates for this package. Try another package or a more specific search."
              : "Try a shorter or more specific development requirement."}</p>
          </div>
        )}

        <footer className="pi-footer">
          <span>Numbers from the npm registry &amp; npm downloads API.</span>
          <a href="https://docs.npmjs.com/cli/v10/commands/npm-view" target="_blank" rel="noreferrer">About package metadata ↗</a>
        </footer>
      </div>
    </main>
  );
}

export default NewComponent;
