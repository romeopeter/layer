import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type Konva from "konva";
import { Image as KImage, Group, Rect } from "react-konva";
import useImage from "use-image";
import type { ImageElement } from "../../types";
import { useEditor } from "../../store/editor";
import { visibleCrop } from "@/lib/layouts";
import {
  browserLookOf,
  frameArtUrl,
  frameShapeOf,
  hasArtwork,
  isFrameTurned,
  pictureView,
  screenBoxOf,
  screenPathOf,
  sourceOf,
} from "@/lib/mockups";
import type { LayoutSurface } from "@/lib/layouts";
import { DEFAULT_IMAGE_TILT } from "@/lib/tilt";
import { isTiltSupported, renderTilt, tiltBoxOf, tiltCorners, type TiltLook } from "@/lib/tiltRender";
import { imageTurnOf, turnedFurther, type ImageTurn } from "@/lib/turn";
import { registerObjectPainter } from "@/lib/motion/pose";
import { sameNodeProps } from "./nodeProps";
import { BrowserBack, BrowserFront } from "./BrowserFrame";
import { useEditedImage } from "./useEditedImage";
import { useGifFrames } from "./useGifFrames";
import { useAltHeld } from "./usePictureDrag";
import { WindowBack, WindowFront } from "./WindowFrame";
import { FLAT_MOCKUP_NAME } from "./flatMockup";
import { useTurnedMockup } from "./useTurnedMockup";

/* ----------------------------------------------------------------- */

interface Props {
  el: ImageElement;
  selected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  /** Its layout's, when the layout is tilted as one surface. */
  surface?: LayoutSurface | null;
}

const shadowProps = (el: ImageElement) =>
  el.shadow?.enabled
    ? {
        shadowColor: el.shadow.color,
        shadowBlur: el.shadow.blur,
        shadowOffsetX: el.shadow.offsetX,
        shadowOffsetY: el.shadow.offsetY,
        shadowOpacity: 1,
      }
    : {};

/** A tilted picture is drawn at twice its size, so it's sharp in a 2× export too. */
const TILT_SCALE = 2;

/** The part of the picture that shows, as a texture: an edited picture already has its crop. */
const useTextureSource = (
  picture: CanvasImageSource | undefined,
  edited: boolean,
  crop: ReturnType<typeof visibleCrop>,
) =>
  useMemo((): TexImageSource | null => {
    if (!picture) return null;
    if (edited || !crop || !(picture instanceof HTMLImageElement)) return picture as TexImageSource;
    const part = document.createElement("canvas");
    part.width = Math.max(1, Math.round(crop.width * picture.naturalWidth));
    part.height = Math.max(1, Math.round(crop.height * picture.naturalHeight));
    part.getContext("2d")?.drawImage(
      picture,
      crop.x * picture.naturalWidth,
      crop.y * picture.naturalHeight,
      part.width,
      part.height,
      0,
      0,
      part.width,
      part.height,
    );
    return part;
  }, [picture, edited, crop]);

/** The part of a GIF's current frame that shows, drawn into `out`, as a tilt's texture. */
const drawCropped = (frame: HTMLCanvasElement, crop: NonNullable<ReturnType<typeof visibleCrop>>, out: HTMLCanvasElement) => {
  const width = Math.max(1, Math.round(crop.width * frame.width));
  const height = Math.max(1, Math.round(crop.height * frame.height));
  if (out.width !== width || out.height !== height) {
    out.width = width;
    out.height = height;
  }
  const g = out.getContext("2d");
  g?.clearRect(0, 0, width, height);
  g?.drawImage(frame, crop.x * frame.width, crop.y * frame.height, width, height, 0, 0, width, height);
};

/** The look of an image turned, further still by an animation's pose. */
const tiltLookOf = (el: ImageElement, turn: ImageTurn | null, turnX = 0, turnY = 0): TiltLook => {
  const { tilt, plane } = turnedFurther(turn ?? { tilt: { ...DEFAULT_IMAGE_TILT } }, turnX, turnY);
  return {
    tilt,
    width: el.width,
    height: el.height,
    cornerRadius: el.cornerRadius,
    border: el.border?.enabled ? el.border : null,
    plane,
  };
};

/**
 * The picture drawn tilted, and where it goes, when the image is turned in 3D (by its
 * own tilt or its layout's) and has no frame. Null otherwise. Kept in step with every
 * change to the image.
 */
const useTiltedPicture = (
  el: ImageElement,
  source: TexImageSource | null,
  turn: ImageTurn | null,
  onDraw: () => void,
) => {
  const active = !el.deviceFrame && !!turn && isTiltSupported();
  const out = useMemo(() => document.createElement("canvas"), []);
  const look = useMemo(
    () => tiltLookOf(el, turn),
    [turn, el.width, el.height, el.cornerRadius, el.border], // eslint-disable-line react-hooks/exhaustive-deps -- only these feed it
  );
  // Where the tilted picture goes, worked out from the tilt alone.
  const box = useMemo(() => tiltBoxOf(tiltCorners(look)), [look]);
  const drawRef = useRef(onDraw);
  useEffect(() => {
    drawRef.current = onDraw;
  });

  useLayoutEffect(() => {
    if (!active || !source) return;
    renderTilt(source, look, TILT_SCALE, out);
    drawRef.current();
  }, [active, source, look, out]);

  // Drawn again from the same source, whose pixels changed: a GIF's next frame.
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  });
  const redraw = useCallback(() => {
    if (!active || !sourceRef.current) return;
    renderTilt(sourceRef.current, look, TILT_SCALE, out);
    drawRef.current();
  }, [active, look, out]);

  return active ? { canvas: out, box, redraw } : null;
};

const ImageNodeBody = ({ el, onSelect, surface }: Props) => {
  // How it's turned in 3D, if at all: by its own tilt, or with its tilted layout.
  const turn = useMemo(() => imageTurnOf(el, surface), [el, surface]);
  const [img] = useImage(el.src, "anonymous");
  const frame = el.deviceFrame;
  const usesArt = !!frame && hasArtwork(frame);
  const [art] = useImage(usesArt ? frameArtUrl(frame) : "", "anonymous");
  const pictureRef = useRef<Konva.Image>(null);
  const crop = useMemo(() => visibleCrop(el), [el.crop, el.layoutCrop]); // eslint-disable-line react-hooks/exhaustive-deps -- only these two feed it
  const inLayout = useEditor((s) => !!s.layout?.slots.some((slot) => slot.id === el.id));
  // An animated GIF shows its current frame; a new frame redraws it, tilted or not.
  const onGifFrame = useRef(() => {});
  const gif = useGifFrames(el, () => onGifFrame.current());
  // Edits are for still pictures: a GIF plays as it is.
  const { picture: still, edited } = useEditedImage(
    img,
    gif ? undefined : el.edit,
    crop,
    () => pictureRef.current?.getLayer()?.batchDraw(),
  );
  const picture = gif ? gif.canvas : still;
  /** The size crops are measured against: a GIF's frames may be decoded smaller than the file. */
  const sourceWidth = gif ? gif.canvas.width : (img?.naturalWidth ?? 0);
  const sourceHeight = gif ? gif.canvas.height : (img?.naturalHeight ?? 0);
  const update = useEditor((s) => s.updateElement);
  const altHeld = useAltHeld();

  // Images saved before this was recorded learn their size on first load.
  useEffect(() => {
    if (img && el.naturalWidth === undefined) {
      useEditor.getState().setNaturalSize(el.id, img.naturalWidth, img.naturalHeight);
    }
  }, [img, el.id, el.naturalWidth]);

  const sp = shadowProps(el);
  const cropping = useEditor((s) => s.cropId === el.id);
  const stillTexture = useTextureSource(gif ? undefined : picture, edited, crop);
  // A cropped GIF's texture is the visible part of each frame, drawn again as it changes.
  const gifCrop = useMemo(() => document.createElement("canvas"), []);
  const texture: TexImageSource | null = gif ? (crop ? gifCrop : gif.canvas) : stillTexture;
  const tilted = useTiltedPicture(el, texture, turn, () => pictureRef.current?.getLayer()?.batchDraw());
  // A mockup turned in 3D: drawn from its own flat group, which it shows in place of.
  const flatRef = useRef<Konva.Group>(null);
  const turnedRef = useRef<Konva.Image>(null);
  const turned = useTurnedMockup(el, flatRef, !!img && !!picture && (!usesArt || !!art), picture, turn, () =>
    turnedRef.current?.getLayer()?.batchDraw(),
  );
  useEffect(() => {
    onGifFrame.current = () => {
      if (gif && crop) drawCropped(gif.canvas, crop, gifCrop);
      if (tilted) tilted.redraw();
      else if (turned.shown) turned.redraw();
      else pictureRef.current?.getLayer()?.batchDraw();
    };
  });
  // The first frame landed before the handler above was set, so it's drawn through it once.
  const gifCanvas = gif?.canvas;
  useEffect(() => {
    if (gifCanvas) onGifFrame.current();
  }, [gifCanvas]);

  // An animation can turn the picture or mockup in 3D, flat or not: drawn into a picture
  // of its own.
  const posedRef = useRef<Konva.Image>(null);
  const posedCanvas = useMemo(() => document.createElement("canvas"), []);
  const turnedShown = turned.shown && !cropping;
  const flatVisible = !cropping && !turnedShown;
  const latest = useRef({ el, turn, texture, animated: !!gif, posePicture: turned.pose, flatVisible });
  useEffect(() => {
    latest.current = { el, turn, texture, animated: !!gif, posePicture: turned.pose, flatVisible };
  });
  useEffect(
    () =>
      registerObjectPainter(el.id, (pose, options) => {
        const posed = posedRef.current;
        const { el: now, turn: how, texture: source, animated, posePicture, flatVisible: flatShows } = latest.current;
        const framed = !!now.deviceFrame;
        const shown = framed ? turnedRef.current : pictureRef.current;
        const flat = framed ? flatRef.current : null;
        const border = framed ? null : shown?.getParent()?.findOne(".picture-border");
        const turning =
          !!pose && (pose.tiltX !== 0 || pose.tiltY !== 0) && (framed || !!source) && !!posed && isTiltSupported();
        if (!turning) {
          posed?.visible(false);
          shown?.visible(true);
          flat?.visible(flatShows);
          border?.visible(true);
          return;
        }
        // A still picture is turned again every frame, so it stays on the GPU meanwhile;
        // a GIF's changes with every frame, so it's sent each time.
        const scale = options.preview ? 1 : Math.max(TILT_SCALE, options.scale);
        const box = framed
          ? posePicture(pose.tiltX, pose.tiltY, scale, posedCanvas, animated)
          : source && renderTilt(source, tiltLookOf(now, how, pose.tiltX, pose.tiltY), scale, posedCanvas, !animated);
        if (!box) return;
        posed.setAttrs({ image: posedCanvas, ...box, visible: true });
        shown?.visible(false);
        flat?.visible(false);
        border?.visible(false);
      }),
    [el.id, posedCanvas],
  );

  // Holds the node while the image loads: a new image is selected straight away,
  // and the Transformer only attaches to nodes that already exist.
  if (!img || !picture || (usesArt && !art)) {
    return (
      <Group id={el.id} x={el.x} y={el.y} rotation={el.rotation} visible={!el.hidden}>
        <Rect width={el.width} height={el.height} opacity={0} />
      </Group>
    );
  }

  const onTransform = (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const sx = node.scaleX(); const sy = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    update(el.id, {
      x: node.x(), y: node.y(),
      width: el.width * sx,
      height: el.height * sy,
      rotation: node.rotation(),
    });
  };

  const nodeProps = {
    id: el.id,
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    opacity: el.opacity,
    // Alt-dragging moves a mockup's picture instead; see usePictureDrag.
    draggable: !el.locked && !inLayout && !(frame && altHeld),
    visible: !el.hidden,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
      update(el.id, { x: e.target.x(), y: e.target.y() }),
    onTransform,
  };

  const shape = frameShapeOf(el);
  if (!frame || !shape) {
    return (
      <Group {...sp} {...nodeProps}>
        {tilted ? (
          <>
            {/* The element's own box, for selecting and handles; the tilt can spill past it. */}
            <Rect width={el.width} height={el.height} opacity={0} />
            <KImage
              ref={pictureRef}
              name="tilted-picture"
              image={tilted.canvas}
              {...tilted.box}
              visible={!cropping}
              listening={false}
              {...sp}
            />
          </>
        ) : (
          <KImage
            ref={pictureRef}
            image={picture}
            width={el.width}
            height={el.height}
            visible={!cropping}
            // An edited picture has the crop baked in.
            crop={
              !edited && crop ? {
                x: crop.x * sourceWidth,
                y: crop.y * sourceHeight,
                width: crop.width * sourceWidth,
                height: crop.height * sourceHeight,
              } : undefined
            }
            cornerRadius={Math.min(el.cornerRadius, el.width / 2, el.height / 2)}
          />
        )}
        {!tilted && el.border?.enabled && el.border.width > 0 && (
          // Inside the edge, so the image keeps its size and the border follows its corners.
          <Rect
            name="picture-border"
            x={el.border.width / 2}
            y={el.border.width / 2}
            width={Math.max(0, el.width - el.border.width)}
            height={Math.max(0, el.height - el.border.width)}
            cornerRadius={Math.max(0, Math.min(el.cornerRadius, el.width / 2, el.height / 2) - el.border.width / 2)}
            stroke={el.border.color}
            strokeWidth={el.border.width}
            visible={!cropping}
            listening={false}
          />
        )}
        {/* Hidden unless an animation is turning the picture. See the painter above. */}
        <KImage ref={posedRef} name="posed-picture" image={posedCanvas} visible={false} listening={false} {...sp} />
      </Group>
    );
  }

  // The picture is drawn on the screen, and only ever the part that lands on it. Filling
  // means taking a part with the screen's shape, so it's never stretched.
  const screen = screenBoxOf(el, shape);
  // An edited picture has the crop baked in.
  const source = edited
    ? { x: 0, y: 0, width: picture.width as number, height: picture.height as number }
    : sourceOf(crop, sourceWidth, sourceHeight);
  const { drawn, shown } = pictureView(source, screen, frame);

  const path = screenPathOf(el, shape);
  const pictureNodes = (
    <Group
      clipFunc={(ctx) => {
        const { x, y, width, height, corners } = path;
        const [topLeft, topRight, bottomRight, bottomLeft] = corners;
        ctx.beginPath();
        ctx.moveTo(x + topLeft, y);
        ctx.arcTo(x + width, y, x + width, y + height, topRight);
        ctx.arcTo(x + width, y + height, x, y + height, bottomRight);
        ctx.arcTo(x, y + height, x, y, bottomLeft);
        ctx.arcTo(x, y, x + width, y, topLeft);
        ctx.closePath();
      }}
    >
      <Rect {...screen} fill={frame.barColor} listening={false} />
      <KImage ref={pictureRef} name="mockup-picture" image={picture} {...drawn} crop={shown} />
    </Group>
  );

  // Turned in 3D, it shows a drawing of itself; the flat mockup stays, hidden, as what
  // that drawing is made from.
  const turnedNodes = (
    <>
      {/* The element's own box, for selecting and handles; the turn can spill past it. */}
      {turnedShown && <Rect width={el.width} height={el.height} opacity={0} />}
      {turnedShown && turned.box && (
        <KImage ref={turnedRef} name="turned-mockup" image={turned.canvas} {...turned.box} listening={false} {...sp} />
      )}
      {/* Hidden unless an animation is turning the mockup. See the painter above. */}
      <KImage ref={posedRef} name="posed-picture" image={posedCanvas} visible={false} listening={false} {...sp} />
    </>
  );

  if (usesArt && art) {
    // Drawn twice: a shadow cast by the frame would otherwise fall across the screen.
    const artProps = isFrameTurned(frame)
      ? { x: 0, y: el.height, width: el.height, height: el.width, rotation: -90 }
      : { width: el.width, height: el.height };
    return (
      <Group {...nodeProps}>
        <Group ref={flatRef} name={FLAT_MOCKUP_NAME} visible={flatVisible}>
          {el.shadow?.enabled && <KImage image={art} {...artProps} {...sp} listening={false} />}
          {pictureNodes}
          <KImage name="mockup-frame" image={art} {...artProps} />
        </Group>
        {turnedNodes}
      </Group>
    );
  }

  const isBrowser = !!browserLookOf(frame);
  return (
    <Group {...nodeProps}>
      <Group ref={flatRef} name={FLAT_MOCKUP_NAME} visible={flatVisible}>
        {isBrowser ? (
          <BrowserBack el={el} frame={frame} shadow={sp} path={path} />
        ) : (
          <WindowBack el={el} frame={frame} shadow={sp} path={path} />
        )}
        {pictureNodes}
        {isBrowser ? (
          <BrowserFront el={el} frame={frame} />
        ) : (
          <WindowFront el={el} frame={frame} path={path} />
        )}
      </Group>
      {turnedNodes}
    </Group>
  );
};

export const ImageNode = memo(ImageNodeBody, sameNodeProps);
