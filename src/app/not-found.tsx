import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="heading text-4xl mb-2">404</h1>
        <p className="text-[#555] text-sm mb-6">Page not found.</p>
        <Link
          href="/"
          className="text-xs uppercase tracking-wider text-white border border-[#252525] px-5 py-2.5 rounded-md hover:border-white transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
