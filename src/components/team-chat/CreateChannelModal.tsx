'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { Brand } from '@/lib/types';

interface CreateChannelModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string, description: string, brandId?: string) => Promise<void>;
  brands: Brand[];
}

export function CreateChannelModal({ open, onClose, onCreated, brands }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brandId, setBrandId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreated(
        name.trim().toLowerCase().replace(/\s+/g, '-'),
        description.trim(),
        brandId || undefined
      );
      setName('');
      setDescription('');
      setBrandId('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="text-sm font-semibold text-white mb-5">Create Channel</h3>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[#666] font-semibold block mb-1.5">
            Channel Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. design-feedback"
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white
              placeholder:text-[#444] outline-none focus:border-white/[0.12] transition-colors"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-[#666] font-semibold block mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this channel about?"
            rows={2}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white
              placeholder:text-[#444] outline-none focus:border-white/[0.12] transition-colors resize-none"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-[#666] font-semibold block mb-1.5">
            Link to Client (optional)
          </label>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white
              outline-none focus:border-white/[0.12] transition-colors appearance-none"
          >
            <option value="" className="bg-[#1a1a1a]">None</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id} className="bg-[#1a1a1a]">
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleCreate} loading={loading} disabled={!name.trim()}>
          Create
        </Button>
      </div>
    </Modal>
  );
}
