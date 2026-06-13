import React from 'react';
import { Download } from 'lucide-react';
import type { RealizedGain, YearSummary } from '../utils/types';

interface LedgerTableProps {
  realizedGains: RealizedGain[];
  summary: YearSummary;
  exemptionRemaining: number;
  year: number;
}

function formatEur(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}€${Math.abs(amount).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function downloadCsv(gains: RealizedGain[], year: number, summary: YearSummary) {
  const header = 'Asset;Acquired;Original price;Snapshot price;Sell price;Sell date;Qty;Gain / Loss;Tax owed\n';
  const rows = gains
    .filter((g) => g.gainEur !== 0)
    .map((g) => {
      const asterisk = g.hasSnapshotAvailable ? ' *' : '';
      const origPrice = g.originalUnitPriceEur != null ? g.originalUnitPriceEur.toFixed(2) : '-';
      const fotoPrice = g.fotomomentUnitPriceEur != null ? g.fotomomentUnitPriceEur.toFixed(2) : '-';
      return `${g.assetName} (${g.symbol});${formatDate(g.purchaseDate)}${asterisk};${origPrice};${fotoPrice};${g.sellUnitPriceEur.toFixed(2)};${formatDate(g.sellDate)};${g.quantity};${g.gainEur.toFixed(2)};${g.taxLiabilityEur.toFixed(2)}`;
    })
    .join('\n');

  const summaryRows = `\n\nTotal Gains;;;;;;${summary.totalMeerwaarde.toFixed(2)};\nTotal Losses;;;;;;${(-summary.totalVerlies).toFixed(2)};\nNet Gain;;;;;;${(summary.totalMeerwaarde - summary.totalVerlies).toFixed(2)};\nAnnual Exemption;;;;;;${(-summary.vrijstellingGebruikt).toFixed(2)};\nTaxable Gain;;;;;;${summary.belastbareMeerwaarde.toFixed(2)};\nCapital Gains Tax Owed (10%);;;;;;${summary.belastingVerschuldigd.toFixed(2)};`;

  const blob = new Blob(['\uFEFF' + header + rows + summaryRows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `capital-gains-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LedgerTable({
  realizedGains,
  summary,
  exemptionRemaining,
  year,
}: LedgerTableProps) {
  const hasGains = realizedGains.length > 0;
  const netGain = hasGains ? summary.totalMeerwaarde - summary.totalVerlies : 0;

  return (
    <div className="rounded-lg border bg-card shadow-sm mb-6">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold">Sold investments</h2>
          <p className="text-sm text-muted-foreground">
            Realized gains in tax year {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasGains && (
            <button
              onClick={() => downloadCsv(realizedGains, year, summary)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-3">Asset</th>
              <th className="text-left font-medium p-3">Acquired</th>
              <th className="text-right font-medium p-3">Original price</th>
              <th className="text-right font-medium p-3">Snapshot price</th>
              <th className="text-right font-medium p-3">Sell price</th>
              <th className="text-left font-medium p-3">Sell date</th>
              <th className="text-right font-medium p-3">Qty</th>
              <th className="text-right font-medium p-3">Gain / Loss</th>
              <th className="text-right font-medium p-3">Tax owed</th>
            </tr>
          </thead>
          <tbody>
            {!hasGains ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  No realized gains in {year}.
                </td>
              </tr>
            ) : (
              realizedGains.map((gain) => {
                const isGain = gain.gainEur >= 0;
                const hasFotomoment = gain.originalUnitPriceEur != null && gain.fotomomentUnitPriceEur != null;
                const isOrigUsed = hasFotomoment && gain.originalUnitPriceEur! >= gain.fotomomentUnitPriceEur!;
                return (
                  <tr key={gain.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium truncate max-w-[280px]">
                        {gain.symbol}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {gain.assetName}
                        {gain.accountName && (
                          <span className="ml-1 opacity-60">· {gain.accountName}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(gain.purchaseDate)}
                    </td>
                    <td className={`p-3 text-right ${hasFotomoment ? (isOrigUsed ? 'font-semibold text-foreground' : 'text-muted-foreground/50') : 'text-muted-foreground'}`}>
                      {gain.originalUnitPriceEur != null ? formatEur(gain.originalUnitPriceEur) : '-'}
                    </td>
                    <td className={`p-3 text-right ${hasFotomoment ? (!isOrigUsed ? 'font-semibold text-foreground' : 'text-muted-foreground/50') : 'text-muted-foreground'}`}>
                      {gain.fotomomentUnitPriceEur != null ? formatEur(gain.fotomomentUnitPriceEur) : '-'}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {formatEur(gain.sellUnitPriceEur)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(gain.sellDate)}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {gain.quantity.toLocaleString('nl-BE', { maximumFractionDigits: 4 })}
                    </td>
                    <td className={`p-3 text-right font-medium ${isGain ? 'text-green-600' : gain.gainEur < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {formatEur(gain.gainEur)}
                    </td>
                    <td className={`p-3 text-right ${isGain ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {formatEur(gain.taxLiabilityEur)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {hasGains && (
            <tfoot className="whitespace-nowrap">
              <tr className="border-t-2 border-gray-300 font-semibold text-sm">
                <td colSpan={7} className="p-3 text-right">Total Gains</td>
                <td className="p-3 text-right text-green-600">
                  {formatEur(summary.totalMeerwaarde)}
                </td>
                <td className="p-3 text-right text-muted-foreground">-</td>
              </tr>
              {summary.totalVerlies > 0 && (
                <tr className="font-medium text-sm">
                  <td colSpan={7} className="p-3 text-right text-muted-foreground">Total Losses</td>
                  <td className="p-3 text-right text-red-600">
                    {formatEur(-summary.totalVerlies)}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">-</td>
                </tr>
              )}
              <tr className="border-t border-gray-200 font-semibold text-sm">
                <td colSpan={7} className="p-3 text-right">Net Gain</td>
                <td className={`p-3 text-right font-medium ${netGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatEur(netGain)}
                </td>
                <td className="p-3 text-right text-muted-foreground">-</td>
              </tr>
              {summary.vrijstellingGebruikt > 0 && (
                <tr className="font-medium text-sm">
                  <td colSpan={7} className="p-3 text-right text-muted-foreground">Annual Exemption</td>
                  <td className="p-3 text-right text-green-600">
                    {formatEur(-summary.vrijstellingGebruikt)}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">-</td>
                </tr>
              )}
              <tr className="border-t border-gray-200 font-semibold text-sm">
                <td colSpan={7} className="p-3 text-right">Taxable Gain</td>
                <td className="p-3 text-right">{formatEur(summary.belastbareMeerwaarde)}</td>
                <td className="p-3 text-right">-</td>
              </tr>
              <tr className="border-t-2 border-gray-300 font-bold text-sm bg-muted/20">
                <td colSpan={7} className="p-3 text-right">Capital Gains Tax Owed (10%)</td>
                <td className="p-3 text-right" />
                <td className="p-3 text-right text-base">
                  {formatEur(summary.belastingVerschuldigd)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
