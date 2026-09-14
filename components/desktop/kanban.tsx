"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLeads } from "../leads-provider";
import { useAppState } from "../app-state";
import { FollowUpBadge } from "../lead-card";
import { StatusDot } from "../ui";
import { groupByStatus, nextStatus, previousStatus } from "@/lib/derive";
import { kr, relativeTime, taskSummary } from "@/lib/format";
import type { Lead, LeadStatus } from "@/lib/types";

const COLUMN_WIDTH = 272;
const COLUMN_GAP = 14;
/** Ét klik på pilene flytter en kolonne plus mellemrum. */
const SCROLL_STEP = COLUMN_WIDTH + COLUMN_GAP;
const SLIDER_MAX = 1000;

/**
 * Kanban-boardet.
 *
 * Træk-og-slip er den hurtige vej, men pilene på hvert kort bliver: træk er
 * ikke tilgængeligt for alle, og på en trackpad er det fumlet.
 */
export function Kanban({ leads }: { leads: Lead[] }) {
  const { updateLead, toast, now } = useLeads();
  const { openLead } = useAppState();

  const boardRef = useRef<HTMLDivElement>(null);
  const [sliderValue, setSliderValue] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);

  const groups = groupByStatus(leads);

  /** Boardets scroll → sliderens position. Uden den lyver slideren så snart
   *  man ruller med trackpad. */
  const syncSliderFromBoard = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const max = board.scrollWidth - board.clientWidth;
    setSliderValue(max <= 0 ? 0 : (board.scrollLeft / max) * SLIDER_MAX);
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    board.addEventListener("scroll", syncSliderFromBoard, { passive: true });
    syncSliderFromBoard();
    return () => board.removeEventListener("scroll", syncSliderFromBoard);
  }, [syncSliderFromBoard]);

  /** Sliderens position → boardets scroll. */
  const scrollBoardTo = (value: number) => {
    setSliderValue(value);
    const board = boardRef.current;
    if (!board) return;
    const max = board.scrollWidth - board.clientWidth;
    board.scrollLeft = (value / SLIDER_MAX) * max;
  };

  const nudge = (direction: -1 | 1) => {
    boardRef.current?.scrollBy({
      left: direction * SCROLL_STEP,
      behavior: "smooth",
    });
  };

  const moveTo = async (lead: Lead, status: LeadStatus) => {
    if (lead.status === status) return;
    await updateLead(lead.id, { status });
    toast(`${lead.name.split(" ")[0]} → ${status}`);
  };

  const drop = async (status: LeadStatus) => {
    const lead = leads.find((l) => l.id === dragId);
    setDragId(null);
    setDragOver(null);
    if (lead) await moveTo(lead, status);
  };

  return (
    <>
      {/* Rulle-linjen */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "9px 22px 11px",
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-line)",
        }}
      >
        <NudgeButton label="Rul til venstre" onClick={() => nudge(-1)}>
          ‹
        </NudgeButton>

        <input
          type="range"
          className="board-range"
          min={0}
          max={SLIDER_MAX}
          value={sliderValue}
          onChange={(e) => scrollBoardTo(Number(e.target.value))}
          aria-label="Rul boardet vandret"
          style={{ flex: 1, height: 34 }}
        />

        <NudgeButton label="Rul til højre" onClick={() => nudge(1)}>
          ›
        </NudgeButton>

        <span
          style={{
            fontSize: 12.5,
            color: "var(--color-text-3)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {dragId ? "Slip i en kolonne" : "Træk leads mellem kolonner"}
        </span>
      </div>

      {/* Boardet */}
      <div
        ref={boardRef}
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "auto",
          padding: "20px 22px 28px",
          display: "flex",
          gap: COLUMN_GAP,
          alignItems: "flex-start",
        }}
      >
        {groups.map((group) => {
          const isTarget = dragOver === group.status;
          return (
            <section
              key={group.status}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragOver !== group.status) setDragOver(group.status);
              }}
              onDragLeave={() => {
                if (dragOver === group.status) setDragOver(null);
              }}
              onDrop={() => void drop(group.status)}
              style={{
                width: COLUMN_WIDTH,
                flexShrink: 0,
                background: isTarget ? "var(--color-yellow-drop)" : "var(--color-board)",
                border: `1px solid ${isTarget ? "var(--color-yellow)" : "var(--color-board-line)"}`,
                borderRadius: 13,
                padding: 12,
              }}
            >
              <header>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusDot status={group.status} />
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-display)",
                      fontSize: 14.5,
                      fontWeight: 700,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {group.status}
                  </h2>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--color-text-2)",
                    }}
                  >
                    {group.leads.length}
                  </span>
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    paddingTop: 8,
                    borderTop: "1px solid var(--color-board-line)",
                    fontSize: 12.5,
                    color: "var(--color-text-3)",
                  }}
                >
                  {kr(group.value)}
                </p>
              </header>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                {group.leads.length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      padding: "22px 10px",
                      border: "1px dashed var(--color-board-line)",
                      borderRadius: 11,
                      textAlign: "center",
                      fontSize: 13,
                      color: "var(--color-text-3)",
                    }}
                  >
                    Tom
                  </p>
                ) : (
                  group.leads.map((lead) => (
                    <KanbanCard
                      key={lead.id}
                      lead={lead}
                      now={now}
                      dragging={dragId === lead.id}
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOver(null);
                      }}
                      onOpen={() => openLead(lead.id)}
                      onMove={(status) => void moveTo(lead, status)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function NudgeButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        flexShrink: 0,
        borderRadius: "var(--radius-input)",
        background: "var(--color-card)",
        border: "1px solid var(--color-line-input)",
        fontSize: 17,
        color: "var(--color-text-2)",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function KanbanCard({
  lead,
  now,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onMove,
}: {
  lead: Lead;
  now: Date;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onMove: (status: LeadStatus) => void;
}) {
  const previous = previousStatus(lead.status);
  const next = nextStatus(lead.status);
  const [hover, setHover] = useState(false);

  return (
    <article
      draggable
      onDragStart={(event) => {
        // Uden dette nægter Firefox at starte trækket.
        event.dataTransfer.setData("text/plain", lead.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--color-card)",
        borderRadius: 11,
        padding: "12px 13px",
        cursor: "grab",
        opacity: dragging ? 0.45 : 1,
        boxShadow: hover ? "var(--shadow-card-hover)" : "none",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{ width: "100%", textAlign: "left" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            className="truncate-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 700,
              minWidth: 0,
            }}
          >
            {lead.name}
          </span>
          <span
            style={{
              fontSize: 11.5,
              color: "var(--color-text-4)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {relativeTime(lead.created_time, now)}
          </span>
        </div>

        <p
          style={{
            margin: "5px 0 0",
            fontSize: 13.5,
            lineHeight: 1.45,
            color: "var(--color-text-2)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {taskSummary(lead.description, 70) || "Ingen opgavetekst"}
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 9,
            alignItems: "center",
          }}
        >
          {lead.city ? <MiniChip>{lead.city}</MiniChip> : null}
          {lead.value ? <MiniChip>{kr(lead.value)}</MiniChip> : null}
          <FollowUpBadge lead={lead} now={now} />
        </div>
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
          paddingTop: 9,
          borderTop: "1px solid var(--color-line-soft)",
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            color: "var(--color-text-4)",
            flex: 1,
            minWidth: 0,
          }}
        >
          {lead.follow_up ? "Opfølgning sat" : "Ingen opfølgning"}
        </span>

        <StepButton
          label={previous ? `Flyt til ${previous}` : "Står forrest"}
          disabled={!previous}
          onClick={() => previous && onMove(previous)}
        >
          ‹
        </StepButton>
        <StepButton
          label={next ? `Flyt til ${next}` : "Står bagerst"}
          disabled={!next}
          onClick={() => next && onMove(next)}
        >
          ›
        </StepButton>
      </div>
    </article>
  );
}

function MiniChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: "var(--color-chip)",
        borderRadius: "var(--radius-pill)",
        padding: "3px 9px",
        fontSize: 12,
        color: "var(--color-text-2)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function StepButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        flexShrink: 0,
        borderRadius: "var(--radius-input)",
        background: "var(--color-chip)",
        color: "var(--color-text-2)",
        fontSize: 15,
        display: "grid",
        placeItems: "center",
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
