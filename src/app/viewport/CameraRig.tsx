import { OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Color, Vector3, type Camera, type OrthographicCamera as OrthoCam } from "three";
import { useStudio, type StandardView } from "../store/useStudio";
import { dataUrlToBytes, registerCapturer, VIEW_LABELS, type CapturedView } from "./capture";
import { SCENE_SCALE, type SceneBounds } from "./scene";

/** Unit direction the camera sits in for each standard view, in scene axes. */
const DIRECTIONS: Record<StandardView, readonly [number, number, number]> = {
  front: [0, 0.06, 1],
  back: [0, 0.06, -1],
  left: [-1, 0.06, 0],
  right: [1, 0.06, 0],
  top: [0, 1, 0.001],
  iso: [0.72, 0.5, 0.86],
};

type Controls = {
  target: Vector3;
  update: () => void;
  enabled: boolean;
};

type CameraRigProps = {
  readonly bounds: SceneBounds;
};

/**
 * Camera, projection toggle and the standard views.
 *
 * Orthographic is not a gimmick here: a front elevation with no perspective is how you
 * check that reveals are even, and a plan view is how you check depths. The two cameras
 * hand over at the same distance and target so switching does not lose your place.
 */
export function CameraRig({ bounds }: CameraRigProps) {
  const projection = useStudio((state) => state.view.projection);
  const request = useStudio((state) => state.view.viewRequest);
  const { camera, controls, gl, scene, size } = useThree();

  const goal = useRef<{ position: Vector3; target: Vector3; zoom: number } | null>(null);
  /** The pose the user last left the view in, so a projection swap can inherit it. */
  const pose = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  const framed = useRef<string | null>(null);

  const distanceFor = (view: StandardView): number => {
    const padding = view === "iso" ? 2.45 : 2.2;
    return Math.max(bounds.radius * padding, 0.8);
  };

  const zoomFor = (): number => {
    const span = Math.max(bounds.size[0], bounds.size[1]) * SCENE_SCALE;
    return (Math.min(size.width, size.height) / Math.max(span, 0.2)) * 0.78;
  };

  /* Frame the wardrobe the first time a camera takes over, then never fight the user
     again. This runs per camera rather than once, because the default camera is swapped
     out when this component mounts and again on every projection change — a camera left
     at the origin sits inside the carcase and renders nothing. */
  useEffect(() => {
    if (framed.current === camera.uuid) return;
    framed.current = camera.uuid;

    const inherited = pose.current;
    const target = inherited ? inherited.target.clone() : new Vector3(...bounds.sceneCenter);
    if (inherited) {
      camera.position.copy(inherited.position);
    } else {
      const direction = new Vector3(...DIRECTIONS.iso).normalize();
      camera.position.copy(target).addScaledVector(direction, distanceFor("iso"));
    }
    camera.lookAt(target);
    if (isOrtho(camera)) {
      camera.zoom = zoomFor();
      camera.updateProjectionMatrix();
    }

    const orbit = controls as unknown as Controls | null;
    if (orbit?.target) {
      orbit.target.copy(target);
      orbit.update();
    }
    pose.current = { position: camera.position.clone(), target };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controls, bounds]);

  useEffect(() => {
    if (!request) return;
    const direction = new Vector3(...DIRECTIONS[request.view]).normalize();
    const target = new Vector3(...bounds.sceneCenter);
    goal.current = {
      position: target.clone().addScaledVector(direction, distanceFor(request.view)),
      target,
      zoom: zoomFor(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useFrame((_, delta) => {
    const orbit = controls as unknown as Controls | null;
    const next = goal.current;
    if (!next) {
      /* Remember where the user is, so switching projection keeps their place. */
      const held = pose.current;
      if (held) {
        held.position.copy(camera.position);
        if (orbit?.target) held.target.copy(orbit.target);
      }
      return;
    }
    const step = Math.min(1, delta * 7);
    camera.position.lerp(next.position, step);
    if (orbit?.target) {
      orbit.target.lerp(next.target, step);
      orbit.update();
    } else {
      camera.lookAt(next.target);
    }
    if (isOrtho(camera)) {
      camera.zoom += (next.zoom - camera.zoom) * step;
      camera.updateProjectionMatrix();
    }
    if (camera.position.distanceTo(next.position) < 0.002) {
      camera.position.copy(next.position);
      pose.current = { position: camera.position.clone(), target: next.target.clone() };
      goal.current = null;
    }
  });

  /* Capture for the booklet cover. Rendering each view synchronously and reading the
     canvas avoids any dance with React state, and restoring the camera afterwards means
     the user never sees it happen. */
  useEffect(() => {
    registerCapturer((views) => {
      const captured: CapturedView[] = [];
      const savedPosition = camera.position.clone();
      const savedQuaternion = camera.quaternion.clone();
      const savedZoom = isOrtho(camera) ? camera.zoom : 1;
      const savedBackground = scene.background;
      const savedFog = scene.fog;

      scene.background = new Color("#f4f2ef");
      scene.fog = null;

      try {
        for (const view of views) {
          const direction = new Vector3(...DIRECTIONS[view]).normalize();
          const target = new Vector3(...bounds.sceneCenter);
          camera.position.copy(target).addScaledVector(direction, distanceFor(view));
          camera.lookAt(target);
          if (isOrtho(camera)) {
            camera.zoom = zoomFor();
            camera.updateProjectionMatrix();
          }
          camera.updateMatrixWorld();
          gl.render(scene, camera);
          captured.push({
            label: VIEW_LABELS[view],
            png: dataUrlToBytes(gl.domElement.toDataURL("image/png")),
          });
        }
      } finally {
        scene.background = savedBackground;
        scene.fog = savedFog;
        camera.position.copy(savedPosition);
        camera.quaternion.copy(savedQuaternion);
        if (isOrtho(camera)) {
          camera.zoom = savedZoom;
          camera.updateProjectionMatrix();
        }
        camera.updateMatrixWorld();
        gl.render(scene, camera);
      }
      return captured;
    });
    return () => registerCapturer(null);
  }, [camera, gl, scene, bounds, size]);

  const far = Math.max(bounds.radius * 40, 60);

  return projection === "perspective" ? (
    <PerspectiveCamera makeDefault fov={38} near={0.02} far={far} />
  ) : (
    <OrthographicCamera makeDefault near={-far} far={far} zoom={zoomFor()} />
  );
}

function isOrtho(camera: Camera): camera is OrthoCam {
  return (camera as OrthoCam).isOrthographicCamera === true;
}
