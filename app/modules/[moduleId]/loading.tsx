import s from "../_components/modules.module.css";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading the Module">
      <div className="flex flex-col gap-3">
        <div className={`${s.skeleton} h-3 w-40`} />
        <div className={`${s.skeleton} h-9 w-72 max-w-full`} />
        <div className={`${s.skeleton} h-4 w-56`} />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="card flex flex-col gap-3 p-5">
          <div className={`${s.skeleton} h-4 w-24`} />
          <div className={`${s.skeleton} h-20`} />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={`${s.skeleton} h-16`} />
          ))}
        </div>
        <div className="card flex flex-col gap-3 p-5">
          <div className={`${s.skeleton} h-4 w-24`} />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={`${s.skeleton} h-40`} />
          ))}
        </div>
      </div>
    </div>
  );
}
