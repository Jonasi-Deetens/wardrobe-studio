import { ContactShadows, Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { Object3D } from "three";
import { unionBox, type Box3 } from "@/engine/core/geometry";
import { useCoarsePointer } from "../lib/useMediaQuery";
import { useProjectModel, useSelectedPart, useSelectedUnit } from "../store/derived";
import { useStudio } from "../store/useStudio";
import { CameraRig } from "./CameraRig";
import { Dimensions } from "./Dimensions";
import { Room } from "./Room";
import { SCENE_SCALE, sceneBounds } from "./scene";
import { Units } from "./Units";
import { ViewportControls } from "./ViewportControls";
import { ViewportLegend } from "./ViewportLegend";

/**
 * The 3D view.
 *
 * Every box here is a real panel from the solver, at its real size and position, standing
 * where it stands in the room, so what you orbit around is the same thing the cut list
 * describes. Clicking a panel selects it; double-clicking opens its drilling drawing, which
 * is the shortest path from "that one" to "here is where the holes go". Dragging the plate
 * under a unit moves the unit across the floor.
 */
export function Viewport() {
  const project = useProjectModel();
  const unit = useSelectedUnit();
  const selected = useSelectedPart();
  const grid = useStudio((state) => state.view.grid);
  const dimensions = useStudio((state) => state.view.dimensions);
  const showRoom = useStudio((state) => state.view.showRoom);
  const isolate = useStudio((state) => state.view.isolateUnit);
  const selectPart = useStudio((state) => state.selectPart);
  const hoverPart = useStudio((state) => state.hoverPart);

  /* What the camera frames, in room space. Isolating a unit frames that unit; hiding the
     room frames the units alone, so a single wardrobe in a big room still fills the view
     rather than sitting as a speck in the corner of an empty floor. */
  const bounds = useMemo(() => {
    if (isolate) return sceneBounds(unit.bounds);
    if (showRoom) return sceneBounds(project.bounds);
    const units = project.units.reduce<Box3 | null>(
      (acc, other) => (acc ? unionBox(acc, other.bounds) : other.bounds),
      null,
    );
    return sceneBounds(units ?? project.bounds);
  }, [isolate, showRoom, project, unit]);

  /* Dimensions are per unit and drawn in the unit's own space, so they follow it. */
  const wardrobe = unit.detail.kind === "wardrobe" ? unit.detail.model : null;
  const dimensionedPart = selected?.unitId === unit.id ? selected : null;

  const floorSize = Math.max(bounds.size[0], bounds.size[2]) * SCENE_SCALE * 6;

  /* The key light and its shadow frustum both follow the size of the wardrobe. */
  const light = useMemo(
    () => ({
      distance: Math.max(bounds.radius * 2.4, 3),
      extent: Math.max(bounds.radius * 1.35, 1.5),
    }),
    [bounds.radius],
  );

  /* A 2048² shadow map is four megabytes of texture. Phones do not need it and some
     cannot afford it, so coarse-pointer devices get a quarter of the resolution. */
  const coarse = useCoarsePointer();
  const shadowMapSize = coarse ? 1024 : 2048;

  /* A directional light aims at its target object, and three.js only reads that
     object's world matrix — which means it has to be in the scene graph. Left at the
     default, the light aims at the world origin and the tight shadow frustum below
     would miss the wardrobe entirely. */
  const lightTarget = useMemo(() => new Object3D(), []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <Canvas
        shadows
        /* A phone at devicePixelRatio 3 renders nine times the pixels of a laptop for a
           view a fraction of the size; capping at 1.5 keeps the frame rate usable. */
        dpr={coarse ? [1, 1.5] : [1, 2]}
        gl={{ antialias: !coarse, preserveDrawingBuffer: true, alpha: false }}
        /* Without this the browser scrolls the page instead of orbiting the model. */
        style={{ touchAction: "none" }}
        onPointerMissed={() => {
          selectPart(null);
          hoverPart(null);
        }}
        onCreated={({ gl }) => {
          gl.setClearColor("#16181c");
        }}
      >
        <Suspense fallback={null}>
          <CameraRig bounds={bounds} />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.12}
            rotateSpeed={0.75}
            zoomSpeed={0.85}
            panSpeed={0.8}
            minDistance={0.25}
            maxDistance={Math.max(bounds.radius * 14, 12)}
            maxPolarAngle={Math.PI * 0.52}
          />

          {/* A key light high and to the front-left, a cool fill from the opposite side,
              and a dim bounce from below. Panels of the same colour then still read as
              separate faces, which flat lighting destroys. */}
          <hemisphereLight intensity={0.45} groundColor="#22242a" color="#cfd8e6" />
          <primitive object={lightTarget} position={bounds.sceneCenter} />
          <directionalLight
            position={[
              bounds.sceneCenter[0] - light.distance * 0.45,
              bounds.sceneCenter[1] + light.distance * 0.9,
              bounds.sceneCenter[2] + light.distance * 0.75,
            ]}
            target={lightTarget}
            intensity={2.1}
            castShadow
            shadow-mapSize={[shadowMapSize, shadowMapSize]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
          >
            {/* Sized from the model rather than fixed: a 3m run of wardrobes fell outside
                a hard-coded 2.5m frustum and simply stopped casting a shadow. */}
            <orthographicCamera
              attach="shadow-camera"
              args={[
                -light.extent,
                light.extent,
                light.extent,
                -light.extent,
                0.1,
                light.distance * 3,
              ]}
            />
          </directionalLight>
          <directionalLight position={[2.8, 1.6, -1.8]} intensity={0.5} color="#a8c4e8" />

          {/* The engine works in millimetres; one group scale is all it takes to put the
              room and everything in it into the metres the rest of the scene is built in. */}
          <group scale={SCENE_SCALE}>
            {showRoom && !isolate ? <Room room={project.room} /> : null}
            <Units project={project} />
          </group>

          {/* Dimension lines scale themselves, so they hang outside that group — but they
              still have to travel with the unit they measure. */}
          {dimensions && wardrobe ? (
            <group
              position={[unit.at.x * SCENE_SCALE, 0, unit.at.z * SCENE_SCALE]}
              rotation-y={(unit.at.yaw * Math.PI) / 180}
            >
              <Dimensions model={wardrobe} selected={dimensionedPart} />
            </group>
          ) : null}

          <ContactShadows
            position={[bounds.sceneCenter[0], bounds.floorY + 0.001, bounds.sceneCenter[2]]}
            scale={Math.max(floorSize, 4)}
            resolution={coarse ? 512 : 1024}
            blur={2.4}
            opacity={0.5}
            far={1.2}
            color="#000000"
          />

          {grid ? (
            <Grid
              position={[bounds.sceneCenter[0], bounds.floorY, bounds.sceneCenter[2]]}
              args={[floorSize, floorSize]}
              cellSize={0.1}
              cellThickness={0.5}
              cellColor="#2c3038"
              sectionSize={0.5}
              sectionThickness={1}
              sectionColor="#3c4250"
              fadeDistance={Math.max(bounds.radius * 16, 14)}
              fadeStrength={1.4}
              infiniteGrid
              followCamera={false}
            />
          ) : null}
        </Suspense>
      </Canvas>

      <ViewportControls />
      <ViewportLegend />
    </div>
  );
}
