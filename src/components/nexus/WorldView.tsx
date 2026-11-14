"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorld, useResidents, useResidentDetail, useTickWorld } from "@/hooks/useNexus";
import { Play, Pause, Loader2, Brain, X, MapPin } from "lucide-react";

interface LayoutData {
  bounds: [number, number, number, number];
  roads: Array<{ x1: number; y1: number; x2: number; y2: number; width: number }>;
  buildings: Array<{
    id: string; kind: string; name: string; district: string;
    x: number; y: number; w: number; d: number; h: number;
    center: [number, number]; color: [number, number, number];
    special?: string | null;
    rooms: Array<{ id: string; name: string; kind: string; x: number; y: number; w: number; d: number; center: [number, number] }>;
  }>;
  objects: Array<{ id: string; room_id: string; building_id: string; name: string; kind: string; x: number; y: number }>;
}

const ACTION_COLORS: Record<string, number> = {
  sleeping: 0x6366f1,
  eating: 0xfacc15,
  working: 0xf97316,
  socializing: 0xec4899,
  leisure: 0x10b981,
  commuting: 0xe4e4e7,
  idle: 0x71717a,
};

const JARVIS_COLOR = 0x67e8f9; // holographic cyan — her life-sign colour

const ROOM_KIND_COLORS: Record<string, number> = {
  atrium: 0x8b5cf6, studio: 0x6366f1, observatory: 0x38bdf8,
  hall: 0xf59e0b, office: 0xf97316, archive: 0xa16207,
  dining: 0xfacc15, kitchen: 0xef4444, floor: 0x22c55e, storage: 0x84cc16,
};

const OBJECT_COLORS: Record<string, number> = {
  sofa: 0x7c3aed, table: 0x92400e, plant: 0x16a34a, desk: 0x92400e,
  terminal: 0x0891b2, chair: 0xa16207, bench: 0x854d0e, shelf: 0x78350f,
  counter: 0x44403c, crate: 0x57534e,
};

function skyColor(hour: number): THREE.Color {
  // dawn 5-7, day 7-17, dusk 17-19, night otherwise
  if (hour >= 7 && hour < 17) return new THREE.Color(0x8fb6d4);
  if (hour >= 17 && hour < 19) return new THREE.Color(0xc98a5a).lerp(new THREE.Color(0x0b0e17), (hour - 17) / 2);
  if (hour >= 5 && hour < 7) return new THREE.Color(0x0b0e17).lerp(new THREE.Color(0xc98a5a), (hour - 5) / 2);
  return new THREE.Color(0x0b0e17);
}

export function WorldView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [insideBuilding, setInsideBuilding] = useState<string | null>(null);
  const [shellNote, setShellNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2000); // ms per tick
  const [cognition, setCognition] = useState(false);
  const [ready, setReady] = useState(false);
  const world = useWorld(3000);
  const residents = useResidents(3000);
  const detail = useResidentDetail(selected);
  const tick = useTickWorld();
  const qc = useQueryClient();

  // scene handles exposed by the main effect for the interior overlay
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    overview: () => void;
    enter: (id: string) => boolean;
    exit: () => void;
  } | null>(null);

  const { data: layout } = useQuery({
    queryKey: ["layout"],
    queryFn: async () => {
      const r = await fetch("/api/layout");
      if (!r.ok) throw new Error("layout unavailable");
      return (await r.json()) as LayoutData;
    },
    staleTime: Infinity,
  });

  // mutable refs for the render loop (kept in sync inside an effect —
  // the lint rule correctly forbids ref writes during render)
  const worldRef = useRef(world.data);
  const residentsRef = useRef(residents.data?.residents ?? []);
  const selectedRef = useRef<string | null>(null);
  const insideBuildingRef = useRef<string | null>(null);
  useEffect(() => {
    worldRef.current = world.data;
    residentsRef.current = residents.data?.residents ?? [];
    selectedRef.current = selected;
    insideBuildingRef.current = insideBuilding;
  }, [world.data, residents.data, selected, insideBuilding]);

  // auto-tick loop
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      tick.mutate({ ticks: 1, cognition });
    }, speed);
    return () => clearInterval(iv);
  }, [playing, speed, cognition]);

  // ------------------------------------------------ three.js scene
  useEffect(() => {
    if (!layout || !mountRef.current) return;
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0e17, 120, 340);

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    const [minX, minY, maxX, maxY] = layout.bounds;
    const cx = (minX + maxX) / 2;
    const cz = (minY + maxY) / 2;
    camera.position.set(cx + 42, 46, cz + 52);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, cz);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 15;
    controls.maxDistance = 260;

    // lights
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    scene.add(sun);
    const ambient = new THREE.AmbientLight(0x404040, 1.2);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x9db4c8, 0x2a2f26, 0.7);
    scene.add(hemi);

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX + 160, maxY - minY + 160),
      new THREE.MeshStandardMaterial({ color: 0x2b3328, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.05, cz);
    ground.receiveShadow = true;
    scene.add(ground);

    // roads
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.95 });
    for (const r of layout.roads) {
      const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
      const horizontal = Math.abs(r.x2 - r.x1) > Math.abs(r.y2 - r.y1);
      const geo = new THREE.PlaneGeometry(horizontal ? len : r.width, horizontal ? r.width : len);
      const m = new THREE.Mesh(geo, roadMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((r.x1 + r.x2) / 2, 0.02, (r.y1 + r.y2) / 2);
      m.receiveShadow = true;
      scene.add(m);
    }

    // buildings
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.9 });
    const sanctumRoofMat = new THREE.MeshStandardMaterial({
      color: 0x312e81, roughness: 0.55, emissive: 0x4338ca, emissiveIntensity: 0.35,
    });
    const buildingMeshes = new Map<string, { mesh: THREE.Mesh; roof: THREE.Mesh; b: LayoutData["buildings"][number] }>();
    for (const b of layout.buildings) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(b.color[0], b.color[1], b.color[2]),
        roughness: 0.85,
      });
      if (b.special === "jarvis_sanctum") {
        mat.color.setHex(0x1e1b4b);
        mat.emissive = new THREE.Color(0x3730a3);
        mat.emissiveIntensity = 0.28;
      }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      mesh.position.set(b.x + b.w / 2, b.h / 2, b.y + b.d / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { building: b.id, name: b.name, rooms: b.rooms?.length ?? 0 };
      scene.add(mesh);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.4, 0.25, b.d + 0.4),
        b.special === "jarvis_sanctum" ? sanctumRoofMat : roofMat
      );
      roof.position.set(b.x + b.w / 2, b.h + 0.12, b.y + b.d / 2);
      roof.castShadow = true;
      scene.add(roof);
      buildingMeshes.set(b.id, { mesh, roof, b });
    }

    // deterministic street trees (hash-free positions from index; stable per layout)
    const treeTrunk = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1 });
    const treeCrown = new THREE.MeshStandardMaterial({ color: 0x2f5233, roughness: 1 });
    let placedTrees = 0;
    for (let i = 0; placedTrees < 48 && i < 400; i++) {
      const px = minX + ((i * 97) % 100) / 100 * (maxX - minX);
      const pz = minY + ((i * 61) % 100) / 100 * (maxY - minY);
      const clash = layout.buildings.some(
        (b) => px > b.x - 1.5 && px < b.x + b.w + 1.5 && pz > b.y - 1.5 && pz < b.y + b.d + 1.5
      );
      const onRoad = layout.roads.some(
        (r) =>
          Math.abs(px - (r.x1 + r.x2) / 2) < (Math.abs(r.x2 - r.x1) > Math.abs(r.y2 - r.y1) ? 1e9 : r.width / 2 + 1) &&
          Math.abs(pz - (r.y1 + r.y2) / 2) < (Math.abs(r.x2 - r.x1) > Math.abs(r.y2 - r.y1) ? r.width / 2 + 1 : 1e9)
      );
      if (clash || onRoad) continue;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 6), treeTrunk);
      trunk.position.set(px, 0.7, pz);
      trunk.castShadow = true;
      scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 7), treeCrown);
      crown.position.set(px, 2.6, pz);
      crown.castShadow = true;
      scene.add(crown);
      placedTrees++;
    }

    // rain particle system (activated per weather)
    const RAIN = 1400;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(RAIN * 6);
    for (let i = 0; i < RAIN; i++) {
      const x = cx + (Math.random() - 0.5) * (maxX - minX + 80);
      const z = cz + (Math.random() - 0.5) * (maxY - minY + 80);
      const y = Math.random() * 60;
      rainPos.set([x, y, z, x, y - 1.4, z], i * 6);
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rain = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({ color: 0x9db4c8, transparent: true, opacity: 0.35 })
    );
    rain.visible = false;
    scene.add(rain);

    // resident agents
    const residentMeshes = new Map<string, THREE.Group>();
    const ensureResident = (id: string) => {
      let g = residentMeshes.get(id);
      if (!g) {
        g = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.5, 1.05, 4, 10),
          new THREE.MeshStandardMaterial({
            color: 0xa1a1aa,
            roughness: 0.6,
            emissive: 0x232323,
            emissiveIntensity: 0.9,
          })
        );
        body.position.y = 1.0;
        body.castShadow = true;
        body.name = "body";
        g.add(body);
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.55, 0.75, 24),
          new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.05;
        halo.name = "halo";
        g.add(halo);
        // life-sign orb: floats above the rooftops so residents are
        // always visible even when inside buildings (sleeping at home)
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 12, 12),
          new THREE.MeshStandardMaterial({
            color: 0xa1a1aa,
            emissive: 0x232323,
            emissiveIntensity: 1.0,
          })
        );
        orb.position.y = 8.6;
        orb.name = "orb";
        g.add(orb);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 8.6, 5),
          new THREE.MeshBasicMaterial({ color: 0xa1a1aa, transparent: true, opacity: 0.22 })
        );
        beam.position.y = 4.3;
        beam.name = "beam";
        g.add(beam);
        // generous invisible hitbox around the orb (tiny orbs are hard
        // to click at street-camera distance)
        const hitbox = new THREE.Mesh(
          new THREE.SphereGeometry(1.6, 8, 8),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        hitbox.position.y = 8.6;
        hitbox.name = "hitbox";
        g.add(hitbox);
        g.userData = { resident_id: id };
        scene.add(g);
        residentMeshes.set(id, g);
      }
      return g;
    };

    // click selection via raycast
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return; // drag = orbit
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...residentMeshes.values()], true);
      const first = hits.find(
        (h) => h.object.userData?.resident_id || h.object.parent?.userData?.resident_id
      );
      if (first) {
        const id =
          (first.object.userData?.resident_id as string) ??
          (first.object.parent?.userData?.resident_id as string);
        if (id) {
          setSelected(id);
          return;
        }
      }
      // building click → enter (if interiors exist) or honest shell note
      if (insideBuildingRef.current === null) {
        const bHits = raycaster.intersectObjects(
          [...buildingMeshes.values()].map((x) => x.mesh),
          false
        );
        const bHit = bHits[0];
        const bid = bHit?.object.userData?.building as string | undefined;
        const entry = bid ? buildingMeshes.get(bid) : undefined;
        if (bid && entry) {
          if ((entry.b.rooms?.length ?? 0) > 0) {
            setInsideBuilding(bid);
            setShellNote(null);
          } else {
            setShellNote(`${entry.b.name} — interior not generated in v1 (honest shell: click-to-enter covers the Sanctum, the civic hall, food venues and shops)`);
          }
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    // resize
    const ro = new ResizeObserver(() => {
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    ro.observe(mount);

    let raf = 0;
    const tmp = new THREE.Vector3();
    const clock3 = new THREE.Clock();
    const overview = () => {
      camera.position.set(cx + 42, 46, cz + 52);
      controls.target.set(cx, 0, cz);
    };
    const enter = (id: string): boolean => {
      const entry = buildingMeshes.get(id);
      if (!entry) return false;
      entry.mesh.visible = false; // open the shell — dollhouse view
      entry.roof.visible = false;
      return true;
    };
    const exit = () => {
      for (const [, e] of buildingMeshes) {
        e.mesh.visible = true;
        e.roof.visible = true;
      }
    };
    // expose handles for the interior overlay effect
    sceneRef.current = { scene, camera, controls, overview, enter, exit };
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock3.getDelta();
      const w = worldRef.current;
      const rs = residentsRef.current;

      // environment
      const hour = w?.clock?.local_hour ?? 12;
      const daytime = hour >= 6 && hour < 18;
      const t = Math.max(0, Math.min(1, (hour - 6) / 12));
      const sunAngle = t * Math.PI;
      sun.position.set(cx + Math.cos(sunAngle) * 90, Math.max(6, Math.sin(sunAngle) * 100), cz + 30);
      sun.intensity = daytime ? 1.4 + Math.sin(sunAngle) * 1.2 : 0.12;
      ambient.intensity = daytime ? 1.0 : 0.55;
      const sky = skyColor(hour);
      scene.background = sky;
      if (scene.fog) (scene.fog as THREE.Fog).color = sky;

      // rain
      const raining = w?.weather === "rain";
      rain.visible = raining;
      if (raining) {
        const pos = rainGeo.getAttribute("position") as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < RAIN; i++) {
          const y = arr[i * 6 + 1] - dt * 38;
          if (y < 0) {
            arr[i * 6 + 1] = 55 + Math.random() * 8;
            arr[i * 6 + 4] = arr[i * 6 + 1] - 1.4;
          } else {
            arr[i * 6 + 1] = y;
            arr[i * 6 + 4] = y - 1.4;
          }
        }
        pos.needsUpdate = true;
      }

      // residents — visual smoothing toward sim positions
      const seen = new Set<string>();
      for (const r of rs) {
        seen.add(r.resident_id);
        const g = ensureResident(r.resident_id);
        tmp.set(r.pos[0], 0, r.pos[1]);
        g.position.lerp(tmp, Math.min(1, dt * 3.5));
        const isJarvis = r.is_jarvis === true;
        const body = g.getObjectByName("body") as THREE.Mesh;
        const mat = body.material as THREE.MeshStandardMaterial;
        const orb = g.getObjectByName("orb") as THREE.Mesh;
        const orbMat = orb.material as THREE.MeshStandardMaterial;
        const beam = g.getObjectByName("beam") as THREE.Mesh;
        const beamMat = beam.material as THREE.MeshBasicMaterial;
        const target = isJarvis ? JARVIS_COLOR : (ACTION_COLORS[r.action] ?? ACTION_COLORS.idle);
        if ((body.material as THREE.MeshStandardMaterial).color.getHex() !== target) {
          mat.color.setHex(target);
          mat.emissive.setHex(target);
          mat.emissiveIntensity = isJarvis ? 1.6 : 0.85; // JARVIS glows — she is unmistakable
          orbMat.color.setHex(target);
          orbMat.emissive.setHex(target);
          beamMat.color.setHex(target);
        }
        if (isJarvis) {
          // her life-sign is a little larger and pulses with a slower breath
          orb.scale.setScalar(1.35);
          orb.position.y = 8.9 + Math.sin(performance.now() / 900) * 0.5;
          beamMat.opacity = 0.5;
        }
        // gentle life-sign bob + subtle selected emphasis
        const sel = selectedRef.current === r.resident_id;
        if (!isJarvis) {
          orb.scale.setScalar(sel ? 1.7 : 1.0);
          orb.position.y = 8.6 + Math.sin(performance.now() / 520 + g.position.x) * 0.35;
        }
        // gentle walk bob while commuting
        g.position.y = r.action === "commuting" ? Math.abs(Math.sin(performance.now() / 140)) * 0.12 : 0;
        const halo = g.getObjectByName("halo") as THREE.Mesh;
        (halo.material as THREE.MeshBasicMaterial).color.setHex(
          isJarvis ? JARVIS_COLOR : selectedRef.current === r.resident_id ? 0xf59e0b : 0x10b981
        );
      }
      for (const [id, g] of residentMeshes) {
        if (!seen.has(id)) {
          scene.remove(g);
          residentMeshes.delete(id);
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    // signal readiness outside the effect body (rule: no direct setState in effect)
    Promise.resolve().then(() => setReady(true));

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [layout?.bounds?.join(",")]);

  // ------------------------------------------------ interior overlay effect
  // Entering a building hides its shell and builds the real interior
  // (rooms + objects from the SAME layout that drives the simulation).
  const interiorGroupRef = useRef<THREE.Group | null>(null);
  useEffect(() => {
    const handles = sceneRef.current;
    if (!handles || !layout) return;
    // teardown previous interior
    if (interiorGroupRef.current) {
      handles.scene.remove(interiorGroupRef.current);
      interiorGroupRef.current.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      interiorGroupRef.current = null;
    }
    handles.exit();
    if (!insideBuilding) {
      handles.overview();
      return;
    }
    const b = layout.buildings.find((x) => x.id === insideBuilding);
    if (!b || !b.rooms || b.rooms.length === 0) {
      handles.overview();
      return;
    }
    if (!handles.enter(insideBuilding)) {
      handles.overview();
      return;
    }

    const group = new THREE.Group();
    group.name = "interior";
    // floor plate
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(b.w, b.d),
      new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(b.x + b.w / 2, 0.06, b.y + b.d / 2);
    floor.receiveShadow = true;
    group.add(floor);

    const objectsByRoom = new Map<string, LayoutData["objects"]>();
    for (const o of layout.objects) {
      if (o.building_id !== b.id) continue;
      const list = objectsByRoom.get(o.room_id) ?? [];
      list.push(o);
      objectsByRoom.set(o.room_id, list);
    }

    for (const room of b.rooms) {
      const color = ROOM_KIND_COLORS[room.kind] ?? 0x52525b;
      // room floor plate (kind-coloured)
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(room.w, room.d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true, opacity: 0.32 })
      );
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(room.x + room.w / 2, 0.09, room.y + room.d / 2);
      group.add(plate);
      // thin wall frames (4 edges per room)
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.8 });
      const mkWall = (wx: number, wz: number, ww: number, wd: number) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.9, wd), wallMat);
        wall.position.set(wx, 0.5, wz);
        wall.castShadow = true;
        group.add(wall);
      };
      mkWall(room.x + room.w / 2, room.y, room.w, 0.12);
      mkWall(room.x + room.w / 2, room.y + room.d, room.w, 0.12);
      mkWall(room.x, room.y + room.d / 2, 0.12, room.d);
      mkWall(room.x + room.w, room.y + room.d / 2, 0.12, room.d);
      // objects
      for (const o of objectsByRoom.get(room.id) ?? []) {
        const obj = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.55, 0.55),
          new THREE.MeshStandardMaterial({
            color: OBJECT_COLORS[o.kind] ?? 0x52525b,
            roughness: 0.75,
          })
        );
        obj.position.set(o.x, 0.38, o.y);
        obj.castShadow = true;
        obj.userData = { object: o.id, name: o.name };
        group.add(obj);
      }
    }
    handles.scene.add(group);
    interiorGroupRef.current = group;

    // move the camera in close (dollhouse view)
    handles.camera.position.set(b.x + b.w / 2 + 7, 9, b.y + b.d / 2 + 10);
    handles.controls.target.set(b.x + b.w / 2, 0.5, b.y + b.d / 2);
    handles.controls.minDistance = 4;
    handles.controls.maxDistance = 60;
    return () => {
      handles.controls.minDistance = 15;
      handles.controls.maxDistance = 260;
    };
  }, [insideBuilding, layout?.bounds?.join(",")]);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["world"] });
    qc.invalidateQueries({ queryKey: ["residents"] });
  }, [qc]);

  const w = world.data;
  return (
    <div className="h-screen relative">
      {/* 3D canvas */}
      <div ref={mountRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      )}

      {/* HUD top-left */}
      <div className="absolute top-3 left-3 rounded-xl border border-zinc-800/80 bg-zinc-950/85 backdrop-blur px-4 py-3 text-sm space-y-1 pointer-events-none">
        <div className="font-semibold tracking-tight">
          {w?.world_name ?? "NEXUS WORLD"}
          {insideBuilding && <span className="text-cyan-300"> · interior view</span>}
        </div>
        <div className="font-mono text-xs text-zinc-400">
          {w?.clock.local_time ?? "—"} · {w?.clock.day_of_week ?? ""} · {w?.clock.season ?? ""}
        </div>
        <div className="font-mono text-xs text-zinc-500">
          tick {w?.tick ?? "—"} · {w?.weather ?? "—"} · {w?.population ?? "—"} residents
        </div>
        {w?.economy && (
          <div className="font-mono text-xs text-zinc-500">
            economy: {w.economy.businesses} businesses · {w.economy.transactions} tx · {w.economy.salaries_paid} paid/{w.economy.salaries_missed} missed
          </div>
        )}
      </div>

      {/* interior mode chip + exit */}
      {insideBuilding && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-cyan-800/60 bg-zinc-950/90 backdrop-blur px-3 py-2">
          <MapPin className="h-3.5 w-3.5 text-cyan-300" />
          <span className="text-xs text-zinc-300 font-mono">
            {layout?.buildings.find((b) => b.id === insideBuilding)?.name ?? insideBuilding} — interior (rooms + objects live)
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => {
              setInsideBuilding(null);
              setShellNote(null);
            }}
          >
            exit building
          </Button>
        </div>
      )}

      {shellNote && !insideBuilding && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 max-w-md rounded-xl border border-amber-800/60 bg-amber-950/70 backdrop-blur px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
          <span className="mt-0.5">⚠</span>
          <span>{shellNote}</span>
          <button onClick={() => setShellNote(null)} className="text-amber-400/70 hover:text-amber-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* HUD top-right controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
        <div className="flex gap-1.5 rounded-xl border border-zinc-800/80 bg-zinc-950/85 backdrop-blur p-1.5">
          <Button
            size="icon"
            variant={playing ? "default" : "ghost"}
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Pause simulation" : "Run simulation (1 tick / interval)"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="font-mono text-xs"
            disabled={tick.isPending}
            onClick={() => tick.mutate({ ticks: 1, cognition })}
          >
            {tick.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "+1 tick"}
          </Button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-800 rounded-md text-xs px-1.5 outline-none"
            title="Simulation speed"
          >
            <option value={4000}>0.25x</option>
            <option value={2000}>0.5x</option>
            <option value={1000}>1x</option>
            <option value={400}>2.5x</option>
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/85 backdrop-blur px-3 py-2">
          <Brain className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-400">LLM cognition</span>
          <Switch checked={cognition} onCheckedChange={setCognition} />
        </div>
        <Button size="sm" variant="outline" className="bg-zinc-950/85 backdrop-blur" onClick={refresh}>
          refresh state
        </Button>
      </div>

      {/* legend */}
      <div className="absolute bottom-3 left-3 rounded-xl border border-zinc-800/80 bg-zinc-950/85 backdrop-blur px-3 py-2.5 text-[11px] space-y-1 pointer-events-none">
        <div className="text-zinc-500 font-medium mb-1">live actions</div>
        {Object.entries(ACTION_COLORS).map(([a, c]) => (
          <div key={a} className="flex items-center gap-2 text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ background: `#${c.toString(16).padStart(6, "0")}` }} />
            {a}
          </div>
        ))}
        <div className="flex items-center gap-2 text-cyan-300 pt-1 border-t border-zinc-800/60 mt-1">
          <span className="h-2 w-2 rounded-full" style={{ background: "#67e8f9" }} />
          JARVIS (resident operator)
        </div>
        <div className="text-zinc-600 pt-1 border-t border-zinc-800/60 mt-1">click a resident to inspect their mind · click a building to enter (Sanctum, civic hall, food venues, shops)</div>
      </div>

      {/* selected resident panel */}
      {selected && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 md:left-auto md:right-3 md:translate-x-0 md:top-40 w-[92vw] max-w-sm max-h-[60vh] overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-950/92 backdrop-blur p-4 text-sm space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">
                {String(detail.data?.name ?? selected)}
                {detail.data?.role ? <span className="text-zinc-500 font-normal"> · {String(detail.data.role)}</span> : null}
                {detail.data?.is_jarvis ? (
                  <Badge variant="outline" className="ml-2 border-cyan-700/60 text-cyan-300">
                    JARVIS · operator
                  </Badge>
                ) : null}
              </div>
              <div className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" /> {String(detail.data?.at_building_name ?? "…")}
                {detail.data?.room_id ? <span className="text-zinc-600"> · {String((detail.data as Record<string, unknown>).room_id ? "indoors" : "")}</span> : null}
              </div>
              {typeof detail.data?.wallet === "number" && (
                <div className="text-xs text-zinc-500 font-mono">wallet {Math.round(detail.data.wallet as number)}</div>
              )}
            </div>
            <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          {detail.isLoading && <Skeleton className="h-24 w-full" />}
          {detail.data && (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="border-emerald-600/40 text-emerald-300">
                  {String(detail.data.action)}
                </Badge>
                <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                  mood {Number(detail.data.mood).toFixed(2)}
                </Badge>
                <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                  goal: {String((detail.data.goal as Record<string, unknown>)?.type)}
                </Badge>
                {(detail.data.goal_progress as Record<string, unknown>) && (
                  <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                    {String((detail.data.goal_progress as Record<string, unknown>).progress)}/
                    {String((detail.data.goal_progress as Record<string, unknown>).target)}{" "}
                    {String((detail.data.goal_progress as Record<string, unknown>).unit)}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries((detail.data.needs as Record<string, number>) ?? {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between bg-zinc-900/60 rounded-md px-2 py-1.5 border border-zinc-800/60">
                    <span className="text-zinc-500">{k}</span>
                    <span className="font-mono">{Math.round(Number(v))}</span>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Recent memories</div>
                <div className="space-y-1">
                  {((detail.data.memories as Array<{ text: string; kind: string; tick: number }>) ?? []).slice(0, 5).map((m, i) => (
                    <div key={i} className="text-xs text-zinc-400 bg-zinc-900/60 rounded-md px-2 py-1.5 border border-zinc-800/60">
                      <span className="text-zinc-600 font-mono mr-1.5">t{m.tick}</span>
                      {m.text}
                    </div>
                  ))}
                </div>
              </div>

              {((detail.data.relationships as Array<{ name: string; affinity: number; meetings: number }>) ?? []).length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Relationships</div>
                  <div className="flex flex-wrap gap-1">
                    {((detail.data.relationships as Array<{ name: string; affinity: number; meetings: number }>) ?? []).slice(0, 6).map((r, i) => (
                      <Badge key={i} variant="outline" className={r.affinity >= 2.5 ? "border-emerald-600/50 text-emerald-300" : "border-zinc-700 text-zinc-400"}>
                        {r.name} · {r.meetings}×
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-zinc-500 italic border-t border-zinc-800/60 pt-2">
                &ldquo;{String(detail.data.autobiography ?? "")}&rdquo;
              </p>
            </>
          )}
        </div>
      )}

      {tick.isError && (
        <div className="absolute bottom-3 right-3 rounded-lg border border-red-800/60 bg-red-950/70 px-3 py-2 text-xs text-red-300">
          tick failed: {(tick.error as Error)?.message}
        </div>
      )}
    </div>
  );
}
