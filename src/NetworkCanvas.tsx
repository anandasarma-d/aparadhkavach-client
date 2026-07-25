import { useEffect, useRef, useState } from "react";
import { DataSet } from "vis-data";
import { Network, type Options } from "vis-network";
import type { EntityNetwork } from "./api/entityNetworkClient";
import { entityTypeLabel, readD1Palette } from "./lib/networkPalette";

type NetworkCanvasProps = {
  network: EntityNetwork;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * vis-network canvas for the K2 neighborhood (A10).
 *
 * Physics is only used to lay the graph out, then switched off — with reduced motion it
 * never animates at all (AGENTS §5). The node/edge table beside this is the accessible
 * equivalent; canvas content is not reachable by screen readers.
 */
export function NetworkCanvas({ network, selectedId, onSelect }: NetworkCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<Network | null>(null);
  const onSelectRef = useRef(onSelect);
  const [theme, setTheme] = useState(0);

  onSelectRef.current = onSelect;

  // Repaint canvas colors when the OS theme flips (CSS vars change, canvas does not).
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme((t) => t + 1);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const palette = readD1Palette(container);
    const reduceMotion = prefersReducedMotion();

    const nodes = new DataSet(
      network.nodes.map((node) => {
        const color = palette.color(node.type);
        const isStart = node.id === network.entityId;
        return {
          id: node.id,
          label: node.label,
          title: `${entityTypeLabel(node.type)} · ${node.id}`,
          // Start stays an ellipse + larger so the focus entity still reads as the hub;
          // every node is filled with its legend color (not only on click).
          shape: isStart ? "ellipse" : "dot",
          size: isStart ? 26 : 16,
          borderWidth: isStart ? 4 : 2,
          borderWidthSelected: 4,
          color: {
            background: color,
            border: isStart ? palette.ink : color,
            highlight: { background: color, border: palette.ink },
            hover: { background: color, border: palette.ink },
          },
          font: {
            color: palette.ink,
            face: "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial, sans-serif",
            size: 13,
          },
        };
      }),
    );

    const edges = new DataSet(
      network.edges.map((edge, index) => ({
        id: `${edge.from}|${edge.type}|${edge.to}|${index}`,
        from: edge.from,
        to: edge.to,
        label: edge.type,
        color: { color: palette.line, highlight: palette.accent },
        font: {
          color: palette.inkMuted,
          size: 10,
          strokeWidth: 3,
          strokeColor: palette.surface,
          face: "ui-monospace, SF Mono, Cascadia Mono, Consolas, monospace",
        },
        smooth: { enabled: !reduceMotion, type: "dynamic", roundness: 0.5 },
      })),
    );

    const options: Options = {
      autoResize: true,
      height: "100%",
      width: "100%",
      interaction: { hover: true, dragNodes: true, zoomView: true, tooltipDelay: 120 },
      // Physics runs only to lay the graph out. stabilization.enabled means vis settles the
      // layout before the first paint, so nothing visibly animates; it is then switched off
      // below. Disabling physics outright would leave nodes overlapping at random positions.
      physics: {
        enabled: true,
        stabilization: { enabled: true, iterations: 200, fit: true },
        barnesHut: { springLength: 140, avoidOverlap: 0.2 },
      },
      layout: { randomSeed: 42 },
      nodes: { shadow: false },
      edges: { arrows: { to: { enabled: false } }, width: 1.5 },
    };

    const instance = new Network(container, { nodes, edges }, options);
    instanceRef.current = instance;

    // Freeze layout once settled so the demo graph does not drift while narrating.
    instance.once("stabilizationIterationsDone", () => {
      instance.setOptions({ physics: { enabled: false } });
      instance.fit({ animation: false });
    });

    instance.on("selectNode", (params: { nodes: string[] }) => {
      onSelectRef.current(params.nodes[0] ?? null);
    });
    instance.on("deselectNode", () => onSelectRef.current(null));

    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, [network, theme]);

  // Keep canvas selection in sync when the table drives the selection.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (selectedId) {
      instance.selectNodes([selectedId], false);
    } else {
      instance.unselectAll();
    }
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      className="h-[420px] w-full rounded border border-[var(--line)] bg-[var(--surface)]"
      role="img"
      aria-label={`Network graph for ${network.entityId}: ${network.nodes.length} entities, ${network.edges.length} links. The table below lists the same data.`}
    />
  );
}
