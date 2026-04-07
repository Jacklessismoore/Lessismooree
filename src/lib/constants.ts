import { EmailStatus, BriefType } from './types';

export const EMAIL_STATUSES: { value: EmailStatus; label: string; color: string }[] = [
  { value: 'not_started', label: 'Not Started', color: '#78716C' },
  { value: 'internal_approval', label: 'Internal Review', color: '#8B5CF6' },
  { value: 'needs_revision', label: 'Needs Revision', color: '#EC4899' },
  { value: 'client_approval', label: 'Client Review', color: '#3B82F6' },
  { value: 'awaiting_design', label: 'Needs Upload', color: '#F59E0B' },
  { value: 'approved', label: 'Approved', color: '#10B981' },
  { value: 'scheduled', label: 'Scheduled / Sent', color: '#06B6D4' },
];

export const BRIEF_TYPES: { value: BriefType; label: string; icon: string; description: string; category: string }[] = [
  // Campaigns
  { value: 'campaign', label: 'Campaign Brief', icon: '📧', description: 'Full designed campaign email brief', category: 'campaigns' },
  { value: 'campaign_plain_text', label: 'Campaign Plain Text', icon: '✍️', description: 'Plain text campaign from the founder or brand', category: 'campaigns' },
  { value: 'campaign_sms', label: 'Campaign SMS', icon: '💬', description: 'SMS campaign message', category: 'campaigns' },
  // Flows
  { value: 'flow', label: 'Flow Brief', icon: '⚡', description: 'Designed flow email brief for sequences', category: 'flows' },
  { value: 'flow_plain_text', label: 'Flow Plain Text', icon: '✍️', description: 'Plain text flow email', category: 'flows' },
  { value: 'flow_sms', label: 'Flow SMS', icon: '💬', description: 'SMS flow message', category: 'flows' },
  // Strategy
  { value: 'strategy', label: 'Monthly Strategy', icon: '📅', description: 'Full monthly email strategy with calendar', category: 'strategy' },
];

export const FRAMEWORKS = [
  'Auto',
  'Promotional',
  'Educational',
  'Founder Story',
  'Social Proof',
  'Product Launch',
  'Winback',
];

export const FLOW_TYPES = [
  'Welcome Series',
  'Cart Abandonment',
  'Browse Abandonment',
  'Post-Purchase',
  'Winback',
  'Sunset',
  'VIP',
  'Birthday',
  'Back in Stock',
  'Price Drop',
];

export const NAV_SECTIONS = [
  {
    label: 'Daily',
    items: [
      { label: 'SOP', href: '/sop', icon: '📋' },
      { label: 'Inbox', href: '/inbox', icon: '📥' },
    ],
  },
  {
    label: 'Work',
    items: [
      { label: 'Create', href: '/create', icon: '✨' },
      { label: 'Calendar', href: '/calendar', icon: '📅' },
      { label: 'Briefs', href: '/briefs', icon: '📁' },
      { label: 'Design Queue', href: '/design-queue', icon: '🎨' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Reports', href: '/reports', icon: '📊' },
      { label: 'A/B Tests', href: '/ab-tests', icon: '🧪' },
      { label: 'References', href: '/references', icon: '🔖' },
      { label: 'Chat', href: '/chat', icon: '💬' },
    ],
  },
];

// Flat list for backward compatibility
export const NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items.map(i => ({ ...i, requiresClient: false })));

export const MANAGEMENT_NAV = [
  { label: 'Clients', href: '/clients', icon: '⚙️' },
  { label: 'Team', href: '/team', icon: '🏷️' },
];

export const MORNING_SOP_ITEMS = [
  { id: 'check_inbox', label: 'Check Slack inbox for client messages', description: 'Review all unread messages and categorise actions needed' },
  { id: 'review_calendar', label: 'Review today\'s email calendar', description: 'Confirm which emails are scheduled today and that they are ready to send' },
  { id: 'check_designer_queue', label: 'Check designer priority queue', description: 'Review overdue or due-today designs and follow up with designers' },
  { id: 'check_pending', label: 'Check pending emails and approvals', description: 'Follow up on any briefs or designs waiting on client sign-off' },
  { id: 'plan_day', label: 'Plan today\'s priorities', description: 'Set your key tasks for the day based on deadlines and client needs' },
];

export const EVENING_SOP_ITEMS = [
  { id: 'check_scheduled', label: 'Check tomorrow\'s scheduled emails', description: 'Confirm all emails scheduled for tomorrow are loaded and correct in Klaviyo' },
  { id: 'review_calendar_pm', label: 'Review tomorrow\'s calendar', description: 'Preview what is coming up tomorrow and flag anything that needs prep' },
  { id: 'check_slack_pm', label: 'Check Slack for end-of-day messages', description: 'Clear any remaining client messages before signing off' },
  { id: 'update_statuses', label: 'Update email statuses', description: 'Make sure all briefs, calendar items, and designer queue are up to date' },
  { id: 'handover_notes', label: 'Note anything for tomorrow', description: 'Flag anything unfinished or time-sensitive for the morning' },
];

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const BRAND_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#F97316', '#06B6D4', '#84CC16', '#6366F1',
  '#14B8A6', '#F43F5E',
];

export const EMAIL_FACTS = [
  '💰 Email marketing has an average ROI of $36 for every $1 spent.',
  '📬 Personalised subject lines increase open rates by 26%.',
  '📅 Tuesday is the highest-performing day for email sends.',
  '🎯 Segmented campaigns drive 760% more revenue than one-size-fits-all.',
  '📱 Nearly 50% of emails are opened on mobile devices.',
  '🎬 Adding a video thumbnail to email can boost click rates by 300%.',
  '👋 Welcome emails generate 320% more revenue per email than promos.',
  '🛒 Abandoned cart emails recover roughly 10% of lost revenue.',
  '😎 Emails with emojis in the subject line see 56% higher open rates.',
  '✍️ The best email subject lines are between 6 and 10 words.',
  '🖱️ Interactive emails increase click-to-open rates by 73%.',
  '⏰ The best time to send emails is between 9-11am local time.',
  '🔥 Emails with a single CTA increase clicks by 371%.',
  '📊 A/B testing subject lines can boost revenue by up to 3x.',
  '🧠 The human attention span in email is about 3 seconds. Make it count.',
  '💡 Plain text emails often outperform designed ones for founder messages.',
  '🚀 Flow emails compound over months — they are the highest ROI work you can do.',
  '🎨 Emails with GIFs see 26% higher click rates than static images.',
  '📈 Brands sending 3-4 emails per week see the highest engagement.',
  '🏆 The top 25% of Klaviyo accounts have open rates above 50%.',
  '💌 Personalised product recommendations drive 5x more conversions.',
  '🔔 Push notifications + email together increase retention by 130%.',
  '🧪 Testing send times is a Tier 1 test — highest leverage, lowest effort.',
  '⚡ SMS has a 98% open rate — but only when used sparingly.',
  '🎁 Free shipping offers outperform percentage discounts by 2:1.',
  '📐 600px is the universal email width. Everything is built to this.',
  '🤝 Social proof emails (reviews, UGC) build trust faster than any other type.',
  '🔑 The From Name matters more than the subject line for opens.',
  '💎 Less is more. One idea per email always beats five at 20% each.',
  '🌊 Consistency beats intensity. Regular sends build habit loops.',
  '🧲 The first email in a welcome flow has the highest open rate of any email you will ever send.',
  '🪄 Subject lines under 50 characters outperform longer ones consistently.',
  '🎯 Revenue per recipient is a better metric than open rate for measuring email success.',
  '🔄 Re-engagement flows are not for revenue. They are for list hygiene.',
  '☕ Most emails are read in under 11 seconds. Write accordingly.',
  '🧊 Cold subscribers cost you money. Sunset them before they hurt deliverability.',
  '🎪 The best emails feel like content, not marketing.',
  '📦 Post-purchase flows have the highest open rates of any automated sequence.',
  '🔬 Test one variable at a time. Testing everything at once tells you nothing.',
  '🪞 Your email should still make sense with images turned off.',
  '🏗️ A CTA above the fold is the single biggest lever for click rates.',
  '🎭 Curiosity-based subject lines outperform descriptive ones for revenue.',
  '🧩 Every section in an email should have a job. If it does not, cut it.',
  '📝 Product blocks should be: name + one line + CTA. That is it.',
  '🌟 Customers trust other customers more than they trust your brand copy.',
  '🎤 Founder emails work because they feel human in an inbox full of templates.',
  '⏳ Urgency only works when it is real. Fake urgency erodes trust fast.',
  '🛡️ Spam complaint rates above 0.1% can damage your entire sending reputation.',
  '🧭 The "From Name" is the first thing people see. Make it recognisable.',
  '🎶 Rhythm matters. Sending at consistent times trains your audience to expect you.',
  '🪜 A 3-email welcome flow captures more revenue than a single welcome email.',
  '🧈 Smooth section transitions in email design reduce drop-off between scrolls.',
  '📸 Lifestyle images outperform plain product shots by 2-3x in click rate.',
  '🫧 Clean your list quarterly. Dead weight kills deliverability silently.',
  '🧵 Threading emails into a narrative across a week increases repeat opens.',
  '🥇 The #1 reason people unsubscribe is too many emails, not bad content.',
  '🪤 Pop-ups with a 5-second delay convert better than immediate ones.',
  '📖 Educational emails have the longest shelf life. People save and revisit them.',
  '🧲 Lead magnets that solve a specific problem convert 3x better than generic discounts.',
  '🎰 Gamified emails (spin-to-win, scratch cards) can boost click rates by 200%+.',
  '🕐 Sending at off-peak hours (6am, 8pm) can outperform peak hours due to less competition.',
  '🧪 The minimum sample size for a meaningful A/B test is around 1,000 per variant.',
  '🪞 Mirror your customer\'s language. Use the words they use in reviews.',
  '🛍️ Product recommendation emails drive 31% of e-commerce revenue.',
  '🔗 Every image in your email should be linked. Unlinked images waste clicks.',
  '🌡️ Warm up new sending domains slowly. 500 emails day 1, double each day.',
  '📉 Open rates naturally decline as your list ages. That is normal, not a crisis.',
  '🧹 Sunset flows exist to remove dead subscribers, not win them back.',
  '💬 SMS works best as a complement to email, not a replacement.',
  '🎯 Segmented flows outperform batch campaigns by 3-5x on revenue per recipient.',
  '🪙 The average Klaviyo account generates $85 per subscriber per year.',
  '📋 Alt text on images is not optional. 40% of users have images off by default.',
  '🧊 A "cold" subscriber is anyone who has not opened in 90+ days.',
  '🔁 Repeat purchasers are 9x more likely to convert than first-time visitors.',
  '🎪 Event-triggered emails (birthday, anniversary) have 3x higher conversion rates.',
  '🏷️ Price drop alerts are the highest-converting automated email type after cart abandonment.',
  '📊 Revenue per email is a more honest metric than total revenue.',
  '🤫 The best-performing emails often look like they were not designed at all.',
  '🧱 Build your flows first, then focus on campaigns. Flows are the foundation.',
  '🎭 Switching between graphic and plain text emails keeps your audience engaged.',
  '💡 Subject lines that ask questions get 10% more opens than statements.',
  '🔒 Double opt-in lists have 75% fewer spam complaints.',
  '📬 Inbox placement is not the same as delivery rate. You can be "delivered" to spam.',
  '🌍 Send time localisation can improve opens by 20% for international audiences.',
  '🛠️ Broken links in emails cost you 100% of the clicks on that link. Always test.',
  '🧬 Customer lifecycle stage matters more than demographics for email targeting.',
  '🎁 "Free gift with purchase" outperforms "X% off" in most DTC verticals.',
  '📱 Buttons should be at least 44px tall for comfortable mobile tapping.',
  '🔄 Back-in-stock notifications have an average conversion rate of 12%.',
  '🎯 Winback emails work best between 30-60 days of inactivity.',
  '💡 Preheader text that contradicts the subject line creates powerful curiosity.',
  '🪄 Animated countdown timers increase urgency email conversion by 30%.',
  '📧 The average person receives 121 emails per day. Yours needs to stand out.',
  '🏆 Brands with 7+ active flows generate 40% more email revenue.',
  '🎨 Consistent brand colours across emails improve recognition by 80%.',
  '🧠 Decision fatigue is real. Fewer product choices = more conversions.',
  '🌟 User-generated content in emails gets 4x higher click rates than brand content.',
  '🧲 Your best customers open every email. Your worst never will. Focus on the middle.',
  '📍 Geo-targeted emails see 29% higher open rates than generic sends.',
  '🪴 Nurture sequences build more lifetime value than one-off discount blasts.',
  '🔍 Preview your emails in dark mode. 80% of mobile users have it enabled.',
  '🎯 Micro-segments (under 5,000 contacts) consistently outperform broad sends.',
  '📊 Klaviyo attributes revenue to the last email opened within 5 days by default.',
  '🧮 A 1% improvement in click rate compounds to thousands in annual revenue.',
  '🏪 Shopify stores using Klaviyo see 67x ROI on average from email marketing.',
  '📬 Inbox tabs (Primary, Promotions, Updates) vary by email client. Test across all.',
  '🎭 The same email with a different subject line can generate 3x the revenue.',
  '🧊 List decay is real. About 25% of your list goes stale every year.',
  '🔔 Browser push opt-in rates average 5-15% but those subscribers are highly engaged.',
  '📱 Thumb-friendly design is not optional. 67% of emails are opened on mobile.',
  '🎪 Event-based emails (birthdays, milestones) feel personal and convert 3x better.',
  '💬 Conversational subject lines ("Quick question") often outperform polished ones.',
  '🧪 Test your emails across 5+ email clients before every major send.',
  '📦 Order confirmation emails have 65% open rates. Use them to cross-sell.',
  '🎯 Behavioural triggers (browsed, carted, purchased) outperform calendar-based sends.',
  '🌊 Email fatigue is caused by repetition, not frequency. Vary your content.',
  '🔗 Deep links to specific product pages convert better than homepage links.',
  '💎 VIP segments (top 10% spenders) respond best to exclusivity, not discounts.',
  '🧵 Multi-email storytelling across a week builds anticipation and boosts opens.',
  '📐 The ideal email width is 600px. Wider emails break on most clients.',
  '🎨 Brand consistency across emails builds recognition. Use the same header every time.',
  '🧠 Loss aversion is stronger than gain. "Don\'t miss out" beats "Get access".',
  '📈 Email list growth rate should be 2-5% per month for a healthy account.',
  '🛡️ Authentication (SPF, DKIM, DMARC) is non-negotiable for deliverability.',
  '🪄 Dynamic content blocks personalise emails without creating multiple versions.',
  '📊 Click maps show where people actually tap. Most clicks happen in the top third.',
  '🎁 Surprise rewards for loyal customers generate program lifetime value.',
  '🧹 Remove hard bounces immediately. They damage your sender reputation.',
  '📧 The average email list has a 20-30% active engagement rate. That is normal.',
  '🔥 Flash sales work best when they are rare. Overuse trains customers to wait.',
  '🎤 Behind-the-scenes content humanises the brand and builds loyalty.',
  '🪞 Social proof in subject lines ("5,000 sold") increases open rates by 15%.',
  '📱 Single-column layouts perform better on mobile than multi-column.',
  '🧩 Modular email templates save 60% of design time while maintaining quality.',
  '💡 Plain text emails from founders can outperform designed emails by 2x on clicks.',
  '🎯 Retargeting email openers with ads creates a powerful multi-channel loop.',
  '🌍 Localised content (currency, language, references) lifts conversion in new markets.',
  '📊 Deliverability is a spectrum, not binary. You can land in Primary, Promotions, or Spam.',
  '🧲 The first 24 hours after signup is when a subscriber is most engaged. Use it.',
  '🎨 Contrast between CTA buttons and background is the #1 factor in click rates.',
  '📦 Shipping threshold emails ("You\'re $15 away from free shipping") convert at 14%.',
  '🔄 Win-back emails sent at 30, 60, and 90 days cover the full re-engagement window.',
  '🧠 Anchoring effect: showing the original price next to the sale price boosts conversions.',
  '🎭 Seasonal email themes keep the content feeling fresh even with similar products.',
  '📬 Transactional emails (receipts, shipping) have 8x the engagement of marketing emails.',
  '🏆 The best email marketers spend 80% of their time on flows and 20% on campaigns.',
];

export function getStatusColor(status: EmailStatus): string {
  return EMAIL_STATUSES.find(s => s.value === status)?.color ?? '#6B7280';
}

export function getStatusLabel(status: EmailStatus): string {
  return EMAIL_STATUSES.find(s => s.value === status)?.label ?? status;
}
