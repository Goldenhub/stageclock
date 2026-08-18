import { useState } from "react";
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
import { ScheduleEditor } from "./ScheduleEditor";

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
      className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
        isActive
          ? "bg-indigo-900/50 border-indigo-500"
          : "bg-gray-800/60 border-gray-700 hover:border-gray-600"
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 px-1 touch-none"
      >
        ⠿
      </div>

      {/* Load button */}
      <button
        onClick={() => onLoad(item)}
        className="flex-1 text-left min-w-0"
      >
        <div className={`text-sm font-medium truncate ${isActive ? "text-indigo-200" : "text-white"}`}>
          {item.label}
        </div>
        {item.notes && (
          <div className="text-xs text-gray-500 truncate">{item.notes}</div>
        )}
      </button>

      <span className="text-sm font-mono text-gray-400 shrink-0">
        {formatHMS(item.duration * 1000)}
      </span>

      <button
        onClick={() => onEdit(item)}
        className="text-gray-500 hover:text-gray-300 px-1 text-xs transition-colors"
        title="Edit"
      >
        ✎
      </button>
      <button
        onClick={() => onDelete(item.id)}
        className="text-gray-600 hover:text-red-400 px-1 text-xs transition-colors"
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
  onLoadItem: (itemId: string, durationSeconds: number, label: string) => void;
  onAddItem: (item: Omit<ScheduleItem, "id">) => void;
  onUpdateItem: (item: ScheduleItem) => void;
  onDeleteItem: (id: string) => void;
  onReorder: (items: ScheduleItem[]) => void;
}

export function ScheduleList({
  schedule,
  timerState,
  onLoadItem,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReorder,
}: Props) {
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (!schedule) {
    return (
      <div className="text-center text-gray-600 py-8 text-sm">
        No schedule selected.
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
    onLoadItem(item.id, item.duration, item.label);
  }

  return (
    <div className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={schedule.items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {schedule.items.map((item) => {
            if (editingItem?.id === item.id) {
              return (
                <ScheduleEditor
                  key={item.id}
                  item={editingItem}
                  onSave={(data) => {
                    onUpdateItem({ ...editingItem, ...data });
                    setEditingItem(null);
                  }}
                  onCancel={() => setEditingItem(null)}
                />
              );
            }
            return (
              <SortableItem
                key={item.id}
                item={item}
                isActive={item.id === timerState.active_item_id}
                onLoad={handleLoad}
                onEdit={setEditingItem}
                onDelete={onDeleteItem}
              />
            );
          })}
        </SortableContext>
      </DndContext>

      {addingNew ? (
        <ScheduleEditor
          onSave={(data) => {
            onAddItem(data);
            setAddingNew(false);
          }}
          onCancel={() => setAddingNew(false)}
        />
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="w-full py-3 border border-dashed border-gray-700 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
        >
          + Add item
        </button>
      )}
    </div>
  );
}
