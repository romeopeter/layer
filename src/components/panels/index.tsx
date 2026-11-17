import { useEditor, type Tool } from "../../store/editor";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { groupOf } from "../railTools";
import { UploadsPanel } from "./UploadsPanel";
import { BackgroundPanel } from "./BackgroundPanel";
import { MockupPanel } from "./MockupPanel";
import { ElementsPanel, LayersPanel } from "./ElementsPanel";
import { TextAddPanel } from "./TextControls";
import { WatermarkPanel } from "./WatermarkPanel";
import { ImagesPanel } from "./ImagesPanel";
import { LayoutPanel } from "./LayoutPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import { CustomizePanel } from "./CustomizePanel";
import { AnimatePanel } from "./AnimatePanel";
import { BrandKitPanel } from "./BrandKitPanel";
import { PanelTitle } from "./primitives";

interface Props {
  activeTool: Tool;
  onOpenCustomizeModal: () => void;
}

const View = ({ activeTool, onOpenCustomizeModal }: Props) => {
  switch (activeTool) {
    case "templates":
      return <TemplatesPanel />;
    case "images":
      return <ImagesPanel />;
    case "annotation":
      return <ElementsPanel />;
    case "header":
      return <TextAddPanel />;
    case "background":
      return <BackgroundPanel />;
    case "layout":
      return <LayoutPanel />;
    case "mockup":
      return <MockupPanel />;
    case "layers":
      return <LayersPanel />;
    case "watermark":
      return <WatermarkPanel />;
    case "brands":
      return <BrandKitPanel />;
    case "motion":
      return <AnimatePanel />;
    case "customize":
      return <CustomizePanel onOpenModal={onOpenCustomizeModal} />;
    default:
      return <UploadsPanel />;
  }
};

/**
 * The left panel: the rail group's name and tabs, then the tab's view. Each view
 * is about adding to or arranging the design; a selected object's own settings
 * are in the Properties panel on the right.
 */
export const PanelHost = (props: Props) => {
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const group = groupOf(props.activeTool);

  return (
    <div className="flex h-full flex-col">
      {group && (
        <div className="space-y-2.5 border-b border-hairline px-4 pb-3 pt-4">
          <PanelTitle className="mb-0">{group.label.toUpperCase()}</PanelTitle>
          {group.tabs.length > 1 && (
            <ToggleGroup
              type="single"
              aria-label={`${group.label} views`}
              value={props.activeTool}
              onValueChange={(value) => value && setActiveTool(value as Tool)}
              className="w-full"
            >
              {group.tabs.map((tab) => (
                <ToggleGroupItem key={tab.key} value={tab.key} className="cursor-pointer px-1">
                  {tab.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <View {...props} />
      </div>
    </div>
  );
};
