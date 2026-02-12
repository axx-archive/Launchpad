"use client";

import { useState, useEffect, useRef } from "react";

interface LaunchSequenceProps {
  projectName: string;
  fileCount: number;
  onComplete: () => void;
}

interface Line {
  text: string;
  style: string;
  delay: number;
}

type RocketPhase = "hidden" | "appear" | "ignition" | "liftoff" | "gone";

export default function LaunchSequence({
  projectName,
  fileCount,
  onComplete,
}: LaunchSequenceProps) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [rocketPhase, setRocketPhase] = useState<RocketPhase>("hidden");
  const [showComplete, setShowComplete] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Compute lines once (useState initializer is stable)
  const [lines] = useState<Line[]>(() => {
    const l: Line[] = [
      { text: `$ launchpad compile --target "${projectName}"`, style: "text-text", delay: 100 },
      { text: "  \u2713 project loaded", style: "text-[#28c840]", delay: 300 },
      { text: "  \u2713 company verified", style: "text-[#28c840]", delay: 250 },
    ];

    if (fileCount > 0) {
      l.push({
        text: `  \u2713 materials attached [${fileCount} file${fileCount !== 1 ? "s" : ""}]`,
        style: "text-[#28c840]",
        delay: 250,
      });
    }

    l.push(
      { text: "  \u2713 coordinates locked", style: "text-[#28c840]", delay: 250 },
      { text: "", style: "", delay: 300 },
      { text: "$ launchpad --launch", style: "text-text", delay: 400 },
      { text: "  ignition T\u20133", style: "text-accent", delay: 700 },
      { text: "  ignition T\u20132", style: "text-accent", delay: 700 },
      { text: "  ignition T\u20131", style: "text-accent font-bold", delay: 700 }
    );

    return l;
  });

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;

    // Reveal terminal lines one by one
    lines.forEach((line, i) => {
      t += line.delay;
      timers.push(setTimeout(() => setVisibleLines(i + 1), t));
    });

    // Rocket appear
    t += 300;
    timers.push(setTimeout(() => setRocketPhase("appear"), t));

    // Ignition (flame + shake)
    t += 600;
    timers.push(setTimeout(() => setRocketPhase("ignition"), t));

    // Liftoff
    t += 800;
    timers.push(setTimeout(() => setRocketPhase("liftoff"), t));

    // Gone + show complete message
    t += 1500;
    timers.push(
      setTimeout(() => {
        setRocketPhase("gone");
        setShowComplete(true);
      }, t)
    );

    // Redirect
    t += 1500;
    timers.push(setTimeout(() => onCompleteRef.current(), t));

    return () => timers.forEach(clearTimeout);
  }, [lines]);

  return (
    <div
      className={`relative overflow-hidden ${
        rocketPhase === "ignition" ? "launch-shake" : ""
      }`}
    >
      {/* Terminal output */}
      <div className="font-mono text-[12px] leading-[1.8]">
        {lines.slice(0, visibleLines).map((line, i) => (
          <div key={i} className={`${line.style} launch-line-enter`}>
            {line.text || "\u00A0"}
          </div>
        ))}

        {/* Blinking cursor while typing */}
        {visibleLines < lines.length && rocketPhase === "hidden" && (
          <span className="inline-block w-[7px] h-[14px] bg-accent ml-0.5 animate-[blink_1s_step-end_infinite] align-text-bottom" />
        )}
      </div>

      {/* Rocket */}
      {rocketPhase !== "hidden" && rocketPhase !== "gone" && (
        <div
          className={`flex flex-col items-center mt-8 ${
            rocketPhase === "appear" ? "launch-rocket-appear" : ""
          } ${rocketPhase === "ignition" ? "launch-rocket-rumble" : ""} ${
            rocketPhase === "liftoff" ? "launch-rocket-liftoff" : ""
          }`}
        >
          <div className="relative">
            {/* Nose cone */}
            <div
              className="mx-auto"
              style={{
                width: 0,
                height: 0,
                borderLeft: "16px solid transparent",
                borderRight: "16px solid transparent",
                borderBottom: "24px solid var(--color-accent)",
              }}
            />
            {/* Window */}
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full bg-bg z-10"
              style={{
                top: "26px",
                width: "10px",
                height: "10px",
                border: "1.5px solid rgba(192, 120, 64, 0.5)",
                boxShadow: "0 0 6px rgba(192, 120, 64, 0.3)",
              }}
            />
            {/* Body */}
            <div
              className="mx-auto flex items-end justify-center pb-1.5"
              style={{
                width: "32px",
                height: "48px",
                background:
                  "linear-gradient(180deg, var(--color-accent), var(--color-accent-dim))",
                borderRadius: "2px 2px 0 0",
              }}
            >
              <span className="font-mono text-[8px] font-bold tracking-[1.5px] text-[var(--color-bg)]">
                LP
              </span>
            </div>
            {/* Fins */}
            <div className="flex justify-center items-start">
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "16px solid var(--color-accent-dim)",
                  borderLeft: "12px solid transparent",
                }}
              />
              <div style={{ width: "32px", height: 0 }} />
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "16px solid var(--color-accent-dim)",
                  borderRight: "12px solid transparent",
                }}
              />
            </div>
          </div>

          {/* Flame — visible during ignition and liftoff */}
          {(rocketPhase === "ignition" || rocketPhase === "liftoff") && (
            <div className="flex flex-col items-center -mt-0.5">
              {/* Core flame */}
              <div
                className="rounded-b-full launch-flame-flicker"
                style={{
                  width: "12px",
                  height: rocketPhase === "liftoff" ? "36px" : "22px",
                  background:
                    "linear-gradient(to bottom, #fff 0%, var(--color-accent) 35%, #e0a020 65%, transparent 100%)",
                  transition: "height 0.3s ease",
                }}
              />
              {/* Outer flame */}
              <div
                className="rounded-b-full launch-flame-flicker-alt"
                style={{
                  width: rocketPhase === "liftoff" ? "28px" : "18px",
                  height: rocketPhase === "liftoff" ? "24px" : "14px",
                  marginTop: "-10px",
                  background:
                    "linear-gradient(to bottom, rgba(224, 160, 32, 0.6) 0%, rgba(224, 160, 32, 0.15) 60%, transparent 100%)",
                  transition: "all 0.3s ease",
                }}
              />
              {/* Glow */}
              <div
                className="rounded-full"
                style={{
                  width: "80px",
                  height: "24px",
                  marginTop: "-8px",
                  background:
                    "radial-gradient(ellipse, rgba(192, 120, 64, 0.4) 0%, transparent 70%)",
                  filter: "blur(10px)",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Exhaust trail during liftoff */}
      {rocketPhase === "liftoff" && (
        <div className="flex justify-center mt-1">
          <div className="launch-exhaust-trail" />
        </div>
      )}

      {/* Mission launched */}
      {showComplete && (
        <div className="mt-8 launch-line-enter">
          <div className="font-mono text-[12px] text-[#28c840] leading-[1.8]">
            {"\u2713"} mission launched.
          </div>
          <div className="font-mono text-[12px] text-text-muted leading-[1.8] mt-1">
            redirecting to mission control...
          </div>
        </div>
      )}
    </div>
  );
}
