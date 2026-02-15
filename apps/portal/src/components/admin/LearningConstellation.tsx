"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  forceSimulation,
  forceCenter,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import { scaleLinear } from "d3-scale";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Learning {
  id: string;
  title: string;
  department: string;
  category: string;
  confidence: number;
  decay_weight: number;
  usage_count: number;
  success_count: number;
  status: string;
  discovered_at: string;
  last_validated_at: string | null;
  admin_notes: string | null;
  source_projects: string[] | null;
}

interface Node extends SimulationNodeDatum {
  id: string;
  learning: Learning;
  radius: number;
  color: string;
  glowColor: string;
}

interface ConstellationProps {
  learnings: Learning[];
  onSelect: (learning: Learning) => void;
  selectedId: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEPT_COLORS: Record<string, string> = {
  creative: "#d4863c",
  strategy: "#8B9A6B",
  intelligence: "#4D8EFF",
  global: "#e0dcd4",
};

const DEPT_GLOW: Record<string, string> = {
  creative: "rgba(212, 134, 60, 0.6)",
  strategy: "rgba(139, 154, 107, 0.6)",
  intelligence: "rgba(77, 142, 255, 0.6)",
  global: "rgba(224, 220, 212, 0.5)",
};

const radiusScale = scaleLinear().domain([0.3, 1]).range([6, 22]).clamp(true);

function nodeRadius(l: Learning): number {
  return radiusScale(l.confidence);
}

function nodeColor(l: Learning): string {
  return DEPT_COLORS[l.department] ?? DEPT_COLORS.global;
}

function nodeGlow(l: Learning): string {
  return DEPT_GLOW[l.department] ?? DEPT_GLOW.global;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LearningConstellation({
  learnings,
  onSelect,
  selectedId,
}: ConstellationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const simRef = useRef<ReturnType<typeof forceSimulation<Node>> | null>(null);
  const animRef = useRef<number>(0);
  const hoveredRef = useRef<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);
  const tickRef = useRef(0);

  // ---- build nodes from learnings ----
  useEffect(() => {
    const nodes: Node[] = learnings.map((l) => ({
      id: l.id,
      learning: l,
      radius: nodeRadius(l),
      color: nodeColor(l),
      glowColor: nodeGlow(l),
    }));
    nodesRef.current = nodes;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    sizeRef.current = { w, h };

    // d3-force simulation
    const sim = forceSimulation<Node>(nodes)
      .alphaDecay(0.015)
      .velocityDecay(0.35)
      .force("center", forceCenter(w / 2, h / 2).strength(0.04))
      .force("charge", forceManyBody<Node>().strength((d) => -d.radius * 2.5))
      .force("collide", forceCollide<Node>((d) => d.radius + 3).iterations(2))
      // Gravity: high-confidence toward center, low confidence to edges
      .force(
        "x",
        forceX<Node>(w / 2).strength((d) => {
          const score = d.learning.confidence * d.learning.decay_weight;
          return 0.01 + score * 0.06;
        }),
      )
      .force(
        "y",
        forceY<Node>(h / 2).strength((d) => {
          const score = d.learning.confidence * d.learning.decay_weight;
          return 0.01 + score * 0.06;
        }),
      )
      .on("tick", () => {
        tickRef.current++;
      });

    simRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [learnings]);

  // ---- render loop ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = dprRef.current;
    const { w, h } = sizeRef.current;
    const nodes = nodesRef.current;
    const time = Date.now() * 0.001;

    ctx.clearRect(0, 0, w * dpr, h * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    // ---- draw connections between shared source_projects ----
    const projectMap = new Map<string, Node[]>();
    for (const node of nodes) {
      const sources = node.learning.source_projects;
      if (!sources) continue;
      for (const pid of sources) {
        const arr = projectMap.get(pid) ?? [];
        arr.push(node);
        projectMap.set(pid, arr);
      }
    }

    ctx.lineWidth = 0.5;
    for (const group of projectMap.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          if (a.x == null || a.y == null || b.x == null || b.y == null) continue;
          ctx.strokeStyle = "rgba(255,255,255,0.06)";
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // ---- draw nodes ----
    for (const node of nodes) {
      if (node.x == null || node.y == null) continue;

      const isHovered = hoveredRef.current === node.id;
      const isSelected = selectedId === node.id;
      const isOverride = node.learning.status === "admin_override";

      // Pulse glow for active learnings
      const pulse =
        node.learning.status === "active"
          ? 0.3 + Math.sin(time * 2 + node.radius) * 0.15
          : 0;

      const glowRadius = isOverride
        ? node.radius + 8
        : isHovered || isSelected
          ? node.radius + 6
          : node.radius + pulse * 6;

      // Outer glow
      if (pulse > 0 || isOverride || isHovered || isSelected) {
        const grad = ctx.createRadialGradient(
          node.x,
          node.y,
          node.radius * 0.5,
          node.x,
          node.y,
          glowRadius,
        );
        const alpha = isOverride
          ? 0.5
          : isHovered || isSelected
            ? 0.45
            : pulse;
        grad.addColorStop(0, node.glowColor);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Override bright ring
      if (isOverride) {
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Selected ring
      if (isSelected) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Node body
      const r = isHovered ? node.radius * 1.15 : node.radius;
      ctx.fillStyle = node.color;
      ctx.globalAlpha = 0.15 + node.learning.decay_weight * 0.85;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Bright center dot
      ctx.globalAlpha = 0.6 + node.learning.confidence * 0.4;
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
    }

    ctx.restore();
    animRef.current = requestAnimationFrame(draw);
  }, [selectedId]);

  // ---- start/stop render loop ----
  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // ---- resize handler ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      sizeRef.current = { w: rect.width, h: rect.height };

      // Recenter simulation
      simRef.current
        ?.force("center", forceCenter(rect.width / 2, rect.height / 2).strength(0.04))
        .force("x", forceX<Node>(rect.width / 2).strength(0.03))
        .force("y", forceY<Node>(rect.height / 2).strength(0.03))
        .alpha(0.3)
        .restart();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ---- mouse interaction ----
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let found: Node | null = null;
      for (const node of nodesRef.current) {
        if (node.x == null || node.y == null) continue;
        const dx = mx - node.x;
        const dy = my - node.y;
        if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) {
          found = node;
          break;
        }
      }

      hoveredRef.current = found?.id ?? null;
      setHoveredNode(found);
      if (found) {
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      canvas.style.cursor = found ? "pointer" : "default";
    },
    [],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      for (const node of nodesRef.current) {
        if (node.x == null || node.y == null) continue;
        const dx = mx - node.x;
        const dy = my - node.y;
        if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) {
          onSelect(node.learning);
          return;
        }
      }
    },
    [onSelect],
  );

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null;
    setHoveredNode(null);
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
      />

      {/* Hover tooltip */}
      {hoveredNode && (
        <div
          className="pointer-events-none absolute z-20 px-4 py-3 bg-bg-card/95 backdrop-blur-sm border border-border rounded-md shadow-xl max-w-[260px]"
          style={{
            left: tooltipPos.x + 14,
            top: tooltipPos.y - 10,
            transform: "translateY(-100%)",
          }}
        >
          <p className="font-display text-[14px] text-text leading-snug mb-1.5">
            {hoveredNode.learning.title}
          </p>
          <div className="flex items-center gap-3 font-mono text-[10px] text-text-muted tracking-[0.5px]">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: hoveredNode.color }}
            />
            <span>{hoveredNode.learning.department}</span>
            <span className="text-text-muted/50">·</span>
            <span>
              {Math.round(hoveredNode.learning.confidence * 100)}% conf
            </span>
            <span className="text-text-muted/50">·</span>
            <span>{hoveredNode.learning.usage_count} uses</span>
          </div>
          {hoveredNode.learning.last_validated_at && (
            <p className="mt-1 font-mono text-[9px] text-text-muted/60 tracking-[0.5px]">
              last validated{" "}
              {new Date(
                hoveredNode.learning.last_validated_at,
              ).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
