import type { Metadata } from 'next';
import { ShortlistDetailPage } from '@/components/shortlist/shortlist-detail';

export const metadata: Metadata = { title: 'Shortlist' };

export default function Page() {
  return <ShortlistDetailPage />;
}
