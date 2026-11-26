"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";

export type VideoDrawingTool = "arrow" | "player" | "ball";

export type VideoDrawing = {
  id: string;
  match_id: string;
  video_id: string;
  shape_kind: VideoDrawingTool;
  x: number;
  y: number;
  end_x: number;
  end_y: number;
  color: string;
  label: string | null;
  created_by: string | null;
  created_at: string;
};

export type VideoDrawingDraft = Pick<
  VideoDrawing,
  "shape_kind" | "x" | "y" | "end_x" | "end_y" | "color" | "label"
>;

type Props = {
  drawings: VideoDrawing[];
  tool: VideoDrawingTool | null;
  color: string;
  label: string;
  onCreate: (drawing: VideoDrawingDraft) => void;
};

type DraftArrow = { x: number; y: number; end_x: number; end_y: number };

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 562.5;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toViewX(value: number) {
  return value * VIEW_WIDTH;
}

function toViewY(value: number) {
  return value * VIEW_HEIGHT;
}

export function VideoDrawingOverlay({ drawings, tool, color, label, onCreate }: Props) {
  const [draftArrow, setDraftArrow] = useState<DraftArrow | null>(null);

  function pointerPosition(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!tool) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerPosition(event);
    if (!point) return;

    if (tool === "arrow") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraftArrow({ ...point, end_x: point.x, end_y: point.y });
      return;
    }

    onCreate({
      shape_kind: tool,
      ...point,
      end_x: point.x,
      end_y: point.y,
      color,
      label: tool === "player" ? label.trim().slice(0, 12) || null : null,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!draftArrow) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerPosition(event);
    if (!point) return;
    setDraftArrow((current) => current ? { ...current, end_x: point.x, end_y: point.y } : null);
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!draftArrow || !tool) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerPosition(event);
    const end = point ?? { x: draftArrow.end_x, y: draftArrow.end_y };
    const distance = Math.hypot(end.x - draftArrow.x, end.y - draftArrow.y);
    if (distance > 0.012) {
      onCreate({
        shape_kind: "arrow",
        x: draftArrow.x,
        y: draftArrow.y,
        end_x: end.x,
        end_y: end.y,
        color,
        label: null,
      });
    }
    setDraftArrow(null);
  }

  return (
    <svg
      className={"absolute inset-0 z-20 h-full w-full " + (tool ? "cursor-crosshair" : "pointer-events-none")}
      viewBox="0 0 1000 562.5"
      preserveAspectRatio="none"
      style={{ touchAction: tool ? "none" : "auto" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDraftArrow(null)}
      aria-label="Desenhos táticos sobre o vídeo"
    >
      {drawings.map((drawing) => {
        const x = toViewX(drawing.x);
        const y = toViewY(drawing.y);
        const endX = toViewX(drawing.end_x);
        const endY = toViewY(drawing.end_y);
        const markerId = "video-arrow-" + drawing.id;
        if (drawing.shape_kind === "arrow") {
          return (
            <g key={drawing.id}>
              <defs>
                <marker id={markerId} markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,4 L0,8 z" fill={drawing.color} />
                </marker>
              </defs>
              <line x1={x} y1={y} x2={endX} y2={endY} stroke={drawing.color} strokeWidth="5" strokeLinecap="round" markerEnd={"url(#" + markerId + ")"} />
            </g>
          );
        }
        if (drawing.shape_kind === "player") {
          return (
            <g key={drawing.id}>
              <circle cx={x} cy={y} r="18" fill="#0b131c" fillOpacity="0.9" stroke={drawing.color} strokeWidth="4" />
              {drawing.label && <text x={x} y={y + 4} fill="#ffffff" fontSize="13" fontWeight="700" textAnchor="middle">{drawing.label}</text>}
            </g>
          );
        }
        return (
          <g key={drawing.id}>
            <circle cx={x} cy={y} r="12" fill="#f8fafc" stroke={drawing.color} strokeWidth="3" />
            <path d={"M" + (x - 4) + " " + (y - 3) + " l4 -4 5 3 -1 6 -5 2 z"} fill="#172331" />
            <path d={"M" + (x - 11) + " " + y + " l5 -2 M" + (x + 10) + " " + (y - 2) + " l-4 2 M" + x + " " + (y + 11) + " l-1 -5"} stroke="#172331" strokeWidth="1.5" />
          </g>
        );
      })}

      {draftArrow && (
        <g>
          <defs>
            <marker id="video-arrow-preview" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L8,4 L0,8 z" fill={color} />
            </marker>
          </defs>
          <line
            x1={toViewX(draftArrow.x)}
            y1={toViewY(draftArrow.y)}
            x2={toViewX(draftArrow.end_x)}
            y2={toViewY(draftArrow.end_y)}
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="9 6"
            markerEnd="url(#video-arrow-preview)"
          />
        </g>
      )}
    </svg>
  );
}
