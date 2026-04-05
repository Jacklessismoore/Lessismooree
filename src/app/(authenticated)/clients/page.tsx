'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/app-context';
import { deleteBrand } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/modal';
import { BrandCard } from '@/components/ui/brand-card';
import toast from 'react-hot-toast';

export default function ClientsPage() {
  const { selectedPod, podBrands, refreshBrands } = useApp();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBrand(deleteTarget);
      toast.success('Client removed');
      setDeleteTarget(null);
      refreshBrands();
    } catch {
      toast.error('Failed to remove client');
    }
  };

  return (
    <div>
      <PageHeader
        title="Manage Clients"
        subtitle={selectedPod ? `${selectedPod.name}` : 'Select a pod'}
        actions={
          <Link href="/clients/new">
            <Button size="sm">Add Client</Button>
          </Link>
        }
      />

      {podBrands.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[#555] text-sm mb-4">No clients in this pod yet.</p>
          <Link href="/clients/new">
            <Button variant="secondary">Add Client</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {(() => {
            // Group by account manager
            const groups: { managerName: string; brands: typeof podBrands }[] = [];
            const map = new Map<string, { managerName: string; brands: typeof podBrands }>();
            for (const brand of podBrands) {
              const mgrId = brand.manager_id || 'unassigned';
              const mgrName = brand.manager?.name || 'Unassigned';
              if (!map.has(mgrId)) {
                const group = { managerName: mgrName, brands: [] as typeof podBrands };
                map.set(mgrId, group);
                groups.push(group);
              }
              map.get(mgrId)!.brands.push(brand);
            }
            return groups.map(group => (
              <div key={group.managerName}>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-[11px] font-bold text-white uppercase tracking-[0.15em]">
                    {group.managerName}
                  </h3>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-[9px] text-[#444]">
                    {group.brands.length} client{group.brands.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {group.brands.map((brand, i) => (
                    <BrandCard
                      key={brand.id}
                      brand={brand}
                      showEdit
                      showMenu
                      onDelete={() => setDeleteTarget(brand.id)}
                      animDelay={i * 30}
                    />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Client"
        message="This will permanently remove the client and all associated data."
        confirmLabel="Remove"
      />
    </div>
  );
}
