'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="heading text-2xl mb-2">Something went wrong.</h1>
        <p className="text-[#555] text-sm mb-6">{error.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={reset}
          className="text-xs uppercase tracking-wider text-white border border-[#252525] px-5 py-2.5 rounded-md hover:border-white transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
