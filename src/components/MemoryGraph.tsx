import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { GraphNode, KnowledgeGraph } from '../engine/graphdb';
import { IconOrbit, IconX } from './icons';

/* ---------------- deterministic 3D force layout ---------------- */

function layoutGraph(graph: KnowledgeGraph): Map<string, [number, number, number]> {
  const pos = new Map<string, [number, number, number]>();
  const counts: Record<string, number> = { fact: 0, task: 0, session: 0 };
  graph.nodes.forEach((n, i) => {
    const k = counts[n.kind]++;
    const angle = k * 2.399963 + i * 0.618; // golden-angle spread, deterministic
    const radius = n.kind === 'fact' ? 4 + (k % 5) * 1.7 : n.kind === 'task' ? 8 + (k % 4) * 1.5 : 11 + (k % 3) * 1.4;
    const y = n.kind === 'fact' ? Math.sin(k * 1.7) * 2.2 : n.kind === 'task' ? Math.cos(k * 2.3) * 3 : Math.sin(k) * 4.5;
    pos.set(n.id, [Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
  });

  const idx = new Map(graph.nodes.map((n, i) => [n.id, i]));
  // relaxation: springs on edges + gentle repulsion + radial containment
  for (let iter = 0; iter < 90; iter++) {
    const forces = graph.nodes.map(() => [0, 0, 0]);
    for (const e of graph.edges) {
      const a = idx.get(e.from);
      const b = idx.get(e.to);
      if (a === undefined || b === undefined) continue;
      const pa = pos.get(graph.nodes[a].id);
      const pb = pos.get(graph.nodes[b].id);
      if (!pa || !pb) continue;
      const dx = pb[0] - pa[0];
      const dy = pb[1] - pa[1];
      const dz = pb[2] - pa[2];
      const d = Math.max(0.6, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const pull = (d - 6.5) * 0.012;
      forces[a][0] += (dx / d) * pull;
      forces[a][1] += (dy / d) * pull;
      forces[a][2] += (dz / d) * pull;
      forces[b][0] -= (dx / d) * pull;
      forces[b][1] -= (dy / d) * pull;
      forces[b][2] -= (dz / d) * pull;
    }
    graph.nodes.forEach((n, i) => {
      const p = pos.get(n.id);
      if (!p) return;
      p[0] = p[0] * 0.985 + forces[i][0];
      p[1] = p[1] * 0.985 + forces[i][1];
      p[2] = p[2] * 0.985 + forces[i][2];
      const r = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      if (r > 15) {
        const s = 15 / r;
        p[0] *= s;
        p[1] *= s;
        p[2] *= s;
      }
    });
  }
  return pos;
}

/* ---------------- scene pieces ---------------- */

const KIND_COLOR: Record<GraphNode['kind'], string> = {
  fact: '#ffb454',
  task: '#4fe0c2',
  session: '#85a0ad',
};

function NodeMesh({
  node,
  position,
  hovered,
  onHover,
  onPick,
}: {
  node: GraphNode;
  position: [number, number, number];
  hovered: boolean;
  onHover: (id: string | null) => void;
  onPick: (n: GraphNode) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const recency = Math.max(0, 1 - (Date.now() - node.ts) / (30 * 86_400_000));
  const glow = 0.35 + node.importance * 0.85 + recency * 0.4;
  const scale = 0.45 + node.importance * 0.95;
  const color = KIND_COLOR[node.kind];

  useFrame((state) => {
    if (mesh.current) {
      const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.6 + position[0]) * 0.04;
      const target = scale * breathe * (hovered ? 1.35 : 1);
      mesh.current.scale.setScalar(mesh.current.scale.x + (target - mesh.current.scale.x) * 0.15);
    }
  });

  return (
    <mesh
      ref={mesh}
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onPick(node);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(node.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = 'auto';
      }}
    >
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? glow + 0.9 : glow} roughness={0.35} metalness={0.15} />
      {hovered && (
        <Html center distanceFactor={22} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded border border-ink-600 bg-ink-900/95 px-2.5 py-1.5 font-mono text-[10px] text-ink-100 shadow-xl">
            <span style={{ color }}>{node.kind}</span> · {node.label}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function Constellation({
  graph,
  onPick,
}: {
  graph: KnowledgeGraph;
  onPick: (n: GraphNode) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const group = useRef<THREE.Group>(null);
  const positions = useMemo(() => layoutGraph(graph), [graph]);

  const edgeGeometry = useMemo(() => {
    const pts: number[] = [];
    for (const e of graph.edges) {
      const a = positions.get(e.from);
      const b = positions.get(e.to);
      if (!a || !b) continue;
      pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geom;
  }, [graph, positions]);

  useFrame((_, delta) => {
    if (group.current && !hovered) group.current.rotation.y += delta * 0.06;
  });

  return (
    <group ref={group}>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color="#4fe0c2" transparent opacity={0.16} />
      </lineSegments>
      {graph.nodes.map((n) => {
        const p = positions.get(n.id);
        if (!p) return null;
        return (
          <NodeMesh
            key={n.id}
            node={n}
            position={p}
            hovered={hovered === n.id}
            onHover={setHovered}
            onPick={onPick}
          />
        );
      })}
    </group>
  );
}

/* ---------------- overlay shell ---------------- */

interface MemoryLattice3DProps {
  open: boolean;
  graph: KnowledgeGraph;
  onClose: () => void;
  onPick: (node: GraphNode) => void;
}

export function MemoryLattice3D({ open, graph, onClose, onPick }: MemoryLattice3DProps) {
  if (!open) return null;
  const facts = graph.nodes.filter((n) => n.kind === 'fact').length;
  const tasks = graph.nodes.filter((n) => n.kind === 'task').length;
  const sessions = graph.nodes.filter((n) => n.kind === 'session').length;

  return (
    <div className="anim-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink-950/88 p-4 backdrop-blur-sm sm:p-8">
      <div className="anim-fade-up relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-[0_30px_120px_rgb(0_0_0/0.7)]">
        <div className="flex items-center gap-3 border-b border-ink-700 px-5 py-3.5">
          <IconOrbit size={17} className="text-aqua-400" />
          <div>
            <h3 className="font-display text-[15px] font-bold tracking-tight text-ink-50">Knowledge graph</h3>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-400">
              {graph.nodes.length} nodes · {graph.edges.length} edges · indexeddb-backed
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 font-mono text-[10px]">
            <span className="flex items-center gap-1.5 text-ink-300">
              <span className="h-2 w-2 rounded-full bg-ember-400" /> facts {facts}
            </span>
            <span className="flex items-center gap-1.5 text-ink-300">
              <span className="h-2 w-2 rounded-full bg-aqua-400" /> tasks {tasks}
            </span>
            <span className="hidden items-center gap-1.5 text-ink-300 sm:flex">
              <span className="h-2 w-2 rounded-full bg-ink-400" /> sessions {sessions}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close knowledge graph"
            className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-50"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          {graph.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <IconOrbit size={34} className="text-ink-600" />
              <p className="font-display text-[16px] font-semibold text-ink-300">The lattice is dark</p>
              <p className="max-w-sm font-mono text-[11px] leading-relaxed text-ink-500">
                Store a fact (<span className="text-aqua-300">remember: …</span>) or a task and the constellation ignites.
              </p>
            </div>
          ) : (
            <Canvas camera={{ position: [0, 6, 24], fov: 50 }} dpr={[1, 2]}>
              <ambientLight intensity={0.5} />
              <pointLight position={[12, 12, 10]} intensity={40} color="#ffb454" />
              <pointLight position={[-12, -8, -8]} intensity={30} color="#4fe0c2" />
              <Constellation graph={graph} onPick={onPick} />
              <OrbitControls enablePan={false} minDistance={8} maxDistance={44} />
            </Canvas>
          )}
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-ink-700 bg-ink-900/90 px-4 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-400">
            drag to orbit · click a node to inject its context
          </div>
        </div>
      </div>
    </div>
  );
}
