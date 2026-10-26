# npm Package Intelligence Resource

[`resource.json`](./resource.json) describes the structured request HyperDart can
derive for this component. The user's original search remains available through
the query in `searchData`; the structured request is supplied through
`queryProps`.

## Query shape

- `type`: `query` for named package details/comparisons or `list` for discovery.
- `filters.intent`: `details`, `compare`, `alternatives`, or `discover`.
- `filters.packages`: up to three npm package names or version-qualified package
  references.
- `filters.packageName`: the single package for details or alternatives.
- `filters.useCase`: the development need for package discovery.
- `features`: package information to inspect, such as metadata, versions,
  downloads, compatibility, or alternatives.
- `entities.collections`: `NPM_PACKAGES`, used to resolve mentioned package
  names.

The component prioritizes the current raw `searchQuery` prop when supplied,
then falls back to `searchData[0].query` and these structured fields. It only
uses package entities from the `searchData` record whose query matches that
current raw query, so entities from an earlier search cannot replace it. The
local `searchData.json` file is a sandbox fixture, not a production data source.
