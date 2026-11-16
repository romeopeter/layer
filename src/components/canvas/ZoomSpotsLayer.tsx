import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Circle, Group, Layer, Rect, Text, Transformer } from "react-konva";
import type { CanvasSize } from "@/types";
import type { ZoomSpot } from "@/types/motion";
import { useEditor } from "@/store/editor";
import { SYSTEM_FONTS } from "@/lib/constants";
import { clampView } from "@/lib/motion/camera";
import { MAX_SPOT_ZOOM, MIN_SPOT_ZOOM } from "@/lib/motion/normalise";

/** Konva name the exporter hides before capture: spots say where to zoom, they aren't artwork. */
export const ZOOM_SPOTS_LAYER_NAME = "zoom-spots";

/* The app's purples (p-200, p-300, p-600), as the Transformer uses them. */
const SPOT_STROKE = "#AFA9EC";
const SPOT_ACTIVE = "#8B82DE";
const BADGE_FILL = "#534AB7";
const BADGE_TEXT = "#FFFFFF";

/** The window a spot shows, in canvas pixels. */
const spotBox = (spot: ZoomSpot, canvas: CanvasSize) => {
  const view = clampView({ cx: spot.cx, cy: spot.cy, zoom: spot.zoom });
  const width = canvas.width / view.zoom;
  const height = canvas.height / view.zoom;
  return { x: view.cx * canvas.width - width / 2, y: view.cy * canvas.height - height / 2, width, height };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Where the camera zooms, drawn over the canvas while Animate is open. Each is
 * the canvas's shape: drag its edge or number to move it, its corners to zoom.
 * Only the edge takes the pointer, so what's beneath can still be clicked.
 */
export const ZoomSpotsLayer = ({ spots, canvas, scale }: { spots: ZoomSpot[]; canvas: CanvasSize; scale: number }) => {
  const update = useEditor((s) => s.updateZoomSpot);
  const [active, setActive] = useState<string | null>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const groups = useRef(new Map<string, Konva.Group>());

  useEffect(() => {
    const node = active ? groups.current.get(active) : undefined;
    transformerRef.current?.nodes(node ? [node] : []);
    transformerRef.current?.getLayer()?.batchDraw();
  }, [active, spots]);

  return (
    <Layer name={ZOOM_SPOTS_LAYER_NAME}>
      {spots.map((spot, index) => {
        const box = spotBox(spot, canvas);
        const selected = active === spot.id;
        const badge = 13 / scale;
        return (
          <Group
            key={spot.id}
            name="zoom-spot"
            ref={(node) => {
              if (node) groups.current.set(spot.id, node);
              else groups.current.delete(spot.id);
            }}
            x={box.x}
            y={box.y}
            draggable
            onMouseDown={() => setActive(spot.id)}
            onTouchStart={() => setActive(spot.id)}
            onDragMove={(e) => {
              const node = e.target;
              node.x(clamp(node.x(), 0, canvas.width - box.width * node.scaleX()));
              node.y(clamp(node.y(), 0, canvas.height - box.height * node.scaleY()));
            }}
            onDragEnd={(e) => {
              const node = e.target;
              update(spot.id, {
                cx: (node.x() + box.width / 2) / canvas.width,
                cy: (node.y() + box.height / 2) / canvas.height,
              });
            }}
            onTransformEnd={(e) => {
              const node = e.target;
              const width = box.width * node.scaleX();
              const zoom = clamp(canvas.width / width, MIN_SPOT_ZOOM, MAX_SPOT_ZOOM);
              const middle = {
                x: node.x() + width / 2,
                y: node.y() + (box.height * node.scaleY()) / 2,
              };
              node.scaleX(1);
              node.scaleY(1);
              update(spot.id, { zoom, cx: middle.x / canvas.width, cy: middle.y / canvas.height });
            }}
          >
            <Rect
              width={box.width}
              height={box.height}
              stroke={selected ? SPOT_ACTIVE : SPOT_STROKE}
              strokeWidth={(selected ? 2 : 1.5) / scale}
              dash={[10 / scale, 6 / scale]}
              hitStrokeWidth={14 / scale}
              fillEnabled={false}
            />
            <Circle x={badge * 1.4} y={badge * 1.4} radius={badge} fill={BADGE_FILL} />
            <Text
              x={badge * 0.4}
              y={badge * 0.4}
              width={badge * 2}
              height={badge * 2}
              text={String(index + 1)}
              align="center"
              verticalAlign="middle"
              fontFamily={SYSTEM_FONTS[0]}
              fontStyle="bold"
              fontSize={badge * 1.1}
              fill={BADGE_TEXT}
              listening={false}
            />
          </Group>
        );
      })}
      <Transformer
        ref={transformerRef}
        rotateEnabled={false}
        keepRatio
        enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
        flipEnabled={false}
        ignoreStroke
        borderEnabled={false}
        anchorFill="#fff"
        anchorStroke={BADGE_FILL}
        anchorSize={9}
        boundBoxFunc={(oldBox, newBox) => {
          // Between 1.25× and 4× of the canvas, measured on screen.
          const min = (canvas.width / MAX_SPOT_ZOOM) * scale;
          const max = (canvas.width / MIN_SPOT_ZOOM) * scale;
          return newBox.width < min || newBox.width > max ? oldBox : newBox;
        }}
      />
    </Layer>
  );
};
