'use client';

import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDate, formatNumber, formatValue } from '@/lib/format';
import { hasNote } from '@/lib/metrics';
import type { MeasurementRow, MetricRow } from '@/lib/database.types';

type ChartPoint = {
  name: string;
  value: number;
  iso: string;
  note: string | null;
  hasNote: boolean;
};

/** Verlaufskurve einer Metrik (Recharts). `series` = Tagesbestwerte, aufsteigend nach Datum. */
export function TrendChart({ metric, series }: { metric: MetricRow; series: MeasurementRow[] }) {
  // Touch-Geräte (kein Hover) zeigen den Tooltip per Tap statt per Maus-Hover.
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setCoarsePointer(window.matchMedia('(hover: none)').matches);
  }, []);

  if (series.length === 0) return null;

  const data: ChartPoint[] = series.map((m) => ({
    name: formatDate(m.tested_at),
    value: m.value,
    iso: m.tested_at,
    note: hasNote(m.note) ? m.note.trim() : null,
    hasNote: hasNote(m.note),
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#222A33" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#8B97A7', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#222A33' }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: '#8B97A7', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => formatNumber(Number(v), metric.unit)}
          />
          <Tooltip
            content={<ChartTooltip unit={metric.unit} />}
            cursor={{ stroke: '#3B82F6', strokeWidth: 1 }}
            trigger={coarsePointer ? 'click' : 'hover'}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={renderDot}
            activeDot={{ r: 6, fill: '#3B82F6', stroke: '#161B22', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type DotProps = {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: ChartPoint;
};

/** Punkte mit Notiz größer + abgesetzt zeichnen, damit man sie auf einen Blick erkennt. */
function renderDot({ cx, cy, index, payload }: DotProps) {
  const key = `dot-${index}`;
  if (cx == null || cy == null) return <g key={key} />;
  if (payload?.hasNote) {
    return (
      <circle key={key} cx={cx} cy={cy} r={5} fill="#3B82F6" stroke="#161B22" strokeWidth={2} />
    );
  }
  return <circle key={key} cx={cx} cy={cy} r={3} fill="#3B82F6" />;
}

type TooltipProps = {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  unit: string;
};

function ChartTooltip({ active, payload, unit }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="max-w-[12rem] rounded-lg border border-line bg-background-elevated px-3 py-2 text-xs shadow-card">
      <div className="text-foreground-muted">{formatDate(point.iso)}</div>
      <div className="stat-number text-sm">{formatValue(point.value, unit)}</div>
      {point.note && (
        <div className="mt-1 border-t border-line pt-1 leading-snug text-foreground-muted">
          {point.note}
        </div>
      )}
    </div>
  );
}
