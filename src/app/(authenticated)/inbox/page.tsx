'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { getInboxItems, resolveInboxItem, unresolveInboxItem, deleteInboxItem, getBrandsWithSlack } from '@/lib/db';
import { InboxItem, Brand, Manager } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import toast from 'react-hot-toast';

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)' },
  needs_reply: { label: 'Needs Reply', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)' },
  needs_brief: { label: 'Needs Brief', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
  feedback: { label: 'Feedback', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.1)' },
  fyi: { label: 'FYI', color: '#6B7280', bg: 'rgba(107, 114, 128, 0.1)' },
};

type View = 'managers' | 'items';

interface ManagerInfo {
  id: string;
  name: string;
  clientCount: number;
  pendingCount: number;
  urgentCount: number;
}

function formatSlackTime(slackTs: string | null, fallback: string): string {
  try {
    const ts = slackTs ? parseFloat(slackTs) * 1000 : new Date(fallback).getTime();
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Unknown';
  }
}

function InboxItemCard({
  item,
  onResolve,
  onUnresolve,
  onDelete,
  onGenerateBrief,
}: {
  item: InboxItem;
  onResolve: () => void;
  onUnresolve: () => void;
  onDelete: () => void;
  onGenerateBrief: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = ACTION_CONFIG[item.action_type] || ACTION_CONFIG.fyi;
  const isBriefType = item.action_type === 'needs_brief';

  // Split message into parent + thread replies
  const parts = item.message_text.split('\n---THREAD---\n');
  const mainMessage = parts[0];
  const threadReplies: { name: string; text: string }[] = [];
  if (parts[1]) {
    // Split by [Name]: pattern — each reply starts with [SomeName]:
    const replyBlocks = parts[1].split(/(?=^\[.+?\]: )/m).filter(Boolean);
    for (const block of replyBlocks) {
      const match = block.match(/^\[(.+?)\]:\s*([\s\S]+)$/);
      if (match) {
        threadReplies.push({ name: match[1], text: match[2].trim() });
      } else if (block.trim()) {
        threadReplies.push({ name: 'Unknown', text: block.trim() });
      }
    }
  }
  const hasThread = threadReplies.length > 0;
  const isLong = mainMessage.length > 120 || hasThread;

  return (
    <Card
      padding="sm"
      className={`transition-all duration-200 ${item.is_resolved ? 'opacity-40' : ''} ${!item.is_resolved ? 'border-l-2' : ''}`}
      style={!item.is_resolved ? { borderLeftColor: config.color } : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {item.slack_user_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.slack_user_avatar} alt={item.slack_user_name} className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-xs text-[#666]">{item.slack_user_name.charAt(0).toUpperCase()}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium text-white">{item.slack_user_name}</span>
            <span
              className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
              style={{ color: config.color, backgroundColor: config.bg }}
            >
              {config.label}
            </span>
            {hasThread && (
              <span className="text-[9px] text-[#555] bg-white/[0.03] px-1.5 py-0.5 rounded">
                {threadReplies.length} repl{threadReplies.length === 1 ? 'y' : 'ies'}
              </span>
            )}
            <span className="text-[10px] text-[#444] ml-auto flex-shrink-0">
              {formatSlackTime(item.slack_message_ts, item.created_at)}
            </span>
          </div>

          {/* Main message — truncated or expanded */}
          <p className={`text-xs text-[#999] mb-1 ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
            {mainMessage}
          </p>

          {/* Thread replies (only when expanded) */}
          {expanded && hasThread && (
            <div className="ml-3 mt-2 mb-2 pl-3 border-l border-white/[0.06] space-y-1.5">
              {threadReplies.map((reply, i) => (
                <div key={i}>
                  <span className="text-[10px] font-medium text-[#888]">{reply.name}</span>
                  <p className="text-[11px] text-[#666]">{reply.text}</p>
                </div>
              ))}
            </div>
          )}

          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-[#555] hover:text-white transition-colors mb-1"
            >
              {expanded ? 'Show less' : hasThread ? `Show full thread (${threadReplies.length} replies)` : 'Show more'}
            </button>
          )}

          {/* AI summary */}
          <p className="text-[10px] text-[#666] italic mb-2">{item.action_summary}</p>

          {/* Action buttons row */}
          <div className="flex items-center gap-2 flex-wrap">
            {!item.is_resolved ? (
              <button
                onClick={onResolve}
                className="text-[10px] text-[#10B981] hover:text-white bg-[#10B981]/10 hover:bg-[#10B981]/20 px-3 py-1.5 rounded-lg transition-colors font-medium uppercase tracking-wider"
              >
                Mark Done
              </button>
            ) : (
              <button
                onClick={onUnresolve}
                className="text-[10px] text-[#555] hover:text-white bg-white/[0.03] hover:bg-white/[0.06] px-3 py-1.5 rounded-lg transition-colors font-medium uppercase tracking-wider"
              >
                Reopen
              </button>
            )}

            {isBriefType && !item.is_resolved && (
              <button
                onClick={onGenerateBrief}
                className="text-[10px] text-[#3B82F6] hover:text-white bg-[#3B82F6]/10 hover:bg-[#3B82F6]/20 px-3 py-1.5 rounded-lg transition-colors font-medium uppercase tracking-wider"
              >
                Generate Brief
              </button>
            )}

            {/* Gray out Generate Brief for non-brief types */}
            {!isBriefType && !item.is_resolved && (
              <span className="text-[10px] text-[#333] px-3 py-1.5 rounded-lg font-medium uppercase tracking-wider cursor-not-allowed">
                Generate Brief
              </span>
            )}

            <button
              onClick={onDelete}
              className="text-[10px] text-[#444] hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors ml-auto"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const { selectedPod, managers, podBrands, setSelectedClient } = useApp();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [brandsWithSlack, setBrandsWithSlack] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showResolved, setShowResolved] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('urgent');
  const [view, setView] = useState<View>('managers');
  const [selectedManager, setSelectedManager] = useState<ManagerInfo | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const data = await getInboxItems({ resolved: showResolved ? undefined : false });
      setItems(data);
    } catch (e) {
      console.error('Failed to load inbox:', e);
    }
  }, [showResolved]);

  const loadBrands = useCallback(async () => {
    try {
      const data = await getBrandsWithSlack();
      setBrandsWithSlack(data);
    } catch (e) {
      console.error('Failed to load brands with slack:', e);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadItems(), loadBrands()]).then(() => setLoading(false));
  }, [loadItems, loadBrands]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleScanAll = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/slack/scan-all', { method: 'POST' });
      const data = await res.json();
      await loadItems();
      toast.success(`Scan complete. ${data.totalNewItems || 0} new item${(data.totalNewItems || 0) !== 1 ? 's' : ''} found.`);
      // Also update the global indicator
      localStorage.setItem('lim-last-slack-scan', new Date().toISOString());
      window.dispatchEvent(new CustomEvent('trigger-slack-scan'));
    } catch {
      toast.error('Scan failed');
    }
    setScanning(false);
  };

  const handleResolve = async (id: string) => {
    await resolveInboxItem(id);
    await loadItems();
    toast.success('Marked as done');
  };

  const handleUnresolve = async (id: string) => {
    await unresolveInboxItem(id);
    await loadItems();
  };

  const handleDelete = async (id: string) => {
    await deleteInboxItem(id);
    await loadItems();
    setDeleteConfirmId(null);
  };

  const handleGenerateBrief = (item: InboxItem) => {
    const brand = item.brand;
    if (!brand) return;
    // Set the brand in app context so create page picks it up
    setSelectedClient(brand);
    // Navigate with pre-filled direction and type
    const direction = encodeURIComponent(item.message_text);
    router.push(`/create?type=campaign&direction=${direction}`);
  };

  // Build manager groups from pod brands
  const managerGroups: ManagerInfo[] = (() => {
    const map = new Map<string, ManagerInfo>();

    for (const brand of podBrands) {
      const mgrId = brand.manager_id || 'unassigned';
      const mgrName = brand.manager?.name || 'Unassigned';

      if (!map.has(mgrId)) {
        map.set(mgrId, { id: mgrId, name: mgrName, clientCount: 0, pendingCount: 0, urgentCount: 0 });
      }

      const info = map.get(mgrId)!;
      info.clientCount++;

      // Count pending items for this brand
      const brandPending = items.filter(i => i.brand_id === brand.id && !i.is_resolved);
      info.pendingCount += brandPending.length;
      info.urgentCount += brandPending.filter(i => i.action_type === 'urgent').length;
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.urgentCount > 0 && b.urgentCount === 0) return -1;
      if (a.urgentCount === 0 && b.urgentCount > 0) return 1;
      return b.pendingCount - a.pendingCount;
    });
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-[#555] heading text-sm">Loading inbox...</div>
      </div>
    );
  }

  // ─── Manager Cards View ───
  if (view === 'managers') {
    const totalPending = items.filter(i => !i.is_resolved && (!selectedPod || i.brand?.pod_id === selectedPod?.id)).length;

    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="INBOX"
          subtitle={`${totalPending} pending action${totalPending !== 1 ? 's' : ''} across all clients`}
          actions={
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => handleScanAll()} loading={scanning}>
                {scanning ? 'Scanning...' : 'Scan Slack'}
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {managerGroups.map((mgr, i) => (
            <Card
              key={mgr.id}
              hoverable
              padding="md"
              onClick={() => { setSelectedManager(mgr); setView('items'); }}
              className="animate-fade-in"
              style={{ animationDelay: `${i * 40}ms` } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-white">
                    {mgr.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-white uppercase tracking-wider">
                    {mgr.name}
                  </p>
                  <p className="text-[9px] text-[#555] mt-0.5">
                    {mgr.clientCount} client{mgr.clientCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {mgr.urgentCount > 0 && (
                    <span className="text-[9px] font-semibold text-red-400 block">
                      {mgr.urgentCount} urgent
                    </span>
                  )}
                  {mgr.pendingCount > 0 && (
                    <span className="text-[10px] text-[#999]">
                      {mgr.pendingCount} pending
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {managerGroups.length === 0 && (
          <div className="text-center py-16">
            <p className="text-[#555] text-sm">No clients in this pod yet.</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Items View (all items for selected manager's clients) ───
  const managerBrandIds = podBrands
    .filter(b => (b.manager_id || 'unassigned') === selectedManager?.id)
    .map(b => b.id);

  const managerItems = items.filter(item => {
    if (!managerBrandIds.includes(item.brand_id)) return false;
    if (filterAction === 'resolved') {
      return item.is_resolved;
    }
    if (item.is_resolved) return false;
    if (item.action_type !== filterAction) return false;
    return true;
  });

  // Group items by client within the manager view
  const brandGroups: { brand: Brand; items: InboxItem[] }[] = [];
  const brandMap = new Map<string, { brand: Brand; items: InboxItem[] }>();

  for (const item of managerItems) {
    if (!brandMap.has(item.brand_id)) {
      brandMap.set(item.brand_id, { brand: item.brand as Brand, items: [] });
    }
    brandMap.get(item.brand_id)!.items.push(item);
  }
  brandGroups.push(...brandMap.values());

  const urgentCount = managerItems.filter(i => i.action_type === 'urgent' && !i.is_resolved).length;
  const pendingCount = managerItems.filter(i => !i.is_resolved).length;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title={selectedManager?.name?.toUpperCase() || 'INBOX'}
        subtitle={`${pendingCount} pending action${pendingCount !== 1 ? 's' : ''}${urgentCount > 0 ? ` · ${urgentCount} urgent` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setSelectedManager(null); setView('managers'); setFilterAction('urgent'); }}>
              ← Back
            </Button>
            <Button size="sm" onClick={() => handleScanAll()} loading={scanning}>
              {scanning ? 'Scanning...' : 'Scan'}
            </Button>
          </div>
        }
      />

      {/* Action type filter */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {['urgent', 'needs_reply', 'needs_brief', 'feedback', 'resolved'].map(type => {
          const count = type === 'resolved'
            ? items.filter(i => managerBrandIds.includes(i.brand_id) && i.is_resolved).length
            : items.filter(i => managerBrandIds.includes(i.brand_id) && i.action_type === type && !i.is_resolved).length;
          return (
            <button
              key={type}
              onClick={() => setFilterAction(type)}
              className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-medium transition-all duration-200 ${
                filterAction === type
                  ? type === 'resolved' ? 'bg-[#10B981] text-white' : 'bg-white text-black'
                  : 'bg-white/[0.03] border border-white/[0.06] text-[#666] hover:text-white hover:border-white/15'
              }`}
            >
              {type === 'resolved' ? 'Resolved' : ACTION_CONFIG[type]?.label || type}
              <span className="ml-1.5 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* No items */}
      {brandGroups.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[#555] text-sm mb-4">
            No action items for {selectedManager?.name}. Hit &ldquo;Scan&rdquo; to check Slack.
          </p>
        </div>
      )}

      {/* Items grouped by client */}
      <div className="space-y-6">
        {brandGroups.map(({ brand, items: brandItems }) => (
          <div key={brand?.id || 'unknown'} className="animate-fade-in">
            <p className="text-[10px] text-[#666] uppercase tracking-wider font-medium mb-2 ml-1">
              {brand?.name || 'Unknown Client'}
            </p>

            <div className="space-y-2">
              {brandItems.map(item => (
                <InboxItemCard
                  key={item.id}
                  item={item}
                  onResolve={() => handleResolve(item.id)}
                  onUnresolve={() => handleUnresolve(item.id)}
                  onDelete={() => setDeleteConfirmId(item.id)}
                  onGenerateBrief={() => handleGenerateBrief(item)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        title="Delete Message"
        message="Are you sure you want to delete this inbox item? This action cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}
