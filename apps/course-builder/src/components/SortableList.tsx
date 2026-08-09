import React from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type DragHandleProps = React.HTMLAttributes<HTMLElement> & {
  ref: (el: HTMLElement | null) => void;
};

interface SortableRowProps<T extends { id: string }> {
  item: T;
  renderItem: (item: T, handle: DragHandleProps, isDragging: boolean) => React.ReactNode;
}

function SortableRow<T extends { id: string }>({ item, renderItem }: SortableRowProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handle: DragHandleProps = {
    ...attributes,
    ...listeners,
    ref: setActivatorNodeRef,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "relative z-10 opacity-60" : ""}>
      {renderItem(item, handle, isDragging)}
    </div>
  );
}

interface SortableListProps<T extends { id: string }> {
  items: T[];
  /** Called with the reordered array after a drop. */
  onReorder: (next: T[]) => void;
  renderItem: (item: T, handle: DragHandleProps, isDragging: boolean) => React.ReactNode;
}

/**
 * Vertical drag-and-drop list. Vertical sorting is axis-independent,
 * so it behaves identically under dir="rtl".
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={item.id} item={item} renderItem={renderItem} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
