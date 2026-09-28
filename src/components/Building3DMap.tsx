import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type DayOfWeek } from '../data/rooms';
import { getAllFloorsStatus, type RoomRealTimeStatus } from '../utils/roomFinder';
import { RotateCcw, Layers, Compass, ChevronLeft } from 'lucide-react';

interface Props {
  selectedDay: DayOfWeek;
  selectedPeriod: number;
  onSelectRoom: (status: RoomRealTimeStatus) => void;
}

interface RoomPlacement {
  id: string;
  floorIndex: number; // 0=GF, 1=1F, 2=2F, 3=4F, 4=5F, 5=6F, 6=7F
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

// Spatial layout coordinates for campus rooms across floors
const ROOM_PLACEMENTS: RoomPlacement[] = [
  // Ground Floor
  { id: 'tb-106', floorIndex: 0, x: -5, z: 3, w: 7.5, d: 4.8, h: 2.2 },
  { id: 'ist-108', floorIndex: 0, x: 5, z: 3, w: 7.5, d: 4.8, h: 2.2 },
  { id: 'ist-020', floorIndex: 0, x: -5, z: -3, w: 7.5, d: 4.8, h: 2.2 },
  { id: 'ist-021', floorIndex: 0, x: 5, z: -3, w: 7.5, d: 4.8, h: 2.2 },
  // 1st Floor
  { id: 'ist-101', floorIndex: 1, x: -4.5, z: 0, w: 8.5, d: 9, h: 2.2 },
  { id: 'ist-105', floorIndex: 1, x: 5, z: 0, w: 7.5, d: 9, h: 2.2 },
  // 2nd Floor
  { id: 'ist-201', floorIndex: 2, x: -5, z: -3, w: 7.5, d: 4.8, h: 2.2 },
  { id: 'ist-211', floorIndex: 2, x: 5, z: -3, w: 7.5, d: 4.8, h: 2.2 },
  { id: 'ist-225', floorIndex: 2, x: -5, z: 3, w: 7.5, d: 4.8, h: 2.2 },
  { id: 'ist-227', floorIndex: 2, x: 5, z: 3, w: 7.5, d: 4.8, h: 2.2 },
  // 4th Floor
  { id: 'ist-411', floorIndex: 3, x: -5, z: 2.5, w: 7.5, d: 5.5, h: 2.2 },
  { id: 'ist-416', floorIndex: 3, x: 5, z: 2.5, w: 7.5, d: 5.5, h: 2.2 },
  { id: 'ist-418', floorIndex: 3, x: 0, z: -3.5, w: 14, d: 4.2, h: 2.2 },
  // 5th Floor
  { id: 'ist-502', floorIndex: 4, x: -6.2, z: 3, w: 5.2, d: 4.5, h: 2.2 },
  { id: 'ist-510', floorIndex: 4, x: 0, z: 3, w: 5.5, d: 4.5, h: 2.2 },
  { id: 'ist-518', floorIndex: 4, x: 6.2, z: 3, w: 5.2, d: 4.5, h: 2.2 },
  { id: 'ist-519', floorIndex: 4, x: -4.5, z: -3, w: 7.5, d: 4.5, h: 2.2 },
  { id: 'ist-520', floorIndex: 4, x: 4.5, z: -3, w: 7.5, d: 4.5, h: 2.2 },
  // 6th Floor
  { id: 'ist-602', floorIndex: 5, x: -6.2, z: 3, w: 5.2, d: 4.5, h: 2.2 },
  { id: 'ist-609', floorIndex: 5, x: 0, z: 3, w: 5.5, d: 4.5, h: 2.2 },
  { id: 'ist-617', floorIndex: 5, x: 6.2, z: 3, w: 5.2, d: 4.5, h: 2.2 },
  { id: 'ist-618', floorIndex: 5, x: -6.2, z: -3, w: 5.2, d: 4.5, h: 2.2 },
  { id: 'ist-625', floorIndex: 5, x: 0, z: -3, w: 5.5, d: 4.5, h: 2.2 },
  { id: 'ist-626', floorIndex: 5, x: 6.2, z: -3, w: 5.2, d: 4.5, h: 2.2 },
  // 7th Floor
  { id: 'ist-702', floorIndex: 6, x: -4.5, z: 0, w: 8.5, d: 9, h: 2.2 },
  { id: 'ist-710', floorIndex: 6, x: 5, z: 0, w: 7.5, d: 9, h: 2.2 },
];

const FLOOR_LABELS = ['Ground Floor', '1st Floor', '2nd Floor', '4th Floor', '5th Floor', '6th Floor', '7th Floor'];
const FLOOR_SHORT = ['GF', '1F', '2F', '4F', '5F', '6F', '7F'];
const FLOOR_H = 4.2;
const OVERVIEW = { cam: new THREE.Vector3(32, 34, 42), target: new THREE.Vector3(0, 14, 0) };

const COLORS = {
  free: { body: 0x10b981, emissive: 0x059669, edge: 0x34d399 },
  busy: { body: 0xf43f5e, emissive: 0xbe123c, edge: 0xfb7185 },
};

type Focus = number | 'all';

interface RoomObj {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  label: THREE.Sprite;
}

/** Text sprite for floor tags and room codes. */
function makeLabel(text: string, opts: { bg?: string; fg?: string; scale?: number } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = 'bold 44px -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  canvas.width = w;
  canvas.height = 72;
  ctx.font = font;
  ctx.fillStyle = opts.bg ?? 'rgba(24,24,27,0.82)';
  const r = 20;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 72, r);
  ctx.fill();
  ctx.fillStyle = opts.fg ?? '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 18, 38);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const s = opts.scale ?? 1;
  sprite.scale.set((w / 72) * 1.1 * s, 1.1 * s, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export default function Building3DMap({ selectedDay, selectedPeriod, onSelectRoom }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  const [explosionGap, setExplosionGap] = useState<number>(1.2);
  const [focusedFloor, setFocusedFloor] = useState<Focus>('all');
  const [hoveredRoom, setHoveredRoom] = useState<RoomRealTimeStatus | null>(null);
  const [hoveredFloor, setHoveredFloor] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Live room status for the selected day + period
  const statusMap = useMemo(() => {
    const map = new Map<string, RoomRealTimeStatus>();
    getAllFloorsStatus(selectedDay, selectedPeriod).forEach(f => f.rooms.forEach(r => map.set(r.room.id, r)));
    return map;
  }, [selectedDay, selectedPeriod]);

  const floorStats = useMemo(
    () =>
      FLOOR_LABELS.map((_, i) => {
        const rooms = ROOM_PLACEMENTS.filter(p => p.floorIndex === i);
        return { total: rooms.length, free: rooms.filter(p => statusMap.get(p.id)?.isFree ?? true).length };
      }),
    [statusMap]
  );

  // Refs the render loop and event handlers read (the scene is built once, never rebuilt)
  const statusRef = useRef(statusMap);
  const focusRef = useRef<Focus>('all');
  const gapRef = useRef(explosionGap);
  const onSelectRef = useRef(onSelectRoom);
  statusRef.current = statusMap;
  onSelectRef.current = onSelectRoom;

  const sceneRef = useRef<{
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    floors: THREE.Group[];
    slabs: THREE.Mesh[];
    rooms: Map<string, RoomObj>;
    tween: { cam: THREE.Vector3; target: THREE.Vector3 } | null;
  } | null>(null);

  // ---------- build the scene once ----------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const width = container.clientWidth;
    const height = container.clientHeight || 550;
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.copy(OVERVIEW.cam);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 + 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 85;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.target.copy(OVERVIEW.target);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(30, 50, 40);
    sun.castShadow = true;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.4);
    fill.position.set(-30, 20, -30);
    scene.add(fill);

    const floors: THREE.Group[] = [];
    const slabs: THREE.Mesh[] = [];
    const rooms = new Map<string, RoomObj>();

    for (let f = 0; f < FLOOR_LABELS.length; f++) {
      const group = new THREE.Group();
      group.position.y = f * FLOOR_H * gapRef.current;
      group.userData = { floorIndex: f };

      const slabGeo = new THREE.BoxGeometry(22, 0.35, 15);
      const slab = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.35 }));
      slab.receiveShadow = true;
      slab.userData = { floorIndex: f, kind: 'slab' };
      group.add(slab);
      slabs.push(slab);
      const slabEdges = new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 }));
      group.add(slabEdges);

      const tag = makeLabel(FLOOR_SHORT[f], { scale: 1.3 });
      tag.position.set(-12.8, 0.9, 7.2);
      group.add(tag);

      ROOM_PLACEMENTS.filter(p => p.floorIndex === f).forEach(p => {
        const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COLORS.free.body, emissive: COLORS.free.emissive, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.88 }));
        mesh.position.set(p.x, p.h / 2 + 0.18, p.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { roomId: p.id, floorIndex: f, kind: 'room' };
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: COLORS.free.edge, transparent: true, opacity: 0.85 }));
        edges.position.copy(mesh.position);
        const code = p.id.replace('-', ' ').toUpperCase();
        const label = makeLabel(code, { scale: 0.75 });
        label.position.set(p.x, p.h + 1.1, p.z);
        label.visible = false; // only shown when this floor is isolated
        group.add(mesh, edges, label);
        rooms.set(p.id, { mesh, edges, label });
      });

      scene.add(group);
      floors.push(group);
    }

    sceneRef.current = { camera, controls, floors, slabs, rooms, tween: null };

    // Any manual drag cancels a camera fly-to and stops auto-rotate
    const onStart = () => {
      if (sceneRef.current) sceneRef.current.tween = null;
      controls.autoRotate = false;
    };
    controls.addEventListener('start', onStart);

    // ---------- picking ----------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const visibleRooms = () => [...rooms.values()].map(r => r.mesh).filter(m => m.parent?.visible);
    const visibleSlabs = () => slabs.filter(s => s.parent?.visible);
    const pick = (e: PointerEvent | MouseEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const roomHit = raycaster.intersectObjects(visibleRooms(), false)[0];
      if (roomHit) return { kind: 'room' as const, roomId: roomHit.object.userData.roomId as string, floorIndex: roomHit.object.userData.floorIndex as number };
      const slabHit = raycaster.intersectObjects(visibleSlabs(), false)[0];
      if (slabHit) return { kind: 'slab' as const, floorIndex: slabHit.object.userData.floorIndex as number };
      return null;
    };

    const onMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      const hit = pick(e);
      if (hit?.kind === 'room') {
        setHoveredRoom(statusRef.current.get(hit.roomId) ?? null);
        setHoveredFloor(focusRef.current === 'all' ? hit.floorIndex : null);
        container.style.cursor = 'pointer';
      } else if (hit?.kind === 'slab' && focusRef.current === 'all') {
        setHoveredRoom(null);
        setHoveredFloor(hit.floorIndex);
        container.style.cursor = 'pointer';
      } else {
        setHoveredRoom(null);
        setHoveredFloor(null);
        container.style.cursor = 'grab';
      }
    };

    // Treat as a click only if the pointer barely moved (so orbit-drags don't select)
    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      downAt = null;
      const hit = pick(e);
      if (!hit) return;
      if (focusRef.current === 'all') {
        // Step 1: clicking anywhere on a floor isolates that floor
        setFocusedFloor(hit.floorIndex);
      } else if (hit.kind === 'room') {
        // Step 2: on an isolated floor, clicking a room opens its details
        const status = statusRef.current.get(hit.roomId);
        if (status) onSelectRef.current(status);
      }
    };
    const onLeave = () => {
      setHoveredRoom(null);
      setHoveredFloor(null);
    };

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight || 550;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const s = sceneRef.current;
      if (s?.tween) {
        camera.position.lerp(s.tween.cam, 0.09);
        controls.target.lerp(s.tween.target, 0.09);
        if (camera.position.distanceTo(s.tween.cam) < 0.05 && controls.target.distanceTo(s.tween.target) < 0.05) s.tween = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onStart);
      scene.traverse(obj => {
        const o = obj as THREE.Mesh;
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach(m => {
          (m as THREE.SpriteMaterial).map?.dispose();
          m.dispose();
        });
      });
      controls.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ---------- recolour rooms when day / period changes (no rebuild) ----------
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.rooms.forEach((obj, id) => {
      const c = statusMap.get(id)?.isFree ?? true ? COLORS.free : COLORS.busy;
      obj.mesh.material.color.setHex(c.body);
      obj.mesh.material.emissive.setHex(c.emissive);
      obj.edges.material.color.setHex(c.edge);
    });
  }, [statusMap]);

  // ---------- where the camera should look for the current focus ----------
  const flyTo = (focus: Focus, gap: number) => {
    const s = sceneRef.current;
    if (!s) return;
    if (focus === 'all') {
      s.tween = { cam: OVERVIEW.cam.clone(), target: OVERVIEW.target.clone() };
      s.controls.autoRotate = true;
    } else {
      const y = focus * FLOOR_H * gap + 1.2;
      s.tween = { cam: new THREE.Vector3(14, y + 17, 20), target: new THREE.Vector3(0, y, 0) };
      s.controls.autoRotate = false;
    }
  };

  // ---------- show only the chosen floor ----------
  useEffect(() => {
    focusRef.current = focusedFloor;
    const s = sceneRef.current;
    if (!s) return;
    s.floors.forEach((g, i) => {
      g.visible = focusedFloor === 'all' || focusedFloor === i;
      const isolated = focusedFloor === i;
      s.rooms.forEach(r => {
        if (r.mesh.userData.floorIndex === i) r.label.visible = isolated;
      });
      const slabMat = s.slabs[i].material as THREE.MeshStandardMaterial;
      slabMat.opacity = isolated ? 0.55 : 0.35;
    });
    setHoveredRoom(null);
    setHoveredFloor(null);
    flyTo(focusedFloor, gapRef.current);
  }, [focusedFloor]);

  // ---------- floor spacing ----------
  useEffect(() => {
    gapRef.current = explosionGap;
    const s = sceneRef.current;
    if (!s) return;
    s.floors.forEach((g, i) => (g.position.y = i * FLOOR_H * explosionGap));
    if (focusRef.current !== 'all') flyTo(focusRef.current, explosionGap);
  }, [explosionGap]);

  // Esc returns to all floors
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocusedFloor('all');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleResetCamera = () => {
    if (focusedFloor === 'all') flyTo('all', explosionGap);
    else setFocusedFloor('all');
  };

  const isolated = focusedFloor !== 'all';

  return (
    <div className="relative overflow-hidden rounded-3xl bg-linear-to-b from-zinc-900/[0.04] to-zinc-900/[0.08] dark:from-zinc-950/40 dark:to-zinc-950/80 border border-black/[0.08] dark:border-white/[0.1] backdrop-blur-2xl shadow-xl">
      {/* Header */}
      <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">3D Campus Architectural Model</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20">Interactive Three.js</span>
            </div>
            <p className="text-xs text-zinc-500">
              {isolated ? 'Click a room for its live countdown and squad invite · Esc to see all floors' : 'Click any floor to isolate it, then click a room for details'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Free Now</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Class in Session</span>
          </div>
          <button onClick={handleResetCamera} className="p-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-zinc-600 dark:text-zinc-400 transition" title="Reset view">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full h-[520px] sm:h-[600px] bg-radial from-slate-200/40 via-transparent to-transparent dark:from-slate-900/30">
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing touch-none" />

        {/* Isolated floor banner */}
        {isolated && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-black/[0.08] dark:border-white/[0.12] shadow-lg backdrop-blur-md text-xs">
            <button onClick={() => setFocusedFloor('all')} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-500 transition">
              <ChevronLeft className="w-3.5 h-3.5" /> All floors
            </button>
            <span className="font-bold text-zinc-900 dark:text-white">{FLOOR_LABELS[focusedFloor]}</span>
            <span className="text-zinc-500">
              {floorStats[focusedFloor].total} rooms · <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{floorStats[focusedFloor].free} free</span>
            </span>
          </div>
        )}

        {/* Hover tooltip: room */}
        {hoveredRoom && (
          <div
            className="absolute pointer-events-none z-20 px-3.5 py-2.5 rounded-2xl bg-white/95 dark:bg-zinc-900/95 border border-black/[0.1] dark:border-white/[0.15] shadow-2xl backdrop-blur-md text-xs space-y-1 transform -translate-x-1/2 -translate-y-full"
            style={{
              left: `${Math.min(Math.max(mousePos.x, 120), (mountRef.current?.clientWidth || 600) - 120)}px`,
              top: `${Math.max(mousePos.y - 12, 80)}px`,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-zinc-900 dark:text-white text-sm">{hoveredRoom.room.code}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${hoveredRoom.isFree ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'}`}>
                {hoveredRoom.isFree ? 'Available' : 'In Session'}
              </span>
            </div>
            <div className="text-zinc-500 text-[11px] truncate max-w-[200px]">
              {hoveredRoom.room.name} · {hoveredRoom.room.floor}
            </div>
            <div className="pt-1 text-[11px] font-medium border-t border-black/[0.06] dark:border-white/[0.06]">
              {hoveredRoom.isFree ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  Free for {(hoveredRoom.freeDurationMinutes / 60).toFixed(1)} hrs (until {hoveredRoom.freeUntilTime})
                </span>
              ) : (
                <span className="text-rose-600 dark:text-rose-400">Lecture ends at {hoveredRoom.currentOccupant?.untilTime}</span>
              )}
            </div>
            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium pt-0.5">{isolated ? 'Click to view countdown & squad invite' : `Click to open ${hoveredRoom.room.floor}`}</div>
          </div>
        )}

        {/* Hover tooltip: floor slab (overview only) */}
        {!hoveredRoom && hoveredFloor !== null && !isolated && (
          <div
            className="absolute pointer-events-none z-20 px-3 py-2 rounded-xl bg-white/95 dark:bg-zinc-900/95 border border-black/[0.1] dark:border-white/[0.15] shadow-xl text-xs transform -translate-x-1/2 -translate-y-full"
            style={{ left: `${mousePos.x}px`, top: `${Math.max(mousePos.y - 12, 60)}px` }}
          >
            <span className="font-bold text-zinc-900 dark:text-white">{FLOOR_LABELS[hoveredFloor]}</span>
            <span className="text-zinc-500"> · {floorStats[hoveredFloor].free}/{floorStats[hoveredFloor].total} free · click to isolate</span>
          </div>
        )}

        {/* Floor selector */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          <div className="p-1 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-black/[0.08] dark:border-white/[0.1] shadow-lg flex flex-col gap-1">
            <button
              onClick={() => setFocusedFloor('all')}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition ${focusedFloor === 'all' ? 'bg-blue-600 text-white shadow-xs' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}
            >
              All Floors
            </button>
            {FLOOR_LABELS.map((lbl, idx) => (
              <button
                key={idx}
                onClick={() => setFocusedFloor(idx)}
                onMouseEnter={() => focusedFloor === 'all' && setHoveredFloor(null)}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition text-left flex items-center justify-between gap-3 ${
                  focusedFloor === idx ? 'bg-blue-600 text-white shadow-xs' : hoveredFloor === idx ? 'bg-black/[0.05] dark:bg-white/[0.08] text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <span>{lbl.replace(' Floor', '')}</span>
                <span className={`text-[10px] font-medium ${focusedFloor === idx ? 'text-white/80' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {floorStats[idx].free}/{floorStats[idx].total}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Explode slider */}
        <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:px-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-black/[0.08] dark:border-white/[0.1] shadow-lg">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Layers className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">Explode Floors:</span>
            <input type="range" min={0.8} max={2.6} step={0.1} value={explosionGap} onChange={e => setExplosionGap(parseFloat(e.target.value))} className="w-32 sm:w-44 accent-blue-600 cursor-pointer" />
            <span className="text-xs font-mono text-zinc-500">{explosionGap.toFixed(1)}x</span>
          </div>
          <div className="text-[11px] text-zinc-500 font-medium hidden md:flex items-center gap-2">
            <span>Drag to rotate</span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span>Scroll to zoom</span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span>Right-click to pan</span>
          </div>
        </div>
      </div>
    </div>
  );
}
