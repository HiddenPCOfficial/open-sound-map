"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { LocatedEvent, Location } from "./useLocatedEvents";

function position({ lat, lon }: Location, radius = 1) {
  const phi = THREE.MathUtils.degToRad(lat),
    theta = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(theta),
  );
}
export function EarthScene({
  events,
  selected,
  onSelect,
}: {
  events: LocatedEvent[];
  selected: LocatedEvent | null;
  onSelect: (e: LocatedEvent) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<{
    markers: THREE.Group;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
  } | null>(null);
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  const [error, setError] = useState("");
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() =>
        setError(
          "Il browser non supporta WebGL. Puoi continuare dalla vista Lista.",
        ),
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Globo terrestre interattivo: trascina per ruotare, usa la rotella per ingrandire",
    );
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 50);
    camera.position.set(2.8, 1.5, -1.7);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.12;
    controls.maxDistance = 5;
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    controls.autoRotateSpeed = 0.3;
    scene.add(new THREE.AmbientLight(0xb9eaff, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(4, 3, 5);
    scene.add(sun);
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshPhongMaterial({ color: 0x103d58, shininess: 22 }),
    );
    scene.add(earth);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.018, 64, 48),
      new THREE.MeshBasicMaterial({
        color: 0x4ebddd,
        transparent: true,
        opacity: 0.09,
        side: THREE.BackSide,
      }),
    );
    scene.add(atmosphere);
    const markers = new THREE.Group();
    scene.add(markers);
    runtime.current = { markers, camera, controls };
    const abort = new AbortController();
    fetch("/geo/countries-110m.json", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((topology: Topology<{ countries: GeometryCollection }>) => {
        if (abort.signal.aborted) return;
        // Equirectangular land texture, generated locally from the same country data.
        const map = document.createElement("canvas");
        map.width = 2048;
        map.height = 1024;
        const context = map.getContext("2d");
        if (context) {
          context.fillStyle = "#103d58";
          context.fillRect(0, 0, map.width, map.height);
          const countries = feature(topology, topology.objects.countries);
          countries.features.forEach((country, index) => {
            const geometry = country.geometry;
            const polygons =
              geometry.type === "Polygon"
                ? [geometry.coordinates]
                : geometry.type === "MultiPolygon"
                  ? geometry.coordinates
                  : [];
            context.fillStyle = ["#255f69", "#296873", "#235562", "#2b6268"][
              index % 4
            ];
            for (const polygon of polygons) {
              // Unwrap longitude so polygons crossing the date line do not fill the ocean.
              for (const offset of [-2048, 0, 2048]) {
                context.beginPath();
                for (const ring of polygon) {
                  let previous = ring[0][0];
                  ring.forEach(([longitude, latitude], i) => {
                    let lon = longitude;
                    while (lon - previous > 180) lon -= 360;
                    while (lon - previous < -180) lon += 360;
                    previous = lon;
                    const x = ((lon + 180) / 360) * 2048 + offset,
                      y = ((90 - latitude) / 180) * 1024;
                    if (i === 0) context.moveTo(x, y);
                    else context.lineTo(x, y);
                  });
                  context.closePath();
                }
                context.fill("evenodd");
              }
            }
          });
          const texture = new THREE.CanvasTexture(map);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          earth.material.color.set(0xffffff);
          earth.material.map = texture;
          earth.material.needsUpdate = true;
        }
        const borders = mesh(topology, topology.objects.countries);
        const vertices: number[] = [];
        for (const line of borders.coordinates)
          for (let i = 1; i < line.length; i++) {
            const a = position(
              { lon: line[i - 1][0], lat: line[i - 1][1] },
              1.003,
            );
            const b = position({ lon: line[i][0], lat: line[i][1] }, 1.003);
            vertices.push(...a.toArray(), ...b.toArray());
          }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(vertices, 3),
        );
        scene.add(
          new THREE.LineSegments(
            geometry,
            new THREE.LineBasicMaterial({
              color: 0x9dddd1,
              transparent: true,
              opacity: 0.85,
            }),
          ),
        );
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "Impossibile caricare i confini. I punti restano interattivi.",
          );
      });
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    const raycaster = new THREE.Raycaster();
    let start = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY };
      controls.autoRotate = false;
    };
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = raycaster.intersectObjects([earth, ...markers.children])[0];
      if (hit?.object.userData.event) select.current(hit.object.userData.event);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      abort.abort();
      resize.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          object.geometry.dispose();
          if (
            object instanceof THREE.Mesh &&
            object.material instanceof THREE.MeshPhongMaterial
          )
            object.material.map?.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, []);
  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    for (const child of [...current.markers.children]) {
      const dot = child as THREE.Mesh<
        THREE.SphereGeometry,
        THREE.MeshBasicMaterial
      >;
      dot.geometry.dispose();
      dot.material.dispose();
      current.markers.remove(dot);
    }
    for (const event of events) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(
          selected?.id === event.id ? 0.019 : 0.011,
          12,
          8,
        ),
        new THREE.MeshBasicMaterial({
          color:
            selected?.id === event.id
              ? 0xffd48a
              : event.bot
                ? 0xb18ada
                : event.anonymous
                  ? 0x2ecc71
                  : 0xffffff,
        }),
      );
      dot.position.copy(position(event.location, 1.014));
      dot.userData.event = event;
      current.markers.add(dot);
    }
  }, [events, selected]);
  useEffect(() => {
    if (!selected || !runtime.current) return;
    runtime.current.controls.autoRotate = false;
    runtime.current.camera.position.copy(position(selected.location, 1.65));
    runtime.current.controls.update();
  }, [selected]);
  return (
    <>
      <div ref={host} className="earth-canvas" />
      {error && (
        <p className="globe-error" role="status">
          {error}
        </p>
      )}
    </>
  );
}
