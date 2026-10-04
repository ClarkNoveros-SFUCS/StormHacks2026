import s from "./_components/modules.module.css";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading your Modules">
      <div className="flex flex-col gap-3">
        <div className={`${s.skeleton} h-4 w-32`} />
        <div className={`${s.skeleton} h-10 w-64`} />
        <div className={`${s.skeleton} h-4 w-96 max-w-full`} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card flex flex-col overflow-hidden">
            <div className={`${s.skeleton} h-24 rounded-none`} />
            <div className="flex flex-col gap-3 p-4">
              <div className={`${s.skeleton} h-5 w-3/4`} />
              <div className={`${s.skeleton} h-4 w-1/2`} />
              <div className={`${s.skeleton} h-6 w-full`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
