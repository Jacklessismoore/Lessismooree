'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-fields';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Background effects */}
      <div className="bg-mesh bg-mesh-login" />
      <div className="bg-haze" />
      <div className="bg-dots" />
      <div className="bg-noise" />

      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        {/* Logo area with generous spacing */}
        <div className="text-center mb-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://ik.imagekit.io/ebethb3mi/svgviewer-output.svg?updatedAt=1775207768259"
            alt="Less Is Moore"
            className="h-16 w-auto mx-auto mb-4"
          />
          <p className="text-[10px] text-[#444] uppercase tracking-[0.25em] font-medium">
            Email Workbench
          </p>
        </div>

        {/* Login card */}
        <div className="glass-card rounded-2xl p-7 sm:p-8">
          <h2 className="heading text-xs text-center mb-7 text-[#888]">
            {isSignUp ? 'Create Account' : 'Sign In'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />

            {error && (
              <p className="text-red-500 text-xs text-center">{error}</p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            className="w-full text-center text-[#444] text-[10px] mt-5 hover:text-white transition-colors duration-200 uppercase tracking-widest"
          >
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
