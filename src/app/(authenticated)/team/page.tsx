'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { useAuth, UserRole, ROLE_LABELS } from '@/lib/auth-context';
import { createPod, deletePod, createManager, deleteManager, createDesigner, deleteDesigner, updateManagerTimezone, updateManagerPod } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/modal';
import toast from 'react-hot-toast';

export default function TeamPage() {
  const { pods, managers, designers, brands, refreshPods, refreshManagers, refreshDesigners } = useApp();
  const [newPod, setNewPod] = useState('');
  const [newManager, setNewManager] = useState('');
  const [newDesigner, setNewDesigner] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'pod' | 'manager' | 'designer'; id: string; name: string } | null>(null);

  const handleAddPod = async () => {
    if (!newPod.trim()) return;
    try {
      await createPod(newPod.trim());
      setNewPod('');
      refreshPods();
      toast.success('Pod created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create pod');
    }
  };

  const handleAddManager = async () => {
    if (!newManager.trim()) return;
    try {
      await createManager(newManager.trim());
      setNewManager('');
      refreshManagers();
      toast.success('Manager added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add manager');
    }
  };

  const handleAddDesigner = async () => {
    if (!newDesigner.trim()) return;
    try {
      await createDesigner(newDesigner.trim());
      setNewDesigner('');
      refreshDesigners();
      toast.success('Designer added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add designer');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'pod') {
        await deletePod(deleteTarget.id);
        refreshPods();
      } else if (deleteTarget.type === 'manager') {
        await deleteManager(deleteTarget.id);
        refreshManagers();
      } else {
        await deleteDesigner(deleteTarget.id);
        refreshDesigners();
      }
      const label = deleteTarget.type === 'pod' ? 'Pod' : deleteTarget.type === 'manager' ? 'Manager' : 'Designer';
      toast.success(`${label} removed`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove');
    }
  };

  return (
    <div>
      <PageHeader title="Pods & Team" subtitle="Manage pods, account managers & designers" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Pods */}
        <Card>
          <p className="heading text-sm mb-4">Pods</p>
          <div className="space-y-2 mb-4">
            {pods.map(pod => {
              const clientCount = brands.filter(b => b.pod_id === pod.id).length;
              return (
                <div key={pod.id} className="flex items-center justify-between py-2 px-3 bg-black/30 rounded">
                  <div>
                    <span className="text-sm text-white">{pod.name}</span>
                    <span className="text-xs text-[#555] ml-2">{clientCount} client{clientCount !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={() => setDeleteTarget({ type: 'pod', id: pod.id, name: pod.name })}
                    className="text-[#555] hover:text-red-500 text-xs transition-colors"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              value={newPod}
              onChange={e => setNewPod(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddPod()}
              placeholder="New pod name..."
              className="flex-1 bg-black border border-[#252525] rounded px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-white"
            />
            <Button size="sm" onClick={handleAddPod}>Add</Button>
          </div>
        </Card>

        {/* Managers */}
        <Card>
          <p className="heading text-sm mb-4">Account Managers</p>
          <div className="space-y-2 mb-4">
            {managers.map(manager => {
              const clientCount = brands.filter(b => b.manager_id === manager.id).length;
              return (
                <div key={manager.id} className="py-2 px-3 bg-black/30 rounded space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-white">{manager.name}</span>
                      <span className="text-xs text-[#555] ml-2">{clientCount} client{clientCount !== 1 ? 's' : ''}</span>
                    </div>
                    <button
                      onClick={() => setDeleteTarget({ type: 'manager', id: manager.id, name: manager.name })}
                      className="text-[#555] hover:text-red-500 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <select
                      value={manager.timezone || 'Australia/Sydney'}
                      onChange={async (e) => {
                        try {
                          await updateManagerTimezone(manager.id, e.target.value);
                          refreshManagers();
                          toast.success('Timezone updated');
                        } catch { toast.error('Failed to update timezone'); }
                      }}
                      className="flex-1 bg-black/50 border border-white/[0.06] rounded px-2 py-1 text-[10px] text-[#999] focus:outline-none focus:border-white/20 appearance-none cursor-pointer"
                    >
                      {['Pacific/Auckland', 'Australia/Sydney', 'Australia/Perth', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo'].map(tz => (
                        <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                    <select
                      value={manager.pod_id || ''}
                      onChange={async (e) => {
                        try {
                          await updateManagerPod(manager.id, e.target.value || null);
                          refreshManagers();
                          toast.success('Pod updated');
                        } catch { toast.error('Failed to update pod'); }
                      }}
                      className="bg-black/50 border border-white/[0.06] rounded px-2 py-1 text-[10px] text-[#999] focus:outline-none focus:border-white/20 appearance-none cursor-pointer min-w-[80px]"
                    >
                      <option value="">No pod</option>
                      {pods.map(pod => (
                        <option key={pod.id} value={pod.id}>{pod.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              value={newManager}
              onChange={e => setNewManager(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddManager()}
              placeholder="New manager name..."
              className="flex-1 bg-black border border-[#252525] rounded px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-white"
            />
            <Button size="sm" onClick={handleAddManager}>Add</Button>
          </div>
        </Card>

        {/* Designers */}
        <Card>
          <p className="heading text-sm mb-4">Designers</p>
          <div className="space-y-2 mb-4">
            {designers.map(designer => {
              const clientCount = brands.filter(b => b.designer_id === designer.id).length;
              return (
                <div key={designer.id} className="flex items-center justify-between py-2 px-3 bg-black/30 rounded">
                  <div>
                    <span className="text-sm text-white">{designer.name}</span>
                    <span className="text-xs text-[#555] ml-2">{clientCount} client{clientCount !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={() => setDeleteTarget({ type: 'designer', id: designer.id, name: designer.name })}
                    className="text-[#555] hover:text-red-500 text-xs transition-colors"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              value={newDesigner}
              onChange={e => setNewDesigner(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddDesigner()}
              placeholder="New designer name..."
              className="flex-1 bg-black border border-[#252525] rounded px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-white"
            />
            <Button size="sm" onClick={handleAddDesigner}>Add</Button>
          </div>
        </Card>
      </div>

      {/* User Roles */}
      <UserRolesSection />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Remove ${deleteTarget?.type === 'pod' ? 'Pod' : deleteTarget?.type === 'manager' ? 'Manager' : 'Designer'}`}
        message={`Are you sure you want to remove "${deleteTarget?.name}"?`}
        confirmLabel="Remove"
      />
    </div>
  );
}

function UserRolesSection() {
  const { role: currentUserRole } = useAuth();
  const [userRoles, setUserRoles] = useState<{ id: string; user_id: string; email: string; role: UserRole }[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadRoles = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('user_roles').select('*').order('created_at');
    setUserRoles(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const updateRole = async (userId: string, newRole: UserRole) => {
    if (!supabase) return;
    try {
      await supabase.from('user_roles').update({ role: newRole }).eq('user_id', userId);
      await loadRoles();
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    }
  };

  // Only account managers can see this
  if (currentUserRole !== 'account_manager') return null;

  return (
    <Card className="mt-6">
      <p className="heading text-sm mb-4">User Roles</p>
      {loading ? (
        <p className="text-[10px] text-[#444]">Loading...</p>
      ) : userRoles.length === 0 ? (
        <p className="text-[10px] text-[#444]">No users found. Users appear here after they sign in.</p>
      ) : (
        <div className="space-y-2">
          {userRoles.map(ur => (
            <div key={ur.id} className="flex items-center justify-between py-2 px-3 bg-black/30 rounded">
              <div>
                <span className="text-sm text-white">{ur.email || 'No email'}</span>
                <span className="text-xs text-[#555] ml-2">{ROLE_LABELS[ur.role as UserRole] || ur.role}</span>
              </div>
              <select
                value={ur.role}
                onChange={e => updateRole(ur.user_id, e.target.value as UserRole)}
                className="bg-black/50 border border-white/[0.06] rounded px-2 py-1 text-[10px] text-[#999] focus:outline-none focus:border-white/20 appearance-none cursor-pointer"
              >
                <option value="account_manager">Account Manager</option>
                <option value="designer">Designer</option>
                <option value="klaviyo_tech">Klaviyo Technician</option>
                <option value="scheduler">Scheduler</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
