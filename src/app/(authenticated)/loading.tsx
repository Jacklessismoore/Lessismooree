export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-[#0E0E0E] rounded animate-pulse" />
      <div className="h-4 w-32 bg-[#0E0E0E] rounded animate-pulse" />
      <div className="grid grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-[#0E0E0E] border border-[#1A1A1A] rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}
