# Meerwaardebelasting — Belgian Capital Gains Tax Calculator

A [WealthFolio](https://wealthfolio.app) addon that calculates Belgian capital gains tax (meerwaardebelasting) starting from 2026.

## Features

- **FIFO Engine** — Matches sells against buys in chronological order per account, computing realized gains/losses.
- **Fotomoment Valuation** — Automatically fetches 2025-12-31 snapshot prices. For assets held before that date, the cost basis is the higher of the original purchase price or the snapshot price (`Math.max(original, snapshot)`), which may reduce but never increase the taxable gain.
- **Multi-Account** — Processes all accounts, tracks lots separately per account.
- **Multi-Currency** — Converts all transactions to EUR using historical exchange rates.
- **Year Selector** — Switch between tax years (2026 and later) — calculations run automatically.
- **Summary Cards** — At a glance: annual exemption (€10,000), taxable gain, capital gains tax owed (10%).
- **Detail Table** — Per-lot breakdown showing original price, snapshot valuation price, exit price, quantity, gain/loss, and tax owed.
- **CSV Export** — Download the table for your own records.

## Structure

```
src/
├── addon.tsx              # Entry point — sidebar + route registration
├── pages/
│   └── MeerwaardePage.tsx # Main page with year selector and results
├── components/
│   ├── LedgerTable.tsx    # Realized gains table + CSV download
│   └── SummaryCards.tsx   # Tax summary cards
├── hooks/
│   └── useTaxData.ts      # React hook — fetches data, runs engine
└── utils/
    ├── constants.ts       # Tax rate, exemption, fotomoment date
    ├── fifoEngine.ts      # Core FIFO engine + tax calculation
    ├── types.ts           # TypeScript interfaces
    └── utils.ts           # Format helpers (EUR, date)
```

## Building

```bash
pnpm bundle       # Create the package for WealthFolio
```

## Development

```bash
pnpm install
pnpm dev:server   # Start dev server
pnpm type-check   # Run TypeScript checks
```
