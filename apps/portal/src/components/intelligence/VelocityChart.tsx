"use client";

interface VelocityDataPoint {
  score_date: string;
  velocity: number;
  percentile: number;
  lifecycle: string;
}

interface VelocityChartProps {
  data: VelocityDataPoint[];
  height?: number;
  showLabels?: boolean;
}

const LIFECYCLE_COLOR: Record<string, string> = {
  emerging: "#4D8EFF",
  peaking: "#ef4444",
  cooling: "#c07840",
  evergreen: "#8B9A6B",
  dormant: "#666",
};

export default function VelocityChart({
  data,
  height = 64,
  showLabels = false,
}: VelocityChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="font-mono text-[10px] text-text-muted/30">no velocity data</p>
      </div>
    );
  }

  const maxVelocity = Math.max(...data.map((d) => d.velocity), 1);
  const barWidth = Math.max(4, Math.min(12, Math.floor(200 / data.length)));
  const gap = 2;
  const svgWidth = data.length * (barWidth + gap) - gap;

  return (
    <div className="space-y-1">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${svgWidth} ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        {data.map((point, i) => {
          const barHeight = Math.max(2, (point.velocity / maxVelocity) * (height - 4));
          const x = i * (barWidth + gap);
          const y = height - barHeight;
          const color = LIFECYCLE_COLOR[point.lifecycle] ?? LIFECYCLE_COLOR.dormant;

          return (
            <g key={point.score_date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={1}
                fill={color}
                opacity={0.6}
              />
              {/* Hover target */}
              <title>
                {point.score_date}: {point.velocity.toFixed(1)} velocity ({Math.round(point.percentile)}th pctl) — {point.lifecycle}
              </title>
            </g>
          );
        })}
      </svg>

      {showLabels && data.length > 1 && (
        <div className="flex justify-between">
          <span className="font-mono text-[9px] text-text-muted/30">
            {data[0].score_date.slice(5)}
          </span>
          <span className="font-mono text-[9px] text-text-muted/30">
            {data[data.length - 1].score_date.slice(5)}
          </span>
        </div>
      )}
    </div>
  );
}
