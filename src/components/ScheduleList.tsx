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
import type { Schedule, ScheduleItem, TimerState } from "../types";
import { formatHMS } from "../utils/timeFormat";

interface ItemRowProps {
  item: ScheduleItem;
  isActive: boolean;
  onLoad: (item: ScheduleItem) => void;
  onEdit: (item: ScheduleItem) => void;
  onDelete: (id: string) => void;
}

function SortableItem({ item, isActive, onLoad, onEdit, onDelete }: ItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border transition-colors group ${
        isActive
          ? "bg-indigo-900/50 border-indigo-500"
          : "bg-gray-800/40 border-gray-700/50 hover:border-gray-600"
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 px-0.5 touch-none text-xs shrink-0"
      >
        ⠿
      </div>

      <button
        onClick={() => onLoad(item)}
        className="flex-1 text-left min-w-0"
      >
        <div className={`text-xs font-medium truncate ${isActive ? "text-indigo-200" : "text-gray-200"}`}>
          {item.label}
        </div>
      </button>

      <span className="text-[11px] font-mono text-gray-500 shrink-0 tabular-nums">
        {formatHMS(item.duration * 1000)}
      </span>

      <span className="text-[10px] text-gray-600 shrink-0 w-3 text-center">
        {item.direction === "up" ? "↑" : "↓"}
      </span>

      <button
        onClick={() => onEdit(item)}
        className="text-gray-600 hover:text-gray-300 px-0.5 text-[10px] transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        title="Edit"
      >
        ✎
      </button>
      <button
        onClick={() => onDelete(item.id)}
        className="text-gray-600 hover:text-red-400 px-0.5 text-[10px] transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}

interface Props {
  schedule: Schedule | null;
  timerState: TimerState;
  onLoadItem: (itemId: string, durationSeconds: number, label: string, direction: string) => void;
  onEditItem: (item: ScheduleItem) => void;
  onDeleteItem: (id: string) => void;
  onReorder: (items: ScheduleItem[]) => void;
  onAddClick: () => void;
  onQuickTimer: () => void;
}

export function ScheduleList({
  schedule,
  timerState,
  onLoadItem,
  onEditItem,
  onDeleteItem,
  onReorder,
  onAddClick,
  onQuickTimer,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (!schedule) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-gray-600 text-xs">No schedule selected.</p>
        <button
          onClick={onQuickTimer}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          ⚡ Quick Timer
        </button>
      </div>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = schedule!.items;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  function handleLoad(item: ScheduleItem) {
    onLoadItem(item.id, item.duration, item.label, item.direction);
  }

  return (
    <div className="flex flex-col gap-1">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={schedule.items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {schedule.items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              isActive={item.id === timerState.active_item_id}
              onLoad={handleLoad}
              onEdit={onEditItem}
              onDelete={onDeleteItem}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        onClick={onAddClick}
        className="w-full py-2 border border-dashed border-gray-700 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors mt-1"
      >
        + Add Time Slot
      </button>
    </div>
  );
}
