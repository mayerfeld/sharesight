# Portfolio Desk

A browser and Windows portfolio tracker inspired by portfolio reporting tools. Built with Electron and React. This project is independent of Sharesight and the named brokers.

## Use in a browser

No installation is required. Open the hosted site in a current Chrome, Edge, Firefox or Safari browser. CSV imports, reports, exports and backup/restore run entirely in the browser; no brokerage credentials or backend server are needed.

The browser and Windows versions use separate local storage. To move a portfolio, select **Full backup** in the old app, then **Restore backup** in the new one. Browsers do not automatically sync portfolios between devices. Clearing site data, private browsing, or removing a browser profile can remove local holdings; keep backups outside the browser.

After the first successful visit over HTTPS, the app caches its shell for offline use. Chrome and Edge may offer an optional **Install app** button for a shortcut and a standalone window; this is optional. New versions show **Update app**, which reloads the app after you save open edits. Saved portfolio data remains in local storage.

### Host with GitHub Pages

The **Browser app** GitHub Actions workflow tests and builds on pushes to `main`, then deploys `dist/` to Pages. In the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** once. If deployment ran before Pages was enabled, rerun the Browser app workflow from the Actions tab. Use the website URL reported by the successful deployment; for this repository the expected address is `https://mayerfeld.github.io/sharesight/`.

Pages serves the app publicly; financial data remains in your browser and is never part of a deployment. Repository plan/visibility restrictions can affect Pages availability. Other static HTTPS hosting also works: upload the contents of `dist/` with `index.html` at the site's root or chosen subdirectory. Do not open `dist/index.html` directly from disk in a browser; use a web server.

For a local browser build:

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run build
npm run preview
```

Offline caching requires HTTPS or a trusted local development origin and is enabled only in production builds. Development uses `npm run dev`.

## Use on Windows

Requires Windows 10/11 x64. Install Node.js 24 LTS, open a terminal in this folder, then:

```powershell
npm ci
npm run desktop
```

Build a portable executable with `npm run dist:portable` (runs without installing), or build the Windows installer with `npm run dist:win`. The installer is written to `release/Portfolio Desk Setup 0.1.0.exe`. The Windows GitHub Actions workflow also builds and uploads the installer on push or manual dispatch. Builds are unsigned; Windows may show an unknown publisher prompt. A signing certificate is needed for a signed release. The installer and native Windows runtime must be tested on a Windows PC before a public release.

## Portfolio workflow

The first launch shows clearly marked illustrative USD holdings. Select **Start my portfolio**, add holdings manually, or select **Import data** to import broker transaction history.

- **Overview:** market value, unrealised gain, dividends, realised average-cost gain for imported trades, and asset allocation.
- **Holdings:** automatic scheduled quotes where supported, with quote dates and stale-data labels. The pencil sets a manual override; Use automatic quote restores the feed for that security.
- **Transactions:** review all imported trades and export a portable trade CSV.
- **Reports:** holdings report and Print / save PDF.
- **Full backup / Restore backup:** export/restore the selected portfolio. **Back up all portfolios** exports the entire workspace. Restoring an all-portfolios backup replaces the workspace after confirmation.

Data is stored locally in the desktop application's profile. Browser development mode has its own separate local storage. Backups contain financial information in plain text; keep them somewhere private. Back up before reinstalling, replacing a portfolio, or changing import sources.

## Multiple portfolios

Use the portfolio selector in the sidebar (or the top selector on mobile) to switch portfolios. **New** creates an empty named portfolio; the pencil renames it. Deleting a portfolio requires confirmation and keeps the others. The last portfolio cannot be deleted; reset it instead. Existing single-portfolio data migrates locally on the first save; the original storage entry is retained for recovery. Portfolios have separate holdings, trades, currency, quote overrides, cached market data, and reinvestment settings. They are local to the browser/profile and do not sync between devices.

## Automatic quotes, dividends and assumed reinvestment

No API key is needed. The Browser app GitHub workflow refreshes a public Yahoo Finance market feed on deployment and on a weekday half-hour schedule during the US trading window. Nasdaq public data adds dividend payment dates where available. GitHub schedules and public providers are best effort: quotes are scheduled and may be delayed, stale, rate-limited or unavailable. Source quote timestamps are displayed; failures retain cached/manual/imported prices instead of substituting zero. No actual broker trades are placed.

The feed builds a general US listing catalog from Nasdaq Trader's Nasdaq and other-exchange directories, including US stocks and ETFs. Common ETFs, S&P 500 stocks and a broad marine-transportation group (including TRMD and DHT) get priority dividend/history refreshes. Bulk quotes cover the listing catalog; additional historical dividend coverage rotates in batches. A ticker may have a quote while dividend history is still pending; the app warns that income totals are incomplete. Provider coverage is not guaranteed for every security, preferred share, derivative, foreign listing or delisted ticker. Quotes are applied only when the quote currency matches the portfolio currency. User account data and holdings are never sent to GitHub or added to the public catalog; public categories define the feed. Production feed files and caches are ignored by Git.

Automatic income uses shares held **before the ex-dividend date**. Assume dividends are reinvested is enabled by default. Estimates compound fractional units using a historical payment-date closing price; if payment dates are unavailable, they use the ex-date close and are explicitly marked as estimates. When a recent prior close is used, it is an approximation. Missing historical prices recognise estimated cash income without inventing reinvested units. Imported broker dividends and reinvestments take precedence over generated estimates. Generated estimates stay separate from the imported transaction ledger; importing actual history recalculates the estimates. They exclude withholding taxes, fees, broker price averaging and DRIP rounding. Dividend amounts and resulting units are therefore not broker-confirmed balances.

Public split events adjust holdings and preserve cost basis. The collector restores Yahoo split-adjusted historical prices/dividends to contemporaneous values before the position replay. Coverage depends on the available public history (initially up to ten years). Corporate actions other than ordinary splits remain unsupported. Snapshot portfolios without dated trades can receive quotes but cannot establish historical dividend eligibility.

Run `npm run market:refresh` in a network environment that permits Yahoo Finance, Nasdaq, Nasdaq Trader and the public S&P 500 listing source. It writes ignored `public/market/` feed files and `.market-cache/`. The Actions workflow caches prior data and publishes the feed with the app. If all sources fail, the refresh command exits nonzero; deployment can still publish the app, which visibly reports missing quotes. A successful app deployment alone is not proof a particular ticker has valid market data. Local tests use clearly synthetic provider payloads; tests never commit uploaded financial files.

## Repeated imports and portability

1. Export **transaction history as CSV, XLS, or XLSX** from Fidelity, E*TRADE, Vanguard, or Sharesight. Use the broker's history/activity export, rather than a PDF statement or positions-only export.
2. Select **Import data**, choose your file and worksheet (for Excel workbooks with multiple sheets), choose a source, and give the account a consistent name. US exports normally use month/day/year; day/month/year is available for other exports. A CSV account column takes precedence over the account name you enter.
3. Review new transactions, duplicates, and rejected rows. No data changes until you confirm. Invalid rows are excluded only after you explicitly acknowledge them. Missing purchase history, currency mismatches and changed stable transaction IDs block the import.
4. Import future exports with the **same account name and currency**. Overlapping rows are matched by stable transaction ID when available, otherwise by account, date, action, symbol, quantity, price, fees and cash amount. Multiple identical fills in one file are retained, and their occurrence counts are compared on reimport. Reuse the same exporter and source to ensure consistency.
5. Export **trades CSV** for a portable dataset that can be imported again into an empty portfolio or merged without adding matching trades. Use **Full backup** for exact restoration including manually updated prices and settings.

Without stable IDs, two genuinely distinct trades with exactly the same fields on the same date cannot be distinguished across separate partial exports. Prefer a complete or consistently overlapping history and review the duplicate count. Corrected trades without IDs will appear as new trades; use a corrected complete dataset in an empty portfolio or restore a backup rather than merging corrections. The trade template provides an `id` column for durable identities. Switching between a broker export and a different export format can change identity fields; use the app's trade CSV or full backup for migration.

To load a corrected complete trade dataset, export a full backup, choose **Reset portfolio**, then import the corrected history into the empty portfolio. Reset requires confirmation.

Snapshot holdings CSV is also supported using `symbol,name,sector,quantity,cost,price,dividends`. It **replaces** a snapshot or transaction portfolio; it cannot be merged as transaction history. Export a full backup before replacing data. Snapshot CSV export does not preserve transaction history.

### Common CSV layouts supported

| Source | Example recognised columns |
| --- | --- |
| Fidelity | Run Date, Action, Symbol, Description, Quantity, Price ($), Commission ($), Fees ($), Amount ($) |
| E*TRADE | TransactionDate / Transaction Date, TransactionType / Transaction Type, Symbol, Description, Quantity, Price, Commission, Amount |
| Vanguard | Trade Date, Transaction Description / Transaction Type, Symbol, Share Price, Shares, Net Amount |
| Sharesight | Trade Date / Date, Trade Type / Type, Code / Investment Code, Quantity / Qty, Price, Brokerage, Currency / Instrument Currency |
| Portfolio Desk | id,date,action,symbol,name,quantity,price,fees,amount,currency,account,source |

These mappings are tested using synthetic fixtures, not your actual broker files. Brokers have multiple export layouts. Unrecognised formats produce errors for review rather than an automatic successful import. CSV and Excel preambles, quoted descriptions, signed numbers, and selectable date order are handled. Excel numeric dates are interpreted using the workbook’s date system. `.xls` and `.xlsx` imports are read locally, including older HTML/XML exports saved as `.xls`; formulas and macros are never executed. Formula cells must contain saved values, and password-protected workbooks must first be saved as an unprotected copy. The 10 MB file limit also applies to Excel; individual worksheets are limited to 50,000 rows, 256 columns, and 1,000,000 cells. Select one worksheet per import. Sharesight All trades reports are supported, including date-formatted text cells, `Qty`, instrument currency, and report total rows. Use the `Combined` worksheet to include all trades; the grouping worksheets contain subsets of the same data. Sheets use the same broker column mappings and duplicate checks as CSV. Download a trade template in the importer for the canonical format.

Supported actions: buys, sales, dividends and reinvestments. For reinvestments, a separate same-date dividend for the same account/security is matched against reinvested income to avoid counting it twice. If broker dividend and reinvestment dates differ, reconcile these before import. Unsupported cash transactions, options, shorts, transfers, non-split corporate actions, cancellations, capital-gain distributions and returns of capital require reconciliation outside this version. Only include supported equity, fund and ETF transactions. Import full purchase history before sales; same-date rows retain their file order.

All amounts must already be in the reporting currency (USD by default); there is no FX conversion. Realised gains use average cost including fees, not tax lots/FIFO, and are **not tax reports**. Cash balances, deposits/withdrawals, historical charts, annualised and money-weighted performance, brokerage connections and streaming real-time data are not implemented. Browser app updates preserve saved portfolios.

## Develop and test

Node.js 24 LTS is recommended. Use the existing checkout; cloud tasks are already isolated and do not require a Git worktree.

```sh
npm ci
npm test
npm run build
npm run dev
```

On Linux, the browser development workflow does not need the Electron native binary. For a restricted cloud home directory:

```sh
export npm_config_cache=/workspace/.cache/npm
export XDG_CACHE_HOME=/workspace/.cache
export ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm test
npm run build
npm run dev -- --port 5173
```

Cross-build a portable Windows executable on Linux with the supported network proxy and writable download cache:

```sh
ELECTRON_GET_USE_PROXY=1 ELECTRON_BUILDER_COMPRESSION_LEVEL=1 npm run dist:portable -- --config.electronDownload.cache=/workspace/.cache/electron
```

Use your environment's configured trusted CA bundle when needed (`NODE_EXTRA_CA_CERTS`); never disable TLS or checksum validation. The NSIS installer cross-build was attempted here but is blocked by an unusable Wine toolset (missing ntdll.dll). Build the installer on Windows with `npm run dist:win`; the portable target avoids this dependency. Windows native UI/installer execution requires Windows. `signAndEditExecutable` is disabled for unsigned cross-builds; supply signing configuration and enable editing/signing when preparing a signed release.
