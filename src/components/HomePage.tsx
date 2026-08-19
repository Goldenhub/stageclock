import logoUrl from "../assets/logo.png";

interface Props {
  onQuickTimer: () => void;
  onNewSchedule: () => void;
}

export function HomePage({ onQuickTimer, onNewSchedule }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
      <img
        src={logoUrl}
        alt="StageClock"
        className="w-28 h-28 opacity-90"
      />

      <div className="flex flex-col items-center gap-1">
        <h1
          className="text-xl font-bold tracking-[0.2em] uppercase"
          style={{ color: "#6366f1" }}
        >
          STAGECLOCK
        </h1>
        <p className="text-sm text-gray-500">Precision stage timing</p>
        <p className="text-xs text-gray-600 mt-1">v0.1.0</p>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={onQuickTimer}
          className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        >
          ⚡ Quick Timer
        </button>
        <button
          onClick={onNewSchedule}
          className="px-5 py-2.5 text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 rounded-lg transition-colors"
        >
          + New Schedule
        </button>
      </div>
    </div>
  );
}
