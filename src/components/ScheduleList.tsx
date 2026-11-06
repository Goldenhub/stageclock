import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, Plus, ArrowDown, ArrowUp } from "lucide-react";
import type { Schedule, ScheduleItem, TimerState } from "../types";
import { formatHMS } from "../utils/timeFormat";

interface ItemRowProps {
  item: ScheduleItem;
  index: number;
  status: "on-air" | "loaded" | "next" | "done" | null;
  progress: number | null;
  onLoad: (item: ScheduleItem) => void;
  onEdit: (item: ScheduleItem) => void;
  onDelete: (item: ScheduleItem) => void;
}

function SortableItem({ item, index, status, progress, onLoad, onEdit, onDelete }: ItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  const active = status === "on-air" || status === "loaded";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative overflow-hidden rounded-lg border transition-colors ${
        isDragging
          ? "border-brand bg-zinc-800 shadow-xl"
          : status === "on-air"
          ? "border-red-500/50 bg-red-500/[0.07]"
          : status === "loaded"
          ? "border-brand/50 bg-brand/[0.08]"
          : "border-transparent hover:border-zinc-800 hover:bg-zinc-900"
      }`}
    >
      <div className="flex items-center gap-1 py-2 pl-1 pr-2">
        {/* Index, replaced by a drag handle on hover */}
        <div
          {...attributes}
          {...listeners}
          className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-zinc-600 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <span className={`text-xs tabular-nums group-hover:hidden ${active ? "text-zinc-300" : ""}`}>
            {index + 1}
          </span>
          <GripVertical size={14} className="hidden group-hover:block" />
        </div>

        <button
          type="button"
          onClick={() => onLoad(item)}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
          title="Load onto the clock"
        >
          <span
            className={`w-full truncate text-[13px] font-medium ${
              active ? "text-white" : status === "done" ? "text-zinc-500" : "text-zinc-200"
            }`}
          >
            {item.label}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            {item.direction === "up" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            <span className="tabular-nums">
              {item.direction === "up" && item.duration === 0 ? "Count up" : formatHMS(item.duration * 1000)}
            </span>
            {status === "on-air" && (
              <span className="ml-1 rounded bg-red-500 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white">
                On air
              </span>
            )}
            {status === "loaded" && (
              <span className="ml-1 rounded bg-brand px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white">
                Loaded
              </span>
            )}
            {status === "next" && (
              <span className="ml-1 rounded border border-zinc-700 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                Next
              </span>
            )}
          </span>
        </button>

        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {progress !== null && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
          <div
            className={`h-full ${status === "on-air" ? "bg-red-500" : "bg-brand"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface Props {
  schedule: Schedule;
  timerState: TimerState;
  onLoadItem: (itemId: string, durationSeconds: number, label: string, direction: string) => void;
  onEditItem: (item: ScheduleItem) => void;
  onDeleteItem: (item: ScheduleItem) => void;
  onReorder: (items: ScheduleItem[]) => void;
  onAddClick: () => void;
}

export function ScheduleList({
  schedule,
  timerState,
  onLoadItem,
  onEditItem,
  onDeleteItem,
  onReorder,
  onAddClick,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = schedule.items;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  const activeIndex = schedule.items.findIndex((i) => i.id === timerState.active_item_id);

  function statusFor(index: number): ItemRowProps["status"] {
    if (activeIndex < 0) return null;
    if (index === activeIndex) return timerState.running ? "on-air" : "loaded";
    if (index === activeIndex + 1) return "next";
    if (index < activeIndex) return "done";
    return null;
  }

  function progressFor(index: number): number | null {
    if (index !== activeIndex) return null;
    const { direction, duration_ms, elapsed_ms } = timerState;
    if (direction !== "down" || duration_ms <= 0) return null;
    return Math.min(1, Math.max(0, 1 - elapsed_ms / duration_ms));
  }

  if (schedule.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-zinc-400">This schedule is empty.</p>
        <p className="text-xs text-zinc-600">Add the segments of your event in order — worship, sermon, offering…</p>
        <button
          type="button"
          onClick={onAddClick}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-hover"
        >
          <Plus size={14} /> Add first segment
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={schedule.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {schedule.items.map((item, index) => (
            <SortableItem
              key={item.id}
              item={item}
              index={index}
              status={statusFor(index)}
              progress={progressFor(index)}
              onLoad={(i) => onLoadItem(i.id, i.duration, i.label, i.direction)}
              onEdit={onEditItem}
              onDelete={onDeleteItem}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={onAddClick}
        className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-800 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-200"
      >
        <Plus size={14} /> Add segment
      </button>
    </div>
  );
}
