import { useId, useMemo, useState } from "react";
import { formatCompactMoney, formatMoney } from "../lib/format";

export type SeriesPoint = {
  label: string;
  value: number;
  hint?: string;
};

/* -------------------------------------------------------------------------- */
/*  Vertical bar chart                                                         */
/* -------------------------------------------------------------------------- */

export function BarChart({
  data,
  height = 240,
  emptyLabel = "No data available yet",
  valueFormatter = formatCompactMoney,
}: {
  data: SeriesPoint[];
  height?: number;
  emptyLabel?: string;
  valueFormatter?: (value: number) => string;
}) {
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);

  const width = 640;
  const padding = { top: 18, right: 10, bottom: 28, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxValue = useMemo(
    () => Math.max(...data.map((item) => item.value), 0),
    [data]
  );

  const hasData = maxValue > 0;

  const ticks = useMemo(() => {
    if (!hasData) return [];

    return Array.from({ length: 4 }, (_, index) => (maxValue / 3) * (3 - index));
  }, [hasData, maxValue]);

  if (data.length === 0 || !hasData) {
    return (
      <div
        className="loading-block"
        style={{ height, color: "var(--text-muted)" }}
      >
        {emptyLabel}
      </div>
    );
  }

  const slot = plotWidth / data.length;
  const barWidth = Math.max(10, Math.min(38, slot * 0.55));

  return (
    <div className="chart-frame">
      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Bar chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>

          <linearGradient id={`${gradientId}-dim`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ede9fe" />
            <stop offset="100%" stopColor="#ddd6fe" />
          </linearGradient>
        </defs>

        <g className="chart-plot">
          {ticks.map((tick) => {
            const y = padding.top + plotHeight - (tick / maxValue) * plotHeight;

            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : "3 4"}
                />

                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={10.5}
                  fill="#64748b"
                >
                  {valueFormatter(tick)}
                </text>
              </g>
            );
          })}

          {data.map((point, index) => {
            const barHeight = maxValue > 0 ? (point.value / maxValue) * plotHeight : 0;
            const x = padding.left + slot * index + (slot - barWidth) / 2;
            const y = padding.top + plotHeight - barHeight;
            const isActive = active === index;

            return (
              <g key={`${point.label}-${index}`}>
                <rect
                  x={padding.left + slot * index}
                  y={padding.top}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                />

                <rect
                  className="bar-column"
                  x={x}
                  y={barHeight > 0 ? y : padding.top + plotHeight - 2}
                  width={barWidth}
                  height={Math.max(barHeight, barHeight > 0 ? 3 : 2)}
                  rx={Math.min(5, barWidth / 2.6)}
                  fill={
                    active === null || isActive
                      ? `url(#${gradientId})`
                      : `url(#${gradientId}-dim)`
                  }
                  onMouseEnter={() => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                >
                  <title>
                    {`${point.label}: ${point.hint ?? valueFormatter(point.value)}`}
                  </title>
                </rect>

                {isActive ? (
                  <text
                    x={x + barWidth / 2}
                    y={Math.max(y - 8, 12)}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="#1e293b"
                  >
                    {point.hint ?? valueFormatter(point.value)}
                  </text>
                ) : null}

                <text
                  x={padding.left + slot * index + slot / 2}
                  y={height - 9}
                  textAnchor="middle"
                  fontSize={11}
                  fill={isActive ? "#1e293b" : "#64748b"}
                  fontWeight={isActive ? 600 : 400}
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Donut chart                                                                */
/* -------------------------------------------------------------------------- */

export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

export function DonutChart({
  slices,
  centerValue,
  centerLabel,
  size = 190,
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = size / 2 - 16;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(
    () =>
      slices.map((slice, index) => {
        const before = slices
          .slice(0, index)
          .reduce((sum, item) => sum + item.value, 0);

        return {
          label: slice.label,
          color: slice.color,
          dash: total > 0 ? (slice.value / total) * circumference - 2 : 0,
          offset: total > 0 ? (before / total) * circumference : 0,
        };
      }),
    [slices, total, circumference]
  );

  if (total <= 0) {
    return (
      <div
        className="loading-block"
        style={{ height: size, color: "var(--text-muted)" }}
      >
        Nothing to chart yet
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
    >
      <svg width={size} height={size} role="img" aria-label="Donut chart">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#eef2f7"
            strokeWidth={20}
          />

          {segments.map((segment, index) => (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={20}
              strokeDasharray={`${Math.max(segment.dash, 0)} ${circumference}`}
              strokeDashoffset={-segment.offset}
              strokeLinecap="butt"
            >
              <title>{`${segment.label}: ${formatMoney(slices[index].value)}`}</title>
            </circle>
          ))}
        </g>

        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          fontSize={19}
          fontWeight={600}
          fill="#1e293b"
        >
          {centerValue}
        </text>

        <text
          x={size / 2}
          y={size / 2 + 17}
          textAnchor="middle"
          fontSize={11.5}
          fill="#64748b"
        >
          {centerLabel}
        </text>
      </svg>

      <ul className="legend" style={{ justifyContent: "center", marginTop: 0 }}>
        {slices.map((slice) => (
          <li key={slice.label} className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: slice.color }}
            />
            <span>
              {slice.label}
              <span style={{ color: "var(--text-muted)" }}>
                {" Â· "}
                {total > 0
                  ? Math.round((slice.value / total) * 100)
                  : 0}
                %
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Progress list (ranked bars)                                                */
/* -------------------------------------------------------------------------- */

export function ProgressList({
  items,
}: {
  items: { label: string; value: number; display: string; color?: string }[];
}) {
  const max = Math.max(...items.map((item) => item.value), 0);

  if (items.length === 0) {
    return (
      <div className="loading-block" style={{ padding: "32px 16px" }}>
        No data available yet
      </div>
    );
  }

  return (
    <div className="progress-list">
      {items.map((item) => (
        <div key={item.label} className="progress-row">
          <div className="progress-head">
            <span className="name truncate">{item.label}</span>
            <span className="value">{item.display}</span>
          </div>

          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: max > 0 ? `${Math.max((item.value / max) * 100, 2)}%` : "0%",
                background: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
